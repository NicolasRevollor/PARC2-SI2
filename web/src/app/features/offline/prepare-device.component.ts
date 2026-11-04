import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InventoryLocation } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfiguracionOperacion, OfflineSyncService } from '../../core/services/offline-sync.service';
import { PwaService } from '../../core/services/pwa.service';
import { TenantService } from '../../core/services/tenant.service';
import { environment } from '../../../environments/environment';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU12] Preparar dispositivo para operacion sin conexion
// Boundary: PrepararDispositivoUI -> este componente
// Control: OfflineSyncService.preparar() + GET /api/sync/preparacion y /api/sync/snapshot/{seccion}
// ==================================================================
@Component({
  selector: 'app-prepare-device',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-5 max-w-3xl">
      <app-cu-badge cu="CU12" [conNombre]="true"></app-cu-badge>

      <div *ngIf="!offlineSync.compatible" class="ys-tarjeta p-4 text-sm text-rose-600">
        Este navegador no es compatible con Service Worker o IndexedDB: el modo sin conexión no está disponible aquí.
      </div>
      <div *ngIf="offlineSync.compatible && !planPermite()" class="ys-tarjeta p-4 text-sm text-amber-700">
        El plan {{ tenantService.plan()?.nombre }} no incluye la operación sin conexión. Mejore su plan en "Suscripción y Plan".
      </div>
      <div *ngIf="offlineSync.bloqueoPropietario() as bloqueo" class="ys-tarjeta p-4 text-sm text-rose-600">{{ bloqueo }}</div>

      <div *ngIf="offlineSync.compatible && planPermite()" class="ys-tarjeta p-5 space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p class="ys-etiqueta">Paso 1 · Aplicación</p>
            <p class="text-xs text-gray-500">{{ pwaService.instalada() ? 'Instalada en este dispositivo.' : 'Los recursos de la app ya se guardan en caché con el Service Worker.' }}</p>
          </div>
          <button *ngIf="pwaService.instalable()" (click)="pwaService.instalar()" class="ys-btn-sec">
            <span class="material-symbols-outlined text-[16px]">install_mobile</span> Instalar aplicación
          </button>
        </div>

        <div class="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2"><p class="ys-etiqueta">Paso 2 · Datos de la sucursal</p></div>
          <label class="block">
            <span class="ys-mini">Sucursal</span>
            <select class="ys-campo" [ngModel]="sucursal()" (ngModelChange)="sucursal.set($event)" name="sucursal" [disabled]="!offlineSync.enLinea()">
              <option [ngValue]="null" disabled>Seleccione</option>
              <option *ngFor="let l of sucursales()" [ngValue]="l.codigoSucursal">{{ l.nombre }}</option>
            </select>
          </label>
          <label class="block">
            <span class="ys-mini">PIN local (4 a 6 dígitos)</span>
            <input class="ys-campo" type="password" inputmode="numeric" maxlength="6" [(ngModel)]="pin" name="pin"
                   [placeholder]="offlineSync.hayPin() ? 'PIN ya definido: escriba para cambiarlo' : 'Se pide si la sesión guardada venció'" />
          </label>
          <div class="sm:col-span-2 flex items-center gap-3 flex-wrap">
            <button (click)="preparar()" [disabled]="sucursal() === null || !offlineSync.enLinea() || !!offlineSync.descarga() || !!offlineSync.bloqueoPropietario()" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">download_for_offline</span>
              {{ offlineSync.dispositivoListo() ? 'Actualizar datos' : 'Preparar modo sin conexión' }}
            </button>
            <span *ngIf="offlineSync.descarga() as d" class="text-xs text-gray-500">{{ d.etiqueta }}… {{ d.porcentaje }}%</span>
            <span *ngIf="offlineSync.descargaInterrumpida() && !offlineSync.descarga()" class="text-xs text-amber-700">
              Descarga interrumpida: lo descargado se conservó y se reanuda al volver la conexión.
            </span>
          </div>
        </div>
      </div>

      <div *ngIf="offlineSync.preparacion() as p" class="ys-tarjeta p-5 space-y-2" data-testid="dispositivo-listo">
        <p class="text-sm font-bold text-emerald-600 flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">check_circle</span> Dispositivo listo para operar sin conexión
        </p>
        <p class="text-xs text-gray-600">{{ p.sucursalNombre }} · última actualización {{ p.fechaDescarga | date: 'dd/MM/yyyy HH:mm' }}</p>
        <p *ngIf="p.parcial" class="text-xs text-amber-700">Descarga parcial: el espacio no alcanzó y se guardaron primero los productos con mayor rotación.</p>
      </div>

      <div *ngIf="esAdmin() && configuracion() as c" class="ys-tarjeta p-5 space-y-3">
        <p class="ys-etiqueta">Configuración de la empresa</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="block"><span class="ys-mini">Datos vigentes (horas)</span><input class="ys-campo" type="number" min="1" [(ngModel)]="c.horasDatosVigentes" name="horasDatos" /></label>
          <label class="block"><span class="ys-mini">Sesión sin conexión (horas)</span><input class="ys-campo" type="number" min="1" [(ngModel)]="c.horasSesionSinConexion" name="horasSesion" /></label>
          <label class="block"><span class="ys-mini">Retiro de reserva (horas)</span><input class="ys-campo" type="number" min="1" [(ngModel)]="c.horasRetiroReserva" name="horasRetiro" /></label>
          <label class="block"><span class="ys-mini">Umbral de diferencia de caja (Bs)</span><input class="ys-campo" type="number" min="0" [(ngModel)]="c.umbralDiferenciaCaja" name="umbralCaja" /></label>
          <label class="block"><span class="ys-mini">Conflicto solo Administrador (Bs)</span><input class="ys-campo" type="number" min="0" [(ngModel)]="c.umbralConflicto" name="umbralConflicto" /></label>
          <label class="flex items-center gap-2 mt-5 text-xs text-gray-700"><input type="checkbox" [(ngModel)]="c.permiteVentaSinStock" name="sinStock" /> Permitir ventas con stock no confirmado</label>
        </div>
        <button (click)="guardarConfiguracion(c)" [disabled]="!offlineSync.enLinea()" class="ys-btn-sec">Guardar configuración</button>
      </div>
    </div>
  `,
})
export class PrepareDeviceComponent implements OnInit {
  readonly sucursales = signal<InventoryLocation[]>([]);
  readonly sucursal = signal<number | null>(null);
  readonly configuracion = signal<ConfiguracionOperacion | null>(null);
  pin = '';

  readonly planPermite = computed(() => !this.tenantService.plan() || this.tenantService.permite('permiteOffline'));
  readonly esAdmin = computed(() => this.authService.currentUser()?.permisos.includes('tenant.admin') ?? false);

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private notificationService: NotificationService,
    public offlineSync: OfflineSyncService,
    public pwaService: PwaService,
    public tenantService: TenantService,
  ) {}

  ngOnInit(): void {
    const prep = this.offlineSync.preparacion();
    this.sucursal.set(prep?.codigoSucursal ?? null);
    if (prep) this.sucursales.set([{ codigoSucursal: prep.codigoSucursal, nombre: prep.sucursalNombre } as InventoryLocation]);
    if (!this.offlineSync.enLinea()) return;
    firstValueFrom(this.http.get<InventoryLocation[]>(`${API_URL}/api/inventory/locations`))
      .then(l => {
        this.sucursales.set(l);
        if (this.sucursal() === null && l.length === 1) this.sucursal.set(l[0].codigoSucursal);
      })
      .catch(() => undefined);
    if (this.esAdmin()) {
      firstValueFrom(this.http.get<ConfiguracionOperacion>(`${API_URL}/api/sync/configuracion`))
        .then(c => this.configuracion.set(c))
        .catch(() => undefined);
    }
  }

  async preparar(): Promise<void> {
    const codigo = this.sucursal();
    if (codigo === null) return;
    if (this.pin && !/^\d{4,6}$/.test(this.pin)) {
      this.notificationService.warning('PIN no válido', 'El PIN debe tener de 4 a 6 dígitos.');
      return;
    }
    if (this.pin) {
      await this.offlineSync.definirPin(this.pin);
      this.pin = '';
    }
    if (await this.offlineSync.preparar(codigo)) {
      this.notificationService.success('Dispositivo listo', 'Ya puede operar sin conexión en esta sucursal.');
    }
  }

  async guardarConfiguracion(c: ConfiguracionOperacion): Promise<void> {
    await firstValueFrom(this.http.put(`${API_URL}/api/sync/configuracion`, c))
      .then(() => this.notificationService.success('Configuración guardada', 'Se aplica al volver a preparar los dispositivos.'))
      .catch(err => this.notificationService.error('Error', err.error?.detail ?? 'No se pudo guardar.'));
  }
}
