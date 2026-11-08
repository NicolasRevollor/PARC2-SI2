import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU26] [CU27] [CU28] -> backend/app/routers/reportes_generativos.py
// [CU29] [CU30]        -> backend/app/routers/inteligencia.py
// En palabras simples: la pantalla solo manda el texto (o el audio) y recibe el
//   reporte ya armado. Quien decide que se consulta es el backend, nunca la IA
//   ni el navegador.
// ==================================================================

export interface ColumnaReporte {
  clave: string;
  etiqueta: string;
  tipo: 'texto' | 'moneda' | 'entero' | 'decimal' | 'porcentaje' | string;
}

export interface AjustesReporte {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  usaFechas: boolean;
  sucursales: string[];
  sucursalesDisponibles: string[];
}

export type RespuestaReporteIA =
  | { estado: 'aclaracion'; pregunta: string; opciones: string[]; motor: string }
  | { estado: 'rechazado'; motivo: string; ejemplos: string[]; motor: string }
  | {
      estado: 'sin_datos'; idSolicitud: number; titulo: string; mensaje: string; filtros: [string, string][];
      avisos: string[]; motor: string; ajustes: AjustesReporte;
    }
  | {
      estado: 'generado'; idSolicitud: number; titulo: string; columnas: ColumnaReporte[]; filas: Record<string, string | number>[];
      totales: Record<string, number>; visualizacion: 'tabla' | 'barras' | 'lineas' | 'torta'; filtros: [string, string][];
      avisos: string[]; resumen: string; motor: string; motorResumen: string; ajustes: AjustesReporte; favorita: boolean;
    };

export interface SolicitudHistorial {
  idSolicitud: number;
  texto: string;
  titulo: string | null;
  estado: string;
  origen: 'texto' | 'voz';
  motor: string;
  filas: number;
  favorita: boolean;
  fecha: string;
}

export interface Exportacion {
  idExportacion: number;
  titulo: string;
  formato: 'pdf' | 'xlsx';
  estado: 'EnProceso' | 'Lista' | 'Fallida';
  filas: number;
  fecha: string;
  error: string | null;
}

/** [CU28] que se exporta: un reporte generativo o uno convencional (CU24 del primer parcial). */
export interface ExportarIn {
  origen: 'solicitud' | 'ventas' | 'inventario';
  formato: 'pdf' | 'xlsx';
  idSolicitud?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  codigoSucursal?: number;
  idProducto?: number;
}

export type TipoModelo = 'demanda' | 'devolucion' | 'segmentacion' | 'anomalias';

export interface DatosModelo {
  tipo: TipoModelo;
  etiqueta: string;
  filasReales: number;
  minimo: number;
  suficiente: boolean;
  variables: string[];
  umbrales: Record<string, number>;
}

export interface ModeloIA {
  idModeloIA: number;
  tipo: TipoModelo;
  etiqueta: string;
  version: number;
  estado: 'Entrenado' | 'Publicado' | 'Retirado' | 'Fallido';
  algoritmo: string | null;
  metricas: Record<string, number> | null;
  umbrales: Record<string, number>;
  cumpleUmbral: boolean;
  filasReales: number;
  filasSinteticas: number;
  conSinteticos: boolean;
  parametros: { usarSinteticos: boolean; registros: number; semanas: number; estacionalidad: number; variables: string[] } | null;
  error: string | null;
  fechaEntrenamiento: string;
  fechaPublicacion: string | null;
  comparacion: Record<string, number>;
  versionComparada: number | null;
}

export interface EntrenarIn {
  tipo: TipoModelo;
  usarSinteticos: boolean;
  registros: number;
  semanas: number;
  estacionalidad: number;
  variables: string[];
}

export interface PrediccionDemanda {
  idProducto: number;
  producto: string;
  talla: string;
  color: string;
  categoria: string;
  codigoSucursal: number;
  sucursal: string;
  semanas: number[];
  total: number;
  disponible: number;
  reponer: number;
}

export interface Segmento { segmento: string; clientes: number; recencia: number; frecuencia: number; monto: number; ticket?: number }
export interface Anomalia { tipo: string; fecha: string | null; codigoSucursal: number; sucursal: string; detalle: string; desvio: number; puntaje: number | null }
export interface DevolucionTalla { categoria: string; talla: string; probabilidad: number; ventas: number }

export interface DashboardAnalitico {
  filtros: { fecha_desde: string; fecha_hasta: string; codigoSucursal: number | null; categoria: string | null };
  sucursales: { codigoSucursal: number; nombre: string }[];
  categorias: string[];
  restringido: boolean;
  indicadores: {
    ventas: number; unidades: number; cantidadVentas: number; ticketPromedio: number; rotacionStock: number | null;
    stockDisponible: number; tasaDevoluciones: number; unidadesDevueltas: number; serieSemanal: { semana: string; monto: number }[];
  };
  iaDisponible: boolean;
  motivoIA?: string;
  sinModelos?: boolean;
  semanasPrediccion?: string[];
  demanda?: PrediccionDemanda[];
  devolucionPorTalla?: DevolucionTalla[];
  segmentos?: Segmento[];
  anomalias?: Anomalia[];
  modelos?: { tipo: TipoModelo; etiqueta: string; version: number; algoritmo: string; metricas: Record<string, number>; conSinteticos: boolean; fechaEntrenamiento: string }[];
  interpretacion?: string;
  motorInterpretacion?: string;
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function nombreDeCabecera(cabecera: string | null, porDefecto: string): string {
  const m = /filename="?([^"]+)"?/.exec(cabecera ?? '');
  return m ? m[1] : porDefecto;
}

@Injectable({ providedIn: 'root' })
export class IaService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /** Mensaje del backend; con responseType blob el error tambien llega como Blob. */
  async detalle(err: unknown, porDefecto: string): Promise<string> {
    const e = err as HttpErrorResponse;
    let cuerpo = e?.error;
    if (cuerpo instanceof Blob) {
      try {
        cuerpo = JSON.parse(await cuerpo.text());
      } catch {
        cuerpo = null;
      }
    }
    const d = cuerpo?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
    return porDefecto;
  }

  /** [CU25] 402 = el plan no incluye la funcion; 403 = suscripcion en gracia o suspendida. */
  async avisarError(err: unknown, porDefecto: string): Promise<void> {
    const status = (err as HttpErrorResponse)?.status;
    const texto = await this.detalle(err, porDefecto);
    if (status === 402) this.notificationService.warning('Funcionalidad no incluida en su plan', texto);
    else this.notificationService.error('No se pudo completar', texto);
  }

  // --- [CU26] [CU27] -------------------------------------------------------

  consultar(texto: string, origen: 'texto' | 'voz' = 'texto'): Promise<RespuestaReporteIA> {
    return firstValueFrom(this.http.post<RespuestaReporteIA>(`${API_URL}/api/reports/ia/consultar`, { texto, origen }));
  }

  /** [CU26] paso 7: cambia fechas o sucursales del mismo reporte sin volver a la IA. */
  ajustar(idSolicitud: number, ajustes: { fecha_desde: string | null; fecha_hasta: string | null; sucursales: string[] | null }): Promise<RespuestaReporteIA> {
    return firstValueFrom(
      this.http.post<RespuestaReporteIA>(`${API_URL}/api/reports/ia/consultar`, { texto: '', ajustes: { idSolicitud, ...ajustes } }),
    );
  }

  historial(favoritas = false): Promise<SolicitudHistorial[]> {
    const params = new HttpParams().set('favoritas', String(favoritas));
    return firstValueFrom(this.http.get<SolicitudHistorial[]>(`${API_URL}/api/reports/ia/historial`, { params })).catch(() => []);
  }

  marcarFavorita(idSolicitud: number, favorita: boolean): Promise<{ idSolicitud: number; favorita: boolean }> {
    return firstValueFrom(this.http.patch<{ idSolicitud: number; favorita: boolean }>(`${API_URL}/api/reports/ia/${idSolicitud}/favorita`, { favorita }));
  }

  /** [CU27] paso 4 sin reconocimiento de voz en el navegador: transcribe el servidor. */
  transcribir(audio: Blob): Promise<{ texto: string; confianza: 'alta' | 'baja' }> {
    const datos = new FormData();
    const tipo = (audio.type || 'audio/webm').split(';')[0];
    datos.append('audio', new File([audio], `solicitud.${tipo.split('/')[1] || 'webm'}`, { type: tipo }));
    return firstValueFrom(this.http.post<{ texto: string; confianza: 'alta' | 'baja' }>(`${API_URL}/api/reports/ia/transcribir`, datos));
  }

  // --- [CU28] ---------------------------------------------------------------

  /**
   * Devuelve 'descargado' si llego el archivo, 'segundo-plano' si el reporte es
   * grande (alternativo 1: se avisa con una notificacion) o null si fallo.
   */
  async exportar(payload: ExportarIn): Promise<'descargado' | 'segundo-plano' | null> {
    try {
      const r = await firstValueFrom(
        this.http.post(`${API_URL}/api/reports/exportar`, payload, { observe: 'response', responseType: 'blob' }),
      );
      if (r.status === 202) {
        const cuerpo = JSON.parse(await (r.body as Blob).text()) as { mensaje: string };
        this.notificationService.info('Reporte en preparación', cuerpo.mensaje);
        return 'segundo-plano';
      }
      descargar(r.body as Blob, nombreDeCabecera(r.headers.get('content-disposition'), `reporte.${payload.formato}`));
      this.notificationService.success('Reporte exportado', `Se descargó el ${payload.formato === 'pdf' ? 'PDF' : 'Excel'}.`);
      return 'descargado';
    } catch (err) {
      await this.avisarError(err, 'No se pudo exportar el reporte.');
      return null;
    }
  }

  exportaciones(): Promise<Exportacion[]> {
    return firstValueFrom(this.http.get<Exportacion[]>(`${API_URL}/api/reports/exportaciones`)).catch(() => []);
  }

  async descargarExportacion(e: Exportacion): Promise<void> {
    try {
      const r = await firstValueFrom(
        this.http.get(`${API_URL}/api/reports/exportaciones/${e.idExportacion}/archivo`, { observe: 'response', responseType: 'blob' }),
      );
      descargar(r.body as Blob, nombreDeCabecera(r.headers.get('content-disposition'), `reporte.${e.formato}`));
    } catch (err) {
      await this.avisarError(err, 'No se pudo descargar el archivo.');
    }
  }

  // --- [CU29] ---------------------------------------------------------------

  datosModelos(): Promise<DatosModelo[]> {
    return firstValueFrom(this.http.get<DatosModelo[]>(`${API_URL}/api/ia/modelos/datos`));
  }

  modelos(): Promise<ModeloIA[]> {
    return firstValueFrom(this.http.get<ModeloIA[]>(`${API_URL}/api/ia/modelos`));
  }

  entrenar(payload: EntrenarIn): Promise<ModeloIA> {
    return firstValueFrom(this.http.post<ModeloIA>(`${API_URL}/api/ia/modelos/entrenar`, payload));
  }

  publicar(idModeloIA: number): Promise<ModeloIA> {
    return firstValueFrom(this.http.post<ModeloIA>(`${API_URL}/api/ia/modelos/${idModeloIA}/publicar`, {}));
  }

  // --- [CU30] ---------------------------------------------------------------

  dashboard(filtros: { fecha_desde?: string; fecha_hasta?: string; codigoSucursal?: number | null; categoria?: string | null }): Promise<DashboardAnalitico> {
    let params = new HttpParams();
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    if (filtros.codigoSucursal) params = params.set('codigoSucursal', String(filtros.codigoSucursal));
    if (filtros.categoria) params = params.set('categoria', filtros.categoria);
    return firstValueFrom(this.http.get<DashboardAnalitico>(`${API_URL}/api/ia/dashboard`, { params }));
  }
}
