import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/services/platform.service';
import { BitacoraEntrada, FiltrosBitacora, Paginado } from '../../core/models';

/** Bitácora de TODAS las empresas, paginada (consola del superadministrador). */
@Component({
  selector: 'app-platform-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Superadministrador</span>
        <h1 class="text-xl font-bold text-gray-900 mt-0.5">Bitácora de la plataforma</h1>
        <p class="text-xs text-gray-500 mt-1">
          Actividad de todos los usuarios de todas las empresas suscritas: inicios de sesión, ventas, cambios y operaciones de la consola.
        </p>
      </div>

      <!-- Filtros -->
      <div class="flex flex-wrap items-end gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empresa</label>
          <select [(ngModel)]="filtros.idTenant"
                  class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option [ngValue]="null">Todas</option>
            <option *ngFor="let e of platformService.empresas()" [ngValue]="e.tenant.idTenant">{{ e.tenant.nombre }}</option>
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
                <th class="px-5 py-2.5">Empresa</th>
                <th class="px-5 py-2.5">Usuario</th>
                <th class="px-5 py-2.5">Acción</th>
                <th class="px-5 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let b of pagina()!.items" class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-2.5 text-gray-700 whitespace-nowrap font-mono">{{ b.fecha }} {{ b.hora }}</td>
                <td class="px-5 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{{ b.empresa }}</td>
                <td class="px-5 py-2.5">
                  <p class="text-gray-900">{{ b.usuarioNombre }}</p>
                  <p class="text-[10px] text-gray-400">{{ b.usuarioCorreo }}</p>
                </td>
                <td class="px-5 py-2.5 text-gray-700">{{ b.accion }}</td>
                <td class="px-5 py-2.5 text-gray-400 font-mono">{{ b.ip }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div *ngIf="pagina() as p" class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-xs">
          <span class="text-gray-500">
            {{ desde() }}–{{ hasta() }} de {{ p.total }} registro(s)
          </span>
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
export class PlatformAuditComponent implements OnInit {
  readonly pagina = signal<Paginado<BitacoraEntrada> | null>(null);
  readonly cargando = signal<boolean>(false);

  filtros: FiltrosBitacora = { page: 1, size: 25, idTenant: null, q: '', fecha_desde: '', fecha_hasta: '' };

  readonly desde = computed(() => {
    const p = this.pagina();
    return p && p.total > 0 ? (p.page - 1) * p.size + 1 : 0;
  });
  readonly hasta = computed(() => {
    const p = this.pagina();
    return p ? Math.min(p.page * p.size, p.total) : 0;
  });

  constructor(public platformService: PlatformService) {}

  ngOnInit(): void {
    void this.cargar();
    // El filtro por empresa usa el listado de la consola: si se entra directo
    // a la bitácora (sin pasar por "Empresas suscritas") hay que pedirlo.
    if (this.platformService.empresas().length === 0) void this.platformService.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    const datos = await this.platformService.cargarBitacora(this.filtros);
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
    this.filtros = { page: 1, size: this.filtros.size, idTenant: null, q: '', fecha_desde: '', fecha_hasta: '' };
    void this.cargar();
  }
}
