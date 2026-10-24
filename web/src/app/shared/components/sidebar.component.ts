import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { TenantService } from '../../core/services/tenant.service';
import { PERMISO_PLATAFORMA } from '../../core/services/platform.service';

export type AppView = 'dashboard' | 'archive' | 'inventory' | 'logistics' | 'suppliers' | 'seasons' | 'team' | 'reservations' | 'pos' | 'locations' | 'reports' | 'indicadores' | 'returns' | 'subscription' | 'bitacora' | PlatformView;

/** Vistas de la consola de plataforma: las únicas del Superadministrador. */
export type PlatformView = 'platform' | 'platform-bitacora' | 'platform-respaldos';
export const VISTAS_PLATAFORMA: readonly PlatformView[] = ['platform', 'platform-bitacora', 'platform-respaldos'];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="w-64 bg-[#18191d] text-gray-900 flex flex-col justify-between h-full border-r border-gray-200 select-none">

      <!-- Sección superior: min-h-0 deja que el nav se encoja y scrollee
           en vez de empujar el panel inferior fuera de la pantalla. -->
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- Encabezado de marca en sidebar -->
        <div class="shrink-0 p-6 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs">
              A
            </div>
            <div>
              <span class="font-bold text-base tracking-tight text-gray-900 block leading-tight">YouShop</span>
              <span class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Nodo de Operaciones</span>
            </div>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-200 uppercase">
            {{ tenantService.plan()?.nombre || 'v26.4' }}
          </span>
        </div>

        <!-- Sección de navegación -->
        <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-1">
          <!-- Consola de plataforma (migracion 016): solo el Superadministrador. -->
          <ng-container *ngIf="esSuperadmin">
            <div class="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 px-2">
              Plataforma
            </div>
            <button
              *ngFor="let item of itemsPlataforma"
              (click)="selectView(item.vista)"
              [class.bg-indigo-50]="currentView === item.vista"
              [class.text-indigo-700]="currentView === item.vista"
              [class.font-semibold]="currentView === item.vista"
              [class.text-gray-600]="currentView !== item.vista"
              class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
            >
              <div
                [class.bg-indigo-600]="currentView === item.vista"
                [class.text-white]="currentView === item.vista"
                [class.bg-gray-100]="currentView !== item.vista"
                [class.text-gray-500]="currentView !== item.vista"
                class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
              >
                <span class="material-symbols-outlined text-[18px]">{{ item.icono }}</span>
              </div>
              <span class="font-medium tracking-tight">{{ item.etiqueta }}</span>
            </button>
          </ng-container>

          <!-- Modulos de NEGOCIO: son de cada empresa. El superadministrador
               opera la plataforma, no el negocio de un cliente, asi que no los ve
               (y el backend igual le responde 403: no tiene esos permisos). -->
          <ng-container *ngIf="!esSuperadmin">
          <div class="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 px-2">
            Módulos Principales
          </div>

          <!-- Centro de Operaciones -->
          <button
            (click)="selectView('dashboard')"
            [class.bg-indigo-50]="currentView === 'dashboard'"
            [class.text-indigo-700]="currentView === 'dashboard'"
            [class.font-semibold]="currentView === 'dashboard'"
            [class.text-gray-600]="currentView !== 'dashboard'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'dashboard'"
              [class.text-white]="currentView === 'dashboard'"
              [class.bg-gray-100]="currentView !== 'dashboard'"
              [class.text-gray-500]="currentView !== 'dashboard'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">dashboard</span>
            </div>
            <span class="font-medium tracking-tight">Centro de Operaciones</span>
          </button>

          <!-- Archivo y Catálogo -->
          <button
            (click)="selectView('archive')"
            [class.bg-indigo-50]="currentView === 'archive'"
            [class.text-indigo-700]="currentView === 'archive'"
            [class.font-semibold]="currentView === 'archive'"
            [class.text-gray-600]="currentView !== 'archive'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'archive'"
              [class.text-white]="currentView === 'archive'"
              [class.bg-gray-100]="currentView !== 'archive'"
              [class.text-gray-500]="currentView !== 'archive'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">checkroom</span>
            </div>
            <span class="font-medium tracking-tight">Archivo y Catálogo</span>
          </button>

          <!-- Inventario Global -->
          <button
            (click)="selectView('inventory')"
            [class.bg-indigo-50]="currentView === 'inventory'"
            [class.text-indigo-700]="currentView === 'inventory'"
            [class.font-semibold]="currentView === 'inventory'"
            [class.text-gray-600]="currentView !== 'inventory'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'inventory'"
              [class.text-white]="currentView === 'inventory'"
              [class.bg-gray-100]="currentView !== 'inventory'"
              [class.text-gray-500]="currentView !== 'inventory'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">inventory_2</span>
            </div>
            <span class="font-medium tracking-tight">Inventario Global</span>
          </button>

          <!-- Despachos y Logística -->
          <button
            (click)="selectView('logistics')"
            [class.bg-indigo-50]="currentView === 'logistics'"
            [class.text-indigo-700]="currentView === 'logistics'"
            [class.font-semibold]="currentView === 'logistics'"
            [class.text-gray-600]="currentView !== 'logistics'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'logistics'"
              [class.text-white]="currentView === 'logistics'"
              [class.bg-gray-100]="currentView !== 'logistics'"
              [class.text-gray-500]="currentView !== 'logistics'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">local_shipping</span>
            </div>
            <span class="font-medium tracking-tight">Despachos y VIP</span>
          </button>

          <!-- Proveedores -->
          <button
            (click)="selectView('suppliers')"
            [class.bg-indigo-50]="currentView === 'suppliers'"
            [class.text-indigo-700]="currentView === 'suppliers'"
            [class.font-semibold]="currentView === 'suppliers'"
            [class.text-gray-600]="currentView !== 'suppliers'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'suppliers'"
              [class.text-white]="currentView === 'suppliers'"
              [class.bg-gray-100]="currentView !== 'suppliers'"
              [class.text-gray-500]="currentView !== 'suppliers'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">handshake</span>
            </div>
            <span class="font-medium tracking-tight">Proveedores</span>
          </button>

          <!-- Temporadas y Colecciones -->
          <button
            (click)="selectView('seasons')"
            [class.bg-indigo-50]="currentView === 'seasons'"
            [class.text-indigo-700]="currentView === 'seasons'"
            [class.font-semibold]="currentView === 'seasons'"
            [class.text-gray-600]="currentView !== 'seasons'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'seasons'"
              [class.text-white]="currentView === 'seasons'"
              [class.bg-gray-100]="currentView !== 'seasons'"
              [class.text-gray-500]="currentView !== 'seasons'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">event_note</span>
            </div>
            <span class="font-medium tracking-tight">Temporadas y Colecciones</span>
          </button>

          <!-- Reservas -->
          <button
            (click)="selectView('reservations')"
            [class.bg-indigo-50]="currentView === 'reservations'"
            [class.text-indigo-700]="currentView === 'reservations'"
            [class.font-semibold]="currentView === 'reservations'"
            [class.text-gray-600]="currentView !== 'reservations'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'reservations'"
              [class.text-white]="currentView === 'reservations'"
              [class.bg-gray-100]="currentView !== 'reservations'"
              [class.text-gray-500]="currentView !== 'reservations'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">event_available</span>
            </div>
            <span class="font-medium tracking-tight">Reservas</span>
          </button>

          <!-- Caja (Venta Presencial, CU19/CU20) — solo con venta.crear -->
          <button
            *ngIf="canOpenPos"
            (click)="selectView('pos')"
            [class.bg-indigo-50]="currentView === 'pos'"
            [class.text-indigo-700]="currentView === 'pos'"
            [class.font-semibold]="currentView === 'pos'"
            [class.text-gray-600]="currentView !== 'pos'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'pos'"
              [class.text-white]="currentView === 'pos'"
              [class.bg-gray-100]="currentView !== 'pos'"
              [class.text-gray-500]="currentView !== 'pos'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">point_of_sale</span>
            </div>
            <span class="font-medium tracking-tight">Caja</span>
          </button>

          <!-- Devoluciones y cambios de talla (CU28) — mismo permiso que Caja:
               quien cobra en el mostrador es quien recibe el cambio. -->
          <button
            *ngIf="canOpenPos"
            (click)="selectView('returns')"
            [class.bg-indigo-50]="currentView === 'returns'"
            [class.text-indigo-700]="currentView === 'returns'"
            [class.font-semibold]="currentView === 'returns'"
            [class.text-gray-600]="currentView !== 'returns'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'returns'"
              [class.text-white]="currentView === 'returns'"
              [class.bg-gray-100]="currentView !== 'returns'"
              [class.text-gray-500]="currentView !== 'returns'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">swap_horiz</span>
            </div>
            <span class="font-medium tracking-tight">Devoluciones y Cambios</span>
          </button>

          <div class="pt-4 text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 px-2">
            Administración
          </div>

          <!-- Personal y Nodos -->
          <button
            (click)="selectView('team')"
            [class.bg-indigo-50]="currentView === 'team'"
            [class.text-indigo-700]="currentView === 'team'"
            [class.font-semibold]="currentView === 'team'"
            [class.text-gray-600]="currentView !== 'team'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'team'"
              [class.text-white]="currentView === 'team'"
              [class.bg-gray-100]="currentView !== 'team'"
              [class.text-gray-500]="currentView !== 'team'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">shield_person</span>
            </div>
            <span class="font-medium tracking-tight">Personal y Nodos</span>
          </button>

          <!-- Bitácora — todo el personal: el backend decide si ve la empresa
               entera (bitacora.ver) o solo su propia actividad. -->
          <button
            (click)="selectView('bitacora')"
            [class.bg-indigo-50]="currentView === 'bitacora'"
            [class.text-indigo-700]="currentView === 'bitacora'"
            [class.font-semibold]="currentView === 'bitacora'"
            [class.text-gray-600]="currentView !== 'bitacora'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'bitacora'"
              [class.text-white]="currentView === 'bitacora'"
              [class.bg-gray-100]="currentView !== 'bitacora'"
              [class.text-gray-500]="currentView !== 'bitacora'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">history</span>
            </div>
            <span class="font-medium tracking-tight">Bitácora</span>
          </button>

          <!-- Ciudades y Sucursales -->
          <button
            (click)="selectView('locations')"
            [class.bg-indigo-50]="currentView === 'locations'"
            [class.text-indigo-700]="currentView === 'locations'"
            [class.font-semibold]="currentView === 'locations'"
            [class.text-gray-600]="currentView !== 'locations'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'locations'"
              [class.text-white]="currentView === 'locations'"
              [class.bg-gray-100]="currentView !== 'locations'"
              [class.text-gray-500]="currentView !== 'locations'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">location_city</span>
            </div>
            <span class="font-medium tracking-tight">Ciudades y Sucursales</span>
          </button>

          <!-- Reportes (CU25) — solo con reporte.ver. Primer ítem del sidebar
               con gating por permiso (todos los demás renderizan siempre). -->
          <button
            *ngIf="canViewReports"
            (click)="selectView('reports')"
            [class.bg-indigo-50]="currentView === 'reports'"
            [class.text-indigo-700]="currentView === 'reports'"
            [class.font-semibold]="currentView === 'reports'"
            [class.text-gray-600]="currentView !== 'reports'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'reports'"
              [class.text-white]="currentView === 'reports'"
              [class.bg-gray-100]="currentView !== 'reports'"
              [class.text-gray-500]="currentView !== 'reports'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">summarize</span>
            </div>
            <span class="font-medium tracking-tight">Reportes</span>
          </button>

          <!-- Indicadores (CU24) — mismo permiso que Reportes (reporte.ver),
               mismo módulo de analítica, Administrador-only. -->
          <button
            *ngIf="canViewIndicadores"
            (click)="selectView('indicadores')"
            [class.bg-indigo-50]="currentView === 'indicadores'"
            [class.text-indigo-700]="currentView === 'indicadores'"
            [class.font-semibold]="currentView === 'indicadores'"
            [class.text-gray-600]="currentView !== 'indicadores'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'indicadores'"
              [class.text-white]="currentView === 'indicadores'"
              [class.bg-gray-100]="currentView !== 'indicadores'"
              [class.text-gray-500]="currentView !== 'indicadores'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">insights</span>
            </div>
            <span class="font-medium tracking-tight">Indicadores</span>
          </button>

          <!-- Suscripcion, plan y modo offline (CU26/CU27/CU30). -->
          <button
            (click)="selectView('subscription')"
            [class.bg-indigo-50]="currentView === 'subscription'"
            [class.text-indigo-700]="currentView === 'subscription'"
            [class.font-semibold]="currentView === 'subscription'"
            [class.text-gray-600]="currentView !== 'subscription'"
            class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer group"
          >
            <div
              [class.bg-indigo-600]="currentView === 'subscription'"
              [class.text-white]="currentView === 'subscription'"
              [class.bg-gray-100]="currentView !== 'subscription'"
              [class.text-gray-500]="currentView !== 'subscription'"
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">workspace_premium</span>
            </div>
            <span class="font-medium tracking-tight">Suscripción y Plan</span>
          </button>
          </ng-container>
        </nav>
      </div>

      <!-- Sección inferior -->
      <div class="shrink-0 p-4 border-t border-gray-100 space-y-2">
        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div class="flex items-center space-x-2 mb-1">
            <span class="w-2 h-2 rounded-full"
                  [ngClass]="offlineSync.enLinea() ? 'bg-emerald-500' : 'bg-amber-500'"></span>
            <p class="text-[11px] font-bold text-gray-900 uppercase tracking-tight">
              {{ tenantService.tenant()?.nombre || 'Bóveda de Zurich Activa' }}
            </p>
          </div>
          <p class="text-xs text-gray-500 leading-relaxed">
            {{ offlineSync.enLinea()
                ? 'Sincronizada con la bóveda central.'
                : 'Sin conexión: operando con la base local del dispositivo.' }}
          </p>
          <p *ngIf="offlineSync.hayPendientes()" class="text-[11px] text-amber-700 font-semibold mt-1.5">
            {{ offlineSync.pendientes() }} operación(es) esperando sincronizar
          </p>
        </div>

        <button
          (click)="viewAuthScreen.emit()"
          class="w-full py-2 px-3 rounded-lg bg-[#18191d] hover:bg-gray-50 border border-gray-200 text-gray-700 font-semibold text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[16px] text-gray-500">lock_reset</span>
          <span>Cambiar a Vista de Inicio de Sesión</span>
        </button>
      </div>
    </aside>
  `
})
export class SidebarComponent {
  @Input() currentView: AppView = 'dashboard';
  @Output() viewChange = new EventEmitter<AppView>();
  @Output() viewAuthScreen = new EventEmitter<void>();

  readonly itemsPlataforma: { vista: PlatformView; etiqueta: string; icono: string }[] = [
    { vista: 'platform', etiqueta: 'Empresas suscritas', icono: 'domain' },
    { vista: 'platform-bitacora', etiqueta: 'Bitácora', icono: 'history' },
    { vista: 'platform-respaldos', etiqueta: 'Respaldos', icono: 'backup' },
  ];

  constructor(
    private authService: AuthService,
    public tenantService: TenantService,
    public offlineSync: OfflineSyncService,
  ) {}

  get canOpenPos(): boolean {
    return this.authService.currentUser()?.permisos.includes('venta.crear') ?? false;
  }

  get canViewReports(): boolean {
    return this.authService.currentUser()?.permisos.includes('reporte.ver') ?? false;
  }

  get esSuperadmin(): boolean {
    return this.authService.currentUser()?.permisos.includes(PERMISO_PLATAFORMA) ?? false;
  }

  get canViewIndicadores(): boolean {
    return this.authService.currentUser()?.permisos.includes('reporte.ver') ?? false;
  }

  selectView(view: AppView) {
    this.viewChange.emit(view);
  }
}
