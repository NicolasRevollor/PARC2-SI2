import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReturnsService } from '../../core/services/returns.service';
import { InventarioDevolucion, NoVendible } from '../../core/models';

/**
 * CU10 — Inventario por devolución: lo apto volvió al stock vendible; lo
 * defectuoso o deteriorado está en el inventario no vendible, con el
 * seguimiento del reclamo al proveedor.
 */
@Component({
  selector: 'app-return-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="ys-tarjeta p-3.5 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1"><span class="ys-mini">Desde</span><input type="date" [(ngModel)]="desde" class="ys-filtro" /></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Hasta</span><input type="date" [(ngModel)]="hasta" class="ys-filtro" /></div>
        <button (click)="cargar()" class="ys-btn">Ver</button>
      </div>

      <div *ngIf="datos() as d" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="ys-tarjeta p-4"><p class="ys-mini">Volvieron a la venta</p><p class="text-2xl font-bold text-emerald-700">{{ d.vendible }}</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Defecto de fábrica</p><p class="text-2xl font-bold text-amber-700">{{ d.defecto }}</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Deterioradas</p><p class="text-2xl font-bold text-rose-600">{{ d.deterioro }}</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Reclamos pendientes</p><p class="text-2xl font-bold text-gray-900">{{ d.reclamosPendientes }}</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Por recibir</p><p class="text-2xl font-bold text-gray-900">{{ d.porRecibir }}</p></div>
      </div>

      <div class="ys-tarjeta overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100">
          <p class="text-sm font-bold text-gray-900">Inventario no vendible</p>
          <p class="text-xs text-gray-500">Merma y prendas con defecto de fábrica (reclamo al proveedor).</p>
        </div>
        <div *ngIf="!(datos()?.noVendibles?.length)" class="p-6 text-center text-sm text-gray-500">Sin prendas no vendibles.</div>
        <div *ngIf="datos()?.noVendibles?.length" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left ys-mini"><th class="px-4 py-2.5">Fecha</th><th class="px-4 py-2.5">Prenda</th><th class="px-4 py-2.5">Sucursal</th>
                <th class="px-4 py-2.5">Motivo</th><th class="px-4 py-2.5">Proveedor</th><th class="px-4 py-2.5">Caso</th><th class="px-4 py-2.5">Estado</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let n of datos()!.noVendibles">
                <td class="px-4 py-2.5 text-gray-700">{{ n.fecha | date: 'dd/MM/yy' }}</td>
                <td class="px-4 py-2.5 text-gray-900">{{ n.producto }} {{ n.talla }} · {{ n.cantidad }} u.
                  <span *ngIf="n.observaciones" class="block text-[10px] text-gray-500">{{ n.observaciones }}</span></td>
                <td class="px-4 py-2.5 text-gray-500">{{ n.sucursal }}</td>
                <td class="px-4 py-2.5">{{ n.motivo === 'defecto' ? 'Defecto de fábrica' : 'Deterioro' }}</td>
                <td class="px-4 py-2.5 text-gray-500">{{ n.proveedor || '—' }}</td>
                <td class="px-4 py-2.5 font-mono text-gray-500">{{ n.codigoCaso }}</td>
                <td class="px-4 py-2.5">
                  <select *ngIf="puedeGestionar; else soloLectura" [ngModel]="n.estado" (ngModelChange)="actualizar(n, $event)" class="ys-filtro">
                    <option *ngFor="let e of estadosNoVendible" [ngValue]="e">{{ e }}</option>
                  </select>
                  <ng-template #soloLectura>{{ n.estado }}</ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ys-tarjeta overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><p class="text-sm font-bold text-gray-900">Prendas devueltas por producto y sucursal</p></div>
        <div *ngIf="datos()?.filas?.length" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left ys-mini"><th class="px-4 py-2.5">Prenda</th><th class="px-4 py-2.5">Sucursal</th>
                <th class="px-4 py-2.5 text-right">Vendible</th><th class="px-4 py-2.5 text-right">No vendible</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let f of datos()!.filas">
                <td class="px-4 py-2.5 text-gray-900">{{ f.producto }} <span class="font-mono font-bold">{{ f.talla }}</span></td>
                <td class="px-4 py-2.5 text-gray-500">{{ f.sucursal }}</td>
                <td class="px-4 py-2.5 text-right text-emerald-700 font-bold">{{ f.vendible || '—' }}</td>
                <td class="px-4 py-2.5 text-right text-rose-600 font-bold">{{ f.noVendible || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ReturnInventoryComponent implements OnInit {
  @Input() puedeGestionar = false;
  readonly estadosNoVendible: NoVendible['estado'][] = ['Pendiente', 'Reclamado', 'Repuesto', 'Desechado'];
  readonly datos = signal<InventarioDevolucion | null>(null);
  desde = '';
  hasta = '';

  constructor(private returnsService: ReturnsService) {}

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.datos.set(await this.returnsService.inventario(this.desde || undefined, this.hasta || undefined));
  }

  async actualizar(n: NoVendible, estado: NoVendible['estado']): Promise<void> {
    if (await this.returnsService.actualizarNoVendible(n.idNoVendible, estado)) await this.cargar();
  }
}
