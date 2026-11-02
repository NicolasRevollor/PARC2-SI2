import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificacionesService } from '../../core/services/notificaciones.service';

// ==== CAMPANITA DE AVISOS (correccion de la ingeniera: avisos "tipo push o correo") ====
// En palabras simples: el icono de campana arriba a la derecha. El numerito rojo dice cuantos avisos
//   nuevos hay. Al tocarla se abre la lista: "Su prenda sera enviada el viernes 06/11",
//   "Nota de devolucion DEV-000123: le devolvimos Bs 80", etc. La usan el cliente y el personal.
// Los mismos avisos tambien llegan por correo (eso lo hace el backend).
// ==================================================================
@Component({
  selector: 'app-notificaciones-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      <button (click)="alternar()" class="relative p-2 rounded-lg hover:bg-white/10 text-gray-300 cursor-pointer bg-transparent border-0"
              aria-label="Notificaciones" title="Notificaciones">
        <span class="material-symbols-outlined text-[20px]">notifications</span>
        <span *ngIf="servicio.noLeidas() > 0"
              class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
          {{ servicio.noLeidas() }}
        </span>
      </button>
      <div *ngIf="abierto()" class="absolute right-0 mt-2 w-80 max-w-[90vw] max-h-96 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg z-50">
        <p class="px-4 py-2 text-xs font-bold uppercase text-gray-500 border-b border-gray-100">Notificaciones</p>
        <p *ngIf="servicio.avisos().length === 0" class="px-4 py-6 text-sm text-gray-500 text-center">No tenés avisos.</p>
        <div *ngFor="let a of servicio.avisos()" class="px-4 py-3 border-b border-gray-100 text-sm" [class.bg-indigo-50]="!a.leida">
          <p class="flex items-center gap-1 font-semibold text-gray-900">
            <span class="material-symbols-outlined text-[16px] text-indigo-600">{{ icono(a.tipo) }}</span>{{ a.titulo }}
          </p>
          <p class="text-xs text-gray-600 mt-1">{{ a.mensaje }}</p>
          <p class="text-[10px] text-gray-400 mt-1">{{ a.fecha | date: 'dd/MM/yyyy HH:mm' }}</p>
        </div>
      </div>
    </div>
  `,
})
export class NotificacionesBellComponent implements OnInit, OnDestroy {
  readonly abierto = signal<boolean>(false);

  constructor(public servicio: NotificacionesService) {}

  ngOnInit(): void {
    this.servicio.iniciar();
  }

  ngOnDestroy(): void {
    this.servicio.detener();
  }

  /** Abre o cierra la lista; al abrirla, los avisos quedan como leidos. */
  alternar(): void {
    this.abierto.update((v) => !v);
    if (this.abierto()) void this.servicio.leerTodas();
  }

  /** Un icono distinto segun el tipo de aviso. */
  icono(tipo: string): string {
    const iconos: Record<string, string> = { envio: 'local_shipping', reembolso: 'payments', venta_sin_conexion: 'wifi_off' };
    return iconos[tipo] ?? 'assignment_return';
  }
}
