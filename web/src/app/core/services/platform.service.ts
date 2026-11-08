import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Activacion,
  BitacoraEntrada,
  EmpresaCreada,
  EmpresaIn,
  EmpresaOut,
  PagoSuscripcion,
  PlanAdmin,
  PlanIn,
  EstadoTenant,
  FiltrosBitacora,
  Paginado,
  Respaldo,
  RespaldoConfig,
  ResumenPlataforma,
} from '../models';
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

  /** El backend marca algunos errores con el campo (CU21 alt. 1): {campo, mensaje}. */
  private detalle(err: unknown, porDefecto: string): string {
    const detalle = (err as { error?: { detail?: string | { mensaje?: string } } })?.error?.detail;
    if (detalle && typeof detalle === 'object') return detalle.mensaje || porDefecto;
    return detalle || porDefecto;
  }

  campoConError(err: unknown): string | null {
    const detalle = (err as { error?: { detail?: { campo?: string } } })?.error?.detail;
    return detalle && typeof detalle === 'object' ? detalle.campo ?? null : null;
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

  /** [CU21]: devuelve la empresa creada, o el error con su campo para marcarlo en el formulario. */
  async crearEmpresa(payload: EmpresaIn): Promise<{ creada: EmpresaCreada | null; campo: string | null; error: string | null }> {
    try {
      const creada = await firstValueFrom(
        this.http.post<EmpresaCreada>(`${API_URL}/api/platform/tenants`, payload)
      );
      this.empresasSignal.update((lista) => [...lista, creada.empresa]);
      await this.refrescarResumen();
      this.notificationService.success('Empresa creada', `${creada.empresa.tenant.nombre} quedó activa con el plan ${creada.empresa.plan.nombre}.`);
      return { creada, campo: null, error: null };
    } catch (err) {
      return { creada: null, campo: this.campoConError(err), error: this.detalle(err, 'Revisá los datos e intentá de nuevo.') };
    }
  }

  async reenviarActivacion(idTenant: number): Promise<Activacion | null> {
    try {
      return await firstValueFrom(this.http.post<Activacion>(`${API_URL}/api/platform/tenants/${idTenant}/activacion`, {}));
    } catch (err) {
      this.notificationService.error('No se pudo reenviar', this.detalle(err, 'Intentá de nuevo.'));
      return null;
    }
  }

  // --- [CU22] Suscripciones ----------------------------------------------

  async suscripciones(): Promise<EmpresaOut[]> {
    try {
      const lista = await firstValueFrom(this.http.get<EmpresaOut[]>(`${API_URL}/api/platform/suscripciones`));
      this.empresasSignal.set(lista);
      return lista;
    } catch (err) {
      this.notificationService.error('Error', this.detalle(err, 'No se pudieron cargar las suscripciones.'));
      return [];
    }
  }

  async accionSuscripcion(idTenant: number, accion: 'renovar' | 'suspender' | 'reactivar' | 'cancelar', cuerpo: object = {}): Promise<boolean> {
    try {
      const empresa = await firstValueFrom(this.http.post<EmpresaOut>(`${API_URL}/api/platform/tenants/${idTenant}/${accion}`, cuerpo));
      this.reemplazar(empresa);
      await this.refrescarResumen();
      this.notificationService.success('Suscripción actualizada', `${empresa.tenant.nombre}: ${empresa.suscripcion?.etiqueta ?? ''}`);
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo actualizar', this.detalle(err, 'Intentá de nuevo.'));
      return false;
    }
  }

  pagos(idTenant: number): Promise<PagoSuscripcion[]> {
    return firstValueFrom(this.http.get<PagoSuscripcion[]>(`${API_URL}/api/platform/tenants/${idTenant}/pagos`)).catch(() => []);
  }

  async revisarVencimientos(): Promise<{ porVencer: number; enGracia: number; suspendidas: number } | null> {
    try {
      return await firstValueFrom(this.http.post<{ porVencer: number; enGracia: number; suspendidas: number }>(`${API_URL}/api/platform/suscripciones/revisar`, {}));
    } catch (err) {
      this.notificationService.error('Error', this.detalle(err, 'No se pudo revisar los vencimientos.'));
      return null;
    }
  }

  // --- [CU23] Planes -----------------------------------------------------

  planes(): Promise<PlanAdmin[]> {
    return firstValueFrom(this.http.get<PlanAdmin[]>(`${API_URL}/api/platform/planes`)).catch((err) => {
      this.notificationService.error('Error', this.detalle(err, 'No se pudieron cargar los planes.'));
      return [];
    });
  }

  async guardarPlan(plan: PlanIn, idPlan: number | null): Promise<{ plan: PlanAdmin | null; campo: string | null; error: string | null }> {
    try {
      const guardado = await firstValueFrom(
        idPlan === null
          ? this.http.post<PlanAdmin>(`${API_URL}/api/platform/planes`, plan)
          : this.http.put<PlanAdmin>(`${API_URL}/api/platform/planes/${idPlan}`, plan)
      );
      this.notificationService.success('Plan guardado', guardado.nombre);
      return { plan: guardado, campo: null, error: null };
    } catch (err) {
      return { plan: null, campo: this.campoConError(err), error: this.detalle(err, 'Revisá los valores.') };
    }
  }

  async eliminarPlan(idPlan: number): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete(`${API_URL}/api/platform/planes/${idPlan}`));
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo eliminar', this.detalle(err, 'Intentá de nuevo.'));
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

  async renombrar(idTenant: number, nombre: string): Promise<boolean> {
    try {
      const empresa = await firstValueFrom(
        this.http.patch<EmpresaOut>(`${API_URL}/api/platform/tenants/${idTenant}`, { nombre })
      );
      this.reemplazar(empresa);
      this.notificationService.success('Empresa renombrada', `Ahora se llama "${empresa.tenant.nombre}".`);
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo renombrar', this.detalle(err, 'Revisá el nombre e intentá de nuevo.'));
      return false;
    }
  }

  // --- Bitácora de todas las empresas -------------------------------------

  async cargarBitacora(filtros: FiltrosBitacora): Promise<Paginado<BitacoraEntrada> | null> {
    let params = new HttpParams().set('page', filtros.page).set('size', filtros.size);
    if (filtros.idTenant) params = params.set('idTenant', filtros.idTenant);
    if (filtros.q?.trim()) params = params.set('q', filtros.q.trim());
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    try {
      return await firstValueFrom(
        this.http.get<Paginado<BitacoraEntrada>>(`${API_URL}/api/platform/bitacora`, { params })
      );
    } catch (err) {
      this.notificationService.error('Error', this.detalle(err, 'No se pudo cargar la bitácora.'));
      return null;
    }
  }

  // --- Respaldos ------------------------------------------------------------

  async configRespaldos(): Promise<RespaldoConfig | null> {
    try {
      return await firstValueFrom(this.http.get<RespaldoConfig>(`${API_URL}/api/platform/backups/config`));
    } catch {
      return null;
    }
  }

  async listarRespaldos(page: number, size: number, idTenant?: number | null): Promise<Paginado<Respaldo> | null> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (idTenant) params = params.set('idTenant', idTenant);
    try {
      return await firstValueFrom(this.http.get<Paginado<Respaldo>>(`${API_URL}/api/platform/backups`, { params }));
    } catch (err) {
      this.notificationService.error('Error', this.detalle(err, 'No se pudieron cargar los respaldos.'));
      return null;
    }
  }

  async respaldarAhora(idTenant: number): Promise<Respaldo | null> {
    try {
      const respaldo = await firstValueFrom(
        this.http.post<Respaldo>(`${API_URL}/api/platform/backups`, { idTenant })
      );
      this.notificationService.success(
        'Respaldo generado',
        `${respaldo.empresa}: ${respaldo.filas} registros (${(respaldo.tamanoBytes / 1024).toFixed(1)} KB).`
      );
      return respaldo;
    } catch (err) {
      this.notificationService.error('El respaldo falló', this.detalle(err, 'Intentá de nuevo.'));
      return null;
    }
  }

  async descargarRespaldo(respaldo: Respaldo): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${API_URL}/api/platform/backups/${respaldo.idRespaldo}/descargar`, {
          responseType: 'blob',
          observe: 'response',
        })
      );
      const disposicion = resp.headers.get('Content-Disposition') ?? '';
      const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? `respaldo-${respaldo.idRespaldo}.json.gz`;
      const url = URL.createObjectURL(resp.body as Blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.notificationService.error('No se pudo descargar', this.detalle(err, 'El archivo no está disponible.'));
    }
  }

  async borrarRespaldo(idRespaldo: number): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete(`${API_URL}/api/platform/backups/${idRespaldo}`));
      this.notificationService.success('Respaldo eliminado', 'Se borró el archivo y su registro.');
      return true;
    } catch (err) {
      this.notificationService.error('No se pudo eliminar', this.detalle(err, 'Intentá de nuevo.'));
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
