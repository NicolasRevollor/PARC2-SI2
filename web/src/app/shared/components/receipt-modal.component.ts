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
      class="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-xs flex items-center justify-center p-4"
      (click)="cerrar.emit()"
    >
      <div
        class="bg-white rounded-xl shadow-2xl w-full max-w-md space-y-4 receipt-print"
        (click)="$event.stopPropagation()"
      >
        <div class="p-6 space-y-4">
          <div class="text-center border-b border-dashed border-gray-300 pb-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">YouShop</p>
            <h3 class="text-base font-bold text-gray-900 mt-1">Comprobante de Venta</h3>
            <p class="text-xs text-gray-500 mt-1">N.º de comprobante: {{ venta.idVenta }}</p>
            <p class="text-xs text-gray-500">{{ venta.fecha }}</p>
          </div>

          <div class="text-xs text-gray-600 space-y-1">
            <p><span class="font-semibold text-gray-800">Cliente:</span> {{ clienteNombre || ('Cliente #' + venta.idCliente) }}</p>
            <p><span class="font-semibold text-gray-800">Modalidad de pago:</span> {{ modalidad }}</p>
          </div>

          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
                <th class="py-1.5">Producto</th>
                <th class="py-1.5 text-center">Cant.</th>
                <th class="py-1.5 text-right">P. Unit.</th>
                <th class="py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of venta.detalles" class="border-b border-gray-50">
                <td class="py-1.5">{{ d.producto_nombre || ('Producto #' + d.idProducto) }}</td>
                <td class="py-1.5 text-center">{{ d.cantidad }}</td>
                <td class="py-1.5 text-right">Bs {{ d.precio_unitario.toFixed(2) }}</td>
                <td class="py-1.5 text-right">Bs {{ (d.precio_unitario * d.cantidad).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="border-t border-dashed border-gray-300 pt-3 flex items-center justify-between">
            <span class="text-sm font-bold text-gray-900 uppercase tracking-wide">Total</span>
            <span class="text-lg font-bold text-indigo-600">Bs {{ venta.total.toFixed(2) }}</span>
          </div>
        </div>

        <div class="p-4 pt-0 flex items-center justify-end gap-2 print:hidden">
          <button
            (click)="cerrar.emit()"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Nueva venta
          </button>
          <button
            (click)="imprimir()"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer"
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
