import { Component, OnInit, ViewChild, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OfflineSyncService, ProductoLocal, ReservaLocal } from '../../core/services/offline-sync.service';
import { NotificationService } from '../../core/services/notification.service';
import { OperacionLocal, fechaLimiteReserva } from '../../core/offline-rules';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';
import { CLIENTE_GENERICO, ClienteElegido, LocalCustomerComponent } from './local-customer.component';
import { ProvisionalReceiptComponent, ReciboProvisional } from './provisional-receipt.component';

interface LineaReserva {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  existencia: number;
}

interface ReservaVista {
  clave: string;
  cliente: string;
  detalle: string;
  estado: string;
  deposito: number;
  local: OperacionLocal | null;
  servidor: ReservaLocal | null;
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU15] Registrar reserva de prendas sin conexion
// Boundary: ReservaSinConexionUI -> este componente
// Control: OfflineSyncService.registrarOperacion('reserva' y 'cancelar_reserva')
// Servidor (al sincronizar): services/operaciones_offline.py -> aplicar_reserva(), aplicar_cancelacion()
// ==================================================================
@Component({
  selector: 'app-offline-reservation',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent, LocalCustomerComponent, ProvisionalReceiptComponent],
  template: `
    <div class="space-y-4 max-w-4xl">
      <app-cu-badge cu="CU15" [conNombre]="true"></app-cu-badge>
      <div *ngIf="!offlineSync.preparacion()" class="ys-tarjeta p-4 text-sm text-amber-700">Prepare el dispositivo primero (CU12).</div>

      <ng-container *ngIf="offlineSync.preparacion() as prep">
        <div class="ys-tarjeta p-4 space-y-3">
          <p class="ys-etiqueta">Nueva reserva</p>
          <app-local-customer #selector [valor]="cliente()" (valorChange)="cambiarCliente($event)"></app-local-customer>
          <input [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" name="buscarReserva" class="ys-campo" placeholder="Prenda que desea apartar" />
          <div *ngIf="busqueda()" class="max-h-44 overflow-y-auto divide-y divide-gray-100">
            <div *ngFor="let p of coincidencias()" class="py-1.5 flex items-center justify-between gap-2 text-xs">
              <span class="text-gray-700">{{ p.nombre }} · {{ p.talla || '—' }} · {{ p.color || '—' }}
                <span class="text-gray-400">existencia {{ stock().get(p.idProducto) ?? 0 }}</span></span>
              <button (click)="agregar(p)" [disabled]="(stock().get(p.idProducto) ?? 0) <= 0" class="ys-btn-sec py-1">Apartar</button>
            </div>
            <p *ngIf="!coincidencias().length" class="py-2 text-xs text-gray-400">Ese producto no está disponible sin conexión.</p>
          </div>
          <div *ngFor="let l of lineas()" class="flex items-center justify-between text-sm">
            <span class="text-gray-900">{{ l.cantidad }} × {{ l.nombre }}</span>
            <button (click)="quitar(l)" class="text-rose-500 cursor-pointer bg-transparent"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
          <div *ngIf="lineas().length" class="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100 pt-3">
            <div>
              <span class="ys-mini">Retiro hasta</span>
              <p class="text-sm font-bold text-gray-900" data-testid="limite-reserva">{{ limite() | date: 'dd/MM/yyyy HH:mm' }}</p>
            </div>
            <label class="block"><span class="ys-mini">Depósito en efectivo (opcional)</span>
              <input type="number" min="0" step="0.01" class="ys-campo" [(ngModel)]="deposito" name="deposito" /></label>
            <p *ngIf="deposito > 0 && !cajaAbierta()" class="sm:col-span-2 text-xs text-amber-700">Para recibir un depósito la caja debe estar abierta (CU20).</p>
            <button (click)="confirmar()" [disabled]="deposito > 0 && !cajaAbierta()" class="ys-btn sm:col-span-2">Registrar reserva</button>
          </div>
        </div>

        <div class="ys-tarjeta p-4 space-y-2">
          <p class="ys-etiqueta">Reservas de la sucursal</p>
          <p *ngIf="!vistas().length" class="text-xs text-gray-400">No hay reservas vigentes.</p>
          <div *ngFor="let r of vistas()" class="flex items-center justify-between gap-3 text-xs py-1 border-b border-gray-50 last:border-0">
            <div class="min-w-0">
              <p class="text-gray-900 font-semibold truncate">{{ r.cliente }} · {{ r.detalle }}</p>
              <p class="text-gray-500">{{ r.estado }}<span *ngIf="r.deposito"> · depósito Bs {{ r.deposito.toFixed(2) }}</span></p>
            </div>
            <button (click)="cancelar(r)" class="ys-btn-sec py-1">Cancelar</button>
          </div>
        </div>
      </ng-container>
    </div>

    <app-provisional-receipt *ngIf="recibo() as r" [recibo]="r" (cerrar)="recibo.set(null)"></app-provisional-receipt>
  `,
})
export class OfflineReservationComponent implements OnInit {
  @ViewChild('selector') selector?: LocalCustomerComponent;

  readonly catalogo = signal<ProductoLocal[]>([]);
  readonly stock = signal<Map<number, number>>(new Map());
  readonly servidor = signal<ReservaLocal[]>([]);
  readonly busqueda = signal('');
  readonly lineas = signal<LineaReserva[]>([]);
  readonly cliente = signal<ClienteElegido>(CLIENTE_GENERICO);
  readonly recibo = signal<ReciboProvisional | null>(null);
  deposito = 0;

  readonly cajaAbierta = computed(() => {
    const caja = this.offlineSync.caja();
    return !!caja && caja.codigoSucursal === this.offlineSync.preparacion()?.codigoSucursal;
  });
  readonly limite = computed(() =>
    fechaLimiteReserva(new Date(), this.offlineSync.preparacion()?.configuracion.horasRetiroReserva ?? 48),
  );
  readonly coincidencias = computed(() => {
    const terminos = this.busqueda().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.catalogo()
      .filter(p => {
        const texto = [p.nombre, p.codigo, p.talla, p.color].join(' ').toLowerCase();
        return terminos.every(t => texto.includes(t));
      })
      .slice(0, 20);
  });
  /** Reservas del servidor más las registradas aquí, sin las canceladas. */
  readonly vistas = computed<ReservaVista[]>(() => {
    const operaciones = this.offlineSync.operaciones();
    const canceladas = new Set(operaciones.filter(o => o.tipo === 'cancelar_reserva').map(o => o.datos['uuidReserva']));
    const locales = operaciones
      .filter(o => o.tipo === 'reserva' && !canceladas.has(o.uuidOperacion) && !['Rechazada', 'Anulada'].includes(o.estado))
      .map<ReservaVista>(o => ({
        clave: o.uuidOperacion, cliente: (o.datos['clienteNombre'] as string) ?? 'Cliente', detalle: o.resumen, estado: o.estado,
        deposito: (o.datos['deposito'] as number) ?? 0, local: o, servidor: null,
      }));
    const delServidor = this.servidor()
      .filter(r => !canceladas.has(r.uuidOperacion) && !locales.some(l => l.clave === r.uuidOperacion))
      .map<ReservaVista>(r => ({
        clave: r.uuidOperacion, cliente: r.cliente ?? 'Cliente', detalle: `${r.lineas.length} prenda(s), retiro ${r.fecha}`, estado: r.estado,
        deposito: r.montoDeposito, local: null, servidor: r,
      }));
    return [...locales, ...delServidor];
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
    this.servidor.set(await this.offlineSync.reservasLocales());
  }

  cambiarCliente(cliente: ClienteElegido): void {
    this.cliente.set(cliente);
    if (this.selector) this.selector.valor = cliente;
  }

  agregar(p: ProductoLocal): void {
    const existencia = this.stock().get(p.idProducto) ?? 0;
    const actual = this.lineas().find(l => l.idProducto === p.idProducto);
    if ((actual?.cantidad ?? 0) >= existencia) {
      this.notificationService.warning('Sin existencia', 'No se puede reservar esa variante: no hay más unidades.');
      return;
    }
    if (actual) {
      this.lineas.update(ls => ls.map(l => (l === actual ? { ...l, cantidad: l.cantidad + 1 } : l)));
    } else {
      const nombre = [p.nombre, p.talla, p.color].filter(Boolean).join(' · ');
      this.lineas.update(ls => [...ls, { idProducto: p.idProducto, nombre, cantidad: 1, precioUnitario: p.venta, existencia }]);
    }
    this.busqueda.set('');
  }

  quitar(linea: LineaReserva): void {
    this.lineas.update(ls => ls.filter(l => l !== linea));
  }

  async confirmar(): Promise<void> {
    const prep = this.offlineSync.preparacion();
    if (!prep) return;
    if (this.selector?.incompleto) {
      this.notificationService.warning('Faltan datos', 'El cliente nuevo necesita nombre y CI.');
      return;
    }
    const cliente = this.cliente();
    const lineas = this.lineas();
    const limite = this.limite();
    const deposito = this.deposito || 0;
    const operacion = await this.offlineSync.registrarOperacion({
      tipo: 'reserva',
      codigoSucursal: prep.codigoSucursal,
      total: deposito,
      resumen: lineas.map(l => `${l.cantidad} × ${l.nombre}`).join(', '),
      datos: {
        idCliente: cliente.idCliente,
        clienteNuevo: cliente.clienteNuevo,
        clienteNombre: cliente.nombre,
        items: lineas.map(l => ({ idProducto: l.idProducto, cantidad: l.cantidad, precioUnitario: l.precioUnitario, nombre: l.nombre })),
        fechaLimite: limite.toISOString(),
        deposito,
        uuidCaja: this.offlineSync.caja()?.uuidOperacion ?? null,
      },
    });
    if (!operacion) return;
    this.recibo.set({
      titulo: 'Reserva de prendas',
      uuid: operacion.uuidOperacion,
      fecha: operacion.fechaOperacion,
      cliente: cliente.nombre,
      lineas: lineas.map(l => ({ detalle: `${l.cantidad} × ${l.nombre}`, importe: l.cantidad * l.precioUnitario })),
      total: lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0),
      extras: [
        { etiqueta: 'Depósito', valor: `Bs ${deposito.toFixed(2)}` },
        { etiqueta: 'Retiro hasta', valor: limite.toLocaleString('es-BO') },
      ],
      leyenda: 'La reserva será confirmada al restablecerse la conexión',
    });
    this.lineas.set([]);
    this.cliente.set(CLIENTE_GENERICO);
    this.deposito = 0;
  }

  /** [CU15] flujo alternativo 3: la cancelación también se sincroniza. */
  async cancelar(r: ReservaVista): Promise<void> {
    const prep = this.offlineSync.preparacion();
    if (!prep) return;
    await this.offlineSync.registrarOperacion({
      tipo: 'cancelar_reserva',
      codigoSucursal: prep.codigoSucursal,
      total: r.deposito,
      resumen: `Cancelar reserva de ${r.cliente}`,
      dependeDe: r.local?.uuidOperacion ?? null,
      datos: {
        uuidReserva: r.clave,
        codigoReserva: r.servidor?.codigoReserva ?? null,
        devolverDeposito: r.deposito,
        uuidCaja: this.offlineSync.caja()?.uuidOperacion ?? null,
        liberar: r.servidor?.lineas ?? [],
      },
    });
    this.notificationService.info('Reserva cancelada', 'Se liberó la existencia apartada; la cancelación se sincroniza con el resto.');
  }
}
