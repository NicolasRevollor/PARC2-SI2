import { computed, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Item de un intento de pago: el backend recalcula el monto a partir de
 * `Producto.venta`, nunca confía en un `amount` enviado por el cliente.
 */
export interface DetallePagoItem {
  idProducto: number;
  cantidad: number;
}

export interface PagoIntentIn {
  items: DetallePagoItem[];
  claveIntento: string;
  concepto?: string;
  // CU12: 'venta' (default) preserva POS/CU17 sin cambios. 'reserva_deposito'
  // activa la rama de anticipo del 10% en el backend; requiere codigoSucursal.
  proposito?: 'venta' | 'reserva_deposito';
  codigoSucursal?: number;
  /** [CU33] el cobro ya descuenta el cupon. `idCliente` solo lo manda el POS. */
  idCupon?: number | null;
  idCliente?: number | null;
  /** [CU35] el cobro incluye el envio a domicilio. */
  conEnvio?: boolean;
}

export interface PagoIntentOut {
  paymentIntentId: string;
  clientSecret: string;
  monto: number;
}

export interface PagoIntentVerificadoOut {
  paymentIntentId: string;
  estado: string;
  pagado: boolean;
  idMetPago?: number;
  monto?: number;
}

/**
 * Puente genérico hacia Stripe.js y el router `payments.py`. No conoce
 * `Venta` ni `Reserva`: solo crea/verifica Payment Intents. Ver
 * `card-payment.component.ts` para el widget presentacional que lo consume.
 */
@Injectable({
  providedIn: 'root'
})
export class PaymentsService {
  private clavePublica = signal('');
  readonly disponible = computed(() => !!this.clavePublica());
  private configuracionPromise: Promise<void> | null = null;
  // Promesa cacheada: el script de Stripe.js se carga una sola vez por
  // sesión de página, nunca en cada llamada del componente.
  private stripePromise: Promise<Stripe | null> | null = null;

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  cargarConfiguracion(): Promise<void> {
    if (!this.configuracionPromise) {
      this.configuracionPromise = firstValueFrom(
        this.http.get<{ disponible: boolean; publishableKey: string | null }>(`${API_URL}/api/payments/config`)
      ).then(config => {
        const clave = config.publishableKey || environment.stripePublishableKey;
        this.clavePublica.set(config.disponible && /^pk_(test|live)_/.test(clave) ? clave : '');
      }).catch(() => {
        this.clavePublica.set('');
        // Una caida temporal no deshabilita los pagos hasta recargar la pagina.
        this.configuracionPromise = null;
      });
    }
    return this.configuracionPromise;
  }

  async cargarStripe(): Promise<Stripe | null> {
    await this.cargarConfiguracion();
    if (!this.disponible()) return null;
    if (!this.stripePromise) {
      this.stripePromise = loadStripe(this.clavePublica()).catch(error => {
        this.stripePromise = null;
        throw error;
      });
    }
    return this.stripePromise;
  }

  crearIntent(payload: PagoIntentIn): Promise<PagoIntentOut | null> {
    return firstValueFrom(
      this.http.post<PagoIntentOut>(`${API_URL}/api/payments/intents`, payload)
    ).catch((err) => {
      const msg = err.error?.detail || 'No se pudo iniciar el cobro con tarjeta.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  verificarIntent(paymentIntentId: string): Promise<PagoIntentVerificadoOut | null> {
    return firstValueFrom(
      this.http.post<PagoIntentVerificadoOut>(
        `${API_URL}/api/payments/intents/${paymentIntentId}/verify`,
        {}
      )
    ).catch((err) => {
      const msg = err.error?.detail || 'No se pudo verificar el cobro con tarjeta.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }
}
