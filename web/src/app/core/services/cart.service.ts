import { Injectable, computed, signal } from '@angular/core';
import { CartLine, ProductOut } from '../models';

// Tope compartido entre el carrito y el selector de cantidad del detalle de
// producto (CU16 D2): una sola constante evita dos literales `10` que
// podrían desincronizarse. El servidor sigue siendo la fuente de verdad del
// stock real (POST /api/payments/intents y POST /api/sales).
export const CANTIDAD_MAXIMA_LINEA = 10;

/**
 * Carrito de compras del cliente (CU16): estado en memoria, exclusivo de la
 * sesión del navegador. NUNCA se persiste — ni a `localStorage` ni al
 * backend (Requirement "Session-Only Cart State") — y se vacía por completo
 * al recargar la página, porque es un signal en memoria de un servicio
 * `providedIn: 'root'`.
 */
@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly lineasSignal = signal<CartLine[]>([]);
  private readonly panelAbiertoSignal = signal<boolean>(false);

  public lineas = this.lineasSignal.asReadonly();
  public panelAbierto = this.panelAbiertoSignal.asReadonly();

  // Badge del shell (Requirement "Cart Visibility — Badge and Review").
  public cantidadTotal = computed(() =>
    this.lineasSignal().reduce((total, linea) => total + linea.cantidad, 0)
  );

  // Solo indicativo para la UI: el servidor recalcula el total real a partir
  // de `Producto.venta` en `create_payment_intent`/`create_sale`.
  public totalIndicativo = computed(() =>
    this.lineasSignal().reduce((total, linea) => total + linea.producto.venta * linea.cantidad, 0)
  );

  // Requirement "Add Product to Cart with Quantity Merge": si el producto ya
  // tiene línea, suma la cantidad en vez de duplicar la línea.
  agregar(producto: ProductOut, cantidad: number): void {
    this.lineasSignal.update(lineas => {
      const existente = lineas.find(linea => linea.producto.idProducto === producto.idProducto);
      if (existente) {
        const cantidadFinal = Math.min(existente.cantidad + cantidad, CANTIDAD_MAXIMA_LINEA);
        return lineas.map(linea =>
          linea.producto.idProducto === producto.idProducto
            ? { ...linea, cantidad: cantidadFinal }
            : linea
        );
      }
      const cantidadInicial = Math.min(Math.max(cantidad, 1), CANTIDAD_MAXIMA_LINEA);
      return [...lineas, { producto, cantidad: cantidadInicial }];
    });
  }

  // Requirement "Update or Remove a Cart Line": cantidad <= 0 quita la línea.
  actualizarCantidad(idProducto: number, cantidad: number): void {
    if (cantidad <= 0) {
      this.quitar(idProducto);
      return;
    }
    const cantidadFinal = Math.min(cantidad, CANTIDAD_MAXIMA_LINEA);
    this.lineasSignal.update(lineas =>
      lineas.map(linea =>
        linea.producto.idProducto === idProducto ? { ...linea, cantidad: cantidadFinal } : linea
      )
    );
  }

  quitar(idProducto: number): void {
    this.lineasSignal.update(lineas =>
      lineas.filter(linea => linea.producto.idProducto !== idProducto)
    );
  }

  // Requirement "Cart Checkout of All Lines": solo se llama desde el
  // handler `(completada)` del modal de compra, nunca al cerrar/cancelar.
  vaciar(): void {
    this.lineasSignal.set([]);
  }

  abrirPanel(): void {
    this.panelAbiertoSignal.set(true);
  }

  cerrarPanel(): void {
    this.panelAbiertoSignal.set(false);
  }
}
