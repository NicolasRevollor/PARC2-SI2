import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsService } from '../../core/services/reports.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ArchiveService } from '../../core/services/archive.service';
import { AnalisisSucursales, ConsolidadoSucursales, InventarioReporteOut, VentaReporteOut } from '../../core/models';
import { TenantService } from '../../core/services/tenant.service';
import {
  InventoryReportFormState,
  REPORT_FILTER_ALL,
  SalesReportFormState,
  buildInventoryFiltros,
  buildSalesFiltros,
  validateDateRange,
} from './reports-filters';

type ReportsTab = 'ventas' | 'inventario' | 'sucursales';

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
        <button
          (click)="abrirConsolidado()"
          [class.text-indigo-600]="activeTab() === 'sucursales'"
          [class.border-indigo-600]="activeTab() === 'sucursales'"
          [class.text-gray-500]="activeTab() !== 'sucursales'"
          [class.border-transparent]="activeTab() !== 'sucursales'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          Multi-sucursal
          <span class="material-symbols-outlined text-[14px] text-indigo-600">auto_awesome</span>
        </button>
      </div>

      <!-- Filtros: Ventas -->
      <div *ngIf="activeTab() === 'ventas'" class="bg-[#18191d] rounded-xl border border-gray-200 p-5 shadow-xs">
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
            <select [(ngModel)]="salesForm.codigoSucursal" name="codigoSucursal" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-[#18191d]">
              <option value="ALL">Todas</option>
              <option *ngFor="let loc of inventoryService.locations()" [value]="loc.codigoSucursal">{{ loc.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Producto</label>
            <select [(ngModel)]="salesForm.idProducto" name="idProducto" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-[#18191d]">
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
            class="px-4 py-2 bg-[#18191d] hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingSalesCsv() ? 'Descargando...' : 'Descargar CSV' }}
          </button>
          <button
            (click)="descargarVentasPdf()"
            [disabled]="downloadingSalesPdf()"
            class="px-4 py-2 bg-[#18191d] hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingSalesPdf() ? 'Descargando...' : 'Descargar PDF' }}
          </button>
        </div>
      </div>

      <!-- Tabla: Ventas -->
      <div *ngIf="activeTab() === 'ventas'" class="bg-[#18191d] rounded-xl border border-gray-200 shadow-xs overflow-hidden">
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
      <div *ngIf="activeTab() === 'inventario'" class="bg-[#18191d] rounded-xl border border-gray-200 p-5 shadow-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sucursal</label>
            <select [(ngModel)]="inventoryForm.codigoSucursal" name="invCodigoSucursal" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-[#18191d]">
              <option value="ALL">Todas</option>
              <option *ngFor="let loc of inventoryService.locations()" [value]="loc.codigoSucursal">{{ loc.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Producto</label>
            <select [(ngModel)]="inventoryForm.idProducto" name="invIdProducto" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-[#18191d]">
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
            class="px-4 py-2 bg-[#18191d] hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingInventoryCsv() ? 'Descargando...' : 'Descargar CSV' }}
          </button>
          <button
            (click)="descargarInventarioPdf()"
            [disabled]="downloadingInventoryPdf()"
            class="px-4 py-2 bg-[#18191d] hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ downloadingInventoryPdf() ? 'Descargando...' : 'Descargar PDF' }}
          </button>
        </div>
      </div>

      <!-- Tabla: Inventario -->
      <div *ngIf="activeTab() === 'inventario'" class="bg-[#18191d] rounded-xl border border-gray-200 shadow-xs overflow-hidden">
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

      <!-- Consolidado multi-sucursal + lectura con IA (CU29) -->
      <div *ngIf="activeTab() === 'sucursales'" class="space-y-5">

        <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
          <div class="flex flex-col md:flex-row md:items-end gap-4">
            <div>
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Desde</label>
              <input type="date" [(ngModel)]="consolidadoDesde" name="consolidadoDesde"
                     class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasta</label>
              <input type="date" [(ngModel)]="consolidadoHasta" name="consolidadoHasta"
                     class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <button (click)="verConsolidado()" [disabled]="loadingConsolidado()"
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer">
              {{ loadingConsolidado() ? 'Cargando...' : 'Ver consolidado' }}
            </button>
            <button (click)="generarAnalisis()" [disabled]="loadingAnalisis() || !puedeUsarIA()"
                    [title]="puedeUsarIA() ? 'Analizar con IA' : 'Tu plan no incluye el analisis con IA'"
                    class="px-4 py-2 bg-gray-900 hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
              {{ loadingAnalisis() ? 'Analizando...' : 'Analizar con IA' }}
            </button>
          </div>

          <p *ngIf="!puedeUsarIA()" class="text-[11px] text-amber-700 mt-3">
            El analisis automatico esta disponible desde el plan Intermedio. El consolidado por sucursal funciona en todos los planes.
          </p>
        </div>

        <!-- Tabla consolidada -->
        <div *ngIf="consolidado() as data" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-gray-900">Consolidado por sucursal</h2>
              <p class="text-xs text-gray-500">{{ data.sucursales.length }} sucursal(es) &middot; {{ data.total_unidades }} unidades vendidas</p>
            </div>
            <span class="text-sm font-bold text-gray-900">{{ data.total_monto.toLocaleString() }} Bs</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                  <th class="px-5 py-2.5">Sucursal</th>
                  <th class="px-5 py-2.5 text-right">Unidades</th>
                  <th class="px-5 py-2.5 text-right">Monto</th>
                  <th class="px-5 py-2.5 text-right">Stock</th>
                  <th class="px-5 py-2.5 text-right">SKUs</th>
                  <th class="px-5 py-2.5 text-right">Criticos</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let s of data.sucursales" class="hover:bg-gray-50">
                  <td class="px-5 py-3 font-semibold text-gray-900">{{ s.sucursal }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ s.unidades_vendidas }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ s.monto_vendido.toLocaleString() }} Bs</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ s.stock_total }}</td>
                  <td class="px-5 py-3 text-right text-gray-700">{{ s.skus }}</td>
                  <td class="px-5 py-3 text-right font-bold"
                      [ngClass]="s.skus_criticos > 0 ? 'text-rose-600' : 'text-gray-400'">
                    {{ s.skus_criticos }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Lectura con IA -->
        <div *ngIf="analisis() as ia" class="bg-white rounded-xl border border-indigo-200 shadow-xs overflow-hidden">
          <div class="px-5 py-4 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-indigo-700">auto_awesome</span>
            <div>
              <h2 class="text-base font-bold text-gray-900">Lectura asistida por IA</h2>
              <p class="text-[11px] text-gray-500">
                Generado con {{ ia.generado_por }} sobre las metricas de arriba &mdash; siempre verifica contra la tabla.
              </p>
            </div>
          </div>

          <div class="p-5 space-y-5">
            <p class="text-sm text-gray-700 leading-relaxed">{{ ia.resumen }}</p>

            <div *ngIf="ia.hallazgos.length > 0">
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Hallazgos por sucursal</h3>
              <div class="space-y-2">
                <div *ngFor="let h of ia.hallazgos" class="p-3 rounded-lg border bg-gray-50 border-gray-200">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold text-gray-900">{{ h.sucursal }}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                          [ngClass]="{
                            'bg-rose-50 text-rose-600 border-rose-200': h.severidad === 'Alta',
                            'bg-amber-50 text-amber-700 border-amber-200': h.severidad === 'Media',
                            'bg-emerald-50 text-emerald-700 border-emerald-200': h.severidad === 'Baja'
                          }">{{ h.severidad }}</span>
                  </div>
                  <p class="text-xs text-gray-600 leading-relaxed">{{ h.diagnostico }}</p>
                </div>
              </div>
            </div>

            <div *ngIf="ia.transferencias.length > 0">
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Transferencias sugeridas</h3>
              <div class="space-y-2">
                <div *ngFor="let t of ia.transferencias"
                     class="p-3 rounded-lg border border-indigo-100 bg-indigo-50/40 flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-bold text-gray-900">
                      {{ t.producto }} &middot; {{ t.unidades }} unidad(es)
                    </p>
                    <p class="text-[11px] text-gray-600 mt-0.5">
                      {{ t.desdeSucursal }} &rarr; {{ t.haciaSucursal }}
                    </p>
                    <p class="text-[11px] text-gray-500 mt-1">{{ t.motivo }}</p>
                  </div>
                  <span class="material-symbols-outlined text-[18px] text-indigo-600">local_shipping</span>
                </div>
              </div>
            </div>

            <div *ngIf="ia.alertas.length > 0">
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Alertas</h3>
              <ul class="space-y-1.5">
                <li *ngFor="let a of ia.alertas" class="flex items-start gap-2 text-xs text-gray-700">
                  <span class="material-symbols-outlined text-[14px] text-amber-600 mt-0.5">warning</span>
                  <span>{{ a }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div *ngIf="!consolidado() && !loadingConsolidado()" class="text-center py-12 text-gray-400 text-sm">
          Elegi un periodo y presiona "Ver consolidado".
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

  // CU29: consolidado multi-sucursal y analisis con IA.
  consolidadoDesde = '';
  consolidadoHasta = '';
  consolidado = signal<ConsolidadoSucursales | null>(null);
  analisis = signal<AnalisisSucursales | null>(null);
  loadingConsolidado = signal<boolean>(false);
  loadingAnalisis = signal<boolean>(false);

  constructor(
    private reportsService: ReportsService,
    public inventoryService: InventoryService,
    public archiveService: ArchiveService,
    private tenantService: TenantService,
  ) {}

  /** Gating cosmetico: el backend igual responde 402 si el plan no lo incluye. */
  puedeUsarIA(): boolean {
    return this.tenantService.permite('permiteIA');
  }

  abrirConsolidado() {
    this.activeTab.set('sucursales');
    if (!this.consolidado()) {
      this.verConsolidado();
    }
  }

  async verConsolidado() {
    this.loadingConsolidado.set(true);
    const data = await this.reportsService.getBranchesReport(
      this.consolidadoDesde || undefined,
      this.consolidadoHasta || undefined,
    );
    this.consolidado.set(data);
    this.loadingConsolidado.set(false);
  }

  async generarAnalisis() {
    this.loadingAnalisis.set(true);
    const data = await this.reportsService.getAiInsights(
      this.consolidadoDesde || undefined,
      this.consolidadoHasta || undefined,
    );
    if (data) {
      this.analisis.set(data);
      // El analisis trae las metricas con las que se genero: se refresca la
      // tabla con ESAS, no con las de una consulta anterior.
      this.consolidado.set({
        sucursales: data.sucursales,
        total_unidades: data.sucursales.reduce((acc, s) => acc + s.unidades_vendidas, 0),
        total_monto: data.sucursales.reduce((acc, s) => acc + s.monto_vendido, 0),
        filtros: data.filtros,
      });
    }
    this.loadingAnalisis.set(false);
  }

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
