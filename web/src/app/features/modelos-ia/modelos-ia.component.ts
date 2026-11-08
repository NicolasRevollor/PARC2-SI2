import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatosModelo, IaService, ModeloIA, TipoModelo } from '../../core/services/ia.service';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

/** Nombre legible de cada métrica (paso 5). */
const METRICAS: Record<string, { etiqueta: string; mejorAlto: boolean; ayuda: string }> = {
  r2: { etiqueta: 'R²', mejorAlto: true, ayuda: 'Qué parte de la variación de la demanda explica el modelo (1 = toda).' },
  mae: { etiqueta: 'MAE', mejorAlto: false, ayuda: 'Error promedio, en prendas por semana.' },
  exactitud: { etiqueta: 'Exactitud', mejorAlto: true, ayuda: 'Proporción de ventas bien clasificadas (devuelta o no).' },
  f1: { etiqueta: 'F1', mejorAlto: true, ayuda: 'Equilibrio entre encontrar las devoluciones y no dar falsas alarmas.' },
  silueta: { etiqueta: 'Silueta', mejorAlto: true, ayuda: 'Qué tan separados quedan los segmentos (-1 a 1).' },
  puntos: { etiqueta: 'Días analizados', mejorAlto: true, ayuda: 'Días-sucursal con ventas usados para buscar anomalías.' },
  anomalias: { etiqueta: 'Anomalías', mejorAlto: false, ayuda: 'Casos atípicos encontrados.' },
  segmentos: { etiqueta: 'Segmentos', mejorAlto: true, ayuda: 'Grupos de clientes encontrados.' },
  clientes: { etiqueta: 'Clientes', mejorAlto: true, ayuda: 'Clientes usados para segmentar.' },
  tasaReal: { etiqueta: 'Tasa real de devolución', mejorAlto: false, ayuda: 'Proporción de ventas que de verdad se devolvieron.' },
  tasaAnomalias: { etiqueta: 'Tasa de anomalías', mejorAlto: false, ayuda: 'Proporción de días marcados como atípicos.' },
  muestrasEntrenamiento: { etiqueta: 'Muestras de entrenamiento', mejorAlto: true, ayuda: 'Filas usadas para entrenar.' },
  muestrasPrueba: { etiqueta: 'Muestras de prueba', mejorAlto: true, ayuda: 'Filas reservadas para medir el modelo (en demanda, las semanas más recientes).' },
};

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU29] Entrenar y evaluar modelos de Machine Learning
// Boundary: ModelosIAUI -> este componente
// Control: backend/app/routers/inteligencia.py -> datos_disponibles, entrenar, publicar
// Reglas: backend/app/services/modelos_ia.py (limpieza, division, metricas, umbrales)
// ==================================================================
@Component({
  selector: 'app-modelos-ia',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Modelos de IA</h1>
          <app-cu-badge cu="CU29" [conNombre]="true" class="block mt-1"></app-cu-badge>
          <p class="text-xs text-gray-500 mt-1">Se entrenan solo con datos de su empresa. Una versión se publica si alcanza las métricas mínimas, y entonces la usa el dashboard analítico.</p>
        </div>
        <button (click)="irDashboard.emit()" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">monitoring</span> Ver dashboard analítico</button>
      </div>

      <div *ngIf="sinPlan()" class="ys-tarjeta p-5 border-amber-300" data-testid="sin-plan-ia">
        <p class="text-sm font-semibold text-amber-700">Funcionalidad no incluida en su plan ({{ tenantService.plan()?.nombre }}).</p>
        <p class="text-xs text-gray-600 mt-1">Los modelos de IA están en los planes que incluyen IA. Puede mejorar su plan desde "Suscripción y Plan".</p>
      </div>

      <!-- Paso 1: elegir el modelo -->
      <div *ngIf="!sinPlan()" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <button *ngFor="let d of datos()" (click)="elegir(d)" class="ys-tarjeta p-4 text-left cursor-pointer hover:border-indigo-300"
                [class.border-indigo-500]="elegido()?.tipo === d.tipo" data-testid="tipo-modelo">
          <p class="text-sm font-bold text-gray-900">{{ d.etiqueta }}</p>
          <!-- Paso 2: datos reales disponibles -->
          <p class="text-xs mt-1" [ngClass]="d.suficiente ? 'text-emerald-700' : 'text-amber-700'">
            {{ d.filasReales | number }} datos reales · mínimo {{ d.minimo }}
          </p>
          <p class="text-[11px] text-gray-500 mt-1">
            <ng-container *ngIf="publicado(d.tipo) as p; else sinPublicar">Publicado: v{{ p.version }} · {{ p.algoritmo }}</ng-container>
            <ng-template #sinPublicar>Sin versión publicada</ng-template>
          </p>
        </button>
      </div>

      <div *ngIf="elegido() as d" class="ys-tarjeta p-5 space-y-4" data-testid="configurar">
        <p class="text-base font-bold text-gray-900">{{ d.etiqueta }}</p>

        <!-- Alternativo 1 -->
        <p *ngIf="!d.suficiente" class="text-xs text-amber-700">
          Hay {{ d.filasReales }} datos reales y el mínimo es {{ d.minimo }}: se recomienda completar con datos sintéticos. La versión quedará marcada como entrenada con ellos.
        </p>

        <!-- Paso 2 y 3: fuente de datos -->
        <label class="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" [(ngModel)]="form.usarSinteticos" name="sint" data-testid="usar-sinteticos" />
          Completar con datos sintéticos
        </label>
        <div *ngIf="form.usarSinteticos" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label><span class="ys-mini">Cantidad de registros</span>
            <input type="number" min="200" max="20000" step="100" class="ys-campo" [(ngModel)]="form.registros" name="reg" /></label>
          <label><span class="ys-mini">Período (semanas)</span>
            <input type="number" min="8" max="104" class="ys-campo" [(ngModel)]="form.semanas" name="sem" /></label>
          <label><span class="ys-mini">Estacionalidad ({{ (form.estacionalidad * 100) | number: '1.0-0' }}%)</span>
            <input type="range" min="0" max="1" step="0.05" class="w-full mt-3" [(ngModel)]="form.estacionalidad" name="est" /></label>
        </div>

        <div>
          <p class="ys-mini mb-1">Variables</p>
          <div class="flex flex-wrap gap-1.5">
            <label *ngFor="let v of d.variables" class="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-700">
              <input type="checkbox" [checked]="form.variables.includes(v)" (change)="alternarVariable(v)" /> {{ v }}
            </label>
          </div>
        </div>

        <p class="text-xs text-gray-500">Mínimo para publicar: <span *ngFor="let u of objeto(d.umbrales); let ultimo = last">{{ etiqueta(u[0]) }} ≥ {{ u[1] }}{{ ultimo ? '' : ', ' }}</span></p>

        <button (click)="entrenar(d)" [disabled]="entrenando() || !form.variables.length || (!d.suficiente && !form.usarSinteticos)" class="ys-btn" data-testid="entrenar">
          <span class="material-symbols-outlined text-[16px]">model_training</span> {{ entrenando() ? 'Entrenando…' : 'Entrenar' }}
        </button>
      </div>

      <!-- Paso 6: resultado comparado con la versión anterior -->
      <div *ngIf="resultado() as m" class="ys-tarjeta p-5 space-y-3" data-testid="resultado">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p class="text-base font-bold text-gray-900">{{ m.etiqueta }} · versión {{ m.version }}</p>
            <p class="text-xs text-gray-500">{{ m.algoritmo || '—' }} · {{ m.filasReales | number }} datos reales<span *ngIf="m.conSinteticos"> + {{ m.filasSinteticas | number }} sintéticos</span></p>
          </div>
          <span class="ys-chip" [ngClass]="claseEstado(m)">{{ m.estado }}</span>
        </div>
        <!-- Alternativo 3 -->
        <p *ngIf="m.estado === 'Fallido'" class="text-sm text-rose-600">{{ m.error }}. Se conserva la versión publicada anterior.</p>
        <ng-container *ngIf="m.metricas">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div *ngFor="let x of objeto(m.metricas)" class="p-3 rounded-lg border border-gray-200" [title]="ayuda(x[0])">
              <p class="ys-mini">{{ etiqueta(x[0]) }}</p>
              <p class="text-lg font-bold text-gray-900 tabular-nums">{{ x[1] }}</p>
              <p *ngIf="m.comparacion[x[0]] !== undefined" class="text-[11px]" [ngClass]="mejora(x[0], m.comparacion[x[0]]) ? 'text-emerald-700' : 'text-rose-600'">
                {{ m.comparacion[x[0]] > 0 ? '+' : '' }}{{ m.comparacion[x[0]] }} vs v{{ m.versionComparada }}
              </p>
            </div>
          </div>
          <p *ngIf="m.versionComparada === null && m.estado === 'Entrenado'" class="text-xs text-gray-500">No hay una versión publicada para comparar.</p>
          <!-- Alternativo 2 -->
          <p *ngIf="!m.cumpleUmbral" class="text-sm text-amber-700" data-testid="no-cumple">Las métricas no alcanzan el mínimo: esta versión no se puede publicar. Pruebe con más datos o con otras variables.</p>
          <button *ngIf="m.estado === 'Entrenado' && m.cumpleUmbral" (click)="publicar(m)" [disabled]="publicando()" class="ys-btn" data-testid="publicar">
            <span class="material-symbols-outlined text-[16px]">publish</span> Publicar versión {{ m.version }}
          </button>
        </ng-container>
      </div>

      <!-- Poscondición: versiones registradas -->
      <div *ngIf="modelos().length" class="ys-tarjeta overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="border-b border-gray-200"><tr class="text-left ys-mini">
            <th class="px-4 py-2.5">Modelo</th><th class="px-4 py-2.5">Versión</th><th class="px-4 py-2.5">Estado</th>
            <th class="px-4 py-2.5">Métricas</th><th class="px-4 py-2.5">Datos</th><th class="px-4 py-2.5">Entrenado</th><th></th>
          </tr></thead>
          <tbody class="divide-y divide-gray-100">
            <tr *ngFor="let m of modelos()" data-testid="version">
              <td class="px-4 py-2 text-gray-900">{{ m.etiqueta }}</td>
              <td class="px-4 py-2 text-gray-700">v{{ m.version }}</td>
              <td class="px-4 py-2"><span class="ys-chip" [ngClass]="claseEstado(m)">{{ m.estado }}</span></td>
              <td class="px-4 py-2 text-gray-700"><span *ngFor="let x of objeto(m.metricas || {}).slice(0, 2); let ultimo = last">{{ etiqueta(x[0]) }} {{ x[1] }}{{ ultimo ? '' : ' · ' }}</span></td>
              <td class="px-4 py-2 text-gray-700">{{ m.conSinteticos ? 'Reales + sintéticos' : 'Reales' }}</td>
              <td class="px-4 py-2 text-gray-500">{{ m.fechaEntrenamiento | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td class="px-4 py-2 text-right">
                <button *ngIf="m.estado === 'Entrenado' && m.cumpleUmbral" (click)="publicar(m)" [disabled]="publicando()" class="ys-btn-sec py-1">Publicar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ModelosIaComponent implements OnInit {
  @Output() irDashboard = new EventEmitter<void>();

  readonly datos = signal<DatosModelo[]>([]);
  readonly modelos = signal<ModeloIA[]>([]);
  readonly elegido = signal<DatosModelo | null>(null);
  readonly resultado = signal<ModeloIA | null>(null);
  readonly entrenando = signal(false);
  readonly publicando = signal(false);
  readonly sinPlanBackend = signal(false);
  readonly sinPlan = computed(() => this.sinPlanBackend() || (this.tenantService.plan() !== null && !this.tenantService.permite('permiteIA')));

  form = { usarSinteticos: false, registros: 3000, semanas: 26, estacionalidad: 0.3, variables: [] as string[] };

  constructor(
    private iaService: IaService,
    public tenantService: TenantService,
    private notificationService: NotificationService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (!this.tenantService.contexto()) void this.tenantService.cargarContexto();
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      const [datos, modelos] = await Promise.all([this.iaService.datosModelos(), this.iaService.modelos()]);
      this.datos.set(datos);
      this.modelos.set(modelos);
    } catch (err) {
      if ((err as { status?: number })?.status === 402) this.sinPlanBackend.set(true);
      else await this.iaService.avisarError(err, 'No se pudieron cargar los modelos.');
    }
  }

  publicado(tipo: TipoModelo): ModeloIA | undefined {
    return this.modelos().find(m => m.tipo === tipo && m.estado === 'Publicado');
  }

  elegir(d: DatosModelo): void {
    this.elegido.set(d);
    this.resultado.set(null);
    this.form = { usarSinteticos: !d.suficiente, registros: 3000, semanas: 26, estacionalidad: 0.3, variables: [...d.variables] };
  }

  alternarVariable(v: string): void {
    this.form.variables = this.form.variables.includes(v) ? this.form.variables.filter(x => x !== v) : [...this.form.variables, v];
  }

  async entrenar(d: DatosModelo): Promise<void> {
    this.entrenando.set(true);
    try {
      const m = await this.iaService.entrenar({ tipo: d.tipo, ...this.form });
      this.resultado.set(m);
      if (m.estado === 'Fallido') this.notificationService.error('El entrenamiento falló', m.error || '');
      else this.notificationService.success('Modelo entrenado', `${m.etiqueta} v${m.version}`);
      await this.cargar();
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudo entrenar el modelo.');
    } finally {
      this.entrenando.set(false);
    }
  }

  async publicar(m: ModeloIA): Promise<void> {
    this.publicando.set(true);
    try {
      const publicado = await this.iaService.publicar(m.idModeloIA);
      this.notificationService.success('Versión publicada', `${publicado.etiqueta} v${publicado.version} ya se usa en el dashboard analítico.`);
      if (this.resultado()?.idModeloIA === m.idModeloIA) this.resultado.set(publicado);
      await this.cargar();
    } catch (err) {
      await this.iaService.avisarError(err, 'No se pudo publicar la versión.');
    } finally {
      this.publicando.set(false);
    }
  }

  objeto(o: Record<string, number>): [string, number][] {
    return Object.entries(o);
  }

  etiqueta(clave: string): string {
    return METRICAS[clave]?.etiqueta ?? clave;
  }

  ayuda(clave: string): string {
    return METRICAS[clave]?.ayuda ?? '';
  }

  mejora(clave: string, diferencia: number): boolean {
    return (METRICAS[clave]?.mejorAlto ?? true) ? diferencia >= 0 : diferencia <= 0;
  }

  claseEstado(m: ModeloIA): string {
    return {
      Publicado: 'border-emerald-300 text-emerald-700',
      Entrenado: 'border-indigo-300 text-indigo-700',
      Retirado: 'border-gray-300 text-gray-500',
      Fallido: 'border-rose-300 text-rose-600',
    }[m.estado] ?? 'border-gray-300 text-gray-500';
  }
}
