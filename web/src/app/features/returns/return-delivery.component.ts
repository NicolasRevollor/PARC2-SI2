import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViajeDomicilio } from '../../core/models';
import { ETIQUETA_ESTADO, ETIQUETA_FRANJA, ReturnsService } from '../../core/services/returns.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const CLASE_ESTADO: Record<string, string> = {
  Solicitado: 'border-amber-300 text-amber-700',
  Programado: 'border-indigo-300 text-indigo-700',
  Fallido: 'border-rose-300 text-rose-600',
  Completado: 'border-emerald-300 text-emerald-700',
  Cancelado: 'border-gray-300 text-gray-500',
};

function fechaIso(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function manana(): string {
  return fechaIso(1);
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU31] Recoger a domicilio la prenda devuelta
// [CU32] Entregar a domicilio la prenda del cambio
// Boundary: DeliveryUI -> este componente (Devoluciones > Recojos y entregas)
// Control: backend/app/routers/domicilio.py -> services/domicilio.py (ControlDelivery)
// En palabras simples: primero el repartidor RECOGE la prenda que no le quedo al
//   cliente; en la sucursal se revisa (CU3). Si esta bien y es un cambio, recien ahi
//   sale la ENTREGA de la prenda nueva.
// ==================================================================
@Component({
  selector: 'app-return-delivery',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-2 flex-wrap">
        <app-cu-badge cu="CU31" [conNombre]="true"></app-cu-badge>
        <app-cu-badge cu="CU32" [conNombre]="true"></app-cu-badge>
        <app-cu-badge cu="CU35" [conNombre]="true"></app-cu-badge>
        <div class="flex gap-1 ml-auto">
          <button *ngFor="let f of filtros" (click)="cambiarFiltro(f.id)" class="ys-opcion text-xs" [ngClass]="{ 'ys-opcion-activa': filtro() === f.id }">{{ f.etiqueta }}</button>
          <button (click)="cargar()" class="ys-btn-sec py-1 text-xs" title="Actualizar"><span class="material-symbols-outlined text-[16px]">refresh</span></button>
        </div>
      </div>
      <p class="text-xs text-gray-500">Orden: 1) se recoge la prenda devuelta y llega a la sucursal → 2) se inspecciona en la Bandeja (CU3) → 3) si es un cambio aprobado, se entrega la prenda nueva.</p>

      <p *ngIf="!viajes().length" class="text-sm text-gray-400 text-center py-8">No hay viajes {{ filtro() === 'activos' ? 'por hacer' : '' }}.</p>

      <div *ngFor="let v of viajes()" class="ys-tarjeta p-4 space-y-3" data-testid="viaje">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p class="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">{{ v.tipo === 'recojo' ? 'move_to_inbox' : v.tipo === 'pedido' ? 'shopping_bag' : 'local_shipping' }}</span>
              {{ titulos[v.tipo] }} · {{ v.codigo }}
            </p>
            <p class="text-xs text-gray-600">{{ v.cliente }} · {{ v.producto }}
              <span *ngIf="v.tipo === 'recojo'">talla {{ v.tallaOriginal || '—' }}</span>
              <span *ngIf="v.tipo === 'entrega'">→ talla {{ v.tallaNueva || '—' }}</span>
              <span *ngIf="v.tipo === 'pedido'"> · compra en línea</span></p>
            <p class="text-xs text-gray-600">{{ v.direccion }}<span *ngIf="v.referencia"> ({{ v.referencia }})</span> · Tel. {{ v.telefono }}</p>
            <p class="text-[11px] text-gray-400">
              {{ v.sucursal || 'Sin sucursal' }}<span *ngIf="v.tipo !== 'pedido'"> · caso {{ etiquetaEstado(v.estadoCaso) }}</span>
              <span *ngIf="v.fechaPreferida"> · prefiere {{ v.fechaPreferida | date: 'dd/MM' }}</span>
              <span *ngIf="v.franja && !v.fechaProgramada"> por la {{ franja(v.franja) }}</span>
              · delivery {{ v.costo ? 'Bs ' + v.costo.toFixed(2) : 'sin costo' }}
            </p>
          </div>
          <div class="text-right">
            <span class="ys-chip" [ngClass]="clase(v.estado)" data-testid="estado-viaje">{{ v.estado }}</span>
            <p *ngIf="v.fechaProgramada" class="text-[11px] text-gray-600 mt-1">{{ v.fechaProgramada | date: 'EEE dd/MM' }} · {{ franja(v.franja) }} · {{ v.repartidor }}</p>
            <p *ngIf="v.intentos" class="text-[11px] text-rose-600">{{ v.intentos }} intento(s) fallido(s){{ v.observaciones ? ': ' + v.observaciones : '' }}</p>
          </div>
        </div>

        <!-- La entrega solo existe despues de la inspeccion aprobada -->
        <p *ngIf="v.tipo === 'recojo' && v.estado === 'Completado' && v.estadoCaso === 'EnInspeccion'" class="text-xs text-indigo-700">La prenda ya está en la sucursal: inspecciónela en la Bandeja.</p>

        <div *ngIf="puedeOperar && (v.estado === 'Solicitado' || v.estado === 'Programado' || v.estado === 'Fallido')" class="flex gap-2 flex-wrap border-t border-gray-100 pt-3">
          <ng-container *ngIf="editando() === v.idEntrega; else acciones">
            <label><span class="ys-mini block">Fecha</span><input type="date" class="ys-filtro" [(ngModel)]="fecha" [min]="hoy" name="f" /></label>
            <label><span class="ys-mini block">Franja</span>
              <select class="ys-filtro" [(ngModel)]="franjaSel" name="fr"><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></label>
            <label class="flex-1 min-w-[160px]"><span class="ys-mini block">Repartidor</span><input class="ys-filtro w-full" [(ngModel)]="repartidor" name="r" placeholder="Nombre del repartidor" /></label>
            <div class="flex items-end gap-2">
              <button (click)="editando.set(null)" class="ys-btn-sec py-1.5">Volver</button>
              <button (click)="programar(v)" [disabled]="repartidor.trim().length < 3 || !fecha" class="ys-btn py-1.5" data-testid="confirmar-programar">Programar</button>
            </div>
          </ng-container>
          <ng-template #acciones>
            <button (click)="abrirProgramar(v)" class="ys-btn-sec py-1.5" data-testid="programar">
              <span class="material-symbols-outlined text-[16px]">event</span> {{ v.estado === 'Solicitado' ? 'Programar' : 'Reprogramar' }}
            </button>
            <button *ngIf="v.estado !== 'Solicitado'" (click)="completar(v, false)" class="ys-btn py-1.5" data-testid="completar">
              <span class="material-symbols-outlined text-[16px]">task_alt</span> {{ v.tipo === 'recojo' ? 'Prenda recogida' : v.tipo === 'pedido' ? 'Pedido entregado' : 'Prenda entregada' }}
            </button>
            <button *ngIf="v.estado === 'Programado'" (click)="pedirMotivo.set(v)" class="ys-btn-sec py-1.5">No se pudo</button>
            <button (click)="completar(v, true)" class="ys-btn-sec py-1.5" title="El cliente vino a la sucursal">{{ v.tipo === 'recojo' ? 'La trajo a la sucursal' : 'La retiró en la sucursal' }}</button>
            <button *ngIf="v.tipo === 'recojo'" (click)="cancelar(v)" class="ys-btn-sec py-1.5" title="El cliente la llevará a la sucursal; no se cobra el delivery">Cancelar recojo</button>
          </ng-template>
        </div>
      </div>
    </div>

    <div *ngIf="pedirMotivo() as v" class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">No se pudo {{ v.tipo === 'recojo' ? 'recoger' : 'entregar' }}</h3>
        <input class="ys-campo" [(ngModel)]="motivo" name="m" placeholder="No había nadie, dirección incorrecta…" />
        <div class="flex gap-2">
          <button (click)="pedirMotivo.set(null)" class="ys-btn-sec flex-1">Volver</button>
          <button (click)="fallido(v)" [disabled]="motivo.trim().length < 3" class="ys-btn flex-1">Registrar</button>
        </div>
      </div>
    </div>
  `,
})
export class ReturnDeliveryComponent implements OnInit {
  @Input() puedeOperar = false;
  @Output() cambio = new EventEmitter<void>();

  readonly filtros = [
    { id: 'activos', etiqueta: 'Por hacer' },
    { id: 'Completado', etiqueta: 'Hechos' },
    { id: '', etiqueta: 'Todos' },
  ];
  readonly filtro = signal('activos');
  readonly titulos: Record<string, string> = {
    recojo: 'Recoger la prenda devuelta', entrega: 'Entregar la prenda nueva', pedido: 'Entregar la compra en línea',
  };
  readonly viajes = signal<ViajeDomicilio[]>([]);
  readonly editando = signal<number | null>(null);
  readonly pedirMotivo = signal<ViajeDomicilio | null>(null);
  readonly hoy = fechaIso(0);
  fecha = manana();
  franjaSel: 'manana' | 'tarde' = 'manana';
  repartidor = '';
  motivo = '';

  constructor(private returnsService: ReturnsService) {}

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.viajes.set(await this.returnsService.viajes({ estado: this.filtro() || undefined }));
  }

  cambiarFiltro(id: string): void {
    this.filtro.set(id);
    void this.cargar();
  }

  clase(estado: string): string {
    return CLASE_ESTADO[estado] ?? 'border-gray-300 text-gray-500';
  }

  franja(clave: string | null): string {
    return clave ? ETIQUETA_FRANJA[clave] ?? clave : '—';
  }

  etiquetaEstado(estado?: string): string {
    return (estado && ETIQUETA_ESTADO[estado]) || estado || '';
  }

  abrirProgramar(v: ViajeDomicilio): void {
    this.fecha = v.fechaProgramada ?? v.fechaPreferida ?? manana();
    this.franjaSel = v.franja ?? 'manana';
    this.repartidor = v.repartidor ?? '';
    this.editando.set(v.idEntrega);
  }

  private async hecho(r: ViajeDomicilio | null): Promise<void> {
    if (!r) return;
    this.editando.set(null);
    this.pedirMotivo.set(null);
    await this.cargar();
    this.cambio.emit();
  }

  async programar(v: ViajeDomicilio): Promise<void> {
    await this.hecho(await this.returnsService.accionViaje(v.idEntrega, 'programar', { fecha: this.fecha, franja: this.franjaSel, repartidor: this.repartidor }));
  }

  async completar(v: ViajeDomicilio, enSucursal: boolean): Promise<void> {
    await this.hecho(await this.returnsService.accionViaje(v.idEntrega, 'completar', { enSucursal }));
  }

  async fallido(v: ViajeDomicilio): Promise<void> {
    await this.hecho(await this.returnsService.accionViaje(v.idEntrega, 'fallido', { motivo: this.motivo }));
    this.motivo = '';
  }

  async cancelar(v: ViajeDomicilio): Promise<void> {
    if (confirm('¿Cancelar el recojo? El cliente deberá llevar la prenda a la sucursal y no se le cobra el delivery.')) {
      await this.hecho(await this.returnsService.accionViaje(v.idEntrega, 'cancelar'));
    }
  }
}
