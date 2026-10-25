import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { ETIQUETA_MOTIVO, ETIQUETA_TIPO, ReturnsService } from '../../core/services/returns.service';
import { DevolucionOut, LineaDevolucion, MotivoDevolucion, TipoDevolucion, VentaDevolucion } from '../../core/models';

/**
 * CU1 — Registrar solicitud de devolución o cambio en tienda.
 *
 * Se identifica la venta (número de comprobante, su QR o el cliente), se
 * eligen las prendas, el motivo y la resolución que pide el cliente. El
 * servidor valida la elegibilidad contra la política vigente al momento de
 * la venta y deja cada prenda "En inspección" (CU3).
 */
@Component({
  selector: 'app-return-new',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ys-modal">
      <div class="ys-modal-caja max-w-3xl space-y-5">
        <button (click)="cerrar.emit()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div>
          <span class="ys-mini text-indigo-600">CU1 · Nueva solicitud en tienda</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">Registrar devolución o cambio</h3>
          <p class="text-xs text-gray-500 mt-1">Buscá la venta por el número del comprobante (o escaneando su QR) o por el cliente.</p>
        </div>

        <!-- Paso 2-3: identificar la venta -->
        <div class="flex gap-2">
          <input type="text" [(ngModel)]="busqueda" (keyup.enter)="buscar()" placeholder="N.º de comprobante, nombre, teléfono o correo del cliente"
                 class="ys-campo mt-0 flex-1" autofocus />
          <button (click)="buscar()" [disabled]="buscando() || busqueda.trim().length < 1" class="ys-btn">
            <span class="material-symbols-outlined text-[16px]">search</span> Buscar
          </button>
        </div>

        <div *ngIf="!venta() && ventas().length > 0" class="space-y-2 max-h-72 overflow-y-auto">
          <button *ngFor="let v of ventas()" (click)="elegir(v)"
                  class="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-200 bg-transparent cursor-pointer">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-gray-900">Venta #{{ v.idVenta }} · {{ v.cliente }}</p>
              <span class="ys-chip" [ngClass]="v.estadoDevolucion === 'Sin devoluciones' ? 'text-gray-500 border-gray-200' : 'text-amber-700 border-amber-200'">
                {{ v.estadoDevolucion }}</span>
            </div>
            <p class="text-xs text-gray-500">{{ v.fecha | date: 'dd/MM/yyyy HH:mm' }} · {{ v.sucursal }} · {{ v.formaPago }} · Bs {{ v.total.toFixed(2) }}</p>
          </button>
        </div>

        <!-- Paso 4: detalle de la venta -->
        <ng-container *ngIf="venta() as v">
          <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 grid grid-cols-2 gap-x-4 gap-y-1">
            <p><span class="font-semibold">Venta:</span> #{{ v.idVenta }} del {{ v.fecha | date: 'dd/MM/yyyy HH:mm' }}</p>
            <p><span class="font-semibold">Cliente:</span> {{ v.cliente }}</p>
            <p><span class="font-semibold">Sucursal de origen:</span> {{ v.sucursal }}</p>
            <p><span class="font-semibold">Forma de pago:</span> {{ v.formaPago }}</p>
            <p><span class="font-semibold">Estado:</span> {{ v.estadoDevolucion }}</p>
            <p><span class="font-semibold">Política:</span> {{ v.politica_version ? 'versión ' + v.politica_version : 'de la plataforma' }}</p>
            <button (click)="venta.set(null)" class="col-span-2 text-left text-[11px] font-bold uppercase text-indigo-600 bg-transparent border-0 p-0 cursor-pointer">
              Elegir otra venta
            </button>
          </div>

          <div class="space-y-2">
            <p class="ys-etiqueta">Prendas a devolver o cambiar</p>
            <div *ngFor="let l of v.lineas" class="p-3 rounded-lg border flex items-start gap-3"
                 [ngClass]="seleccionada(l) ? 'border-indigo-300' : 'border-gray-200'">
              <input type="checkbox" class="mt-1" [checked]="seleccionada(l)" [disabled]="!seleccionable(l)" (change)="alternar(l)" />
              <div class="flex-1 text-xs">
                <p class="text-sm font-semibold text-gray-900">{{ l.producto }} · talla {{ l.talla }} · {{ l.color }}
                  <span *ngIf="l.recibidaPorCambio" class="ys-chip text-indigo-700 border-indigo-200 ml-1">Recibida por cambio</span></p>
                <p class="text-gray-500">Pagado Bs {{ l.precioPagado.toFixed(2) }} c/u · vendidas {{ l.cantidad }} · ya devueltas o en trámite {{ l.ocupadas }}</p>
                <p [ngClass]="l.elegibilidad.puede ? 'text-emerald-700' : 'text-rose-600'">
                  {{ l.elegibilidad.mensaje }}
                  <span *ngIf="l.elegibilidad.puede && l.elegibilidad.estado === 'en_plazo'"> · quedan {{ l.elegibilidad.horasRestantes.toFixed(1) }} h</span>
                </p>
                <p *ngIf="l.solicitudAbierta" class="text-amber-700">Ya tiene la solicitud {{ l.solicitudAbierta }} abierta.</p>
                <p *ngIf="!l.elegibilidad.puede && motivo() === 'defecto'" class="text-gray-500">
                  Por defecto de fábrica se evalúa con la garantía (hasta el {{ l.elegibilidad.garantiaHasta | date: 'dd/MM/yyyy' }}).
                </p>
              </div>
              <input *ngIf="seleccionada(l)" type="number" min="1" [max]="l.disponibles" [ngModel]="seleccion()[l.idProducto]"
                     (ngModelChange)="fijarCantidad(l, $event)" class="ys-filtro w-16" />
            </div>
          </div>

          <!-- Paso 5: motivo y resolución pedida -->
          <div>
            <p class="ys-etiqueta">Motivo</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              <button *ngFor="let m of motivos" type="button" (click)="motivo.set(m[0])" class="ys-opcion"
                      [class.ys-opcion-activa]="motivo() === m[0]">{{ m[1] }}</button>
            </div>
            <input type="text" [(ngModel)]="detalle" maxlength="255" placeholder="Detalle (opcional)" class="ys-campo" />
          </div>
          <div>
            <p class="ys-etiqueta">Resolución que pide el cliente</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              <button *ngFor="let t of tipos" type="button" (click)="tipo.set(t)" class="ys-opcion" [class.ys-opcion-activa]="tipo() === t">
                {{ etiquetaTipo(t) }}
              </button>
            </div>
          </div>
          <div>
            <p class="ys-etiqueta">Sucursal que recibe la prenda</p>
            <select [(ngModel)]="sucursal" class="ys-campo">
              <option *ngFor="let s of inventoryService.locations()" [ngValue]="s.codigoSucursal">{{ s.nombre }}</option>
            </select>
          </div>

          <button (click)="registrar(v)" [disabled]="!puedeRegistrar() || guardando()" class="ys-btn w-full">
            {{ guardando() ? 'Registrando…' : 'Registrar y pasar a inspección' }}
          </button>
        </ng-container>
      </div>
    </div>
  `,
})
export class ReturnNewComponent implements OnInit {
  @Output() cerrar = new EventEmitter<void>();
  @Output() creados = new EventEmitter<DevolucionOut[]>();

  readonly motivos = Object.entries(ETIQUETA_MOTIVO) as [MotivoDevolucion, string][];
  readonly tipos: TipoDevolucion[] = ['cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto', 'devolucion', 'nota_credito'];

  busqueda = '';
  detalle = '';
  sucursal: number | null = null;
  readonly ventas = signal<VentaDevolucion[]>([]);
  readonly venta = signal<VentaDevolucion | null>(null);
  readonly seleccion = signal<Record<number, number>>({});
  readonly motivo = signal<MotivoDevolucion>('talla');
  readonly tipo = signal<TipoDevolucion>('cambio_talla');
  readonly buscando = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);

  readonly puedeRegistrar = computed(() => Object.keys(this.seleccion()).length > 0 && this.venta() !== null);

  constructor(
    private returnsService: ReturnsService,
    public inventoryService: InventoryService,
  ) {}

  ngOnInit(): void {
    if (this.inventoryService.locations().length === 0) void this.inventoryService.loadLocations();
  }

  etiquetaTipo(tipo: string): string {
    return ETIQUETA_TIPO[tipo] ?? tipo;
  }

  async buscar(): Promise<void> {
    this.buscando.set(true);
    const ventas = (await this.returnsService.buscarVentas(this.busqueda.trim())) ?? [];
    this.buscando.set(false);
    this.ventas.set(ventas);
    this.venta.set(null);
    if (ventas.length === 1) this.elegir(ventas[0]);
  }

  elegir(venta: VentaDevolucion): void {
    this.venta.set(venta);
    this.seleccion.set({});
    this.sucursal = venta.codigoSucursal ?? this.inventoryService.locations()[0]?.codigoSucursal ?? null;
  }

  /** Por defecto de fábrica rige la garantía: el servidor decide con el motivo elegido. */
  seleccionable(linea: LineaDevolucion): boolean {
    if (linea.disponibles <= 0 || linea.solicitudAbierta) return false;
    return linea.elegibilidad.puede || (this.motivo() === 'defecto' && ['fuera_plazo', 'no_retornable'].includes(linea.elegibilidad.estado));
  }

  seleccionada(linea: LineaDevolucion): boolean {
    return linea.idProducto in this.seleccion();
  }

  alternar(linea: LineaDevolucion): void {
    const actual = { ...this.seleccion() };
    if (linea.idProducto in actual) delete actual[linea.idProducto];
    else actual[linea.idProducto] = 1;
    this.seleccion.set(actual);
  }

  fijarCantidad(linea: LineaDevolucion, valor: number): void {
    const n = Math.max(1, Math.min(Number(valor) || 1, linea.disponibles));
    this.seleccion.set({ ...this.seleccion(), [linea.idProducto]: n });
  }

  async registrar(venta: VentaDevolucion): Promise<void> {
    if (this.sucursal === null) return;
    this.guardando.set(true);
    const casos = await this.returnsService.registrar({
      idVenta: venta.idVenta,
      codigoSucursal: this.sucursal,
      motivoCategoria: this.motivo(),
      motivo: this.detalle.trim() || null,
      tipo: this.tipo(),
      items: Object.entries(this.seleccion()).map(([idProducto, cantidad]) => ({ idProducto: Number(idProducto), cantidad })),
    });
    this.guardando.set(false);
    if (casos) this.creados.emit(casos);
  }
}
