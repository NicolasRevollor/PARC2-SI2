import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { PaymentsService } from '../../core/services/payments.service';

/**
 * Widget presentacional y agnóstico de dominio: solo cobra una tarjeta con
 * Stripe y reporta el resultado. Nunca decide a qué se aplica el pago
 * (venta, reserva, etc.) — esa asociación es responsabilidad exclusiva del
 * llamante, que ya obtuvo el `clientSecret` desde el endpoint de
 * creación de intento antes de instanciar este componente.
 *
 * Tampoco verifica el pago contra el backend: el llamante es quien debe
 * llamar al endpoint de verificación antes de tratar el pago como
 * definitivo (ver `card-payment-widget/spec.md`).
 */
@Component({
  selector: 'app-card-payment',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-4">
      <p *ngIf="concepto()" class="text-sm font-semibold text-gray-700">
        {{ concepto() }}
      </p>

      <div #paymentElementHost class="rounded-lg border border-gray-200 p-3"></div>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          (click)="onCancelar()"
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Cancelar
        </button>
        <button
          type="button"
          (click)="onConfirmar()"
          [disabled]="procesando() || !listo()"
          class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ procesando() ? 'Procesando…' : 'Pagar' }}
        </button>
      </div>
    </div>
  `
})
export class CardPaymentComponent implements AfterViewInit, OnDestroy {
  // El llamante ya creó el Payment Intent (POST /api/payments/intents) y
  // pasa aquí su clientSecret. Este componente NUNCA crea su propio
  // intento — ver Requirement "Caller Supplies the Intent" en el spec.
  clientSecret = input<string | null>(null);
  concepto = input<string>('');

  pagado = output<string>();
  fallo = output<string>();
  cancelado = output<void>();

  @ViewChild('paymentElementHost') private paymentElementHost?: ElementRef<HTMLDivElement>;

  procesando = signal(false);
  listo = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;

  constructor(private paymentsService: PaymentsService) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.montarElementoDePago();
    } catch {
      this.fallo.emit('No se pudo cargar el formulario de tarjeta. Revisá tu conexión e intentá nuevamente.');
    }
  }

  private async montarElementoDePago(): Promise<void> {
    const clientSecret = this.clientSecret();
    if (!clientSecret || !this.paymentElementHost) {
      // Sin client secret: no se intenta montar nada y no se lanza excepción.
      return;
    }

    this.stripe = await this.paymentsService.cargarStripe();
    if (!this.stripe) {
      this.fallo.emit('El pago con tarjeta no está configurado en este momento.');
      return;
    }

    this.elements = this.stripe.elements({ clientSecret });
    this.paymentElement = this.elements.create('payment');
    this.paymentElement.on('ready', () => this.listo.set(true));
    this.paymentElement.on('loaderror', () => {
      this.listo.set(false);
      this.fallo.emit('No se pudo cargar el formulario de tarjeta. Intentá nuevamente.');
    });
    this.paymentElement.mount(this.paymentElementHost.nativeElement);
  }

  async onConfirmar(): Promise<void> {
    if (!this.stripe || !this.elements) {
      this.fallo.emit('El formulario de pago no está listo.');
      return;
    }

    this.procesando.set(true);
    try {
      const { error, paymentIntent } = await this.stripe.confirmPayment({
        elements: this.elements,
        redirect: 'if_required',
      });

      if (error) {
        this.fallo.emit(error.message || 'El pago fue rechazado por Stripe.');
        return;
      }

      if (paymentIntent) {
        // El llamante verifica este id contra el backend antes de crear la venta.
        this.pagado.emit(paymentIntent.id);
      }
    } catch {
      this.fallo.emit('No se pudo confirmar el pago. Revisá tu conexión antes de reintentar.');
    } finally {
      this.procesando.set(false);
    }
  }

  onCancelar(): void {
    this.cancelado.emit();
  }

  ngOnDestroy(): void {
    this.listo.set(false);
    this.paymentElement?.unmount();
    this.paymentElement?.destroy();
    this.paymentElement = null;
    this.elements = null;
    this.stripe = null;
  }
}
