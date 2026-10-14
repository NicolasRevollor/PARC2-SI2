import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MetodoPago, Venta, VentaIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Servicio de ventas presenciales (CU19/CU20). Consume `POST /api/sales`
 * (ya existente, ahora exige `codigoSucursal`) y `POST /api/payment-methods`
 * para la modalidad efectivo. Nunca crea ni verifica Payment Intents: esa
 * responsabilidad es exclusiva de `PaymentsService`.
 */
@Injectable({
  providedIn: 'root'
})
export class SalesService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /**
   * Crea la venta. En caso de error NO se debe descartar el `idMetPago` ya
   * cobrado: el llamante (pos.component.ts) es responsable de conservarlo
   * para reintentar sin cobrar de nuevo.
   */
  crearVenta(payload: VentaIn): Promise<Venta | null> {
    return firstValueFrom(
      this.http.post<Venta>(`${API_URL}/api/sales`, payload)
    ).catch((err) => {
      const msg = err.error?.detail || 'No se pudo registrar la venta.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  obtenerVenta(idVenta: number): Promise<Venta | null> {
    return firstValueFrom(
      this.http.get<Venta>(`${API_URL}/api/sales/${idVenta}`)
    ).catch(() => {
      this.notificationService.error('Error', 'No se pudo obtener la venta.');
      return null;
    });
  }

  /**
   * Modalidad efectivo: crea un `MetodoPago` simple ("Efectivo") con el
   * monto indicativo del ticket. Ese monto NUNCA se reconcilia después de
   * la venta — `Venta.total` (calculado en el servidor) es la cifra
   * autoritativa mostrada en el comprobante.
   */
  crearMetodoEfectivo(monto: number): Promise<MetodoPago | null> {
    return firstValueFrom(
      this.http.post<MetodoPago>(`${API_URL}/api/payment-methods`, {
        tipo: 'Efectivo',
        estado: 'Activo',
        monto,
      })
    ).catch((err) => {
      const msg = err.error?.detail || 'No se pudo registrar el pago en efectivo.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }
}
