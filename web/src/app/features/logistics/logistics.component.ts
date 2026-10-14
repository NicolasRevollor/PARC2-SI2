import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DispatchService } from '../../core/services/dispatch.service';
import { ArchiveService } from '../../core/services/archive.service';
import { InventoryService } from '../../core/services/inventory.service';
import { DispatchIn, DispatchItem } from '../../core/models';

@Component({
  selector: 'app-logistics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Cumplimiento Global</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Despachos y Operaciones Logísticas</h1>
          <p class="text-xs text-gray-500 mt-1">
            Tránsito seguro de alto valor y transferencias regionales entre sucursales.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            (click)="openNewDispatchModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add_box</span>
            <span>Registrar Despacho</span>
          </button>
        </div>
      </div>

      <!-- Lista de despachos -->
      <div class="space-y-4">
        <div
          *ngFor="let order of dispatchService.dispatches()"
          class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs hover:border-gray-300 transition-all space-y-4"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-gray-100">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-100">
                <span class="material-symbols-outlined text-[20px]">local_shipping</span>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-bold text-gray-900">{{ order.referencia }}</span>
                  <span class="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">
                    Despacho
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">
                  Fecha: {{ order.fecha | date:'medium' }}
                </p>
              </div>
            </div>
          </div>

          <div *ngIf="order.motivo" class="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Motivo</p>
            <p class="text-xs text-gray-700">{{ order.motivo }}</p>
          </div>

          <div *ngIf="order.movimientos && order.movimientos.length > 0" class="space-y-2">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Movimientos</p>
            <div *ngFor="let mov of order.movimientos" class="flex items-center justify-between text-xs p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <div class="flex items-center space-x-2">
                <span class="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold uppercase">{{ mov.tipo }}</span>
                <span class="font-semibold text-gray-900">{{ mov.producto_nombre }}</span>
              </div>
              <div class="flex items-center space-x-3 text-gray-500">
                <span>{{ mov.sucursal_nombre }}</span>
                <span class="font-bold text-gray-900">× {{ mov.cantidad }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="dispatchService.dispatches().length === 0" class="text-center py-12 text-gray-400 text-sm">
        No hay despachos registrados.
      </div>

    </div>

    <!-- Modal: Registrar nuevo despacho -->
    <div *ngIf="showNewDispatchModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-lg w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative">
        <button (click)="showNewDispatchModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Cumplimiento Seguro</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">Registrar Despacho</h2>
          <p class="text-xs text-gray-500">Registre un nuevo despacho entre sucursales.</p>
        </div>

        <form (ngSubmit)="submitNewDispatch()" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal Origen</label>
              <select [(ngModel)]="newOrigen" name="origen" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursal Destino</label>
              <select [(ngModel)]="newDestino" name="destino" required class="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option *ngFor="let loc of inventoryService.locations()" [ngValue]="loc.codigoSucursal">
                  {{ loc.nombre }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Motivo</label>
            <input type="text" [(ngModel)]="newMotivo" name="motivo" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Reabastecimiento, transferencia..." />
          </div>

          <div class="border border-gray-200 rounded-lg p-3 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-bold text-gray-700 uppercase tracking-wide">Items del Despacho</p>
              <button type="button" (click)="addItem()" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                + Agregar item
              </button>
            </div>

            <div *ngFor="let item of newItems; let i = index" class="grid grid-cols-7 gap-2 items-end">
              <div class="col-span-4">
                <label *ngIf="i === 0" class="text-[10px] font-bold text-gray-500 uppercase">Producto</label>
                <select [(ngModel)]="item.idProducto" [name]="'item_producto_' + i" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option *ngFor="let p of archiveService.products()" [ngValue]="p.idProducto">
                    {{ p.nombre }}
                  </option>
                </select>
              </div>
              <div class="col-span-2">
                <label *ngIf="i === 0" class="text-[10px] font-bold text-gray-500 uppercase">Cantidad</label>
                <input type="number" min="1" [(ngModel)]="item.cantidad" [name]="'item_cantidad_' + i" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div class="col-span-1">
                <button *ngIf="newItems.length > 1" type="button" (click)="removeItem(i)" class="w-full py-1.5 text-red-400 hover:text-red-600 text-xs font-bold cursor-pointer">✕</button>
              </div>
            </div>
          </div>

          <button type="submit" [disabled]="newOrigen === newDestino || newItems.length === 0" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4">
            Registrar Despacho
          </button>
        </form>
      </div>
    </div>
  `
})
export class LogisticsComponent implements OnInit {
  showNewDispatchModal = signal<boolean>(false);

  newOrigen: number | null = null;
  newDestino: number | null = null;
  newMotivo = '';
  newItems: DispatchItem[] = [{ idProducto: 1, cantidad: 1 }];

  constructor(
    public dispatchService: DispatchService,
    public archiveService: ArchiveService,
    public inventoryService: InventoryService
  ) {}

  ngOnInit() {
    this.dispatchService.loadDispatches();
    this.archiveService.loadProducts();
    this.inventoryService.loadLocations();
  }

  openNewDispatchModal() {
    this.showNewDispatchModal.set(true);
    if (this.inventoryService.locations().length > 0 && !this.newOrigen) {
      this.newOrigen = this.inventoryService.locations()[0].codigoSucursal;
      this.newDestino = this.inventoryService.locations().length > 1
        ? this.inventoryService.locations()[1].codigoSucursal
        : this.inventoryService.locations()[0].codigoSucursal;
    }
  }

  addItem() {
    this.newItems.push({ idProducto: 1, cantidad: 1 });
  }

  removeItem(index: number) {
    this.newItems.splice(index, 1);
  }

  submitNewDispatch() {
    if (!this.newOrigen || !this.newDestino || this.newOrigen === this.newDestino) return;
    if (this.newItems.length === 0) return;

    const validItems = this.newItems.filter(i => i.idProducto && i.cantidad > 0);
    if (validItems.length === 0) return;

    this.dispatchService.createDispatch({
      origen: this.newOrigen,
      destino: this.newDestino,
      items: validItems,
      motivo: this.newMotivo || null,
    }).then(() => {
      this.showNewDispatchModal.set(false);
      this.newMotivo = '';
      this.newItems = [{ idProducto: 1, cantidad: 1 }];
    });
  }
}
