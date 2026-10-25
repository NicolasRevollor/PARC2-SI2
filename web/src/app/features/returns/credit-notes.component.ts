import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreditNotesService } from '../../core/services/credit-notes.service';
import { NotaCredito } from '../../core/models';

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  emision: 'Emisión',
  consumo: 'Pago en caja',
  reintegro: 'Reintegro por devolución',
  anulacion: 'Anulación',
  extension: 'Extensión del vencimiento',
};

/**
 * CU7 — Gestionar notas de crédito: consulta con sus movimientos; el
 * Administrador anula (con motivo) o extiende el vencimiento. El canje se
 * hace en Caja como medio de pago.
 */
@Component({
  selector: 'app-credit-notes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="ys-tarjeta p-4"><p class="ys-mini">Saldo vigente</p><p class="text-2xl font-bold text-gray-900">{{ saldoVigente().toLocaleString() }} Bs</p>
          <p class="text-[11px] text-gray-500">{{ contar('Vigente') }} nota(s) por usar</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Usadas</p><p class="text-2xl font-bold text-gray-900">{{ contar('Usada') }}</p></div>
        <div class="ys-tarjeta p-4"><p class="ys-mini">Vencidas o anuladas</p><p class="text-2xl font-bold text-gray-900">{{ contar('Vencida') + contar('Anulada') }}</p></div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button *ngFor="let e of estados" (click)="filtro.set(e)" class="ys-opcion" [class.ys-opcion-activa]="filtro() === e">{{ e || 'Todas' }}</button>
        <input type="text" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" placeholder="Código o cliente…" class="ys-filtro ml-auto" />
      </div>

      <div class="ys-tarjeta overflow-hidden">
        <div *ngIf="cargando()" class="p-8 text-center text-sm text-gray-500">Cargando notas…</div>
        <div *ngIf="!cargando() && visibles().length === 0" class="p-8 text-center text-sm text-gray-500">No hay notas de crédito.</div>
        <div *ngFor="let n of visibles()" class="border-b border-gray-100">
          <div class="px-5 py-3 flex flex-wrap items-center gap-3 text-xs cursor-pointer hover:bg-gray-50" (click)="abierta.set(abierta() === n.idNotaCredito ? null : n.idNotaCredito)">
            <div class="flex-1 min-w-52">
              <p class="text-sm font-bold text-gray-900 font-mono">{{ n.codigo }} <span class="font-sans font-normal text-gray-500">· {{ n.cliente_nombre }}</span></p>
              <p class="text-gray-500">{{ n.motivo }}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold text-gray-900">{{ n.saldo.toFixed(2) }} Bs</p>
              <p class="text-gray-500">de {{ n.monto.toFixed(2) }} · vence {{ n.fechaVencimiento | date: 'dd/MM/yyyy' }}</p>
            </div>
            <span class="ys-chip" [ngClass]="clase(n.estado)">{{ n.estado }}</span>
          </div>
          <div *ngIf="abierta() === n.idNotaCredito" class="px-5 pb-4 text-xs space-y-3">
            <p *ngIf="n.motivoAnulacion" class="text-rose-600">Anulada: {{ n.motivoAnulacion }}</p>
            <table class="w-full">
              <tr *ngFor="let m of n.movimientos" class="border-t border-gray-100">
                <td class="py-1.5 text-gray-500 whitespace-nowrap">{{ m.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="py-1.5 text-gray-900">{{ etiquetaMovimiento(m.tipo) }}<span *ngIf="m.idVenta"> · venta #{{ m.idVenta }}</span>
                  <span *ngIf="m.montoComplemento > 0" class="text-gray-500"> (+ Bs {{ m.montoComplemento.toFixed(2) }} con {{ m.metodoComplemento }})</span>
                  <span *ngIf="m.detalle" class="text-gray-500"> · {{ m.detalle }}</span></td>
                <td class="py-1.5 text-right">{{ m.monto ? m.monto.toFixed(2) + ' Bs' : '' }}</td>
                <td class="py-1.5 text-right text-gray-500">saldo {{ m.saldoResultante.toFixed(2) }}</td>
                <td class="py-1.5 text-right text-gray-400">{{ m.usuario }}</td>
              </tr>
            </table>
            <div *ngIf="esAdmin && n.estado !== 'Anulada'" class="flex flex-wrap gap-2 items-center">
              <input type="date" [(ngModel)]="nuevaFecha" class="ys-filtro" />
              <button (click)="extender(n)" [disabled]="!nuevaFecha" class="ys-btn-sec">Extender vencimiento</button>
              <button (click)="anular(n)" class="ys-btn-sec text-rose-600">Anular</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CreditNotesComponent implements OnInit {
  /** Anular y extender: solo el Administrador de la empresa (tenant.admin). */
  @Input() esAdmin = false;

  readonly estados = ['', 'Vigente', 'Usada', 'Vencida', 'Anulada'];
  readonly notas = signal<NotaCredito[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly filtro = signal<string>('');
  readonly busqueda = signal<string>('');
  readonly abierta = signal<number | null>(null);
  nuevaFecha = '';

  readonly visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.notas().filter(
      (n) => (!this.filtro() || n.estado === this.filtro()) && (!q || n.codigo.toLowerCase().includes(q) || (n.cliente_nombre ?? '').toLowerCase().includes(q))
    );
  });

  readonly saldoVigente = computed(() => this.notas().filter((n) => n.estado === 'Vigente').reduce((acc, n) => acc + n.saldo, 0));

  constructor(private creditNotesService: CreditNotesService) {}

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.notas.set(await this.creditNotesService.listar());
    this.cargando.set(false);
  }

  contar(estado: string): number {
    return this.notas().filter((n) => n.estado === estado).length;
  }

  etiquetaMovimiento(tipo: string): string {
    return ETIQUETA_MOVIMIENTO[tipo] ?? tipo;
  }

  clase(estado: string): string {
    return estado === 'Vigente' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : estado === 'Usada' ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-rose-50 text-rose-600 border-rose-200';
  }

  private reemplazar(nota: NotaCredito): void {
    this.notas.update((lista) => lista.map((n) => (n.idNotaCredito === nota.idNotaCredito ? nota : n)));
  }

  async anular(nota: NotaCredito): Promise<void> {
    const motivo = prompt(`Motivo de la anulación de ${nota.codigo}:`);
    if (!motivo || motivo.trim().length < 3) return;
    const anulada = await this.creditNotesService.anular(nota.idNotaCredito, motivo.trim());
    if (anulada) this.reemplazar(anulada);
  }

  async extender(nota: NotaCredito): Promise<void> {
    const extendida = await this.creditNotesService.extender(nota.idNotaCredito, this.nuevaFecha);
    if (extendida) {
      this.reemplazar(extendida);
      this.nuevaFecha = '';
    }
  }
}
