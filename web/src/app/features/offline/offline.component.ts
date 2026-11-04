import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { PrepareDeviceComponent } from './prepare-device.component';
import { OfflineCatalogComponent } from './offline-catalog.component';
import { OfflineSaleComponent } from './offline-sale.component';
import { OfflineReservationComponent } from './offline-reservation.component';
import { OfflineExchangeComponent } from './offline-exchange.component';
import { PendingOperationsComponent } from './pending-operations.component';
import { ConflictsComponent } from './conflicts.component';
import { CajaComponent } from '../caja/caja.component';

export type PestanaOffline = 'preparar' | 'catalogo' | 'venta' | 'reserva' | 'cambio' | 'operaciones' | 'conflictos' | 'caja';

/** Módulo "Operación sin conexión": [CU12] a [CU20], una pestaña por caso de uso. */
@Component({
  selector: 'app-offline',
  standalone: true,
  imports: [
    CommonModule,
    PrepareDeviceComponent,
    OfflineCatalogComponent,
    OfflineSaleComponent,
    OfflineReservationComponent,
    OfflineExchangeComponent,
    PendingOperationsComponent,
    ConflictsComponent,
    CajaComponent,
  ],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Operación sin conexión</h1>
          <p class="text-xs text-gray-500 mt-1">
            {{ offlineSync.enLinea() ? 'Hay conexión: lo registrado aquí se envía al momento.' : 'Sin conexión: todo se guarda en este dispositivo y se sincroniza al volver la red.' }}
            {{ offlineSync.pendientes() }} pendiente(s) · {{ offlineSync.enConflicto() }} en conflicto.
          </p>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer" title="Para demostrar el modo sin conexión sin desconectar el equipo">
          <input type="checkbox" [checked]="offlineSync.simulado()" (change)="simular($event)" data-testid="simular" />
          Simular sin conexión
        </label>
      </div>

      <div class="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        <button *ngFor="let t of pestanas()" (click)="pestana.set(t.id)" [attr.data-testid]="'tab-' + t.id"
                class="px-3 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 bg-transparent whitespace-nowrap"
                [ngClass]="pestana() === t.id ? 'text-indigo-600 border-indigo-600' : 'text-gray-500 border-transparent hover:text-gray-900'">
          <span class="material-symbols-outlined text-[16px]">{{ t.icono }}</span> {{ t.etiqueta }}
          <span class="text-[9px] font-bold px-1 rounded border border-current">{{ t.cu }}</span>
        </button>
      </div>

      <app-prepare-device *ngIf="pestana() === 'preparar'"></app-prepare-device>
      <app-offline-catalog *ngIf="pestana() === 'catalogo'"></app-offline-catalog>
      <app-offline-sale *ngIf="pestana() === 'venta'" (irCaja)="pestana.set('caja')"></app-offline-sale>
      <app-offline-reservation *ngIf="pestana() === 'reserva'"></app-offline-reservation>
      <app-offline-exchange *ngIf="pestana() === 'cambio'" (irCaja)="pestana.set('caja')"></app-offline-exchange>
      <app-pending-operations *ngIf="pestana() === 'operaciones'" (irConflictos)="pestana.set('conflictos')"></app-pending-operations>
      <app-conflicts *ngIf="pestana() === 'conflictos'"></app-conflicts>
      <app-caja *ngIf="pestana() === 'caja'"></app-caja>
    </div>
  `,
})
export class OfflineComponent implements OnInit {
  @Input() inicial: PestanaOffline = 'preparar';

  readonly pestana = signal<PestanaOffline>('preparar');
  readonly pestanas = computed(() => {
    const permisos = this.authService.currentUser()?.permisos ?? [];
    return [
      { id: 'preparar' as const, etiqueta: 'Preparar', icono: 'download_for_offline', cu: 'CU12', ver: true },
      { id: 'catalogo' as const, etiqueta: 'Catálogo', icono: 'search', cu: 'CU13', ver: true },
      { id: 'caja' as const, etiqueta: 'Caja', icono: 'point_of_sale', cu: 'CU20', ver: permisos.includes('caja.operar') },
      { id: 'venta' as const, etiqueta: 'Venta', icono: 'shopping_cart', cu: 'CU14', ver: permisos.includes('venta.crear') },
      { id: 'reserva' as const, etiqueta: 'Reserva', icono: 'event_available', cu: 'CU15', ver: permisos.includes('reserva.crear') },
      { id: 'cambio' as const, etiqueta: 'Cambio', icono: 'swap_horiz', cu: 'CU19', ver: permisos.includes('devolucion.registrar') },
      { id: 'operaciones' as const, etiqueta: 'Operaciones', icono: 'sync', cu: 'CU16-17', ver: true },
      { id: 'conflictos' as const, etiqueta: 'Conflictos', icono: 'report', cu: 'CU18', ver: permisos.includes('sync.resolver') },
    ].filter(p => p.ver);
  });

  constructor(
    public offlineSync: OfflineSyncService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.pestana.set(this.inicial);
  }

  simular(evento: Event): void {
    this.offlineSync.simularSinConexion((evento.target as HTMLInputElement).checked);
  }
}
