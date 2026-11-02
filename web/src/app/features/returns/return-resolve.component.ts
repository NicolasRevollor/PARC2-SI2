import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../core/services/archive.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ETIQUETA_RESULTADO, ETIQUETA_TIPO, ReturnsService } from '../../core/services/returns.service';
import { SalesService } from '../../core/services/sales.service';
import type {
  ComparacionTalla,
  DevolucionOut,
  MetodoReembolso,
  OpcionSinStock,
  PoliticaDevolucion,
  ProductOut,
  StockSucursal,
  TipoDevolucion,
} from '../../core/models';

const VARIANTES: TipoDevolucion[] = ['cambio_talla', 'cambio_color'];

/**
 * Resolución de un caso aprobado (CU4 a CU8):
 *  - CU4 cambio de talla, color o ajuste de medida, con la diferencia de precio;
 *  - CU5 cambio por uno o varios productos distintos (nueva venta enlazada);
 *  - CU6 reembolso por el medio de pago de la venta;
 *  - CU7 nota de devolución: si al cliente le sobra plata, SIEMPRE se le devuelve
 *    en dinero (ya no hay notas de crédito) y se le entrega la nota de devolución;
 *  - CU8 si la variante no tiene stock en la sucursal: traslado, atención en
 *    otra sucursal, lista de espera, otra prenda o devolverle el dinero.
 * Los montos que se muestran son una estimación: el servidor los recalcula.
 */
@Component({
  selector: 'app-return-resolve',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ys-modal">
      <div class="ys-modal-caja max-w-2xl space-y-5">
        <button (click)="cerrar.emit()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div>
          <span class="ys-mini text-indigo-600">CU4–CU8 · Resolver {{ caso.codigo }}</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">{{ caso.producto_nombre }} · talla {{ caso.tallaOriginal }} · {{ caso.producto_color }}</h3>
          <p class="text-xs text-gray-500 mt-1">{{ caso.cliente_nombre }} · {{ caso.cantidad }} u. · inspección: {{ resultado() }}</p>
        </div>

        <!-- Crédito disponible (CU5 paso 1, CU6 paso 1) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Pagado</p><p class="font-bold text-gray-900">Bs {{ caso.valor.toFixed(2) }}</p></div>
          <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Recargo demora</p><p class="font-bold text-gray-900">− Bs {{ caso.recargo.toFixed(2) }}</p></div>
          <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Deterioro</p><p class="font-bold text-gray-900">− Bs {{ caso.descuentoDeterioro.toFixed(2) }}</p></div>
          <div class="p-2 rounded-lg bg-indigo-50 border border-indigo-200"><p class="ys-mini">Crédito</p><p class="font-bold text-indigo-700">Bs {{ caso.credito.toFixed(2) }}</p></div>
        </div>

        <div>
          <p class="ys-etiqueta">Resolución</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
            <button *ngFor="let t of tipos()" type="button" (click)="elegirTipo(t)" class="ys-opcion" [class.ys-opcion-activa]="tipo() === t">
              {{ etiquetaTipo(t) }}
            </button>
          </div>
          <p *ngIf="caso.condicion === 'defectuosa'" class="text-[11px] text-emerald-700 mt-1">
            Defecto de fábrica: el cliente puede elegir reembolso aunque la política solo admita cambios.
          </p>
        </div>

        <!-- CU4: variantes del mismo modelo con precio y existencia -->
        <div *ngIf="esVariante()" class="space-y-2">
          <p class="ys-etiqueta">Nueva {{ tipo() === 'cambio_talla' ? 'talla' : 'color' }}</p>
          <div *ngIf="variantes().length === 0" class="text-xs text-amber-700">No hay variantes del mismo modelo en el catálogo.</div>
          <button *ngFor="let p of variantes()" type="button" (click)="elegirVariante(p)"
                  class="w-full flex items-center justify-between p-2 rounded-lg border text-xs bg-transparent cursor-pointer"
                  [ngClass]="idProductoNuevo() === p.idProducto ? 'border-indigo-400' : 'border-gray-200'">
            <span class="text-gray-900 font-semibold">{{ p.nombre }} · talla {{ p.talla }} · {{ p.color }}</span>
            <span class="text-gray-500">Bs {{ p.venta }} · {{ existenciaTexto(p.idProducto) }}</span>
          </button>
          <!-- "L mas grande o L menos grande": comparacion real en cm entre la prenda devuelta y la elegida -->
          <p *ngIf="comparacion() as c" class="text-[11px] p-2 rounded-lg border"
             [ngClass]="c.direccion === 'mas_grande' ? 'border-sky-200 bg-sky-50 text-sky-800' : c.direccion === 'mas_chica' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-600'">
            <span class="material-symbols-outlined text-[14px] align-middle">straighten</span> {{ c.texto }}
          </p>
        </div>

        <!-- CU5: productos distintos -->
        <div *ngIf="tipo() === 'cambio_producto'" class="space-y-2">
          <p class="ys-etiqueta">Productos que se lleva el cliente</p>
          <div *ngFor="let fila of productos(); let i = index" class="flex gap-2 items-center">
            <select [ngModel]="fila.idProducto" (ngModelChange)="cambiarProducto(i, $event)" class="ys-filtro flex-1">
              <option *ngFor="let p of otrosProductos()" [ngValue]="p.idProducto">{{ p.nombre }} · {{ p.talla }} · Bs {{ p.venta }}</option>
            </select>
            <input type="number" min="1" [ngModel]="fila.cantidad" (ngModelChange)="cambiarCantidad(i, $event)" class="ys-filtro w-16" />
            <span class="text-[11px] w-28 text-right" [ngClass]="hayStock(fila.idProducto, fila.cantidad) ? 'text-emerald-700' : 'text-rose-600'">
              {{ existenciaTexto(fila.idProducto) }}</span>
            <button (click)="quitarProducto(i)" class="text-rose-500 bg-transparent border-0 cursor-pointer"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
          <button (click)="agregarProducto()" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">add</span> Agregar producto</button>
        </div>

        <!-- Ajuste de medida (CU4 flujo alternativo 5) -->
        <div *ngIf="tipo() === 'cambio_medida'" class="grid grid-cols-3 gap-3">
          <div><p class="ys-etiqueta">Medida original</p><input [(ngModel)]="medidaOriginal" placeholder="largo 72 cm" class="ys-campo" /></div>
          <div><p class="ys-etiqueta">Medida nueva</p><input [(ngModel)]="medidaNueva" placeholder="largo 68 cm" class="ys-campo" /></div>
          <div><p class="ys-etiqueta">Entrega del ajuste</p><input type="date" [(ngModel)]="fechaAjuste" class="ys-campo" /></div>
        </div>

        <div *ngIf="esCambio()">
          <p class="ys-etiqueta">Sucursal que entrega</p>
          <select [ngModel]="sucursal()" (ngModelChange)="sucursal.set($event)" class="ys-campo">
            <option *ngFor="let s of inventoryService.locations()" [ngValue]="s.codigoSucursal">{{ s.nombre }}</option>
          </select>
        </div>

        <!-- CU8: sin existencia de la variante en la sucursal -->
        <div *ngIf="sinStockAqui()" class="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs space-y-2">
          <p class="font-bold text-amber-700">CU8 · Sin existencia en esta sucursal</p>
          <p class="text-gray-600">
            <span *ngIf="otrasConStock().length">Hay en: <span *ngFor="let s of otrasConStock(); let ultimo = last">{{ s.sucursal }} ({{ s.disponible }}){{ ultimo ? '' : ', ' }}</span></span>
            <span *ngIf="!otrasConStock().length">Ninguna sucursal tiene existencia.</span>
          </p>
          <label *ngIf="otrasConStock().length" class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="sinStock" [checked]="sinStock() === 'traslado'" (change)="sinStock.set('traslado')" />
            Trasladar a esta sucursal desde
            <select [(ngModel)]="sucursalOrigen" class="ys-filtro"><option *ngFor="let s of otrasConStock()" [ngValue]="s.codigoSucursal">{{ s.sucursal }}</option></select>
          </label>
          <label *ngIf="otrasConStock().length" class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="sinStock" [checked]="sinStock() === 'otra_sucursal'" (change)="sinStock.set('otra_sucursal')" />
            Atender en la otra sucursal (se aparta allí con el código del caso)
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="sinStock" [checked]="sinStock() === 'espera'" (change)="sinStock.set('espera')" />
            Lista de espera: avisar cuando haya reposición
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="sinStock" [checked]="sinStock() === 'reembolso'" (change)="sinStock.set('reembolso')" /> Devolverle el dinero (siempre se permite si no hay stock)
          </label>
          <button *ngIf="esVariante()" (click)="elegirTipo('cambio_producto')" class="text-[11px] font-bold uppercase text-indigo-600 bg-transparent border-0 p-0 cursor-pointer">Elegir otra prenda</button>
        </div>

        <!-- Diferencia (CU4 pasos 3-6, CU5 pasos 3-5) -->
        <div *ngIf="muestraDiferencia()" class="p-3 rounded-lg border border-gray-200 bg-gray-50 text-xs space-y-2">
          <p *ngIf="diferencia() === 0" class="font-semibold text-emerald-700">Cambio sin costo.</p>
          <p *ngIf="diferencia() > 0" class="text-gray-700">Diferencia a cobrar: <span class="font-bold">Bs {{ diferencia().toFixed(2) }}</span>
            <span *ngIf="supera()" class="text-amber-700"> · supera el umbral: requiere autorización del Encargado</span></p>
          <div *ngIf="diferencia() > 0 && !idPagoDiferencia()" class="flex flex-wrap gap-2">
            <button *ngFor="let m of mediosCobro" (click)="cobrar(m[0])" [disabled]="cobrando()" class="ys-btn-sec">{{ m[1] }}</button>
          </div>
          <p *ngIf="idPagoDiferencia()" class="text-emerald-700 font-semibold">Diferencia cobrada (pago #{{ idPagoDiferencia() }}).</p>
          <ng-container *ngIf="diferencia() < 0">
            <p class="text-gray-700">Saldo a favor del cliente: <span class="font-bold">Bs {{ (-diferencia()).toFixed(2) }}</span></p>
            <!-- Ya no hay notas de credito: el saldo a favor se devuelve en dinero y se entrega la nota de devolucion (CU7). -->
            <p class="text-gray-500">Se le devuelve en dinero y recibe su nota de devolución.</p>
          </ng-container>
        </div>

        <!-- CU6: medio del reembolso (por defecto, el de la venta) -->
        <div *ngIf="pideMedio()" class="space-y-2">
          <p class="ys-etiqueta">Medio del reembolso <span class="normal-case font-normal text-gray-500">· la venta se pagó con {{ formaPago() || '—' }}</span></p>
          <div class="grid grid-cols-3 gap-2">
            <button *ngFor="let m of mediosReembolso" type="button" (click)="medio.set(m[0])" class="ys-opcion" [class.ys-opcion-activa]="medio() === m[0]">{{ m[1] }}</button>
          </div>
          <input *ngIf="medio() === 'qr'" [(ngModel)]="cuentaDestino" placeholder="Cuenta de destino (banco y número)" class="ys-campo" />
          <p class="text-[11px] text-gray-500">
            {{ medio() === 'tarjeta' ? 'Se pide a la pasarela sobre el cobro original; si no responde, queda pendiente para reintentar.'
              : medio() === 'qr' ? 'Queda como transferencia pendiente hasta adjuntar el comprobante.'
              : 'Se entrega en caja junto con la nota de devolución.' }}
          </p>
        </div>

        <p *ngIf="tipo() === 'devolucion'" class="text-xs p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-gray-700">
          Se le devuelven Bs {{ caso.credito.toFixed(2) }} y se emite la nota de devolución (CU7) con el código {{ caso.codigo }}.
        </p>

        <p *ngIf="error()" class="text-xs text-rose-600 p-3 rounded-lg bg-rose-50 border border-rose-200">{{ error() }}</p>

        <button (click)="confirmar()" [disabled]="bloqueo() !== null || guardando()" class="ys-btn w-full">
          {{ guardando() ? 'Procesando…' : (bloqueo() || 'Confirmar ' + etiquetaTipo(tipo()).toLowerCase()) }}
        </button>
      </div>
    </div>
  `,
})
// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU4] Procesar cambio de talla, color o medida
// [CU5] Procesar cambio por un producto diferente
// [CU6] Procesar reembolso de dinero
// [CU7] Emitir nota de devolucion
// [CU8] Gestionar cambio sin stock disponible
// [CU10] Actualizar inventario por devolucion o cambio
// Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5", "Robustez CU6" y "Clases CU6", "Robustez CU7" y "Clases CU7", "Robustez CU8" y "Clases CU8", "Robustez CU10" y "Clases CU10"
// Pantalla (boundary) que lo usa: ResolverCambioUI (CU4, CU8), CambioOtroProductoUI (CU5), ProcesarReembolsoUI (CU6), ResolverDevolucionUI (CU7, CU10) = esta clase
// En palabras simples: pantalla donde se resuelve una solicitud aprobada: cambio de talla/color, por otro producto o devolver el dinero.
// Robustez: boundary "Resolver Cambio" (CU4, CU8), "Cambio por Otro Producto" (CU5), "Procesar Reembolso" (CU6),
//   "Resolver Devolución" (CU7, CU10)
// Secuencia: lifeline "Resolver Cambio" (CU4, CU8), "Cambio por Otro Producto" (CU5), "Procesar Reembolso" (CU6), "Resolver Devolución" (CU7, CU10)
// ==================================================================
export class ReturnResolveComponent implements OnInit {
  @Input({ required: true }) caso!: DevolucionOut;
  @Input() politica: PoliticaDevolucion | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() resuelto = new EventEmitter<DevolucionOut>();
  /** El servidor pidió autorización: el caso cambió aunque no se resolvió. */
  @Output() cambio = new EventEmitter<void>();

  readonly mediosCobro: [string, string][] = [['Efectivo', 'Cobrar en efectivo'], ['Tarjeta de débito', 'Tarjeta (terminal)'], ['QR / Transferencia', 'Cobrar por QR']];
  readonly mediosReembolso: [MetodoReembolso, string][] = [['efectivo', 'Efectivo'], ['qr', 'Transferencia'], ['tarjeta', 'Tarjeta']];

  readonly tipo = signal<TipoDevolucion>('cambio_talla');
  readonly idProductoNuevo = signal<number | null>(null);
  readonly productos = signal<{ idProducto: number; cantidad: number }[]>([]);
  readonly stocks = signal<Record<number, StockSucursal[]>>({});
  readonly sucursal = signal<number | null>(null);
  readonly sinStock = signal<OpcionSinStock | null>(null);
  // Correccion de la ingeniera: si la talla nueva es mas grande o mas chica (y por cuantos cm).
  readonly comparacion = signal<ComparacionTalla | null>(null);
  readonly medio = signal<MetodoReembolso>('efectivo');
  readonly idPagoDiferencia = signal<number | null>(null);
  readonly formaPago = signal<string | null>(null);
  readonly cobrando = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  sucursalOrigen: number | null = null;
  cuentaDestino = '';
  medidaOriginal = '';
  medidaNueva = '';
  fechaAjuste = '';

  readonly original = computed<ProductOut | undefined>(() =>
    this.archiveService.products().find((p) => p.idProducto === this.caso.idProducto)
  );

  readonly tipos = computed<TipoDevolucion[]>(() => {
    const tipos: TipoDevolucion[] = ['cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto'];
    if (this.politica?.permiteReembolso !== false || this.caso.condicion === 'defectuosa') tipos.push('devolucion');
    return tipos;
  });

  readonly esVariante = computed(() => VARIANTES.includes(this.tipo()));
  readonly esCambio = computed(() => this.esVariante() || this.tipo() === 'cambio_producto');

  readonly variantes = computed(() => {
    const o = this.original();
    if (!o) return [];
    return this.archiveService.products().filter((p) =>
      p.idProducto !== o.idProducto && p.tipo === o.tipo &&
      (this.tipo() === 'cambio_talla' ? p.color === o.color && p.talla !== o.talla : p.talla === o.talla && p.color !== o.color)
    );
  });

  readonly otrosProductos = computed(() => this.archiveService.products().filter((p) => p.idProducto !== this.caso.idProducto));

  /** Prendas que se entregan: la variante o los productos del CU5. */
  readonly entregas = computed(() =>
    this.esVariante()
      ? (this.idProductoNuevo() ? [{ idProducto: this.idProductoNuevo()!, cantidad: this.caso.cantidad }] : [])
      : this.tipo() === 'cambio_producto' ? this.productos() : []
  );

  readonly sinStockAqui = computed(() => {
    const entregas = this.entregas();
    return entregas.length === 1 && this.stocks()[entregas[0].idProducto] !== undefined && !this.hayStock(entregas[0].idProducto, entregas[0].cantidad);
  });

  readonly otrasConStock = computed(() => {
    const entrega = this.entregas()[0];
    if (!entrega) return [];
    return (this.stocks()[entrega.idProducto] ?? []).filter((s) => s.codigoSucursal !== this.sucursal() && s.disponible >= entrega.cantidad);
  });

  /** Estimación de la diferencia (el servidor la recalcula). */
  readonly diferencia = computed(() => {
    const catalogo = this.archiveService.products();
    const credito = this.caso.credito;
    if (this.esVariante()) {
      const nueva = catalogo.find((p) => p.idProducto === this.idProductoNuevo());
      if (!nueva) return 0;
      const pagado = this.caso.precio_unitario ?? 0;
      const precio = this.politica?.respetarPrecioOriginal !== false
        ? pagado + (nueva.venta - (this.original()?.venta ?? pagado))
        : nueva.venta;
      return Math.round((precio * this.caso.cantidad - credito) * 100) / 100;
    }
    if (this.tipo() === 'cambio_producto') {
      const total = this.productos().reduce((acc, f) => acc + (catalogo.find((p) => p.idProducto === f.idProducto)?.venta ?? 0) * f.cantidad, 0);
      return Math.round((total - credito) * 100) / 100;
    }
    if (this.tipo() === 'cambio_medida') return this.caso.recargo > 0 ? this.politica?.costoAjusteMedida ?? 0 : 0;
    return 0;
  });

  readonly muestraDiferencia = computed(() =>
    (this.esCambio() && this.entregas().length > 0 && !this.sinStockAqui()) || (this.tipo() === 'cambio_medida' && this.diferencia() > 0)
  );

  readonly supera = computed(() => this.diferencia() > (this.politica?.umbralAutorizacion ?? Infinity) && !this.caso.autorizador_nombre);

  readonly pideMedio = computed(() => {
    if (this.tipo() === 'devolucion') return true;
    if (this.sinStockAqui() && this.sinStock() === 'reembolso') return true;
    // Si le sobra plata en un cambio, siempre se le devuelve en dinero: hay que elegir el medio.
    return this.muestraDiferencia() && this.diferencia() < 0;
  });

  /** Método (no computed): también depende de campos de formulario que no son signals. */
  bloqueo(): string | null {
    if (this.esVariante() && !this.idProductoNuevo()) return 'Elegí la nueva variante';
    if (this.tipo() === 'cambio_producto' && this.productos().length === 0) return 'Agregá al menos un producto';
    if (this.tipo() === 'cambio_producto' && this.productos().length > 1 && this.productos().some((f) => !this.hayStock(f.idProducto, f.cantidad))) {
      return 'Hay productos sin existencia en la sucursal';
    }
    if (this.sinStockAqui() && !this.sinStock()) return 'Elegí qué hacer sin stock';
    if (this.muestraDiferencia() && this.diferencia() > 0 && !this.idPagoDiferencia() && !this.supera()) return 'Cobrá la diferencia';
    if (this.tipo() === 'cambio_medida' && !this.medidaNueva.trim()) return 'Indicá la medida nueva';
    if (this.pideMedio() && this.medio() === 'qr' && !this.cuentaDestino.trim()) return 'Indicá la cuenta de destino';
    return null;
  }

  constructor(
    private returnsService: ReturnsService,
    private salesService: SalesService,
    private archiveService: ArchiveService,
    public inventoryService: InventoryService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (this.inventoryService.locations().length === 0) void this.inventoryService.loadLocations();
    if (this.archiveService.products().length < 2) await this.archiveService.loadProducts({ size: 100 });
    this.sucursal.set(this.caso.sucursalEntrega ?? this.caso.codigoSucursal);
    this.elegirTipo(this.tipos().includes(this.caso.tipo) ? this.caso.tipo : this.tipos()[0]);
    if (this.caso.idProductoNuevo) {
      const nuevo = this.archiveService.products().find((p) => p.idProducto === this.caso.idProductoNuevo);
      if (nuevo) this.elegirVariante(nuevo);
    }
    // CU6 paso 2: por defecto, el mismo medio de pago de la venta.
    const venta = (await this.returnsService.buscarVentas(String(this.caso.idVenta)))?.[0];
    const forma = venta?.formaPago ?? null;
    this.formaPago.set(forma);
    const f = (forma ?? '').toLowerCase();
    this.medio.set(f.includes('stripe') ? 'tarjeta' : f.includes('qr') || f.includes('transfer') ? 'qr' : 'efectivo');
  }

  etiquetaTipo(tipo: string): string {
    return ETIQUETA_TIPO[tipo] ?? tipo;
  }

  resultado(): string {
    return ETIQUETA_RESULTADO[this.caso.condicion ?? ''] ?? 'sin inspección';
  }

  // [CU4] [CU5] [CU6] elegir la resolucion (TipoDevolucion) -> ResolverCambioUI.abrirCambio() / CambioOtroProductoUI.abrirCambio() / ProcesarReembolsoUI.abrirReembolso()
  elegirTipo(tipo: TipoDevolucion): void {
    this.tipo.set(tipo);
    this.idProductoNuevo.set(null);
    this.comparacion.set(null);
    this.sinStock.set(null);
    this.idPagoDiferencia.set(null);
    this.error.set(null);
    if (tipo === 'cambio_producto' && this.productos().length === 0) this.agregarProducto();
    if (VARIANTES.includes(tipo)) for (const p of this.variantes()) void this.cargarStock(p.idProducto);
  }

  private async cargarStock(idProducto: number): Promise<void> {
    if (this.stocks()[idProducto]) return;
    const stock = await this.returnsService.stockReemplazo(idProducto);
    this.stocks.update((s) => ({ ...s, [idProducto]: stock }));
  }

  hayStock(idProducto: number, cantidad: number): boolean {
    const fila = (this.stocks()[idProducto] ?? []).find((s) => s.codigoSucursal === this.sucursal());
    return (fila?.disponible ?? 0) >= cantidad;
  }

  // [CU8] ResolverCambioUI.mostrarOpcionesSinStock(): muestra si hay stock en esta sucursal
  // Robustez CU8: mensaje 2: buscarStock(variante nueva) a "BuscarStockSucursales" -> 5: muestra opciones (traslado, otra sucursal...)
  // Secuencia CU8: lifeline "Resolver Cambio" -> buscarStock(idProductoNuevo) -> mostrarOpciones(traslado | otra sucursal | otra prenda | reembolso)
  existenciaTexto(idProducto: number): string {
    const stock = this.stocks()[idProducto];
    if (!stock) return 'consultando…';
    const aqui = stock.find((s) => s.codigoSucursal === this.sucursal())?.disponible ?? 0;
    return aqui > 0 ? `${aqui} en esta sucursal` : 'sin existencia aquí';
  }

  // [CU4] ResolverCambioUI.elegirVariante() -> ControlDevoluciones.calcularDiferencia()
  // Robustez CU4: mensaje 7 (elige la nueva talla o color) -> 8: calcularDiferencia(variante nueva) a "CalcularDiferencia" -> 11: muestra la diferencia
  // Secuencia CU4: Empleado -> elegirVariante(talla | color) -> calcularDiferencia(idVariante) -> mostrarMontoACobrar(diferencia)
  elegirVariante(p: ProductOut): void {
    this.idProductoNuevo.set(p.idProducto);
    this.sinStock.set(null);
    this.idPagoDiferencia.set(null);
    void this.cargarStock(p.idProducto);
    // Correccion de la ingeniera ("L mas grande o L menos grande"): preguntamos al backend
    // si la talla elegida es mas grande o mas chica que la devuelta, en centimetros.
    this.comparacion.set(null);
    void this.returnsService.compararTallas(this.caso.idProducto, p.idProducto).then((c) => {
      if (this.idProductoNuevo() === p.idProducto) this.comparacion.set(c);
    });
  }

  // [CU5] CambioOtroProductoUI.agregarProducto() -> ControlDevoluciones.cotizarProducto()
  // Robustez CU5: mensaje 6 (agrega productos nuevos) -> 7: cotizarProductos(productos, cantidades) -> 12: muestra diferencia o saldo a favor
  // Secuencia CU5: Empleado -> agregarProducto(codigo | catalogo, cantidad) -> cotizarProducto(idProducto, cantidad) -> mostrarDiferencia(total - credito)
  agregarProducto(): void {
    const primero = this.otrosProductos()[0];
    if (!primero) return;
    this.productos.update((f) => [...f, { idProducto: primero.idProducto, cantidad: 1 }]);
    void this.cargarStock(primero.idProducto);
    this.idPagoDiferencia.set(null);
  }

  cambiarProducto(i: number, idProducto: number): void {
    this.productos.update((f) => f.map((fila, j) => (j === i ? { ...fila, idProducto } : fila)));
    void this.cargarStock(idProducto);
    this.idPagoDiferencia.set(null);
  }

  cambiarCantidad(i: number, cantidad: number): void {
    this.productos.update((f) => f.map((fila, j) => (j === i ? { ...fila, cantidad: Math.max(1, Number(cantidad) || 1) } : fila)));
    this.idPagoDiferencia.set(null);
  }

  quitarProducto(i: number): void {
    this.productos.update((f) => f.filter((_, j) => j !== i));
    this.idPagoDiferencia.set(null);
  }

  // [CU4] [CU5] ResolverCambioUI.registrarPago() / CambioOtroProductoUI.registrarPago() (cobrar la diferencia)
  // Secuencia CU4: Empleado -> registrarPago(efectivo | tarjeta | QR)  |  Secuencia CU5: confirmarCambio(metodo de pago)
  async cobrar(tipo: string): Promise<void> {
    this.cobrando.set(true);
    const pago = await this.salesService.crearMetodo(tipo, this.diferencia());
    this.cobrando.set(false);
    if (pago) this.idPagoDiferencia.set(pago.idMetPago);
  }

  // [CU4] [CU5] [CU6] [CU7] [CU8] [CU10] confirmarCambio() / confirmarReembolso() / ResolverDevolucionUI.confirmarCambioOReembolso()
  // -> ControlDevoluciones.resolver() (backend POST /api/returns/{id}/resolver)
  // Robustez: CU4 msj 13 confirmarCambio -> "ConfirmarCambio" | CU5 msj 14 confirmarCambio -> "ControlDevoluciones" |
  //   CU6 msj 9 confirmarReembolso -> "EjecutarReembolso" | CU7 la nota de devolucion sale del backend (comprobante.pdf) |
  //   CU8 msj 7 resolver(traslado) -> "Backend : GestionarTraslado" | CU10 msj 2 resolver(solicitud) -> "ResolverDevolucion"
  // Secuencia: CU4 confirmarCambio() | CU5 confirmarCambio(metodo de pago) | CU6 confirmarReembolso() |
  //   CU8 confirmarCambio(variante) / elegirOpcion(opcion, sucursal) | CU10 confirmarCambioOReembolso() -> mostrarComprobante() o mostrarError(reintentar)
  async confirmar(): Promise<void> {
    if (this.bloqueo() !== null) return;
    this.guardando.set(true);
    this.error.set(null);
    const sinStock = this.sinStockAqui() ? this.sinStock() : null;
    const resultado = await this.returnsService.resolver(this.caso.idDevolucion, {
      tipo: this.tipo(),
      idProductoNuevo: this.esVariante() ? this.idProductoNuevo() : null,
      productos: this.tipo() === 'cambio_producto' ? this.productos() : [],
      codigoSucursal: this.esCambio() ? this.sucursal() : null,
      metodoReembolso: this.pideMedio() ? this.medio() : null,
      cuentaDestino: this.medio() === 'qr' ? this.cuentaDestino.trim() || null : null,
      idMetPagoDiferencia: this.idPagoDiferencia(),
      sinStock,
      sucursalOrigen: sinStock === 'traslado' || sinStock === 'otra_sucursal' ? this.sucursalOrigen ?? this.otrasConStock()[0]?.codigoSucursal ?? null : null,
      medidaOriginal: this.tipo() === 'cambio_medida' ? this.medidaOriginal.trim() || null : null,
      medidaNueva: this.tipo() === 'cambio_medida' ? this.medidaNueva.trim() || null : null,
      fechaEntregaAjuste: this.tipo() === 'cambio_medida' && this.fechaAjuste ? this.fechaAjuste : null,
    });
    this.guardando.set(false);
    if (typeof resultado === 'string') {
      this.error.set(resultado);
      if (resultado.includes('autorizacion')) this.cambio.emit();
      return;
    }
    this.resuelto.emit(resultado);
  }
}
