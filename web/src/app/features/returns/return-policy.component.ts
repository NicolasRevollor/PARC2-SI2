import { Component, EventEmitter, Input, OnChanges, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService } from '../../core/services/archive.service';
import { ReturnsService, textoPlazo } from '../../core/services/returns.service';
import { PoliticaDevolucion } from '../../core/models';

/**
 * CU9 — Configurar política de devoluciones y cambios (Administrador).
 *
 * Cada guardado crea una NUEVA versión vigente desde ese momento: las ventas
 * anteriores conservan la versión con la que se vendieron. Sin versión,
 * rige la política por defecto de la plataforma.
 */
@Component({
  selector: 'app-return-policy',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="p() as p" class="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div class="xl:col-span-2 ys-tarjeta p-6 space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-gray-900">Política de devoluciones y cambios</h2>
            <p class="text-xs text-gray-500 mt-1">
              {{ p.version ? 'Versión ' + p.version + ' vigente desde el ' + (p.vigenteDesde | date: 'dd/MM/yyyy HH:mm') + (p.creadoPor ? ' · ' + p.creadoPor : '')
                 : 'Política por defecto de la plataforma (la empresa todavía no configuró una).' }}
            </p>
          </div>
          <span *ngIf="!editable" class="ys-chip text-gray-500 border-gray-200">Solo lectura</span>
        </div>

        <fieldset [disabled]="!editable" class="space-y-6">
          <section class="space-y-3">
            <p class="ys-etiqueta">Plazos</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label class="text-xs text-gray-700">Plazo de cambio (horas desde la entrega)
                <input type="number" min="1" max="720" [(ngModel)]="p.plazoCambioHoras" class="ys-campo" />
                <span class="text-[11px] text-gray-500">{{ plazo(p.plazoCambioHoras) }}</span>
                <span *ngIf="errores()['plazoCambioHoras']" class="block text-[11px] text-rose-600">{{ errores()['plazoCambioHoras'] }}</span></label>
              <label class="text-xs text-gray-700">Plazo de garantía por defecto de fábrica (días)
                <input type="number" min="1" max="730" [(ngModel)]="p.plazoGarantiaDias" class="ys-campo" />
                <span *ngIf="errores()['plazoGarantiaDias']" class="block text-[11px] text-rose-600">{{ errores()['plazoGarantiaDias'] }}</span></label>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <label class="text-xs text-gray-700 sm:col-span-1">Fuera de plazo
                <select [(ngModel)]="p.accionFueraPlazo" class="ys-campo"><option value="rechazar">Rechazar</option><option value="recargo">Aplicar recargo</option></select></label>
              <ng-container *ngIf="p.accionFueraPlazo === 'recargo'">
                <label class="text-xs text-gray-700">Recargo
                  <select [(ngModel)]="p.recargoTipo" class="ys-campo"><option value="porcentaje">Porcentaje</option><option value="monto">Monto (Bs)</option></select></label>
                <label class="text-xs text-gray-700">Valor
                  <input type="number" min="0" step="0.5" [(ngModel)]="p.recargoValor" class="ys-campo" />
                  <span *ngIf="errores()['recargoValor']" class="block text-[11px] text-rose-600">{{ errores()['recargoValor'] }}</span></label>
                <label class="text-xs text-gray-700">Por cada
                  <select [(ngModel)]="p.recargoUnidad" class="ys-campo"><option value="dia">Día de demora</option><option value="hora">Hora de demora</option></select></label>
              </ng-container>
            </div>
          </section>

          <section class="space-y-3">
            <p class="ys-etiqueta">Reglas</p>
            <div>
              <p class="text-xs text-gray-700">Categorías no retornables (solo por defecto de fábrica)</p>
              <div class="flex flex-wrap gap-2 mt-1">
                <label *ngFor="let c of categorias()" class="flex items-center gap-1.5 text-xs text-gray-700 px-2 py-1 rounded border border-gray-200 cursor-pointer">
                  <input type="checkbox" [checked]="p.categoriasNoRetornables.includes(c)" (change)="alternarCategoria(c)" /> {{ c }}
                </label>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="text-xs text-gray-700">Máximo de cambios por prenda<input type="number" min="1" [(ngModel)]="p.maxCambiosPorPrenda" class="ys-campo" /></label>
              <label class="text-xs text-gray-700">Máximo de devoluciones por cliente al mes<input type="number" min="1" [(ngModel)]="p.maxDevolucionesMes" class="ys-campo" /></label>
              <label class="text-xs text-gray-700">Umbral de autorización del Encargado (Bs)<input type="number" min="0" [(ngModel)]="p.umbralAutorizacion" class="ys-campo" /></label>
            </div>
            <label class="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" [(ngModel)]="p.respetarPrecioOriginal" />
              Respetar el precio original en cambios del mismo modelo (no cobrar aumentos generales de precio)</label>
          </section>

          <section class="space-y-3">
            <p class="ys-etiqueta">Saldo a favor y notas de crédito</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="text-xs text-gray-700">Saldo a favor se entrega como
                <select [(ngModel)]="p.saldoAFavor" class="ys-campo"><option value="cliente_elige">Lo elige el cliente</option>
                  <option value="nota_credito">Nota de crédito</option><option value="reembolso">Dinero</option></select>
                <span *ngIf="errores()['saldoAFavor']" class="block text-[11px] text-rose-600">{{ errores()['saldoAFavor'] }}</span></label>
              <label class="text-xs text-gray-700">Validez de las notas (días)<input type="number" min="1" [(ngModel)]="p.vigenciaNotaCreditoDias" class="ys-campo" /></label>
              <label class="flex items-center gap-2 text-xs text-gray-700 mt-5"><input type="checkbox" [(ngModel)]="p.permiteReembolso" /> Se devuelve dinero</label>
            </div>
          </section>

          <section class="space-y-3">
            <p class="ys-etiqueta">Inspección y ajustes</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="text-xs text-gray-700">Prenda deteriorada por uso
                <select [(ngModel)]="p.accionDeterioro" class="ys-campo"><option value="rechazar">Rechazar</option><option value="descuento">Aceptar con descuento</option></select></label>
              <label *ngIf="p.accionDeterioro === 'descuento'" class="text-xs text-gray-700">Descuento por deterioro (%)
                <input type="number" min="0" max="100" [(ngModel)]="p.descuentoDeterioroPct" class="ys-campo" /></label>
              <label class="text-xs text-gray-700">Costo del ajuste de medida fuera de plazo (Bs)
                <input type="number" min="0" [(ngModel)]="p.costoAjusteMedida" class="ys-campo" /></label>
            </div>
          </section>

          <section class="space-y-3">
            <p class="ys-etiqueta">Tienda en línea y cambios pendientes</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="flex items-center gap-2 text-xs text-gray-700 mt-5"><input type="checkbox" [(ngModel)]="p.permiteSolicitudEnLinea" /> Recibir solicitudes en línea</label>
              <label class="text-xs text-gray-700">Días para entregar la prenda<input type="number" min="1" [(ngModel)]="p.diasEntregaEnLinea" class="ys-campo" /></label>
              <label class="text-xs text-gray-700">Días para retirar un cambio apartado<input type="number" min="1" [(ngModel)]="p.diasRetiroCambio" class="ys-campo" /></label>
            </div>
          </section>

          <label class="block text-xs text-gray-700">Condiciones que ve el cliente
            <textarea rows="3" maxlength="1000" [(ngModel)]="p.condiciones" class="ys-campo"></textarea></label>
        </fieldset>

        <div *ngIf="editable" class="flex flex-wrap items-center gap-3">
          <button (click)="guardar(p)" [disabled]="guardando()" class="ys-btn">{{ guardando() ? 'Guardando…' : 'Guardar como nueva versión' }}</button>
          <p class="text-[11px] text-gray-500">Las ventas realizadas antes conservan la versión vigente al momento de la venta.</p>
        </div>
      </div>

      <div class="ys-tarjeta p-5 space-y-3 h-fit">
        <p class="ys-etiqueta">Versiones</p>
        <p *ngIf="!versiones().length" class="text-xs text-gray-500">Ninguna: rige la política de la plataforma.</p>
        <div *ngFor="let v of versiones()" class="text-xs border-b border-gray-100 pb-2">
          <p class="font-semibold text-gray-900">Versión {{ v.version }}</p>
          <p class="text-gray-500">Desde {{ v.vigenteDesde | date: 'dd/MM/yyyy HH:mm' }} · {{ v.creadoPor }}</p>
          <p class="text-gray-500">Plazo {{ plazo(v.plazoCambioHoras) }} · garantía {{ v.plazoGarantiaDias }} días · fuera de plazo: {{ v.accionFueraPlazo }}</p>
        </div>
      </div>
    </div>
  `,
})
export class ReturnPolicyComponent implements OnChanges, OnInit {
  @Input() politica: PoliticaDevolucion | null = null;
  @Input() editable = false;
  @Output() guardada = new EventEmitter<PoliticaDevolucion>();

  readonly p = signal<PoliticaDevolucion | null>(null);
  readonly errores = signal<Record<string, string>>({});
  readonly versiones = signal<PoliticaDevolucion[]>([]);
  readonly guardando = signal<boolean>(false);

  readonly categorias = computed(() => {
    const tipos = new Set(this.archiveService.products().map((p) => p.tipo).filter((t): t is string => !!t));
    for (const c of this.p()?.categoriasNoRetornables ?? []) tipos.add(c);
    return [...tipos].sort();
  });

  constructor(
    private returnsService: ReturnsService,
    private archiveService: ArchiveService,
  ) {}

  ngOnInit(): void {
    if (this.archiveService.products().length < 2) void this.archiveService.loadProducts({ size: 100 });
    if (this.editable) void this.returnsService.versionesPolitica().then((v) => this.versiones.set(v));
  }

  ngOnChanges(): void {
    this.p.set(this.politica ? { ...this.politica, categoriasNoRetornables: [...this.politica.categoriasNoRetornables] } : null);
  }

  plazo(horas: number): string {
    return textoPlazo(horas);
  }

  alternarCategoria(categoria: string): void {
    const p = this.p();
    if (!p) return;
    p.categoriasNoRetornables = p.categoriasNoRetornables.includes(categoria)
      ? p.categoriasNoRetornables.filter((c) => c !== categoria)
      : [...p.categoriasNoRetornables, categoria];
  }

  async guardar(p: PoliticaDevolucion): Promise<void> {
    this.guardando.set(true);
    const r = await this.returnsService.guardarPolitica(p);
    this.guardando.set(false);
    if ('plazoCambioHoras' in r) {
      this.errores.set({});
      this.versiones.set(await this.returnsService.versionesPolitica());
      this.guardada.emit(r as PoliticaDevolucion);
    } else {
      this.errores.set(r as Record<string, string>);
    }
  }
}
