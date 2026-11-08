import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { CartLine, Venta } from '../../../core/models';
import { PaymentsService } from '../../../core/services/payments.service';
import { SalesService } from '../../../core/services/sales.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CardPaymentComponent } from '../../../shared/components/card-payment.component';
import { ReceiptModalComponent } from '../../../shared/components/receipt-modal.component';
import { CuponSelectorComponent } from '../../../shared/components/cupon-selector.component';
import { CuBadgeComponent } from '../../../shared/components/cu-badge.component';
import { FormsModule } from '@angular/forms';

// [CU33] 'resumen': total de la compra y cupon a usar, antes de cobrar.
type EstadoCompra = 'resumen' | 'iniciando' | 'cobrando' | 'cobrado_sin_venta' | 'comprado' | 'error';

/**
 * Checkout de compra digital (CU17/CU18, generalizado por CU16 a una o mas
 * lineas): pago SOLO con tarjeta via Stripe (Requirement "Card-Only
 * Modality"). Replica la maquina de estados de `pos.component.ts` — el pago
 * SIEMPRE se obtiene antes de `POST /api/sales`, y si la venta falla despues
 * de un cobro verificado, el `idMetPago` se retiene para reintentar sin
 * cobrar dos veces (Requirement "Charge Preserved on Sale Failure"). Nunca
 * envia `idCliente` ni `codigoSucursal`: el backend los deriva/resuelve
 * (D2/D4 en design.md).
 *
 * `lineas` es una FOTO congelada tomada por el host cuando arranca el
 * checkout (CU16 D3): este componente nunca lee `CartService` en vivo, asi
 * que vaciar o editar el carrito despues de abrir el modal no puede mutar
 * un cobro en curso ni vaciar el encabezado del comprobante. "Comprar
 * ahora" pasa exactamente el mismo tipo de dato — un arreglo de una sola
 * linea — por este mismo camino (Requirement "Buy-Now Remains Independent
 * of the Cart").
 */
@Component({
  selector: 'app-purchase-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CardPaymentComponent, ReceiptModalComponent, CuponSelectorComponent, CuBadgeComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        *ngIf="estado() !== 'comprado'"
        class="bg-[#18191d] max-w-md w-full rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col"
      >
        <div class="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Comprar ahora</span>
            <h2 class="text-base font-bold text-gray-900 mt-0.5 leading-snug">{{ tituloCompra() }}</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ subtituloCantidad() }}</p>
          </div>
          <button
            *ngIf="estado() !== 'cobrado_sin_venta'"
            (click)="cerrar.emit()"
            class="w-8 h-8 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-black hover:text-white transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div class="p-5 space-y-4">
          <!-- [CU33] Resumen: total y cupon antes de cobrar -->
          <div *ngIf="estado() === 'resumen'" class="space-y-3">
            <app-cupon-selector [items]="items" (cambio)="onCupon($event)"></app-cupon-selector>

            <!-- [CU35] retiro en sucursal o envio a domicilio -->
            <div *ngIf="costoEnvio() !== null" class="rounded-xl border border-gray-200 p-3 space-y-2" data-testid="entrega">
              <div class="flex items-center justify-between">
                <p class="text-xs font-bold text-gray-900">¿Cómo la recibís?</p>
                <app-cu-badge cu="CU35"></app-cu-badge>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" (click)="conEnvio.set(false)" class="ys-opcion text-xs" [class.ys-opcion-activa]="!conEnvio()">Retiro en sucursal</button>
                <button type="button" (click)="conEnvio.set(true)" class="ys-opcion text-xs" [class.ys-opcion-activa]="conEnvio()" data-testid="elegir-envio">
                  Envío a domicilio (+Bs {{ costoEnvio()!.toFixed(2) }})</button>
              </div>
              <div *ngIf="conEnvio()" class="space-y-2">
                <input class="ys-campo mt-0 text-xs" [(ngModel)]="entrega.direccion" name="dir" placeholder="Dirección (calle, número, zona)" data-testid="direccion-envio" />
                <div class="grid grid-cols-2 gap-2">
                  <input class="ys-campo mt-0 text-xs" [(ngModel)]="entrega.telefono" name="tel" placeholder="Teléfono" data-testid="telefono-envio" />
                  <select class="ys-campo mt-0 text-xs" [(ngModel)]="entrega.franja" name="fr"><option value="manana">Mañana (9 a 13)</option><option value="tarde">Tarde (14 a 19)</option></select>
                </div>
                <input class="ys-campo mt-0 text-xs" [(ngModel)]="entrega.referencia" name="ref" placeholder="Referencia (opcional)" />
              </div>
            </div>

            <p class="flex justify-between text-sm font-bold text-gray-900"><span>Total</span><span data-testid="total-compra">Bs {{ totalFinal()?.toFixed(2) ?? '…' }}</span></p>
            <button (click)="iniciarCobro()" [disabled]="totalAPagar() === null || !entregaValida()"
                    class="w-full px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
                    data-testid="pagar">Pagar con tarjeta</button>
          </div>

          <!-- Preparando el cobro (crearIntent en curso) -->
          <div *ngIf="estado() === 'iniciando' && !errorMensaje()" class="py-8 text-center">
            <p class="text-sm text-gray-400">Preparando el cobro…</p>
          </div>

          <!-- crearIntent fallo: sin stock o Stripe no disponible; el servicio ya notifico el motivo -->
          <div *ngIf="errorMensaje()" class="space-y-3">
            <p class="text-sm font-bold text-rose-700">{{ errorMensaje() }}</p>
            <button
              (click)="cerrar.emit()"
              class="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <!-- Widget de tarjeta (unica modalidad — Requirement "Card-Only Modality") -->
          <div *ngIf="estado() === 'cobrando' && clientSecret()">
            <app-card-payment
              [clientSecret]="clientSecret()"
              [concepto]="'Compra: ' + tituloCompra()"
              (pagado)="onCardPagado($event)"
              (fallo)="onCardFallo($event)"
              (cancelado)="onCardCancelado()"
            ></app-card-payment>
          </div>

          <!-- Cobrado pero venta fallida: retener idMetPago, nunca cobrar dos veces -->
          <div *ngIf="estado() === 'cobrado_sin_venta'" class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p class="text-sm font-bold text-amber-800">El pago ya fue registrado, pero la compra no se pudo confirmar.</p>
            <p class="text-xs text-amber-700">
              Podés reintentar sin que se te cobre de nuevo. Si el problema persiste, contactá a soporte
              (el pago #{{ idMetPagoActual() }} queda retenido para conciliación).
            </p>
            <button
              (click)="onReintentarVenta()"
              [disabled]="enviando()"
              class="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {{ enviando() ? 'Reintentando…' : 'Reintentar compra' }}
            </button>
          </div>
        </div>
      </div>

      <app-receipt-modal
        *ngIf="estado() === 'comprado' && ventaCreada() as v"
        [venta]="v"
        modalidad="Tarjeta"
        (cerrar)="onCerrarRecibo()"
      ></app-receipt-modal>
    </div>
  `
})
export class PurchaseModalComponent implements OnInit {
  @Input({ required: true }) lineas!: CartLine[];
  @Output() cerrar = new EventEmitter<void>();
  @Output() completada = new EventEmitter<Venta>();

  estado = signal<EstadoCompra>('resumen');
  // [CU33]
  items: { idProducto: number; cantidad: number }[] = [];
  idCupon = signal<number | null>(null);
  totalAPagar = signal<number | null>(null);
  // [CU35]
  costoEnvio = signal<number | null>(null);
  conEnvio = signal<boolean>(false);
  entrega: { direccion: string; telefono: string; referencia: string; franja: 'manana' | 'tarde' } = { direccion: '', telefono: '', referencia: '', franja: 'manana' };

  totalFinal(): number | null {
    const t = this.totalAPagar();
    return t === null ? null : t + (this.conEnvio() ? this.costoEnvio() ?? 0 : 0);
  }

  entregaValida(): boolean {
    return !this.conEnvio() || (this.entrega.direccion.trim().length >= 8 && this.entrega.telefono.replace(/\D/g, '').length >= 7);
  }

  private datosEntrega() {
    return this.conEnvio()
      ? { direccion: this.entrega.direccion.trim(), telefono: this.entrega.telefono.trim(), referencia: this.entrega.referencia.trim() || null, franja: this.entrega.franja }
      : null;
  }
  clientSecret = signal<string | null>(null);
  idMetPagoActual = signal<number | null>(null);
  ventaCreada = signal<Venta | null>(null);
  enviando = signal(false);
  errorMensaje = signal<string | null>(null);

  constructor(
    private paymentsService: PaymentsService,
    private salesService: SalesService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    // Foto fija de los items: el selector de cupones cotiza sobre esta lista.
    this.items = this.itemsDeLineas();
  }

  onCupon(e: { idCupon: number | null; total: number; costoEnvio: number | null }): void {
    this.idCupon.set(e.idCupon);
    this.totalAPagar.set(e.total);
    this.costoEnvio.set(e.costoEnvio);
    if (e.costoEnvio === null) this.conEnvio.set(false);
  }

  // Una sola linea conserva la redaccion original ("Comprar ahora" y
  // buy-now, Requirement "Buy-Now Remains Independent of the Cart"); dos o
  // mas resumen el carrito.
  private get esUnaLinea(): boolean {
    return this.lineas.length === 1;
  }

  tituloCompra(): string {
    return this.esUnaLinea ? this.lineas[0].producto.nombre : `${this.lineas.length} productos`;
  }

  subtituloCantidad(): string {
    return this.esUnaLinea
      ? `Cantidad: ${this.lineas[0].cantidad}`
      : `Total de unidades: ${this.cantidadTotal()}`;
  }

  private cantidadTotal(): number {
    return this.lineas.reduce((total, linea) => total + linea.cantidad, 0);
  }

  private itemsDeLineas(): { idProducto: number; cantidad: number }[] {
    return this.lineas.map(linea => ({ idProducto: linea.producto.idProducto, cantidad: linea.cantidad }));
  }

  // POST /api/payments/intents: el servidor valida stock ANTES de crear el
  // intento (Requirement "Stock Verified Before Any Charge") — si no hay
  // stock en ninguna sucursal, devuelve 400 y esta llamada nunca cobra nada.
  async iniciarCobro(): Promise<void> {
    this.estado.set('iniciando');
    this.enviando.set(true);
    const intent = await this.paymentsService.crearIntent({
      items: this.itemsDeLineas(),
      claveIntento: crypto.randomUUID(),
      concepto: `Compra en línea — ${this.tituloCompra()}`,
      idCupon: this.idCupon(),
      conEnvio: this.conEnvio(),
    });
    this.enviando.set(false);
    if (!intent) {
      // El servicio ya notifico el motivo real (sin stock, Stripe no
      // configurado, etc.) via NotificationService.
      this.errorMensaje.set('No se pudo iniciar la compra. Cerrá esta ventana e intentá de nuevo.');
      return;
    }
    this.clientSecret.set(intent.clientSecret);
    this.estado.set('cobrando');
  }

  async onCardPagado(paymentIntentId: string): Promise<void> {
    this.enviando.set(true);
    const verificado = await this.paymentsService.verificarIntent(paymentIntentId);
    this.enviando.set(false);
    if (!verificado || !verificado.pagado || verificado.idMetPago === undefined) {
      // El widget reporto exito del lado del cliente, pero el servidor aun
      // no confirma el cobro: NUNCA se llama a POST /api/sales en este caso
      // (Requirement "Server-Verified Payment as Sole Success Signal").
      return;
    }
    this.idMetPagoActual.set(verificado.idMetPago);
    this.clientSecret.set(null);
    await this.intentarVenta();
  }

  onCardFallo(mensaje: string): void {
    // El widget (card-payment.component.ts) solo emite el evento, nunca
    // muestra nada por si solo. El clientSecret sigue montado: el usuario
    // puede reintentar el pago sin crear un intento nuevo.
    this.notificationService.error('Pago rechazado', mensaje);
  }

  onCardCancelado(): void {
    this.cerrar.emit();
  }

  /**
   * Unico punto que llama a POST /api/sales — nunca crea ni cobra un
   * idMetPago (mismo patron que `pos.component.ts::intentarVenta`).
   * idCliente y codigoSucursal se omiten a proposito: el backend los
   * deriva/resuelve para esta compra de cliente (D2/D4).
   */
  private async intentarVenta(): Promise<void> {
    const idMetPago = this.idMetPagoActual();
    if (idMetPago === null) {
      return;
    }
    this.enviando.set(true);
    const venta = await this.salesService.crearVenta({
      idMetPago,
      items: this.itemsDeLineas(),
      idCupon: this.idCupon(),
      entrega: this.datosEntrega(),
    });
    this.enviando.set(false);

    if (venta) {
      this.ventaCreada.set(venta);
      this.estado.set('comprado');
      this.completada.emit(venta);
      if (venta.cuponGanado) {
        this.notificationService.success('¡Ganaste un cupón!', `${venta.cuponGanado.porcentaje}% en tu próxima compra: ${venta.cuponGanado.codigo}`);
      }
    } else {
      // El idMetPago YA fue cobrado (tarjeta verificada): se retiene para
      // reintentar, nunca se cobra de nuevo (Requirement "Charge Preserved
      // on Sale Failure").
      this.estado.set('cobrado_sin_venta');
    }
  }

  async onReintentarVenta(): Promise<void> {
    await this.intentarVenta();
  }

  onCerrarRecibo(): void {
    this.cerrar.emit();
  }
}
