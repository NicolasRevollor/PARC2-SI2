import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../../core/services/archive.service';
import { CartService } from '../../../core/services/cart.service';
import { RecommendationsService } from '../../../core/services/recommendations.service';
import { CartLine, ProductOut, RecomendacionOut } from '../../../core/models';
import { ProductDetailComponent } from './product-detail.component';
import { ReservationFormComponent } from '../reservations/reservation-form.component';
import { PurchaseModalComponent } from '../checkout/purchase-modal.component';
import { CartDrawerComponent } from '../cart/cart-drawer.component';
import { COLORES_POR_TIPO, COLORES_TIENDA, TALLAS_POR_TIPO, TIPOS_PRENDA, esTipoPrenda } from '../../../core/catalogo';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-customer-catalog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProductDetailComponent,
    ReservationFormComponent,
    PurchaseModalComponent,
    CartDrawerComponent,
  ],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="pb-5 border-b border-gray-200">
        <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Catálogo</span>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Explorar Productos</h1>
        <p class="text-xs text-gray-500 mt-1">Encuentre la prenda que busca y resérvela en su sucursal.</p>
      </div>

      <!-- Recomendado para vos (CU22, IA) -->
      <div *ngIf="recomendaciones().length > 0" class="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4">
        <div class="flex items-center gap-1.5 mb-3">
          <span class="material-symbols-outlined text-[16px] text-indigo-600">auto_awesome</span>
          <span class="text-xs font-bold uppercase tracking-wider text-indigo-700">Recomendado para vos</span>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-1">
          <button
            *ngFor="let r of recomendaciones()"
            (click)="openRecomendacion(r)"
            [disabled]="r.idProducto === null"
            class="shrink-0 w-44 text-left bg-[#18191d] rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all p-3 cursor-pointer disabled:cursor-default disabled:opacity-60"
          >
            <span
              class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-1.5"
              [ngClass]="{
                'bg-rose-100 text-rose-700': r.importancia === 'Alta',
                'bg-amber-100 text-amber-700': r.importancia === 'Media',
                'bg-gray-100 text-gray-600': r.importancia === 'Baja'
              }"
            >{{ r.importancia }}</span>
            <p class="text-xs font-bold text-gray-900 leading-snug line-clamp-2">{{ r.producto_nombre || r.nombre }}</p>
          </button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex flex-wrap items-center gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div class="relative min-w-[200px] flex-1">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
          <input
            type="text"
            [(ngModel)]="q"
            (ngModelChange)="onFilterChange()"
            placeholder="Buscar por nombre..."
            class="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-[#18191d] transition-all"
          />
        </div>

        <select
          [(ngModel)]="tipo"
          (ngModelChange)="onFilterChange()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Poleras y jeans</option>
          <option *ngFor="let t of tipos" [value]="t">{{ t }}</option>
        </select>

        <select
          [(ngModel)]="talla"
          (ngModelChange)="onFilterChange()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Todas las tallas</option>
          <option *ngFor="let t of tallasFiltro()" [value]="t">{{ t }}</option>
        </select>

        <select
          [(ngModel)]="color"
          (ngModelChange)="onFilterChange()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Todos los colores</option>
          <option *ngFor="let c of coloresFiltro()" [value]="c">{{ c }}</option>
        </select>

        <select
          [(ngModel)]="idColeccion"
          (ngModelChange)="onFilterChange()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option [ngValue]="null">Todas las colecciones</option>
          <option *ngFor="let c of archiveService.colecciones()" [ngValue]="c.idColeccion">
            {{ c.nombre_coleccion }}
          </option>
        </select>

        <select
          [(ngModel)]="idProveedor"
          (ngModelChange)="onFilterChange()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option [ngValue]="null">Todos los proveedores</option>
          <option *ngFor="let pr of archiveService.proveedores()" [ngValue]="pr.idProveedor">
            {{ pr.nombre }}
          </option>
        </select>
      </div>

      <!-- Galería de productos -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          *ngFor="let item of archiveService.products()"
          (click)="openDetail(item)"
          class="bg-[#18191d] rounded-xl overflow-hidden border border-gray-200 shadow-xs hover:shadow-sm hover:border-indigo-300 transition-all flex flex-col cursor-pointer group"
        >
          <div class="aspect-[4/3] w-full bg-gray-100 overflow-hidden relative">
            <img
              [src]="item.imagen_url || '/productos/sin-imagen.jpg'"
              [alt]="item.nombre"
              class="w-full h-full object-contain bg-[#e6e2db] group-hover:scale-105 transition-transform duration-500"
            />
            <div class="absolute bottom-3 right-3 bg-[#18191d]/95 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-xs text-right">
              <p class="text-xs font-bold text-gray-900">{{ item.venta.toLocaleString() }} Bs</p>
            </div>
          </div>

          <div class="p-4 flex-1 flex flex-col justify-between space-y-2">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                {{ item.tipo || 'Sin tipo' }} {{ item.talla ? '• ' + item.talla : '' }}
              </span>
              <h3 class="text-sm font-bold text-gray-900 leading-snug mt-0.5">{{ item.nombre }}</h3>
            </div>
            <p class="text-xs text-gray-500">{{ item.color || '' }}</p>
          </div>
        </div>
      </div>

      <div *ngIf="archiveService.products().length === 0" class="text-center py-12 text-gray-400 text-sm">
        No se encontraron productos con los filtros seleccionados.
      </div>

      <!-- Paginación -->
      <div *ngIf="totalPages() > 1" class="flex items-center justify-center gap-2 pt-2">
        <button
          (click)="goToPage(page() - 1)"
          [disabled]="page() === 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-[#18191d] text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 cursor-pointer"
        >
          Anterior
        </button>
        <span class="text-xs text-gray-500 font-semibold">Página {{ page() }} de {{ totalPages() }}</span>
        <button
          (click)="goToPage(page() + 1)"
          [disabled]="page() === totalPages()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-[#18191d] text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 cursor-pointer"
        >
          Siguiente
        </button>
      </div>
    </div>

    <app-product-detail
      *ngIf="selectedProductId() !== null"
      [idProducto]="selectedProductId()!"
      (cerrar)="closeDetail()"
      (reservar)="onReservar($event)"
      (comprar)="onComprar($event)"
      (agregarAlCarrito)="onAgregarAlCarrito($event)"
    ></app-product-detail>

    <app-reservation-form
      *ngIf="reservandoProducto() !== null"
      [producto]="reservandoProducto()!"
      (cerrar)="reservandoProducto.set(null)"
      (creada)="onReservaCreada()"
    ></app-reservation-form>

    <app-cart-drawer (finalizarCompra)="onFinalizarCompraCarrito()"></app-cart-drawer>

    <app-purchase-modal
      *ngIf="checkoutLineas() !== null"
      [lineas]="checkoutLineas()!"
      (cerrar)="checkoutLineas.set(null)"
      (completada)="onCompraCompletada()"
    ></app-purchase-modal>
  `
})
export class CatalogComponent implements OnInit {
  q = '';
  tipo = '';
  talla = '';
  color = '';
  idColeccion: number | null = null;
  idProveedor: number | null = null;

  readonly tipos = TIPOS_PRENDA;

  // Con un tipo elegido solo se ofrecen sus colores/tallas (un jean no viene
  // en guinda ni en talla M); sin tipo, las de toda la tienda.
  coloresFiltro(): string[] {
    return esTipoPrenda(this.tipo) ? COLORES_POR_TIPO[this.tipo] : COLORES_TIENDA;
  }

  tallasFiltro(): string[] {
    return esTipoPrenda(this.tipo)
      ? TALLAS_POR_TIPO[this.tipo]
      : [...TALLAS_POR_TIPO['Polera Oversize'], ...TALLAS_POR_TIPO['Jeans']];
  }

  page = signal<number>(1);
  selectedProductId = signal<number | null>(null);
  reservandoProducto = signal<ProductOut | null>(null);
  recomendaciones = signal<RecomendacionOut[]>([]);

  // Foto congelada de las lineas a pagar (CU16 D3): buy-now guarda un
  // arreglo de una sola linea, "Finalizar compra" del carrito guarda
  // `cartService.lineas()`. El modal nunca lee el carrito en vivo.
  checkoutLineas = signal<CartLine[] | null>(null);

  // Solo el checkout iniciado desde el carrito vacia el carrito al
  // completarse (Requirement "Buy-Now Remains Independent of the Cart" —
  // comprar ahora nunca debe tocar las lineas del carrito real).
  private checkoutDesdeCarrito = signal<boolean>(false);

  totalPages = computed(() => {
    const total = this.archiveService.total();
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;
  });

  constructor(
    public archiveService: ArchiveService,
    private cartService: CartService,
    private recommendationsService: RecommendationsService,
  ) {}

  ngOnInit() {
    this.archiveService.loadColecciones();
    this.archiveService.loadProveedores();
    this.fetchProducts();
    this.recommendationsService.getMisRecomendaciones().then(list => this.recomendaciones.set(list));
  }

  openRecomendacion(r: RecomendacionOut) {
    if (r.idProducto === null) return;
    this.selectedProductId.set(r.idProducto);
  }

  onFilterChange() {
    if (this.color && !this.coloresFiltro().includes(this.color)) this.color = '';
    if (this.talla && !this.tallasFiltro().includes(this.talla)) this.talla = '';
    this.page.set(1);
    this.fetchProducts();
  }

  goToPage(target: number) {
    if (target < 1 || target > this.totalPages()) return;
    this.page.set(target);
    this.fetchProducts();
  }

  openDetail(item: ProductOut) {
    this.selectedProductId.set(item.idProducto);
  }

  closeDetail() {
    this.selectedProductId.set(null);
  }

  onReservar(producto: ProductOut) {
    this.selectedProductId.set(null);
    this.reservandoProducto.set(producto);
  }

  onReservaCreada() {
    this.reservandoProducto.set(null);
  }

  onComprar(evt: { producto: ProductOut; cantidad: number }) {
    // "Comprar ahora": arreglo de una sola linea, throwaway, que nunca lee
    // ni escribe el carrito real (Requirement "Buy-Now Remains Independent
    // of the Cart").
    this.selectedProductId.set(null);
    this.checkoutDesdeCarrito.set(false);
    this.checkoutLineas.set([{ producto: evt.producto, cantidad: evt.cantidad }]);
  }

  onAgregarAlCarrito(evt: { producto: ProductOut; cantidad: number }) {
    this.cartService.agregar(evt.producto, evt.cantidad);
  }

  onFinalizarCompraCarrito() {
    const lineas = this.cartService.lineas();
    if (lineas.length === 0) {
      return;
    }
    this.checkoutDesdeCarrito.set(true);
    this.checkoutLineas.set(lineas);
    this.cartService.cerrarPanel();
  }

  onCompraCompletada() {
    // Requirement "Cart Checkout of All Lines" / "Successful multi-line
    // checkout empties the cart": SOLO se vacia el carrito real cuando el
    // checkout completado vino del carrito (nunca desde "Comprar ahora").
    if (this.checkoutDesdeCarrito()) {
      this.cartService.vaciar();
    }
    // El modal sigue abierto mostrando el comprobante (<app-receipt-modal>);
    // el usuario lo cierra explicitamente, recien ahi se limpia el estado.
  }

  private fetchProducts() {
    this.archiveService.loadProducts({
      q: this.q || undefined,
      tipo: this.tipo || undefined,
      talla: this.talla || undefined,
      color: this.color || undefined,
      idColeccion: this.idColeccion ?? undefined,
      idProveedor: this.idProveedor ?? undefined,
      page: this.page(),
      size: PAGE_SIZE,
    });
  }
}
