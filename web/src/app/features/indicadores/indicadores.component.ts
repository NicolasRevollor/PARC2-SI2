import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IndicadoresService } from '../../core/services/indicadores.service';
import {
  KpisOut,
  StockPorSucursalOut,
  TopProductosOut,
  VentaDiariaFila,
  VentasDiariasOut,
} from '../../core/models';

// Paleta validada (dataviz skill, referencia palette.md) — solo modo claro,
// esta app no tiene modo oscuro en ningún otro lado.
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const SEQ_BLUE = '#2a78d6';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const STATUS_WARNING = '#fab219';

interface VentaPunto extends VentaDiariaFila {
  x: number;
  y: number;
}

@Component({
  selector: 'app-indicadores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Alta Administración</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Dashboard de Indicadores Empresariales</h1>
          <p class="text-xs text-gray-500 mt-1">
            Gráficos e indicadores consolidados de ventas e inventario.
          </p>
        </div>
      </div>

      <!-- Filtro: rango de fechas (una sola fila, arriba de todo — aplica a todos los gráficos) -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex flex-wrap items-end gap-4">
        <div>
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Desde</label>
          <input type="date" [ngModel]="fechaDesde()" (ngModelChange)="onFechaDesdeChange($event)" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasta</label>
          <input type="date" [ngModel]="fechaHasta()" (ngModelChange)="onFechaHastaChange($event)" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <p *ngIf="rangoError()" class="text-xs text-rose-600">{{ rangoError() }}</p>
        <p class="text-xs text-gray-400 ml-auto">Rango por defecto: últimos 30 días.</p>
      </div>

      <!-- KPI stat tiles -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6" [class.opacity-60]="refreshing()">
        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Total ventas</span>
          <p class="text-2xl font-bold text-gray-900 tracking-tight mt-2">
            Bs {{ (kpis()?.total_ventas_monto ?? 0).toLocaleString() }}
          </p>
          <p class="text-xs text-gray-500 mt-1">en el período seleccionado</p>
        </div>

        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Items vendidos</span>
          <p class="text-2xl font-bold text-gray-900 tracking-tight mt-2">
            {{ kpis()?.total_ventas_items ?? 0 }}
          </p>
          <p class="text-xs text-gray-500 mt-1">unidades en el período</p>
        </div>

        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Stock total</span>
          <p class="text-2xl font-bold text-gray-900 tracking-tight mt-2">
            {{ kpis()?.stock_total ?? 0 }} <span class="text-sm font-normal text-gray-500">pzs</span>
          </p>
          <p class="text-xs text-gray-500 mt-1">en todas las sucursales</p>
        </div>

        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Productos con stock bajo</span>
          <p class="text-2xl font-bold tracking-tight mt-2 flex items-center gap-1.5"
             [style.color]="(kpis()?.productos_bajo_stock ?? 0) > 0 ? statusWarning : '#111827'">
            <span *ngIf="(kpis()?.productos_bajo_stock ?? 0) > 0" class="material-symbols-outlined text-[20px]">warning</span>
            {{ kpis()?.productos_bajo_stock ?? 0 }}
          </p>
          <p class="text-xs text-gray-500 mt-1">registros con &lt; 10 unidades</p>
        </div>
      </div>

      <!-- Ventas por día (line chart) -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs" [class.opacity-60]="refreshing()">
        <div class="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
          <div>
            <h2 class="text-base font-bold text-gray-900">Ventas por día</h2>
            <p class="text-xs text-gray-500">Monto total facturado, día a día, en el rango seleccionado</p>
          </div>
        </div>

        <div class="relative">
          <svg
            #lineaSvg
            [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight"
            class="w-full h-auto select-none"
            (mousemove)="onLineHover($event, lineaSvg)"
            (mouseleave)="onLineLeave()"
          >
            <!-- Gridlines horizontales + ticks Y -->
            <g *ngFor="let tick of ventasYTicks()">
              <line [attr.x1]="padding.left" [attr.x2]="chartWidth - padding.right" [attr.y1]="tick.y" [attr.y2]="tick.y" [attr.stroke]="grid" stroke-width="1" />
              <text [attr.x]="padding.left - 8" [attr.y]="tick.y + 3" text-anchor="end" font-size="10" [attr.fill]="inkMuted">{{ formatMonto(tick.value) }}</text>
            </g>

            <!-- Eje X -->
            <line [attr.x1]="padding.left" [attr.x2]="chartWidth - padding.right" [attr.y1]="chartHeight - padding.bottom" [attr.y2]="chartHeight - padding.bottom" [attr.stroke]="axisColor" stroke-width="1" />
            <text *ngFor="let i of ventasXTickIndices()" [attr.x]="ventasPuntos()[i]?.x" [attr.y]="chartHeight - padding.bottom + 16" text-anchor="middle" font-size="10" [attr.fill]="inkMuted">
              {{ formatFechaCorta(ventasSerie()[i].fecha) }}
            </text>

            <!-- Línea de ventas -->
            <path [attr.d]="ventasLinePath()" fill="none" [attr.stroke]="seqBlue" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

            <!-- Overlay invisible de hover (todo el área de ploteo) -->
            <rect [attr.x]="padding.left" [attr.y]="padding.top" [attr.width]="chartWidth - padding.left - padding.right" [attr.height]="chartHeight - padding.top - padding.bottom" fill="transparent" />

            <!-- Crosshair + punto resaltado -->
            <ng-container *ngIf="hoveredPunto() as p">
              <line [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="padding.top" [attr.y2]="chartHeight - padding.bottom" [attr.stroke]="axisColor" stroke-width="1" stroke-dasharray="2,2" />
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5" [attr.fill]="seqBlue" stroke="#fcfcfb" stroke-width="2" />
            </ng-container>
          </svg>

          <!-- Tooltip (posicionado por % del viewBox, coincide con el escalado del SVG) -->
          <div
            *ngIf="hoveredPunto() as p"
            class="absolute pointer-events-none bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-lg -translate-x-1/2 -translate-y-full"
            [style.left.%]="(p.x / chartWidth) * 100"
            [style.top.%]="(p.y / chartHeight) * 100 - 2"
          >
            <p class="font-bold">Bs {{ p.monto.toLocaleString() }}</p>
            <p class="text-gray-300">{{ p.fecha }} · {{ p.cantidad }} items</p>
          </div>
        </div>

        <details class="mt-4">
          <summary class="text-xs font-bold text-indigo-600 cursor-pointer select-none">Ver tabla de datos</summary>
          <div class="overflow-x-auto mt-2 max-h-56 overflow-y-auto border border-gray-100 rounded-lg">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 bg-gray-50">
                <tr class="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <th class="p-2 pl-4">Fecha</th>
                  <th class="p-2 text-right">Monto</th>
                  <th class="p-2 text-right pr-4">Items</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let d of ventasSerie()">
                  <td class="p-2 pl-4">{{ d.fecha }}</td>
                  <td class="p-2 text-right">Bs {{ d.monto.toLocaleString() }}</td>
                  <td class="p-2 text-right pr-4">{{ d.cantidad }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Top productos por venta (horizontal bars) -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs" [class.opacity-60]="refreshing()">
          <div class="pb-4 border-b border-gray-100 mb-4">
            <h2 class="text-base font-bold text-gray-900">Top productos por venta</h2>
            <p class="text-xs text-gray-500">Los {{ topProductos()?.productos?.length ?? 0 }} productos con mayor facturación</p>
          </div>

          <div class="space-y-3">
            <div
              *ngFor="let p of topProductos()?.productos ?? []; let i = index"
              class="relative"
              tabindex="0"
              (mouseenter)="hoveredTopIndex.set(i)"
              (mouseleave)="hoveredTopIndex.set(null)"
              (focus)="hoveredTopIndex.set(i)"
              (blur)="hoveredTopIndex.set(null)"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-700 font-medium w-32 shrink-0 truncate" [title]="p.producto_nombre">{{ p.producto_nombre }}</span>
                <div class="flex-1 h-6 bg-gray-50 rounded-r-[4px] relative overflow-hidden">
                  <div
                    class="h-full rounded-r-[4px] transition-[filter] duration-150"
                    [style.width.%]="(p.monto / topProductosMax()) * 100"
                    [style.background]="categorical[i % categorical.length]"
                    [style.filter]="hoveredTopIndex() === i ? 'brightness(0.9)' : 'none'"
                  ></div>
                </div>
                <span class="text-xs font-bold text-gray-900 w-20 text-right shrink-0">Bs {{ p.monto.toLocaleString() }}</span>
              </div>

              <div
                *ngIf="hoveredTopIndex() === i"
                class="absolute right-0 -top-7 bg-gray-900 text-white rounded-lg px-2.5 py-1 text-[11px] shadow-lg pointer-events-none z-10"
              >
                {{ p.cantidad }} unidades vendidas
              </div>
            </div>

            <p *ngIf="(topProductos()?.productos?.length ?? 0) === 0" class="text-center py-8 text-gray-400 text-sm">
              Sin ventas en el período seleccionado.
            </p>
          </div>
        </div>

        <!-- Stock por sucursal (vertical bars) -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs" [class.opacity-60]="refreshing()">
          <div class="pb-4 border-b border-gray-100 mb-4">
            <h2 class="text-base font-bold text-gray-900">Stock por sucursal</h2>
            <p class="text-xs text-gray-500">Unidades actuales asignadas, foto actual (no depende del rango de fechas)</p>
          </div>

          <div class="flex items-end justify-around gap-4 h-48 pt-4">
            <div
              *ngFor="let s of stockPorSucursal()?.sucursales ?? []; let i = index"
              class="relative flex flex-col items-center justify-end h-full flex-1 max-w-[96px]"
              tabindex="0"
              (mouseenter)="hoveredSucursalIndex.set(i)"
              (mouseleave)="hoveredSucursalIndex.set(null)"
              (focus)="hoveredSucursalIndex.set(i)"
              (blur)="hoveredSucursalIndex.set(null)"
            >
              <div
                *ngIf="hoveredSucursalIndex() === i"
                class="absolute -top-2 -translate-y-full bg-gray-900 text-white rounded-lg px-2.5 py-1 text-[11px] shadow-lg pointer-events-none whitespace-nowrap z-10"
              >
                {{ s.stock_total }} unidades
              </div>
              <span class="text-xs font-bold text-gray-900 mb-1">{{ s.stock_total }}</span>
              <div
                class="w-10 rounded-t-[4px] transition-[filter] duration-150"
                [style.height.%]="(s.stock_total / stockMax()) * 100"
                [style.background]="categorical[i % categorical.length]"
                [style.filter]="hoveredSucursalIndex() === i ? 'brightness(0.9)' : 'none'"
              ></div>
              <span class="text-[11px] text-gray-500 mt-2 text-center leading-tight">{{ s.sucursal_nombre }}</span>
            </div>

            <p *ngIf="(stockPorSucursal()?.sucursales?.length ?? 0) === 0" class="text-center py-8 text-gray-400 text-sm w-full">
              Sin sucursales registradas.
            </p>
          </div>
        </div>
      </div>

    </div>
  `
})
export class IndicadoresComponent implements OnInit {
  readonly categorical = CATEGORICAL;
  readonly seqBlue = SEQ_BLUE;
  readonly inkSecondary = INK_SECONDARY;
  readonly inkMuted = INK_MUTED;
  readonly grid = GRID;
  readonly axisColor = AXIS;
  readonly statusWarning = STATUS_WARNING;

  readonly chartWidth = 640;
  readonly chartHeight = 240;
  readonly padding = { left: 52, right: 16, top: 16, bottom: 32 };

  fechaDesde = signal<string>(this.isoDaysAgo(30));
  fechaHasta = signal<string>(this.isoDaysAgo(0));
  rangoError = signal<string | null>(null);

  kpis = signal<KpisOut | null>(null);
  ventasDiarias = signal<VentasDiariasOut | null>(null);
  topProductos = signal<TopProductosOut | null>(null);
  stockPorSucursal = signal<StockPorSucursalOut | null>(null);

  refreshing = signal<boolean>(false);
  hoveredDiaIndex = signal<number | null>(null);
  hoveredTopIndex = signal<number | null>(null);
  hoveredSucursalIndex = signal<number | null>(null);

  constructor(private indicadoresService: IndicadoresService) {}

  ngOnInit() {
    this.cargarTodo();
  }

  private isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  onFechaDesdeChange(value: string) {
    this.fechaDesde.set(value);
    this.aplicarFiltro();
  }

  onFechaHastaChange(value: string) {
    this.fechaHasta.set(value);
    this.aplicarFiltro();
  }

  private aplicarFiltro() {
    if (this.fechaDesde() && this.fechaHasta() && this.fechaDesde() > this.fechaHasta()) {
      this.rangoError.set('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    this.rangoError.set(null);
    this.cargarTodo();
  }

  private cargarTodo() {
    // "Refetch keeps the frame" (dataviz skill, interaction.md): no se
    // limpian los signals de datos antes de la respuesta — los gráficos
    // quedan visibles a opacidad reducida (.opacity-60) hasta que llega la
    // nueva data, nunca un skeleton ni un salto de layout.
    this.refreshing.set(true);
    const filtros = { fecha_desde: this.fechaDesde(), fecha_hasta: this.fechaHasta() };
    Promise.all([
      this.indicadoresService.getKpis(filtros),
      this.indicadoresService.getVentasDiarias(filtros),
      this.indicadoresService.getTopProductos(filtros, 5),
      this.indicadoresService.getStockPorSucursal(),
    ]).then(([kpis, ventas, top, stock]) => {
      this.refreshing.set(false);
      if (kpis) this.kpis.set(kpis);
      if (ventas) this.ventasDiarias.set(ventas);
      if (top) this.topProductos.set(top);
      if (stock) this.stockPorSucursal.set(stock);
    });
  }

  // --- Ventas por día (line chart) ---

  // El backend solo devuelve días CON ventas; se rellenan los días vacíos
  // del rango con monto/cantidad = 0 para que el eje X represente el
  // tiempo real (si no, un día sin ventas "desaparece" y comprime la
  // escala en vez de mostrar el hueco).
  private fillDailySeries(dias: VentaDiariaFila[]): VentaDiariaFila[] {
    const map = new Map(dias.map(d => [d.fecha, d]));
    const result: VentaDiariaFila[] = [];
    const start = new Date(this.fechaDesde() + 'T00:00:00');
    const end = new Date(this.fechaHasta() + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dias;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      result.push(map.get(iso) ?? { fecha: iso, monto: 0, cantidad: 0 });
    }
    return result;
  }

  ventasSerie = computed<VentaDiariaFila[]>(() => this.fillDailySeries(this.ventasDiarias()?.dias ?? []));

  private niceMax(value: number): number {
    if (value <= 0) return 10;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const fraction = value / base;
    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * base;
  }

  ventasMaxMonto = computed(() => this.niceMax(Math.max(...this.ventasSerie().map(d => d.monto), 1)));

  ventasPuntos = computed<VentaPunto[]>(() => {
    const serie = this.ventasSerie();
    const { left, right, top, bottom } = this.padding;
    const plotWidth = this.chartWidth - left - right;
    const plotHeight = this.chartHeight - top - bottom;
    const max = this.ventasMaxMonto();
    const n = serie.length;
    return serie.map((d, i) => {
      const x = n > 1 ? left + (i / (n - 1)) * plotWidth : left + plotWidth / 2;
      const y = top + plotHeight - (max > 0 ? (d.monto / max) * plotHeight : 0);
      return { ...d, x, y };
    });
  });

  ventasLinePath = computed(() => {
    const puntos = this.ventasPuntos();
    if (puntos.length === 0) return '';
    return puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  });

  ventasYTicks = computed(() => {
    const max = this.ventasMaxMonto();
    const steps = 4;
    const { top, bottom } = this.padding;
    const plotHeight = this.chartHeight - top - bottom;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const value = (max / steps) * i;
      const y = top + plotHeight - (value / max) * plotHeight;
      return { value, y };
    });
  });

  ventasXTickIndices = computed(() => {
    const n = this.ventasSerie().length;
    if (n === 0) return [];
    if (n <= 7) return this.ventasSerie().map((_, i) => i);
    const step = Math.ceil(n / 6);
    const indices: number[] = [];
    for (let i = 0; i < n; i += step) indices.push(i);
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    return indices;
  });

  formatFechaCorta(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  formatMonto(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  // Transforma coordenadas de pantalla -> espacio del viewBox via la CTM
  // del propio <svg>, así el hit-test es correcto sin importar cómo el
  // navegador haya escalado el SVG (w-full + viewBox).
  onLineHover(event: MouseEvent, svg: SVGSVGElement) {
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPoint = pt.matrixTransform(ctm.inverse());
    const puntos = this.ventasPuntos();
    if (puntos.length === 0) return;
    let nearest = 0;
    let nearestDist = Infinity;
    puntos.forEach((p, i) => {
      const dist = Math.abs(p.x - svgPoint.x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    this.hoveredDiaIndex.set(nearest);
  }

  onLineLeave() {
    this.hoveredDiaIndex.set(null);
  }

  hoveredPunto = computed<VentaPunto | null>(() => {
    const idx = this.hoveredDiaIndex();
    if (idx === null) return null;
    return this.ventasPuntos()[idx] ?? null;
  });

  // --- Top productos (horizontal bars) ---

  topProductosMax = computed(() => {
    const productos = this.topProductos()?.productos ?? [];
    return Math.max(...productos.map(p => p.monto), 1);
  });

  // --- Stock por sucursal (vertical bars) ---

  stockMax = computed(() => {
    const sucursales = this.stockPorSucursal()?.sucursales ?? [];
    return Math.max(...sucursales.map(s => s.stock_total), 1);
  });
}
