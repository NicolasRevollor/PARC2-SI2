import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { EstadoOperacion, OperacionLocal, TipoOperacion } from '../../core/offline-rules';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const ETIQUETA_TIPO: Record<TipoOperacion, string> = {
  venta: 'Venta',
  reserva: 'Reserva',
  cancelar_reserva: 'Cancelación de reserva',
  cambio: 'Cambio',
  custodia: 'Custodia',
  caja_apertura: 'Apertura de caja',
  caja_cierre: 'Cierre de caja',
};

const CLASE_ESTADO: Record<EstadoOperacion, string> = {
  'Registrada localmente': 'border-amber-300 text-amber-700',
  Enviada: 'border-sky-300 text-sky-700',
  Confirmada: 'border-emerald-300 text-emerald-700',
  Rechazada: 'border-rose-300 text-rose-600',
  'En conflicto': 'border-orange-300 text-orange-700',
  Anulada: 'border-gray-300 text-gray-500',
};

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU16] Consultar operaciones pendientes y resultado de sincronizacion
// [CU17] Sincronizar operaciones pendientes ("Sincronizar ahora")
// Boundary: OperacionesPendientesUI -> este componente
// Control: OfflineSyncService.operaciones y sincronizar()
// ==================================================================
@Component({
  selector: 'app-pending-operations',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-2 flex-wrap">
        <app-cu-badge cu="CU16" [conNombre]="true"></app-cu-badge>
        <app-cu-badge cu="CU17" [conNombre]="true"></app-cu-badge>
      </div>

      <div *ngIf="offlineSync.sesionRequerida()" class="ys-tarjeta p-3 text-xs text-amber-700">
        La sesión no se pudo renovar: inicie sesión de nuevo. Sus operaciones siguen guardadas en este dispositivo.
      </div>

      <div class="ys-tarjeta p-3.5 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1"><span class="ys-mini">Tipo</span>
          <select [ngModel]="tipo()" (ngModelChange)="tipo.set($event)" name="tipoOp" class="ys-filtro"><option value="">Todos</option>
            <option *ngFor="let t of tipos" [value]="t[0]">{{ t[1] }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Estado</span>
          <select [ngModel]="estado()" (ngModelChange)="estado.set($event)" name="estadoOp" class="ys-filtro"><option value="">Todos</option>
            <option *ngFor="let e of estados" [value]="e">{{ e }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Fecha</span>
          <input type="date" [ngModel]="fecha()" (ngModelChange)="fecha.set($event)" name="fechaOp" class="ys-filtro" /></div>
        <button (click)="offlineSync.sincronizar()" [disabled]="!offlineSync.enLinea() || offlineSync.sincronizando()" class="ys-btn ml-auto">
          <span class="material-symbols-outlined text-[16px]">sync</span>
          {{ offlineSync.sincronizando() ? 'Sincronizando…' : 'Sincronizar ahora' }}
        </button>
      </div>

      <p *ngIf="!filtradas().length" class="text-sm text-gray-400 py-6 text-center" data-testid="sin-operaciones">No hay operaciones pendientes.</p>

      <div *ngIf="filtradas().length" class="ys-tarjeta overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left ys-mini border-b border-gray-100">
              <th class="px-4 py-3">Tipo</th><th class="px-4 py-3">UUID</th><th class="px-4 py-3">Fecha y hora</th>
              <th class="px-4 py-3 text-right">Total</th><th class="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let op of filtradas()" (click)="elegida.set(op)" class="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
              <td class="px-4 py-2.5 text-gray-900">{{ etiqueta(op.tipo) }}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-gray-500">{{ op.uuidOperacion.slice(0, 8) }}</td>
              <td class="px-4 py-2.5 text-gray-600">{{ op.fechaOperacion | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td class="px-4 py-2.5 text-right text-gray-900">Bs {{ op.total.toFixed(2) }}</td>
              <td class="px-4 py-2.5"><span class="ys-chip" [ngClass]="clase(op.estado)" data-testid="estado-operacion">{{ op.estado }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="elegida() as op" class="ys-modal">
      <div class="ys-modal-caja max-w-lg ys-tarjeta space-y-2 text-xs text-gray-700">
        <h2 class="text-base font-bold text-gray-900">{{ etiqueta(op.tipo) }} · {{ op.estado }}</h2>
        <p>{{ op.resumen }}</p>
        <p class="font-mono text-[11px] break-all text-gray-500">{{ op.uuidOperacion }}</p>
        <p>Intentos de envío: <b>{{ op.intentos }}</b></p>
        <p>Último intento: <b>{{ op.ultimoIntento ? (op.ultimoIntento | date: 'dd/MM/yyyy HH:mm:ss') : '—' }}</b></p>
        <p>Identificador en el servidor: <b>{{ op.idServidor ?? '—' }}</b></p>
        <p *ngIf="op.motivo">Motivo: <b class="text-rose-600">{{ op.motivo }}</b></p>
        <div class="flex gap-2 pt-2">
          <button *ngIf="op.estado === 'En conflicto' && puedeResolver()" (click)="abrirConflictos(op)" class="ys-btn flex-1">Resolver conflicto (CU18)</button>
          <button (click)="elegida.set(null)" class="ys-btn-sec flex-1">Cerrar</button>
        </div>
      </div>
    </div>
  `,
})
export class PendingOperationsComponent {
  @Output() irConflictos = new EventEmitter<void>();

  readonly tipos = Object.entries(ETIQUETA_TIPO);
  readonly estados = Object.keys(CLASE_ESTADO);
  readonly tipo = signal('');
  readonly estado = signal('');
  readonly fecha = signal('');
  readonly elegida = signal<OperacionLocal | null>(null);

  readonly filtradas = computed(() =>
    this.offlineSync.operaciones().filter(
      o =>
        (!this.tipo() || o.tipo === this.tipo()) &&
        (!this.estado() || o.estado === this.estado()) &&
        (!this.fecha() || o.fechaOperacion.startsWith(this.fecha())),
    ),
  );
  readonly puedeResolver = computed(() => this.authService.currentUser()?.permisos.includes('sync.resolver') ?? false);

  constructor(
    public offlineSync: OfflineSyncService,
    private authService: AuthService,
  ) {}

  etiqueta(tipo: TipoOperacion): string {
    return ETIQUETA_TIPO[tipo];
  }

  clase(estado: EstadoOperacion): string {
    return CLASE_ESTADO[estado];
  }

  abrirConflictos(_op: OperacionLocal): void {
    this.elegida.set(null);
    this.irConflictos.emit();
  }
}
