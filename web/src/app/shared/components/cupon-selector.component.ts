import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cotizacion, CuponesService, ItemCompra } from '../../core/services/cupones.service';
import { CuBadgeComponent } from './cu-badge.component';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU33] Obtener y usar cupon de descuento por compras
// Boundary: SeleccionarCuponUI -> este componente (checkout del cliente y POS)
// Control: POST /api/cupones/cotizar
// ==================================================================
@Component({
  selector: 'app-cupon-selector',
  standalone: true,
  imports: [CommonModule, CuBadgeComponent],
  template: `
    <div *ngIf="cotizacion() as c" class="rounded-xl border p-3 space-y-2" data-testid="cupones"
         [ngClass]="c.cuponesDisponibles.length ? 'border-emerald-300' : 'border-gray-200'">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold text-gray-900 flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[16px] text-emerald-600">sell</span> Cupones de descuento
        </p>
        <app-cu-badge cu="CU33"></app-cu-badge>
      </div>
      <ng-container *ngIf="c.cuponesDisponibles.length; else sinCupones">
        <button *ngFor="let cu of c.cuponesDisponibles" type="button" (click)="elegir(cu.idCupon)" [disabled]="bloqueado"
                class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer disabled:cursor-not-allowed"
                [ngClass]="elegido() === cu.idCupon ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700'"
                [attr.data-testid]="'cupon-' + cu.codigo">
          <span><b class="font-mono">{{ cu.codigo }}</b> · {{ cu.porcentaje }}% de descuento</span>
          <span class="text-[10px] text-gray-500">vence {{ cu.fechaVencimiento | date: 'dd/MM/yyyy' }}</span>
        </button>
        <button *ngIf="elegido()" type="button" (click)="elegir(null)" [disabled]="bloqueado" class="text-[11px] text-gray-500 underline bg-transparent cursor-pointer">No usar cupón</button>
      </ng-container>
      <ng-template #sinCupones>
        <p class="text-[11px] text-gray-500">{{ c.faltan === 3 && c.compras === 0 ? 'Cada 3 compras en esta tienda ganás' : 'Te ' + (c.faltan === 1 ? 'falta 1 compra' : 'faltan ' + c.faltan + ' compras') + ' para ganar' }} un cupón del 30%.</p>
      </ng-template>
      <div *ngIf="c.descuento > 0" class="text-xs space-y-0.5 pt-1 border-t border-gray-100" data-testid="totales-cupon">
        <p class="flex justify-between text-gray-500"><span>Subtotal</span><span>Bs {{ c.subtotal.toFixed(2) }}</span></p>
        <p class="flex justify-between text-emerald-700"><span>Cupón</span><span>− Bs {{ c.descuento.toFixed(2) }}</span></p>
        <p class="flex justify-between font-bold text-gray-900"><span>Total a pagar</span><span>Bs {{ c.total.toFixed(2) }}</span></p>
      </div>
    </div>
  `,
})
export class CuponSelectorComponent implements OnChanges {
  @Input({ required: true }) items: ItemCompra[] = [];
  /** POS: el cliente dueño de los cupones. El cliente en línea usa el suyo. */
  @Input() idCliente: number | null = null;
  @Input() bloqueado = false;
  /** Se emite con cada cambio: el cupón elegido (o null) y el total que cobrará el servidor. */
  @Output() cambio = new EventEmitter<{ idCupon: number | null; total: number; descuento: number; costoEnvio: number | null }>();

  readonly cotizacion = signal<Cotizacion | null>(null);
  readonly elegido = signal<number | null>(null);

  constructor(private cuponesService: CuponesService) {}

  ngOnChanges(): void {
    if (!this.items.length) {
      this.cotizacion.set(null);
      return;
    }
    void this.actualizar(this.elegido());
  }

  async elegir(idCupon: number | null): Promise<void> {
    await this.actualizar(idCupon);
  }

  private async actualizar(idCupon: number | null): Promise<void> {
    let c = await this.cuponesService.cotizar(this.items, idCupon, this.idCliente);
    if (!c && idCupon !== null) {
      // El cupón dejó de valer (otro cliente, otra tienda o vencido): se cotiza sin él.
      idCupon = null;
      c = await this.cuponesService.cotizar(this.items, null, this.idCliente);
    }
    this.cotizacion.set(c);
    this.elegido.set(c ? idCupon : null);
    if (c) this.cambio.emit({ idCupon, total: c.total, descuento: c.descuento, costoEnvio: c.costoEnvio });
  }
}
