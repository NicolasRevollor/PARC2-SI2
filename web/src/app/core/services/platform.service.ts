import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EmpresaIn, EmpresaOut, EstadoTenant, ResumenPlataforma } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/** Permiso exclusivo del Superadministrador (migración 016). */
export const PERMISO_PLATAFORMA = 'plataforma.admin';

/**
 * Consola de plataforma: gestión de TODAS las empresas suscritas.
 * Solo funciona con el permiso `plataforma.admin`; el backend responde 403 a
 * cualquier otro rol, así que el menú solo la muestra a quien lo tiene.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly empresasSignal = signal<EmpresaOut[]>([]);
  private readonly resumenSignal = signal<ResumenPlataforma | null>(null);
  private readonly cargandoSignal = signal<boolean>(false);

  readonly empresas = this.empresasSignal.asReadonly();
  readonly resumen = this.resumenSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private detalle(err: unknown, porDefecto: string): string {
    return (err as { error?: { detail?: string } })?.error?.detail || porDefecto;
  }

  async cargar(): Promise<void> {
    this.cargandoSignal.set(true);
    try {
      const [resumen, empresas] = await Promise.all([
        firstValueFrom(this.http.get<ResumenPlataforma>(`${API_URL}/api/platform/resumen`)),
        firstValueFrom(this.http.get<EmpresaOut[]>(`${API_URL}/api/platform/tenants`)),
      ]);
      this.resumenSignal.set(resumen);
      this.empresasSignal.set(empresas);
    } catch (err) {
      this.notificationService.error('Error', this.detalle(err, 'No se pudieron cargar las empresas de la plataforma.'));
    } finally {
      this.cargandoSignal.set(false);
    }
  }

  private reemplazar(actualizada: EmpresaOut): void {
    this.empresasSignal.update((lista) =>
      lista.map((e) => (e.tenant.idTenant === actualizada.tenant.idTenant ? actualizada : e))
    );
  }

  /** El resumen (ingreso mensual, conteo por plan) cambia con cada operación. */
  private async refrescarResumen(): Promise<void> {
    try {
      this.resumenSignal.set(
        await firstValueFrom(this.http.get<ResumenPlataforma>(`${API_URL}/api/platform/resumen`))
      );
    } catch {
      // El listado ya quedó actualizado; un resumen desfasado no justifica un error.
    }
  }

  async crearEmpresa(payload: EmpresaIn): Promise<boolean> {
    try {
      const creada = await firstValueFrom(
        this.http.post<EmpresaOut>(`${API_URL}/api/platform/tenants`, payload)
      );
      this.empresasSignal.update((lista) => [...lista, creada]);
      await this.refrescarResumen();
      this.notificationService.success('Empresa creada', `${creada.tenant.nombre} ya puede operar con el plan ${creada.plan.nombre}.`);
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo crear la empresa', this.detalle(err, 'Revisá los datos e intentá de nuevo.'));
      return false;
    }
  }

  async cambiarPlan(idTenant: number, codigo: string): Promise<boolean> {
    try {
      const empresa = await firstValueFrom(
        this.http.patch<EmpresaOut>(`${API_URL}/api/platform/tenants/${idTenant}/plan`, { codigo })
      );
      this.reemplazar(empresa);
      await this.refrescarResumen();
      this.notificationService.success('Plan actualizado', `${empresa.tenant.nombre} ahora está en el plan ${empresa.plan.nombre}.`);
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo cambiar el plan', this.detalle(err, 'Intentá de nuevo.'));
      return false;
    }
  }

  async cambiarEstado(idTenant: number, estado: EstadoTenant): Promise<boolean> {
    try {
      const empresa = await firstValueFrom(
        this.http.patch<EmpresaOut>(`${API_URL}/api/platform/tenants/${idTenant}/estado`, { estado })
      );
      this.reemplazar(empresa);
      await this.refrescarResumen();
      this.notificationService.success(
        estado === 'Activo' ? 'Empresa reactivada' : 'Empresa suspendida',
        estado === 'Activo'
          ? `${empresa.tenant.nombre} vuelve a tener acceso.`
          : `Los usuarios de ${empresa.tenant.nombre} ya no pueden iniciar sesión.`
      );
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo cambiar el estado', this.detalle(err, 'Intentá de nuevo.'));
      return false;
    }
  }
}
