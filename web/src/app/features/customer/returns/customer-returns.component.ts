import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO,
  ReturnsService,
  claseEstado,
  textoPlazo,
} from '../../../core/services/returns.service';
import { CreditNotesService } from '../../../core/services/credit-notes.service';
import {
  DevolucionOut,
  InventoryLocation,
  LineaDevolucion,
  MotivoDevolucion,
  NotaCredito,
  PaginatedProducts,
  PoliticaDevolucion,
  ProductOut,
  QrDevolucion,
  StockSucursal,
  TipoSolicitud,
  VentaDevolucion,
} from '../../../core/models';
import { QrCodeComponent } from '../../../shared/components/qr-code.component';
import { environment } from '../../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * CU2 — Solicitar devolución o cambio desde la tienda en línea, y "Mis notas
 * de crédito" (CU7). El cliente ve cada prenda con su elegibilidad y el
 * tiempo restante; la solicitud genera un código con QR y una fecha límite
 * para entregar la prenda en la sucursal elegida.
 */
@Component({
  selector: 'app-customer-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, QrCodeComponent],
  template: `
    <div class="p-4 sm:p-8 space-y-8 max-w-5xl mx-auto animate-in fade-in duration-200">
      <div>
        <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Posventa</span>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Devoluciones y cambios</h1>
        <p class="text-sm text-gray-500 mt-1">Pedí el cambio o la devolución de una compra, entregá la prenda en la sucursal y seguí su estado.</p>
      </div>

      <div *ngIf="politica() as p" class="ys-tarjeta p-4 text-sm space-y-1">
        <p class="font-bold text-gray-900 flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-indigo-600">policy</span>
          {{ plazo(p.plazoCambioHoras) }} para cambios · {{ p.plazoGarantiaDias }} días de garantía por defecto de fábrica
        </p>
        <p class="text-xs text-gray-600">{{ p.condiciones }}</p>
        <p *ngIf="p.accionFueraPlazo === 'recargo'" class="text-[11px] text-amber-700">
          Fuera de plazo se puede con un recargo de {{ p.recargoTipo === 'porcentaje' ? p.recargoValor + '%' : 'Bs ' + p.recargoValor }} por {{ p.recargoUnidad }} de demora.
        </p>
      </div>

      <!-- Mis compras (CU2 pasos 1-2) -->
      <section class="space-y-3">
        <h2 class="text-base font-bold text-gray-900">Mis compras</h2>
        <div *ngIf="cargando()" class="text-sm text-gray-500">Cargando tus compras…</div>
        <div *ngIf="!cargando() && compras().length === 0" class="ys-tarjeta p-5 text-sm text-gray-500">No tenés compras recientes.</div>
        <div *ngFor="let v of compras()" class="ys-tarjeta p-4 space-y-2">
          <div class="flex justify-between text-xs text-gray-500">
            <span>Compra #{{ v.idVenta }} · {{ v.fecha | date: 'dd/MM/yyyy HH:mm' }} · {{ v.sucursal }}</span>
            <span>{{ v.estadoDevolucion }}</span>
          </div>
          <div *ngFor="let l of v.lineas" class="flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
            <div class="text-sm">
              <p class="font-semibold text-gray-900">{{ l.producto }} · talla {{ l.talla }} · {{ l.color }}</p>
              <p class="text-xs" [ngClass]="l.elegibilidad.puede ? 'text-emerald-700' : 'text-gray-500'">{{ textoElegibilidad(l) }}</p>
            </div>
            <button *ngIf="l.solicitudAbierta" (click)="verSolicitud(l.solicitudAbierta)" class="ys-btn-sec whitespace-nowrap">Ver {{ l.solicitudAbierta }}</button>
            <button *ngIf="!l.solicitudAbierta && l.elegibilidad.puede" (click)="abrir(v, l)" [disabled]="politica()?.permiteSolicitudEnLinea === false"
                    class="ys-btn whitespace-nowrap">Solicitar</button>
          </div>
        </div>
      </section>

      <!-- Mis solicitudes (CU11 del lado del cliente) -->
      <section class="space-y-3">
        <h2 class="text-base font-bold text-gray-900">Mis solicitudes</h2>
        <div *ngIf="casos().length === 0" class="ys-tarjeta p-5 text-sm text-gray-500">Todavía no pediste devoluciones ni cambios.</div>
        <div *ngFor="let c of casos()" class="ys-tarjeta p-4 text-sm space-y-1">
          <div class="flex items-center justify-between gap-3">
            <p class="font-semibold text-gray-900"><span class="font-mono">{{ c.codigo }}</span> · {{ etiqueta(tipos, c.tipo) }}</p>
            <span class="ys-chip" [ngClass]="clase(c.estado)">{{ etiqueta(estados, c.estado) }}</span>
          </div>
          <p class="text-xs text-gray-500">{{ c.producto_nombre }} {{ c.tallaOriginal }}
            <span *ngIf="c.producto_nuevo_nombre"> → {{ c.producto_nuevo_nombre }} {{ c.tallaNueva }}</span> · {{ c.fecha | date: 'dd/MM/yyyy' }}</p>
          <p *ngIf="c.estado === 'PendienteEntrega'" class="text-xs text-amber-700">Entregá la prenda en {{ c.sucursal_nombre }} hasta el {{ c.fechaLimiteEntrega | date: 'dd/MM/yyyy HH:mm' }}</p>
          <p *ngIf="c.estado === 'CambioPendiente'" class="text-xs text-amber-700">Tu cambio te espera en {{ c.sucursal_entrega_nombre }}
            <span *ngIf="c.fechaLimiteRetiro"> hasta el {{ c.fechaLimiteRetiro | date: 'dd/MM/yyyy' }}</span></p>
          <p *ngIf="c.motivoRechazo" class="text-xs text-rose-600">{{ c.motivoRechazo }}</p>
          <p *ngIf="c.montoDevuelto > 0" class="text-xs text-emerald-700">Reembolso de Bs {{ c.montoDevuelto.toFixed(2) }} ({{ c.metodoReembolso }})</p>
          <p *ngIf="c.nota_codigo" class="text-xs text-emerald-700">Nota de crédito {{ c.nota_codigo }}</p>
          <div class="flex flex-wrap gap-2 pt-1">
            <button (click)="mostrarQr(c)" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">qr_code_2</span> Código QR</button>
            <button (click)="comprobante(c)" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Comprobante</button>
            <button *ngIf="c.estado === 'PendienteEntrega'" (click)="cancelar(c)" class="ys-btn-sec">Cancelar</button>
          </div>
        </div>
      </section>

      <!-- Mis notas de crédito (CU7) -->
      <section class="space-y-3">
        <h2 class="text-base font-bold text-gray-900">Mis notas de crédito</h2>
        <div *ngIf="notas().length === 0" class="ys-tarjeta p-5 text-sm text-gray-500">No tenés notas de crédito.</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div *ngFor="let n of notas()" class="ys-tarjeta p-4 text-sm">
            <div class="flex justify-between"><p class="font-mono font-bold text-gray-900">{{ n.codigo }}</p>
              <span class="ys-mini" [ngClass]="n.estado === 'Vigente' ? 'text-emerald-700' : ''">{{ n.estado }}</span></div>
            <p class="text-2xl font-bold text-gray-900 mt-1">Bs {{ n.saldo.toFixed(2) }}</p>
            <p class="text-xs text-gray-500">de Bs {{ n.monto.toFixed(2) }} · vence {{ n.fechaVencimiento | date: 'dd/MM/yyyy' }}</p>
            <p class="text-[11px] text-gray-500 mt-1">Usala en cualquier sucursal de {{ n.empresa }} presentando este código.</p>
          </div>
        </div>
      </section>
    </div>

    <!-- QR de una solicitud -->
    <div *ngIf="qr() as q" class="ys-modal" (click)="qr.set(null)">
      <div class="ys-modal-caja max-w-xs text-center space-y-3" (click)="$event.stopPropagation()">
        <p class="font-mono font-bold text-gray-900">{{ q.codigo }}</p>
        <div class="inline-block"><app-qr-code [modulos]="q.modulos" [tamano]="200" [texto]="q.codigo"></app-qr-code></div>
        <p class="text-xs text-gray-500">Mostralo en la sucursal al entregar la prenda.</p>
        <button (click)="qr.set(null)" class="ys-btn-sec w-full">Cerrar</button>
      </div>
    </div>

    <!-- CU2: solicitud -->
    <div *ngIf="seleccion() as s" class="ys-modal">
      <div class="ys-modal-caja max-w-lg space-y-4">
        <button (click)="seleccion.set(null)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div>
          <span class="ys-mini text-indigo-600">Solicitud de devolución o cambio</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">{{ s.linea.producto }} · talla {{ s.linea.talla }} · {{ s.linea.color }}</h3>
          <p class="text-xs text-gray-500">Pagaste Bs {{ s.linea.precioPagado.toFixed(2) }} · {{ textoElegibilidad(s.linea) }}</p>
        </div>

        <div>
          <p class="ys-etiqueta">Motivo</p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button *ngFor="let m of motivos" type="button" (click)="motivo.set(m[0])" class="ys-opcion" [class.ys-opcion-activa]="motivo() === m[0]">{{ m[1] }}</button>
          </div>
        </div>
        <div>
          <p class="ys-etiqueta">¿Qué querés?</p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button *ngFor="let t of tiposPermitidos()" type="button" (click)="elegirTipo(t)" class="ys-opcion" [class.ys-opcion-activa]="tipo() === t">{{ etiqueta(tipos, t) }}</button>
          </div>
        </div>

        <!-- Paso 4: variantes del mismo modelo con precio y disponibilidad por sucursal -->
        <div *ngIf="tipo() === 'cambio_talla' || tipo() === 'cambio_color'" class="space-y-2">
          <p class="ys-etiqueta">Prenda que querés</p>
          <button *ngFor="let p of variantes()" type="button" (click)="elegirVariante(p.idProducto)"
                  class="w-full text-left p-2 rounded-lg border text-xs bg-transparent cursor-pointer"
                  [ngClass]="idProductoNuevo() === p.idProducto ? 'border-indigo-400' : 'border-gray-200'">
            <span class="font-semibold text-gray-900">{{ p.nombre }} · talla {{ p.talla }} · {{ p.color }} · Bs {{ p.venta }}</span>
            <span class="block text-gray-500">{{ disponibilidad(p.idProducto) }}</span>
          </button>
          <p *ngIf="variantes().length === 0" class="text-xs text-amber-700">No hay otra variante del mismo modelo.</p>
        </div>
        <div *ngIf="tipo() === 'cambio_producto'">
          <p class="ys-etiqueta">Producto que te gustaría</p>
          <select [ngModel]="idProductoNuevo()" (ngModelChange)="elegirVariante($event)" class="ys-campo">
            <option [ngValue]="null">Lo elijo en la tienda</option>
            <option *ngFor="let p of otros()" [ngValue]="p.idProducto">{{ p.nombre }} · {{ p.talla }} · Bs {{ p.venta }}</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="ys-etiqueta">Cantidad</p>
            <input type="number" min="1" [max]="s.linea.disponibles" [ngModel]="cantidad()" (ngModelChange)="cantidad.set(+$event)" class="ys-campo" />
          </div>
          <div>
            <p class="ys-etiqueta">Sucursal de entrega</p>
            <select [(ngModel)]="sucursal" class="ys-campo">
              <option *ngFor="let l of sucursales()" [ngValue]="l.codigoSucursal">{{ l.nombre }}</option>
            </select>
          </div>
        </div>
        <div>
          <p class="ys-etiqueta">Contanos qué pasó (opcional)</p>
          <textarea rows="2" [(ngModel)]="detalle" maxlength="255" class="ys-campo"></textarea>
        </div>
        <div>
          <p class="ys-etiqueta">Fotos de la prenda (opcional)</p>
          <input type="file" accept="image/*" (change)="subir($event)" class="text-xs text-gray-600 mt-1" />
          <div class="flex gap-2 mt-2" *ngIf="fotos().length"><img *ngFor="let f of fotos()" [src]="f" alt="Foto" class="w-12 h-12 object-cover rounded" /></div>
        </div>
        <p class="text-[11px] text-gray-500">Vas a recibir un código con QR y una fecha límite para entregar la prenda. Si pediste una variante disponible, te la apartamos hasta esa fecha.</p>
        <button (click)="enviar(s.venta, s.linea)" [disabled]="!puedeEnviar() || enviando()" class="ys-btn w-full">
          {{ enviando() ? 'Enviando…' : 'Enviar solicitud' }}
        </button>
      </div>
    </div>
  `,
})
export class CustomerReturnsComponent implements OnInit {
  readonly estados = ETIQUETA_ESTADO;
  readonly tipos = ETIQUETA_TIPO;
  readonly motivos = Object.entries(ETIQUETA_MOTIVO) as [MotivoDevolucion, string][];

  readonly politica = signal<PoliticaDevolucion | null>(null);
  readonly compras = signal<VentaDevolucion[]>([]);
  readonly casos = signal<DevolucionOut[]>([]);
  readonly notas = signal<NotaCredito[]>([]);
  readonly cargando = signal<boolean>(true);
  readonly qr = signal<QrDevolucion | null>(null);

  readonly seleccion = signal<{ venta: VentaDevolucion; linea: LineaDevolucion } | null>(null);
  readonly motivo = signal<MotivoDevolucion>('talla');
  readonly tipo = signal<TipoSolicitud>('cambio_talla');
  readonly idProductoNuevo = signal<number | null>(null);
  readonly cantidad = signal<number>(1);
  readonly catalogo = signal<ProductOut[]>([]);
  readonly sucursales = signal<InventoryLocation[]>([]);
  readonly stocks = signal<Record<number, StockSucursal[]>>({});
  readonly fotos = signal<string[]>([]);
  readonly enviando = signal<boolean>(false);
  sucursal: number | null = null;
  detalle = '';

  readonly tiposPermitidos = computed<TipoSolicitud[]>(() => {
    const p = this.politica();
    const tipos: TipoSolicitud[] = ['cambio_talla', 'cambio_color', 'cambio_producto'];
    if (p?.permiteReembolso !== false || this.motivo() === 'defecto') tipos.push('devolucion');
    tipos.push('nota_credito');
    return tipos;
  });

  readonly original = computed(() => {
    const s = this.seleccion();
    return s ? this.catalogo().find((p) => p.idProducto === s.linea.idProducto) : undefined;
  });

  readonly variantes = computed(() => {
    const o = this.original();
    if (!o) return [];
    return this.catalogo().filter((p) => p.idProducto !== o.idProducto && p.tipo === o.tipo &&
      (this.tipo() === 'cambio_talla' ? p.color === o.color && p.talla !== o.talla : p.talla === o.talla && p.color !== o.color));
  });

  readonly otros = computed(() => this.catalogo().filter((p) => p.idProducto !== this.seleccion()?.linea.idProducto));

  constructor(
    private http: HttpClient,
    private returnsService: ReturnsService,
    private creditNotesService: CreditNotesService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    const [compras, casos, notas] = await Promise.all([
      this.returnsService.misCompras(),
      this.returnsService.consultar({}),
      this.creditNotesService.listar(),
    ]);
    this.compras.set(compras);
    this.casos.set(casos);
    this.notas.set(notas);
    this.politica.set(await this.returnsService.politica(compras[0]?.idTenant));
    this.cargando.set(false);
  }

  plazo(horas: number): string {
    return textoPlazo(horas);
  }

  etiqueta(mapa: Record<string, string>, valor: string): string {
    return mapa[valor] ?? valor;
  }

  clase(estado: string): string {
    return claseEstado(estado);
  }

  /** CU2 alternativo 1: fuera de plazo se oculta la opción y se muestra la fecha límite. */
  textoElegibilidad(l: LineaDevolucion): string {
    const e = l.elegibilidad;
    if (e.estado === 'en_plazo') return `Podés pedir el cambio: quedan ${e.horasRestantes.toFixed(1)} h`;
    if (e.estado === 'recargo') return `${e.mensaje}`;
    if (e.estado === 'fuera_plazo') {
      return `El plazo venció el ${new Date(e.fechaLimite).toLocaleString()}. Por defecto de fábrica tenés hasta el ${new Date(e.garantiaHasta).toLocaleDateString()}.`;
    }
    return e.mensaje;
  }

  verSolicitud(codigo: string): void {
    const caso = this.casos().find((c) => c.codigo === codigo);
    if (caso) void this.mostrarQr(caso);
  }

  async mostrarQr(caso: DevolucionOut): Promise<void> {
    this.qr.set(await this.returnsService.qr(caso.idDevolucion));
  }

  comprobante(caso: DevolucionOut): void {
    void this.returnsService.abrirComprobante(caso.idDevolucion);
  }

  async abrir(venta: VentaDevolucion, linea: LineaDevolucion): Promise<void> {
    this.seleccion.set({ venta, linea });
    this.motivo.set('talla');
    this.cantidad.set(1);
    this.detalle = '';
    this.fotos.set([]);
    this.sucursal = venta.codigoSucursal;
    this.elegirTipo('cambio_talla');
    const [productos, sucursales] = await Promise.all([
      firstValueFrom(this.http.get<PaginatedProducts>(`${API_URL}/api/products`, { params: { idTenant: venta.idTenant, size: 100 } })).catch(() => null),
      firstValueFrom(this.http.get<InventoryLocation[]>(`${API_URL}/api/inventory/locations`, { params: { idTenant: venta.idTenant } })).catch(() => []),
    ]);
    this.catalogo.set(productos?.items ?? []);
    this.sucursales.set(sucursales);
    if (this.sucursal === null) this.sucursal = sucursales[0]?.codigoSucursal ?? null;
    for (const v of this.variantes()) void this.cargarStock(v.idProducto);
  }

  elegirTipo(tipo: TipoSolicitud): void {
    this.tipo.set(tipo);
    this.idProductoNuevo.set(null);
    for (const v of this.variantes()) void this.cargarStock(v.idProducto);
  }

  elegirVariante(idProducto: number | null): void {
    this.idProductoNuevo.set(idProducto);
    if (idProducto) void this.cargarStock(idProducto);
  }

  private async cargarStock(idProducto: number): Promise<void> {
    if (this.stocks()[idProducto]) return;
    const stock = await this.returnsService.stockReemplazo(idProducto);
    this.stocks.update((s) => ({ ...s, [idProducto]: stock }));
  }

  disponibilidad(idProducto: number): string {
    const stock = this.stocks()[idProducto];
    if (!stock) return 'Consultando disponibilidad…';
    const con = stock.filter((s) => s.disponible > 0);
    return con.length ? 'Disponible en ' + con.map((s) => s.sucursal).join(', ') : 'Sin stock por ahora';
  }

  async subir(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    const url = await this.returnsService.subirFoto(archivo);
    if (url) this.fotos.update((f) => [...f, url]);
  }

  puedeEnviar(): boolean {
    const s = this.seleccion();
    if (!s || this.sucursal === null) return false;
    if (this.cantidad() < 1 || this.cantidad() > s.linea.disponibles) return false;
    return !['cambio_talla', 'cambio_color'].includes(this.tipo()) || this.idProductoNuevo() !== null;
  }

  async enviar(venta: VentaDevolucion, linea: LineaDevolucion): Promise<void> {
    if (!this.puedeEnviar() || this.sucursal === null) return;
    this.enviando.set(true);
    const caso = await this.returnsService.solicitar({
      idVenta: venta.idVenta,
      idProducto: linea.idProducto,
      cantidad: this.cantidad(),
      motivoCategoria: this.motivo(),
      motivo: this.detalle.trim() || null,
      tipo: this.tipo(),
      idProductoNuevo: this.idProductoNuevo(),
      codigoSucursal: this.sucursal,
      fotos: this.fotos(),
    });
    this.enviando.set(false);
    if (caso) {
      this.seleccion.set(null);
      await this.cargar();
      await this.mostrarQr(caso);
    }
  }

  async cancelar(caso: DevolucionOut): Promise<void> {
    if (!confirm(`¿Cancelar la solicitud ${caso.codigo}?`)) return;
    if (await this.returnsService.cancelar(caso.idDevolucion)) await this.cargar();
  }
}
