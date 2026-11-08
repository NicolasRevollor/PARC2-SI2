import { Component, OnInit, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InventoryLocation } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CajaServidor, CajaService, MovimientoCaja } from '../../core/services/caja.service';
import { NotificationService } from '../../core/services/notification.service';
import { CajaLocal, OfflineSyncService } from '../../core/services/offline-sync.service';
import { arqueo } from '../../core/offline-rules';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU20] Gestionar apertura y cierre de caja
// Boundary: CajaUI -> este componente
// Control: backend/app/routers/caja.py + services/caja.py; sin conexion,
//   OfflineSyncService.registrarOperacion('caja_apertura' y 'caja_cierre')
// ==================================================================
@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-5 max-w-4xl">
      <app-cu-badge cu="CU20" [conNombre]="true"></app-cu-badge>

      <label class="block max-w-xs">
        <span class="ys-mini">Sucursal</span>
        <select class="ys-campo" [ngModel]="sucursal()" (ngModelChange)="elegirSucursal($event)" name="sucursalCaja" [disabled]="!offlineSync.enLinea()">
          <option [ngValue]="null" disabled>Seleccione</option>
          <option *ngFor="let l of sucursales()" [ngValue]="l.codigoSucursal">{{ l.nombre }}</option>
        </select>
      </label>

      <p *ngIf="sucursal() === null" class="text-sm text-gray-400">Elija la sucursal de la caja.</p>

      <!-- Abrir caja (pasos 1-2) -->
      <div *ngIf="sucursal() !== null && !cajaAbierta()" class="ys-tarjeta p-5 space-y-3 max-w-sm">
        <p class="ys-etiqueta">Abrir caja</p>
        <label class="block"><span class="ys-mini">Monto inicial en efectivo</span>
          <input type="number" min="0" step="0.01" class="ys-campo" [(ngModel)]="montoInicial" name="montoInicial" /></label>
        <button (click)="abrir()" [disabled]="trabajando()" class="ys-btn w-full">Abrir caja</button>
      </div>

      <!-- Caja abierta (paso 3) y cierre (pasos 4-6) -->
      <div *ngIf="cajaAbierta()" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="ys-tarjeta p-5 space-y-2 text-sm" data-testid="caja-abierta">
          <p class="flex items-center justify-between">
            <span class="ys-etiqueta">Caja abierta</span>
            <span class="ys-chip" [ngClass]="offlineSync.caja()?.origen === 'sin_conexion' ? 'border-amber-300 text-amber-700' : 'border-emerald-300 text-emerald-700'">
              {{ offlineSync.caja()?.origen === 'sin_conexion' ? 'Registrada sin conexión' : 'En línea' }}
            </span>
          </p>
          <p class="text-xs text-gray-500">Desde {{ offlineSync.caja()?.fechaApertura | date: 'dd/MM/yyyy HH:mm' }}{{ servidor()?.usuarioApertura ? ' · ' + servidor()?.usuarioApertura : '' }}</p>
          <p class="flex justify-between"><span>Monto inicial</span><span>Bs {{ inicial().toFixed(2) }}</span></p>
          <p class="flex justify-between text-emerald-700"><span>Ingresos</span><span data-testid="ingresos">Bs {{ ingresos().toFixed(2) }}</span></p>
          <p class="flex justify-between text-rose-600"><span>Egresos</span><span>Bs {{ egresos().toFixed(2) }}</span></p>
          <p class="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2"><span>Monto esperado</span><span data-testid="esperado">Bs {{ esperado().toFixed(2) }}</span></p>
          <div *ngIf="servidor()?.resumen?.length" class="border-t border-gray-100 pt-2 space-y-0.5">
            <p *ngFor="let r of servidor()!.resumen" class="flex justify-between text-xs text-gray-600"><span>{{ r.etiqueta }} ({{ r.cantidad }})</span><span>Bs {{ r.monto.toFixed(2) }}</span></p>
          </div>
        </div>

        <div class="ys-tarjeta p-5 space-y-3">
          <p class="ys-etiqueta">Cerrar caja</p>
          <label class="block"><span class="ys-mini">Efectivo contado</span>
            <input type="number" min="0" step="0.01" class="ys-campo" [ngModel]="contado()" (ngModelChange)="contado.set($event)" name="contado" /></label>
          <p *ngIf="contado() !== null" class="text-sm font-bold" [ngClass]="diferencia() === 0 ? 'text-emerald-600' : 'text-amber-700'" data-testid="diferencia">
            {{ diferencia() === 0 ? 'Sin diferencia' : (diferencia() > 0 ? 'Sobrante: Bs ' : 'Faltante: Bs ') + abs(diferencia()).toFixed(2) }}
          </p>
          <label *ngIf="excedeUmbral()" class="block"><span class="ys-mini">Justificación (supera el umbral de Bs {{ umbral().toFixed(2) }})</span>
            <input class="ys-campo" [(ngModel)]="justificacion" name="justificacion" /></label>
          <p *ngIf="pendientes().length" class="text-xs text-amber-700">
            Hay {{ pendientes().length }} operación(es) sin confirmar: se registrará un cierre provisional.
          </p>
          <button (click)="cerrar()" [disabled]="contado() === null || trabajando() || (excedeUmbral() && !justificacion.trim())" class="ys-btn w-full">Confirmar cierre</button>
        </div>
      </div>

      <div *ngIf="movimientos().length" class="ys-tarjeta p-4 space-y-1">
        <p class="ys-etiqueta">Movimientos</p>
        <p *ngFor="let m of movimientos()" class="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
          <span class="text-gray-700">{{ m.fecha | date: 'HH:mm' }} · {{ m.etiqueta }} · {{ m.referencia }}</span>
          <span [ngClass]="m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-rose-600'">{{ m.tipo === 'ingreso' ? '+' : '−' }} Bs {{ m.monto.toFixed(2) }}</span>
        </p>
      </div>

      <div *ngIf="offlineSync.enLinea() && historial().length" class="ys-tarjeta overflow-x-auto">
        <p class="ys-etiqueta p-4 pb-2">Arqueos anteriores</p>
        <table class="w-full text-xs">
          <thead><tr class="text-left ys-mini border-b border-gray-100">
            <th class="px-4 py-2">Apertura</th><th class="px-4 py-2 text-right">Esperado</th><th class="px-4 py-2 text-right">Contado</th>
            <th class="px-4 py-2 text-right">Diferencia</th><th class="px-4 py-2">Estado</th><th class="px-4 py-2"></th></tr></thead>
          <tbody>
            <tr *ngFor="let c of historial()" class="border-b border-gray-50 last:border-0">
              <td class="px-4 py-2 text-gray-700">{{ c.fechaApertura | date: 'dd/MM HH:mm' }} · {{ c.usuarioApertura }}</td>
              <td class="px-4 py-2 text-right">Bs {{ c.montoEsperado.toFixed(2) }}</td>
              <td class="px-4 py-2 text-right">{{ c.efectivoContado === null ? '—' : 'Bs ' + c.efectivoContado.toFixed(2) }}</td>
              <td class="px-4 py-2 text-right" [ngClass]="(c.diferencia ?? 0) === 0 ? '' : 'text-amber-700 font-bold'">{{ c.diferencia === null ? '—' : 'Bs ' + c.diferencia.toFixed(2) }}</td>
              <td class="px-4 py-2"><span class="ys-chip border-gray-300 text-gray-600">{{ estadoTexto(c.estado) }}</span>
                <p *ngIf="c.justificacion" class="text-[10px] text-gray-400 mt-0.5">{{ c.justificacion }}</p></td>
              <td class="px-4 py-2 text-right">
                <button *ngIf="c.estado === 'PendienteAprobacion' && puedeAprobar()" (click)="aprobar(c)" class="ys-btn py-1">Aprobar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CajaComponent implements OnInit {
  readonly sucursales = signal<InventoryLocation[]>([]);
  readonly sucursal = signal<number | null>(null);
  readonly servidor = signal<CajaServidor | null>(null);
  readonly movimientos = signal<MovimientoCaja[]>([]);
  readonly historial = signal<CajaServidor[]>([]);
  readonly efectivo = signal<{ ingresos: number; egresos: number }>({ ingresos: 0, egresos: 0 });
  readonly contado = signal<number | null>(null);
  readonly trabajando = signal(false);
  montoInicial = 0;
  justificacion = '';

  readonly cajaAbierta = computed(() => {
    const caja = this.offlineSync.caja();
    return !!caja && caja.codigoSucursal === this.sucursal();
  });
  readonly inicial = computed(() => this.offlineSync.caja()?.montoInicial ?? 0);
  readonly ingresos = computed(() => this.efectivo().ingresos);
  readonly egresos = computed(() => this.efectivo().egresos);
  readonly esperado = computed(() => arqueo(this.inicial(), this.ingresos(), this.egresos(), 0).esperado);
  readonly diferencia = computed(() => arqueo(this.inicial(), this.ingresos(), this.egresos(), this.contado() ?? 0).diferencia);
  readonly umbral = computed(() => this.servidor()?.umbralDiferencia ?? this.offlineSync.preparacion()?.configuracion.umbralDiferenciaCaja ?? 50);
  readonly excedeUmbral = computed(() => this.contado() !== null && Math.abs(this.diferencia()) > this.umbral());
  readonly pendientes = computed(() => {
    const caja = this.offlineSync.caja();
    return caja ? this.offlineSync.uuidsSinConfirmar(caja.uuidOperacion) : [];
  });
  readonly puedeAprobar = computed(() => this.authService.currentUser()?.permisos.includes('caja.aprobar') ?? false);

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cajaService: CajaService,
    private notificationService: NotificationService,
    public offlineSync: OfflineSyncService,
  ) {
    effect(() => {
      this.offlineSync.operaciones();
      this.offlineSync.caja();
      void this.offlineSync.efectivoLocalDeCaja().then(e => this.efectivo.set(e ?? { ingresos: 0, egresos: 0 }));
    });
  }

  async ngOnInit(): Promise<void> {
    const prep = this.offlineSync.preparacion();
    const local = this.offlineSync.caja();
    if (prep) this.sucursales.set([{ codigoSucursal: prep.codigoSucursal, nombre: prep.sucursalNombre } as InventoryLocation]);
    const inicial = local?.codigoSucursal ?? prep?.codigoSucursal ?? null;
    if (this.offlineSync.enLinea()) {
      const lista = await firstValueFrom(this.http.get<InventoryLocation[]>(`${API_URL}/api/sync/sucursales`)).catch(() => []);
      if (lista.length) this.sucursales.set(lista);
      const codigo = inicial ?? (lista.length === 1 ? lista[0].codigoSucursal : null);
      if (codigo !== null) await this.elegirSucursal(codigo);
    } else {
      this.sucursal.set(inicial);
    }
  }

  abs(valor: number): number {
    return Math.abs(valor);
  }

  estadoTexto(estado: string): string {
    return { Abierta: 'Abierta', CierreProvisional: 'Cierre provisional', PendienteAprobacion: 'Espera aprobación', Cerrada: 'Cerrada' }[estado] ?? estado;
  }

  async elegirSucursal(codigo: number): Promise<void> {
    this.sucursal.set(codigo);
    await this.refrescar();
  }

  private a_local(c: CajaServidor): CajaLocal {
    return {
      uuidOperacion: c.uuidOperacion, idCaja: c.idCaja, codigoSucursal: c.codigoSucursal, montoInicial: c.montoInicial,
      fechaApertura: c.fechaApertura, origen: 'en_linea', ingresosServidor: c.ingresos, egresosServidor: c.egresos,
    };
  }

  private async refrescar(): Promise<void> {
    const codigo = this.sucursal();
    if (codigo === null || !this.offlineSync.enLinea()) return;
    const caja = await this.cajaService.actual(codigo).catch(() => undefined);
    if (caja === undefined) return;
    this.servidor.set(caja);
    const local = this.offlineSync.caja();
    if (caja) {
      await this.offlineSync.guardarCaja(this.a_local(caja));
      this.movimientos.set(await this.cajaService.movimientos(caja.idCaja).catch(() => []));
    } else {
      this.movimientos.set([]);
      if (local?.codigoSucursal === codigo && local.origen === 'en_linea') await this.offlineSync.guardarCaja(null);
    }
    const anteriores = await this.cajaService.historial(codigo).catch(() => []);
    this.historial.set(anteriores.filter(c => c.estado !== 'Abierta'));
  }

  async abrir(): Promise<void> {
    const codigo = this.sucursal();
    if (codigo === null) return;
    this.trabajando.set(true);
    if (this.offlineSync.enLinea()) {
      await this.cajaService.abrir(codigo, this.montoInicial || 0)
        .then(c => {
          if (c.usuarioApertura && c.montoInicial !== (this.montoInicial || 0)) {
            this.notificationService.info('La caja ya estaba abierta', `La abrió ${c.usuarioApertura}: se muestra la existente.`);
          }
        })
        .catch(err => this.notificationService.error('Error', err.error?.detail ?? 'No se pudo abrir la caja.'));
      await this.refrescar();
    } else {
      const uuid = crypto.randomUUID();
      const monto = this.montoInicial || 0;
      const operacion = await this.offlineSync.registrarOperacion({
        tipo: 'caja_apertura', codigoSucursal: codigo, uuidOperacion: uuid, total: monto,
        resumen: `Apertura de caja con Bs ${monto.toFixed(2)}`, datos: { montoInicial: monto },
      });
      if (operacion) {
        await this.offlineSync.guardarCaja({
          uuidOperacion: uuid, idCaja: null, codigoSucursal: codigo, montoInicial: monto, fechaApertura: operacion.fechaOperacion,
          origen: 'sin_conexion', ingresosServidor: 0, egresosServidor: 0,
        });
      }
    }
    this.montoInicial = 0;
    this.trabajando.set(false);
  }

  async cerrar(): Promise<void> {
    const caja = this.offlineSync.caja();
    const contado = this.contado();
    if (!caja || contado === null) return;
    this.trabajando.set(true);
    const pendientes = this.pendientes();
    const justificacion = this.justificacion.trim() || null;
    if (this.offlineSync.enLinea() && caja.idCaja !== null) {
      await this.cajaService.cerrar(caja.idCaja, contado, justificacion, pendientes)
        .then(async c => {
          await this.offlineSync.guardarCaja(null);
          this.notificationService.success('Caja cerrada', `Estado: ${this.estadoTexto(c.estado)}. Diferencia Bs ${(c.diferencia ?? 0).toFixed(2)}.`);
        })
        .catch(err => this.notificationService.error('No se pudo cerrar', err.error?.detail ?? 'Intente de nuevo.'));
      await this.refrescar();
    } else {
      // Flujo alternativo 2: el servidor decide si el cierre queda provisional.
      const operacion = await this.offlineSync.registrarOperacion({
        tipo: 'caja_cierre', codigoSucursal: caja.codigoSucursal, total: contado, dependeDe: null,
        resumen: `Cierre de caja: contado Bs ${contado.toFixed(2)}, esperado Bs ${this.esperado().toFixed(2)}`,
        datos: { uuidCaja: caja.uuidOperacion, efectivoContado: contado, justificacion, pendientes },
      });
      if (operacion) {
        await this.offlineSync.guardarCaja(null);
        this.notificationService.info('Cierre provisional', 'Se vuelve definitivo cuando se confirmen las operaciones de la jornada.');
      }
    }
    this.contado.set(null);
    this.justificacion = '';
    this.trabajando.set(false);
  }

  async aprobar(c: CajaServidor): Promise<void> {
    await this.cajaService.aprobar(c.idCaja)
      .then(() => this.notificationService.success('Cierre aprobado', `Caja ${c.idCaja}.`))
      .catch(err => this.notificationService.error('Error', err.error?.detail ?? 'No se pudo aprobar.'));
    await this.refrescar();
  }
}
