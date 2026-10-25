import { Component, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ESTADOS_ABIERTOS, ReturnsService, textoPlazo } from '../../core/services/returns.service';
import { DevolucionOut, PoliticaDevolucion } from '../../core/models';
import { ReturnNewComponent } from './return-new.component';
import { ReturnTrayComponent } from './return-tray.component';
import { ReturnHistoryComponent } from './return-history.component';
import { CreditNotesComponent } from './credit-notes.component';
import { ReturnRefundsComponent } from './return-refunds.component';
import { ReturnInventoryComponent } from './return-inventory.component';
import { ReturnPolicyComponent } from './return-policy.component';

type Pestana = 'bandeja' | 'historial' | 'notas' | 'reembolsos' | 'inventario' | 'politica';

/**
 * Módulo "Devoluciones y Cambios" (CU1–CU11 de docs/iconix/2do parcial SI2.md).
 *
 * Las reglas no se calculan acá: el backend valida cada paso contra la
 * política vigente de la venta. Esta pantalla organiza el trabajo: nueva
 * solicitud (CU1), bandeja de casos abiertos (CU2/CU3/CU8 y resolución
 * CU4–CU7), historial y análisis (CU11), notas de crédito (CU7), reembolsos
 * pendientes (CU6), inventario devuelto (CU10) y política (CU9).
 */
@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [
    CommonModule,
    ReturnNewComponent,
    ReturnTrayComponent,
    ReturnHistoryComponent,
    CreditNotesComponent,
    ReturnRefundsComponent,
    ReturnInventoryComponent,
    ReturnPolicyComponent,
  ],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Devoluciones y Cambios</h1>
          <p class="text-xs text-gray-500 mt-1">
            Plazo de cambio de {{ plazo() }} y garantía de {{ politica()?.plazoGarantiaDias ?? 30 }} días por defecto de fábrica
            ({{ politica()?.version ? 'política v' + politica()!.version : 'política de la plataforma' }}).
          </p>
        </div>
        <button *ngIf="puede('devolucion.registrar')" (click)="mostrarNueva.set(true)" class="ys-btn py-2.5">
          <span class="material-symbols-outlined text-[18px]">add</span> Nueva solicitud
        </button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button (click)="irBandeja()" class="ys-tarjeta p-4 text-left cursor-pointer hover:border-indigo-200">
          <p class="ys-mini">Casos abiertos</p><p class="text-2xl font-bold text-gray-900">{{ abiertos().length }}</p>
          <p class="text-[11px] text-gray-500">{{ contar('PendienteEntrega') }} por entregar · {{ contar('EnInspeccion') }} en inspección</p>
        </button>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Por resolver</p><p class="text-2xl font-bold text-gray-900">{{ contar('Aprobada') }}</p>
          <p class="text-[11px] text-gray-500">{{ contar('EnRevision') }} en revisión del Administrador</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Cambios pendientes</p><p class="text-2xl font-bold" [ngClass]="contar('CambioPendiente') ? 'text-amber-700' : 'text-gray-900'">{{ contar('CambioPendiente') }}</p>
          <p class="text-[11px] text-gray-500">Esperando stock o retiro</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Por autorizar</p><p class="text-2xl font-bold" [ngClass]="porAutorizar() ? 'text-amber-700' : 'text-gray-900'">{{ porAutorizar() }}</p>
          <p class="text-[11px] text-gray-500">Montos sobre el umbral o límite mensual</p></div>
      </div>

      <div class="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        <button *ngFor="let t of pestanas()" (click)="pestana.set(t.id)"
                class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 bg-transparent whitespace-nowrap"
                [ngClass]="pestana() === t.id ? 'text-indigo-600 border-indigo-600' : 'text-gray-500 border-transparent hover:text-gray-900'">
          <span class="material-symbols-outlined text-[16px]">{{ t.icono }}</span> {{ t.etiqueta }}
        </button>
      </div>

      <app-return-tray #bandeja *ngIf="pestana() === 'bandeja'" [politica]="politica()" (cambio)="refrescar()"></app-return-tray>
      <app-return-history *ngIf="pestana() === 'historial'"></app-return-history>
      <app-credit-notes *ngIf="pestana() === 'notas'" [esAdmin]="puede('tenant.admin')"></app-credit-notes>
      <app-return-refunds *ngIf="pestana() === 'reembolsos'" (cambio)="refrescar()"></app-return-refunds>
      <app-return-inventory *ngIf="pestana() === 'inventario'" [puedeGestionar]="puede('devolucion.inspeccionar')"></app-return-inventory>
      <app-return-policy *ngIf="pestana() === 'politica'" [politica]="politica()" [editable]="puede('tenant.admin')"
                         (guardada)="politica.set($event)"></app-return-policy>
    </div>

    <app-return-new *ngIf="mostrarNueva()" (cerrar)="mostrarNueva.set(false)" (creados)="creados($event)"></app-return-new>
  `,
})
export class ReturnsComponent implements OnInit {
  @ViewChild('bandeja') bandeja?: ReturnTrayComponent;

  readonly pestana = signal<Pestana>('bandeja');
  readonly politica = signal<PoliticaDevolucion | null>(null);
  readonly abiertos = signal<DevolucionOut[]>([]);
  readonly mostrarNueva = signal<boolean>(false);

  readonly plazo = computed(() => textoPlazo(this.politica()?.plazoCambioHoras ?? 24));
  readonly porAutorizar = computed(() => this.abiertos().filter((c) => c.requiereAutorizacion && !c.autorizador_nombre).length);

  readonly pestanas = computed(() => [
    { id: 'bandeja' as Pestana, etiqueta: 'Bandeja', icono: 'inbox' },
    { id: 'historial' as Pestana, etiqueta: 'Historial y análisis', icono: 'query_stats' },
    { id: 'notas' as Pestana, etiqueta: 'Notas de crédito', icono: 'receipt_long' },
    { id: 'reembolsos' as Pestana, etiqueta: 'Reembolsos pendientes', icono: 'currency_exchange' },
    { id: 'inventario' as Pestana, etiqueta: 'Inventario devuelto', icono: 'inventory_2' },
    { id: 'politica' as Pestana, etiqueta: 'Política', icono: 'policy' },
  ]);

  constructor(
    private returnsService: ReturnsService,
    private authService: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.cargarPolitica(), this.refrescar()]);
  }

  puede(permiso: string): boolean {
    return this.authService.currentUser()?.permisos.includes(permiso) ?? false;
  }

  contar(estado: string): number {
    return this.abiertos().filter((c) => c.estado === estado).length;
  }

  private async cargarPolitica(): Promise<void> {
    this.politica.set(await this.returnsService.politica());
  }

  async refrescar(): Promise<void> {
    this.abiertos.set(await this.returnsService.consultar({ estado: ESTADOS_ABIERTOS }));
  }

  irBandeja(): void {
    this.pestana.set('bandeja');
  }

  /** CU1 paso 7: registrada la solicitud, se deriva a la inspección (CU3). */
  async creados(casos: DevolucionOut[]): Promise<void> {
    this.mostrarNueva.set(false);
    this.pestana.set('bandeja');
    await this.refrescar();
    await this.bandeja?.cargar();
    if (casos.length && this.puede('devolucion.inspeccionar')) this.bandeja?.abrirExterno(casos[0], 'inspeccionar');
  }
}
