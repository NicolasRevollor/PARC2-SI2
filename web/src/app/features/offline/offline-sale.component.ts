import { Component, EventEmitter, OnInit, Output, ViewChild, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CLAVE_BORRADOR_VENTA, OfflineSyncService, ProductoLocal } from '../../core/services/offline-sync.service';
import { NotificationService } from '../../core/services/notification.service';
import { calcularCambio } from '../../core/offline-rules';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { CLIENTE_GENERICO, ClienteElegido, LocalCustomerComponent } from './local-customer.component';
import { ProvisionalReceiptComponent, ReciboProvisional } from './provisional-receipt.component';

interface LineaTicket {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  existencia: number;
  stockNoConfirmado: boolean;
}

interface Borrador {
  lineas: LineaTicket[];
  cliente: ClienteElegido;
  recibido: number | null;
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU14] Registrar venta de contado sin conexion
// Boundary: VentaSinConexionUI -> este componente
// Control: OfflineSyncService.registrarOperacion('venta')
// Servidor (al sincronizar): services/operaciones_offline.py -> aplicar_venta()
// ==================================================================
@Component({
  selector: 'app-offline-sale',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent, LocalCustomerComponent, ProvisionalReceiptComponent],
  template: `
    <div class="space-y-4 max-w-4xl">
      <app-cu-badge cu="CU14" [conNombre]="true"></app-cu-badge>

      <div *ngIf="!offlineSync.preparacion()" class="ys-tarjeta p-4 text-sm text-amber-700">Prepare el dispositivo primero (CU12).</div>
      <div *ngIf="offlineSync.preparacion() && !cajaAbierta()" class="ys-tarjeta p-4 text-sm text-amber-700 flex items-center justify-between gap-3">
        <span>La caja debe estar abierta para vender (CU20).</span>
        <button (click)="irCaja.emit()" class="ys-btn-sec">Ir a Caja</button>
      </div>

      <!-- CU14 flujo alternativo 5: sesión guardada vencida -->
      <div *ngIf="pedirPin()" class="ys-tarjeta p-4 space-y-2 max-w-sm">
        <p class="text-sm font-bold text-gray-900">La sesión guardada venció</p>
        <p class="text-xs text-gray-500">Ingrese su PIN local para continuar.</p>
        <input class="ys-campo" type="password" inputmode="numeric" maxlength="6" [(ngModel)]="pin" name="pinVenta" />
        <button (click)="verificarPin()" class="ys-btn">Continuar</button>
      </div>

      <ng-container *ngIf="habilitada()">
        <div *ngIf="recuperado()" class="text-xs text-indigo-600">Se recuperó la venta que estaba en curso.</div>

        <div class="ys-tarjeta p-4 space-y-2">
          <span class="ys-etiqueta">Agregar prenda</span>
          <input [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" (keydown.enter)="escanear()" name="buscarPrenda" class="ys-campo"
                 placeholder="Escanee el código (YS-000123) o busque por nombre" />
          <div *ngIf="busqueda()" class="max-h-52 overflow-y-auto divide-y divide-gray-100">
            <div *ngFor="let p of coincidencias()" class="py-1.5 flex items-center justify-between gap-2 text-xs">
              <span class="text-gray-700">{{ p.nombre }} · {{ p.talla || '—' }} · {{ p.color || '—' }}
                <span class="text-gray-400">Bs {{ p.venta.toFixed(2) }} · existencia {{ stock().get(p.idProducto) ?? 0 }}</span></span>
              <button (click)="agregar(p)" class="ys-btn-sec py-1">Agregar</button>
            </div>
            <p *ngIf="!coincidencias().length" class="py-2 text-xs text-gray-400">Ese producto no está disponible sin conexión.</p>
          </div>
        </div>

        <div *ngIf="lineas().length" class="ys-tarjeta p-4 space-y-2">
          <div *ngFor="let l of lineas()" class="flex items-center justify-between gap-3 text-sm">
            <div class="min-w-0">
              <p class="text-gray-900 truncate">{{ l.nombre }}</p>
              <p *ngIf="l.stockNoConfirmado" class="text-[11px] text-amber-700">Stock no confirmado: se revisa al sincronizar</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button (click)="ajustar(l, -1)" class="ys-btn-sec px-2 py-0.5">−</button>
              <span class="w-5 text-center">{{ l.cantidad }}</span>
              <button (click)="ajustar(l, 1)" [disabled]="!puedeSumar(l)" class="ys-btn-sec px-2 py-0.5">+</button>
              <span class="w-24 text-right font-semibold text-gray-900">Bs {{ (l.cantidad * l.precioUnitario).toFixed(2) }}</span>
            </div>
          </div>
          <p class="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900"><span>Total</span><span data-testid="total-venta">Bs {{ total().toFixed(2) }}</span></p>
        </div>

        <div *ngIf="lineas().length" class="ys-tarjeta p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <app-local-customer #selector [valor]="cliente()" (valorChange)="cambiarCliente($event)"></app-local-customer>
          <div class="space-y-2">
            <span class="ys-etiqueta">Pago</span>
            <div class="flex gap-2">
              <button type="button" class="ys-opcion ys-opcion-activa">Efectivo</button>
              <button *ngFor="let m of mediosNoDisponibles" type="button" (click)="medioNoDisponible()" class="ys-opcion opacity-50">{{ m }}</button>
            </div>
            <label class="block"><span class="ys-mini">Monto recibido</span>
              <input type="number" min="0" step="0.01" class="ys-campo" [ngModel]="recibido()" (ngModelChange)="cambiarRecibido($event)" name="recibido" /></label>
            <p class="text-sm" [ngClass]="cambio() === null ? 'text-rose-600' : 'text-gray-700'">
              {{ cambio() === null ? 'El monto recibido no cubre el total' : 'Cambio: Bs ' + cambio()!.toFixed(2) }}
            </p>
            <button (click)="confirmar()" [disabled]="cambio() === null || guardando()" class="ys-btn w-full">Confirmar recepción del efectivo</button>
          </div>
        </div>
      </ng-container>
    </div>

    <app-provisional-receipt *ngIf="recibo() as r" [recibo]="r" (cerrar)="recibo.set(null)"></app-provisional-receipt>
  `,
})
export class OfflineSaleComponent implements OnInit {
  @Output() irCaja = new EventEmitter<void>();
  @ViewChild('selector') selector?: LocalCustomerComponent;

  readonly mediosNoDisponibles = ['Tarjeta', 'QR', 'Nota de crédito'];
  readonly catalogo = signal<ProductoLocal[]>([]);
  readonly stock = signal<Map<number, number>>(new Map());
  readonly busqueda = signal('');
  readonly lineas = signal<LineaTicket[]>([]);
  readonly cliente = signal<ClienteElegido>(CLIENTE_GENERICO);
  readonly recibido = signal<number | null>(null);
  readonly recibo = signal<ReciboProvisional | null>(null);
  readonly guardando = signal(false);
  readonly recuperado = signal(false);
  readonly pedirPin = signal(false);
  pin = '';

  readonly total = computed(() => this.lineas().reduce((s, l) => s + l.cantidad * l.precioUnitario, 0));
  readonly cambio = computed(() => calcularCambio(this.total(), this.recibido() ?? 0));
  readonly cajaAbierta = computed(() => {
    const prep = this.offlineSync.preparacion();
    const caja = this.offlineSync.caja();
    return !!prep && !!caja && caja.codigoSucursal === prep.codigoSucursal;
  });
  readonly habilitada = computed(() => this.cajaAbierta() && !this.pedirPin());
  readonly coincidencias = computed(() => {
    const terminos = this.busqueda().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.catalogo()
      .filter(p => {
        const texto = [p.nombre, p.codigo, p.tipo, p.talla, p.color].join(' ').toLowerCase();
        return terminos.every(t => texto.includes(t));
      })
      .slice(0, 25);
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
    this.pedirPin.set(this.offlineSync.necesitaPin());
    const borrador = await this.offlineSync.leerBorrador<Borrador>(CLAVE_BORRADOR_VENTA);
    if (borrador?.lineas.length) {
      this.lineas.set(borrador.lineas);
      this.cliente.set(borrador.cliente);
      this.recibido.set(borrador.recibido);
      this.recuperado.set(true);
    }
  }

  async verificarPin(): Promise<void> {
    if (await this.offlineSync.verificarPin(this.pin)) {
      this.pedirPin.set(false);
    } else {
      this.notificationService.error('PIN incorrecto', 'Vuelva a intentarlo.');
    }
    this.pin = '';
  }

  private guardarBorrador(): void {
    const borrador: Borrador | null = this.lineas().length
      ? { lineas: this.lineas(), cliente: this.cliente(), recibido: this.recibido() }
      : null;
    void this.offlineSync.guardarBorrador(CLAVE_BORRADOR_VENTA, borrador);
  }

  /** Lector de códigos: escribe el código y pulsa Enter. */
  escanear(): void {
    const codigo = this.busqueda().trim().toLowerCase();
    const producto = this.catalogo().find(p => p.codigo.toLowerCase() === codigo);
    if (producto) {
      this.agregar(producto);
      this.busqueda.set('');
    }
  }

  puedeSumar(l: LineaTicket): boolean {
    return l.stockNoConfirmado || l.cantidad < l.existencia;
  }

  agregar(p: ProductoLocal): void {
    const existencia = this.stock().get(p.idProducto) ?? 0;
    const existente = this.lineas().find(l => l.idProducto === p.idProducto);
    if (existente) {
      this.ajustar(existente, 1);
      return;
    }
    const permiteSinStock = this.offlineSync.preparacion()?.configuracion.permiteVentaSinStock ?? false;
    if (existencia <= 0 && !permiteSinStock) {
      this.notificationService.warning('Sin existencia', `${p.nombre}: la existencia local conocida es cero.`);
      return;
    }
    const nombre = [p.nombre, p.talla, p.color].filter(Boolean).join(' · ');
    this.lineas.update(lineas => [
      ...lineas,
      { idProducto: p.idProducto, nombre, cantidad: 1, precioUnitario: p.venta, existencia, stockNoConfirmado: existencia <= 0 },
    ]);
    this.busqueda.set('');
    this.guardarBorrador();
  }

  ajustar(linea: LineaTicket, delta: number): void {
    if (delta > 0 && !this.puedeSumar(linea)) {
      this.notificationService.warning('Sin existencia', 'No hay más unidades conocidas de esa prenda.');
      return;
    }
    this.lineas.update(lineas =>
      lineas
        .map(l => (l.idProducto === linea.idProducto ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter(l => l.cantidad > 0),
    );
    this.guardarBorrador();
  }

  cambiarCliente(cliente: ClienteElegido): void {
    this.cliente.set(cliente);
    if (this.selector) this.selector.valor = cliente;
    this.guardarBorrador();
  }

  cambiarRecibido(valor: number | null): void {
    this.recibido.set(valor);
    this.guardarBorrador();
  }

  medioNoDisponible(): void {
    this.notificationService.warning('Solo efectivo', 'Sin conexión solo se aceptan pagos en efectivo.');
  }

  async confirmar(): Promise<void> {
    const prep = this.offlineSync.preparacion();
    const caja = this.offlineSync.caja();
    const cambio = this.cambio();
    if (!prep || !caja || cambio === null || this.guardando()) return;
    if (this.selector?.incompleto) {
      this.notificationService.warning('Faltan datos', 'El cliente nuevo necesita nombre y CI.');
      return;
    }
    this.guardando.set(true);
    const cliente = this.cliente();
    const lineas = this.lineas();
    const total = this.total();
    const recibido = this.recibido() ?? 0;
    const operacion = await this.offlineSync.registrarOperacion({
      tipo: 'venta',
      codigoSucursal: prep.codigoSucursal,
      total,
      resumen: `Venta · ${lineas.length} prenda(s) · ${cliente.nombre}`,
      datos: {
        idCliente: cliente.idCliente,
        clienteNuevo: cliente.clienteNuevo,
        clienteNombre: cliente.nombre,
        items: lineas.map(l => ({
          idProducto: l.idProducto, cantidad: l.cantidad, precioUnitario: l.precioUnitario, nombre: l.nombre,
          stockNoConfirmado: l.stockNoConfirmado,
        })),
        total,
        formaPago: 'Efectivo',
        montoRecibido: recibido,
        uuidCaja: caja.uuidOperacion,
      },
    });
    this.guardando.set(false);
    if (!operacion) return;
    this.recibo.set({
      titulo: 'Venta de contado',
      uuid: operacion.uuidOperacion,
      fecha: operacion.fechaOperacion,
      cliente: cliente.nombre,
      lineas: lineas.map(l => ({ detalle: `${l.cantidad} × ${l.nombre}`, importe: l.cantidad * l.precioUnitario })),
      total,
      extras: [
        { etiqueta: 'Efectivo recibido', valor: `Bs ${recibido.toFixed(2)}` },
        { etiqueta: 'Cambio', valor: `Bs ${cambio.toFixed(2)}` },
      ],
      leyenda: 'Sujeto a confirmación del servidor',
    });
    this.lineas.set([]);
    this.cliente.set(CLIENTE_GENERICO);
    this.recibido.set(null);
    this.recuperado.set(false);
    this.guardarBorrador();
  }
}
