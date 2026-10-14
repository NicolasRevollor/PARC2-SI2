import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InventoryLocation, InventoryStockEntry, StockAdjustIn, StockIngresoIn, DispatchIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private locationsSignal = signal<InventoryLocation[]>([]);
  private stockSignal = signal<InventoryStockEntry[]>([]);
  private selectedLocationIdSignal = signal<string>('ALL');

  public locations = this.locationsSignal.asReadonly();
  public stock = this.stockSignal.asReadonly();
  public selectedLocationId = this.selectedLocationIdSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  setSelectedLocation(locationId: string) {
    this.selectedLocationIdSignal.set(locationId);
  }

  loadLocations(): Promise<void> {
    return firstValueFrom(
      this.http.get<InventoryLocation[]>(`${API_URL}/api/inventory/locations`)
    ).then((locs) => {
      this.locationsSignal.set(locs);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar las ubicaciones.');
    });
  }

  loadStock(locationId?: string): Promise<void> {
    let params = new HttpParams();
    if (locationId && locationId !== 'ALL') {
      params = params.set('codigoSucursal', locationId);
    }
    return firstValueFrom(
      this.http.get<InventoryStockEntry[]>(`${API_URL}/api/inventory/stock`, { params })
    ).then((stk) => {
      this.stockSignal.set(stk);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el stock.');
    });
  }

  adjustStock(stockId: number, newCantidad: number, motivo?: string): Promise<boolean> {
    const payload: StockAdjustIn = {
      cantidad: newCantidad,
      signo: 'set',
      motivo: motivo || 'Ajuste manual del operador',
    };
    return firstValueFrom(
      this.http.patch(`${API_URL}/api/inventory/stock/${stockId}/adjust`, payload)
    ).then(() => {
      this.loadStock(this.selectedLocationIdSignal());
      this.notificationService.success('Stock ajustado', `Stock actualizado a ${newCantidad} unidades.`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo ajustar el stock.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }

  receiveStock(
    idProducto: number,
    codigoSucursal: number,
    cantidad: number,
    idProveedor: number | null,
    motivo?: string
  ): Promise<boolean> {
    const payload: StockIngresoIn = {
      idProducto,
      codigoSucursal,
      cantidad,
      idProveedor: idProveedor ?? undefined,
      motivo: motivo || 'Ingreso de lote',
    };
    return firstValueFrom(
      this.http.post(`${API_URL}/api/inventory/stock/ingreso`, payload)
    ).then(() => {
      this.loadStock(this.selectedLocationIdSignal());
      this.notificationService.success('Ingreso registrado', `Stock inicial asignado (${cantidad} unidades).`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo registrar el ingreso de lote.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }

  transferStock(
    idProducto: number,
    origenCodigo: number,
    destinoCodigo: number,
    cantidad: number,
    motivo?: string
  ): Promise<boolean> {
    const payload: DispatchIn = {
      origen: origenCodigo,
      destino: destinoCodigo,
      items: [{ idProducto, cantidad }],
      motivo: motivo || 'Transferencia entre sucursales',
    };
    return firstValueFrom(
      this.http.post(`${API_URL}/api/dispatches`, payload)
    ).then(() => {
      this.loadStock(this.selectedLocationIdSignal());
      this.notificationService.success('Transferencia programada', `Despacho de transferencia registrado.`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo completar la transferencia.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }
}
