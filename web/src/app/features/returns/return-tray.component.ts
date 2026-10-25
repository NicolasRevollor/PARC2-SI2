import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SalesService } from '../../core/services/sales.service';
import {
  ESTADOS_ABIERTOS,
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO,
  ReturnsService,
  claseEstado,
} from '../../core/services/returns.service';
import { DevolucionOut, MetodoReembolso, PoliticaDevolucion } from '../../core/models';
import { ReturnInspectComponent } from './return-inspect.component';
import { ReturnResolveComponent } from './return-resolve.component';
import { ReturnDetailComponent } from './return-detail.component';

type Accion = 'inspeccionar' | 'resolver' | 'completar' | 'revisar' | 'detalle';

/**
 * Bandeja de casos abiertos: solicitudes en línea pendientes de entrega
 * (CU2), en inspección (CU3), en revisión del Administrador, aprobadas por
 * resolver (CU4–CU7), cambios pendientes por stock (CU8) y los que esperan
 * la autorización del Encargado.
 */
@Component({
  selector: 'app-return-tray',
  standalone: true,
  imports: [CommonModule, FormsModule, ReturnInspectComponent, ReturnResolveComponent, ReturnDetailComponent],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-2">
          <input type="text" [(ngModel)]="codigo" (keyup.enter)="abrirCodigo()" placeholder="Código DEV-… (o QR)" class="ys-filtro font-mono uppercase w-44" />
          <button (click)="abrirCodigo()" class="ys-btn-sec"><span class="material-symbols-outlined text-[16px]">qr_code_scanner</span> Abrir</button>
        </div>
        <div class="flex flex-wrap gap-1 sm:ml-auto">
          <button *ngFor="let f of filtros" (click)="filtro.set(f[0])" class="ys-opcion py-1.5" [class.ys-opcion-activa]="filtro() === f[0]">
            {{ f[1] }} ({{ contar(f[0]) }})
          </button>
        </div>
      </div>

      <div *ngIf="cargando()" class="p-8 text-center text-sm text-gray-500">Cargando casos…</div>
      <div *ngIf="!cargando() && visibles().length === 0" class="ys-tarjeta p-8 text-center text-sm text-gray-500">
        No hay casos {{ filtro() === 'todos' ? 'abiertos' : 'en este estado' }}.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div *ngFor="let c of visibles()" class="ys-tarjeta p-5 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="ys-mini">{{ c.origen === 'en_linea' ? 'En línea' : 'Tienda' }} · {{ c.fecha | date: 'dd/MM HH:mm' }}</p>
              <p class="text-sm font-bold text-gray-900"><span class="font-mono">{{ c.codigo }}</span> · {{ c.cliente_nombre }}</p>
            </div>
            <span class="ys-chip" [ngClass]="clase(c.estado)">{{ etiqueta(estados, c.estado) }}</span>
          </div>
          <div class="text-xs text-gray-700 space-y-1">
            <p><span class="font-semibold">Prenda:</span> {{ c.producto_nombre }} talla {{ c.tallaOriginal }} · {{ c.cantidad }} u. · venta #{{ c.idVenta }}</p>
            <p><span class="font-semibold">Motivo:</span> {{ etiqueta(motivos, c.motivoCategoria || '') }}<span *ngIf="c.motivo"> — {{ c.motivo }}</span></p>
            <p><span class="font-semibold">Pide:</span> {{ etiqueta(tipos, c.tipo) }}
              <span *ngIf="c.producto_nuevo_nombre"> → {{ c.producto_nuevo_nombre }} talla {{ c.tallaNueva }}</span></p>
            <p *ngIf="c.estado === 'PendienteEntrega'" class="text-amber-700">Debe entregarla en {{ c.sucursal_nombre }} hasta el {{ c.fechaLimiteEntrega | date: 'dd/MM/yyyy' }}</p>
            <p *ngIf="c.estado === 'CambioPendiente'" class="text-amber-700">
              {{ c.opcionSinStock === 'espera' ? 'Lista de espera' : 'Apartada en ' + c.sucursal_entrega_nombre }}
              <span *ngIf="c.fechaLimiteRetiro"> · retirar hasta {{ c.fechaLimiteRetiro | date: 'dd/MM' }}</span>
              <span *ngIf="c.diferencia > 0"> · paga Bs {{ c.diferencia.toFixed(2) }} al retirar</span></p>
            <p *ngIf="c.recargo > 0">Recargo por demora: Bs {{ c.recargo.toFixed(2) }}</p>
            <p *ngIf="esperaAutorizacion(c)" class="text-amber-700 font-semibold">
              <span class="material-symbols-outlined text-[14px] align-middle">lock</span> {{ c.motivoAutorizacion }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2 pt-1">
            <button *ngIf="esperaAutorizacion(c) && puede('devolucion.autorizar')" (click)="autorizar(c)" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">verified_user</span> Autorizar
            </button>
            <button *ngIf="(c.estado === 'PendienteEntrega' || c.estado === 'EnInspeccion') && puede('devolucion.inspeccionar') && !esperaAutorizacion(c)"
                    (click)="abrir('inspeccionar', c)" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">fact_check</span> Inspeccionar
            </button>
            <button *ngIf="c.estado === 'EnRevision' && puede('tenant.admin')" (click)="abrir('revisar', c)" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">gavel</span> Revisar
            </button>
            <button *ngIf="c.estado === 'Aprobada' && puede('devolucion.registrar')" (click)="abrir('resolver', c)" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">task_alt</span> Resolver
            </button>
            <button *ngIf="c.estado === 'CambioPendiente' && puede('devolucion.registrar')" (click)="abrir('completar', c)" class="ys-btn">
              <span class="material-symbols-outlined text-[16px]">inventory</span> Entregar cambio
            </button>
            <button (click)="abrir('detalle', c)" class="ys-btn-sec">Detalle</button>
            <button *ngIf="['PendienteEntrega', 'EnInspeccion', 'EnRevision', 'Aprobada'].includes(c.estado) && puede('devolucion.registrar')"
                    (click)="cancelar(c)" class="ys-btn-sec">Cancelar</button>
          </div>
        </div>
      </div>
    </div>

    <app-return-inspect *ngIf="accion() === 'inspeccionar' && seleccionado() as c" [caso]="c" [politica]="politica"
                        (cerrar)="cerrar()" (listo)="inspeccionado($event)"></app-return-inspect>
    <app-return-resolve *ngIf="accion() === 'resolver' && seleccionado() as c" [caso]="c" [politica]="politica"
                        (cerrar)="cerrar()" (resuelto)="terminado()" (cambio)="cargar()"></app-return-resolve>
    <app-return-detail *ngIf="accion() === 'detalle' && seleccionado() as c" [idDevolucion]="c.idDevolucion" (cerrar)="cerrar()"></app-return-detail>

    <!-- CU3 alternativo 5: revisión del Administrador -->
    <div *ngIf="accion() === 'revisar' && seleccionado() as c" class="ys-modal">
      <div class="ys-modal-caja max-w-lg space-y-4">
        <div>
          <span class="ys-mini text-indigo-600">Revisión · {{ c.codigo }}</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">El cliente no acepta la inspección</h3>
          <p class="text-xs text-gray-500 mt-1">Inspección: {{ c.condicion }} · {{ c.notasInspeccion }}</p>
          <p *ngIf="c.motivoRechazo" class="text-xs text-rose-600">{{ c.motivoRechazo }}</p>
        </div>
        <textarea rows="2" [(ngModel)]="motivoRevision" placeholder="Decisión y motivo" class="ys-campo"></textarea>
        <div class="flex gap-2">
          <button (click)="revisar(c, true)" [disabled]="motivoRevision.trim().length < 3" class="ys-btn flex-1">Aprobar</button>
          <button (click)="revisar(c, false)" [disabled]="motivoRevision.trim().length < 3" class="ys-btn-sec flex-1">Rechazar</button>
          <button (click)="cerrar()" class="ys-btn-sec">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- CU8 paso 5: el cliente retira el cambio pendiente -->
    <div *ngIf="accion() === 'completar' && seleccionado() as c" class="ys-modal">
      <div class="ys-modal-caja max-w-lg space-y-4">
        <div>
          <span class="ys-mini text-indigo-600">Cambio pendiente · {{ c.codigo }}</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">{{ c.producto_nuevo_nombre }} talla {{ c.tallaNueva }}</h3>
          <p class="text-xs text-gray-500 mt-1">{{ c.opcionSinStock === 'espera' ? 'Lista de espera' : 'Apartada en ' + c.sucursal_entrega_nombre }}</p>
        </div>
        <div class="space-y-2 text-xs text-gray-700">
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="acc" [checked]="opcion() === 'entregar'" (change)="opcion.set('entregar')" /> Entregar la prenda</label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="acc" [checked]="opcion() === 'nota_credito'" (change)="opcion.set('nota_credito')" /> El cliente prefiere nota de crédito</label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="acc" [checked]="opcion() === 'reembolso'" (change)="opcion.set('reembolso')" /> El cliente prefiere el dinero</label>
        </div>
        <div *ngIf="opcion() === 'entregar' && c.diferencia > 0" class="text-xs p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
          <p>Diferencia a cobrar: <span class="font-bold">Bs {{ c.diferencia.toFixed(2) }}</span></p>
          <button *ngIf="!idPago()" (click)="cobrar(c.diferencia)" class="ys-btn-sec">Cobrar en efectivo</button>
          <p *ngIf="idPago()" class="text-emerald-700 font-semibold">Cobrada (pago #{{ idPago() }}).</p>
        </div>
        <div *ngIf="opcion() === 'reembolso'" class="flex gap-2">
          <select [(ngModel)]="medio" class="ys-filtro"><option value="efectivo">Efectivo</option><option value="qr">Transferencia</option><option value="tarjeta">Tarjeta</option></select>
          <input *ngIf="medio === 'qr'" [(ngModel)]="cuenta" placeholder="Cuenta de destino" class="ys-filtro flex-1" />
        </div>
        <div class="flex gap-2">
          <button (click)="completar(c)" [disabled]="opcion() === 'entregar' && c.diferencia > 0 && !idPago()" class="ys-btn flex-1">Cerrar el caso</button>
          <button (click)="cerrar()" class="ys-btn-sec">Cancelar</button>
        </div>
      </div>
    </div>
  `,
})
export class ReturnTrayComponent implements OnInit {
  @Input() politica: PoliticaDevolucion | null = null;
  @Output() cambio = new EventEmitter<void>();

  readonly estados = ETIQUETA_ESTADO;
  readonly motivos = ETIQUETA_MOTIVO;
  readonly tipos = ETIQUETA_TIPO;
  readonly filtros: [string, string][] = [
    ['todos', 'Abiertos'],
    ['PendienteEntrega', 'Por entregar'],
    ['EnInspeccion', 'En inspección'],
    ['EnRevision', 'En revisión'],
    ['Aprobada', 'Por resolver'],
    ['CambioPendiente', 'Cambios pendientes'],
    ['autorizacion', 'Por autorizar'],
  ];

  readonly casos = signal<DevolucionOut[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly filtro = signal<string>('todos');
  readonly accion = signal<Accion | null>(null);
  readonly seleccionado = signal<DevolucionOut | null>(null);
  readonly opcion = signal<'entregar' | 'nota_credito' | 'reembolso'>('entregar');
  readonly idPago = signal<number | null>(null);
  codigo = '';
  motivoRevision = '';
  medio: MetodoReembolso = 'efectivo';
  cuenta = '';

  readonly visibles = computed(() => {
    const f = this.filtro();
    if (f === 'todos') return this.casos();
    if (f === 'autorizacion') return this.casos().filter((c) => this.esperaAutorizacion(c));
    return this.casos().filter((c) => c.estado === f);
  });

  constructor(
    private returnsService: ReturnsService,
    private salesService: SalesService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    const casos = await this.returnsService.consultar({ estado: ESTADOS_ABIERTOS });
    this.casos.set([...casos].sort((a, b) => a.fecha.localeCompare(b.fecha)));
    this.cargando.set(false);
  }

  puede(permiso: string): boolean {
    return this.authService.currentUser()?.permisos.includes(permiso) ?? false;
  }

  esperaAutorizacion(c: DevolucionOut): boolean {
    return c.requiereAutorizacion && !c.autorizador_nombre;
  }

  contar(f: string): number {
    if (f === 'todos') return this.casos().length;
    if (f === 'autorizacion') return this.casos().filter((c) => this.esperaAutorizacion(c)).length;
    return this.casos().filter((c) => c.estado === f).length;
  }

  etiqueta(mapa: Record<string, string>, valor: string): string {
    return mapa[valor] ?? valor;
  }

  clase(estado: string): string {
    return claseEstado(estado);
  }

  abrir(accion: Accion, caso: DevolucionOut): void {
    this.seleccionado.set(caso);
    this.accion.set(accion);
    this.opcion.set('entregar');
    this.idPago.set(null);
    this.motivoRevision = '';
  }

  /** Abrir para ver o atender un caso que no está a la vista. */
  abrirExterno(caso: DevolucionOut, accion: Accion): void {
    this.abrir(accion, caso);
  }

  async abrirCodigo(): Promise<void> {
    if (!this.codigo.trim()) return;
    const caso = await this.returnsService.porCodigo(this.codigo);
    if (caso) this.abrir(['PendienteEntrega', 'EnInspeccion'].includes(caso.estado) && this.puede('devolucion.inspeccionar') ? 'inspeccionar' : 'detalle', caso);
  }

  cerrar(): void {
    this.accion.set(null);
    this.seleccionado.set(null);
  }

  async terminado(): Promise<void> {
    this.cerrar();
    await this.cargar();
    this.cambio.emit();
  }

  /** CU3 paso 6: aprobada, deriva a la resolución pedida. */
  async inspeccionado(casos: DevolucionOut[]): Promise<void> {
    await this.terminado();
    const aprobado = casos.find((c) => c.estado === 'Aprobada');
    if (aprobado && this.puede('devolucion.registrar')) this.abrir('resolver', aprobado);
  }

  async autorizar(caso: DevolucionOut): Promise<void> {
    const motivo = prompt(`Autorizar ${caso.codigo}. Observación (opcional):`) ?? undefined;
    if (await this.returnsService.autorizar(caso.idDevolucion, motivo)) await this.terminado();
  }

  async revisar(caso: DevolucionOut, aprobada: boolean): Promise<void> {
    if (await this.returnsService.revisar(caso.idDevolucion, aprobada, this.motivoRevision.trim())) await this.terminado();
  }

  async cobrar(monto: number): Promise<void> {
    const pago = await this.salesService.crearMetodoEfectivo(monto);
    if (pago) this.idPago.set(pago.idMetPago);
  }

  async completar(caso: DevolucionOut): Promise<void> {
    const r = await this.returnsService.completarCambio(caso.idDevolucion, {
      accion: this.opcion(),
      idMetPagoDiferencia: this.idPago(),
      metodoReembolso: this.opcion() === 'reembolso' ? this.medio : null,
      cuentaDestino: this.medio === 'qr' ? this.cuenta.trim() || null : null,
    });
    if (r) await this.terminado();
  }

  async cancelar(caso: DevolucionOut): Promise<void> {
    if (!confirm(`¿Cancelar ${caso.codigo}? Se le devuelve la prenda al cliente.`)) return;
    if (await this.returnsService.cancelar(caso.idDevolucion)) await this.terminado();
  }
}
