import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservationsService } from '../../../core/services/reservations.service';

@Component({
  selector: 'app-customer-reservations',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">

      <div class="pb-5 border-b border-gray-200">
        <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Reservas</span>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Mis Reservas</h1>
        <p class="text-xs text-gray-500 mt-1">Reservas creadas desde el catálogo. Podés cancelar las que aún estén pendientes.</p>
      </div>

      <div *ngIf="reservationsService.reservations().length === 0" class="text-center py-12 text-gray-400 text-sm">
        Todavía no tenés reservas. Explorá el catálogo para crear una.
      </div>

      <div class="space-y-3">
        <div
          *ngFor="let r of reservationsService.reservations()"
          class="bg-white rounded-xl border border-gray-200 shadow-xs p-4 flex items-center justify-between gap-4"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-gray-900 truncate">{{ r.producto_nombre || ('Producto #' + r.idProducto) }}</h3>
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
            </div>
            <p class="text-xs text-gray-500 mt-1">
              {{ r.sucursal_nombre || ('Sucursal #' + r.codigoSucursal) }} · {{ r.fecha }} · {{ r.horario }}
            </p>
          </div>

          <button
            *ngIf="r.estado === 'Pendiente'"
            (click)="onCancelar(r.codigoReserva)"
            [disabled]="cancelandoId() === r.codigoReserva"
            class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {{ cancelandoId() === r.codigoReserva ? 'Cancelando...' : 'Cancelar' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class CustomerReservationsComponent implements OnInit {
  cancelandoId = signal<number | null>(null);

  constructor(public reservationsService: ReservationsService) {}

  ngOnInit() {
    this.reservationsService.loadReservations();
  }

  async onCancelar(codigoReserva: number) {
    this.cancelandoId.set(codigoReserva);
    await this.reservationsService.cancelReservation(codigoReserva);
    this.cancelandoId.set(null);
  }
}
