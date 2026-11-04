import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ReciboProvisional {
  titulo: string;
  uuid: string;
  fecha: string;
  cliente: string;
  lineas: { detalle: string; importe: number }[];
  total: number;
  extras: { etiqueta: string; valor: string }[];
  leyenda: string;
}

/** [CU14] paso 8, [CU15] paso 7, [CU19] paso 6: comprobante provisional. */
@Component({
  selector: 'app-provisional-receipt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-3">
        <div class="text-center">
          <p class="ys-mini">Comprobante provisional</p>
          <h2 class="text-lg font-bold text-gray-900">{{ recibo.titulo }}</h2>
          <p class="text-[11px] text-gray-500">{{ recibo.fecha | date: 'dd/MM/yyyy HH:mm' }}</p>
        </div>
        <p class="text-xs text-gray-700">Cliente: <b>{{ recibo.cliente }}</b></p>
        <div class="border-y border-gray-100 py-2 space-y-1">
          <p *ngFor="let l of recibo.lineas" class="flex justify-between text-xs text-gray-700">
            <span>{{ l.detalle }}</span><span>Bs {{ l.importe.toFixed(2) }}</span>
          </p>
        </div>
        <p class="flex justify-between text-sm font-bold text-gray-900"><span>Total</span><span>Bs {{ recibo.total.toFixed(2) }}</span></p>
        <p *ngFor="let e of recibo.extras" class="flex justify-between text-xs text-gray-600"><span>{{ e.etiqueta }}</span><span>{{ e.valor }}</span></p>
        <p class="text-[10px] font-mono text-gray-400 break-all">Operación {{ recibo.uuid }}</p>
        <p class="text-xs font-bold text-amber-700 text-center">{{ recibo.leyenda }}</p>
        <div class="flex gap-2">
          <button (click)="imprimir()" class="ys-btn-sec flex-1"><span class="material-symbols-outlined text-[16px]">print</span> Imprimir</button>
          <button (click)="cerrar.emit()" class="ys-btn flex-1">Listo</button>
        </div>
      </div>
    </div>
  `,
})
export class ProvisionalReceiptComponent {
  @Input({ required: true }) recibo!: ReciboProvisional;
  @Output() cerrar = new EventEmitter<void>();

  imprimir(): void {
    window.print();
  }
}
