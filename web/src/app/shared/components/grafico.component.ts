import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Grafico simple en SVG para los reportes generativos (CU26) y el dashboard (CU30).
 *
 * Reglas del skill de visualizacion: una serie = un solo tono; marcas finas con el
 * extremo redondeado; un solo eje; tooltip al pasar el mouse; y una vista de
 * tabla para no depender del color. Colores validados con validate_palette.js
 * contra la superficie oscura de la app (#18191d): todos los checks pasan.
 */
export const SERIE = '#3987e5';
export const CATEGORIAS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export type TipoGrafico = 'barras' | 'lineas' | 'torta';

@Component({
  selector: 'app-grafico',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="ys-etiqueta">{{ titulo }}</p>
        <button (click)="tabla.set(!tabla())" class="text-[11px] text-gray-500 hover:text-gray-900 bg-transparent cursor-pointer underline">
          {{ tabla() ? 'Ver gráfico' : 'Ver tabla' }}
        </button>
      </div>

      <table *ngIf="tabla()" class="w-full text-xs">
        <tr *ngFor="let e of etiquetas; let i = index" class="border-b border-gray-100">
          <td class="py-1 text-gray-700">{{ e }}</td><td class="py-1 text-right text-gray-900">{{ formatear(valores[i]) }}</td>
        </tr>
      </table>

      <!-- Barras horizontales: las etiquetas largas se leen sin rotarlas. -->
      <div *ngIf="!tabla() && tipo === 'barras'" class="space-y-1.5">
        <div *ngFor="let e of etiquetas; let i = index" class="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-2 text-[11px]"
             [title]="e + ': ' + formatear(valores[i])">
          <span class="truncate text-gray-700">{{ e }}</span>
          <div class="h-3 rounded-r-[4px]" [style.width.%]="ancho(valores[i])" [style.background]="serie"></div>
          <span class="text-gray-900 tabular-nums">{{ formatear(valores[i]) }}</span>
        </div>
      </div>

      <div *ngIf="!tabla() && tipo === 'lineas'" class="relative">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="w-full h-auto" (mousemove)="mover($event, svg)" (mouseleave)="activo.set(null)" #svg>
          <line *ngFor="let t of ticks()" [attr.x1]="M" [attr.x2]="W - 8" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--color-gray-100)" />
          <text *ngFor="let t of ticks()" [attr.x]="M - 6" [attr.y]="t.y + 3" text-anchor="end" font-size="11" fill="var(--color-gray-500)">{{ t.texto }}</text>
          <polyline [attr.points]="puntosTexto()" fill="none" [attr.stroke]="serie" stroke-width="2" stroke-linejoin="round" />
          <ng-container *ngIf="activo() as a">
            <line [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="8" [attr.y2]="H - 20" stroke="var(--color-gray-300)" stroke-dasharray="2,2" />
            <circle [attr.cx]="a.x" [attr.cy]="a.y" r="4" [attr.fill]="serie" stroke="#18191d" stroke-width="2" />
          </ng-container>
          <text *ngFor="let p of etiquetasEje(); let ultimo = last" [attr.x]="p.x" [attr.y]="H - 6" [attr.text-anchor]="ultimo && p.x > W - 40 ? 'end' : 'middle'" font-size="11" fill="var(--color-gray-500)">{{ p.texto }}</text>
        </svg>
        <div *ngIf="activo() as a" class="absolute pointer-events-none ys-tarjeta px-2 py-1 text-[11px] text-gray-900"
             [style.left.%]="(a.x / W) * 100" [style.top.px]="0">{{ a.etiqueta }} · {{ formatear(a.valor) }}</div>
      </div>

      <!-- Torta solo si se pidio explicitamente y con pocas partes; con leyenda y etiqueta directa. -->
      <div *ngIf="!tabla() && tipo === 'torta'" class="flex items-center gap-4 flex-wrap">
        <svg viewBox="-1.1 -1.1 2.2 2.2" class="w-36 h-36 shrink-0">
          <path *ngFor="let s of porciones(); let i = index" [attr.d]="s.d" [attr.fill]="colores[i]" stroke="#18191d" stroke-width="0.03">
            <title>{{ etiquetas[i] }}: {{ formatear(valores[i]) }}</title>
          </path>
        </svg>
        <div class="space-y-1 text-[11px]">
          <p *ngFor="let e of etiquetas; let i = index" class="flex items-center gap-2 text-gray-700">
            <span class="w-2.5 h-2.5 rounded-sm" [style.background]="colores[i]"></span>{{ e }} · {{ porcentaje(i) }}%
          </p>
        </div>
      </div>
    </div>
  `,
})
export class GraficoComponent {
  @Input() titulo = '';
  @Input() tipo: TipoGrafico = 'barras';
  @Input() formato: 'moneda' | 'entero' | 'decimal' = 'entero';
  @Input() set datos(valor: { etiquetas: string[]; valores: number[] }) {
    this.etiquetas = valor.etiquetas;
    this.valores = valor.valores.map(v => Number(v) || 0);
    this.datosSignal.set(this.valores);
  }

  readonly serie = SERIE;
  readonly colores = CATEGORIAS;
  // Proporcion ancha: en la tarjeta de ~1000px queda de ~240px de alto y las letras a tamano real.
  readonly W = 1000;
  readonly H = 240;
  readonly M = 48;
  etiquetas: string[] = [];
  valores: number[] = [];
  readonly tabla = signal(false);
  readonly activo = signal<{ x: number; y: number; etiqueta: string; valor: number } | null>(null);
  private readonly datosSignal = signal<number[]>([]);

  private readonly maximo = computed(() => Math.max(...this.datosSignal(), 1));
  readonly puntos = computed(() => {
    const v = this.datosSignal();
    const paso = v.length > 1 ? (this.W - this.M - 8) / (v.length - 1) : 0;
    return v.map((valor, i) => ({ x: this.M + i * paso, y: 8 + (1 - valor / this.maximo()) * (this.H - 28) }));
  });
  readonly puntosTexto = computed(() => this.puntos().map(p => `${p.x},${p.y}`).join(' '));
  readonly ticks = computed(() => [0, 0.5, 1].map(f => ({ y: 8 + (1 - f) * (this.H - 28), texto: this.corto(this.maximo() * f) })));
  readonly etiquetasEje = computed(() => {
    const paso = Math.max(Math.ceil(this.etiquetas.length / 6), 1);
    return this.puntos().filter((_, i) => i % paso === 0).map((p, k) => ({ x: p.x, texto: this.etiquetas[k * paso] }));
  });

  ancho(valor: number): number {
    return Math.max((valor / this.maximo()) * 100, 0.5);
  }

  formatear(valor: number): string {
    if (this.formato === 'moneda') return 'Bs ' + valor.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (this.formato === 'decimal') return valor.toLocaleString('es-BO', { maximumFractionDigits: 2 });
    return valor.toLocaleString('es-BO', { maximumFractionDigits: 0 });
  }

  private corto(valor: number): string {
    return valor >= 1000 ? `${(valor / 1000).toFixed(1)}k` : valor.toFixed(0);
  }

  mover(evento: MouseEvent, svg: SVGSVGElement): void {
    const caja = svg.getBoundingClientRect();
    const x = ((evento.clientX - caja.left) / caja.width) * this.W;
    const puntos = this.puntos();
    if (!puntos.length) return;
    let i = 0;
    puntos.forEach((p, k) => { if (Math.abs(p.x - x) < Math.abs(puntos[i].x - x)) i = k; });
    this.activo.set({ ...puntos[i], etiqueta: this.etiquetas[i], valor: this.valores[i] });
  }

  porcentaje(i: number): string {
    const total = this.valores.reduce((a, b) => a + b, 0) || 1;
    return ((this.valores[i] * 100) / total).toFixed(0);
  }

  porciones(): { d: string }[] {
    const total = this.valores.reduce((a, b) => a + b, 0) || 1;
    let angulo = -Math.PI / 2;
    return this.valores.map(v => {
      const fin = angulo + (v / total) * Math.PI * 2;
      const grande = fin - angulo > Math.PI ? 1 : 0;
      const d = `M 0 0 L ${Math.cos(angulo)} ${Math.sin(angulo)} A 1 1 0 ${grande} 1 ${Math.cos(fin)} ${Math.sin(fin)} Z`;
      angulo = fin;
      return { d };
    });
  }
}
