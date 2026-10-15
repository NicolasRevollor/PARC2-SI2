import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../core/services/archive.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ReturnsService } from '../../core/services/returns.service';
import { ItemElegible, TipoDevolucion } from '../../core/models';

/**
 * Devoluciones y cambios de talla/medida (CU28).
 *
 * La regla de las 24 h no se calcula acá: el backend expone en
 * `/api/returns/elegibles` exactamente los items que todavía están dentro de
 * la ventana, con las horas que les quedan. Esta pantalla solo deja elegir
 * entre esos — así nunca se ofrece un cambio que el servidor va a rechazar.
 */
@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Devoluciones y Cambios de Talla</h1>
          <p class="text-xs text-gray-500 mt-1">
            Ventana de 24 h desde la venta. Cada cambio queda registrado con fecha, cliente y talla.
          </p>
        </div>
        <button
          (click)="abrirFormulario()"
          [disabled]="elegibles().length === 0"
          [title]="elegibles().length === 0 ? 'No hay ventas de las últimas 24 h para cambiar o devolver' : 'Registrar un cambio o devolución'"
          class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">swap_horiz</span>
          <span>Registrar cambio o devolución</span>
        </button>
      </div>

      <!-- Sin ventas elegibles: explicar por qué el botón está deshabilitado -->
      <div *ngIf="cargoElegibles() && elegibles().length === 0"
           class="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
        <span class="material-symbols-outlined text-[20px] text-amber-600 shrink-0">schedule</span>
        <div class="text-xs">
          <p class="font-bold text-amber-700">No hay ventas dentro de las últimas 24 horas</p>
          <p class="text-gray-600 mt-1 leading-relaxed">
            Solo se pueden cambiar o devolver prendas vendidas hace menos de 24 h. Cuando se registre una venta
            en <span class="font-semibold">Caja</span>, va a aparecer acá y se habilita el botón.
          </p>
          <button (click)="recargarElegibles()"
                  class="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 hover:underline bg-transparent border-0 p-0 cursor-pointer">
            <span class="material-symbols-outlined text-[14px]">refresh</span>
            Volver a buscar ventas
          </button>
        </div>
      </div>

      <!-- Métricas -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Dentro de las 24 h</span>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ elegibles().length }}</p>
          <p class="text-xs text-gray-500 mt-1">Items todavía cambiables</p>
        </div>
        <div class="bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Cambios de talla</span>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ totalPorTipo('cambio_talla') }}</p>
          <p class="text-xs text-gray-500 mt-1">En el historial filtrado</p>
        </div>
        <div class="bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Monto devuelto</span>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ montoDevuelto().toLocaleString() }} Bs</p>
          <p class="text-xs text-gray-500 mt-1">Solo devoluciones, no cambios</p>
        </div>
      </div>

      <!-- Filtros del historial -->
      <div class="flex flex-wrap items-end gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Desde</label>
          <input type="date" [(ngModel)]="fechaDesde"
                 class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasta</label>
          <input type="date" [(ngModel)]="fechaHasta"
                 class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tipo</label>
          <select [(ngModel)]="filtroTipo"
                  class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="">Todos</option>
            <option value="cambio_talla">Cambio de talla</option>
            <option value="cambio_medida">Cambio de medida</option>
            <option value="devolucion">Devolución</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sucursal</label>
          <select [(ngModel)]="filtroSucursal"
                  class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option [ngValue]="null">Todas</option>
            <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
              {{ loc.nombre }}
            </option>
          </select>
        </div>
        <button (click)="aplicarFiltros()"
                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer">
          Filtrar
        </button>
        <button (click)="limpiarFiltros()"
                class="px-4 py-2 bg-[#18191d] border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
          Limpiar
        </button>
      </div>

      <!-- Historial -->
      <div class="bg-[#18191d] rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-gray-900">Historial de devoluciones y cambios</h2>
            <p class="text-xs text-gray-500">Trazabilidad por fecha, cliente y talla</p>
          </div>
          <span class="text-xs text-gray-500">{{ returnsService.devoluciones().length }} registro(s)</span>
        </div>

        <div *ngIf="returnsService.cargando()" class="p-8 text-center text-sm text-gray-500">
          Cargando historial…
        </div>

        <div *ngIf="!returnsService.cargando() && returnsService.devoluciones().length === 0"
             class="p-8 text-center text-sm text-gray-500">
          No hay devoluciones ni cambios registrados con esos filtros.
        </div>

        <div *ngIf="returnsService.devoluciones().length > 0" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                <th class="px-6 py-2.5">Fecha</th>
                <th class="px-6 py-2.5">Cliente</th>
                <th class="px-6 py-2.5">Prenda</th>
                <th class="px-6 py-2.5">Talla</th>
                <th class="px-6 py-2.5">Tipo</th>
                <th class="px-6 py-2.5">Sucursal</th>
                <th class="px-6 py-2.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let d of returnsService.devoluciones()" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-3 text-gray-700 whitespace-nowrap">{{ d.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="px-6 py-3 font-semibold text-gray-900">{{ d.cliente_nombre || ('Cliente #' + d.idCliente) }}</td>
                <td class="px-6 py-3 text-gray-700">
                  {{ d.producto_nombre }}
                  <span *ngIf="d.producto_nuevo_nombre" class="text-gray-400"> → {{ d.producto_nuevo_nombre }}</span>
                </td>
                <td class="px-6 py-3">
                  <span class="font-mono font-bold text-gray-900">{{ d.tallaOriginal || '—' }}</span>
                  <span *ngIf="d.tallaNueva" class="text-indigo-600 font-mono font-bold"> → {{ d.tallaNueva }}</span>
                  <span *ngIf="d.medidaNueva" class="block text-[10px] text-gray-500">
                    {{ d.medidaOriginal || '—' }} → {{ d.medidaNueva }}
                  </span>
                </td>
                <td class="px-6 py-3">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                        [ngClass]="{
                          'bg-indigo-50 text-indigo-700 border-indigo-200': d.tipo === 'cambio_talla',
                          'bg-amber-50 text-amber-700 border-amber-200': d.tipo === 'cambio_medida',
                          'bg-rose-50 text-rose-600 border-rose-200': d.tipo === 'devolucion'
                        }">
                    {{ etiquetaTipo(d.tipo) }}
                  </span>
                </td>
                <td class="px-6 py-3 text-gray-500">{{ d.sucursal_nombre || '—' }}</td>
                <td class="px-6 py-3 text-right font-semibold text-gray-900">
                  {{ d.montoDevuelto > 0 ? (d.montoDevuelto.toLocaleString() + ' Bs') : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal: registrar devolución o cambio -->
    <div *ngIf="mostrarFormulario()"
         class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-xl w-full p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <button (click)="mostrarFormulario.set(false)"
                class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Ventana de 24 horas</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">Registrar devolución o cambio</h3>
          <p class="text-xs text-gray-500 mt-1">Solo se listan las ventas que todavía están dentro del plazo.</p>
        </div>

        <div class="space-y-4">
          <!-- Item vendido -->
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Venta e item</label>
            <select [ngModel]="itemSeleccionadoKey()" (ngModelChange)="seleccionarItem($event)"
                    class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option [ngValue]="null" disabled>Elegí la venta a modificar…</option>
              <option *ngFor="let item of elegibles()" [ngValue]="claveItem(item)">
                #{{ item.idVenta }} · {{ item.producto_nombre }} (talla {{ item.talla || 's/t' }}) ·
                {{ item.cliente_nombre }} · quedan {{ item.horasRestantes.toFixed(1) }} h
              </option>
            </select>
          </div>

          <div *ngIf="itemSeleccionado() as item" class="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
            <p><span class="font-semibold">Vendidas:</span> {{ item.cantidadVendida }} · <span class="font-semibold">Ya devueltas:</span> {{ item.cantidadDevuelta }}</p>
            <p><span class="font-semibold">Disponible para cambio:</span> {{ item.cantidadDisponible }}</p>
            <p><span class="font-semibold">Precio unitario:</span> {{ item.precio_unitario.toLocaleString() }} Bs</p>
          </div>

          <!-- Tipo -->
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Tipo de operación</label>
            <div class="grid grid-cols-3 gap-2 mt-1">
              <button *ngFor="let t of tipos" type="button" (click)="tipo.set(t.valor)"
                      class="px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-colors cursor-pointer"
                      [ngClass]="tipo() === t.valor
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-[#18191d] text-gray-600 border-gray-200 hover:border-indigo-200'">
                {{ t.etiqueta }}
              </button>
            </div>
          </div>

          <!-- Talla nueva (solo cambio de talla) -->
          <div *ngIf="tipo() === 'cambio_talla'">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Prenda de reemplazo (talla nueva)</label>
            <select [(ngModel)]="idProductoNuevo"
                    class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option [ngValue]="null" disabled>Elegí la prenda en la talla nueva…</option>
              <option *ngFor="let p of reemplazosPosibles()" [ngValue]="p.idProducto">
                {{ p.nombre }} — talla {{ p.talla || 's/t' }} ({{ p.color }})
              </option>
            </select>
            <p class="text-[10px] text-gray-500 mt-1">
              La talla es un atributo del producto: el reemplazo es otra prenda del catálogo.
            </p>
          </div>

          <!-- Medidas (solo cambio de medida) -->
          <div *ngIf="tipo() === 'cambio_medida'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Medida original</label>
              <input type="text" [(ngModel)]="medidaOriginal" placeholder="ej. pecho 96 cm"
                     class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Medida nueva</label>
              <input type="text" [(ngModel)]="medidaNueva" placeholder="ej. pecho 100 cm"
                     class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Cantidad</label>
              <input type="number" min="1" [max]="maxCantidad()" [(ngModel)]="cantidad"
                     class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal</label>
              <select [(ngModel)]="codigoSucursal"
                      class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option [ngValue]="null">Resolver automáticamente</option>
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Motivo</label>
            <textarea rows="2" [(ngModel)]="motivo" placeholder="ej. la talla M le quedó chica"
                      class="w-full mt-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
          </div>

          <button (click)="registrar()" [disabled]="!puedeRegistrar() || guardando()"
                  class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs">
            {{ guardando() ? 'Registrando…' : 'Confirmar operación' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class ReturnsComponent implements OnInit {
  readonly tipos: { valor: TipoDevolucion; etiqueta: string }[] = [
    { valor: 'cambio_talla', etiqueta: 'Cambio talla' },
    { valor: 'cambio_medida', etiqueta: 'Cambio medida' },
    { valor: 'devolucion', etiqueta: 'Devolución' },
  ];

  readonly elegibles = signal<ItemElegible[]>([]);
  /** Evita mostrar el aviso de "sin ventas" mientras la primera carga está en curso. */
  readonly cargoElegibles = signal<boolean>(false);
  readonly mostrarFormulario = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly tipo = signal<TipoDevolucion>('cambio_talla');
  readonly itemSeleccionado = signal<ItemElegible | null>(null);

  fechaDesde = '';
  fechaHasta = '';
  filtroTipo = '';
  filtroSucursal: number | null = null;

  idProductoNuevo: number | null = null;
  cantidad = 1;
  codigoSucursal: number | null = null;
  motivo = '';
  medidaOriginal = '';
  medidaNueva = '';

  /** Clave sintética del <select>: una venta puede repetir producto. */
  readonly itemSeleccionadoKey = computed(() => {
    const item = this.itemSeleccionado();
    return item ? this.claveItem(item) : null;
  });

  readonly maxCantidad = computed(() => this.itemSeleccionado()?.cantidadDisponible ?? 1);

  /** Candidatos a reemplazo: el mismo modelo en otra talla. */
  readonly reemplazosPosibles = computed(() => {
    const item = this.itemSeleccionado();
    const catalogo = this.archiveService.products();
    if (!item) return catalogo;
    const base = item.producto_nombre.toLowerCase();
    const mismoModelo = catalogo.filter(
      (p) => p.idProducto !== item.idProducto && p.nombre.toLowerCase() === base
    );
    // Si el catálogo no tiene el mismo modelo en otra talla, se ofrece todo
    // el catálogo en vez de dejar el selector vacío.
    return mismoModelo.length > 0 ? mismoModelo : catalogo.filter((p) => p.idProducto !== item.idProducto);
  });

  readonly montoDevuelto = computed(() =>
    this.returnsService.devoluciones().reduce((acc, d) => acc + (d.montoDevuelto || 0), 0)
  );

  constructor(
    public returnsService: ReturnsService,
    public inventoryService: InventoryService,
    private archiveService: ArchiveService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.inventoryService.loadLocations();
    this.archiveService.loadProducts({ size: 100 });
    await Promise.all([this.cargarElegibles(), this.returnsService.cargarDevoluciones()]);
  }

  async recargarElegibles(): Promise<void> {
    await this.cargarElegibles();
  }

  private async cargarElegibles(): Promise<void> {
    this.elegibles.set(await this.returnsService.cargarElegibles());
    this.cargoElegibles.set(true);
  }

  claveItem(item: ItemElegible): string {
    return `${item.idVenta}-${item.idProducto}`;
  }

  seleccionarItem(clave: string | null): void {
    const item = this.elegibles().find((i) => this.claveItem(i) === clave) ?? null;
    this.itemSeleccionado.set(item);
    this.cantidad = 1;
    this.idProductoNuevo = null;
  }

  etiquetaTipo(tipo: string): string {
    return this.tipos.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
  }

  totalPorTipo(tipo: TipoDevolucion): number {
    return this.returnsService.devoluciones().filter((d) => d.tipo === tipo).length;
  }

  abrirFormulario(): void {
    this.itemSeleccionado.set(null);
    this.tipo.set('cambio_talla');
    this.idProductoNuevo = null;
    this.cantidad = 1;
    this.codigoSucursal = null;
    this.motivo = '';
    this.medidaOriginal = '';
    this.medidaNueva = '';
    this.mostrarFormulario.set(true);
  }

  puedeRegistrar(): boolean {
    const item = this.itemSeleccionado();
    if (!item) return false;
    if (this.cantidad < 1 || this.cantidad > item.cantidadDisponible) return false;
    if (this.tipo() === 'cambio_talla' && this.idProductoNuevo === null) return false;
    if (this.tipo() === 'cambio_medida' && !this.medidaNueva.trim()) return false;
    return true;
  }

  async registrar(): Promise<void> {
    const item = this.itemSeleccionado();
    if (!item || !this.puedeRegistrar()) return;

    this.guardando.set(true);
    const creada = await this.returnsService.registrar({
      idVenta: item.idVenta,
      idProducto: item.idProducto,
      tipo: this.tipo(),
      cantidad: this.cantidad,
      idProductoNuevo: this.tipo() === 'cambio_talla' ? this.idProductoNuevo : null,
      codigoSucursal: this.codigoSucursal,
      motivo: this.motivo.trim() || null,
      medidaOriginal: this.tipo() === 'cambio_medida' ? this.medidaOriginal.trim() || null : null,
      medidaNueva: this.tipo() === 'cambio_medida' ? this.medidaNueva.trim() || null : null,
    });
    this.guardando.set(false);

    if (creada) {
      this.mostrarFormulario.set(false);
      // El item cambió de estado (quedan menos unidades devolvibles), así
      // que se vuelve a pedir la lista en vez de parchearla a mano.
      await this.cargarElegibles();
    }
  }

  aplicarFiltros(): void {
    this.returnsService.cargarDevoluciones({
      fecha_desde: this.fechaDesde || undefined,
      fecha_hasta: this.fechaHasta || undefined,
      tipo: this.filtroTipo || undefined,
      codigoSucursal: this.filtroSucursal ?? undefined,
    });
  }

  limpiarFiltros(): void {
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.filtroTipo = '';
    this.filtroSucursal = null;
    this.returnsService.cargarDevoluciones();
  }
}
