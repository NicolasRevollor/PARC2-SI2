import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Nombre de cada caso de uso del informe (sección 2.6). */
export const CASOS_DE_USO: Record<string, string> = {
  CU11: 'Consultar historial y análisis de devoluciones',
  CU12: 'Preparar dispositivo para operación sin conexión',
  CU13: 'Consultar catálogo, precios y existencias sin conexión',
  CU14: 'Registrar venta de contado sin conexión',
  CU15: 'Registrar reserva de prendas sin conexión',
  CU16: 'Consultar operaciones pendientes y resultado de sincronización',
  CU17: 'Sincronizar operaciones pendientes',
  CU18: 'Resolver conflictos de sincronización',
  CU19: 'Registrar cambio de prenda sin conexión',
  CU20: 'Gestionar apertura y cierre de caja',
};

/**
 * Marca visible de un caso de uso: `<app-cu-badge cu="CU14"></app-cu-badge>`.
 * Muestra el código y, al pasar el mouse, el nombre del informe. En el código
 * cada CU se busca con corchetes: [CU14] (docs/TRAZABILIDAD.md).
 */
@Component({
  selector: 'app-cu-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [title]="codigo() + ': ' + nombre()"
          class="inline-flex items-center px-2 py-0.5 rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 text-[10px] font-bold tracking-wide whitespace-nowrap">
      {{ codigo() }}<span *ngIf="conNombre" class="font-medium ml-1.5">{{ nombre() }}</span>
    </span>
  `,
})
export class CuBadgeComponent {
  private readonly cuSignal = signal('');
  readonly codigo = this.cuSignal.asReadonly();
  readonly nombre = computed(() => CASOS_DE_USO[this.cuSignal()] ?? '');

  @Input({ required: true }) set cu(valor: string) {
    this.cuSignal.set(valor);
  }

  /** Muestra también el nombre completo del caso de uso. */
  @Input() conNombre = false;
}
