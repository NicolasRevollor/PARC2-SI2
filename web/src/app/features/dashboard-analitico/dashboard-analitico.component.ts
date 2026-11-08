import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardAnalitico, IaService } from '../../core/services/ia.service';
import { AuthService } from '../../core/services/auth.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { GraficoComponent } from '../../shared/components/grafico.component';

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU30] Visualizar dashboard analitico inteligente
// Boundary: DashboardAnaliticoUI -> este componente
// Control: backend/app/routers/inteligencia.py -> dashboard
// En palabras simples: indicadores del periodo + lo que dicen los modelos
//   publicados en el CU29 (demanda, devolucion por talla, segmentos, anomalias).
// ==================================================================
@Component({
  selector: 'app-dashboard-analitico',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent, GraficoComponent],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Dashboard analítico</h1>
        <app-cu-badge cu="CU30" [conNombre]="true" class="block mt-1"></app-cu-badge>
      </div>

      <!-- Paso 6: filtros -->
      <div class="ys-tarjeta p-4 flex flex-wrap items-end gap-3">
        <label><span class="ys-mini block">Desde</span><input type="date" class="ys-filtro" [(ngModel)]="desde" name="desde" /></label>
        <label><span class="ys-mini block">Hasta</span><input type="date" class="ys-filtro" [(ngModel)]="hasta" name="hasta" /></label>
        <label><span class="ys-mini block">Sucursal</span>
          <select class="ys-filtro" [(ngModel)]="sucursal" name="suc" data-testid="filtro-sucursal">
            <option [ngValue]="null">{{ datos()?.restringido ? 'Mis sucursales' : 'Todas' }}</option>
            <option *ngFor="let s of datos()?.sucursales" [ngValue]="s.codigoSucursal">{{ s.nombre }}</option>
          </select></label>
        <label><span class="ys-mini block">Categoría</span>
          <select class="ys-filtro" [(ngModel)]="categoria" name="cat">
            <option [ngValue]="null">Todas</option>
            <option *ngFor="let c of datos()?.categorias" [ngValue]="c">{{ c }}</option>
          </select></label>
        <button (click)="cargar()" [disabled]="cargando()" class="ys-btn" data-testid="aplicar">{{ cargando() ? 'Cargando…' : 'Aplicar' }}</button>
        <p *ngIf="errorFechas()" class="text-xs text-rose-600 w-full">{{ errorFechas() }}</p>
        <!-- Alternativo 2 -->
        <p *ngIf="datos()?.restringido" class="text-xs text-gray-500 w-full">Como Encargado de sucursal, ve solo la información de sus sucursales.</p>
      </div>

      <ng-container *ngIf="datos() as d">
        <!-- Paso 2: indicadores principales -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="indicadores">
          <div class="ys-tarjeta p-4"><p class="ys-mini">Ventas</p><p class="text-xl font-bold text-gray-900 tabular-nums">Bs {{ d.indicadores.ventas | number: '1.2-2' }}</p>
            <p class="text-[11px] text-gray-500">{{ d.indicadores.cantidadVentas | number }} ventas · {{ d.indicadores.unidades | number }} prendas</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Ticket promedio</p><p class="text-xl font-bold text-gray-900 tabular-nums">Bs {{ d.indicadores.ticketPromedio | number: '1.2-2' }}</p></div>
          <div class="ys-tarjeta p-4" title="Prendas vendidas en el período por cada prenda disponible hoy"><p class="ys-mini">Rotación de stock</p>
            <p class="text-xl font-bold text-gray-900 tabular-nums">{{ d.indicadores.rotacionStock === null ? '—' : (d.indicadores.rotacionStock | number: '1.2-2') }}</p>
            <p class="text-[11px] text-gray-500">{{ d.indicadores.stockDisponible | number }} prendas disponibles</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Tasa de devoluciones</p><p class="text-xl font-bold text-gray-900 tabular-nums">{{ d.indicadores.tasaDevoluciones | number: '1.1-1' }}%</p>
            <p class="text-[11px] text-gray-500">{{ d.indicadores.unidadesDevueltas | number }} prendas devueltas</p></div>
        </div>

        <div *ngIf="d.indicadores.serieSemanal.length > 1" class="ys-tarjeta p-4">
          <app-grafico titulo="Ventas por semana (Bs)" tipo="lineas" formato="moneda" [datos]="serieSemanal()"></app-grafico>
        </div>

        <!-- Alternativo 3: plan sin IA -->
        <div *ngIf="!d.iaDisponible" class="ys-tarjeta p-5 border-amber-300" data-testid="sin-plan-ia">
          <p class="text-sm font-semibold text-amber-700">{{ d.motivoIA }}</p>
        </div>

        <!-- Alternativo 1: sin modelos publicados -->
        <div *ngIf="d.iaDisponible && d.sinModelos" class="ys-tarjeta p-5 space-y-2" data-testid="sin-modelos">
          <p class="text-sm font-semibold text-gray-900">Todavía no hay modelos publicados.</p>
          <p class="text-xs text-gray-600">Se muestran solo los indicadores. Entrene y publique un modelo para ver predicciones, segmentos y anomalías.</p>
          <button *ngIf="puedeEntrenar()" (click)="irModelos.emit()" class="ys-btn"><span class="material-symbols-outlined text-[16px]">model_training</span> Ir a Modelos de IA</button>
        </div>

        <ng-container *ngIf="d.iaDisponible && !d.sinModelos">
          <!-- Paso 5: interpretación narrativa -->
          <div class="ys-tarjeta p-4" data-testid="interpretacion">
            <p class="ys-mini mb-1">Interpretación</p>
            <p class="text-sm text-gray-700 leading-relaxed">{{ d.interpretacion }}</p>
            <p class="text-[10px] text-gray-400 mt-1">Generada con {{ d.motorInterpretacion }}</p>
          </div>

          <!-- Paso 3: predicción de demanda y reposición -->
          <div *ngIf="d.demanda" class="ys-tarjeta p-4 space-y-3" data-testid="demanda">
            <p class="ys-etiqueta">Demanda de las próximas {{ d.semanasPrediccion?.length }} semanas y reposición sugerida</p>
            <p *ngIf="!d.demanda.length" class="text-xs text-gray-400">{{ tieneModelo('demanda') ? 'Sin predicciones para estos filtros.' : 'El modelo de demanda no está publicado.' }}</p>
            <div *ngIf="d.demanda.length" class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="border-b border-gray-200"><tr class="text-left ys-mini">
                  <th class="px-3 py-2">Producto</th><th class="px-3 py-2">Sucursal</th>
                  <th *ngFor="let s of d.semanasPrediccion" class="px-3 py-2 text-right">Sem. {{ s | date: 'dd/MM' }}</th>
                  <th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-right">Disponible</th><th class="px-3 py-2 text-right">Reponer</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr *ngFor="let p of d.demanda">
                    <td class="px-3 py-1.5 text-gray-900">{{ p.producto }} <span class="text-gray-500">· {{ p.talla }} · {{ p.color }}</span></td>
                    <td class="px-3 py-1.5 text-gray-700">{{ p.sucursal }}</td>
                    <td *ngFor="let v of p.semanas" class="px-3 py-1.5 text-right tabular-nums text-gray-700">{{ v | number: '1.0-1' }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums text-gray-900">{{ p.total | number: '1.0-1' }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums text-gray-700">{{ p.disponible }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums font-semibold" [ngClass]="p.reponer > 0 ? 'text-amber-700' : 'text-gray-400'">{{ p.reponer > 0 ? p.reponer : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Paso 4: segmentos -->
            <div class="ys-tarjeta p-4 space-y-3" data-testid="segmentos">
              <p class="ys-etiqueta">Segmentos de clientes</p>
              <p *ngIf="!d.segmentos?.length" class="text-xs text-gray-400">{{ tieneModelo('segmentacion') ? 'Sin clientes para estos filtros.' : 'El modelo de segmentación no está publicado.' }}</p>
              <ng-container *ngIf="d.segmentos?.length">
                <app-grafico titulo="Clientes por segmento" tipo="barras" formato="entero" [datos]="segmentosGrafico()"></app-grafico>
                <table class="w-full text-xs">
                  <thead><tr class="text-left ys-mini"><th class="py-1">Segmento</th><th class="py-1 text-right">Última compra (días)</th><th class="py-1 text-right">Compras</th><th class="py-1 text-right">Gasto prom.</th></tr></thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr *ngFor="let s of d.segmentos"><td class="py-1 text-gray-900">{{ s.segmento }}</td>
                      <td class="py-1 text-right tabular-nums text-gray-700">{{ s.recencia | number: '1.0-0' }}</td>
                      <td class="py-1 text-right tabular-nums text-gray-700">{{ s.frecuencia | number: '1.0-1' }}</td>
                      <td class="py-1 text-right tabular-nums text-gray-700">Bs {{ s.monto | number: '1.0-0' }}</td></tr>
                  </tbody>
                </table>
              </ng-container>
            </div>

            <!-- Paso 4: devolución por talla -->
            <div class="ys-tarjeta p-4 space-y-3" data-testid="devolucion-talla">
              <p class="ys-etiqueta">Probabilidad de devolución por talla</p>
              <p *ngIf="!d.devolucionPorTalla?.length" class="text-xs text-gray-400">{{ tieneModelo('devolucion') ? 'Sin datos para estos filtros.' : 'El modelo de devolución no está publicado.' }}</p>
              <app-grafico *ngIf="d.devolucionPorTalla?.length" titulo="Probabilidad estimada (%)" tipo="barras" formato="decimal" [datos]="devolucionGrafico()"></app-grafico>
            </div>
          </div>

          <!-- Paso 4: anomalías -->
          <div class="ys-tarjeta p-4 space-y-2" data-testid="anomalias">
            <p class="ys-etiqueta">Anomalías detectadas</p>
            <p *ngIf="!d.anomalias?.length" class="text-xs text-gray-400">{{ tieneModelo('anomalias') ? 'No hay anomalías en el período.' : 'El modelo de anomalías no está publicado.' }}</p>
            <div *ngFor="let a of d.anomalias" class="flex items-start gap-2 text-xs py-1 border-b border-gray-100">
              <span class="ys-chip shrink-0" [ngClass]="a.tipo === 'Venta atipica' ? 'border-indigo-300 text-indigo-700' : 'border-amber-300 text-amber-700'">{{ a.tipo === 'Venta atipica' ? 'Venta atípica' : 'Devolución inusual' }}</span>
              <p class="text-gray-700"><b class="text-gray-900">{{ a.sucursal }}</b><span *ngIf="a.fecha"> · {{ a.fecha | date: 'dd/MM/yyyy' }}</span> — {{ a.detalle }}</p>
            </div>
          </div>

          <!-- Paso 5: métricas de los modelos usados -->
          <div class="ys-tarjeta p-4" data-testid="modelos-usados">
            <p class="ys-etiqueta mb-2">Modelos usados</p>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div *ngFor="let m of d.modelos" class="p-3 rounded-lg border border-gray-200 text-xs">
                <p class="font-semibold text-gray-900">{{ m.etiqueta }}</p>
                <p class="text-gray-500">v{{ m.version }} · {{ m.algoritmo }}{{ m.conSinteticos ? ' · con datos sintéticos' : '' }}</p>
                <p class="text-gray-700 mt-1"><span *ngFor="let x of metricasPrincipales(m.metricas); let ultimo = last">{{ x[0] }} {{ x[1] }}{{ ultimo ? '' : ' · ' }}</span></p>
              </div>
            </div>
          </div>
        </ng-container>
      </ng-container>
    </div>
  `,
})
export class DashboardAnaliticoComponent implements OnInit {
  @Output() irModelos = new EventEmitter<void>();

  readonly datos = signal<DashboardAnalitico | null>(null);
  readonly cargando = signal(false);
  readonly errorFechas = signal<string | null>(null);
  desde = '';
  hasta = '';
  sucursal: number | null = null;
  categoria: string | null = null;

  readonly serieSemanal = computed(() => {
    const s = this.datos()?.indicadores.serieSemanal ?? [];
    return { etiquetas: s.map(x => x.semana.slice(8, 10) + '/' + x.semana.slice(5, 7)), valores: s.map(x => x.monto) };
  });
  readonly segmentosGrafico = computed(() => {
    const s = this.datos()?.segmentos ?? [];
    return { etiquetas: s.map(x => x.segmento), valores: s.map(x => x.clientes) };
  });
  readonly devolucionGrafico = computed(() => {
    const d = this.datos()?.devolucionPorTalla ?? [];
    return { etiquetas: d.map(x => `${x.categoria} · ${x.talla}`), valores: d.map(x => Math.round(x.probabilidad * 1000) / 10) };
  });

  constructor(
    private iaService: IaService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - 89);
    this.hasta = isoLocal(hoy);
    this.desde = isoLocal(inicio);
    void this.cargar();
  }

  puedeEntrenar(): boolean {
    return this.authService.currentUser()?.permisos.includes('ia.modelos') ?? false;
  }

  tieneModelo(tipo: string): boolean {
    return !!this.datos()?.modelos?.some(m => m.tipo === tipo);
  }

  metricasPrincipales(m: Record<string, number>): [string, number][] {
    const nombres: Record<string, string> = { r2: 'R²', mae: 'MAE', exactitud: 'Exactitud', f1: 'F1', silueta: 'Silueta', anomalias: 'Anomalías', puntos: 'Días' };
    return Object.entries(m).filter(([k]) => k in nombres).map(([k, v]) => [nombres[k], v]);
  }

  async cargar(): Promise<void> {
    if (this.desde && this.hasta && this.desde > this.hasta) {
      this.errorFechas.set('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    this.errorFechas.set(null);
    this.cargando.set(true);
    try {
      this.datos.set(await this.iaService.dashboard({
        fecha_desde: this.desde, fecha_hasta: this.hasta, codigoSucursal: this.sucursal, categoria: this.categoria,
      }));
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudo cargar el dashboard analítico.');
    } finally {
      this.cargando.set(false);
    }
  }
}
