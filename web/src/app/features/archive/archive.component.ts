import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../core/services/archive.service';
import { ProductOut, ProductoIn } from '../../core/models';
import { PermisoDirective } from '../../shared/directives/permiso.directive';
import {
  COLORES_POR_TIPO,
  COLORES_TIENDA,
  TALLAS_POR_TIPO,
  TIPOS_PRENDA,
  TIPO_POLERA,
  esTipoPrenda,
  imagenCatalogo,
  imagenEspalda,
  nombreSugerido,
} from '../../core/catalogo';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, FormsModule, PermisoDirective],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Catálogo de Productos</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Archivo y Catálogo Esencial YouShop</h1>
          <p class="text-xs text-gray-500 mt-1">Gestión del catálogo de productos, proveedores y colecciones.</p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            appPermiso="producto.crear" (click)="openCreateModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Agregar Producto</span>
          </button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex flex-wrap items-center gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div class="relative min-w-[200px] flex-1">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearch()"
            placeholder="Buscar por nombre..."
            class="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-[#18191d] transition-all"
          />
        </div>
        <select
          [(ngModel)]="filterTipo"
          (ngModelChange)="onFilter()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          <option *ngFor="let t of tipos" [value]="t">{{ t }}</option>
        </select>
        <select
          [(ngModel)]="filterColor"
          (ngModelChange)="onFilter()"
          class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Todos los colores</option>
          <option *ngFor="let c of coloresTienda" [value]="c">{{ c }}</option>
        </select>
      </div>

      <!-- Galería de productos -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          *ngFor="let item of filteredProducts()"
          class="bg-[#18191d] rounded-xl overflow-hidden border border-gray-200 shadow-xs hover:shadow-sm hover:border-gray-300 transition-all flex flex-col group"
        >
          <div class="aspect-[4/3] w-full bg-gray-100 overflow-hidden relative">
            <img
              [src]="item.imagen_url || '/productos/sin-imagen.jpg'"
              [alt]="item.nombre"
              class="w-full h-full object-contain bg-[#e6e2db] group-hover:scale-105 transition-transform duration-500"
            />
            <div class="absolute top-3 left-3 flex flex-col gap-1.5">
              <span class="px-2.5 py-1 bg-black/90 backdrop-blur-xs text-white rounded-md text-[10px] font-bold tracking-wider uppercase shadow-xs">
                ID {{ item.idProducto }}
              </span>
            </div>
            <div class="absolute bottom-3 right-3 bg-[#18191d]/95 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-xs text-right">
              <p class="text-[10px] text-gray-500">Venta</p>
              <p class="text-xs font-bold text-gray-900">{{ item.venta.toLocaleString() }} Bs</p>
            </div>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  {{ item.tipo || 'Sin tipo' }} {{ item.talla ? '• ' + item.talla : '' }}
                </span>
                <span class="text-xs text-gray-500">{{ item.color || '' }}</span>
              </div>
              <h3 class="text-base font-bold text-gray-900 leading-snug">{{ item.nombre }}</h3>
              <p class="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">{{ item.descripcion }}</p>
            </div>

            <div class="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs text-gray-500 w-full">
                <span class="font-semibold">{{ item.coleccion_nombre }}</span>
              </div>
              <button
                (click)="inspectProduct(item)"
                class="px-3 py-1.5 bg-black text-white hover:bg-indigo-600 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
              >Inspeccionar</button>
              <button appPermiso="producto.editar" type="button" (click)="editarFotos(item)" class="ys-btn-sec" data-testid="cambiar-fotos">
                <span class="material-symbols-outlined text-[16px]">add_photo_alternate</span> Cambiar fotos
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="filteredProducts().length === 0" class="text-center py-12 text-gray-400 text-sm">
        No se encontraron productos con los filtros seleccionados.
      </div>
    </div>

    <div *ngIf="editandoFotos() as p" class="ys-modal">
      <div class="ys-modal-caja max-w-xl space-y-4" role="dialog" aria-modal="true" aria-label="Cambiar fotos del producto">
        <h2 class="text-lg font-bold text-gray-900">Cambiar fotos</h2>
        <p class="text-sm text-gray-600">{{ p.nombre }} · talla {{ p.talla }} · {{ p.color }}</p>
        <div *ngFor="let uso of usosImagen" class="ys-tarjeta p-4 space-y-2">
          <h3 class="text-sm font-bold text-gray-900">{{ uso === 'catalogo' ? 'Foto del catálogo' : 'Recorte para el probador móvil' }}</h3>
          <p class="text-xs text-gray-500">{{ uso === 'catalogo' ? 'Foto principal de la prenda. JPEG, PNG o WEBP, hasta 5 MB.' : 'Prenda de frente, sin persona ni fondo. PNG o WEBP transparente, hasta 5 MB.' }}</p>
          <div class="rounded-lg border border-dashed border-gray-300 p-3"
               style="background-image:repeating-conic-gradient(#d1d5db 0% 25%,#f3f4f6 0% 50%);background-size:20px 20px">
            <img *ngIf="fotosEdicion[uso]" [src]="fotosEdicion[uso]" alt="Vista previa" class="h-36 w-full object-contain" />
            <p *ngIf="!fotosEdicion[uso]" class="text-xs text-gray-600 text-center py-6">Sin imagen seleccionada</p>
          </div>
          <input type="file" [accept]="uso === 'probador' ? 'image/png,image/webp' : 'image/jpeg,image/png,image/webp'"
                 (change)="subirFotoEdicion($event, uso)" [disabled]="subiendoFotos() || guardandoFotos()" class="text-xs max-w-full" />
          <button *ngIf="uso === 'probador' && fotosEdicion.probador" type="button" (click)="fotosEdicion.probador = null"
                  [disabled]="subiendoFotos() || guardandoFotos()" class="ys-btn-sec">Quitar recorte</button>
        </div>
        <p *ngIf="subiendoFotos()" class="text-xs text-indigo-600" role="status">Subiendo imagen…</p>
        <p class="text-xs text-gray-500">Descargá la imagen a tu dispositivo y seleccioná el archivo aquí. La foto del catálogo puede tener fondo; el recorte del probador debe ser transparente.</p>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" (click)="editandoFotos.set(null)" [disabled]="subiendoFotos() || guardandoFotos()" class="ys-btn-sec">Cancelar</button>
          <button type="button" (click)="guardarFotos()" [disabled]="subiendoFotos() || guardandoFotos()" class="ys-btn" data-testid="guardar-fotos">
            {{ guardandoFotos() ? 'Guardando…' : 'Guardar fotos' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Inspección detallada de producto -->
    <div *ngIf="inspectingItem()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-3xl w-full rounded-2xl border border-gray-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col relative">
        <button
          (click)="inspectingItem.set(null)"
          class="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-[#18191d]/90 shadow-sm text-gray-700 flex items-center justify-center hover:bg-black hover:text-white transition-colors"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>

        <div class="overflow-y-auto p-6 md:p-8 space-y-6">
          <div *ngIf="inspectingItem() as p">
            <div class="flex flex-col md:flex-row gap-6">
              <div class="w-full md:w-1/2 aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img [src]="p.imagen_url || '/productos/sin-imagen.jpg'" [alt]="p.nombre" class="w-full h-full object-contain bg-[#e6e2db]" />
              </div>
              <div class="w-full md:w-1/2 flex flex-col justify-between">
                <div>
                  <span class="text-[11px] font-bold tracking-wider text-indigo-600 uppercase">
                    ID {{ p.idProducto }} • {{ p.tipo || 'Sin tipo' }}
                  </span>
                  <h2 class="text-xl font-bold text-gray-900 mt-1 leading-snug">{{ p.nombre }}</h2>
                  <p class="text-xs text-gray-600 mt-1">{{ p.descripcion }}</p>
                </div>

                <div class="grid grid-cols-2 gap-3 my-3">
                  <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Costo</p>
                    <p class="text-lg font-bold text-gray-900 mt-0.5">{{ p.costo.toLocaleString() }} Bs</p>
                  </div>
                  <div class="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Venta</p>
                    <p class="text-lg font-bold text-indigo-700 mt-0.5">{{ p.venta.toLocaleString() }} Bs</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Tipo</p>
                <p class="text-sm font-bold text-gray-900">{{ p.tipo || '—' }}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Talla</p>
                <p class="text-sm font-bold text-gray-900">{{ p.talla || '—' }}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Color</p>
                <p class="text-sm font-bold text-gray-900">{{ p.color || '—' }}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Colección</p>
                <p class="text-sm font-bold text-gray-900">{{ p.coleccion_nombre }}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Proveedor</p>
                <p class="text-sm font-bold text-gray-900">{{ p.proveedor_nombre }}</p>
              </div>
            </div>

            <div *ngIf="p.imagenes_secundarias && p.imagenes_secundarias.length > 0" class="mt-6 pt-6 border-t border-gray-100">
              <h3 class="text-sm font-bold text-gray-900 mb-3">Imágenes Adicionales</h3>
              <div class="grid grid-cols-3 gap-2">
                <img *ngFor="let img of p.imagenes_secundarias" [src]="img" class="w-full h-24 object-cover rounded-lg border border-gray-200" />
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button (click)="inspectingItem.set(null)" class="px-4 py-2 bg-black hover:bg-black text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Agregar nuevo producto -->
    <div *ngIf="showCreateModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-xl w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative">
        <button (click)="showCreateModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Catálogo</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">Agregar Nuevo Producto</h2>
          <p class="text-xs text-gray-500">Poleras oversize y jeans. Podés reemplazar la foto sugerida con una imagen de tu dispositivo y subir un recorte para el probador.</p>
        </div>

        <form (ngSubmit)="saveNewProduct()" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre *</label>
              <input type="text" [(ngModel)]="newProduct.nombre" name="nombre" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Tipo</label>
              <select [(ngModel)]="newProduct.tipo" (ngModelChange)="onTipoNuevo()" name="tipo" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let t of tipos" [ngValue]="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Descripción</label>
            <textarea [(ngModel)]="newProduct.descripcion" name="descripcion" rows="2" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Costo (Bs) *</label>
              <input type="number" min="0" step="0.01" [(ngModel)]="newProduct.costo" name="costo" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Precio de Venta (Bs) *</label>
              <input type="number" min="0" step="0.01" [(ngModel)]="newProduct.venta" name="venta" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Talla</label>
              <select [(ngModel)]="newProduct.talla" name="talla" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let t of tallasNuevo()" [ngValue]="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Color</label>
              <select [(ngModel)]="newProduct.color" (ngModelChange)="onColorNuevo()" name="color" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let c of coloresNuevo()" [ngValue]="c">{{ c }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Proveedor *</label>
              <select [(ngModel)]="newProduct.idProveedor" name="idProveedor" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option [ngValue]="null" disabled>Seleccionar proveedor</option>
                <option *ngFor="let pr of archiveService.proveedores()" [ngValue]="pr.idProveedor">
                  {{ pr.nombre }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Colección *</label>
              <select [(ngModel)]="newProduct.idColeccion" name="idColeccion" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-[#18191d] focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option [ngValue]="null" disabled>Seleccionar colección</option>
                <option *ngFor="let c of archiveService.colecciones()" [ngValue]="c.idColeccion">
                  {{ c.nombre_coleccion }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Imagen del Producto</label>
            <div class="mt-1 flex items-center gap-3">
              <img *ngIf="newProduct.imagen_url" [src]="newProduct.imagen_url" class="w-14 h-14 rounded-lg object-contain bg-[#e6e2db] border border-gray-200" />
              <label class="flex-1 cursor-pointer px-3.5 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 text-center hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                <span *ngIf="uploadingImagen()">Subiendo...</span>
                <span *ngIf="!uploadingImagen()">{{ newProduct.imagen_url ? 'Cambiar imagen' : 'Seleccionar imagen (JPEG, PNG o WEBP)' }}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onImagenSelected($event)" [disabled]="uploadingImagen()" class="hidden" />
              </label>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Recorte para el probador móvil (opcional)</label>
            <p class="text-xs text-gray-500">Subí la prenda de frente y sin fondo, en PNG o WEBP transparente. Hasta 5 MB.</p>
            <img *ngIf="newProduct.imagen_probador_url" [src]="newProduct.imagen_probador_url" alt="Recorte del probador" class="h-28 w-full object-contain rounded-lg bg-gray-200" />
            <input type="file" accept="image/png,image/webp" (change)="onImagenSelected($event, 'probador')" [disabled]="uploadingProbador()" class="text-xs max-w-full" />
            <p *ngIf="uploadingProbador()" class="text-xs text-indigo-600">Subiendo recorte…</p>
          </div>

          <button type="submit" [disabled]="!newProduct.nombre || newProduct.costo == null || newProduct.venta == null || !newProduct.idProveedor || !newProduct.idColeccion || uploadingImagen() || uploadingProbador()" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4">
            Guardar Producto
          </button>
        </form>
      </div>
    </div>
  `
})
export class ArchiveComponent implements OnInit {
  inspectingItem = signal<ProductOut | null>(null);
  showCreateModal = signal<boolean>(false);
  uploadingImagen = signal<boolean>(false);
  uploadingProbador = signal(false);
  readonly usosImagen = ['catalogo', 'probador'] as const;
  readonly editandoFotos = signal<ProductOut | null>(null);
  readonly subiendoFotos = signal(false);
  readonly guardandoFotos = signal(false);
  fotosEdicion: Record<'catalogo' | 'probador', string | null> = { catalogo: null, probador: null };

  searchQuery = '';
  filterTipo = '';
  filterColor = '';

  readonly tipos = TIPOS_PRENDA;
  readonly coloresTienda = COLORES_TIENDA;

  // Declarados ANTES de newProduct: productoInicial() los fija y un
  // inicializador posterior los volveria a poner en null.
  private ultimoTipo: string | null = null;
  private ultimoColor: string | null = null;

  newProduct: Partial<ProductoIn> = this.productoInicial();

  /** Colores/tallas validos para el tipo elegido en el alta. */
  coloresNuevo(): string[] {
    return esTipoPrenda(this.newProduct.tipo) ? COLORES_POR_TIPO[this.newProduct.tipo] : COLORES_TIENDA;
  }

  tallasNuevo(): string[] {
    return esTipoPrenda(this.newProduct.tipo) ? TALLAS_POR_TIPO[this.newProduct.tipo] : [];
  }

  onTipoNuevo() {
    // Al cambiar de polera a jean, color y talla tienen que ser validos para el nuevo tipo.
    if (!this.coloresNuevo().includes(this.newProduct.color ?? '')) this.newProduct.color = this.coloresNuevo()[0];
    if (!this.tallasNuevo().includes(this.newProduct.talla ?? '')) this.newProduct.talla = this.tallasNuevo()[0];
    this.onColorNuevo();
  }

  /** Completa nombre y fotos del catalogo, salvo que el usuario haya subido una foto propia. */
  onColorNuevo() {
    const { tipo, color } = this.newProduct;
    const anterior = nombreSugerido(this.ultimoTipo, this.ultimoColor);
    if (!this.newProduct.nombre || this.newProduct.nombre === anterior) {
      this.newProduct.nombre = nombreSugerido(tipo, color);
    }
    if (!this.newProduct.imagen_url || this.newProduct.imagen_url.startsWith('/productos/')) {
      this.newProduct.imagen_url = imagenCatalogo(tipo, color) ?? '';
      const espalda = imagenEspalda(tipo, color);
      this.newProduct.imagenes_secundarias = espalda ? [espalda] : [];
    }
    this.ultimoTipo = tipo ?? null;
    this.ultimoColor = color ?? null;
  }

  private productoInicial(): Partial<ProductoIn> {
    const tipo = TIPO_POLERA;
    const color = COLORES_POR_TIPO[tipo][1];
    this.ultimoTipo = tipo;
    this.ultimoColor = color;
    return {
      nombre: nombreSugerido(tipo, color),
      descripcion: '',
      costo: 0,
      venta: 0,
      tipo,
      talla: TALLAS_POR_TIPO[tipo][1],
      color,
      idProveedor: null as unknown as number,
      idColeccion: null as unknown as number,
      imagen_url: imagenCatalogo(tipo, color) ?? '',
      imagenes_secundarias: [imagenEspalda(tipo, color) ?? ''].filter(Boolean),
    };
  }

  constructor(public archiveService: ArchiveService) {}

  ngOnInit() {
    this.archiveService.loadProducts();
    this.archiveService.loadProveedores();
    this.archiveService.loadColecciones();
  }

  filteredProducts = computed(() => {
    return this.archiveService.products();
  });

  onSearch() {
    this.archiveService.loadProducts({ q: this.searchQuery || undefined, tipo: this.filterTipo || undefined, color: this.filterColor || undefined });
  }

  onFilter() {
    this.archiveService.loadProducts({ q: this.searchQuery || undefined, tipo: this.filterTipo || undefined, color: this.filterColor || undefined });
  }

  inspectProduct(item: ProductOut) {
    this.inspectingItem.set(item);
  }

  openCreateModal() {
    this.showCreateModal.set(true);
  }

  async onImagenSelected(event: Event, uso: 'catalogo' | 'probador' = 'catalogo') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const subiendo = uso === 'probador' ? this.uploadingProbador : this.uploadingImagen;
    subiendo.set(true);
    const url = await this.archiveService.uploadImagen(file, uso);
    subiendo.set(false);
    input.value = '';

    if (url) {
      if (uso === 'probador') this.newProduct.imagen_probador_url = url;
      else this.newProduct.imagen_url = url;
    }
  }

  editarFotos(producto: ProductOut): void {
    this.fotosEdicion = { catalogo: producto.imagen_url, probador: producto.imagen_probador_url ?? null };
    this.editandoFotos.set(producto);
  }

  async subirFotoEdicion(event: Event, uso: 'catalogo' | 'probador'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.subiendoFotos() || this.guardandoFotos()) return;
    this.subiendoFotos.set(true);
    try {
      const url = await this.archiveService.uploadImagen(file, uso);
      if (url) this.fotosEdicion[uso] = url;
    } finally {
      this.subiendoFotos.set(false);
      input.value = '';
    }
  }

  async guardarFotos(): Promise<void> {
    const producto = this.editandoFotos();
    if (!producto || this.subiendoFotos() || this.guardandoFotos()) return;
    this.guardandoFotos.set(true);
    try {
      const actualizado = await this.archiveService.updateProduct(producto.idProducto, {
        imagen_url: this.fotosEdicion.catalogo,
        imagen_probador_url: this.fotosEdicion.probador,
      });
      if (actualizado) this.editandoFotos.set(null);
    } finally {
      this.guardandoFotos.set(false);
    }
  }

  saveNewProduct() {
    if (!this.newProduct.nombre || this.newProduct.costo == null || this.newProduct.venta == null || !this.newProduct.idProveedor || !this.newProduct.idColeccion) return;

    this.archiveService.addProduct({
      nombre: this.newProduct.nombre!,
      descripcion: this.newProduct.descripcion || null,
      costo: Number(this.newProduct.costo),
      venta: Number(this.newProduct.venta),
      tipo: this.newProduct.tipo || null,
      talla: this.newProduct.talla || null,
      color: this.newProduct.color || null,
      idProveedor: this.newProduct.idProveedor!,
      idColeccion: this.newProduct.idColeccion!,
      imagen_url: this.newProduct.imagen_url || null,
      imagen_probador_url: this.newProduct.imagen_probador_url || null,
      imagenes_secundarias: this.newProduct.imagenes_secundarias || [],
    }).then((ok) => {
      if (ok) {
        this.showCreateModal.set(false);
        this.resetForm();
      }
    });
  }

  private resetForm() {
    this.newProduct = this.productoInicial();
  }
}
