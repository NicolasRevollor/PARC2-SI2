import { Component, NgZone, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Exportacion, IaService, RespuestaReporteIA, SolicitudHistorial } from '../../core/services/ia.service';
import { TenantService } from '../../core/services/tenant.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { GraficoComponent } from '../../shared/components/grafico.component';

type Generado = Extract<RespuestaReporteIA, { estado: 'generado' }>;
type SinDatos = Extract<RespuestaReporteIA, { estado: 'sin_datos' }>;

/** Reconocimiento de voz del navegador (Chrome y Edge lo exponen con prefijo). */
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const EJEMPLOS = [
  'Mostrame las ventas de septiembre agrupadas por sucursal',
  'Los 10 productos más vendidos por unidades este mes',
  'Ventas por semana de los últimos 60 días',
  'Devoluciones por talla del mes pasado',
  'Stock disponible por sucursal y categoría',
];
/** [CU27] alternativo 2: por debajo de esto se pide repetir. */
const CONFIANZA_MINIMA = 0.5;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU26] Solicitar reporte generativo en lenguaje natural
// [CU27] Solicitar reporte generativo por voz
// [CU28] Exportar reporte a PDF o Excel
// Boundary: ReportesIAUI -> este componente
// Control: backend/app/routers/reportes_generativos.py -> consultar, transcribir, exportar
// En palabras simples: se escribe o se dicta el pedido; el backend lo interpreta,
//   lo valida contra lo permitido y devuelve el reporte con datos reales.
// ==================================================================
@Component({
  selector: 'app-reports-ia',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent, GraficoComponent],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Reportes con IA</h1>
        <div class="flex flex-wrap gap-1.5 mt-1">
          <app-cu-badge cu="CU26" [conNombre]="true"></app-cu-badge>
          <app-cu-badge cu="CU27" [conNombre]="true"></app-cu-badge>
          <app-cu-badge cu="CU28" [conNombre]="true"></app-cu-badge>
        </div>
        <p class="text-xs text-gray-500 mt-1">Pida el reporte con sus palabras. Solo se consultan datos de su empresa{{ restringido() ? ' y de sus sucursales' : '' }}; nunca se modifica nada.</p>
      </div>

      <!-- [CU25] alternativo 1 / CU26 alternativo 7: plan sin IA -->
      <div *ngIf="planCargado() && !tenantService.permite('permiteIA')" class="ys-tarjeta p-5 border-amber-300" data-testid="sin-plan-ia">
        <p class="text-sm font-semibold text-amber-700">Funcionalidad no incluida en su plan ({{ tenantService.plan()?.nombre }}).</p>
        <p class="text-xs text-gray-600 mt-1">Los reportes generativos están en los planes que incluyen IA. Puede mejorar su plan desde "Suscripción y Plan".</p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
        <div class="space-y-4 min-w-0">
          <!-- Paso 1: la solicitud -->
          <div class="ys-tarjeta p-4 space-y-3">
            <label class="ys-etiqueta" for="solicitud">¿Qué reporte necesita?</label>
            <div class="flex gap-2 items-start">
              <textarea id="solicitud" rows="2" [(ngModel)]="texto" name="texto" maxlength="500" class="ys-campo mt-0 flex-1 resize-none"
                        placeholder="Ej.: Mostrame las ventas de septiembre agrupadas por sucursal" (keydown.enter)="$event.preventDefault(); enviar()"
                        data-testid="texto-solicitud"></textarea>
              <!-- [CU27] paso 1; alternativo 3: sin conexión no hay voz -->
              <button (click)="grabando() ? detener() : grabar()" [disabled]="!enLinea() || cargando()"
                      class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      [ngClass]="grabando() ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'border-gray-200 text-gray-700 hover:border-indigo-300'"
                      [title]="enLinea() ? (grabando() ? 'Detener' : 'Dictar la solicitud') : 'La voz necesita conexión a Internet'"
                      data-testid="microfono">
                <span class="material-symbols-outlined text-[20px]">{{ grabando() ? 'stop' : 'mic' }}</span>
              </button>
            </div>
            <p *ngIf="grabando()" class="text-xs text-rose-600">Grabando… dicte su solicitud y pulse Detener.</p>
            <p *ngIf="transcribiendo()" class="text-xs text-gray-500">Convirtiendo el audio a texto…</p>
            <!-- [CU27] paso 5: confirmar o corregir la transcripción -->
            <div *ngIf="transcripcion() !== null" class="p-3 rounded-lg border border-indigo-300 space-y-2" data-testid="transcripcion">
              <p class="ys-mini">Transcripción: revísela o corríjala antes de continuar</p>
              <input class="ys-campo mt-0" [(ngModel)]="textoTranscrito" name="transcrito" />
              <div class="flex gap-2">
                <button (click)="transcripcion.set(null)" class="ys-btn-sec py-1">Descartar</button>
                <button (click)="confirmarVoz()" [disabled]="textoTranscrito.trim().length < 3" class="ys-btn py-1">Confirmar y generar</button>
              </div>
            </div>
            <p *ngIf="avisoVoz()" class="text-xs text-amber-700" data-testid="aviso-voz">{{ avisoVoz() }}</p>
            <div class="flex items-center gap-2 flex-wrap">
              <button (click)="enviar()" [disabled]="cargando() || texto.trim().length < 3" class="ys-btn" data-testid="generar">
                <span class="material-symbols-outlined text-[16px]">auto_awesome</span> {{ cargando() ? 'Generando…' : 'Generar reporte' }}
              </button>
              <button *ngFor="let e of ejemplos.slice(0, 3)" (click)="texto = e" class="text-[11px] text-gray-500 hover:text-indigo-600 bg-transparent cursor-pointer underline">{{ e }}</button>
            </div>
          </div>

          <ng-container *ngIf="respuesta() as r">
            <!-- Alternativo 1: ambigua -->
            <div *ngIf="r.estado === 'aclaracion'" class="ys-tarjeta p-4 space-y-2" data-testid="aclaracion">
              <p class="text-sm font-semibold text-gray-900">{{ r.pregunta }}</p>
              <div class="flex flex-wrap gap-2">
                <button *ngFor="let o of r.opciones" (click)="texto = o; enviar()" class="ys-opcion text-xs">{{ o }}</button>
              </div>
            </div>

            <!-- Alternativos 3 y 4: no soportada, intenta modificar o pide otra empresa -->
            <div *ngIf="r.estado === 'rechazado'" class="ys-tarjeta p-4 space-y-2 border-rose-300" data-testid="rechazado">
              <p class="text-sm font-semibold text-rose-600">{{ r.motivo }}</p>
              <p class="ys-mini">Reportes disponibles, por ejemplo:</p>
              <div class="flex flex-wrap gap-2">
                <button *ngFor="let e of r.ejemplos" (click)="texto = e; enviar()" class="ys-opcion text-xs">{{ e }}</button>
              </div>
            </div>

            <!-- Alternativo 6: sin datos -->
            <div *ngIf="r.estado === 'sin_datos'" class="ys-tarjeta p-4 space-y-3" data-testid="sin-datos">
              <p class="text-base font-bold text-gray-900">{{ r.titulo }}</p>
              <ng-container *ngTemplateOutlet="filtrosTpl; context: { $implicit: r }"></ng-container>
              <p class="text-sm text-gray-600">{{ r.mensaje }}.</p>
              <ng-container *ngTemplateOutlet="ajustesTpl; context: { $implicit: r }"></ng-container>
            </div>

            <!-- Paso 6: el reporte -->
            <div *ngIf="r.estado === 'generado'" class="ys-tarjeta p-4 space-y-4" data-testid="reporte">
              <div class="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <p class="text-base font-bold text-gray-900">{{ r.titulo }}</p>
                  <p class="text-[10px] text-gray-400">Interpretado con {{ r.motor }} · {{ r.filas.length }} fila(s)</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <button (click)="alternarFavorita(r)" class="ys-btn-sec py-1" [title]="r.favorita ? 'Quitar de favoritas' : 'Guardar como favorita'" data-testid="favorita">
                    <span class="material-symbols-outlined text-[16px]" [class.text-amber-500]="r.favorita">{{ r.favorita ? 'star' : 'star_outline' }}</span>
                    {{ r.favorita ? 'Favorita' : 'Guardar' }}
                  </button>
                  <!-- [CU28] paso 1 -->
                  <button (click)="exportar(r, 'pdf')" [disabled]="exportando()" class="ys-btn-sec py-1" data-testid="exportar-pdf">
                    <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
                  </button>
                  <button (click)="exportar(r, 'xlsx')" [disabled]="exportando()" class="ys-btn-sec py-1" data-testid="exportar-excel">
                    <span class="material-symbols-outlined text-[16px]">table_view</span> Excel
                  </button>
                </div>
              </div>

              <ng-container *ngTemplateOutlet="filtrosTpl; context: { $implicit: r }"></ng-container>
              <p *ngFor="let a of r.avisos" class="text-xs text-amber-700" data-testid="aviso">{{ a }}</p>

              <div class="p-3 rounded-lg bg-gray-50 border border-gray-200" data-testid="resumen">
                <p class="ys-mini mb-1">Resumen</p>
                <p class="text-sm text-gray-700 leading-relaxed">{{ r.resumen }}</p>
              </div>

              <app-grafico *ngIf="r.visualizacion !== 'tabla' && serieGrafico() as g" [titulo]="g.titulo" [tipo]="g.tipo" [formato]="g.formato" [datos]="g.datos"></app-grafico>

              <div class="overflow-x-auto max-h-[420px] overflow-y-auto border border-gray-100 rounded-lg">
                <table class="w-full text-xs">
                  <thead class="sticky top-0 bg-gray-50"><tr class="text-left ys-mini">
                    <th *ngFor="let c of r.columnas" class="px-3 py-2" [class.text-right]="c.tipo !== 'texto'">{{ c.etiqueta }}</th>
                  </tr></thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr *ngFor="let f of r.filas">
                      <td *ngFor="let c of r.columnas" class="px-3 py-1.5 text-gray-700" [class.text-right]="c.tipo !== 'texto'" [class.tabular-nums]="c.tipo !== 'texto'">{{ valor(f[c.clave], c.tipo) }}</td>
                    </tr>
                  </tbody>
                  <tfoot *ngIf="tieneTotales(r)" class="border-t-2 border-gray-200 font-semibold">
                    <tr>
                      <td *ngFor="let c of r.columnas; let i = index" class="px-3 py-2 text-gray-900" [class.text-right]="c.tipo !== 'texto'">
                        {{ i === 0 ? 'Total' : (r.totales[c.clave] !== undefined ? valor(r.totales[c.clave], c.tipo) : '') }}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <ng-container *ngTemplateOutlet="ajustesTpl; context: { $implicit: r }"></ng-container>
            </div>
          </ng-container>
        </div>

        <!-- Poscondición: historial; paso 7: favoritas; CU28 alt. 1: exportaciones en segundo plano -->
        <aside class="space-y-4">
          <div class="ys-tarjeta p-4 space-y-2">
            <div class="flex items-center justify-between">
              <p class="ys-etiqueta">Historial</p>
              <label class="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" [(ngModel)]="soloFavoritas" (change)="cargarHistorial()" name="fav" /> Favoritas</label>
            </div>
            <p *ngIf="!historial().length" class="text-xs text-gray-400">Todavía no pidió reportes.</p>
            <button *ngFor="let h of historial()" (click)="texto = h.texto; enviar()" class="w-full text-left p-2 rounded-lg hover:bg-gray-50 bg-transparent cursor-pointer border border-transparent hover:border-gray-200" data-testid="historial">
              <p class="text-xs text-gray-900 line-clamp-2">
                <span *ngIf="h.favorita" class="text-amber-500">★ </span>
                <span *ngIf="h.origen === 'voz'" class="material-symbols-outlined text-[12px] align-middle text-gray-400">mic</span>
                {{ h.titulo || h.texto }}
              </p>
              <p class="text-[10px] text-gray-400">{{ h.fecha | date: 'dd/MM HH:mm' }} · {{ estados[h.estado] || h.estado }}</p>
            </button>
          </div>

          <div *ngIf="exportaciones().length" class="ys-tarjeta p-4 space-y-2" data-testid="exportaciones">
            <div class="flex items-center justify-between">
              <p class="ys-etiqueta">Exportaciones</p>
              <button (click)="cargarExportaciones()" class="text-[11px] text-gray-500 hover:text-gray-900 bg-transparent cursor-pointer underline">Actualizar</button>
            </div>
            <div *ngFor="let e of exportaciones()" class="flex items-center justify-between gap-2 text-xs">
              <div class="min-w-0"><p class="truncate text-gray-900">{{ e.titulo }}</p>
                <p class="text-[10px] text-gray-400">{{ e.formato.toUpperCase() }} · {{ e.fecha | date: 'dd/MM HH:mm' }}</p></div>
              <button *ngIf="e.estado === 'Lista'" (click)="iaService.descargarExportacion(e)" class="ys-btn-sec py-1 text-[11px]">Descargar</button>
              <span *ngIf="e.estado === 'EnProceso'" class="ys-chip border-amber-300 text-amber-700">En proceso</span>
              <span *ngIf="e.estado === 'Fallida'" class="ys-chip border-rose-300 text-rose-600" [title]="e.error || ''">Falló</span>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <ng-template #filtrosTpl let-r>
      <div class="flex flex-wrap gap-1.5" data-testid="filtros">
        <span *ngFor="let f of r.filtros" class="px-2 py-0.5 rounded-md border border-gray-200 text-[11px] text-gray-600"><b class="text-gray-900">{{ f[0] }}:</b> {{ f[1] }}</span>
      </div>
    </ng-template>

    <!-- Paso 7: ajustar filtros sin volver a la IA -->
    <ng-template #ajustesTpl let-r>
      <details class="text-xs" data-testid="ajustes">
        <summary class="cursor-pointer text-gray-500 hover:text-gray-900">Ajustar filtros</summary>
        <div class="flex flex-wrap items-end gap-3 mt-2">
          <ng-container *ngIf="r.ajustes.usaFechas">
            <label><span class="ys-mini block">Desde</span><input type="date" class="ys-filtro" [(ngModel)]="ajusteDesde" name="desde" /></label>
            <label><span class="ys-mini block">Hasta</span><input type="date" class="ys-filtro" [(ngModel)]="ajusteHasta" name="hasta" /></label>
          </ng-container>
          <div *ngIf="r.ajustes.sucursalesDisponibles.length > 1">
            <span class="ys-mini block">Sucursales</span>
            <div class="flex flex-wrap gap-1.5 mt-1">
              <label *ngFor="let s of r.ajustes.sucursalesDisponibles" class="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-700">
                <input type="checkbox" [checked]="ajusteSucursales.includes(s)" (change)="alternarSucursal(s)" /> {{ s }}
              </label>
            </div>
          </div>
          <button (click)="aplicarAjustes(r.idSolicitud)" [disabled]="cargando()" class="ys-btn py-1">Aplicar</button>
        </div>
      </details>
    </ng-template>
  `,
})
export class ReportsIaComponent implements OnInit, OnDestroy {
  readonly ejemplos = EJEMPLOS;
  readonly estados: Record<string, string> = {
    Generado: 'generado', SinDatos: 'sin datos', Rechazado: 'rechazado', Aclaracion: 'pidió aclaración',
  };
  texto = '';
  textoTranscrito = '';
  soloFavoritas = false;
  ajusteDesde = '';
  ajusteHasta = '';
  ajusteSucursales: string[] = [];

  readonly respuesta = signal<RespuestaReporteIA | null>(null);
  readonly cargando = signal(false);
  readonly exportando = signal(false);
  readonly historial = signal<SolicitudHistorial[]>([]);
  readonly exportaciones = signal<Exportacion[]>([]);
  readonly grabando = signal(false);
  readonly transcribiendo = signal(false);
  readonly transcripcion = signal<string | null>(null);
  readonly avisoVoz = signal<string | null>(null);
  readonly enLinea = computed(() => this.offlineSync.enLinea());
  readonly planCargado = computed(() => this.tenantService.plan() !== null);
  readonly restringido = computed(() => {
    const r = this.respuesta();
    return !!r && 'ajustes' in r && r.ajustes.sucursalesDisponibles.length <= 1;
  });

  /** Paso 6: la primera métrica por la primera dimensión. */
  readonly serieGrafico = computed(() => {
    const r = this.respuesta();
    if (!r || r.estado !== 'generado') return null;
    const dims = r.columnas.filter(c => c.tipo === 'texto');
    const metrica = r.columnas.find(c => c.tipo !== 'texto');
    if (!dims.length || !metrica) return null;
    const filas = r.filas.slice(0, r.visualizacion === 'lineas' ? 120 : 25);
    return {
      titulo: `${metrica.etiqueta} por ${dims.map(d => d.etiqueta.toLowerCase()).join(' y ')}`,
      tipo: r.visualizacion === 'tabla' ? 'barras' as const : r.visualizacion,
      formato: (metrica.tipo === 'moneda' ? 'moneda' : metrica.tipo === 'entero' ? 'entero' : 'decimal') as 'moneda' | 'entero' | 'decimal',
      datos: { etiquetas: filas.map(f => dims.map(d => String(f[d.clave] ?? '—')).join(' · ')), valores: filas.map(f => Number(f[metrica.clave]) || 0) },
    };
  });

  private reconocedor: Reconocedor | null = null;
  private grabadora: MediaRecorder | null = null;
  private pedazos: Blob[] = [];
  private flujo: MediaStream | null = null;

  constructor(
    public iaService: IaService,
    public tenantService: TenantService,
    private offlineSync: OfflineSyncService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    if (!this.tenantService.contexto()) void this.tenantService.cargarContexto();
    void this.cargarHistorial();
    void this.cargarExportaciones();
  }

  ngOnDestroy(): void {
    this.reconocedor?.stop();
    this.flujo?.getTracks().forEach(t => t.stop());
  }

  async cargarHistorial(): Promise<void> {
    this.historial.set(await this.iaService.historial(this.soloFavoritas));
  }

  async cargarExportaciones(): Promise<void> {
    this.exportaciones.set(await this.iaService.exportaciones());
  }

  // --- [CU26] ---------------------------------------------------------------

  async enviar(origen: 'texto' | 'voz' = 'texto'): Promise<void> {
    const texto = this.texto.trim();
    if (texto.length < 3 || this.cargando()) return;
    this.cargando.set(true);
    try {
      this.mostrar(await this.iaService.consultar(texto, origen));
      void this.cargarHistorial();
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudo generar el reporte.');
    } finally {
      this.cargando.set(false);
    }
  }

  private mostrar(r: RespuestaReporteIA): void {
    this.respuesta.set(r);
    if (r.estado === 'generado' || r.estado === 'sin_datos') {
      this.ajusteDesde = r.ajustes.fecha_desde ?? '';
      this.ajusteHasta = r.ajustes.fecha_hasta ?? '';
      this.ajusteSucursales = [...r.ajustes.sucursales];
    }
  }

  alternarSucursal(s: string): void {
    this.ajusteSucursales = this.ajusteSucursales.includes(s) ? this.ajusteSucursales.filter(x => x !== s) : [...this.ajusteSucursales, s];
  }

  async aplicarAjustes(idSolicitud: number): Promise<void> {
    if (this.ajusteDesde && this.ajusteHasta && this.ajusteDesde > this.ajusteHasta) {
      this.avisoVoz.set(null);
      await this.iaService.avisarError({ error: { detail: 'La fecha desde no puede ser posterior a la fecha hasta.' } }, '');
      return;
    }
    this.cargando.set(true);
    try {
      this.mostrar(await this.iaService.ajustar(idSolicitud, {
        fecha_desde: this.ajusteDesde || null, fecha_hasta: this.ajusteHasta || null,
        sucursales: this.ajusteSucursales.length ? this.ajusteSucursales : null,
      }));
      void this.cargarHistorial();
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudieron aplicar los filtros.');
    } finally {
      this.cargando.set(false);
    }
  }

  async alternarFavorita(r: Generado): Promise<void> {
    try {
      const res = await this.iaService.marcarFavorita(r.idSolicitud, !r.favorita);
      this.respuesta.set({ ...r, favorita: res.favorita });
      void this.cargarHistorial();
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudo guardar como favorita.');
    }
  }

  // --- [CU28] ---------------------------------------------------------------

  async exportar(r: Generado | SinDatos, formato: 'pdf' | 'xlsx'): Promise<void> {
    this.exportando.set(true);
    const resultado = await this.iaService.exportar({ origen: 'solicitud', formato, idSolicitud: r.idSolicitud });
    if (resultado === 'segundo-plano') await this.cargarExportaciones();
    this.exportando.set(false);
  }

  tieneTotales(r: Generado): boolean {
    return Object.keys(r.totales).length > 0 && r.filas.length > 1;
  }

  valor(v: string | number | undefined, tipo: string): string {
    if (v === undefined || v === null || v === '') return '—';
    if (tipo === 'texto') return String(v);
    const n = Number(v);
    if (tipo === 'moneda') return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (tipo === 'porcentaje') return n.toLocaleString('es-BO', { maximumFractionDigits: 1 }) + '%';
    return n.toLocaleString('es-BO', { maximumFractionDigits: tipo === 'entero' ? 0 : 2 });
  }

  // --- [CU27] ---------------------------------------------------------------

  async grabar(): Promise<void> {
    this.avisoVoz.set(null);
    this.transcripcion.set(null);
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    const Clase = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Clase) {
      // Paso 2: el navegador pide el permiso del micrófono al empezar.
      const r = new Clase();
      r.lang = 'es-BO';
      r.interimResults = false;
      r.continuous = true;
      let texto = '';
      let confianza = 1;
      let fallo = false;
      r.onresult = (e) => this.zone.run(() => {
        texto = Array.from(e.results).map(x => x[0].transcript).join(' ').trim();
        const valores = Array.from(e.results).map(x => x[0].confidence).filter(c => c > 0);
        confianza = valores.length ? Math.min(...valores) : 1;
      });
      r.onerror = (e) => this.zone.run(() => { fallo = e.error !== 'no-speech'; if (fallo) this.errorVoz(e.error); });
      r.onend = () => this.zone.run(() => {
        this.grabando.set(false);
        this.reconocedor = null;
        if (!fallo) this.resultadoVoz(texto, confianza >= CONFIANZA_MINIMA);
      });
      this.reconocedor = r;
      this.grabando.set(true);
      r.start();
      return;
    }
    // Sin reconocimiento en el navegador (Firefox, Safari viejo): se graba y transcribe el servidor.
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.errorVoz('not-allowed');
      return;
    }
    this.pedazos = [];
    this.grabadora = new MediaRecorder(this.flujo);
    this.grabadora.ondataavailable = (e) => this.pedazos.push(e.data);
    this.grabadora.onstop = () => this.zone.run(() => void this.enviarAudio());
    this.grabadora.start();
    this.grabando.set(true);
  }

  detener(): void {
    // Paso 3.
    this.reconocedor?.stop();
    if (this.grabadora?.state === 'recording') this.grabadora.stop();
    this.flujo?.getTracks().forEach(t => t.stop());
    this.grabando.set(false);
  }

  private async enviarAudio(): Promise<void> {
    const audio = new Blob(this.pedazos, { type: this.grabadora?.mimeType || 'audio/webm' });
    this.grabadora = null;
    if (audio.size < 1000) {
      this.resultadoVoz('', false);
      return;
    }
    this.transcribiendo.set(true);
    try {
      const r = await this.iaService.transcribir(audio);
      this.resultadoVoz(r.texto, r.confianza === 'alta');
    } catch (err) {
      this.avisoVoz.set(await this.iaService.detalle(err, 'No se pudo transcribir el audio: repita la solicitud o escríbala.'));
    } finally {
      this.transcribiendo.set(false);
    }
  }

  private resultadoVoz(texto: string, confiable: boolean): void {
    if (!texto || texto.length < 3 || !confiable) {
      // Alternativo 2.
      this.avisoVoz.set('No se entendió bien la grabación (poca claridad o mucho ruido). Repita la solicitud o escríbala.');
      if (texto) {
        this.textoTranscrito = texto;
        this.transcripcion.set(texto);
      }
      return;
    }
    // Paso 4.
    this.textoTranscrito = texto;
    this.transcripcion.set(texto);
  }

  private errorVoz(codigo: string): void {
    this.grabando.set(false);
    if (codigo === 'not-allowed' || codigo === 'service-not-allowed') {
      // Alternativo 1: sin permiso, la escritura sigue disponible.
      this.avisoVoz.set('No se concedió el permiso del micrófono. Puede escribir su solicitud.');
    } else if (codigo === 'network') {
      this.avisoVoz.set('La voz necesita conexión a Internet. Puede escribir su solicitud.');
    } else if (codigo !== 'aborted') {
      this.avisoVoz.set('No se pudo usar el micrófono. Puede escribir su solicitud.');
    }
  }

  confirmarVoz(): void {
    // Paso 6: continúa como el CU26 desde el paso 2.
    this.texto = this.textoTranscrito.trim();
    this.transcripcion.set(null);
    this.avisoVoz.set(null);
    void this.enviar('voz');
  }
}
