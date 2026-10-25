import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ETIQUETA_REEMBOLSO, ReturnsService } from '../../core/services/returns.service';
import { DevolucionOut } from '../../core/models';

/**
 * CU6 flujos alternativos 3 y 4: reembolsos con tarjeta que la pasarela no
 * confirmó (se reintentan) y transferencias que esperan su comprobante.
 */
@Component({
  selector: 'app-return-refunds',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ys-tarjeta overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-100">
        <p class="text-sm font-bold text-gray-900">Reembolsos pendientes</p>
        <p class="text-xs text-gray-500">Tarjeta sin confirmar por la pasarela y transferencias sin comprobante.</p>
      </div>
      <div *ngIf="cargando()" class="p-8 text-center text-sm text-gray-500">Cargando…</div>
      <div *ngIf="!cargando() && casos().length === 0" class="p-8 text-center text-sm text-gray-500">No hay reembolsos pendientes.</div>
      <div *ngFor="let c of casos()" class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3 text-xs">
        <div class="flex-1 min-w-60">
          <p class="text-sm font-semibold text-gray-900"><span class="font-mono">{{ c.codigo }}</span> · {{ c.cliente_nombre }}</p>
          <p class="text-gray-500">Bs {{ c.montoDevuelto.toFixed(2) }} · {{ c.metodoReembolso }} · {{ etiqueta(c.estadoReembolso) }}
            <span *ngIf="c.cuentaDestino"> · cuenta {{ c.cuentaDestino }}</span></p>
          <p *ngIf="c.referenciaReembolso" class="text-gray-400">{{ c.referenciaReembolso }}</p>
        </div>
        <button *ngIf="c.metodoReembolso === 'tarjeta'" (click)="reintentar(c)" class="ys-btn-sec">
          <span class="material-symbols-outlined text-[16px]">refresh</span> Reintentar
        </button>
        <button *ngIf="c.estadoReembolso === 'TransferenciaPendiente'" (click)="confirmar(c)" class="ys-btn">
          <span class="material-symbols-outlined text-[16px]">receipt</span> Adjuntar comprobante
        </button>
      </div>
    </div>
  `,
})
export class ReturnRefundsComponent implements OnInit {
  @Output() cambio = new EventEmitter<void>();
  readonly casos = signal<DevolucionOut[]>([]);
  readonly cargando = signal<boolean>(false);

  constructor(private returnsService: ReturnsService) {}

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.casos.set(await this.returnsService.reembolsosPendientes());
    this.cargando.set(false);
  }

  etiqueta(estado: string | null): string {
    return ETIQUETA_REEMBOLSO[estado ?? ''] ?? estado ?? '';
  }

  async reintentar(caso: DevolucionOut): Promise<void> {
    if (await this.returnsService.reintentarReembolso(caso.idDevolucion)) {
      await this.cargar();
      this.cambio.emit();
    }
  }

  async confirmar(caso: DevolucionOut): Promise<void> {
    const comprobante = prompt(`Número de comprobante de la transferencia de ${caso.codigo}:`);
    if (!comprobante?.trim()) return;
    if (await this.returnsService.confirmarTransferencia(caso.idDevolucion, comprobante.trim())) {
      await this.cargar();
      this.cambio.emit();
    }
  }
}
