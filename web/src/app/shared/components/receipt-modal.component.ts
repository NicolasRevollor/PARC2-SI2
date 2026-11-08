import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Venta } from '../../core/models';

/**
 * Comprobante de venta, puramente presentacional. Renderiza SOLO datos ya
 * confirmados por el servidor (`VentaOut` + `DetalleVenta[]`): nunca el
 * subtotal indicativo del ticket en memoria. `idVenta` funciona como el
 * número de comprobante (Requirement "Receipt Rendering from Server Data").
 */
@Component({
  selector: 'app-receipt-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      (click)="cerrar.emit()"
    >
      <div
        class="bg-white rounded-xl shadow-2xl w-full max-w-md space-y-4 receipt-print"
        (click)="$event.stopPropagation()"
      >
        <div class="p-6 space-y-4">
          <div class="text-center border-b border-dashed border-slate-300 pb-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-violet-600">YouShop</p>
            <h3 class="text-base font-bold text-slate-900 mt-1">Comprobante de Venta</h3>
            <p class="text-xs text-slate-500 mt-1">N.º de comprobante: {{ venta.idVenta }}</p>
            <p class="text-xs text-slate-500">{{ venta.fecha }}</p>
          </div>

          <div class="text-xs text-slate-600 space-y-1">
            <p><span class="font-semibold text-slate-800">Cliente:</span> {{ clienteNombre || ('Cliente #' + venta.idCliente) }}</p>
            <p><span class="font-semibold text-slate-800">Modalidad de pago:</span> {{ modalidad }}</p>
          </div>

          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                <th class="py-1.5">Producto</th>
                <th class="py-1.5 text-center">Cant.</th>
                <th class="py-1.5 text-right">P. Unit.</th>
                <th class="py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of venta.detalles" class="border-b border-slate-50">
                <td class="py-1.5">{{ d.producto_nombre || ('Producto #' + d.idProducto) }}</td>
                <td class="py-1.5 text-center">{{ d.cantidad }}</td>
                <td class="py-1.5 text-right">Bs {{ d.precio_unitario.toFixed(2) }}</td>
                <td class="py-1.5 text-right">Bs {{ (d.precio_unitario * d.cantidad).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- [CU33] -->
          <p *ngIf="venta.cuponUsado as c" class="text-xs text-emerald-700 flex justify-between">
            <span>Cupón {{ c.codigo }} ({{ c.porcentaje }}%)</span><span>− Bs {{ c.descuento.toFixed(2) }}</span>
          </p>
          <div class="border-t border-dashed border-slate-300 pt-3 flex items-center justify-between">
            <span class="text-sm font-bold text-slate-900 uppercase tracking-wide">Total</span>
            <span class="text-lg font-bold text-violet-600">Bs {{ venta.total.toFixed(2) }}</span>
          </div>
          <p *ngIf="venta.envio as e" class="text-xs text-indigo-700 border border-indigo-200 rounded-lg p-2" data-testid="envio-recibo">
            Envío a domicilio (Bs {{ e.costo.toFixed(2) }}) a {{ e.direccion }}. Le avisamos el día en que sale con el repartidor.
          </p>
          <p *ngIf="venta.cuponGanado as g" class="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg p-2 text-center" data-testid="cupon-ganado">
            ¡Ganó un cupón del {{ g.porcentaje }}%! Código {{ g.codigo }}, válido hasta el {{ g.vence | date: 'dd/MM/yyyy' }} en su próxima compra.
          </p>
        </div>

        <div class="p-4 pt-0 flex items-center justify-end gap-2 print:hidden">
          <button
            (click)="cerrar.emit()"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Nueva venta
          </button>
          <button
            (click)="imprimir()"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-violet-600 hover:bg-violet-700 transition-colors cursor-pointer"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  `
})
export class ReceiptModalComponent {
  @Input({ required: true }) venta!: Venta;
  @Input() clienteNombre: string | null = null;
  @Input() modalidad = '';
  @Output() cerrar = new EventEmitter<void>();

  imprimir(): void {
    window.print();
  }
}
