import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/services/platform.service';
import { EmpresaOut, PagoSuscripcion } from '../../core/models';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const CLASE_ESTADO: Record<string, string> = {
  Activa: 'border-emerald-300 text-emerald-700',
  PorVencer: 'border-amber-300 text-amber-700',
  Gracia: 'border-orange-300 text-orange-700',
  Suspendida: 'border-rose-300 text-rose-600',
  Cancelada: 'border-gray-300 text-gray-500',
};

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU22] Administrar estado de las suscripciones
// Boundary: SuscripcionesUI -> este componente
// Control: backend/app/routers/platform.py (renovar, suspender, reactivar, cancelar,
//   revisar) y services/suscripciones.py
// ==================================================================
@Component({
  selector: 'app-platform-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Suscripciones</h1>
          <app-cu-badge cu="CU22" [conNombre]="true" class="block mt-1"></app-cu-badge>
          <p class="text-xs text-gray-500 mt-1">
            Al vencer, una suscripción pasa a periodo de gracia ({{ diasGracia }} días, solo consulta) y luego a suspendida.
            La revisión corre sola cada día; también puede ejecutarla ahora.
          </p>
        </div>
        <button (click)="revisar()" [disabled]="trabajando()" class="ys-btn-sec">
          <span class="material-symbols-outlined text-[16px]">event_repeat</span> Revisar vencimientos
        </button>
      </div>

      <div class="flex gap-2 flex-wrap">
        <button *ngFor="let f of filtros" (click)="filtro.set(f.clave)" class="ys-opcion" [ngClass]="{ 'ys-opcion-activa': filtro() === f.clave }">
          {{ f.etiqueta }} ({{ contar(f.clave) }})
        </button>
      </div>

      <div class="ys-tarjeta overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="border-b border-gray-200"><tr class="text-left ys-mini">
            <th class="px-4 py-2.5">Empresa</th><th class="px-4 py-2.5">Plan</th><th class="px-4 py-2.5">Inicio</th>
            <th class="px-4 py-2.5">Vencimiento</th><th class="px-4 py-2.5">Estado</th><th class="px-4 py-2.5 text-right">Acciones</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-100">
            <tr *ngFor="let e of visibles()" data-testid="fila-suscripcion">
              <td class="px-4 py-3"><p class="font-semibold text-gray-900">{{ e.tenant.nombre }}</p>
                <p class="text-[10px] text-gray-400">{{ e.adminCorreo }}</p></td>
              <td class="px-4 py-3 text-gray-700">{{ e.plan.nombre }} · Bs {{ e.suscripcion?.precioMensual }}</td>
              <td class="px-4 py-3 text-gray-700">{{ e.suscripcion?.fechaInicio | date: 'dd/MM/yyyy' }}</td>
              <td class="px-4 py-3 text-gray-700">{{ e.suscripcion?.fechaVencimiento | date: 'dd/MM/yyyy' }}
                <p *ngIf="e.suscripcion?.estadoVisible === 'Gracia'" class="text-[10px] text-orange-700">gracia hasta {{ e.suscripcion?.finGracia | date: 'dd/MM' }}</p></td>
              <td class="px-4 py-3">
                <span class="ys-chip" [ngClass]="clase(e)" data-testid="estado-suscripcion">{{ e.suscripcion?.etiqueta || 'Sin suscripción' }}</span>
                <p *ngIf="e.suscripcion?.motivoSuspension" class="text-[10px] text-gray-400 mt-0.5">{{ e.suscripcion?.motivoSuspension }}</p>
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap space-x-1">
                <button (click)="abrir(e, 'renovar')" class="ys-btn py-1">Renovar</button>
                <ng-container *ngIf="e.tenant.idTenant !== 1">
                  <button *ngIf="e.suscripcion?.estado === 'Suspendida'" (click)="reactivar(e)" class="ys-btn-sec py-1">Reactivar</button>
                  <button *ngIf="e.suscripcion && e.suscripcion.estado !== 'Suspendida' && e.suscripcion.estado !== 'Cancelada'" (click)="abrir(e, 'suspender')" class="ys-btn-sec py-1">Suspender</button>
                  <button *ngIf="e.suscripcion && e.suscripcion.estado !== 'Cancelada'" (click)="abrir(e, 'cancelar')" class="ys-btn-sec py-1">Cancelar</button>
                </ng-container>
                <button (click)="verPagos(e)" class="ys-btn-sec py-1" title="Pagos simulados">Pagos</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p *ngIf="!visibles().length" class="p-6 text-center text-sm text-gray-400">No hay empresas con ese estado.</p>
      </div>
    </div>

    <div *ngIf="accion() as a" class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">{{ titulos[a.tipo] }} · {{ a.empresa.tenant.nombre }}</h3>
        <ng-container *ngIf="a.tipo === 'renovar'">
          <p class="text-xs text-gray-600">Se registra el pago simulado y la suscripción queda activa.</p>
          <label class="block"><span class="ys-mini">Periodo</span>
            <select class="ys-campo" [(ngModel)]="meses" name="meses">
              <option *ngFor="let m of [1, 3, 6, 12]" [ngValue]="m">{{ m }} mes(es) · Bs {{ (a.empresa.suscripcion?.precioMensual || a.empresa.plan.precioMensual) * m }}</option>
            </select></label>
        </ng-container>
        <label *ngIf="a.tipo !== 'renovar'" class="block"><span class="ys-mini">Motivo</span>
          <input class="ys-campo" [(ngModel)]="motivo" name="motivo" placeholder="Falta de pago, a pedido de la empresa…" /></label>
        <p *ngIf="a.tipo === 'suspender'" class="text-xs text-amber-700">Sus usuarios no podrán operar. Lo vendido sin conexión antes de este momento se aceptará al sincronizar.</p>
        <div class="flex gap-2">
          <button (click)="accion.set(null)" class="ys-btn-sec flex-1">Volver</button>
          <button (click)="confirmar(a.empresa, a.tipo)" [disabled]="trabajando() || (a.tipo !== 'renovar' && motivo.trim().length < 3)" class="ys-btn flex-1">Confirmar</button>
        </div>
      </div>
    </div>

    <div *ngIf="pagos() as p" class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-2">
        <h3 class="text-lg font-bold text-gray-900">Pagos simulados</h3>
        <p *ngIf="!p.length" class="text-sm text-gray-400">Sin renovaciones registradas.</p>
        <p *ngFor="let x of p" class="flex justify-between text-xs text-gray-700 border-b border-gray-100 py-1">
          <span>{{ x.fecha | date: 'dd/MM/yyyy' }} · {{ x.meses }} mes(es)</span><span>Bs {{ x.monto }} · hasta {{ x.vencimientoNuevo | date: 'dd/MM/yyyy' }}</span>
        </p>
        <button (click)="pagos.set(null)" class="ys-btn w-full">Cerrar</button>
      </div>
    </div>
  `,
})
export class PlatformSubscriptionsComponent implements OnInit {
  readonly diasGracia = 7;
  readonly filtros = [
    { clave: 'todas', etiqueta: 'Todas' },
    { clave: 'Activa', etiqueta: 'Activas' },
    { clave: 'PorVencer', etiqueta: 'Por vencer' },
    { clave: 'Gracia', etiqueta: 'En periodo de gracia' },
    { clave: 'Suspendida', etiqueta: 'Suspendidas' },
    { clave: 'Cancelada', etiqueta: 'Canceladas' },
  ];
  readonly titulos: Record<string, string> = { renovar: 'Renovar', suspender: 'Suspender', cancelar: 'Cancelar' };
  readonly filtro = signal('todas');
  readonly trabajando = signal(false);
  readonly accion = signal<{ empresa: EmpresaOut; tipo: 'renovar' | 'suspender' | 'cancelar' } | null>(null);
  readonly pagos = signal<PagoSuscripcion[] | null>(null);
  meses = 1;
  motivo = '';

  readonly visibles = computed(() =>
    this.platformService.empresas().filter(e => this.filtro() === 'todas' || e.suscripcion?.estadoVisible === this.filtro()),
  );

  constructor(public platformService: PlatformService) {}

  ngOnInit(): void {
    void this.platformService.suscripciones();
  }

  contar(clave: string): number {
    return this.platformService.empresas().filter(e => clave === 'todas' || e.suscripcion?.estadoVisible === clave).length;
  }

  clase(e: EmpresaOut): string {
    return CLASE_ESTADO[e.suscripcion?.estadoVisible ?? ''] ?? 'border-gray-300 text-gray-500';
  }

  abrir(empresa: EmpresaOut, tipo: 'renovar' | 'suspender' | 'cancelar'): void {
    this.meses = 1;
    this.motivo = '';
    this.accion.set({ empresa, tipo });
  }

  async confirmar(empresa: EmpresaOut, tipo: 'renovar' | 'suspender' | 'cancelar'): Promise<void> {
    this.trabajando.set(true);
    const cuerpo = tipo === 'renovar' ? { meses: this.meses } : { motivo: this.motivo.trim() };
    if (await this.platformService.accionSuscripcion(empresa.tenant.idTenant, tipo, cuerpo)) this.accion.set(null);
    this.trabajando.set(false);
  }

  async reactivar(empresa: EmpresaOut): Promise<void> {
    this.trabajando.set(true);
    await this.platformService.accionSuscripcion(empresa.tenant.idTenant, 'reactivar');
    this.trabajando.set(false);
  }

  async verPagos(empresa: EmpresaOut): Promise<void> {
    this.pagos.set(await this.platformService.pagos(empresa.tenant.idTenant));
  }

  async revisar(): Promise<void> {
    this.trabajando.set(true);
    const r = await this.platformService.revisarVencimientos();
    if (r) await this.platformService.suscripciones();
    this.trabajando.set(false);
  }
}
