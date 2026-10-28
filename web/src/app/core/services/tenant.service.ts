import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FeaturePlan, PlanOut, TenantMeOut } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/** -1 en los límites del plan significa "sin tope" (backend: tenancy.ILIMITADO). */
export const ILIMITADO = -1;

/**
 * Organización (tenant) y plan de suscripción vigente (CU26/CU27).
 *
 * El gating de la UI que sale de acá es solo cosmético: evita ofrecer botones
 * que el backend va a rechazar. La autorización real la sigue haciendo el
 * backend con `require_feature(...)`, que responde 402 si el plan no incluye
 * la funcionalidad.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly contextoSignal = signal<TenantMeOut | null>(null);
  private readonly planesSignal = signal<PlanOut[]>([]);
  private readonly cargandoSignal = signal<boolean>(false);

  readonly contexto = this.contextoSignal.asReadonly();
  readonly planes = this.planesSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();

  readonly plan = computed(() => this.contextoSignal()?.plan ?? null);
  readonly tenant = computed(() => this.contextoSignal()?.tenant ?? null);
  readonly uso = computed(() => this.contextoSignal()?.uso ?? null);
  readonly suscripcion = computed(() => this.contextoSignal()?.suscripcion ?? null);

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /**
   * Un plan todavía no cargado no habilita nada: así una pantalla nunca
   * muestra una función de pago durante el instante previo a la respuesta.
   */
  permite(feature: FeaturePlan): boolean {
    return this.plan()?.[feature] ?? false;
  }

  /** Texto para mostrar un límite del plan ("5" o "Ilimitado"). */
  formatearLimite(valor: number | undefined | null): string {
    if (valor === undefined || valor === null) return '—';
    return valor === ILIMITADO ? 'Ilimitado' : String(valor);
  }

  /** Porcentaje de consumo de un recurso; 0 si el plan es ilimitado. */
  porcentajeUso(usado: number, limite: number): number {
    if (limite === ILIMITADO || limite <= 0) return 0;
    return Math.min(100, Math.round((usado / limite) * 100));
  }

  async cargarContexto(): Promise<TenantMeOut | null> {
    this.cargandoSignal.set(true);
    try {
      const ctx = await firstValueFrom(this.http.get<TenantMeOut>(`${API_URL}/api/tenant/me`));
      this.contextoSignal.set(ctx);
      return ctx;
    } catch {
      // Silencioso a propósito: un Cliente no tiene "tenant.ver" y este
      // fallo no debe ensuciarle la pantalla con un toast de error.
      this.contextoSignal.set(null);
      return null;
    } finally {
      this.cargandoSignal.set(false);
    }
  }

  async cargarPlanes(): Promise<PlanOut[]> {
    try {
      const planes = await firstValueFrom(this.http.get<PlanOut[]>(`${API_URL}/api/plans`));
      this.planesSignal.set(planes);
      return planes;
    } catch {
      this.notificationService.error('Error', 'No se pudieron cargar los planes disponibles.');
      return [];
    }
  }

  async cambiarPlan(codigo: string): Promise<boolean> {
    try {
      const ctx = await firstValueFrom(
        this.http.patch<TenantMeOut>(`${API_URL}/api/tenant/plan`, { codigo })
      );
      this.contextoSignal.set(ctx);
      this.notificationService.success('Plan actualizado', `Tu organización ahora opera en el plan ${ctx.plan.nombre}.`);
      return true;
    } catch (err: unknown) {
      const detalle = (err as { error?: { detail?: string } })?.error?.detail;
      this.notificationService.error('No se pudo cambiar el plan', detalle || 'Intentá de nuevo en unos minutos.');
      return false;
    }
  }

  limpiar(): void {
    this.contextoSignal.set(null);
    this.planesSignal.set([]);
  }
}
