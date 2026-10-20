import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  BitacoraEntrada,
  EmpresaIn,
  EmpresaOut,
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
