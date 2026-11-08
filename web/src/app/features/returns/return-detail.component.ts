import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO,
  ETIQUETA_REEMBOLSO,
  ETIQUETA_RESULTADO,
  ETIQUETA_TIPO,
  ReturnsService,
  claseEstado,
} from '../../core/services/returns.service';
import { DevolucionDetalle, QrDevolucion, ViajeDomicilio } from '../../core/models';
import { QrCodeComponent } from '../../shared/components/qr-code.component';
import { NotaDevolucionComponent } from '../../shared/components/nota-devolucion.component';
import { ETIQUETA_FRANJA } from '../../core/services/returns.service';

/** Detalle completo de un caso con su línea de tiempo (CU11 paso 5) y su QR. */
@Component({
  selector: 'app-return-detail',
  standalone: true,
  imports: [CommonModule, QrCodeComponent, NotaDevolucionComponent],
  template: `
    <div class="ys-modal">
      <div class="ys-modal-caja max-w-3xl">
        <button (click)="cerrar.emit()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div *ngIf="!caso()" class="p-8 text-center text-sm text-gray-500">Cargando…</div>
        <div *ngIf="caso() as c" class="space-y-5">
          <div class="flex flex-col sm:flex-row gap-5">
            <div class="flex-1 space-y-1">
              <span class="ys-mini text-indigo-600">{{ c.origen === 'en_linea' ? 'Solicitud en línea' : 'Solicitud en tienda' }}</span>
              <h3 class="text-xl font-bold text-gray-900 font-mono">{{ c.codigo }}</h3>
              <span class="ys-chip" [ngClass]="clase(c.estado)">{{ etiqueta(estados, c.estado) }}</span>
              <p class="text-sm text-gray-700 pt-2">{{ c.producto_nombre }} · talla {{ c.tallaOriginal }} · {{ c.producto_color }} · {{ c.cantidad }} u.</p>
              <p class="text-xs text-gray-500">{{ c.cliente_nombre }} · venta #{{ c.idVenta }} del {{ c.fechaVenta | date: 'dd/MM/yyyy HH:mm' }}</p>
              <p class="text-xs text-gray-500">Motivo: {{ etiqueta(motivos, c.motivoCategoria || '') }}<span *ngIf="c.motivo"> — "{{ c.motivo }}"</span></p>
              <p class="text-xs text-gray-500">Política: {{ c.politica_version ? 'versión ' + c.politica_version : 'de la plataforma' }}</p>
            </div>
            <div *ngIf="qr() as q" class="text-center">
              <app-qr-code [modulos]="q.modulos" [tamano]="132" [texto]="q.codigo"></app-qr-code>
              <button (click)="comprobante(c.idDevolucion)" class="ys-btn-sec mt-2 w-full">
                <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Comprobante
              </button>
              <!-- [CU7] la nota sale solo si se devolvio dinero -->
              <button *ngIf="c.montoDevuelto > 0" (click)="verNota.set(true)" class="ys-btn mt-2 w-full" data-testid="ver-nota">
                <span class="material-symbols-outlined text-[16px]">receipt_long</span> Nota de devolución
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Resolución</p><p class="font-semibold text-gray-900">{{ etiqueta(tipos, c.tipo) }}</p></div>
            <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Valor a favor</p><p class="font-semibold text-gray-900">Bs {{ c.credito.toFixed(2) }}</p></div>
            <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Inspección</p><p class="font-semibold text-gray-900">{{ c.condicion ? etiqueta(resultados, c.condicion) : '—' }}</p></div>
            <div class="p-2 rounded-lg bg-gray-50 border border-gray-200"><p class="ys-mini">Inventario</p><p class="font-semibold text-gray-900">{{ c.destinoInventario === 'vendible' ? 'Vendible' : c.destinoInventario === 'no_vendible' ? 'No vendible' : '—' }}</p></div>
          </div>

          <div class="text-xs text-gray-700 space-y-1">
            <p *ngIf="c.producto_nuevo_nombre">Entregado: <span class="font-semibold">{{ c.producto_nuevo_nombre }} talla {{ c.tallaNueva }} ({{ c.producto_nuevo_color }})</span>
              <span *ngIf="c.idVentaCambio"> · nueva venta #{{ c.idVentaCambio }}</span></p>
            <p *ngIf="c.medidaNueva">Ajuste: {{ c.medidaOriginal || '—' }} → {{ c.medidaNueva }} · entrega {{ c.fechaEntregaAjuste | date: 'dd/MM/yyyy' }}</p>
            <p *ngIf="c.diferencia !== 0">Diferencia {{ c.diferencia > 0 ? 'cobrada' : 'a favor' }}: Bs {{ (c.diferencia > 0 ? c.diferencia : -c.diferencia).toFixed(2) }}</p>
            <p *ngIf="c.montoDevuelto > 0">Reembolso: Bs {{ c.montoDevuelto.toFixed(2) }} · {{ c.metodoReembolso }} · {{ etiqueta(reembolsos, c.estadoReembolso || '') }}
              <span *ngIf="c.referenciaReembolso" class="font-mono"> · {{ c.referenciaReembolso }}</span></p>
            <p *ngIf="c.estado === 'CambioPendiente'" class="text-amber-700">
              {{ c.opcionSinStock === 'espera' ? 'En lista de espera' : 'Apartada en ' + (c.sucursal_entrega_nombre || '—') }}
              <span *ngIf="c.fechaLimiteRetiro"> · retirar hasta el {{ c.fechaLimiteRetiro | date: 'dd/MM/yyyy' }}</span>
              <span *ngIf="c.stockDisponibleReemplazo"> · ya hay {{ c.stockDisponibleReemplazo }} en la sucursal</span>
            </p>
            <p *ngIf="c.fechaLimiteEntrega && c.estado === 'PendienteEntrega'" class="text-amber-700">
              Entregar en {{ c.sucursal_nombre }} hasta el {{ c.fechaLimiteEntrega | date: 'dd/MM/yyyy HH:mm' }}</p>
            <p *ngIf="c.motivoRechazo" class="text-rose-600">{{ c.motivoRechazo }}</p>
            <p *ngIf="c.requiereAutorizacion" class="text-amber-700">{{ c.motivoAutorizacion }}
              <span *ngIf="c.autorizador_nombre"> · autorizó {{ c.autorizador_nombre }}</span></p>
          </div>

          <!-- [CU31] [CU32] recojo y entrega a domicilio -->
          <div *ngIf="viajes().length" class="space-y-1" data-testid="viajes-caso">
            <p class="ys-etiqueta">Delivery <span class="text-gray-400 font-normal normal-case">(Bs {{ c.costoDomicilio.toFixed(2) }} a cargo del cliente)</span></p>
            <p *ngFor="let v of viajes()" class="text-xs text-gray-700">
              <span class="font-semibold">{{ v.tipo === 'recojo' ? 'Recojo' : 'Entrega' }}:</span> {{ v.estado }}
              <span *ngIf="v.fechaProgramada"> · {{ v.fechaProgramada | date: 'dd/MM' }} {{ franja(v.franja) }} · {{ v.repartidor }}</span>
              · {{ v.direccion }}
            </p>
          </div>

          <div *ngIf="c.fotos.length" class="flex gap-2 flex-wrap">
            <a *ngFor="let f of c.fotos" [href]="f" target="_blank" rel="noopener"><img [src]="f" alt="Foto de la prenda" class="w-16 h-16 object-cover rounded border border-gray-200" /></a>
          </div>

          <div>
            <p class="ys-etiqueta mb-2">Línea de tiempo</p>
            <ol class="relative border-l border-gray-200 ml-2 space-y-3">
              <li *ngFor="let e of c.lineaTiempo" class="ml-4">
                <span class="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-indigo-600"></span>
                <p class="text-[11px] text-gray-500">{{ e.fecha | date: 'dd/MM/yyyy HH:mm' }} · <span class="font-bold uppercase">{{ e.etapa }}</span>
                  <span *ngIf="e.usuario"> · {{ e.usuario }}</span></p>
                <p class="text-xs text-gray-800">{{ e.detalle }}</p>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
    <app-nota-devolucion *ngIf="verNota()" [idDevolucion]="idDevolucion" (cerrar)="verNota.set(false)"></app-nota-devolucion>
  `,
})
export class ReturnDetailComponent implements OnInit {
  @Input({ required: true }) idDevolucion!: number;
  @Output() cerrar = new EventEmitter<void>();

  readonly estados = ETIQUETA_ESTADO;
  readonly motivos = ETIQUETA_MOTIVO;
  readonly tipos = ETIQUETA_TIPO;
  readonly resultados = ETIQUETA_RESULTADO;
  readonly reembolsos = ETIQUETA_REEMBOLSO;
  readonly caso = signal<DevolucionDetalle | null>(null);
  readonly qr = signal<QrDevolucion | null>(null);
  readonly viajes = signal<ViajeDomicilio[]>([]);
  readonly verNota = signal(false);

  constructor(private returnsService: ReturnsService) {}

  async ngOnInit(): Promise<void> {
    const [caso, qr] = await Promise.all([
      this.returnsService.detalleCaso(this.idDevolucion),
      this.returnsService.qr(this.idDevolucion),
    ]);
    this.caso.set(caso);
    this.qr.set(qr);
    if (caso?.modalidadEntrega === 'domicilio') this.viajes.set(await this.returnsService.viajesDelCaso(this.idDevolucion));
  }

  franja(clave: string | null): string {
    return clave ? ETIQUETA_FRANJA[clave] ?? clave : '';
  }

  etiqueta(mapa: Record<string, string>, valor: string): string {
    return mapa[valor] ?? valor;
  }

  clase(estado: string): string {
    return claseEstado(estado);
  }

  comprobante(id: number): void {
    void this.returnsService.abrirComprobante(id);
  }
}
