import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/services/platform.service';
import { Paginado, Respaldo, RespaldoConfig } from '../../core/models';

/** Respaldos por empresa: manuales desde acá, automáticos por el cron diario. */
@Component({
  selector: 'app-platform-backups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Superadministrador</span>
        <h1 class="text-xl font-bold text-gray-900 mt-0.5">Respaldos</h1>
        <p class="text-xs text-gray-500 mt-1">
          Copias de seguridad por empresa: manuales desde esta pantalla y automáticas con el cron diario.
        </p>
      </div>

      <!-- Estado de la configuración -->
      <div *ngIf="config() as cfg" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="flex items-start gap-3 p-4 rounded-xl border"
             [ngClass]="cfg.almacenamiento === 'supabase' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'">
          <span class="material-symbols-outlined text-[20px] shrink-0"
                [ngClass]="cfg.almacenamiento === 'supabase' ? 'text-emerald-600' : 'text-amber-600'">
            {{ cfg.almacenamiento === 'supabase' ? 'cloud_done' : 'folder' }}
          </span>
          <div class="text-xs">
            <p class="font-bold" [ngClass]="cfg.almacenamiento === 'supabase' ? 'text-emerald-700' : 'text-amber-700'">
              {{ cfg.almacenamiento === 'supabase' ? 'Guardando en el bucket privado de Supabase' : 'Guardando en disco local' }}
            </p>
            <p class="text-gray-600 mt-1">
              {{ cfg.almacenamiento === 'supabase'
                  ? 'Los archivos quedan fuera del servidor y sobreviven a los redeploys.'
                  : 'Sirve para probar en tu PC. En Render este disco se borra en cada despliegue: configurá BACKUP_BUCKET.' }}
            </p>
          </div>
        </div>
        <div class="flex items-start gap-3 p-4 rounded-xl border"
             [ngClass]="cfg.automaticosHabilitados ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'">
          <span class="material-symbols-outlined text-[20px] shrink-0"
                [ngClass]="cfg.automaticosHabilitados ? 'text-emerald-600' : 'text-amber-600'">schedule</span>
          <div class="text-xs">
            <p class="font-bold" [ngClass]="cfg.automaticosHabilitados ? 'text-emerald-700' : 'text-amber-700'">
              {{ cfg.automaticosHabilitados ? 'Respaldos automáticos habilitados' : 'Respaldos automáticos deshabilitados' }}
            </p>
            <p class="text-gray-600 mt-1">
              {{ cfg.automaticosHabilitados
                  ? 'Diario a las 02:00 (Bolivia). Se conservan los últimos ' + cfg.retencionAutomaticos + ' automáticos por empresa.'
                  : 'Falta configurar BACKUP_CRON_SECRET en el servidor y en GitHub Actions.' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Acciones -->
      <div class="flex flex-wrap items-end gap-3 bg-[#18191d] p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empresa</label>
          <select [(ngModel)]="idTenant" (ngModelChange)="irA(1)"
                  class="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option [ngValue]="null">Todas</option>
            <option *ngFor="let e of platformService.empresas()" [ngValue]="e.tenant.idTenant">{{ e.tenant.nombre }}</option>
          </select>
        </div>
        <button (click)="respaldar()" [disabled]="!idTenant || respaldando()"
                [title]="idTenant ? 'Generar un respaldo ahora' : 'Elegí una empresa para respaldar'"
                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">backup</span>
          {{ respaldando() ? 'Respaldando…' : 'Respaldar ahora' }}
        </button>
      </div>

      <!-- Listado -->
      <div class="bg-[#18191d] rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div *ngIf="pagina() && pagina()!.items.length === 0" class="p-8 text-center text-sm text-gray-500">
          Todavía no hay respaldos{{ idTenant ? ' de esta empresa' : '' }}.
        </div>

        <div *ngIf="pagina() && pagina()!.items.length > 0" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                <th class="px-5 py-2.5">Fecha</th>
                <th class="px-5 py-2.5">Empresa</th>
                <th class="px-5 py-2.5">Tipo</th>
                <th class="px-5 py-2.5 text-right">Registros</th>
                <th class="px-5 py-2.5 text-right">Tamaño</th>
                <th class="px-5 py-2.5">Estado</th>
                <th class="px-5 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let r of pagina()!.items" class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-2.5 text-gray-700 whitespace-nowrap font-mono">{{ r.creadoEn | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="px-5 py-2.5 font-semibold text-gray-900">{{ r.empresa }}</td>
                <td class="px-5 py-2.5">
                  <span class="text-gray-700">{{ r.tipo === 'manual' ? 'Manual' : 'Automático' }}</span>
                  <span *ngIf="r.creadoPor" class="block text-[10px] text-gray-400">{{ r.creadoPor }}</span>
                </td>
                <td class="px-5 py-2.5 text-right font-mono text-gray-700">{{ r.filas }}</td>
                <td class="px-5 py-2.5 text-right font-mono text-gray-700">{{ formatoTamano(r.tamanoBytes) }}</td>
                <td class="px-5 py-2.5">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                        [ngClass]="r.estado === 'Completado'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-600 border-rose-200'"
                        [title]="r.error || ''">
                    {{ r.estado }}
                  </span>
                </td>
                <td class="px-5 py-2.5 text-right whitespace-nowrap">
                  <button *ngIf="r.estado === 'Completado'" (click)="platformService.descargarRespaldo(r)" title="Descargar"
                          class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer">
                    <span class="material-symbols-outlined text-[18px]">download</span>
                  </button>
                  <button (click)="borrar(r)" title="Eliminar"
                          class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 bg-transparent border-0 cursor-pointer">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="pagina() as p" class="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-xs">
          <span class="text-gray-500">{{ p.total }} respaldo(s)</span>
          <div class="flex items-center gap-2">
            <button (click)="irA(p.page - 1)" [disabled]="p.page <= 1"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Anterior
            </button>
            <span class="text-gray-700 font-mono">{{ p.page }} / {{ p.pages || 1 }}</span>
            <button (click)="irA(p.page + 1)" [disabled]="p.page >= p.pages"
                    class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PlatformBackupsComponent implements OnInit {
  readonly config = signal<RespaldoConfig | null>(null);
  readonly pagina = signal<Paginado<Respaldo> | null>(null);
  readonly respaldando = signal<boolean>(false);

  idTenant: number | null = null;
  private page = 1;
  private readonly size = 20;

  constructor(public platformService: PlatformService) {}

  async ngOnInit(): Promise<void> {
    // El selector de empresa usa el listado de la consola: si se entra directo
    // a respaldos (sin pasar por "Empresas suscritas") hay que pedirlo.
    if (this.platformService.empresas().length === 0) void this.platformService.cargar();
    this.config.set(await this.platformService.configRespaldos());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    const datos = await this.platformService.listarRespaldos(this.page, this.size, this.idTenant);
    if (datos) this.pagina.set(datos);
  }

  irA(pagina: number): void {
    this.page = pagina;
    void this.cargar();
  }

  /** Respaldo manual de una empresa puntual (también se puede desde la pestaña Empresas). */
  async respaldar(idTenant: number | null = this.idTenant): Promise<void> {
    if (!idTenant) return;
    this.respaldando.set(true);
    await this.platformService.respaldarAhora(idTenant);
    this.respaldando.set(false);
    this.irA(1);
  }

  async borrar(respaldo: Respaldo): Promise<void> {
    if (!confirm(`¿Eliminar el respaldo de ${respaldo.empresa} del ${new Date(respaldo.creadoEn).toLocaleString()}? No se puede deshacer.`)) {
      return;
    }
    if (await this.platformService.borrarRespaldo(respaldo.idRespaldo)) {
      await this.cargar();
    }
  }

  formatoTamano(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
