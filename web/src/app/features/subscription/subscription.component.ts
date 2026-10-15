import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { PwaService } from '../../core/services/pwa.service';
import { TenantService, ILIMITADO } from '../../core/services/tenant.service';
import { OperacionPendiente } from '../../core/services/local-db.service';
import { PlanOut } from '../../core/models';

/**
 * Suscripción, plan y modo sin conexión (CU26/CU27/CU30).
 *
 * Junta en una sola pantalla las tres cosas que el operador necesita saber
 * sobre su organización: qué plan tiene (y qué le falta para el siguiente),
 * cuánto consumió de sus cupos, y en qué estado está la base local del
 * dispositivo (instalación, última sincronización y cola pendiente).
 */
@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">

      <div>
        <h1 class="text-xl font-bold text-gray-900">Suscripción y Operación Local</h1>
        <p class="text-xs text-gray-500 mt-1">
          Plan vigente de la organización, consumo de cupos y estado de la base de datos del dispositivo.
        </p>
      </div>

      <!-- Plan vigente + consumo -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6 shadow-2xs">
          <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Plan vigente</span>
          <h2 class="text-2xl font-bold text-gray-900 mt-1">{{ tenantService.plan()?.nombre || '—' }}</h2>
          <p class="text-xs text-gray-500 mt-1">{{ tenantService.plan()?.descripcion }}</p>

          <div class="mt-4 pt-4 border-t border-gray-100">
            <p class="text-3xl font-bold text-gray-900">
              {{ (tenantService.plan()?.precioMensual || 0).toLocaleString() }}
              <span class="text-sm font-normal text-gray-500">Bs / mes</span>
            </p>
            <p class="text-xs text-gray-500 mt-1">Organización: {{ tenantService.tenant()?.nombre || '—' }}</p>
          </div>

          <div class="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div *ngFor="let f of flags()" class="flex items-center gap-2 text-xs">
              <span class="material-symbols-outlined text-[16px]"
                    [ngClass]="f.activo ? 'text-emerald-600' : 'text-gray-400'">
                {{ f.activo ? 'check_circle' : 'cancel' }}
              </span>
              <span [ngClass]="f.activo ? 'text-gray-700' : 'text-gray-400'">{{ f.etiqueta }}</span>
            </div>
          </div>
        </div>

        <!-- Consumo de cupos -->
        <div class="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-2xs">
          <h2 class="text-base font-bold text-gray-900">Consumo de cupos</h2>
          <p class="text-xs text-gray-500 mb-5">Al llegar al tope, el backend rechaza la creación con un aviso de mejora de plan.</p>

          <div class="space-y-5">
            <div *ngFor="let cupo of cupos()">
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-semibold text-gray-700">{{ cupo.etiqueta }}</span>
                <span class="text-gray-500 font-mono">
                  {{ cupo.usado }} / {{ tenantService.formatearLimite(cupo.limite) }}
                </span>
              </div>
              <div class="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [ngClass]="cupo.porcentaje >= 90 ? 'bg-rose-600' : cupo.porcentaje >= 70 ? 'bg-amber-600' : 'bg-indigo-600'"
                     [style.width.%]="cupo.limite === ilimitado ? 8 : cupo.porcentaje"></div>
              </div>
              <p *ngIf="cupo.limite === ilimitado" class="text-[10px] text-gray-400 mt-1">Sin tope en este plan</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Estado offline / PWA -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 class="text-base font-bold text-gray-900">Operación sin conexión</h2>
            <p class="text-xs text-gray-500">
              Base de datos local del dispositivo (IndexedDB). El plan Free Lite opera principalmente sobre ella.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button *ngIf="pwaService.instalable()" (click)="instalar()"
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">install_mobile</span>
              Instalar app
            </button>
            <button (click)="sincronizar()" [disabled]="!offlineSync.enLinea() || offlineSync.sincronizando()"
                    class="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">sync</span>
              {{ offlineSync.sincronizando() ? 'Sincronizando…' : 'Sincronizar ahora' }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div class="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Conexión</span>
            <p class="text-sm font-bold mt-1 flex items-center gap-1.5"
               [ngClass]="offlineSync.enLinea() ? 'text-emerald-600' : 'text-amber-600'">
              <span class="w-2 h-2 rounded-full" [ngClass]="offlineSync.enLinea() ? 'bg-emerald-500' : 'bg-amber-500'"></span>
              {{ offlineSync.enLinea() ? 'En línea' : 'Sin conexión' }}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Instalación</span>
            <p class="text-sm font-bold text-gray-900 mt-1">
              {{ pwaService.instalada() ? 'Instalada' : pwaService.instalable() ? 'Disponible' : 'En navegador' }}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Última sincronización</span>
            <p class="text-sm font-bold text-gray-900 mt-1">
              {{ offlineSync.ultimaSync() ? (offlineSync.ultimaSync() | date: 'dd/MM HH:mm') : 'Nunca' }}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pendientes de envío</span>
            <p class="text-sm font-bold mt-1" [ngClass]="offlineSync.hayPendientes() ? 'text-amber-600' : 'text-gray-900'">
              {{ offlineSync.pendientes() }}
            </p>
          </div>
        </div>

        <!-- Cola pendiente -->
        <div *ngIf="pendientes().length > 0" class="mt-5 pt-5 border-t border-gray-100">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Cola del dispositivo</h3>
          <div class="space-y-2">
            <div *ngFor="let op of pendientes()"
                 class="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs">
              <div>
                <span class="font-bold text-gray-900 uppercase">{{ op.tipo }}</span>
                <span class="text-gray-500"> · creada {{ op.creadoEn | date: 'dd/MM HH:mm' }}</span>
                <p *ngIf="op.ultimoError" class="text-rose-600 mt-0.5">{{ op.ultimoError }}</p>
              </div>
              <span class="text-gray-400 font-mono">{{ op.intentos }} intento(s)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Comparativa de planes -->
      <div>
        <h2 class="text-base font-bold text-gray-900 mb-1">Planes disponibles</h2>
        <p class="text-xs text-gray-500 mb-4">
          Un cambio a un plan menor se rechaza si el consumo actual supera sus topes.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div *ngFor="let plan of tenantService.planes()"
               class="bg-white rounded-xl border p-5 shadow-2xs flex flex-col justify-between transition-colors"
               [ngClass]="esActual(plan) ? 'border-indigo-600 ring-2 ring-indigo-500/30' : 'border-gray-200 hover:border-indigo-200'">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">{{ plan.codigo }}</span>
                <span *ngIf="esActual(plan)"
                      class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase">
                  Actual
                </span>
              </div>
              <h3 class="text-lg font-bold text-gray-900">{{ plan.nombre }}</h3>
              <p class="text-2xl font-bold text-gray-900 mt-2">
                {{ plan.precioMensual.toLocaleString() }}
                <span class="text-xs font-normal text-gray-500">Bs/mes</span>
              </p>
              <p class="text-xs text-gray-500 mt-2 leading-relaxed">{{ plan.descripcion }}</p>

              <ul class="mt-4 space-y-1.5 text-xs text-gray-700 border-t border-gray-100 pt-4">
                <li>{{ tenantService.formatearLimite(plan.maxSucursales) }} sucursal(es)</li>
                <li>{{ tenantService.formatearLimite(plan.maxUsuarios) }} usuario(s)</li>
                <li>{{ tenantService.formatearLimite(plan.maxProductos) }} producto(s)</li>
                <li [ngClass]="plan.permiteIA ? 'text-emerald-600 font-semibold' : 'text-gray-400'">
                  {{ plan.permiteIA ? 'Reportes con IA' : 'Sin reportes con IA' }}
                </li>
                <li [ngClass]="plan.permiteOffline ? 'text-emerald-600 font-semibold' : 'text-gray-400'">
                  {{ plan.permiteOffline ? 'Modo sin conexión' : 'Solo en línea' }}
                </li>
              </ul>
            </div>

            <button *ngIf="!esActual(plan)" (click)="cambiar(plan)" [disabled]="cambiando()"
                    class="mt-5 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer">
              Cambiar a este plan
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class SubscriptionComponent implements OnInit {
  readonly ilimitado = ILIMITADO;
  readonly cambiando = signal<boolean>(false);
  readonly pendientes = signal<OperacionPendiente[]>([]);

  readonly cupos = computed(() => {
    const plan = this.tenantService.plan();
    const uso = this.tenantService.uso();
    if (!plan || !uso) return [];
    return [
      { etiqueta: 'Sucursales', usado: uso.sucursales, limite: plan.maxSucursales,
        porcentaje: this.tenantService.porcentajeUso(uso.sucursales, plan.maxSucursales) },
      { etiqueta: 'Usuarios del equipo', usado: uso.usuarios, limite: plan.maxUsuarios,
        porcentaje: this.tenantService.porcentajeUso(uso.usuarios, plan.maxUsuarios) },
      { etiqueta: 'Productos en catálogo', usado: uso.productos, limite: plan.maxProductos,
        porcentaje: this.tenantService.porcentajeUso(uso.productos, plan.maxProductos) },
    ];
  });

  readonly flags = computed(() => {
    const plan = this.tenantService.plan();
    return [
      { etiqueta: 'Reportes consolidados con IA', activo: !!plan?.permiteIA },
      { etiqueta: 'Modo sin conexión con base local', activo: !!plan?.permiteOffline },
      { etiqueta: 'Varias sucursales sincronizadas', activo: !!plan?.permiteMultiSucursal },
      { etiqueta: 'Operación principalmente local (Lite)', activo: !!plan?.soloLocal },
    ];
  });

  constructor(
    public tenantService: TenantService,
    public offlineSync: OfflineSyncService,
    public pwaService: PwaService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.tenantService.cargarContexto(), this.tenantService.cargarPlanes()]);
    await this.refrescarPendientes();
  }

  private async refrescarPendientes(): Promise<void> {
    this.pendientes.set(await this.offlineSync.detallePendientes());
  }

  esActual(plan: PlanOut): boolean {
    return this.tenantService.plan()?.idPlan === plan.idPlan;
  }

  async cambiar(plan: PlanOut): Promise<void> {
    this.cambiando.set(true);
    await this.tenantService.cambiarPlan(plan.codigo);
    this.cambiando.set(false);
  }

  async sincronizar(): Promise<void> {
    await this.offlineSync.sincronizar();
    await this.offlineSync.descargarSnapshot();
    await this.refrescarPendientes();
  }

  async instalar(): Promise<void> {
    await this.pwaService.instalar();
  }
}
