import { Component, EventEmitter, OnInit, Output, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OfflineSyncService, ProductoLocal, VentaLocal } from '../../core/services/offline-sync.service';
import { NotificationService } from '../../core/services/notification.service';
import { LineaVentaLocal, calcularCambio, diferenciaCambio, evaluarCambioLocal } from '../../core/offline-rules';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { ProvisionalReceiptComponent, ReciboProvisional } from './provisional-receipt.component';

type Condicion = 'apta' | 'defectuosa' | 'deteriorada';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU19] Registrar cambio de prenda sin conexion
// Boundary: CambioSinConexionUI -> este componente
// Control: OfflineSyncService.registrarOperacion('cambio' y 'custodia')
// Servidor (al sincronizar): services/operaciones_offline.py -> aplicar_cambio(), aplicar_custodia()
// El informe habla de nota de credito, pero la ingeniera las elimino: el saldo a
// favor queda como reembolso en efectivo pendiente con su nota de devolucion.
// ==================================================================
@Component({
  selector: 'app-offline-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent, ProvisionalReceiptComponent],
  template: `
    <div class="space-y-4 max-w-4xl">
      <app-cu-badge cu="CU19" [conNombre]="true"></app-cu-badge>
      <p class="text-xs text-gray-500">Solo cambios de talla o color del mismo modelo. Un reembolso o el cambio por otro producto requieren conexión.</p>

      <div *ngIf="!offlineSync.preparacion()" class="ys-tarjeta p-4 text-sm text-amber-700">Prepare el dispositivo primero (CU12).</div>
      <div *ngIf="offlineSync.preparacion() && !cajaAbierta()" class="ys-tarjeta p-4 text-sm text-amber-700 flex items-center justify-between gap-3">
        <span>La caja debe estar abierta para registrar un cambio (CU20).</span>
        <button (click)="irCaja.emit()" class="ys-btn-sec">Ir a Caja</button>
      </div>

      <ng-container *ngIf="cajaAbierta() && !venta()">
        <input [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" name="buscarVentaLocal" class="ys-campo max-w-xl" placeholder="N.º de venta, cliente o CI" />
        <div class="ys-tarjeta divide-y divide-gray-100">
          <button *ngFor="let v of filtradas()" (click)="elegirVenta(v)" class="w-full p-3 text-left bg-transparent cursor-pointer hover:bg-gray-50">
            <p class="text-sm font-bold text-gray-900">{{ v.idVenta ? 'Venta ' + v.idVenta : 'Venta sin conexión' }} · {{ v.cliente || 'Cliente' }}</p>
            <p class="text-[11px] text-gray-500">{{ v.fecha | date: 'dd/MM/yyyy HH:mm' }} · Bs {{ v.total.toFixed(2) }} · {{ v.lineas.length }} prenda(s)</p>
          </button>
          <p *ngIf="!filtradas().length" class="p-3 text-xs text-gray-400">La venta no está en este dispositivo.</p>
        </div>
        <button (click)="custodia.set(!custodia())" class="ys-btn-sec">
          <span class="material-symbols-outlined text-[16px]">inventory</span> Recepción en custodia
        </button>
        <div *ngIf="custodia()" class="ys-tarjeta p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <p class="sm:col-span-2 text-xs text-gray-500">La venta no está aquí: la prenda queda en custodia y el cambio se completa al recuperar la conexión.</p>
          <label class="block"><span class="ys-mini">Cliente</span><input class="ys-campo" [(ngModel)]="c.nombre" name="cNombre" /></label>
          <label class="block"><span class="ys-mini">CI</span><input class="ys-campo" [(ngModel)]="c.ci" name="cCi" /></label>
          <label class="block"><span class="ys-mini">N.º de comprobante</span><input class="ys-campo" [(ngModel)]="c.comprobante" name="cComprobante" /></label>
          <label class="block"><span class="ys-mini">Prenda recibida</span><input class="ys-campo" [(ngModel)]="c.prenda" name="cPrenda" /></label>
          <button (click)="registrarCustodia()" class="ys-btn sm:col-span-2">Registrar custodia</button>
        </div>
      </ng-container>

      <ng-container *ngIf="venta() as v">
        <button (click)="reiniciar()" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">arrow_back</span> Otra venta</button>
        <div class="ys-tarjeta p-4 space-y-2">
          <p class="ys-etiqueta">Prenda a cambiar · {{ v.cliente }}</p>
          <button *ngFor="let l of v.lineas" (click)="elegirLinea(l)" class="ys-opcion block w-full text-left" [ngClass]="{ 'ys-opcion-activa': linea() === l }">
            {{ l.nombre }} · {{ l.talla || '—' }} · {{ l.color || '—' }} · Bs {{ l.precioPagado.toFixed(2) }} ({{ l.disponibles }} disponible)
          </button>
        </div>

        <ng-container *ngIf="linea() as l">
          <div class="ys-tarjeta p-4 space-y-2">
            <p class="ys-etiqueta">Inspección de la prenda</p>
            <div class="flex gap-2 flex-wrap">
              <button *ngFor="let o of condiciones" (click)="condicion.set(o.id)" class="ys-opcion" [ngClass]="{ 'ys-opcion-activa': condicion() === o.id }">{{ o.etiqueta }}</button>
            </div>
            <p *ngIf="evaluacion() as e" class="text-xs" [ngClass]="e.puede ? 'text-emerald-600' : 'text-rose-600'">
              {{ e.puede ? 'Dentro del plazo (hasta ' + (e.fechaLimite | date: 'dd/MM/yyyy HH:mm') + ')' : e.motivo }}
            </p>
            <p *ngIf="rechazadaPorPolitica()" class="text-xs text-rose-600">La política no acepta prendas deterioradas.</p>
          </div>

          <div *ngIf="permitido()" class="ys-tarjeta p-4 space-y-2">
            <p class="ys-etiqueta">Nueva talla o color (mismo modelo)</p>
            <p *ngIf="!variantes().length" class="text-xs text-gray-400">No hay variantes del mismo modelo con existencia local.</p>
            <button *ngFor="let p of variantes()" (click)="nueva.set(p)" class="ys-opcion block w-full text-left" [ngClass]="{ 'ys-opcion-activa': nueva()?.idProducto === p.idProducto }">
              Talla {{ p.talla || '—' }} · {{ p.color || '—' }} · Bs {{ p.venta.toFixed(2) }} · existencia {{ stock().get(p.idProducto) ?? 0 }}
            </button>
          </div>

          <div *ngIf="nueva()" class="ys-tarjeta p-4 space-y-2">
            <p class="text-sm font-bold" [ngClass]="diferencia() > 0 ? 'text-amber-700' : 'text-gray-900'" data-testid="diferencia-cambio">
              {{ diferencia() > 0 ? 'A cobrar: Bs ' + diferencia().toFixed(2) : diferencia() < 0 ? 'Saldo a favor: Bs ' + (-diferencia()).toFixed(2) : 'Cambio sin costo' }}
            </p>
            <p *ngIf="diferencia() < 0" class="text-xs text-gray-500">Sin conexión no se entrega dinero: el saldo se devuelve en efectivo con su nota de devolución al sincronizar.</p>
            <label *ngIf="diferencia() > 0" class="block"><span class="ys-mini">Efectivo recibido</span>
              <input type="number" min="0" step="0.01" class="ys-campo" [(ngModel)]="recibido" name="recibidoCambio" /></label>
            <button (click)="confirmar()" [disabled]="diferencia() > 0 && calcular(recibido) === null" class="ys-btn w-full">Registrar cambio</button>
          </div>
        </ng-container>
      </ng-container>
    </div>

    <app-provisional-receipt *ngIf="recibo() as r" [recibo]="r" (cerrar)="recibo.set(null)"></app-provisional-receipt>
  `,
})
export class OfflineExchangeComponent implements OnInit {
  @Output() irCaja = new EventEmitter<void>();

  readonly condiciones: { id: Condicion; etiqueta: string }[] = [
    { id: 'apta', etiqueta: 'Apta' },
    { id: 'defectuosa', etiqueta: 'Defecto de fábrica' },
    { id: 'deteriorada', etiqueta: 'Deteriorada' },
  ];
  readonly ventas = signal<VentaLocal[]>([]);
  readonly catalogo = signal<ProductoLocal[]>([]);
  readonly stock = signal<Map<number, number>>(new Map());
  readonly busqueda = signal('');
  readonly venta = signal<VentaLocal | null>(null);
  readonly linea = signal<LineaVentaLocal | null>(null);
  readonly condicion = signal<Condicion>('apta');
  readonly nueva = signal<ProductoLocal | null>(null);
  readonly custodia = signal(false);
  readonly recibo = signal<ReciboProvisional | null>(null);
  recibido = 0;
  c = { nombre: '', ci: '', comprobante: '', prenda: '' };

  readonly politica = computed(() => this.offlineSync.preparacion()?.politica ?? null);
  readonly cajaAbierta = computed(() => {
    const caja = this.offlineSync.caja();
    return !!caja && caja.codigoSucursal === this.offlineSync.preparacion()?.codigoSucursal;
  });
  readonly filtradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const todas = q
      ? this.ventas().filter(v => [v.idVenta, v.cliente, v.ci].some(x => String(x ?? '').toLowerCase().includes(q)))
      : this.ventas();
    return todas.slice(0, 30);
  });
  readonly evaluacion = computed(() => {
    const v = this.venta();
    const l = this.linea();
    const p = this.politica();
    return v && l && p ? evaluarCambioLocal(v.fecha, l, 1, this.condicion() === 'defectuosa', p, new Date()) : null;
  });
  readonly rechazadaPorPolitica = computed(() => this.condicion() === 'deteriorada' && this.politica()?.accionDeterioro === 'rechazar');
  readonly permitido = computed(() => (this.evaluacion()?.puede ?? false) && !this.rechazadaPorPolitica());
  readonly variantes = computed(() => {
    const l = this.linea();
    if (!l) return [];
    return this.catalogo().filter(
      p => p.idModelo !== null && p.idModelo === l.idModelo && p.idProducto !== l.idProducto && (this.stock().get(p.idProducto) ?? 0) > 0,
    );
  });
  readonly diferencia = computed(() => {
    const l = this.linea();
    const n = this.nueva();
    const p = this.politica();
    if (!l || !n || !p) return 0;
    const original = this.catalogo().find(x => x.idProducto === l.idProducto)?.venta ?? l.precioPagado;
    const pct = this.condicion() === 'deteriorada' ? p.descuentoDeterioroPct : 0;
    return diferenciaCambio(l.precioPagado, original, n.venta, 1, pct, p.respetarPrecioOriginal);
  });

  constructor(
    public offlineSync: OfflineSyncService,
    private notificationService: NotificationService,
  ) {
    effect(() => {
      this.offlineSync.operaciones();
      void this.offlineSync.existencias().then(s => this.stock.set(s));
    });
  }

  async ngOnInit(): Promise<void> {
    this.catalogo.set(await this.offlineSync.catalogoLocal());
    this.ventas.set(await this.offlineSync.ventasLocales());
  }

  calcular(recibido: number): number | null {
    return calcularCambio(Math.max(this.diferencia(), 0), recibido || 0);
  }

  elegirVenta(v: VentaLocal): void {
    this.venta.set(v);
    this.linea.set(null);
    this.nueva.set(null);
  }

  elegirLinea(l: LineaVentaLocal): void {
    this.linea.set(l);
    this.nueva.set(null);
  }

  reiniciar(): void {
    this.venta.set(null);
    this.linea.set(null);
    this.nueva.set(null);
    this.condicion.set('apta');
    this.recibido = 0;
  }

  private sucursal(): number | null {
    return this.offlineSync.preparacion()?.codigoSucursal ?? null;
  }

  async confirmar(): Promise<void> {
    const v = this.venta();
    const l = this.linea();
    const n = this.nueva();
    const caja = this.offlineSync.caja();
    if (!v || !l || !n || !caja || !this.permitido()) return;
    const diferencia = this.diferencia();
    const cobrado = Math.max(diferencia, 0);
    const tipo = n.color !== l.color && n.talla === l.talla ? 'cambio_color' : 'cambio_talla';
    const operacion = await this.offlineSync.registrarOperacion({
      tipo: 'cambio',
      codigoSucursal: this.sucursal(),
      total: cobrado,
      resumen: `Cambio · ${l.nombre} ${l.talla ?? ''} → ${n.talla ?? ''} ${n.color ?? ''}`,
      // [CU17] flujo alternativo 4: si la venta se hizo sin conexión, sale primero.
      dependeDe: this.offlineSync.operaciones().some(o => o.uuidOperacion === v.uuidOperacion) ? v.uuidOperacion : null,
      datos: {
        idVenta: v.idVenta,
        uuidVenta: v.uuidOperacion,
        idProducto: l.idProducto,
        idProductoNuevo: n.idProducto,
        cantidad: 1,
        tipo,
        motivoCategoria: tipo === 'cambio_color' ? 'color' : 'talla',
        condicion: this.condicion(),
        diferencia,
        montoCobrado: cobrado,
        uuidCaja: caja.uuidOperacion,
      },
    });
    if (!operacion) return;
    this.recibo.set({
      titulo: 'Cambio de prenda',
      uuid: operacion.uuidOperacion,
      fecha: operacion.fechaOperacion,
      cliente: v.cliente ?? 'Cliente',
      lineas: [
        { detalle: `Devuelve: ${l.nombre} ${l.talla ?? ''}`, importe: l.precioPagado },
        { detalle: `Recibe: ${n.nombre} ${n.talla ?? ''} ${n.color ?? ''}`, importe: n.venta },
      ],
      total: cobrado,
      extras: diferencia < 0 ? [{ etiqueta: 'Saldo a favor pendiente', valor: `Bs ${(-diferencia).toFixed(2)}` }] : [],
      leyenda: 'Sujeto a confirmación del servidor',
    });
    this.reiniciar();
  }

  async registrarCustodia(): Promise<void> {
    if (this.c.nombre.trim().length < 2 || this.c.prenda.trim().length < 2) {
      this.notificationService.warning('Faltan datos', 'Indique el cliente y la prenda recibida.');
      return;
    }
    const operacion = await this.offlineSync.registrarOperacion({
      tipo: 'custodia',
      codigoSucursal: this.sucursal(),
      resumen: `Custodia · ${this.c.prenda} · ${this.c.nombre}`,
      datos: {
        clienteNombre: this.c.nombre.trim(),
        ci: this.c.ci.trim() || null,
        comprobante: this.c.comprobante.trim() || null,
        descripcionPrenda: this.c.prenda.trim(),
      },
    });
    if (!operacion) return;
    this.recibo.set({
      titulo: 'Recepción en custodia',
      uuid: operacion.uuidOperacion,
      fecha: operacion.fechaOperacion,
      cliente: this.c.nombre,
      lineas: [{ detalle: this.c.prenda, importe: 0 }],
      total: 0,
      extras: [],
      leyenda: 'El cambio se completará al recuperar la conexión',
    });
    this.c = { nombre: '', ci: '', comprobante: '', prenda: '' };
    this.custodia.set(false);
  }
}
