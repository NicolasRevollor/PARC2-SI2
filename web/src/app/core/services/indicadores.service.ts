import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IndicadoresFiltros,
  KpisOut,
  StockPorSucursalOut,
  TopProductosOut,
  VentasDiariasOut,
} from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Servicio de indicadores (CU24). Consume `GET /api/dashboard/*`, todos
 * protegidos por el permiso `reporte.ver` (mismo permiso que CU25 — ambos
 * son del mismo módulo de analítica, Administrador-only).
 */
@Injectable({
  providedIn: 'root'
})
export class IndicadoresService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private buildParams(filtros: IndicadoresFiltros): HttpParams {
    let params = new HttpParams();
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    return params;
  }

  getKpis(filtros: IndicadoresFiltros): Promise<KpisOut | null> {
    const params = this.buildParams(filtros);
    return firstValueFrom(
      this.http.get<KpisOut>(`${API_URL}/api/dashboard/kpis`, { params })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar los indicadores.');
      return null;
    });
  }

  getVentasDiarias(filtros: IndicadoresFiltros): Promise<VentasDiariasOut | null> {
    const params = this.buildParams(filtros);
    return firstValueFrom(
      this.http.get<VentasDiariasOut>(`${API_URL}/api/dashboard/ventas-diarias`, { params })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la serie de ventas diarias.');
      return null;
    });
  }

  getTopProductos(filtros: IndicadoresFiltros, limit = 5): Promise<TopProductosOut | null> {
    let params = this.buildParams(filtros);
    params = params.set('limit', limit.toString());
    return firstValueFrom(
      this.http.get<TopProductosOut>(`${API_URL}/api/dashboard/top-productos`, { params })
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el top de productos.');
      return null;
    });
  }

  getStockPorSucursal(): Promise<StockPorSucursalOut | null> {
    return firstValueFrom(
      this.http.get<StockPorSucursalOut>(`${API_URL}/api/dashboard/stock-por-sucursal`)
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el stock por sucursal.');
      return null;
    });
  }
}
