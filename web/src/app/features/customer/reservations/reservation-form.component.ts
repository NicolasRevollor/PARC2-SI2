import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../../core/services/inventory.service';
import { ReservationsService } from '../../../core/services/reservations.service';
import { PaymentsService } from '../../../core/services/payments.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CardPaymentComponent } from '../../../shared/components/card-payment.component';
import type { ProductOut, Reserva } from '../../../core/models';

// Formato HH:MM (compatible con `time.fromisoformat` del backend).
// El regex vive únicamente en este método de la clase — nunca como literal
// dentro de un binding de template (rompe la compilación AOT de Angular).
const HORARIO_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type EstadoReserva = 'iniciando' | 'cobrando' | 'cobrado_sin_reserva' | 'reservado' | 'error';

/**
 * Formulario de reserva (CU10/CU12): el anticipo del 10% se cobra por
 * tarjeta ANTES de crear la reserva — mismo patron cobrar-antes-de-crear que
 * `purchase-modal.component.ts` (Requirement "Mandatory Server-Computed
 * Deposit" / "Card-Only Deposit With Ownership Guard"). El monto del
 * deposito SIEMPRE viene del servidor (`POST /api/payments/intents` con
 * `proposito: "reserva_deposito"`); nunca se calcula ni se confia en un
 * monto estimado del lado cliente para el cobro real. Si la reserva falla
 * despues de un cobro verificado, el `idMetPago` se retiene para reintentar
 * sin cobrar dos veces (Requirement "Charge Retained on Reservation Creation
 * Failure").
 */
@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CardPaymentComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
        <div class="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Nueva reserva</span>
            <h2 class="text-base font-bold text-gray-900 mt-0.5 leading-snug">{{ producto.nombre }}</h2>
          </div>
          <button
            *ngIf="estado() !== 'cobrado_sin_reserva'"
            (click)="cerrar.emit()"
            class="w-8 h-8 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-gray-900 hover:text-white transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <!-- Paso 1: datos de la reserva (sucursal/fecha/horario) — todavia sin cobrar nada -->
        <form *ngIf="estado() === 'iniciando'" (ngSubmit)="onSubmit()" class="p-5 space-y-4">
          <div class="flex flex-col space-y-1.5">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="sucursal">Sucursal</label>
            <select
              id="sucursal"
              name="sucursal"
              [(ngModel)]="codigoSucursal"
              class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option [ngValue]="null">Seleccione una sucursal</option>
              <option *ngFor="let s of inventoryService.locations()" [ngValue]="s.codigoSucursal">
                {{ s.nombre }} — {{ s.ciudad }}
              </option>
            </select>
          </div>

          <div class="flex flex-col space-y-1.5">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="fecha">Fecha</label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              [(ngModel)]="fecha"
              class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p *ngIf="fecha && !isFechaValida()" class="text-xs text-rose-600">La fecha debe ser hoy o una fecha futura.</p>
          </div>

          <div class="flex flex-col space-y-1.5">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="horario">Horario</label>
            <input
              id="horario"
              name="horario"
              type="time"
              [(ngModel)]="horario"
              class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p *ngIf="horario && !isHorarioValido()" class="text-xs text-rose-600">Formato de horario inválido (HH:MM).</p>
          </div>

          <p *ngIf="submitError()" class="text-xs text-rose-600">{{ submitError() }}</p>

          <div class="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              (click)="cerrar.emit()"
              class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="isSubmitting() || !canSubmit()"
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {{ isSubmitting() ? 'Calculando depósito...' : 'Continuar al pago' }}
            </button>
          </div>
        </form>

        <!-- Paso 2: cobro del anticipo -->
        <div *ngIf="estado() === 'cobrando'" class="p-5 space-y-4">
          <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p class="text-xs font-bold uppercase tracking-wider text-indigo-600">Anticipo a cobrar (10%)</p>
            <p class="text-2xl font-bold text-indigo-700 mt-1">Bs {{ depositoMonto()?.toFixed(2) }}</p>
            <p class="text-xs text-indigo-500 mt-1">Se descuenta del total al confirmar la reserva en sucursal.</p>
          </div>
          <app-card-payment
            *ngIf="clientSecret()"
            [clientSecret]="clientSecret()"
            [concepto]="'Anticipo reserva: ' + producto.nombre"
            (pagado)="onCardPagado($event)"
            (fallo)="onCardFallo($event)"
            (cancelado)="onCardCancelado()"
          ></app-card-payment>
        </div>

        <!-- Cobrado pero la reserva fallo: retener idMetPago, nunca cobrar dos veces -->
        <div *ngIf="estado() === 'cobrado_sin_reserva'" class="p-5">
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p class="text-sm font-bold text-amber-800">El anticipo ya fue cobrado, pero la reserva no se pudo confirmar.</p>
            <p class="text-xs text-amber-700">
              Podés reintentar sin que se te cobre de nuevo. Si el problema persiste, contactá a soporte
              (el pago #{{ idMetPagoActual() }} queda retenido para conciliación).
            </p>
            <button
              (click)="onReintentarReserva()"
              [disabled]="isSubmitting()"
              class="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {{ isSubmitting() ? 'Reintentando…' : 'Reintentar reserva' }}
            </button>
          </div>
        </div>

        <!-- crearIntent fallo: sin stock, piso de deposito no cubierto, Stripe no disponible -->
        <div *ngIf="estado() === 'error'" class="p-5 space-y-3">
          <p class="text-sm font-bold text-rose-700">{{ submitError() }}</p>
          <button
            (click)="cerrar.emit()"
            class="w-full px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `
})
export class ReservationFormComponent implements OnInit {
  @Input({ required: true }) producto!: ProductOut;
  @Output() cerrar = new EventEmitter<void>();
  @Output() creada = new EventEmitter<Reserva>();

  codigoSucursal: number | null = null;
  fecha = '';
  horario = '';

  estado = signal<EstadoReserva>('iniciando');
  clientSecret = signal<string | null>(null);
  depositoMonto = signal<number | null>(null);
  idMetPagoActual = signal<number | null>(null);

  isSubmitting = signal<boolean>(false);
  submitError = signal<string | null>(null);

  constructor(
    public inventoryService: InventoryService,
    private reservationsService: ReservationsService,
    private paymentsService: PaymentsService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit() {
    this.inventoryService.loadLocations();
  }

  // El <input type="date"> entrega la fecha calendario LOCAL del usuario
  // como string plano (sin hora/zona). Comparar contra
  // `new Date().toISOString()` compara contra UTC, lo cual rechaza el día
  // de hoy para cualquier usuario en una zona horaria detrás de UTC durante
  // la noche (ej. toda Latinoamérica). Se construye "hoy" a partir de los
  // componentes de fecha LOCALES, no de la representación UTC.
  private todayIso(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  isFechaValida(): boolean {
    return this.fecha.length > 0 && this.fecha >= this.todayIso();
  }

  isHorarioValido(): boolean {
    return HORARIO_PATTERN.test(this.horario);
  }

  canSubmit(): boolean {
    return this.codigoSucursal !== null && this.isFechaValida() && this.isHorarioValido();
  }

  // Paso 1 -> 2: crea el Payment Intent del anticipo (proposito=reserva_deposito).
  // El backend valida stock EN LA SUCURSAL ELEGIDA y aplica el piso minimo
  // ANTES de llamar a Stripe (Requirement "Branch-Scoped Pre-Charge Stock
  // Validation" / "Minimum Deposit Floor") — si falla, nunca se cobra nada.
  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;

    this.submitError.set(null);
    this.isSubmitting.set(true);

    const intent = await this.paymentsService.crearIntent({
      items: [{ idProducto: this.producto.idProducto, cantidad: 1 }],
      claveIntento: crypto.randomUUID(),
      concepto: `Anticipo de reserva — ${this.producto.nombre}`,
      proposito: 'reserva_deposito',
      codigoSucursal: this.codigoSucursal!,
    });

    this.isSubmitting.set(false);

    if (!intent) {
      // El servicio ya notifico el motivo real (sin stock, piso no
      // cubierto, Stripe no configurado, etc.) via NotificationService.
      this.submitError.set('No se pudo iniciar el cobro del anticipo. Cerrá esta ventana e intentá de nuevo.');
      this.estado.set('error');
      return;
    }

    this.depositoMonto.set(intent.monto);
    this.clientSecret.set(intent.clientSecret);
    this.estado.set('cobrando');
  }

  async onCardPagado(paymentIntentId: string): Promise<void> {
    this.isSubmitting.set(true);
    const verificado = await this.paymentsService.verificarIntent(paymentIntentId);
    this.isSubmitting.set(false);
    if (!verificado || !verificado.pagado || verificado.idMetPago === undefined) {
      // El widget reporto exito del lado del cliente, pero el servidor aun
      // no confirma el cobro: NUNCA se llama a POST /api/reservations en
      // este caso (mismo criterio de `purchase-modal.component.ts`). Se
      // notifica el estancamiento en vez de dejar la UI congelada sin
      // salida (correccion review CU12, R2-silent-stuck-payment-state).
      this.submitError.set(
        'No se pudo confirmar el cobro del anticipo con el servidor. Si tu tarjeta fue debitada, contactá a soporte antes de reintentar.',
      );
      this.estado.set('error');
      return;
    }
    this.idMetPagoActual.set(verificado.idMetPago);
    this.clientSecret.set(null);
    await this.intentarCrearReserva();
  }

  onCardFallo(mensaje: string): void {
    // El widget (card-payment.component.ts) solo emite el evento, nunca
    // muestra nada por si solo. El clientSecret sigue montado: el usuario
    // puede reintentar el pago sin crear un intento nuevo.
    this.notificationService.error('Pago rechazado', mensaje);
  }

  onCardCancelado(): void {
    this.cerrar.emit();
  }

  // Unico punto que llama a POST /api/reservations — nunca crea ni cobra un
  // idMetPago (mismo patron que `purchase-modal.component.ts::intentarVenta`).
  private async intentarCrearReserva(): Promise<void> {
    const idMetPago = this.idMetPagoActual();
    if (idMetPago === null) {
      return;
    }
    this.isSubmitting.set(true);
    const reserva = await this.reservationsService.createReservation({
      fecha: this.fecha,
      horario: this.horario,
      codigoSucursal: this.codigoSucursal!,
      idProducto: this.producto.idProducto,
      idMetPago,
    });
    this.isSubmitting.set(false);

    if (reserva) {
      this.estado.set('reservado');
      this.creada.emit(reserva);
    } else {
      // El idMetPago YA fue cobrado (tarjeta verificada): se retiene para
      // reintentar, nunca se cobra de nuevo (Requirement "Charge Retained
      // on Reservation Creation Failure").
      this.estado.set('cobrado_sin_reserva');
    }
  }

  async onReintentarReserva(): Promise<void> {
    await this.intentarCrearReserva();
  }
}
