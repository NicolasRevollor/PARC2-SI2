import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AnalisisSucursales,
  ConsolidadoSucursales,
  InventarioReporteOut,
  InventoryReportFiltros,
  SalesReportFiltros,
  VentaReporteOut,
} from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * No hay precedente de descarga de blobs en este frontend (solo
 * `window.print()` para el comprobante de venta, que es un caso no
 * relacionado). Helper mínimo y reutilizable para los 4 endpoints CSV/PDF
 * de CU25: crea un object URL temporal, dispara la descarga vía un <a>
 * efímero y libera el URL.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Servicio de reportes de ventas e inventario (CU25). Consume
 * `GET /api/reports/*` (JSON para vista en pantalla, CSV/PDF para
 * descarga), todos protegidos por el permiso `reporte.ver`.
 */
@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private buildSalesParams(filtros: SalesReportFiltros): HttpParams {
    let params = new HttpParams();
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    if (filtros.codigoSucursal !== undefined) params = params.set('codigoSucursal', filtros.codigoSucursal.toString());
    if (filtros.idProducto !== undefined) params = params.set('idProducto', filtros.idProducto.toString());
    return params;
  }

  private buildInventoryParams(filtros: InventoryReportFiltros): HttpParams {
    let params = new HttpParams();
    if (filtros.codigoSucursal !== undefined) params = params.set('codigoSucursal', filtros.codigoSucursal.toString());
    if (filtros.idProducto !== undefined) params = params.set('idProducto', filtros.idProducto.toString());
    return params;
  }

  getSalesReport(filtros: SalesReportFiltros): Promise<VentaReporteOut | null> {
    const params = this.buildSalesParams(filtros);
    return firstValueFrom(
      this.http.get<VentaReporteOut>(`${API_URL}/api/reports/sales`, { params })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el reporte de ventas.');
      return null;
    });
  }

  getInventoryReport(filtros: InventoryReportFiltros): Promise<InventarioReporteOut | null> {
    const params = this.buildInventoryParams(filtros);
    return firstValueFrom(
      this.http.get<InventarioReporteOut>(`${API_URL}/api/reports/inventory`, { params })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el reporte de inventario.');
      return null;
    });
  }

  private downloadBlob(url: string, params: HttpParams, filename: string): Promise<void> {
    return firstValueFrom(
      this.http.get(url, { params, responseType: 'blob' })
    ).then((blob) => {
      triggerBlobDownload(blob, filename);
    }).catch(() => {
      this.notificationService.error('Error', `No se pudo descargar "${filename}".`);
    });
  }

  downloadSalesCsv(filtros: SalesReportFiltros): Promise<void> {
    return this.downloadBlob(`${API_URL}/api/reports/sales/csv`, this.buildSalesParams(filtros), 'reporte_ventas.csv');
  }

  downloadSalesPdf(filtros: SalesReportFiltros): Promise<void> {
    return this.downloadBlob(`${API_URL}/api/reports/sales/pdf`, this.buildSalesParams(filtros), 'reporte_ventas.pdf');
  }

  downloadInventoryCsv(filtros: InventoryReportFiltros): Promise<void> {
    return this.downloadBlob(`${API_URL}/api/reports/inventory/csv`, this.buildInventoryParams(filtros), 'reporte_inventario.csv');
  }

  downloadInventoryPdf(filtros: InventoryReportFiltros): Promise<void> {
    return this.downloadBlob(`${API_URL}/api/reports/inventory/pdf`, this.buildInventoryParams(filtros), 'reporte_inventario.pdf');
  }

  // --- CU29: consolidado multi-sucursal y lectura con IA -----------------

  private buildPeriodoParams(fechaDesde?: string, fechaHasta?: string): HttpParams {
    let params = new HttpParams();
    if (fechaDesde) params = params.set('fecha_desde', fechaDesde);
    if (fechaHasta) params = params.set('fecha_hasta', fechaHasta);
    return params;
  }

  /** Consolidado por sucursal. Disponible en cualquier plan. */
  getBranchesReport(fechaDesde?: string, fechaHasta?: string): Promise<ConsolidadoSucursales | null> {
    return firstValueFrom(
      this.http.get<ConsolidadoSucursales>(`${API_URL}/api/reports/branches`, {
        params: this.buildPeriodoParams(fechaDesde, fechaHasta),
      })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el consolidado por sucursal.');
      return null;
    });
  }

  /**
   * Análisis con IA sobre el consolidado. Requiere un plan con `permiteIA`:
   * el backend responde 402 si la suscripción no lo incluye y 503 si el
   * servidor no tiene configurada la clave de Gemini — se distinguen para
   * que el usuario sepa si debe mejorar el plan o avisar al administrador.
   */
  getAiInsights(fechaDesde?: string, fechaHasta?: string): Promise<AnalisisSucursales | null> {
    return firstValueFrom(
      this.http.get<AnalisisSucursales>(`${API_URL}/api/reports/ai-insights`, {
        params: this.buildPeriodoParams(fechaDesde, fechaHasta),
      })
    ).catch((err: { status?: number; error?: { detail?: string } }) => {
      const detalle = err?.error?.detail;
      if (err?.status === 402) {
        this.notificationService.warning('Función no incluida en tu plan', detalle || 'Mejorá tu suscripción para usar el análisis con IA.');
      } else if (err?.status === 503) {
        this.notificationService.warning('Análisis no disponible', detalle || 'El servidor no tiene habilitado el motor de IA.');
      } else {
        this.notificationService.error('Error', detalle || 'No se pudo generar el análisis con IA.');
      }
      return null;
    });
  }
}
