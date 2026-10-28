import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AlcanceDevoluciones,
  AnalisisDevoluciones,
  CompletarCambioIn,
  DevolucionDetalle,
  DevolucionOut,
  InspeccionIn,
  InventarioDevolucion,
  NoVendible,
  PoliticaDevolucion,
  QrDevolucion,
  RegistroTiendaIn,
  ResolucionIn,
  SolicitudDevolucionIn,
  StockSucursal,
  VentaDevolucion,
} from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

export interface FiltrosDevolucion {
  idCliente?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  codigoSucursal?: number;
  tipo?: string;
  estado?: string;
  origen?: string;
  motivo?: string;
  idProducto?: number;
  talla?: string;
  /** Nombre del cliente (búsqueda parcial). */
  cliente?: string;
}

export const ETIQUETA_TIPO: Record<string, string> = {
  cambio_talla: 'Cambio de talla',
  cambio_color: 'Cambio de color',
  cambio_medida: 'Ajuste de medida',
  cambio_producto: 'Cambio por otro producto',
  devolucion: 'Reembolso',
  nota_credito: 'Nota de crédito',
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  PendienteEntrega: 'Pendiente de entrega',
  EnInspeccion: 'En inspección',
  EnRevision: 'En revisión',
  Aprobada: 'Aprobada',
  CambioPendiente: 'Cambio pendiente',
  Completada: 'Completada',
  Rechazada: 'Rechazada',
  Anulada: 'Anulada',
  Cancelada: 'Cancelada',
};

export const ETIQUETA_MOTIVO: Record<string, string> = {
  talla: 'No le quedó la talla',
  medida: 'Ajuste de medida',
  color: 'Cambio de color',
  defecto: 'Defecto de fábrica',
  equivocado: 'Producto equivocado',
  no_desea: 'Ya no lo desea',
};

export const ETIQUETA_RESULTADO: Record<string, string> = {
  apta: 'Apta para reventa',
  defectuosa: 'Defecto de fábrica',
  deteriorada: 'Deteriorada por uso',
  no_corresponde: 'No corresponde',
};

export const ETIQUETA_REEMBOLSO: Record<string, string> = {
  Completado: 'Reembolsado',
  EnProceso: 'Reembolso en proceso',
  Pendiente: 'Reembolso pendiente',
  TransferenciaPendiente: 'Transferencia pendiente',
};

/** Clases del chip de estado, compartidas por todas las pantallas. */
export function claseEstado(estado: string): string {
  switch (estado) {
    case 'Completada':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Rechazada':
    case 'Anulada':
    case 'Cancelada':
      return 'bg-rose-50 text-rose-600 border-rose-200';
    case 'Aprobada':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
}

/** "24 h" o "7 días", como lo muestra el backend. */
export function textoPlazo(horas: number): string {
  return horas % 24 === 0 && horas >= 48 ? `${horas / 24} días` : `${horas} h`;
}

/** Estados en los que el caso sigue abierto (bandeja de trabajo). */
export const ESTADOS_ABIERTOS = 'PendienteEntrega,EnInspeccion,EnRevision,Aprobada,CambioPendiente';

/**
 * Devoluciones y cambios (CU1–CU11 del documento del segundo parcial).
 *
 * Las reglas (plazo, garantía, recargo, unidades, stock, autorizaciones) las
 * valida el backend; la web consulta la elegibilidad antes de ofrecer una
 * operación y muestra el mensaje del servidor cuando la rechaza.
 */
@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly devolucionesSignal = signal<DevolucionOut[]>([]);
  private readonly cargandoSignal = signal<boolean>(false);

  readonly devoluciones = this.devolucionesSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /** Mensaje del backend (texto, o el detalle por campo de un 422 de la política). */
  detalle(err: unknown, porDefecto: string): string {
    const detalle = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detalle === 'string') return detalle;
    const conCampos = detalle as { mensaje?: string; campos?: Record<string, string> } | undefined;
    if (conCampos?.campos) return Object.values(conCampos.campos).join(' · ');
    return porDefecto;
  }

  private params(filtros: object): HttpParams {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return params;
  }

  private async pedir<T>(peticion: Promise<T>, error: string, avisar = true): Promise<T | null> {
    try {
      return await peticion;
    } catch (err) {
      if (avisar) this.notificationService.error('No se pudo completar', this.detalle(err, error));
      return null;
    }
  }

  // --- CU11: historial ----------------------------------------------------

  async cargarDevoluciones(filtros: FiltrosDevolucion = {}): Promise<DevolucionOut[]> {
    this.cargandoSignal.set(true);
    const data = await this.pedir(
      firstValueFrom(this.http.get<DevolucionOut[]>(`${API_URL}/api/returns`, { params: this.params(filtros) })),
      'No se pudo cargar el historial de devoluciones.',
    );
    this.cargandoSignal.set(false);
    this.devolucionesSignal.set(data ?? []);
    return data ?? [];
  }

  /** Consulta sin tocar el historial compartido (bandeja, cliente). */
  async consultar(filtros: FiltrosDevolucion): Promise<DevolucionOut[]> {
    return (
      (await this.pedir(
        firstValueFrom(this.http.get<DevolucionOut[]>(`${API_URL}/api/returns`, { params: this.params(filtros) })),
        'No se pudieron cargar los casos de devolución.',
      )) ?? []
    );
  }

  detalleCaso(idDevolucion: number): Promise<DevolucionDetalle | null> {
    return this.pedir(
      firstValueFrom(this.http.get<DevolucionDetalle>(`${API_URL}/api/returns/${idDevolucion}`)),
      'No se pudo abrir el caso.',
    );
  }

  porCodigo(codigo: string): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.get<DevolucionOut>(`${API_URL}/api/returns/codigo/${encodeURIComponent(codigo.trim().toUpperCase())}`)),
      'No existe una solicitud con ese código.',
    );
  }

  /** CU11 alternativo 2: sucursales visibles para el usuario. */
  alcance(): Promise<AlcanceDevoluciones | null> {
    return this.pedir(
      firstValueFrom(this.http.get<AlcanceDevoluciones>(`${API_URL}/api/returns/alcance`)),
      'No se pudieron cargar las sucursales.',
      false,
    );
  }

  analisis(filtros: FiltrosDevolucion): Promise<AnalisisDevoluciones | null> {
    return this.pedir(
      firstValueFrom(this.http.get<AnalisisDevoluciones>(`${API_URL}/api/returns/analisis`, { params: this.params(filtros) })),
      'No se pudieron calcular los indicadores.',
    );
  }

  /** CU11 paso 6: descarga el historial filtrado en Excel (.xlsx), CSV o PDF. */
  async exportar(formato: 'xlsx' | 'csv' | 'pdf', filtros: FiltrosDevolucion): Promise<void> {
    const blob = await this.pedir(
      firstValueFrom(this.http.get(`${API_URL}/api/returns/export.${formato}`, { params: this.params(filtros), responseType: 'blob' })),
      'No se pudo exportar.',
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devoluciones.${formato}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Comprobante del caso con QR (PDF) en una pestaña nueva. */
  async abrirComprobante(idDevolucion: number): Promise<void> {
    const blob = await this.pedir(
      firstValueFrom(this.http.get(`${API_URL}/api/returns/${idDevolucion}/comprobante.pdf`, { responseType: 'blob' })),
      'No se pudo generar el comprobante.',
    );
    if (blob) window.open(URL.createObjectURL(blob), '_blank');
  }

  qr(idDevolucion: number): Promise<QrDevolucion | null> {
    return this.pedir(firstValueFrom(this.http.get<QrDevolucion>(`${API_URL}/api/returns/${idDevolucion}/qr`)), '', false);
  }

  // --- CU1 / CU2 ----------------------------------------------------------

  buscarVentas(q: string): Promise<VentaDevolucion[] | null> {
    return this.pedir(
      firstValueFrom(this.http.get<VentaDevolucion[]>(`${API_URL}/api/returns/ventas`, { params: { q } })),
      'No se encontró la venta.',
    );
  }

  async misCompras(): Promise<VentaDevolucion[]> {
    return (
      (await this.pedir(
        firstValueFrom(this.http.get<VentaDevolucion[]>(`${API_URL}/api/returns/mis-compras`)),
        'No se pudieron cargar tus compras.',
      )) ?? []
    );
  }

  async registrar(payload: RegistroTiendaIn): Promise<DevolucionOut[] | null> {
    const casos = await this.pedir(
      firstValueFrom(this.http.post<DevolucionOut[]>(`${API_URL}/api/returns`, payload)),
      'Revisá los datos de la solicitud.',
    );
    if (casos?.length) {
      this.notificationService.success('Solicitud registrada', `${casos.map((c) => c.codigo).join(', ')} pasa a inspección.`);
    }
    return casos;
  }

  async solicitar(payload: SolicitudDevolucionIn): Promise<DevolucionOut | null> {
    const caso = await this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/solicitudes`, payload)),
      'No se pudo enviar la solicitud.',
    );
    if (caso) this.notificationService.success('Solicitud enviada', `Llevá la prenda a la sucursal con el código ${caso.codigo}.`);
    return caso;
  }

  async subirFoto(archivo: File): Promise<string | null> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    const r = await this.pedir(
      firstValueFrom(this.http.post<{ url: string }>(`${API_URL}/api/returns/fotos`, datos)),
      'No se pudo subir la foto (es opcional).',
    );
    return r?.url ?? null;
  }

  // --- CU3 / autorización --------------------------------------------------

  inspeccionar(idDevolucion: number, payload: InspeccionIn): Promise<DevolucionOut[] | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut[]>(`${API_URL}/api/returns/${idDevolucion}/inspeccion`, payload)),
      'No se pudo registrar la inspección.',
    );
  }

  revisar(idDevolucion: number, aprobada: boolean, motivo: string): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/revision`, { aprobada, motivo })),
      'No se pudo resolver la revisión.',
    );
  }

  autorizar(idDevolucion: number, motivo?: string): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/autorizar`, { motivo: motivo || null })),
      'No se pudo autorizar.',
    );
  }

  // --- CU4–CU8 -------------------------------------------------------------

  /** Devuelve el caso, o el mensaje de error del servidor (para mostrarlo en el formulario). */
  async resolver(idDevolucion: number, payload: ResolucionIn): Promise<DevolucionOut | string> {
    try {
      return await firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/resolver`, payload));
    } catch (err) {
      return this.detalle(err, 'No se pudo resolver el caso.');
    }
  }

  completarCambio(idDevolucion: number, payload: CompletarCambioIn): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/completar-cambio`, payload)),
      'No se pudo completar el cambio.',
    );
  }

  async cancelar(idDevolucion: number): Promise<DevolucionOut | null> {
    const caso = await this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/cancelar`, {})),
      'No se pudo cancelar.',
    );
    if (caso) this.notificationService.info('Solicitud cancelada', 'Las unidades vuelven a estar disponibles.');
    return caso;
  }

  async stockReemplazo(idProducto: number): Promise<StockSucursal[]> {
    return (await this.pedir(firstValueFrom(this.http.get<StockSucursal[]>(`${API_URL}/api/returns/stock/${idProducto}`)), '', false)) ?? [];
  }

  // --- CU6 ------------------------------------------------------------------

  async reembolsosPendientes(): Promise<DevolucionOut[]> {
    return (
      (await this.pedir(
        firstValueFrom(this.http.get<DevolucionOut[]>(`${API_URL}/api/returns/reembolsos-pendientes`)),
        'No se pudieron cargar los reembolsos pendientes.',
      )) ?? []
    );
  }

  reintentarReembolso(idDevolucion: number): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/reembolso/reintentar`, {})),
      'No se pudo reintentar el reembolso.',
    );
  }

  confirmarTransferencia(idDevolucion: number, comprobante: string): Promise<DevolucionOut | null> {
    return this.pedir(
      firstValueFrom(this.http.post<DevolucionOut>(`${API_URL}/api/returns/${idDevolucion}/reembolso/confirmar`, { comprobante })),
      'No se pudo confirmar la transferencia.',
    );
  }

  // --- CU9 / CU10 -------------------------------------------------------------

  politica(idTenant?: number): Promise<PoliticaDevolucion | null> {
    return this.pedir(
      firstValueFrom(this.http.get<PoliticaDevolucion>(`${API_URL}/api/returns/politica`, { params: this.params({ idTenant }) })),
      '',
      false,
    );
  }

  async versionesPolitica(): Promise<PoliticaDevolucion[]> {
    return (await this.pedir(firstValueFrom(this.http.get<PoliticaDevolucion[]>(`${API_URL}/api/returns/politica/versiones`)), '', false)) ?? [];
  }

  /** Devuelve la nueva versión, o el detalle de errores por campo. */
  async guardarPolitica(politica: PoliticaDevolucion): Promise<PoliticaDevolucion | Record<string, string>> {
    const { idTenant: _a, version: _b, idPolitica: _c, vigenteDesde: _d, creadoEn: _e, creadoPor: _f, ...cuerpo } = politica;
    try {
      const guardada = await firstValueFrom(this.http.put<PoliticaDevolucion>(`${API_URL}/api/returns/politica`, cuerpo));
      this.notificationService.success(
        `Política v${guardada.version} vigente`,
        'Rige para las ventas desde ahora; las anteriores conservan la versión con la que se vendieron.',
      );
      return guardada;
    } catch (err) {
      const campos = (err as { error?: { detail?: { campos?: Record<string, string> } } })?.error?.detail?.campos;
      this.notificationService.error('No se guardó la política', this.detalle(err, 'Revisá los valores.'));
      return campos ?? {};
    }
  }

  inventario(fechaDesde?: string, fechaHasta?: string): Promise<InventarioDevolucion | null> {
    return this.pedir(
      firstValueFrom(
        this.http.get<InventarioDevolucion>(`${API_URL}/api/returns/inventario`, {
          params: this.params({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta }),
        })
      ),
      'No se pudo cargar el inventario por devolución.',
    );
  }

  actualizarNoVendible(idNoVendible: number, estado: NoVendible['estado'], observaciones?: string): Promise<NoVendible | null> {
    return this.pedir(
      firstValueFrom(this.http.patch<NoVendible>(`${API_URL}/api/returns/no-vendible/${idNoVendible}`, { estado, observaciones })),
      'No se pudo actualizar el registro.',
    );
  }
}
