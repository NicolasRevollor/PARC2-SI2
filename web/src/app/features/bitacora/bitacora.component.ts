import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BitacoraService } from '../../core/services/bitacora.service';
import { BitacoraEmpresaPagina, FiltrosBitacoraEmpresa, UsuarioBitacora } from '../../core/models';

/** Icono según el tipo de acción registrada (solo visual). */
const ICONOS_ACCION: [RegExp, string][] = [
  [/fallido|bloquead/i, 'gpp_bad'],
  [/cierre de sesi/i, 'logout'],
  [/inicio de sesi/i, 'login'],
  [/^venta/i, 'point_of_sale'],
  [/traspaso/i, 'local_shipping'],
  [/devoluci|cambio_talla|cambio de talla/i, 'swap_horiz'],
  [/ingreso de lote|ajuste de stock|inventario/i, 'inventory_2'],
  [/reserva/i, 'event_available'],
  [/producto|prenda/i, 'checkroom'],
  [/contrase|cuenta|usuario|rol/i, 'manage_accounts'],
];

/**
 * Bitácora de la empresa (CU de auditoría): todo el personal la tiene.
 * Administrador y Encargado ven la actividad de toda la organización; el
 * resto (Cajero, Proveedor) ve solo la suya. El backend decide el alcance.
 */
@Component({
  selector: 'app-bitacora',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">

      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Auditoría</span>
          <h1 class="text-xl font-bold text-gray-900 mt-0.5">Bitácora</h1>
          <p class="text-xs text-gray-500 mt-1">
            {{ pagina()?.alcance === 'propia'
                ? 'Tu actividad en el sistema: inicios de sesión, ventas y demás acciones que registraste.'
                : 'Actividad de todo el personal de la empresa: quién hizo qué, cuándo y desde qué IP.' }}
          </p>
        </div>
        <span *ngIf="pagina() as p"
              class="self-start sm:self-auto px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
              [ngClass]="p.alcance === 'empresa'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'">
          {{ p.alcance === 'empresa' ? 'Toda la empresa' : 'Mi actividad' }} · {{ p.total }} registro(s)
        </span>
      </div>

      <!-- Filtros -->
      <div class="flex flex-wrap items-end gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div *ngIf="usuarios().length > 1" class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Usuario</label>
          <select [(ngModel)]="filtros.idUser" (ngModelChange)="buscar()"
                  class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option [ngValue]="null">Todos</option>
            <option *ngFor="let u of usuarios()" [ngValue]="u.idUser">{{ u.nombre }} ({{ u.rol }})</option>
          </select>
        </div>
        <div class="flex flex-col gap-1 min-w-[200px] flex-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Buscar</label>
          <input type="text" [(ngModel)]="filtros.q" (keyup.enter)="buscar()" placeholder="Acción, usuario o correo…"
                 class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Desde</label>
          <input type="date" [(ngModel)]="filtros.fecha_desde"
                 class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasta</label>
          <input type="date" [(ngModel)]="filtros.fecha_hasta"
                 class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <button (click)="buscar()"
                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer">
          Filtrar
        </button>
        <button (click)="limpiar()"
                class="px-4 py-2 bg-[#18191d] border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
          Limpiar
        </button>
      </div>

      <!-- Tabla -->
      <div class="bg-[#18191d] rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div *ngIf="cargando() && !pagina()" class="p-8 text-center text-sm text-gray-500">Cargando bitácora…</div>
        <div *ngIf="pagina() && pagina()!.items.length === 0" class="p-8 text-center text-sm text-gray-500">
          No hay registros con esos filtros.
        </div>

        <div *ngIf="pagina() && pagina()!.items.length > 0" class="overflow-x-auto" [class.opacity-60]="cargando()">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                <th class="px-5 py-2.5">Fecha y hora</th>
                <th class="px-5 py-2.5">Usuario</th>
                <th class="px-5 py-2.5">Acción</th>
                <th class="px-5 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let b of pagina()!.items" class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-2.5 text-gray-700 whitespace-nowrap font-mono">
                  {{ b.fecha | date: 'dd/MM/yyyy' }} {{ b.hora }}
                </td>
                <td class="px-5 py-2.5">
                  <p class="text-gray-900">{{ b.usuario_nombre || ('Usuario #' + b.idUser) }}</p>
                  <p class="text-[10px] text-gray-400">{{ b.usuario_correo }}<span *ngIf="b.rol"> · {{ b.rol }}</span></p>
                </td>
                <td class="px-5 py-2.5 text-gray-700">
                  <span class="inline-flex items-start gap-2">
                    <span class="material-symbols-outlined text-[16px] shrink-0"
                          [ngClass]="esAlerta(b.accion) ? 'text-rose-500' : 'text-gray-400'">{{ icono(b.accion) }}</span>
                    <span>{{ b.accion }}</span>
                  </span>
                </td>
                <td class="px-5 py-2.5 text-gray-400 font-mono">{{ b.ip }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div *ngIf="pagina() as p" class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-xs">
          <span class="text-gray-500">{{ desde() }}–{{ hasta() }} de {{ p.total }} registro(s)</span>
          <div class="flex items-center gap-2">
            <select [(ngModel)]="filtros.size" (ngModelChange)="buscar()"
                    class="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none">
              <option [ngValue]="10">10</option>
              <option [ngValue]="25">25</option>
              <option [ngValue]="50">50</option>
              <option [ngValue]="100">100</option>
            </select>
            <button (click)="irA(p.page - 1)" [disabled]="p.page <= 1 || cargando()"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Anterior
            </button>
            <span class="text-gray-700 font-mono">{{ p.page }} / {{ p.pages || 1 }}</span>
            <button (click)="irA(p.page + 1)" [disabled]="p.page >= p.pages || cargando()"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class BitacoraComponent implements OnInit {
  readonly pagina = signal<BitacoraEmpresaPagina | null>(null);
  readonly usuarios = signal<UsuarioBitacora[]>([]);
  readonly cargando = signal<boolean>(false);

  filtros: FiltrosBitacoraEmpresa = this.filtrosVacios(25);

  readonly desde = computed(() => {
    const p = this.pagina();
    return p && p.total > 0 ? (p.page - 1) * p.size + 1 : 0;
  });
  readonly hasta = computed(() => {
    const p = this.pagina();
    return p ? Math.min(p.page * p.size, p.total) : 0;
  });

  constructor(private bitacoraService: BitacoraService) {}

  ngOnInit(): void {
    void this.cargar();
    void this.bitacoraService.usuarios().then((u) => this.usuarios.set(u));
  }

  private filtrosVacios(size: number): FiltrosBitacoraEmpresa {
    return { page: 1, size, idUser: null, q: '', fecha_desde: '', fecha_hasta: '' };
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    const datos = await this.bitacoraService.cargar(this.filtros);
    if (datos) this.pagina.set(datos);
    this.cargando.set(false);
  }

  /** Un filtro nuevo siempre vuelve a la primera página. */
  buscar(): void {
    this.filtros.page = 1;
    void this.cargar();
  }

  irA(pagina: number): void {
    this.filtros.page = pagina;
    void this.cargar();
  }

  limpiar(): void {
    this.filtros = this.filtrosVacios(this.filtros.size);
    void this.cargar();
  }

  icono(accion: string): string {
    return ICONOS_ACCION.find(([patron]) => patron.test(accion))?.[1] ?? 'history';
  }

  esAlerta(accion: string): boolean {
    return /fallido|bloquead/i.test(accion);
  }
}
