import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Cliente,
  InventoryLocation,
  InventoryStockEntry,
  ProductOut,
  TicketLine,
  Venta,
} from '../../core/models';
import { SalesService } from '../../core/services/sales.service';
import { PaymentsService } from '../../core/services/payments.service';
import { NotificationService } from '../../core/services/notification.service';
import { CardPaymentComponent } from '../../shared/components/card-payment.component';
import { ReceiptModalComponent } from '../../shared/components/receipt-modal.component';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

type EstadoRegistro = 'ticket' | 'cobrando' | 'cobrado_sin_venta' | 'vendido';
type Modalidad = 'efectivo' | 'tarjeta';

/**
 * Registro de caja — Venta Presencial (CU19/CU20).
 *
 * Máquina de estados: `ticket → cobrando → cobrado_sin_venta → vendido`.
 * El pago SIEMPRE se obtiene antes de `POST /api/sales`: el `idMetPago`
 * queda retenido en un signal y, si la venta falla después de cobrar, NO se
 * pierde — el Cajero puede reintentar con el mismo `idMetPago` (sin cobrar
 * dos veces) o abandonar (la fila de `MetodoPago` queda para conciliación
 * manual, sin reembolso automático).
 */
@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, CardPaymentComponent, ReceiptModalComponent],
  template: `
    <div class="p-6 md:p-8 space-y-6 animate-in fade-in duration-200 max-w-5xl">

      <div class="pb-5 border-b border-gray-200">
        <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Caja</span>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Venta Presencial</h1>
        <p class="text-xs text-gray-500 mt-1">
          El stock se filtra por la sucursal seleccionada: una venta se rechaza si esa sucursal
          concreta no tiene existencias, aunque otra sí las tenga.
        </p>
      </div>

      <!-- Selección de sucursal y cliente -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Sucursal *</label>
          <select
            class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed"
            [ngModel]="selectedBranch()"
            (ngModelChange)="onBranchChange($event)"
            name="branch"
          >
            <option [ngValue]="null" disabled>Seleccioná una sucursal</option>
            <option *ngFor="let l of locations()" [ngValue]="l.codigoSucursal">{{ l.nombre }}</option>
          </select>
          <p *ngIf="branchPromptVisible()" class="text-[11px] text-rose-600 font-medium">
            Elegí una sucursal antes de cobrar.
          </p>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Cliente *</label>
          <select
            class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer"
            [ngModel]="selectedCliente()"
            (ngModelChange)="selectedCliente.set($event)"
            name="cliente"
          >
            <option [ngValue]="null" disabled>Seleccioná un cliente</option>
            <option *ngFor="let c of customers()" [ngValue]="c.idCliente">{{ c.nombre }}</option>
          </select>
        </div>
      </div>

      <!-- Búsqueda de productos (solo con sucursal elegida) -->
      <div *ngIf="selectedBranch() !== null && estado() === 'ticket'" class="space-y-3">
        <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Buscar producto en esta sucursal</label>
        <input
          type="text"
          class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          placeholder="Nombre del producto…"
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
          name="search"
        />

        <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto" *ngIf="filteredStock().length > 0">
          <div *ngFor="let e of filteredStock()" class="px-3 py-2 flex items-center justify-between text-sm">
            <div>
              <p class="font-medium text-gray-900">{{ e.producto_nombre }}</p>
              <p class="text-[11px] text-gray-400">
                Disponible: {{ e.cantidad_actual - e.cantidad_reservada }}
                {{ e.producto_talla ? ' · Talla ' + e.producto_talla : '' }}
                {{ e.producto_color ? ' · ' + e.producto_color : '' }}
              </p>
            </div>
            <button
              (click)="agregarLinea(e)"
              [disabled]="e.cantidad_actual - e.cantidad_reservada <= 0"
              class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>
        </div>
        <p *ngIf="searchQuery() && filteredStock().length === 0" class="text-xs text-gray-400">
          No se encontraron productos con stock en esta sucursal.
        </p>
      </div>

      <!-- Ticket -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden" *ngIf="ticketLines().length > 0">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
              <th class="px-4 py-3">Producto</th>
              <th class="px-4 py-3 text-center">Cantidad</th>
              <th class="px-4 py-3 text-right">P. Unit.</th>
              <th class="px-4 py-3 text-right">Subtotal</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let line of ticketLines()" class="border-b border-gray-50 last:border-0">
              <td class="px-4 py-3 font-medium text-gray-900">{{ line.nombre }}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button
                    (click)="ajustarCantidad(line.idProducto, -1)"
                    [disabled]="lineasBloqueadas()"
                    class="w-6 h-6 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >−</button>
                  <span class="w-6 text-center">{{ line.cantidad }}</span>
                  <button
                    (click)="ajustarCantidad(line.idProducto, 1)"
                    [disabled]="lineasBloqueadas() || line.cantidad >= line.disponible"
                    class="w-6 h-6 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >+</button>
                </div>
              </td>
              <td class="px-4 py-3 text-right text-gray-600">Bs {{ line.precioUnitario.toFixed(2) }}</td>
              <td class="px-4 py-3 text-right font-semibold text-gray-900">Bs {{ (line.precioUnitario * line.cantidad).toFixed(2) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  (click)="removerLinea(line.idProducto)"
                  [disabled]="lineasBloqueadas()"
                  class="text-rose-500 hover:text-rose-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Quitar línea"
                >
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span class="text-xs text-gray-500">Subtotal indicativo (el total real lo confirma el servidor)</span>
          <span class="text-base font-bold text-gray-900">Bs {{ subtotalIndicativo().toFixed(2) }}</span>
        </div>
      </div>

      <!-- Elección de modalidad de pago -->
      <div
        *ngIf="ticketLines().length > 0 && estado() === 'ticket'"
        class="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4"
      >
        <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Modalidad de pago</label>
        <div class="flex gap-3">
          <button
            (click)="onElegirModalidad('efectivo')"
            [disabled]="enviando()"
            class="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide border transition-colors cursor-pointer disabled:opacity-50"
            [class.bg-indigo-600]="modalidad() === 'efectivo'"
            [class.text-white]="modalidad() === 'efectivo'"
            [class.border-indigo-600]="modalidad() === 'efectivo'"
            [class.text-gray-600]="modalidad() !== 'efectivo'"
            [class.border-gray-200]="modalidad() !== 'efectivo'"
          >
            Efectivo
          </button>
          <button
            (click)="onElegirModalidad('tarjeta')"
            [disabled]="enviando() || !tarjetaDisponible()"
            [title]="!tarjetaDisponible() ? 'El cobro con tarjeta no está disponible en este servidor' : ''"
            class="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            [class.bg-indigo-600]="modalidad() === 'tarjeta'"
            [class.text-white]="modalidad() === 'tarjeta'"
            [class.border-indigo-600]="modalidad() === 'tarjeta'"
            [class.text-gray-600]="modalidad() !== 'tarjeta'"
            [class.border-gray-200]="modalidad() !== 'tarjeta'"
          >
            Tarjeta
          </button>
        </div>

        <button
          *ngIf="modalidad() === 'efectivo'"
          (click)="onConfirmarEfectivo()"
          [disabled]="enviando()"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          {{ enviando() ? 'Procesando…' : 'Cobrar y registrar venta' }}
        </button>

        <button
          *ngIf="modalidad() === 'tarjeta' && !clientSecret()"
          (click)="onIniciarCobroTarjeta()"
          [disabled]="enviando()"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          {{ enviando() ? 'Iniciando cobro…' : 'Iniciar cobro con tarjeta' }}
        </button>
      </div>

      <!-- Widget de tarjeta (Stripe) -->
      <div *ngIf="estado() === 'cobrando' && clientSecret()" class="bg-white rounded-xl border border-gray-200 shadow-xs p-5">
        <app-card-payment
          [clientSecret]="clientSecret()"
          concepto="Venta presencial"
          (pagado)="onCardPagado($event)"
          (fallo)="onCardFallo($event)"
          (cancelado)="onCardCancelado()"
        ></app-card-payment>
      </div>

      <!-- Cobrado pero venta fallida: retener idMetPago, nunca cobrar dos veces -->
      <div
        *ngIf="estado() === 'cobrado_sin_venta'"
        class="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
      >
        <p class="text-sm font-bold text-amber-800">El pago ya fue registrado, pero la venta no se pudo confirmar.</p>
        <p class="text-xs text-amber-700">
          El método de pago (idMetPago #{{ idMetPagoActual() }}) queda retenido. Podés cambiar de
          sucursal si el problema fue falta de stock y reintentar sin cobrar de nuevo, o abandonar
          (la conciliación queda pendiente, sin reembolso automático).
        </p>
        <div class="flex gap-2">
          <button
            (click)="onReintentarVenta()"
            [disabled]="enviando()"
            class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {{ enviando() ? 'Reintentando…' : 'Reintentar venta' }}
          </button>
          <button
            (click)="onAbandonar()"
            [disabled]="enviando()"
            class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Abandonar
          </button>
        </div>
      </div>
    </div>

    <app-receipt-modal
      *ngIf="estado() === 'vendido' && ventaCreada() as v"
      [venta]="v"
      [clienteNombre]="clienteSeleccionadoNombre()"
      [modalidad]="modalidad() === 'efectivo' ? 'Efectivo' : 'Tarjeta'"
      (cerrar)="onCerrarRecibo()"
    ></app-receipt-modal>
  `
})
export class PosComponent implements OnInit {
  locations = signal<InventoryLocation[]>([]);
  customers = signal<Cliente[]>([]);
  branchStock = signal<InventoryStockEntry[]>([]);
  searchQuery = signal<string>('');

  selectedBranch = signal<number | null>(null);
  selectedCliente = signal<number | null>(null);
  branchPromptVisible = signal(false);

  ticketLines = signal<TicketLine[]>([]);
  private priceCache = signal<Map<number, number>>(new Map());

  modalidad = signal<Modalidad | null>(null);
  estado = signal<EstadoRegistro>('ticket');
  enviando = signal(false);

  idMetPagoActual = signal<number | null>(null);
  montoCobrado = signal<number | null>(null);
  clientSecret = signal<string | null>(null);
  ventaCreada = signal<Venta | null>(null);

  // Latch de sesión: si crearIntent falla (típicamente Stripe no configurado
  // en el servidor, 503), "Tarjeta" se deshabilita para el resto de la
  // sesión de caja — nunca vuelve a intentarse sola.
  private cardLatchedOff = signal(false);

  filteredStock = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const stock = this.branchStock();
    if (!q) {
      return stock;
    }
    return stock.filter(e => e.producto_nombre.toLowerCase().includes(q));
  });

  subtotalIndicativo = computed(() =>
    this.ticketLines().reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0)
  );

  // Bloqueadas solo cuando ya existe un idMetPago cobrado a la espera de
  // venta: la sucursal sigue editable (permite reintentar en otra), las
  // líneas no.
  lineasBloqueadas = computed(() => this.estado() === 'cobrado_sin_venta' || this.enviando());

  tarjetaDisponible = computed(() => !!environment.stripePublishableKey && !this.cardLatchedOff());

  clienteSeleccionadoNombre = computed(() => {
    const id = this.selectedCliente();
    return this.customers().find(c => c.idCliente === id)?.nombre ?? null;
  });

  constructor(
    private http: HttpClient,
    private salesService: SalesService,
    private paymentsService: PaymentsService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.cargarSucursales();
    this.cargarClientes();
  }

  private cargarSucursales(): Promise<void> {
    return firstValueFrom(
      this.http.get<InventoryLocation[]>(`${API_URL}/api/inventory/locations`)
    ).then((locs) => this.locations.set(locs)).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar las sucursales.');
    });
  }

  private cargarClientes(): Promise<void> {
    return firstValueFrom(
      this.http.get<Cliente[]>(`${API_URL}/api/customers`)
    ).then((list) => this.customers.set(list)).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la lista de clientes.');
    });
  }

  onBranchChange(codigoSucursal: number): void {
    this.selectedBranch.set(codigoSucursal);
    this.branchPromptVisible.set(false);
    this.searchQuery.set('');
    firstValueFrom(
      this.http.get<InventoryStockEntry[]>(`${API_URL}/api/inventory/stock`, {
        params: { codigoSucursal: String(codigoSucursal) },
      })
    ).then((stock) => this.branchStock.set(stock)).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el stock de la sucursal.');
    });
  }

  async agregarLinea(entry: InventoryStockEntry): Promise<void> {
    const disponible = entry.cantidad_actual - entry.cantidad_reservada;
    if (disponible <= 0) {
      return;
    }

    let precio = this.priceCache().get(entry.idProducto);
    if (precio === undefined) {
      const producto = await firstValueFrom(
        this.http.get<ProductOut>(`${API_URL}/api/products/${entry.idProducto}`)
      ).catch(() => null);
      if (!producto) {
        this.notificationService.error('Error', 'No se pudo obtener el precio del producto.');
        return;
      }
      precio = producto.venta;
      this.priceCache.update(m => new Map(m).set(entry.idProducto, precio!));
    }

    this.ticketLines.update(lines => {
      const existing = lines.find(l => l.idProducto === entry.idProducto);
      if (existing) {
        if (existing.cantidad >= disponible) {
          return lines;
        }
        return lines.map(l =>
          l.idProducto === entry.idProducto ? { ...l, cantidad: l.cantidad + 1 } : l
        );
      }
      const nueva: TicketLine = {
        idProducto: entry.idProducto,
        nombre: entry.producto_nombre,
        cantidad: 1,
        precioUnitario: precio!,
        disponible,
      };
      return [...lines, nueva];
    });
  }

  ajustarCantidad(idProducto: number, delta: number): void {
    if (this.lineasBloqueadas()) {
      return;
    }
    this.ticketLines.update(lines =>
      lines
        .map(l => {
          if (l.idProducto !== idProducto) {
            return l;
          }
          const nuevaCantidad = Math.min(Math.max(l.cantidad + delta, 0), l.disponible);
          return { ...l, cantidad: nuevaCantidad };
        })
        .filter(l => l.cantidad > 0)
    );
  }

  removerLinea(idProducto: number): void {
    if (this.lineasBloqueadas()) {
      return;
    }
    this.ticketLines.update(lines => lines.filter(l => l.idProducto !== idProducto));
  }

  onElegirModalidad(modalidad: Modalidad): void {
    if (modalidad === 'tarjeta' && !this.tarjetaDisponible()) {
      return;
    }
    this.modalidad.set(modalidad);
  }

  private validarAntesDeCobrar(): boolean {
    if (this.selectedBranch() === null) {
      this.branchPromptVisible.set(true);
      return false;
    }
    if (this.selectedCliente() === null) {
      this.notificationService.warning('Falta el cliente', 'Seleccioná un cliente antes de cobrar.');
      return false;
    }
    if (this.ticketLines().length === 0) {
      return false;
    }
    return true;
  }

  async onConfirmarEfectivo(): Promise<void> {
    if (this.enviando() || !this.validarAntesDeCobrar()) {
      return;
    }
    this.enviando.set(true);
    this.estado.set('cobrando');
    const metodo = await this.salesService.crearMetodoEfectivo(this.subtotalIndicativo());
    if (!metodo) {
      this.enviando.set(false);
      this.estado.set('ticket');
      return;
    }
    this.idMetPagoActual.set(metodo.idMetPago);
    this.montoCobrado.set(metodo.monto);
    await this.intentarVenta();
  }

  // Re-valida el stock de cada línea contra branchStock() (ya filtrado por
  // la sucursal seleccionada) justo antes de cobrar. La snapshot `disponible`
  // guardada en TicketLine es del momento en que se agregó la línea; el stock
  // real pudo bajar desde entonces (otra venta/reserva concurrente). Sin este
  // chequeo, se podía cobrar con tarjeta por un producto sin stock en esta
  // sucursal y quedar en `cobrado_sin_venta` sin reembolso automático.
  private lineaSinStockEnSucursal(): string | null {
    const stock = this.branchStock();
    for (const linea of this.ticketLines()) {
      const entry = stock.find(e => e.idProducto === linea.idProducto);
      const disponible = entry ? entry.cantidad_actual - entry.cantidad_reservada : 0;
      if (disponible < linea.cantidad) {
        return linea.nombre;
      }
    }
    return null;
  }

  async onIniciarCobroTarjeta(): Promise<void> {
    if (this.enviando() || !this.validarAntesDeCobrar()) {
      return;
    }
    const sinStock = this.lineaSinStockEnSucursal();
    if (sinStock) {
      this.notificationService.error(
        'Sin stock en esta sucursal',
        `No hay stock suficiente de "${sinStock}" en la sucursal seleccionada. Cambiá de sucursal o quitá el producto antes de cobrar.`,
      );
      return;
    }
    this.enviando.set(true);
    const intent = await this.paymentsService.crearIntent({
      items: this.ticketLines().map(l => ({ idProducto: l.idProducto, cantidad: l.cantidad })),
      claveIntento: crypto.randomUUID(),
      concepto: 'Venta presencial (POS)',
    });
    this.enviando.set(false);
    if (!intent) {
      // El servicio ya notificó el error. La causa más común es Stripe no
      // configurado (503): se deshabilita "Tarjeta" para el resto de la sesión.
      this.cardLatchedOff.set(true);
      this.modalidad.set(null);
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
      // El widget reportó éxito del lado del cliente, pero el servidor aún
      // no confirma el cobro: NUNCA se llama a POST /api/sales en este caso.
      this.notificationService.warning('Verificando el cobro', 'El pago todavía no fue confirmado por el servidor.');
      return;
    }
    this.idMetPagoActual.set(verificado.idMetPago);
    this.montoCobrado.set(verificado.monto ?? null);
    this.clientSecret.set(null);
    await this.intentarVenta();
  }

  onCardFallo(mensaje: string): void {
    this.notificationService.error('Pago rechazado', mensaje);
  }

  onCardCancelado(): void {
    this.clientSecret.set(null);
    this.modalidad.set(null);
    this.estado.set('ticket');
  }

  /** Único punto que llama a POST /api/sales — nunca crea ni cobra un idMetPago. */
  private async intentarVenta(): Promise<void> {
    if (this.enviando()) {
      return;
    }
    const idCliente = this.selectedCliente();
    const codigoSucursal = this.selectedBranch();
    const idMetPago = this.idMetPagoActual();
    if (idCliente === null || codigoSucursal === null || idMetPago === null) {
      return;
    }

    this.enviando.set(true);
    const venta = await this.salesService.crearVenta({
      idCliente,
      idMetPago,
      codigoSucursal,
      items: this.ticketLines().map(l => ({ idProducto: l.idProducto, cantidad: l.cantidad })),
    });
    this.enviando.set(false);

    if (venta) {
      this.ventaCreada.set(venta);
      this.estado.set('vendido');
    } else {
      // El idMetPago YA fue cobrado (efectivo registrado o tarjeta
      // verificada): se retiene para reintentar, nunca se cobra de nuevo.
      this.estado.set('cobrado_sin_venta');
    }
  }

  async onReintentarVenta(): Promise<void> {
    await this.intentarVenta();
  }

  onAbandonar(): void {
    // La fila de MetodoPago queda para conciliación manual — nunca se emite
    // un reembolso automático ni se reintenta en segundo plano.
    this.resetearTicket();
  }

  onCerrarRecibo(): void {
    this.resetearTicket();
  }

  private resetearTicket(): void {
    this.ticketLines.set([]);
    this.modalidad.set(null);
    this.estado.set('ticket');
    this.idMetPagoActual.set(null);
    this.montoCobrado.set(null);
    this.clientSecret.set(null);
    this.ventaCreada.set(null);
    this.enviando.set(false);
  }
}
