import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/services/platform.service';
import { TenantService } from '../../core/services/tenant.service';
import { PlanAdmin, PlanIn } from '../../core/models';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU23] Configurar planes de suscripcion
// Boundary: PlanesUI -> este componente
// Control: backend/app/routers/platform.py -> crear_plan, editar_plan, eliminar_plan
// ==================================================================
@Component({
  selector: 'app-platform-plans',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Planes</h1>
          <app-cu-badge cu="CU23" [conNombre]="true" class="block mt-1"></app-cu-badge>
          <p class="text-xs text-gray-500 mt-1">-1 en un límite significa ilimitado. Los cambios valen para las nuevas altas; quien ya supera un límite lo conserva hasta cambiar de plan.</p>
        </div>
        <button (click)="editar(null)" class="ys-btn"><span class="material-symbols-outlined text-[16px]">add</span> Nuevo plan</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div *ngFor="let p of planes()" class="ys-tarjeta p-5 space-y-2" [class.opacity-60]="!p.activo" data-testid="plan">
          <div class="flex justify-between items-start">
            <div><p class="text-base font-bold text-gray-900">{{ p.nombre }}</p><p class="text-[11px] font-mono text-gray-400">{{ p.codigo }}</p></div>
            <span class="ys-chip" [ngClass]="p.activo ? 'border-emerald-300 text-emerald-700' : 'border-gray-300 text-gray-500'">{{ p.activo ? 'Activo' : 'Desactivado' }}</span>
          </div>
          <p class="text-2xl font-bold text-gray-900">Bs {{ p.precioMensual }} <span class="text-xs font-normal text-gray-500">/ mes</span></p>
          <p class="text-xs text-gray-600">Sucursales {{ limite(p.maxSucursales) }} · Usuarios {{ limite(p.maxUsuarios) }} · Productos {{ limite(p.maxProductos) }}</p>
          <p class="text-xs text-gray-600">{{ p.permiteIA ? '✓' : '✗' }} Reportes con IA · {{ p.permiteOffline ? '✓' : '✗' }} Sin conexión · {{ p.permiteMultiSucursal ? '✓' : '✗' }} Varias sucursales</p>
          <p class="text-xs text-gray-500">{{ p.empresas }} empresa(s)</p>
          <p *ngIf="p.empresasExcedidas.length" class="text-xs text-amber-700">Superan los límites actuales: {{ p.empresasExcedidas.join(', ') }}</p>
          <div class="flex gap-2 pt-1">
            <button (click)="editar(p)" class="ys-btn-sec flex-1">Editar</button>
            <button (click)="alternar(p)" class="ys-btn-sec flex-1">{{ p.activo ? 'Desactivar' : 'Activar' }}</button>
            <button *ngIf="!p.empresas" (click)="eliminar(p)" class="ys-btn-sec" title="Eliminar"><span class="material-symbols-outlined text-[16px]">delete</span></button>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="formulario() as f" class="ys-modal">
      <div class="ys-modal-caja max-w-lg ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">{{ editando() === null ? 'Nuevo plan' : 'Editar plan' }}</h3>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="ys-mini">Código</span><input class="ys-campo font-mono" [(ngModel)]="f.codigo" name="codigo" [class.border-rose-500]="campo() === 'codigo'" /></label>
          <label class="block"><span class="ys-mini">Nombre</span><input class="ys-campo" [(ngModel)]="f.nombre" name="nombre" /></label>
          <label class="block col-span-2"><span class="ys-mini">Descripción</span><input class="ys-campo" [(ngModel)]="f.descripcion" name="descripcion" /></label>
          <label class="block"><span class="ys-mini">Precio mensual (Bs)</span><input type="number" min="0" class="ys-campo" [(ngModel)]="f.precioMensual" name="precio" /></label>
          <label class="block"><span class="ys-mini">Orden</span><input type="number" class="ys-campo" [(ngModel)]="f.orden" name="orden" /></label>
          <label class="block"><span class="ys-mini">Máx. sucursales</span><input type="number" min="-1" class="ys-campo" [(ngModel)]="f.maxSucursales" name="suc" /></label>
          <label class="block"><span class="ys-mini">Máx. usuarios</span><input type="number" min="-1" class="ys-campo" [(ngModel)]="f.maxUsuarios" name="usu" /></label>
          <label class="block"><span class="ys-mini">Máx. productos</span><input type="number" min="-1" class="ys-campo" [(ngModel)]="f.maxProductos" name="prod" /></label>
        </div>
        <div class="flex flex-col gap-1 text-xs text-gray-700">
          <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="f.permiteIA" name="ia" /> Reportes generativos con IA y modelos</label>
          <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="f.permiteOffline" name="off" /> Operación sin conexión</label>
          <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="f.permiteMultiSucursal" name="multi" /> Varias sucursales</label>
          <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="f.activo" name="activo" /> Disponible para nuevas contrataciones</label>
        </div>
        <p *ngIf="error()" class="text-xs text-rose-600">{{ error() }}</p>
        <div class="flex gap-2">
          <button (click)="formulario.set(null)" class="ys-btn-sec flex-1">Cancelar</button>
          <button (click)="guardar(f)" class="ys-btn flex-1">Guardar</button>
        </div>
      </div>
    </div>
  `,
})
export class PlatformPlansComponent implements OnInit {
  readonly planes = signal<PlanAdmin[]>([]);
  readonly formulario = signal<PlanIn | null>(null);
  readonly editando = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly campo = signal<string | null>(null);

  constructor(
    private platformService: PlatformService,
    private tenantService: TenantService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.planes.set(await this.platformService.planes());
    await this.tenantService.cargarPlanes();
  }

  limite(valor: number): string {
    return valor === -1 ? 'ilimitadas' : String(valor);
  }

  editar(plan: PlanAdmin | null): void {
    this.error.set(null);
    this.campo.set(null);
    this.editando.set(plan?.idPlan ?? null);
    this.formulario.set(plan
      ? { codigo: plan.codigo, nombre: plan.nombre, descripcion: plan.descripcion, precioMensual: plan.precioMensual, maxSucursales: plan.maxSucursales,
          maxUsuarios: plan.maxUsuarios, maxProductos: plan.maxProductos, permiteIA: plan.permiteIA, permiteOffline: plan.permiteOffline,
          permiteMultiSucursal: plan.permiteMultiSucursal, orden: plan.orden, activo: plan.activo }
      : { codigo: '', nombre: '', descripcion: '', precioMensual: 0, maxSucursales: 1, maxUsuarios: 2, maxProductos: 50, permiteIA: false,
          permiteOffline: false, permiteMultiSucursal: false, orden: this.planes().length + 1, activo: true });
  }

  async guardar(f: PlanIn): Promise<void> {
    const { plan, campo, error } = await this.platformService.guardarPlan(f, this.editando());
    this.campo.set(campo);
    this.error.set(error);
    if (plan) {
      this.formulario.set(null);
      await this.cargar();
    }
  }

  async alternar(p: PlanAdmin): Promise<void> {
    const { idPlan, empresas, empresasExcedidas, ...datos } = p;
    await this.platformService.guardarPlan({ ...datos, activo: !p.activo }, idPlan);
    await this.cargar();
  }

  async eliminar(p: PlanAdmin): Promise<void> {
    if (confirm(`¿Eliminar el plan ${p.nombre}?`) && (await this.platformService.eliminarPlan(p.idPlan))) await this.cargar();
  }
}
