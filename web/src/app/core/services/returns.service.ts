import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DevolucionIn, DevolucionOut, ItemElegible } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

export interface FiltrosDevolucion {
  idCliente?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  codigoSucursal?: number;
  tipo?: string;
}

/**
 * Devoluciones y cambios de talla/medida dentro de las 24 h (CU28).
 *
 * La ventana de 24 h la valida el backend; acá solo se consulta qué items
 * siguen siendo elegibles (`/elegibles`) para no ofrecer un cambio que el
 * servidor va a rechazar.
 */
@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly devolucionesSignal = signal<DevolucionOut[]>([]);
  private readonly elegiblesSignal = signal<ItemElegible[]>([]);
  private readonly cargandoSignal = signal<boolean>(false);

  readonly devoluciones = this.devolucionesSignal.asReadonly();
  readonly elegibles = this.elegiblesSignal.asReadonly();
  readonly cargando = this.cargandoSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private buildParams(filtros: FiltrosDevolucion): HttpParams {
    let params = new HttpParams();
    if (filtros.idCliente !== undefined) params = params.set('idCliente', filtros.idCliente);
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    if (filtros.codigoSucursal !== undefined) params = params.set('codigoSucursal', filtros.codigoSucursal);
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    return params;
  }

  async cargarDevoluciones(filtros: FiltrosDevolucion = {}): Promise<DevolucionOut[]> {
    this.cargandoSignal.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<DevolucionOut[]>(`${API_URL}/api/returns`, { params: this.buildParams(filtros) })
      );
      this.devolucionesSignal.set(data);
      return data;
    } catch {
      this.notificationService.error('Error', 'No se pudo cargar el historial de devoluciones.');
      return [];
    } finally {
      this.cargandoSignal.set(false);
    }
  }

  async cargarElegibles(idCliente?: number): Promise<ItemElegible[]> {
    let params = new HttpParams();
    if (idCliente !== undefined) params = params.set('idCliente', idCliente);
    try {
      const data = await firstValueFrom(
        this.http.get<ItemElegible[]>(`${API_URL}/api/returns/elegibles`, { params })
      );
      this.elegiblesSignal.set(data);
      return data;
    } catch {
      this.notificationService.error('Error', 'No se pudieron cargar las ventas dentro de las 24 h.');
      return [];
    }
  }

  async registrar(payload: DevolucionIn): Promise<DevolucionOut | null> {
    try {
      const creada = await firstValueFrom(
        this.http.post<DevolucionOut>(`${API_URL}/api/returns`, payload)
      );
      this.devolucionesSignal.update((actuales) => [creada, ...actuales]);
      this.notificationService.success(
        payload.tipo === 'devolucion' ? 'Devolución registrada' : 'Cambio registrado',
        payload.tipo === 'cambio_talla'
          ? `Talla ${creada.tallaOriginal ?? '—'} → ${creada.tallaNueva ?? '—'} para ${creada.cliente_nombre ?? 'el cliente'}.`
          : `Operación registrada sobre la venta ${creada.idVenta}.`
      );
      return creada;
    } catch (err: unknown) {
      const detalle = (err as { error?: { detail?: string } })?.error?.detail;
      this.notificationService.error('No se pudo registrar', detalle || 'Revisá los datos e intentá de nuevo.');
      return null;
    }
  }
}
