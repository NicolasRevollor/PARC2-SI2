import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotaDevolucion } from '../../core/models';
import { ReturnsService } from '../../core/services/returns.service';
import { CuBadgeComponent } from './cu-badge.component';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU7] Emitir nota de devolucion
// Boundary: NotaDevolucionUI -> este componente (modal)
// Controles: GenerarNotaDevolucion -> GET /api/returns/{id}/nota-devolucion
//            ExportarNotaDevolucion -> GET /api/returns/{id}/nota-devolucion.pdf
// En palabras simples: muestra QUE devolvio el cliente (prendas, motivo, estado en que
//   llegaron), cuanto valian, que se desconto y CUANTO DINERO se le devolvio y como.
// ==================================================================
@Component({
  selector: 'app-nota-devolucion',
  standalone: true,
  imports: [CommonModule, CuBadgeComponent],
  template: `
    <div class="ys-modal" (click)="cerrar.emit()">
      <div class="ys-modal-caja max-w-lg ys-tarjeta space-y-4" (click)="$event.stopPropagation()" data-testid="nota-devolucion">
        <p *ngIf="cargando()" class="text-sm text-gray-500">Generando la nota…</p>
        <ng-container *ngIf="nota() as n">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="ys-mini">{{ n.empresa }}</p>
              <h3 class="text-lg font-bold text-gray-900">Nota de devolución {{ n.numero }}</h3>
              <app-cu-badge cu="CU7"></app-cu-badge>
              <p class="text-[11px] text-gray-500 mt-1">{{ n.fechaEmision | date: 'dd/MM/yyyy HH:mm' }} · {{ n.tipo }} · {{ n.sucursal || '—' }}</p>
              <p class="text-[11px] text-gray-500">Cliente: {{ n.cliente || '—' }} · Atendió: {{ n.atendidoPor || '—' }} · Venta #{{ n.venta.idVenta }}</p>
            </div>
            <button (click)="cerrar.emit()" class="text-gray-400 hover:text-gray-900 bg-transparent cursor-pointer"><span class="material-symbols-outlined">close</span></button>
          </div>

          <div>
            <p class="ys-mini mb-1">Lo que devolvió</p>
            <div *ngFor="let p of n.prendasDevueltas" class="flex justify-between gap-3 text-xs border-b border-gray-100 py-1.5">
              <div>
                <p class="text-gray-900 font-semibold">{{ p.producto }} · talla {{ p.talla || '—' }} {{ p.color || '' }} × {{ p.cantidad }}</p>
                <p class="text-gray-500">{{ p.motivo }} · {{ p.estadoAlRecibirla }}</p>
              </div>
              <p class="text-gray-900 tabular-nums">Bs {{ p.subtotal | number: '1.2-2' }}</p>
            </div>
            <p *ngIf="n.recogidaADomicilio as r" class="text-[11px] text-gray-500 mt-1">
              Recogida a domicilio el {{ r.fecha | date: 'dd/MM/yyyy' }} por {{ r.repartidor || '—' }}.
            </p>
          </div>

          <table class="w-full text-xs">
            <tr><td class="py-0.5 text-gray-600">Valor de las prendas</td><td class="text-right tabular-nums">Bs {{ n.valorPrendas | number: '1.2-2' }}</td></tr>
            <tr *ngFor="let d of n.descuentos"><td class="py-0.5 text-gray-600">− {{ d.concepto }}</td><td class="text-right tabular-nums">Bs {{ d.monto | number: '1.2-2' }}</td></tr>
            <tr class="border-t border-gray-200"><td class="py-0.5 text-gray-900 font-semibold">Valor a su favor</td><td class="text-right tabular-nums font-semibold">Bs {{ n.valorAFavor | number: '1.2-2' }}</td></tr>
            <tr *ngIf="n.prendaEntregada as e"><td class="py-0.5 text-gray-600">− Se llevó {{ e.producto }} talla {{ e.talla || '—' }}</td><td class="text-right tabular-nums">Bs {{ e.valor | number: '1.2-2' }}</td></tr>
          </table>

          <div class="p-3 rounded-lg border border-emerald-300">
            <p class="ys-mini">Dinero devuelto</p>
            <p class="text-2xl font-bold text-emerald-700 tabular-nums" data-testid="monto-nota">Bs {{ n.montoDevuelto | number: '1.2-2' }}</p>
            <p class="text-xs text-gray-600">{{ n.medio }} · {{ n.estadoReembolso }}<span *ngIf="n.referencia"> · Ref. {{ n.referencia }}</span></p>
          </div>

          <div class="flex gap-2">
            <button (click)="cerrar.emit()" class="ys-btn-sec flex-1">Cerrar</button>
            <button (click)="returnsService.abrirNotaPdf(idDevolucion)" class="ys-btn flex-1"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Descargar PDF</button>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class NotaDevolucionComponent implements OnInit {
  @Input({ required: true }) idDevolucion!: number;
  @Output() cerrar = new EventEmitter<void>();
  readonly nota = signal<NotaDevolucion | null>(null);
  readonly cargando = signal(true);

  constructor(public returnsService: ReturnsService) {}

  async ngOnInit(): Promise<void> {
    const n = await this.returnsService.notaDevolucion(this.idDevolucion);
    this.cargando.set(false);
    if (n) this.nota.set(n);
    else this.cerrar.emit();
  }
}
