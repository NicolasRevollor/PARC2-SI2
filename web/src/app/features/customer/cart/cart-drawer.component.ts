import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../../../core/services/cart.service';

/**
 * Panel de revisión del carrito (CU16): overlay consistente con los demás
 * modales de la app (`fixed inset-0 z-50`). Lee y modifica `CartService`
 * directamente (como `archiveService`/`authService` en otros componentes)
 * porque es un consumidor exclusivo del carrito, no un componente
 * presentacional genérico. "Finalizar compra" solo emite un evento: el
 * host (`catalog.component.ts`) es quien toma la foto de `lineas()` antes de
 * abrir el modal de pago (D3 — snapshot congelado, nunca el carrito vivo).
 */
@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="cartService.panelAbierto()"
      class="fixed inset-0 z-50 flex items-center justify-end bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      (click)="cartService.cerrarPanel()"
    >
      <div
        class="bg-white w-full max-w-sm h-full shadow-xl flex flex-col"
        (click)="$event.stopPropagation()"
      >
        <div class="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Carrito</span>
            <h2 class="text-base font-bold text-gray-900 mt-0.5 leading-snug">Mi carrito</h2>
          </div>
          <button
            (click)="cartService.cerrarPanel()"
            class="w-8 h-8 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-gray-900 hover:text-white transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p class="px-5 pt-3 text-[11px] text-amber-700 bg-amber-50 border-y border-amber-100 py-2">
          Este carrito es temporal: se vacía al recargar la página.
        </p>

        <div class="flex-1 overflow-y-auto p-5 space-y-3">
          <div *ngIf="cartService.lineas().length === 0" class="text-center py-12 text-gray-400 text-sm">
            El carrito está vacío.
          </div>

          <div
            *ngFor="let linea of cartService.lineas()"
            class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200"
          >
            <img
              [src]="linea.producto.imagen_url || 'https://images.unsplash.com/photo-1544441893-675973e31985?w=200'"
              [alt]="linea.producto.nombre"
              class="w-14 h-14 rounded-lg object-cover border border-gray-200 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-gray-900 truncate">{{ linea.producto.nombre }}</p>
              <p class="text-[11px] text-gray-500">{{ linea.producto.venta.toLocaleString() }} Bs c/u</p>
              <p class="text-[11px] font-semibold text-indigo-600 mt-0.5">
                Subtotal: {{ (linea.producto.venta * linea.cantidad).toLocaleString() }} Bs
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                (click)="cartService.actualizarCantidad(linea.producto.idProducto, linea.cantidad - 1)"
                class="w-6 h-6 rounded border border-gray-200 text-gray-600 hover:bg-white cursor-pointer text-xs"
              >−</button>
              <span class="w-6 text-center text-xs font-bold text-gray-900">{{ linea.cantidad }}</span>
              <button
                type="button"
                (click)="cartService.actualizarCantidad(linea.producto.idProducto, linea.cantidad + 1)"
                class="w-6 h-6 rounded border border-gray-200 text-gray-600 hover:bg-white cursor-pointer text-xs"
              >+</button>
            </div>
            <button
              type="button"
              (click)="cartService.quitar(linea.producto.idProducto)"
              class="text-[11px] font-bold uppercase tracking-wide text-rose-600 hover:text-rose-800 cursor-pointer shrink-0"
            >
              Quitar
            </button>
          </div>
        </div>

        <div class="p-5 border-t border-gray-100 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wide text-gray-500">Total</span>
            <span class="text-base font-bold text-gray-900">{{ cartService.totalIndicativo().toLocaleString() }} Bs</span>
          </div>
          <button
            type="button"
            (click)="cartService.vaciar()"
            [disabled]="cartService.lineas().length === 0"
            class="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Vaciar carrito
          </button>
          <button
            type="button"
            (click)="finalizarCompra.emit()"
            [disabled]="cartService.lineas().length === 0"
            class="w-full px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Finalizar compra
          </button>
        </div>
      </div>
    </div>
  `
})
export class CartDrawerComponent {
  @Output() finalizarCompra = new EventEmitter<void>();

  constructor(public cartService: CartService) {}
}
