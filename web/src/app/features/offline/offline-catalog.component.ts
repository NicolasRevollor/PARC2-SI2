import { Component, OnInit, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OfflineSyncService, ProductoLocal } from '../../core/services/offline-sync.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const IMAGEN_GENERICA = '/productos/sin-imagen.jpg';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU13] Consultar catalogo, precios y existencias sin conexion
// Boundary: CatalogoLocalUI -> este componente
// Control: OfflineSyncService.catalogoLocal() y existencias() (lo descargado menos lo registrado aqui)
// ==================================================================
@Component({
  selector: 'app-offline-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <app-cu-badge cu="CU13" [conNombre]="true"></app-cu-badge>
        <span *ngIf="!offlineSync.enLinea()" class="ys-chip border-amber-300 text-amber-700">Modo sin conexión</span>
        <span class="text-[11px] text-gray-500" data-testid="fecha-datos">Actualizado: {{ offlineSync.ultimaSync() ? (offlineSync.ultimaSync() | date: 'dd/MM/yyyy HH:mm') : 'nunca' }}</span>
        <button *ngIf="offlineSync.enLinea() && offlineSync.preparacion()" (click)="actualizar()" class="ys-btn-sec">Actualizar datos</button>
      </div>
      <p *ngIf="offlineSync.desactualizado()" class="text-xs font-bold text-amber-700">La información puede estar desactualizada.</p>

      <input [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" name="buscar" class="ys-campo max-w-xl"
             placeholder="Nombre, código, categoría, talla o color" />

      <p *ngIf="!productos().length" class="text-sm text-gray-400">Todavía no se descargó el catálogo. Prepare el dispositivo primero (CU12).</p>
      <p *ngIf="productos().length && !filtrados().length" class="text-sm text-gray-400">Ese producto no está disponible sin conexión.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div *ngFor="let p of filtrados()" class="ys-tarjeta p-3 flex gap-3">
          <img [src]="p.imagen_url || generica" (error)="sinImagen($event)" alt="" class="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-gray-900 truncate">{{ p.nombre }}</p>
            <p class="text-[11px] text-gray-500">{{ p.codigo }} · {{ p.tipo || 'Sin categoría' }}</p>
            <p class="text-[11px] text-gray-500">Talla {{ p.talla || '—' }} · {{ p.color || '—' }}</p>
            <div class="flex justify-between items-center mt-1">
              <span class="text-sm font-bold text-gray-900">Bs {{ p.venta.toFixed(2) }}</span>
              <span class="text-[11px] font-bold" [ngClass]="(stock().get(p.idProducto) ?? 0) > 0 ? 'text-emerald-600' : 'text-rose-600'">
                Existencia: {{ stock().get(p.idProducto) ?? 0 }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <p *ngIf="resultados().length > filtrados().length" class="text-xs text-gray-400">Mostrando {{ filtrados().length }} de {{ resultados().length }}: afine la búsqueda.</p>
    </div>
  `,
})
export class OfflineCatalogComponent implements OnInit {
  readonly generica = IMAGEN_GENERICA;
  readonly productos = signal<ProductoLocal[]>([]);
  readonly stock = signal<Map<number, number>>(new Map());
  readonly busqueda = signal('');

  readonly resultados = computed(() => {
    const terminos = this.busqueda().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.productos().filter(p => {
      const texto = [p.nombre, p.codigo, p.tipo, p.talla, p.color].join(' ').toLowerCase();
      return terminos.every(t => texto.includes(t));
    });
  });
  readonly filtrados = computed(() => this.resultados().slice(0, 60));

  constructor(public offlineSync: OfflineSyncService) {
    // La existencia cambia con cada operación registrada en el dispositivo.
    effect(() => {
      this.offlineSync.operaciones();
      void this.cargarStock();
    });
  }

  async ngOnInit(): Promise<void> {
    this.productos.set(await this.offlineSync.catalogoLocal());
  }

  private async cargarStock(): Promise<void> {
    this.stock.set(await this.offlineSync.existencias());
  }

  sinImagen(evento: Event): void {
    (evento.target as HTMLImageElement).src = IMAGEN_GENERICA;
  }

  async actualizar(): Promise<void> {
    const prep = this.offlineSync.preparacion();
    if (prep && (await this.offlineSync.preparar(prep.codigoSucursal))) {
      this.productos.set(await this.offlineSync.catalogoLocal());
      await this.cargarStock();
    }
  }
}
