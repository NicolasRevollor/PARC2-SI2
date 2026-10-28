import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InventoryLocation, InventoryStockEntry, PaginatedProducts, ProductOut, VentaIn } from '../models';
import { LocalDbService, OperacionPendiente } from './local-db.service';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/** Endpoint al que se reenvía cada tipo de operación encolada. */
const DESTINO: Record<OperacionPendiente['tipo'], string> = {
  venta: '/api/sales',
  venta_efectivo: '/api/sales',
  devolucion: '/api/returns',
};

/** Payload de una venta en efectivo registrada sin conexion. */
export interface VentaEfectivoOffline {
  monto: number;
  venta: VentaIn;
}

const CLAVE_ULTIMA_SYNC = 'ultimaSincronizacion';

/**
 * UUID de la operación y hora real en el dispositivo (RF05/RNF05): si la
 * venta se reenvía después de que el servidor ya la aplicó (la respuesta se
 * perdió), el servidor la reconoce por el UUID y no la duplica.
 */
function conIdentificador(venta: VentaIn): VentaIn {
  return {
    ...venta,
    uuidOperacion: venta.uuidOperacion ?? crypto.randomUUID(),
    fechaOperacion: venta.fechaOperacion ?? new Date().toISOString(),
  };
}

/**
 * Modo sin conexión (CU30): snapshot local + cola de operaciones.
 *
 * Reparto de responsabilidades con el service worker: el SW cachea GETs
 * para que la app ABRA sin red; este servicio mantiene los DATOS de negocio
 * en IndexedDB y reenvía lo que se hizo offline cuando vuelve la conexión.
 *
 * Una operación encolada solo se borra cuando el servidor la aceptó. Si el
 * servidor la rechaza por una razón definitiva (4xx que no sea 401/408/429),
 * tampoco se reintenta en loop: queda marcada con el error para que alguien
 * la revise, porque reenviar una venta inválida mil veces no la va a volver
 * válida.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly enLineaSignal = signal<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  private readonly sincronizandoSignal = signal<boolean>(false);
  private readonly pendientesSignal = signal<number>(0);
  private readonly ultimaSyncSignal = signal<string | null>(null);
  private readonly snapshotListoSignal = signal<boolean>(false);

  readonly enLinea = this.enLineaSignal.asReadonly();
  readonly sincronizando = this.sincronizandoSignal.asReadonly();
  readonly pendientes = this.pendientesSignal.asReadonly();
  readonly ultimaSync = this.ultimaSyncSignal.asReadonly();
  readonly snapshotListo = this.snapshotListoSignal.asReadonly();

  readonly hayPendientes = computed(() => this.pendientesSignal() > 0);

  private iniciado = false;

  constructor(
    private http: HttpClient,
    private localDb: LocalDbService,
    private notificationService: NotificationService,
  ) {}

  /** Se llama una sola vez cuando hay sesión iniciada. */
  async iniciar(): Promise<void> {
    if (this.iniciado || !this.localDb.disponible) return;
    this.iniciado = true;

    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);

    this.ultimaSyncSignal.set(await this.localDb.getMeta<string>(CLAVE_ULTIMA_SYNC));
    await this.refrescarPendientes();
    this.snapshotListoSignal.set((await this.localDb.contar('catalogo')) > 0);

    if (this.enLineaSignal()) {
      await this.descargarSnapshot();
      await this.sincronizar();
    }
  }

  detener(): void {
    if (!this.iniciado) return;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.iniciado = false;
  }

  private onOnline = () => {
    this.enLineaSignal.set(true);
    this.notificationService.info('Conexión restablecida', 'Sincronizando lo que quedó pendiente…');
    void this.sincronizar().then(() => this.descargarSnapshot());
  };

  private onOffline = () => {
    this.enLineaSignal.set(false);
    this.notificationService.warning(
      'Sin conexión',
      'Seguís operando con la base local del dispositivo. Se sincroniza al volver la red.'
    );
  };

  private async refrescarPendientes(): Promise<void> {
    this.pendientesSignal.set(await this.localDb.contarPendientes());
  }

  // --- Snapshot ---------------------------------------------------------

  /** Baja catálogo, sucursales e inventario a la base local. */
  async descargarSnapshot(): Promise<boolean> {
    if (!this.localDb.disponible || !this.enLineaSignal()) return false;

    try {
      const [productos, sucursales, stock] = await Promise.all([
        firstValueFrom(
          // size=100 es el tope que acepta el backend (Query(le=100)).
          this.http.get<PaginatedProducts>(`${API_URL}/api/products`, { params: { page: 1, size: 100 } })
        ),
        firstValueFrom(this.http.get<InventoryLocation[]>(`${API_URL}/api/inventory/locations`)),
        firstValueFrom(this.http.get<InventoryStockEntry[]>(`${API_URL}/api/inventory/stock`)),
      ]);

      await Promise.all([
        this.localDb.guardarColeccion<ProductOut>('catalogo', productos.items),
        this.localDb.guardarColeccion<InventoryLocation>('sucursales', sucursales),
        this.localDb.guardarColeccion<InventoryStockEntry>('inventario', stock),
      ]);

      const ahora = new Date().toISOString();
      await this.localDb.setMeta(CLAVE_ULTIMA_SYNC, ahora);
      this.ultimaSyncSignal.set(ahora);
      this.snapshotListoSignal.set(productos.items.length > 0);
      return true;
    } catch {
      // Sin ruido: que no se pueda refrescar el snapshot no rompe nada, la
      // app sigue con el anterior.
      return false;
    }
  }

  async catalogoLocal(): Promise<ProductOut[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<ProductOut>('catalogo') : [];
  }

  async sucursalesLocales(): Promise<InventoryLocation[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<InventoryLocation>('sucursales') : [];
  }

  async inventarioLocal(): Promise<InventoryStockEntry[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<InventoryStockEntry>('inventario') : [];
  }

  // --- Cola de operaciones ---------------------------------------------

  /** Encola una venta hecha sin conexión. */
  async encolarVenta(payload: VentaIn): Promise<boolean> {
    if (!this.localDb.disponible) {
      this.notificationService.error(
        'Sin base local',
        'Este navegador no permite guardar datos sin conexión.'
      );
      return false;
    }
    await this.localDb.encolar('venta', conIdentificador(payload));
    await this.refrescarPendientes();
    this.notificationService.warning(
      'Venta guardada sin conexión',
      'Queda en la cola del dispositivo y se envía automáticamente al volver la red.'
    );
    return true;
  }

  /**
   * Venta en efectivo sin conexion. No se encola el `idMetPago` porque no
   * existe: se guarda el monto y la sincronizacion crea el metodo de pago
   * contra el servidor antes de mandar la venta.
   */
  async encolarVentaEfectivo(monto: number, venta: VentaIn): Promise<boolean> {
    if (!this.localDb.disponible) {
      this.notificationService.error(
        'Sin base local',
        'Este navegador no permite guardar datos sin conexion.'
      );
      return false;
    }
    await this.localDb.encolar('venta_efectivo', { monto, venta: conIdentificador(venta) } satisfies VentaEfectivoOffline);
    await this.refrescarPendientes();
    this.notificationService.warning(
      'Venta guardada sin conexion',
      'Queda en la cola del dispositivo y se envia automaticamente al volver la red.'
    );
    return true;
  }

  async encolarDevolucion(payload: unknown): Promise<boolean> {
    if (!this.localDb.disponible) return false;
    await this.localDb.encolar('devolucion', payload);
    await this.refrescarPendientes();
    return true;
  }

  /**
   * Un 4xx es definitivo (el cuerpo no va a volverse válido reintentando),
   * salvo los que sí dependen del contexto: 401 (token vencido), 408
   * (timeout) y 429 (rate limit).
   */
  private esErrorDefinitivo(status: number | undefined): boolean {
    if (status === undefined) return false;
    if ([401, 408, 429].includes(status)) return false;
    return status >= 400 && status < 500;
  }

  /** Reenvía la cola en orden. Devuelve cuántas operaciones se confirmaron. */
  async sincronizar(): Promise<number> {
    if (!this.localDb.disponible || !this.enLineaSignal() || this.sincronizandoSignal()) return 0;

    this.sincronizandoSignal.set(true);
    let confirmadas = 0;
    try {
      const cola = await this.localDb.pendientes();
      for (const operacion of cola) {
        try {
          await this.reenviar(operacion);
          if (operacion.id !== undefined) {
            await this.localDb.eliminarPendiente(operacion.id);
          }
          confirmadas += 1;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const detalle = (err as { error?: { detail?: string } })?.error?.detail ?? 'Error de red';
          await this.localDb.registrarFallo(operacion, detalle);

          if (this.esErrorDefinitivo(status)) {
            this.notificationService.error(
              'Operación rechazada por el servidor',
              `${detalle} Quedó marcada en la cola para revisión.`
            );
            continue; // la siguiente puede ser válida
          }
          break; // problema de red/sesión: cortar y reintentar después
        }
      }

      if (confirmadas > 0) {
        this.notificationService.success(
          'Sincronización completa',
          `Se enviaron ${confirmadas} operación(es) que estaban pendientes.`
        );
      }
      return confirmadas;
    } finally {
      await this.refrescarPendientes();
      this.sincronizandoSignal.set(false);
    }
  }

  /**
   * Reenvia una operacion de la cola. La venta en efectivo necesita dos
   * llamadas encadenadas (metodo de pago -> venta) porque el id del pago lo
   * genera el servidor y no existia al momento de encolar.
   */
  private async reenviar(operacion: OperacionPendiente): Promise<void> {
    if (operacion.tipo === 'venta_efectivo') {
      const { monto, venta } = operacion.payload as VentaEfectivoOffline;
      const metodo = await firstValueFrom(
        this.http.post<{ idMetPago: number }>(`${API_URL}/api/payment-methods`, {
          tipo: 'Efectivo',
          estado: 'Activo',
          monto,
        })
      );
      await firstValueFrom(
        this.http.post(`${API_URL}/api/sales`, { ...venta, idMetPago: metodo.idMetPago })
      );
      return;
    }
    await firstValueFrom(this.http.post(`${API_URL}${DESTINO[operacion.tipo]}`, operacion.payload));
  }

  async detallePendientes(): Promise<OperacionPendiente[]> {
    return this.localDb.disponible ? this.localDb.pendientes() : [];
  }

  /** Al cerrar sesión: el snapshot y la cola son del usuario, no del equipo. */
  async limpiar(): Promise<void> {
    if (!this.localDb.disponible) return;
    await this.localDb.limpiarTodo();
    this.pendientesSignal.set(0);
    this.ultimaSyncSignal.set(null);
    this.snapshotListoSignal.set(false);
  }
}
