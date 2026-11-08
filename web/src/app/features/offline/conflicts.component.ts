import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

const ETIQUETA_DECISION: Record<string, string> = {
  aceptar_ajuste: 'Aceptar venta con ajuste',
  respetar_precio: 'Respetar precio cobrado',
  anular: 'Anular',
  fusionar_cliente: 'Fusionar con el cliente existente',
  crear_cliente: 'Registrar como cliente aparte',
  reasignar: 'Reasignar reserva',
  aceptar_cambio: 'Aceptar el cambio',
  reintentar: 'Reintentar',
  vincular_venta: 'Vincular a su venta',
  devolver_prenda: 'Devolver la prenda',
};

interface LineaComparada {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioCobrado: number;
  precioVigente: number | null;
  disponible: number;
}

/** [CU18] alt. 2: lo que el servidor ofrece para reasignar una reserva sin existencia. */
interface Alternativas {
  variantes: { idProducto: number; nombre: string; talla: string | null; color: string | null; disponible: number }[];
  sucursales: { codigoSucursal: number; nombre: string; disponible: number }[];
}

interface Conflicto {
  idConflicto: number;
  uuidOperacion: string;
  tipoOperacion: string;
  tipoConflicto: string;
  etiqueta: string;
  motivo: string;
  monto: number;
  estado: string;
  resultado: string | null;
  decision: string | null;
  alertaDiscrepancia: boolean;
  sucursal: string | null;
  usuario: string | null;
  fechaOperacion: string | null;
  datosDispositivo: { datos: Record<string, any> };
  datosServidor: { lineas?: LineaComparada[]; nombre?: string; ci?: string; alternativas?: Alternativas } & Record<string, unknown>;
  decisiones: string[];
  soloAdministrador: boolean;
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU18] Resolver conflictos de sincronizacion
// Boundary: ConflictosUI -> este componente
// Control: POST /api/sync/conflictos/{id}/resolver -> services/conflictos.py -> resolver()
// ==================================================================
@Component({
  selector: 'app-conflicts',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <app-cu-badge cu="CU18" [conNombre]="true"></app-cu-badge>
        <div class="flex gap-1 ml-auto">
          <button (click)="cambiarVista('Pendiente')" class="ys-opcion" [ngClass]="{ 'ys-opcion-activa': vista() === 'Pendiente' }">Pendientes</button>
          <button (click)="cambiarVista('Resuelto')" class="ys-opcion" [ngClass]="{ 'ys-opcion-activa': vista() === 'Resuelto' }">Resueltos</button>
        </div>
      </div>

      <p *ngIf="!offlineSync.enLinea()" class="text-sm text-amber-700">Resolver conflictos requiere conexión.</p>
      <p *ngIf="offlineSync.enLinea() && !conflictos().length" class="text-sm text-gray-400 py-6 text-center">No hay conflictos.</p>

      <div *ngFor="let c of conflictos()" class="ys-tarjeta p-4 space-y-3" data-testid="conflicto">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p class="text-sm font-bold text-gray-900">{{ c.etiqueta }}</p>
            <p class="text-xs text-gray-600">{{ c.motivo }}</p>
            <p class="text-[11px] text-gray-400">{{ c.tipoOperacion }} · {{ c.sucursal }} · {{ c.usuario }} · {{ c.fechaOperacion | date: 'dd/MM/yyyy HH:mm' }} · Bs {{ c.monto.toFixed(2) }}</p>
          </div>
          <span *ngIf="c.soloAdministrador" class="ys-chip border-rose-300 text-rose-600">Solo Administrador</span>
          <span *ngIf="c.estado === 'Resuelto'" class="ys-chip border-emerald-300 text-emerald-700">{{ c.resultado }} · {{ decision(c.decision) }}</span>
        </div>

        <!-- CU18 paso 3: lo registrado en el dispositivo contra el servidor -->
        <table *ngIf="c.datosServidor.lineas?.length" class="w-full text-xs">
          <thead><tr class="text-left ys-mini border-b border-gray-100">
            <th class="py-1.5">Prenda</th><th class="py-1.5 text-right">Vendidas</th><th class="py-1.5 text-right">Hay en el servidor</th>
            <th class="py-1.5 text-right">Precio cobrado</th><th class="py-1.5 text-right">Precio vigente</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of c.datosServidor.lineas" class="border-b border-gray-50 last:border-0">
              <td class="py-1.5 text-gray-700">{{ l.nombre }}</td>
              <td class="py-1.5 text-right">{{ l.cantidad }}</td>
              <td class="py-1.5 text-right" [ngClass]="l.disponible < l.cantidad ? 'text-rose-600 font-bold' : ''">{{ l.disponible }}</td>
              <td class="py-1.5 text-right">Bs {{ l.precioCobrado.toFixed(2) }}</td>
              <td class="py-1.5 text-right" [ngClass]="l.precioVigente !== l.precioCobrado ? 'text-amber-700 font-bold' : ''">{{ l.precioVigente === null ? '—' : 'Bs ' + l.precioVigente.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
        <p *ngIf="c.tipoConflicto === 'cliente_duplicado'" class="text-xs text-gray-600">
          Dispositivo: {{ c.datosDispositivo.datos['clienteNuevo']?.nombre }} · Servidor: {{ c.datosServidor.nombre }} (CI {{ c.datosServidor.ci }})
        </p>

        <div *ngIf="c.estado === 'Pendiente'" class="space-y-2 border-t border-gray-100 pt-3">
          <input class="ys-campo" [(ngModel)]="observaciones[c.idConflicto]" [name]="'obs' + c.idConflicto" placeholder="Observaciones (quedan en la bitácora)" />
          <!-- [CU18] alt. 2: reasignar eligiendo entre lo que hay, sin escribir códigos -->
          <div *ngIf="c.decisiones.includes('reasignar')" class="space-y-2" data-testid="alternativas">
            <ng-container *ngIf="c.datosServidor.alternativas as alt; else sinAlternativas">
              <div *ngIf="alt.variantes.length">
                <p class="ys-mini mb-1">Otra talla o color en la misma sucursal</p>
                <div class="flex flex-wrap gap-1.5">
                  <button *ngFor="let v of alt.variantes" (click)="elegirVariante(c, v.idProducto)" class="ys-opcion text-xs"
                          [ngClass]="{ 'ys-opcion-activa': extra(c)['idProductoNuevo'] === v.idProducto }">
                    {{ v.nombre }} · {{ v.talla || '—' }} · {{ v.color || '—' }} ({{ v.disponible }})
                  </button>
                </div>
              </div>
              <div *ngIf="alt.sucursales.length">
                <p class="ys-mini mb-1">La misma prenda en otra sucursal</p>
                <div class="flex flex-wrap gap-1.5">
                  <button *ngFor="let s of alt.sucursales" (click)="elegirSucursal(c, s.codigoSucursal)" class="ys-opcion text-xs"
                          [ngClass]="{ 'ys-opcion-activa': extra(c)['codigoSucursalNueva'] === s.codigoSucursal }">
                    {{ s.nombre }} ({{ s.disponible }})
                  </button>
                </div>
              </div>
              <p *ngIf="!alt.variantes.length && !alt.sucursales.length" class="text-xs text-amber-700">No hay otra variante ni otra sucursal con existencia: solo se puede anular.</p>
            </ng-container>
            <ng-template #sinAlternativas>
              <div class="grid grid-cols-2 gap-2">
                <input class="ys-campo" type="number" [(ngModel)]="extra(c).idProductoNuevo" [name]="'prod' + c.idConflicto" placeholder="Id. de la otra variante" />
                <input class="ys-campo" type="number" [(ngModel)]="extra(c).codigoSucursalNueva" [name]="'suc' + c.idConflicto" placeholder="Código de otra sucursal" />
              </div>
            </ng-template>
          </div>
          <div *ngIf="c.decisiones.includes('vincular_venta')" class="grid grid-cols-2 gap-2">
            <input class="ys-campo" type="number" [(ngModel)]="extra(c).idVenta" [name]="'venta' + c.idConflicto" placeholder="N.º de venta" />
            <input class="ys-campo" type="number" [(ngModel)]="extra(c).idProducto" [name]="'pren' + c.idConflicto" placeholder="Id. de la prenda" />
          </div>
          <div class="flex gap-2 flex-wrap">
            <button *ngFor="let d of c.decisiones" (click)="resolver(c, d)" [disabled]="c.soloAdministrador && !esAdmin()"
                    [ngClass]="d === 'anular' || d === 'devolver_prenda' ? 'ys-btn-sec' : 'ys-btn'">{{ decision(d) }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ConflictsComponent implements OnInit {
  readonly conflictos = signal<Conflicto[]>([]);
  readonly vista = signal<'Pendiente' | 'Resuelto'>('Pendiente');
  readonly esAdmin = computed(() => this.authService.currentUser()?.permisos.includes('tenant.admin') ?? false);
  observaciones: Record<number, string> = {};
  private extras: Record<number, Record<string, number | null>> = {};

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private notificationService: NotificationService,
    public offlineSync: OfflineSyncService,
  ) {}

  ngOnInit(): void {
    void this.cargar();
  }

  extra(c: Conflicto): Record<string, number | null> {
    return (this.extras[c.idConflicto] ??= {});
  }

  elegirVariante(c: Conflicto, idProducto: number): void {
    const e = this.extra(c);
    e['idProductoNuevo'] = e['idProductoNuevo'] === idProducto ? null : idProducto;
    e['codigoSucursalNueva'] = null;
  }

  elegirSucursal(c: Conflicto, codigo: number): void {
    const e = this.extra(c);
    e['codigoSucursalNueva'] = e['codigoSucursalNueva'] === codigo ? null : codigo;
    e['idProductoNuevo'] = null;
  }

  decision(clave: string | null): string {
    return clave ? (ETIQUETA_DECISION[clave] ?? clave) : '';
  }

  cambiarVista(vista: 'Pendiente' | 'Resuelto'): void {
    this.vista.set(vista);
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    if (!this.offlineSync.enLinea()) return;
    await firstValueFrom(this.http.get<Conflicto[]>(`${API_URL}/api/sync/conflictos`, { params: { estado: this.vista() } }))
      .then(l => this.conflictos.set(l))
      .catch(err => this.notificationService.error('Error', err.error?.detail ?? 'No se pudieron cargar los conflictos.'));
  }

  async resolver(c: Conflicto, decision: string): Promise<void> {
    const cuerpo = { decision, observaciones: this.observaciones[c.idConflicto] || null, ...this.extra(c) };
    await firstValueFrom(this.http.post(`${API_URL}/api/sync/conflictos/${c.idConflicto}/resolver`, cuerpo))
      .then(async () => {
        this.notificationService.success('Conflicto resuelto', this.decision(decision));
        await this.offlineSync.sincronizar();
      })
      .catch(err => this.notificationService.error('No se pudo resolver', err.error?.detail ?? 'Intente de nuevo.'));
    await this.cargar();
  }
}
