import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ETIQUETA_MOTIVO, ETIQUETA_RESULTADO, ETIQUETA_TIPO, ReturnsService } from '../../core/services/returns.service';
import type { ChecklistInspeccion, DevolucionOut, PoliticaDevolucion, ResultadoInspeccion } from '../../core/models';

/**
 * CU3 — Inspeccionar estado de la prenda devuelta (Encargado de sucursal).
 *
 * Lista de verificación, código escaneado de la etiqueta, fotos y resultado.
 * La decisión final (aprobar, rechazar, descuento por deterioro, revisión del
 * Administrador si el cliente no está de acuerdo) la toma el servidor con la
 * política vigente de la venta.
 */
@Component({
  selector: 'app-return-inspect',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ys-modal">
      <div class="ys-modal-caja max-w-xl space-y-4">
        <button (click)="cerrar.emit()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div>
          <span class="ys-mini text-indigo-600">CU3 · Inspección · {{ caso.codigo }}</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">{{ caso.producto_nombre }} · talla {{ caso.tallaOriginal }} · {{ caso.producto_color }}</h3>
          <p class="text-xs text-gray-500 mt-1">
            {{ caso.cliente_nombre }} · {{ caso.cantidad }} u. · {{ motivoTexto() }} · pide {{ tipoTexto() }}
          </p>
          <p *ngIf="caso.motivo" class="text-xs text-gray-500">"{{ caso.motivo }}"</p>
        </div>

        <div>
          <p class="ys-etiqueta">Lista de verificación</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <label *ngFor="let item of items" class="flex items-center gap-2 text-xs text-gray-700 p-2 rounded-lg border border-gray-200 cursor-pointer">
              <input type="checkbox" [ngModel]="checklist()[item[0]]" (ngModelChange)="marcar(item[0], $event)" /> {{ item[1] }}
            </label>
          </div>
        </div>

        <div>
          <p class="ys-etiqueta">Código de la etiqueta (escaneado)</p>
          <input type="text" [(ngModel)]="codigoEscaneado" placeholder="YS-000123" class="ys-campo font-mono uppercase" />
          <p class="text-[11px] text-gray-500 mt-1">Si no coincide con la prenda vendida, la inspección queda como "No corresponde".</p>
        </div>

        <div>
          <p class="ys-etiqueta">Resultado</p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button *ngFor="let r of resultados" type="button" (click)="resultado.set(r)" class="ys-opcion" [class.ys-opcion-activa]="resultado() === r">
              {{ etiquetaResultado(r) }}
            </button>
          </div>
          <p class="text-[11px] mt-1" [ngClass]="aviso().tono">{{ aviso().texto }}</p>
        </div>

        <label *ngIf="resultado() === 'deteriorada' && politica?.accionDeterioro === 'descuento'"
               class="flex items-start gap-2 text-xs text-gray-700 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
          <input type="checkbox" [ngModel]="aceptaDescuento()" (ngModelChange)="aceptaDescuento.set($event)" class="mt-0.5" />
          El cliente acepta un descuento por deterioro del {{ politica?.descuentoDeterioroPct }}%
          (Bs {{ descuento().toFixed(2) }} menos a su favor).
        </label>

        <div *ngIf="caso.cantidad > 1">
          <p class="ys-etiqueta">Unidades aprobadas</p>
          <input type="number" min="0" [max]="caso.cantidad" [(ngModel)]="cantidadAprobada" class="ys-campo w-28" />
          <p class="text-[11px] text-gray-500 mt-1">Las unidades no aprobadas quedan rechazadas en un caso aparte.</p>
        </div>

        <div>
          <p class="ys-etiqueta">Observaciones</p>
          <textarea rows="2" [(ngModel)]="notas" maxlength="255" class="ys-campo"></textarea>
        </div>

        <div>
          <p class="ys-etiqueta">Fotos (opcional)</p>
          <input type="file" accept="image/*" (change)="subir($event)" class="text-xs text-gray-600 mt-1" />
          <div class="flex gap-2 mt-2" *ngIf="fotos().length">
            <img *ngFor="let f of fotos()" [src]="f" alt="Foto de la prenda" class="w-14 h-14 object-cover rounded border border-gray-200" />
          </div>
        </div>

        <div *ngIf="rechazaria()">
          <p class="ys-etiqueta">Motivo del rechazo (lo ve el cliente)</p>
          <input type="text" [(ngModel)]="motivoRechazo" maxlength="255" class="ys-campo" />
        </div>

        <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" [ngModel]="disconforme()" (ngModelChange)="disconforme.set($event)" />
          El cliente no acepta el resultado: pasar a revisión del Administrador
        </label>

        <button (click)="confirmar()" [disabled]="guardando()" class="ys-btn w-full">
          {{ guardando() ? 'Guardando…' : 'Registrar inspección' }}
        </button>
      </div>
    </div>
  `,
})
export class ReturnInspectComponent implements OnInit {
  @Input({ required: true }) caso!: DevolucionOut;
  @Input() politica: PoliticaDevolucion | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() listo = new EventEmitter<DevolucionOut[]>();

  readonly items: [keyof ChecklistInspeccion, string][] = [
    ['etiquetas', 'Etiquetas originales'],
    ['sinUso', 'Sin señales de uso'],
    ['sinManchas', 'Sin manchas ni olores'],
    ['sinRoturas', 'Sin roturas'],
    ['accesorios', 'Accesorios completos'],
  ];
  readonly resultados: ResultadoInspeccion[] = ['apta', 'defectuosa', 'deteriorada', 'no_corresponde'];

  readonly checklist = signal<ChecklistInspeccion>({ etiquetas: false, sinUso: false, sinManchas: false, sinRoturas: false, accesorios: false });
  readonly resultado = signal<ResultadoInspeccion>('apta');
  readonly aceptaDescuento = signal<boolean>(false);
  readonly disconforme = signal<boolean>(false);
  readonly fotos = signal<string[]>([]);
  readonly guardando = signal<boolean>(false);
  codigoEscaneado = '';
  notas = '';
  motivoRechazo = '';
  cantidadAprobada = 1;

  readonly descuento = computed(() => this.caso.valor * (this.politica?.descuentoDeterioroPct ?? 0) / 100);

  readonly rechazaria = computed(() => {
    const r = this.resultado();
    if (r === 'no_corresponde') return true;
    return r === 'deteriorada' && (this.politica?.accionDeterioro !== 'descuento' || !this.aceptaDescuento());
  });

  readonly aviso = computed(() => {
    switch (this.resultado()) {
      case 'apta':
        return { texto: 'Se aprueba y vuelve al stock vendible.', tono: 'text-emerald-700' };
      case 'defectuosa':
        return { texto: 'Se aprueba aunque el motivo fuera otro; va al inventario no vendible y el cliente puede pedir reembolso.', tono: 'text-emerald-700' };
      case 'deteriorada':
        return this.politica?.accionDeterioro === 'descuento'
          ? { texto: 'La política admite aceptarla con descuento si el cliente lo acepta.', tono: 'text-amber-700' }
          : { texto: 'La política rechaza las prendas deterioradas por uso.', tono: 'text-rose-600' };
      default:
        return { texto: 'Se rechaza y la prenda se devuelve al cliente.', tono: 'text-rose-600' };
    }
  });

  constructor(private returnsService: ReturnsService) {}

  ngOnInit(): void {
    this.cantidadAprobada = this.caso.cantidad;
  }

  etiquetaResultado(r: string): string {
    return ETIQUETA_RESULTADO[r] ?? r;
  }

  motivoTexto(): string {
    return ETIQUETA_MOTIVO[this.caso.motivoCategoria ?? ''] ?? 'Sin motivo';
  }

  tipoTexto(): string {
    return (ETIQUETA_TIPO[this.caso.tipo] ?? this.caso.tipo).toLowerCase();
  }

  marcar(item: keyof ChecklistInspeccion, valor: boolean): void {
    const nuevo = { ...this.checklist(), [item]: valor };
    this.checklist.set(nuevo);
    // Sugerencia: con todo en orden, apta; si falta algo, deteriorada.
    if (this.resultado() === 'apta' || this.resultado() === 'deteriorada') {
      this.resultado.set(Object.values(nuevo).every(Boolean) ? 'apta' : 'deteriorada');
    }
  }

  async subir(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    const url = await this.returnsService.subirFoto(archivo);
    if (url) this.fotos.update((f) => [...f, url]);
  }

  async confirmar(): Promise<void> {
    this.guardando.set(true);
    const casos = await this.returnsService.inspeccionar(this.caso.idDevolucion, {
      resultado: this.resultado(),
      checklist: this.checklist(),
      codigoEscaneado: this.codigoEscaneado.trim() || null,
      notasInspeccion: this.notas.trim() || null,
      fotos: this.fotos(),
      cantidadAprobada: this.caso.cantidad > 1 ? this.cantidadAprobada : null,
      aceptaDescuento: this.aceptaDescuento(),
      disconforme: this.disconforme(),
      motivoRechazo: this.motivoRechazo.trim() || null,
    });
    this.guardando.set(false);
    if (casos) this.listo.emit(casos);
  }
}
