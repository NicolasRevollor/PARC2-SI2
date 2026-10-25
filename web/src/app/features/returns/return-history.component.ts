import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../core/services/archive.service';
import { InventoryService } from '../../core/services/inventory.service';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO,
  ETIQUETA_RESULTADO,
  ETIQUETA_TIPO,
  FiltrosDevolucion,
  ReturnsService,
  claseEstado,
} from '../../core/services/returns.service';
import { AnalisisDevoluciones, DevolucionOut } from '../../core/models';
import { ReturnDetailComponent } from './return-detail.component';

/**
 * CU11 — Consultar historial y análisis de devoluciones: lista filtrable,
 * indicadores (tasa por producto y talla, motivos, montos, clientes
 * frecuentes), detalle con línea de tiempo y exportación a Excel o PDF.
 */
@Component({
  selector: 'app-return-history',
  standalone: true,
  imports: [CommonModule, FormsModule, ReturnDetailComponent],
  template: `
    <div class="space-y-5">
      <div class="ys-tarjeta p-3.5 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1"><span class="ys-mini">Desde</span><input type="date" [(ngModel)]="f.fecha_desde" class="ys-filtro" /></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Hasta</span><input type="date" [(ngModel)]="f.fecha_hasta" class="ys-filtro" /></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Sucursal</span>
          <select [(ngModel)]="f.codigoSucursal" class="ys-filtro"><option [ngValue]="undefined">Todas</option>
            <option *ngFor="let s of inventoryService.locations()" [ngValue]="s.codigoSucursal">{{ s.nombre }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Tipo</span>
          <select [(ngModel)]="f.tipo" class="ys-filtro"><option [ngValue]="undefined">Todos</option>
            <option *ngFor="let t of tipos" [ngValue]="t[0]">{{ t[1] }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Motivo</span>
          <select [(ngModel)]="f.motivo" class="ys-filtro"><option [ngValue]="undefined">Todos</option>
            <option *ngFor="let m of motivos" [ngValue]="m[0]">{{ m[1] }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Producto</span>
          <select [(ngModel)]="f.idProducto" class="ys-filtro max-w-40"><option [ngValue]="undefined">Todos</option>
            <option *ngFor="let p of archiveService.products()" [ngValue]="p.idProducto">{{ p.nombre }} {{ p.talla }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Talla</span><input [(ngModel)]="f.talla" placeholder="M, 32…" class="ys-filtro w-20" /></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Estado</span>
          <select [(ngModel)]="f.estado" class="ys-filtro"><option [ngValue]="undefined">Todos</option>
            <option *ngFor="let e of estados" [ngValue]="e[0]">{{ e[1] }}</option></select></div>
        <div class="flex flex-col gap-1"><span class="ys-mini">Cliente</span>
          <input [(ngModel)]="cliente" placeholder="Nombre" class="ys-filtro w-32" /></div>
        <button (click)="aplicar()" class="ys-btn">Filtrar</button>
        <button (click)="limpiar()" class="ys-btn-sec">Limpiar</button>
        <div class="flex gap-2 ml-auto">
          <button (click)="exportar('csv')" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">table_view</span> Excel</button>
          <button (click)="exportar('pdf')" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF</button>
        </div>
      </div>

      <!-- Indicadores (CU11 paso 4) -->
      <div *ngIf="analisis() as a" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="ys-tarjeta p-4"><p class="ys-mini">Casos</p><p class="text-2xl font-bold text-gray-900">{{ a.casos }}</p><p class="text-[11px] text-gray-500">{{ a.rechazadas }} rechazados</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Prendas devueltas</p><p class="text-2xl font-bold text-gray-900">{{ a.unidadesDevueltas }}</p><p class="text-[11px] text-gray-500">{{ a.cambios }} cambios</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Reembolsado</p><p class="text-2xl font-bold text-gray-900">{{ a.montoReembolsado.toLocaleString() }} Bs</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Notas de crédito</p><p class="text-2xl font-bold text-gray-900">{{ a.notasEmitidas }}</p><p class="text-[11px] text-gray-500">{{ a.montoNotas.toLocaleString() }} Bs</p></div>
          <div class="ys-tarjeta p-4"><p class="ys-mini">Clientes frecuentes</p><p class="text-2xl font-bold text-gray-900">{{ a.clientesFrecuentes.length }}</p><p class="text-[11px] text-gray-500">2 o más casos</p></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div class="ys-tarjeta p-4">
            <p class="ys-etiqueta mb-2">Tasa de devolución por producto</p>
            <div *ngFor="let t of a.porProducto" class="mb-2">
              <div class="flex justify-between text-[11px] text-gray-700"><span>{{ t.clave }}</span><span>{{ t.devueltas }}/{{ t.vendidas }} · {{ t.tasa }}%</span></div>
              <div class="h-1.5 rounded bg-gray-100"><div class="h-1.5 rounded bg-indigo-600" [style.width.%]="barra(t.tasa)"></div></div>
            </div>
            <p *ngIf="!a.porProducto.length" class="text-xs text-gray-500">Sin devoluciones en el período.</p>
          </div>
          <div class="ys-tarjeta p-4">
            <p class="ys-etiqueta mb-2">Tasa por talla (tallaje)</p>
            <div *ngFor="let t of a.porTalla" class="mb-2">
              <div class="flex justify-between text-[11px] text-gray-700"><span>Talla {{ t.clave }}</span><span>{{ t.devueltas }}/{{ t.vendidas }} · {{ t.tasa }}%</span></div>
              <div class="h-1.5 rounded bg-gray-100"><div class="h-1.5 rounded bg-amber-600" [style.width.%]="barra(t.tasa)"></div></div>
            </div>
          </div>
          <div class="ys-tarjeta p-4">
            <p class="ys-etiqueta mb-2">Motivos más frecuentes</p>
            <div *ngFor="let m of a.motivos" class="flex justify-between text-xs text-gray-700 py-1 border-b border-gray-100">
              <span>{{ m.detalle }}</span><span class="font-bold">{{ m.casos }}</span>
            </div>
            <p class="ys-etiqueta mt-4 mb-2">Clientes con devoluciones frecuentes</p>
            <div *ngFor="let c of a.clientesFrecuentes" class="flex justify-between text-xs text-gray-700 py-1">
              <span>{{ c.detalle }}</span><span>{{ c.casos }} casos · Bs {{ c.monto.toFixed(0) }}</span>
            </div>
            <p *ngIf="!a.clientesFrecuentes.length" class="text-xs text-gray-500">Ninguno.</p>
          </div>
        </div>
      </div>

      <!-- Lista (CU11 paso 2) -->
      <div class="ys-tarjeta overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex justify-between">
          <p class="text-sm font-bold text-gray-900">Historial de devoluciones y cambios</p>
          <span class="text-xs text-gray-500">{{ filas().length }} registro(s)</span>
        </div>
        <div *ngIf="returnsService.cargando()" class="p-8 text-center text-sm text-gray-500">Cargando…</div>
        <div *ngIf="!returnsService.cargando() && filas().length === 0" class="p-8 text-center text-sm text-gray-500">No se encontraron devoluciones.</div>
        <div *ngIf="filas().length" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left ys-mini">
                <th class="px-4 py-2.5">Fecha</th><th class="px-4 py-2.5">Código</th><th class="px-4 py-2.5">Cliente</th>
                <th class="px-4 py-2.5">Prenda</th><th class="px-4 py-2.5">Tipo</th><th class="px-4 py-2.5">Motivo</th>
                <th class="px-4 py-2.5">Inspección</th><th class="px-4 py-2.5">Estado</th><th class="px-4 py-2.5 text-right">Montos</th>
                <th class="px-4 py-2.5">Responsable</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let d of filas()" (click)="abierto.set(d.idDevolucion)" class="hover:bg-gray-50 cursor-pointer">
                <td class="px-4 py-2.5 whitespace-nowrap text-gray-700">{{ d.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="px-4 py-2.5 font-mono text-gray-900">{{ d.codigo }}<span class="block text-[10px] text-gray-400 font-sans">venta #{{ d.idVenta }}</span></td>
                <td class="px-4 py-2.5 text-gray-900">{{ d.cliente_nombre }}</td>
                <td class="px-4 py-2.5 text-gray-700">{{ d.producto_nombre }} <span class="font-mono font-bold">{{ d.tallaOriginal }}</span>
                  <span *ngIf="d.producto_nuevo_nombre" class="text-indigo-600"> → {{ d.tallaNueva }}</span></td>
                <td class="px-4 py-2.5">{{ etiqueta(tiposMapa, d.tipo) }}</td>
                <td class="px-4 py-2.5 text-gray-500">{{ etiqueta(motivosMapa, d.motivoCategoria || '') }}</td>
                <td class="px-4 py-2.5 text-gray-500">{{ d.condicion ? etiqueta(resultadosMapa, d.condicion) : '—' }}</td>
                <td class="px-4 py-2.5"><span class="ys-chip" [ngClass]="clase(d.estado)">{{ etiqueta(estadosMapa, d.estado) }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap text-gray-900">{{ montos(d) }}</td>
                <td class="px-4 py-2.5 text-gray-500">{{ d.usuario_nombre }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <app-return-detail *ngIf="abierto() as id" [idDevolucion]="id" (cerrar)="abierto.set(null)"></app-return-detail>
  `,
})
export class ReturnHistoryComponent implements OnInit {
  readonly tiposMapa = ETIQUETA_TIPO;
  readonly motivosMapa = ETIQUETA_MOTIVO;
  readonly estadosMapa = ETIQUETA_ESTADO;
  readonly resultadosMapa = ETIQUETA_RESULTADO;
  readonly tipos = Object.entries(ETIQUETA_TIPO);
  readonly motivos = Object.entries(ETIQUETA_MOTIVO);
  readonly estados = Object.entries(ETIQUETA_ESTADO);

  f: FiltrosDevolucion = {};
  cliente = '';
  readonly analisis = signal<AnalisisDevoluciones | null>(null);
  readonly abierto = signal<number | null>(null);
  readonly busquedaCliente = signal<string>('');

  /** El filtro por cliente es por nombre, sobre lo ya cargado. */
  readonly filas = computed(() => {
    const q = this.busquedaCliente().trim().toLowerCase();
    const todas = this.returnsService.devoluciones();
    return q ? todas.filter((d) => (d.cliente_nombre ?? '').toLowerCase().includes(q)) : todas;
  });

  constructor(
    public returnsService: ReturnsService,
    public inventoryService: InventoryService,
    public archiveService: ArchiveService,
  ) {}

  ngOnInit(): void {
    if (this.inventoryService.locations().length === 0) void this.inventoryService.loadLocations();
    if (this.archiveService.products().length < 2) void this.archiveService.loadProducts({ size: 100 });
    void this.aplicar();
  }

  async aplicar(): Promise<void> {
    this.busquedaCliente.set(this.cliente);
    const [, analisis] = await Promise.all([
      this.returnsService.cargarDevoluciones(this.f),
      this.returnsService.analisis({ fecha_desde: this.f.fecha_desde, fecha_hasta: this.f.fecha_hasta, codigoSucursal: this.f.codigoSucursal }),
    ]);
    this.analisis.set(analisis);
  }

  limpiar(): void {
    this.f = {};
    this.cliente = '';
    void this.aplicar();
  }

  exportar(formato: 'csv' | 'pdf'): void {
    void this.returnsService.exportar(formato, this.f);
  }

  etiqueta(mapa: Record<string, string>, valor: string): string {
    return mapa[valor] ?? valor;
  }

  clase(estado: string): string {
    return claseEstado(estado);
  }

  barra(tasa: number): number {
    return Math.min(100, tasa * 4);
  }

  montos(d: DevolucionOut): string {
    const partes: string[] = [];
    if (d.montoDevuelto > 0) partes.push(`−${d.montoDevuelto.toFixed(2)} Bs`);
    if (d.diferencia > 0) partes.push(`+${d.diferencia.toFixed(2)} Bs`);
    if (d.nota_codigo) partes.push(d.nota_codigo);
    return partes.join(' · ') || '—';
  }
}
