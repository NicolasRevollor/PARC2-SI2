import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetodoPago, Reserva } from '../../core/models';
import { ReservationsService } from '../../core/services/reservations.service';

@Component({
  selector: 'app-staff-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 animate-in fade-in duration-200">

      <div class="pb-5 border-b border-gray-200 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Reservas</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Reservas y Atención en Sucursal</h1>
          <p class="text-xs text-gray-500 mt-1">
            El filtro de sucursal es solo una ayuda visual: no restringe qué reservas puede gestionar el personal.
          </p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Sucursal</label>
          <select
            class="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer"
            [ngModel]="branchFilter()"
            (ngModelChange)="branchFilter.set($event)"
            name="branchFilter"
          >
            <option [ngValue]="null">Todas las sucursales</option>
            <option *ngFor="let b of branchOptions()" [ngValue]="b.codigoSucursal">{{ b.nombre }}</option>
          </select>
        </div>
      </div>

      <div *ngIf="filteredReservations().length === 0" class="text-center py-12 text-gray-400 text-sm">
        No hay reservas para mostrar.
      </div>

      <div class="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-xs" *ngIf="filteredReservations().length > 0">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
              <th class="px-4 py-3">Reserva</th>
              <th class="px-4 py-3">Cliente</th>
              <th class="px-4 py-3">Producto</th>
              <th class="px-4 py-3">Sucursal</th>
              <th class="px-4 py-3">Fecha / Horario</th>
              <th class="px-4 py-3">Anticipo</th>
              <th class="px-4 py-3">Estado</th>
              <th class="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of filteredReservations()" class="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td class="px-4 py-3 font-mono text-xs text-gray-500">#{{ r.codigoReserva }}</td>
              <td class="px-4 py-3">Cliente #{{ r.idCliente }}</td>
              <td class="px-4 py-3 font-medium text-gray-900">{{ r.producto_nombre || ('Producto #' + r.idProducto) }}</td>
              <td class="px-4 py-3 text-gray-600">{{ r.sucursal_nombre || ('Sucursal #' + r.codigoSucursal) }}</td>
              <td class="px-4 py-3 text-gray-600">{{ r.fecha }} · {{ r.horario }}</td>
              <td class="px-4 py-3 text-gray-600">
                <span *ngIf="r.montoDeposito !== null; else sinDeposito" class="font-semibold text-emerald-700">
                  Bs {{ r.montoDeposito!.toFixed(2) }}
                </span>
                <ng-template #sinDeposito><span class="text-gray-400">—</span></ng-template>
              </td>
              <td class="px-4 py-3">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  [class.bg-amber-50]="r.estado === 'Pendiente'"
                  [class.text-amber-700]="r.estado === 'Pendiente'"
                  [class.bg-sky-50]="r.estado === 'Preparada en Sucursal'"
                  [class.text-sky-700]="r.estado === 'Preparada en Sucursal'"
                  [class.bg-emerald-50]="r.estado === 'Confirmada'"
                  [class.text-emerald-700]="r.estado === 'Confirmada'"
                  [class.bg-gray-100]="r.estado === 'Cancelada'"
                  [class.text-gray-500]="r.estado === 'Cancelada'"
                >
                  {{ r.estado }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <button
                    *ngIf="r.estado === 'Pendiente'"
                    (click)="onPreparar(r.codigoReserva)"
                    [disabled]="busyId() === r.codigoReserva"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {{ busyId() === r.codigoReserva ? 'Preparando...' : 'Preparar' }}
                  </button>

                  <button
                    *ngIf="r.estado === 'Preparada en Sucursal'"
                    (click)="onAbrirConfirmar(r)"
                    [disabled]="busyId() === r.codigoReserva"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Confirmar atención
                  </button>

                  <button
                    *ngIf="r.estado === 'Pendiente' || r.estado === 'Preparada en Sucursal'"
                    (click)="onCancelar(r.codigoReserva)"
                    [disabled]="busyId() === r.codigoReserva"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {{ busyId() === r.codigoReserva ? 'Cancelando...' : 'Cancelar' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal de confirmación de pago -->
      <div
        *ngIf="reservaAConfirmar()"
        class="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        (click)="onCerrarModal()"
      >
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4" (click)="$event.stopPropagation()">
          <div>
            <h3 class="text-base font-bold text-gray-900">Confirmar atención</h3>
            <p class="text-xs text-gray-500 mt-1">
              Reserva #{{ reservaAConfirmar()?.codigoReserva }} —
              {{ reservaAConfirmar()?.producto_nombre || ('Producto #' + reservaAConfirmar()?.idProducto) }}
            </p>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Método de pago</label>
            <select
              class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer"
              [ngModel]="selectedMetodoPago()"
              (ngModelChange)="selectedMetodoPago.set($event)"
              name="metodoPago"
            >
              <option [ngValue]="null" disabled>Seleccioná un método de pago</option>
              <option *ngFor="let m of paymentMethods()" [ngValue]="m.idMetPago">
                {{ m.tipo }} — {{ m.estado }}
              </option>
            </select>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              (click)="onCerrarModal()"
              class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              (click)="onConfirmarPago()"
              [disabled]="!selectedMetodoPago() || confirmando()"
              class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {{ confirmando() ? 'Confirmando...' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class StaffReservationsComponent implements OnInit {
  busyId = signal<number | null>(null);
  branchFilter = signal<number | null>(null);
  reservaAConfirmar = signal<Reserva | null>(null);
  selectedMetodoPago = signal<number | null>(null);
  confirmando = signal(false);
  paymentMethods = signal<MetodoPago[]>([]);

  branchOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const r of this.reservationsService.staffReservations()) {
      if (!seen.has(r.codigoSucursal)) {
        seen.set(r.codigoSucursal, r.sucursal_nombre || `Sucursal #${r.codigoSucursal}`);
      }
    }
    return Array.from(seen.entries()).map(([codigoSucursal, nombre]) => ({ codigoSucursal, nombre }));
  });

  filteredReservations = computed(() => {
    const branch = this.branchFilter();
    const list = this.reservationsService.staffReservations();
    return branch === null ? list : list.filter(r => r.codigoSucursal === branch);
  });

  constructor(public reservationsService: ReservationsService) {}

  ngOnInit() {
    this.reservationsService.loadAllReservations();
    this.reservationsService.loadPaymentMethods().then((methods) => this.paymentMethods.set(methods));
  }

  async onPreparar(codigoReserva: number) {
    this.busyId.set(codigoReserva);
    await this.reservationsService.prepareReservation(codigoReserva);
    this.busyId.set(null);
  }

  async onCancelar(codigoReserva: number) {
    this.busyId.set(codigoReserva);
    await this.reservationsService.cancelReservationAsStaff(codigoReserva);
    this.busyId.set(null);
  }

  onAbrirConfirmar(reserva: Reserva) {
    this.reservaAConfirmar.set(reserva);
    this.selectedMetodoPago.set(null);
  }

  onCerrarModal() {
    this.reservaAConfirmar.set(null);
    this.selectedMetodoPago.set(null);
  }

  async onConfirmarPago() {
    const reserva = this.reservaAConfirmar();
    const idMetPago = this.selectedMetodoPago();
    if (!reserva || !idMetPago) {
      return;
    }
    this.confirmando.set(true);
    const ok = await this.reservationsService.confirmReservation(reserva.codigoReserva, idMetPago);
    this.confirmando.set(false);
    if (ok) {
      this.onCerrarModal();
    }
  }
}
