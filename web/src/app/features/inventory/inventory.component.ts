import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { ArchiveService } from '../../core/services/archive.service';
import { InventoryStockEntry } from '../../core/models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Red Multi-Sucursal</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Matriz Global de Asignación de Stock</h1>
          <p class="text-xs text-gray-500 mt-1">
            Conteos de inventario en tiempo real en todas las sucursales registradas.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            (click)="openLoteModal()"
            class="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">inventory_2</span>
            <span>Ingreso de Lote</span>
          </button>
          <button
            (click)="openTransferModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">swap_horiz</span>
            <span>Transferencia</span>
          </button>
        </div>
      </div>

      <!-- Chips de filtro por ubicación -->
      <div class="flex flex-wrap items-center gap-2 bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <span class="text-xs font-bold uppercase tracking-wider text-gray-400 mr-1">Filtrar por nodo:</span>
        <button
          (click)="selectedLocation.set('ALL')"
          [class.bg-indigo-600]="selectedLocation() === 'ALL'"
          [class.text-white]="selectedLocation() === 'ALL'"
          [class.text-gray-600]="selectedLocation() !== 'ALL'"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
        >
          Todos los nodos (Global)
        </button>
        <button
          *ngFor="let loc of inventoryService.locations()"
          (click)="selectedLocation.set(loc.codigoSucursal.toString())"
          [class.bg-indigo-600]="selectedLocation() === loc.codigoSucursal.toString()"
          [class.text-white]="selectedLocation() === loc.codigoSucursal.toString()"
          [class.text-gray-600]="selectedLocation() !== loc.codigoSucursal.toString()"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
        >
          {{ loc.nombre }}
        </button>
      </div>

      <!-- Tabla de inventario -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Producto</th>
                <th class="p-3.5">Sucursal</th>
                <th class="p-3.5">Tipo / Talla / Color</th>
                <th class="p-3.5 text-center">Stock Actual</th>
                <th class="p-3.5 text-center">Reservado</th>
                <th class="p-3.5 text-right pr-6">Ajuste Rápido</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let item of filteredStock()" class="hover:bg-gray-50/70 transition-colors">

                <td class="p-3.5 pl-6">
                  <div class="flex items-center space-x-3">
                    <img
                      [src]="item.producto_imagen || 'https://images.unsplash.com/photo-1544441893-675973e31985?w=200&auto=format&fit=crop&q=80'"
                      [alt]="item.producto_nombre"
                      class="w-10 h-10 rounded-lg object-cover bg-gray-100 border border-gray-200 shrink-0"
                    />
                    <div>
                      <span class="text-[10px] font-bold uppercase text-indigo-600 tracking-wider">
                        ID {{ item.idProducto }}
                      </span>
                      <p class="font-bold text-gray-900 leading-tight">{{ item.producto_nombre }}</p>
                    </div>
                  </div>
                </td>

                <td class="p-3.5">
                  <p class="font-bold text-gray-900">{{ item.sucursal_nombre }}</p>
                  <p class="text-[11px] text-gray-500">Cód. {{ item.codigoSucursal }}</p>
                </td>

                <td class="p-3.5 text-xs text-gray-700">
                  <span *ngIf="item.producto_tipo">{{ item.producto_tipo }}</span>
                  <span *ngIf="item.producto_talla" class="ml-1 px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">{{ item.producto_talla }}</span>
                  <span *ngIf="item.producto_color" class="ml-1 text-gray-500">{{ item.producto_color }}</span>
                </td>

                <td class="p-3.5 text-center font-bold text-sm text-gray-900">
                  {{ item.cantidad_actual }}
                </td>

                <td class="p-3.5 text-center text-xs text-gray-500">
                  {{ item.cantidad_reservada }}
                </td>

                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                    <button
                      (click)="adjustStock(item, -1)"
                      class="w-6 h-6 rounded bg-white hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors cursor-pointer text-xs shadow-xs"
                      title="Reducir 1 unidad"
                    >-</button>
                    <span class="px-2 text-xs font-bold text-gray-900 min-w-[24px] text-center">{{ item.cantidad_actual }}</span>
                    <button
                      (click)="adjustStock(item, 1)"
                      class="w-6 h-6 rounded bg-white hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors cursor-pointer text-xs shadow-xs"
                      title="Agregar 1 unidad"
                    >+</button>
                  </div>
                </td>

              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="filteredStock().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No se encontraron registros de inventario.
        </div>
      </div>

    </div>

    <!-- Modal: Ingreso de Lote (stock inicial / reabastecimiento) -->
    <div *ngIf="showLoteModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-lg w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showLoteModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Proveedores</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">Ingreso de Lote</h2>
          <p class="text-xs text-gray-500">Registre stock inicial o reabastecimiento para un producto en una sucursal.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Producto</label>
            <select [(ngModel)]="loteProductoId" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option *ngFor="let p of archiveService.products()" [ngValue]="p.idProducto">
                {{ p.nombre }} ({{ p.tipo || 'Sin tipo' }} - {{ p.talla || 'S/T' }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal</label>
              <select [(ngModel)]="loteSucursal" class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Cantidad (Piezas)</label>
              <input type="number" min="1" [(ngModel)]="loteCantidad" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Proveedor (opcional)</label>
            <select [(ngModel)]="loteProveedor" class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option [ngValue]="null">Sin especificar</option>
              <option *ngFor="let pr of archiveService.proveedores()" [ngValue]="pr.idProveedor">
                {{ pr.nombre }}
              </option>
            </select>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Motivo</label>
            <input type="text" [(ngModel)]="loteMotivo" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Recepción de lote inicial..." />
          </div>

          <button
            (click)="executeIngresoLote()"
            [disabled]="!loteProductoId || !loteSucursal || loteCantidad < 1"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            Registrar Ingreso
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Transferencia entre sucursales -->
    <div *ngIf="showTransferModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-lg w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showTransferModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Logística Interna</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">Transferencia entre Sucursales</h2>
          <p class="text-xs text-gray-500">Registre un despacho de transferencia entre ubicaciones.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Producto</label>
            <select [(ngModel)]="transferProductoId" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option *ngFor="let p of archiveService.products()" [ngValue]="p.idProducto">
                {{ p.nombre }} ({{ p.tipo || 'Sin tipo' }} - {{ p.talla || 'S/T' }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal Origen</label>
              <select [(ngModel)]="transferOrigen" class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal Destino</label>
              <select [(ngModel)]="transferDestino" class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Cantidad (Piezas)</label>
            <input type="number" min="1" [(ngModel)]="transferCantidad" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Motivo</label>
            <input type="text" [(ngModel)]="transferMotivo" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Reabastecimiento,平衡eo..." />
          </div>

          <button
            (click)="executeTransfer()"
            [disabled]="transferOrigen === transferDestino || !transferProductoId"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            Registrar Transferencia
          </button>
        </div>
      </div>
    </div>
  `
})
export class InventoryComponent implements OnInit {
  selectedLocation = signal<string>('ALL');
  showTransferModal = signal<boolean>(false);
  showLoteModal = signal<boolean>(false);

  transferProductoId: number | null = null;
  transferOrigen: number | null = null;
  transferDestino: number | null = null;
  transferCantidad = 1;
  transferMotivo = '';

  loteProductoId: number | null = null;
  loteSucursal: number | null = null;
  loteCantidad = 1;
  loteProveedor: number | null = null;
  loteMotivo = '';

  constructor(
    public inventoryService: InventoryService,
    public archiveService: ArchiveService
  ) {}

  ngOnInit() {
    this.inventoryService.loadLocations();
    this.inventoryService.loadStock();
    this.archiveService.loadProducts();
    this.archiveService.loadProveedores();
  }

  filteredStock = computed(() => {
    let list = this.inventoryService.stock();
    if (this.selectedLocation() !== 'ALL') {
      const locId = Number(this.selectedLocation());
      list = list.filter(s => s.codigoSucursal === locId);
    }
    return list;
  });

  adjustStock(item: InventoryStockEntry, delta: number) {
    const newCantidad = item.cantidad_actual + delta;
    if (newCantidad < 0) return;
    this.inventoryService.adjustStock(item.idInv, newCantidad, 'Ajuste rápido desde UI');
  }

  openLoteModal() {
    this.showLoteModal.set(true);
    if (this.inventoryService.locations().length > 0 && !this.loteSucursal) {
      this.loteSucursal = this.inventoryService.locations()[0].codigoSucursal;
    }
  }

  executeIngresoLote() {
    if (!this.loteProductoId || !this.loteSucursal || this.loteCantidad < 1) return;

    this.inventoryService.receiveStock(
      this.loteProductoId,
      this.loteSucursal,
      this.loteCantidad,
      this.loteProveedor,
      this.loteMotivo || 'Ingreso de lote'
    ).then((ok) => {
      if (ok) {
        this.showLoteModal.set(false);
        this.loteProductoId = null;
        this.loteProveedor = null;
        this.loteMotivo = '';
        this.loteCantidad = 1;
      }
    });
  }

  openTransferModal() {
    this.showTransferModal.set(true);
    if (this.inventoryService.locations().length > 0 && !this.transferOrigen) {
      this.transferOrigen = this.inventoryService.locations()[0].codigoSucursal;
      this.transferDestino = this.inventoryService.locations().length > 1
        ? this.inventoryService.locations()[1].codigoSucursal
        : this.inventoryService.locations()[0].codigoSucursal;
    }
  }

  executeTransfer() {
    if (!this.transferProductoId || !this.transferOrigen || !this.transferDestino) return;
    if (this.transferOrigen === this.transferDestino) return;

    this.inventoryService.transferStock(
      this.transferProductoId,
      this.transferOrigen,
      this.transferDestino,
      this.transferCantidad,
      this.transferMotivo || 'Transferencia entre sucursales'
    ).then((ok) => {
      if (ok) {
        this.showTransferModal.set(false);
        this.transferMotivo = '';
        this.transferCantidad = 1;
      }
    });
  }
}
