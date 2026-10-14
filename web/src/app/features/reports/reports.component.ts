import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsService } from '../../core/services/reports.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ArchiveService } from '../../core/services/archive.service';
import { InventarioReporteOut, VentaReporteOut } from '../../core/models';
import {
  InventoryReportFormState,
  REPORT_FILTER_ALL,
  SalesReportFormState,
  buildInventoryFiltros,
  buildSalesFiltros,
  validateDateRange,
} from './reports-filters';

type ReportsTab = 'ventas' | 'inventario';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Administración</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Reportes de Ventas e Inventario</h1>
          <p class="text-xs text-gray-500 mt-1">
            Reportes filtrables en pantalla, exportables a CSV y PDF.
          </p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-gray-200">
        <button
          (click)="activeTab.set('ventas')"
          [class.text-indigo-600]="activeTab() === 'ventas'"
          [class.border-indigo-600]="activeTab() === 'ventas'"
          [class.text-gray-500]="activeTab() !== 'ventas'"
          [class.border-transparent]="activeTab() !== 'ventas'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Ventas
        </button>
        <button
          (click)="activeTab.set('inventario')"
          [class.text-indigo-600]="activeTab() === 'inventario'"
          [class.border-indigo-600]="activeTab() === 'inventario'"
          [class.text-gray-500]="activeTab() !== 'inventario'"
          [class.border-transparent]="activeTab() !== 'inventario'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Inventario
        </button>
      </div>

      <!-- Filtros: Ventas -->
      <div *ngIf="activeTab() === 'ventas'" class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Desde</label>
            <input type="date" [(ngModel)]="salesForm.fechaDesde" name="fechaDesde" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasta</label>
            <input type="date" [(ngModel)]="salesForm.fechaHasta" name="fechaHasta" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sucursal</label>
            <select [(ngModel)]="salesForm.codigoSucursal" name="codigoSucursal" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option value="ALL">Todas</option>
              <option *ngFor="let loc of inventoryService.locations()" [value]="loc.codigoSucursal">{{ loc.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Producto</label>
            <select [(ngModel)]="salesForm.idProducto" name="idProducto" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option value="ALL">Todos</option>
              <option *ngFor="let p of archiveService.products()" [value]="p.idProducto">{{ p.nombre }}</option>
            </select>
          </div>
        </div>

        <p *ngIf="salesDateError()" class="text-xs text-rose-600 mt-3">{{ salesDateError() }}</p>

        <div class="flex flex-wrap items-center gap-2 mt-4">
          <button
            (click)="verVentas()"
            [disabled]="loadingSales()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
          >
            {{ loadingSales() ? 'Cargando...' : 'Ver' }}
          </button>
          <button
            (click)="descargarVentasCsv()"
            [disabled]="downloadingSalesCsv()"
            class="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingSalesCsv() ? 'Descargando...' : 'Descargar CSV' }}
          </button>
          <button
            (click)="descargarVentasPdf()"
            [disabled]="downloadingSalesPdf()"
            class="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingSalesPdf() ? 'Descargando...' : 'Descargar PDF' }}
          </button>
        </div>
      </div>

      <!-- Tabla: Ventas -->
      <div *ngIf="activeTab() === 'ventas'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Producto</th>
                <th class="p-3.5">Sucursal</th>
                <th class="p-3.5 text-right">Cantidad Vendida</th>
                <th class="p-3.5 text-right pr-6">Monto</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let f of salesReport()?.filas ?? []" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6 font-bold text-gray-900">{{ f.producto_nombre }}</td>
                <td class="p-3.5 text-gray-700">{{ f.sucursal_nombre }}</td>
                <td class="p-3.5 text-right text-gray-700">{{ f.cantidad_vendida }}</td>
                <td class="p-3.5 text-right pr-6 text-gray-900 font-semibold">Bs {{ f.monto.toFixed(2) }}</td>
              </tr>
            </tbody>
            <tfoot *ngIf="salesReport()">
              <tr class="bg-gray-50 border-t border-gray-200 text-xs font-bold text-gray-900">
                <td class="p-3.5 pl-6" colspan="2">TOTAL</td>
                <td class="p-3.5 text-right">{{ salesReport()!.total_items }}</td>
                <td class="p-3.5 text-right pr-6">Bs {{ salesReport()!.total_monto.toFixed(2) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div *ngIf="salesReport() && salesReport()!.filas.length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay ventas para los filtros aplicados.
        </div>
        <div *ngIf="!salesReport()" class="text-center py-12 text-gray-400 text-sm">
          Aplicá filtros y presioná "Ver" para generar el reporte.
        </div>
      </div>

      <!-- Filtros: Inventario -->
      <div *ngIf="activeTab() === 'inventario'" class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sucursal</label>
            <select [(ngModel)]="inventoryForm.codigoSucursal" name="invCodigoSucursal" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option value="ALL">Todas</option>
              <option *ngFor="let loc of inventoryService.locations()" [value]="loc.codigoSucursal">{{ loc.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Producto</label>
            <select [(ngModel)]="inventoryForm.idProducto" name="invIdProducto" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option value="ALL">Todos</option>
              <option *ngFor="let p of archiveService.products()" [value]="p.idProducto">{{ p.nombre }}</option>
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 mt-4">
          <button
            (click)="verInventario()"
            [disabled]="loadingInventory()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
          >
            {{ loadingInventory() ? 'Cargando...' : 'Ver' }}
          </button>
          <button
            (click)="descargarInventarioCsv()"
            [disabled]="downloadingInventoryCsv()"
            class="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingInventoryCsv() ? 'Descargando...' : 'Descargar CSV' }}
          </button>
          <button
            (click)="descargarInventarioPdf()"
            [disabled]="downloadingInventoryPdf()"
            class="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingInventoryPdf() ? 'Descargando...' : 'Descargar PDF' }}
          </button>
        </div>
      </div>

      <!-- Tabla: Inventario -->
      <div *ngIf="activeTab() === 'inventario'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Producto</th>
                <th class="p-3.5">Sucursal</th>
                <th class="p-3.5 text-right">Cantidad Actual</th>
                <th class="p-3.5 text-right pr-6">Cantidad Reservada</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let f of inventoryReport()?.filas ?? []" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6 font-bold text-gray-900">{{ f.producto_nombre }}</td>
                <td class="p-3.5 text-gray-700">{{ f.sucursal_nombre }}</td>
                <td class="p-3.5 text-right text-gray-700">{{ f.cantidad_actual }}</td>
                <td class="p-3.5 text-right pr-6 text-gray-700">{{ f.cantidad_reservada }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="inventoryReport() && inventoryReport()!.filas.length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay stock para los filtros aplicados.
        </div>
        <div *ngIf="!inventoryReport()" class="text-center py-12 text-gray-400 text-sm">
          Aplicá filtros y presioná "Ver" para generar el reporte.
        </div>
      </div>

    </div>
  `
})
export class ReportsComponent implements OnInit {
  activeTab = signal<ReportsTab>('ventas');

  salesForm: SalesReportFormState = { fechaDesde: '', fechaHasta: '', codigoSucursal: REPORT_FILTER_ALL, idProducto: REPORT_FILTER_ALL };
  inventoryForm: InventoryReportFormState = { codigoSucursal: REPORT_FILTER_ALL, idProducto: REPORT_FILTER_ALL };

  salesReport = signal<VentaReporteOut | null>(null);
  inventoryReport = signal<InventarioReporteOut | null>(null);

  loadingSales = signal<boolean>(false);
  loadingInventory = signal<boolean>(false);
  salesDateError = signal<string | null>(null);

  downloadingSalesCsv = signal<boolean>(false);
  downloadingSalesPdf = signal<boolean>(false);
  downloadingInventoryCsv = signal<boolean>(false);
  downloadingInventoryPdf = signal<boolean>(false);

  constructor(
    private reportsService: ReportsService,
    public inventoryService: InventoryService,
    public archiveService: ArchiveService,
  ) {}

  ngOnInit() {
    // Sucursales y productos alimentan los selects de filtro de ambos
    // reportes. Reutiliza InventoryService (ya expone /api/inventory/locations,
    // usado por Inventario/Logística) y ArchiveService (ya expone
    // /api/products, usado por Archivo y Catálogo) en vez de crear un
    // fetch de productos/sucursales nuevo.
    this.inventoryService.loadLocations();
    this.archiveService.loadProducts({ size: 100 });
    this.verVentas();
  }

  verVentas() {
    const error = validateDateRange(this.salesForm.fechaDesde, this.salesForm.fechaHasta);
    this.salesDateError.set(error);
    if (error) return;

    this.loadingSales.set(true);
    this.reportsService.getSalesReport(buildSalesFiltros(this.salesForm)).then((res) => {
      this.loadingSales.set(false);
      this.salesReport.set(res);
    });
  }

  verInventario() {
    this.loadingInventory.set(true);
    this.reportsService.getInventoryReport(buildInventoryFiltros(this.inventoryForm)).then((res) => {
      this.loadingInventory.set(false);
      this.inventoryReport.set(res);
    });
  }

  descargarVentasCsv() {
    const error = validateDateRange(this.salesForm.fechaDesde, this.salesForm.fechaHasta);
    this.salesDateError.set(error);
    if (error) return;

    this.downloadingSalesCsv.set(true);
    this.reportsService.downloadSalesCsv(buildSalesFiltros(this.salesForm)).then(() => {
      this.downloadingSalesCsv.set(false);
    });
  }

  descargarVentasPdf() {
    const error = validateDateRange(this.salesForm.fechaDesde, this.salesForm.fechaHasta);
    this.salesDateError.set(error);
    if (error) return;

    this.downloadingSalesPdf.set(true);
    this.reportsService.downloadSalesPdf(buildSalesFiltros(this.salesForm)).then(() => {
      this.downloadingSalesPdf.set(false);
    });
  }

  descargarInventarioCsv() {
    this.downloadingInventoryCsv.set(true);
    this.reportsService.downloadInventoryCsv(buildInventoryFiltros(this.inventoryForm)).then(() => {
      this.downloadingInventoryCsv.set(false);
    });
  }

  descargarInventarioPdf() {
    this.downloadingInventoryPdf.set(true);
    this.reportsService.downloadInventoryPdf(buildInventoryFiltros(this.inventoryForm)).then(() => {
      this.downloadingInventoryPdf.set(false);
    });
  }
}
