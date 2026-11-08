import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_FRANJA,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO,
  ReturnsService,
  claseEstado,
  textoPlazo,
} from '../../../core/services/returns.service';
import {
  DevolucionOut,
  InventoryLocation,
  LineaDevolucion,
  MotivoDevolucion,
  ComparacionTalla,
  PaginatedProducts,
  PoliticaDevolucion,
  ProductOut,
  QrDevolucion,
  StockSucursal,
  TipoSolicitud,
  VentaDevolucion,
  ViajeDomicilio,
} from '../../../core/models';
import { QrCodeComponent } from '../../../shared/components/qr-code.component';
import { NotaDevolucionComponent } from '../../../shared/components/nota-devolucion.component';
import { CuBadgeComponent } from '../../../shared/components/cu-badge.component';
import { environment } from '../../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * CU2 — Solicitar devolución o cambio desde la tienda en línea. Si se le
 * devuelve plata, recibe su nota de devolución (CU7). El cliente ve cada prenda con su elegibilidad y el
 * tiempo restante; la solicitud genera un código con QR y una fecha límite
 * para entregar la prenda en la sucursal elegida.
 */
@Component({
  selector: 'app-customer-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, QrCodeComponent, NotaDevolucionComponent, CuBadgeComponent],
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
            <button *ngIf="!l.solicitudAbierta && (l.elegibilidad.puede || l.elegibilidad.soloDefecto)" (click)="abrir(v, l)"
                    [disabled]="politica()?.permiteSolicitudEnLinea === false"
                    class="ys-btn whitespace-nowrap">{{ l.elegibilidad.puede ? 'Solicitar' : 'Solicitar por defecto de fábrica' }}</button>
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
          <p *ngIf="c.estado === 'PendienteEntrega' && c.modalidadEntrega !== 'domicilio'" class="text-xs text-amber-700">Entregá la prenda en {{ c.sucursal_nombre }} hasta el {{ c.fechaLimiteEntrega | date: 'dd/MM/yyyy HH:mm' }}</p>
          <!-- [CU31] [CU32] seguimiento del delivery -->
          <div *ngIf="c.modalidadEntrega === 'domicilio'" class="text-xs space-y-0.5" data-testid="delivery-cliente">
            <p *ngFor="let v of viajesDe(c.idDevolucion)" [ngClass]="v.estado === 'Completado' ? 'text-emerald-700' : v.estado === 'Fallido' ? 'text-rose-600' : 'text-indigo-700'">
              <span class="material-symbols-outlined text-[14px] align-middle">{{ v.tipo === 'recojo' ? 'move_to_inbox' : 'local_shipping' }}</span>
              {{ textoViaje(v) }}
            </p>
          </div>
          <p *ngIf="c.estado === 'CambioPendiente'" class="text-xs text-amber-700">Tu cambio te espera en {{ c.sucursal_entrega_nombre }}
            <span *ngIf="c.fechaLimiteRetiro"> hasta el {{ c.fechaLimiteRetiro | date: 'dd/MM/yyyy' }}</span></p>
          <p *ngIf="c.motivoRechazo" class="text-xs text-rose-600">{{ c.motivoRechazo }}</p>
          <p *ngIf="c.montoDevuelto > 0" class="text-xs text-emerald-700">Reembolso de Bs {{ c.montoDevuelto.toFixed(2) }} ({{ c.metodoReembolso }})</p>
          <p *ngIf="c.montoDevuelto > 0" class="text-xs text-emerald-700">Nota de devolución {{ c.codigo }}: te devolvimos Bs {{ c.montoDevuelto.toFixed(2) }}</p>
          <p *ngIf="c.costoDomicilio > 0" class="text-[11px] text-gray-500">Delivery: Bs {{ c.costoDomicilio.toFixed(2) }} descontados del valor de la prenda.</p>
          <div class="flex flex-wrap gap-2 pt-1">
            <button (click)="mostrarQr(c)" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">qr_code_2</span> Código QR</button>
            <button (click)="comprobante(c)" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> Comprobante</button>
            <!-- [CU7] -->
            <button *ngIf="c.montoDevuelto > 0" (click)="nota.set(c.idDevolucion)" class="ys-btn-sec" data-testid="ver-nota-cliente">
              <span class="material-symbols-outlined text-[16px]">receipt_long</span> Nota de devolución</button>
            <button *ngIf="c.estado === 'PendienteEntrega'" (click)="cancelar(c)" class="ys-btn-sec">Cancelar</button>
          </div>
        </div>
      </section>

    </div>

    <app-nota-devolucion *ngIf="nota() as id" [idDevolucion]="id" (cerrar)="nota.set(null)"></app-nota-devolucion>

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
            <button *ngFor="let m of motivosPermitidos()" type="button" (click)="motivo.set(m[0])" class="ys-opcion" [class.ys-opcion-activa]="motivo() === m[0]">{{ m[1] }}</button>
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
          <!-- "L mas grande o L menos grande": cuanto mas grande o mas chica es la talla elegida, en cm -->
          <p *ngIf="comparacion() as c" class="text-[11px] p-2 rounded-lg border"
             [ngClass]="c.direccion === 'mas_grande' ? 'border-sky-200 bg-sky-50 text-sky-800' : c.direccion === 'mas_chica' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-600'">
            <span class="material-symbols-outlined text-[14px] align-middle">straighten</span> {{ c.texto }}
          </p>
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
            <p class="ys-etiqueta">{{ modalidad() === 'domicilio' ? 'Sucursal que la recibe' : 'Sucursal de entrega' }}</p>
            <select [(ngModel)]="sucursal" class="ys-campo">
              <option *ngFor="let l of sucursales()" [ngValue]="l.codigoSucursal">{{ l.nombre }}</option>
            </select>
          </div>
        </div>

        <!-- [CU31]: la lleva el cliente o la recoge el repartidor (y despues de revisarla le llevan la nueva, CU32) -->
        <div *ngIf="politica()?.permiteDomicilio !== false" class="space-y-2">
          <div class="flex items-center gap-2">
            <p class="ys-etiqueta">¿Cómo nos das la prenda?</p>
            <app-cu-badge cu="CU31"></app-cu-badge>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" (click)="modalidad.set('sucursal')" class="ys-opcion text-xs" [class.ys-opcion-activa]="modalidad() === 'sucursal'">La llevo a la sucursal</button>
            <button type="button" (click)="modalidad.set('domicilio')" class="ys-opcion text-xs" [class.ys-opcion-activa]="modalidad() === 'domicilio'" data-testid="elegir-domicilio">Que la recojan en mi casa</button>
          </div>
          <div *ngIf="modalidad() === 'domicilio'" class="space-y-2 p-3 rounded-lg border border-indigo-200">
            <input class="ys-campo mt-0" [(ngModel)]="dom.direccion" name="dir" placeholder="Dirección (calle, número, zona)" data-testid="direccion" />
            <div class="grid grid-cols-2 gap-2">
              <input class="ys-campo mt-0" [(ngModel)]="dom.referencia" name="ref" placeholder="Referencia (opcional)" />
              <input class="ys-campo mt-0" [(ngModel)]="dom.telefono" name="tel" placeholder="Teléfono" data-testid="telefono" />
              <label class="text-[11px] text-gray-500">Día preferido<input type="date" class="ys-campo mt-0" [(ngModel)]="dom.fechaPreferida" [min]="hoy" name="fp" /></label>
              <label class="text-[11px] text-gray-500">Horario
                <select class="ys-campo mt-0" [(ngModel)]="dom.franja" name="fr"><option value="manana">Mañana (9 a 13)</option><option value="tarde">Tarde (14 a 19)</option></select></label>
            </div>
            <p class="text-[11px] text-gray-600">
              Primero el repartidor recoge la prenda y la revisamos en la sucursal.
              <span *ngIf="tipo() !== 'devolucion'"> Si está en orden, te llevamos la prenda nueva a la misma dirección.</span>
              {{ costoTexto() }}
            </p>
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
        <p *ngIf="modalidad() === 'sucursal'" class="text-[11px] text-gray-500">Vas a recibir un código con QR y una fecha límite para entregar la prenda. Si pediste una variante disponible, te la apartamos hasta esa fecha.</p>
        <button (click)="enviar(s.venta, s.linea)" [disabled]="!puedeEnviar() || enviando()" class="ys-btn w-full">
          {{ enviando() ? 'Enviando…' : 'Enviar solicitud' }}
        </button>
      </div>
    </div>
  `,
})
// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU2] Solicitar devolucion o cambio desde la tienda en linea
// [CU7] Emitir nota de devolucion
// Diagramas del informe: "Robustez CU2" y "Clases CU2", "Robustez CU7" y "Clases CU7"
// Pantalla (boundary) que lo usa: MisComprasUI (CU2) = esta clase
// En palabras simples: pantalla del cliente "Mis compras" para pedir un cambio o la devolucion de su dinero. La version movil es mobile/app/lib/screens/returns_screen.dart
// Robustez CU2: boundary "Mis Compras / Solicitar Cambio"
// Secuencia CU2: lifeline "Mis Compras / Solicitar Cambio"
// ==================================================================
export class CustomerReturnsComponent implements OnInit {
  readonly estados = ETIQUETA_ESTADO;
  readonly tipos = ETIQUETA_TIPO;
  readonly motivos = Object.entries(ETIQUETA_MOTIVO) as [MotivoDevolucion, string][];

  readonly politica = signal<PoliticaDevolucion | null>(null);
  readonly compras = signal<VentaDevolucion[]>([]);
  readonly casos = signal<DevolucionOut[]>([]);
  // Correccion de la ingeniera: si la talla elegida es mas grande o mas chica que la que devuelve.
  readonly comparacion = signal<ComparacionTalla | null>(null);
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
  // [CU31]
  readonly modalidad = signal<'sucursal' | 'domicilio'>('sucursal');
  dom: { direccion: string; referencia: string; telefono: string; fechaPreferida: string; franja: 'manana' | 'tarde' } =
    { direccion: '', referencia: '', telefono: '', fechaPreferida: '', franja: 'manana' };
  readonly hoy = new Date().toISOString().slice(0, 10);
  readonly viajes = signal<Record<number, ViajeDomicilio[]>>({});
  // [CU7]
  readonly nota = signal<number | null>(null);

  /** Fuera del plazo de cambio solo queda el motivo defecto de fábrica (garantía). */
  readonly motivosPermitidos = computed(() =>
    this.seleccion()?.linea.elegibilidad.puede === false ? this.motivos.filter((m) => m[0] === 'defecto') : this.motivos,
  );

  readonly tiposPermitidos = computed<TipoSolicitud[]>(() => {
    const p = this.politica();
    const tipos: TipoSolicitud[] = ['cambio_talla', 'cambio_color', 'cambio_producto'];
    if (p?.permiteReembolso !== false || this.motivo() === 'defecto') tipos.push('devolucion');
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
  ) {}

  // [CU2] MisComprasUI.abrirMisCompras()
  // Robustez CU2: mensaje 1: abrirMisCompras() -> 2: listarMisCompras() -> 9: mostrarPrendasElegibles(plazo)
  // Secuencia CU2: Cliente -> abrirMisCompras() -> mostrarPrendasElegibles(tiempo restante)
  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    const [compras, casos] = await Promise.all([
      this.returnsService.misCompras(),
      this.returnsService.consultar({}),
    ]);
    this.compras.set(compras);
    this.casos.set(casos);
    // [CU31] [CU32] seguimiento de los viajes de los casos con delivery
    const conDelivery = casos.filter((c) => c.modalidadEntrega === 'domicilio');
    const listas = await Promise.all(conDelivery.map((c) => this.returnsService.viajesDelCaso(c.idDevolucion)));
    this.viajes.set(Object.fromEntries(conDelivery.map((c, i) => [c.idDevolucion, listas[i]])));
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
      const garantia = e.soloDefecto ? ` Por defecto de fábrica tenés hasta el ${new Date(e.garantiaHasta).toLocaleDateString()}.` : '';
      return `El plazo de cambio venció el ${new Date(e.fechaLimite).toLocaleString()}.${garantia}`;
    }
    return e.mensaje;
  }

  verSolicitud(codigo: string): void {
    const caso = this.casos().find((c) => c.codigo === codigo);
    if (caso) void this.mostrarQr(caso);
  }

  // [CU2] MisComprasUI.mostrarCodigoQR()
  async mostrarQr(caso: DevolucionOut): Promise<void> {
    this.qr.set(await this.returnsService.qr(caso.idDevolucion));
  }

  comprobante(caso: DevolucionOut): void {
    void this.returnsService.abrirComprobante(caso.idDevolucion);
  }

  // [CU2] MisComprasUI.seleccionarPrenda()
  // Robustez CU2: mensaje 10: seleccionarPrenda(cantidad, motivo, resolucion, fotos)
  // Secuencia CU2: Cliente -> seleccionarPrenda(cantidad, motivo, resolucion, sucursal)
  async abrir(venta: VentaDevolucion, linea: LineaDevolucion): Promise<void> {
    this.seleccion.set({ venta, linea });
    this.motivo.set(linea.elegibilidad.puede ? 'talla' : 'defecto');
    this.cantidad.set(1);
    this.detalle = '';
    this.fotos.set([]);
    this.modalidad.set('sucursal');
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

  // [CU2] MisComprasUI.mostrarVariantes() -> ControlDevoluciones.consultarStock()
  // Robustez CU2: mensaje 11: consultarStock(idVariante) -> 15: mostrarVariantes(precio, stock por sucursal)
  elegirVariante(idProducto: number | null): void {
    this.idProductoNuevo.set(idProducto);
    if (idProducto) void this.cargarStock(idProducto);
    // "L mas grande o L menos grande": le mostramos al cliente cuanto cambia la talla, en cm.
    this.comparacion.set(null);
    const original = this.seleccion()?.linea.idProducto;
    if (idProducto && original && (this.tipo() === 'cambio_talla' || this.tipo() === 'cambio_color')) {
      void this.returnsService.compararTallas(original, idProducto).then((c) => {
        if (this.idProductoNuevo() === idProducto) this.comparacion.set(c);
      });
    }
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
    if (this.modalidad() === 'domicilio' && (this.dom.direccion.trim().length < 8 || this.dom.telefono.replace(/\D/g, '').length < 7)) return false;
    return !['cambio_talla', 'cambio_color'].includes(this.tipo()) || this.idProductoNuevo() !== null;
  }

  /** [CU31] [CU32] gratis si la culpa es de la tienda. */
  costoTexto(): string {
    const costo = this.politica()?.costoDomicilio ?? 0;
    if (['defecto', 'equivocado'].includes(this.motivo()) || !costo) return 'El delivery es sin costo para vos.';
    const viajes = this.tipo() === 'devolucion' ? 1 : 2;
    return `Cada viaje cuesta Bs ${costo.toFixed(2)} (${viajes === 1 ? 'solo el recojo' : 'recojo y entrega'}) y se descuenta del valor de la prenda.`;
  }

  viajesDe(id: number): ViajeDomicilio[] {
    return this.viajes()[id] ?? [];
  }

  textoViaje(v: ViajeDomicilio): string {
    const que = v.tipo === 'recojo' ? 'Recojo de tu prenda' : 'Entrega de tu prenda nueva';
    if (v.estado === 'Programado') return `${que}: ${new Date(v.fechaProgramada + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: '2-digit', month: '2-digit' })} por la ${ETIQUETA_FRANJA[v.franja ?? ''] ?? ''} (${v.repartidor})`;
    if (v.estado === 'Completado') return `${que}: hecho`;
    if (v.estado === 'Fallido') return `${que}: no pudimos (${v.observaciones}). Lo volvemos a programar.`;
    if (v.estado === 'Cancelado') return `${que}: cancelado`;
    return `${que}: te avisamos el día`;
  }

  // [CU2] MisComprasUI.elegirSucursalYConfirmar() -> ControlDevoluciones.enviarSolicitud() (backend POST /api/returns/solicitudes)
  // Robustez CU2: mensaje 16: elegirSucursalYConfirmar() -> 17: enviarSolicitud(...) -> 23: mostrarCodigoQR(fecha limite)
  // Secuencia CU2: enviarSolicitud(compra, prenda, motivo, sucursal) -> mostrarCodigoQR(fecha limite) / mostrarSolicitudExistente / mostrarRechazo
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
      modalidadEntrega: this.modalidad(),
      domicilio: this.modalidad() === 'domicilio'
        ? { direccion: this.dom.direccion.trim(), referencia: this.dom.referencia.trim() || null, telefono: this.dom.telefono.trim(),
            fechaPreferida: this.dom.fechaPreferida || null, franja: this.dom.franja }
        : null,
    });
    this.enviando.set(false);
    if (caso) {
      this.seleccion.set(null);
      await this.cargar();
      await this.mostrarQr(caso);
    }
  }

  // [CU2] flujo alternativo 3: el cliente anula su solicitud
  async cancelar(caso: DevolucionOut): Promise<void> {
    if (!confirm(`¿Cancelar la solicitud ${caso.codigo}?`)) return;
    if (await this.returnsService.cancelar(caso.idDevolucion)) await this.cargar();
  }
}
