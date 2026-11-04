import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  EstadoOperacion,
  InventarioLocal,
  LineaVentaLocal,
  OperacionLocal,
  PoliticaLocal,
  TipoOperacion,
  datosDesactualizados,
  efectivoDeOperaciones,
  esperaReintento,
  estaPendiente,
  existenciaLocal,
  ordenarCola,
  sesionVencida,
  sinConfirmar,
} from '../offline-rules';
import { ColeccionLocal, LocalDbService } from './local-db.service';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

const CLAVE_PREPARACION = 'preparacion';
const CLAVE_PROGRESO = 'progresoDescarga';
const CLAVE_PROPIETARIO = 'propietario';
const CLAVE_PIN = 'pin';
const CLAVE_VERIFICACION = 'ultimaVerificacion';
const CLAVE_CAJA = 'cajaLocal';
export const CLAVE_BORRADOR_VENTA = 'borradorVenta';

const TAM_PAGINA = 100;
const TAM_LOTE = 50;
/** Espacio aproximado de una prenda en IndexedDB: sirve para estimar, no para cobrar. */
const BYTES_POR_PRODUCTO = 2_048;
const MINIMO_PRODUCTOS_PARCIAL = 20;

const SECCIONES: { seccion: string; coleccion: ColeccionLocal | null; etiqueta: string }[] = [
  { seccion: 'sucursales', coleccion: 'sucursales', etiqueta: 'Sucursales autorizadas' },
  { seccion: 'productos', coleccion: 'catalogo', etiqueta: 'Productos y variantes' },
  { seccion: 'inventario', coleccion: 'inventario', etiqueta: 'Existencias' },
  { seccion: 'clientes', coleccion: 'clientes', etiqueta: 'Clientes frecuentes' },
  { seccion: 'reservas', coleccion: 'reservas', etiqueta: 'Reservas vigentes' },
  { seccion: 'ventas', coleccion: 'ventas', etiqueta: 'Ventas recientes' },
  { seccion: 'politica', coleccion: null, etiqueta: 'Política de devoluciones' },
];

export interface ConfiguracionOperacion {
  horasDatosVigentes: number;
  horasSesionSinConexion: number;
  permiteVentaSinStock: boolean;
  umbralDiferenciaCaja: number;
  umbralConflicto: number;
  horasRetiroReserva: number;
}

export interface Preparacion {
  idTenant: number;
  idUsuario: string;
  codigoSucursal: number;
  sucursalNombre: string;
  idClienteGenerico: number;
  configuracion: ConfiguracionOperacion;
  politica: PoliticaLocal | null;
  fechaDescarga: string | null;
  completa: boolean;
  parcial: boolean;
}

interface PreparacionServidor {
  idTenant: number;
  codigoSucursal: number;
  sucursalNombre: string;
  idClienteGenerico: number;
  configuracion: ConfiguracionOperacion;
  secciones: Record<string, number>;
}

interface PaginaSnapshot {
  seccion: string;
  pagina: number;
  total: number;
  hayMas: boolean;
  items: any[];
}

interface ProgresoDescarga {
  codigoSucursal: number;
  seccion: number;
  pagina: number;
  limiteProductos: number | null;
}

export interface ResultadoServidor {
  uuidOperacion: string;
  estado: 'Confirmada' | 'Rechazada' | 'En conflicto' | 'Anulada' | 'Reintentar' | 'Desconocida';
  idServidor: number | null;
  motivo: string | null;
  tipoConflicto: string | null;
}

export interface ProductoLocal {
  idProducto: number;
  codigo: string;
  nombre: string;
  tipo: string | null;
  talla: string | null;
  color: string | null;
  venta: number;
  idModelo: number | null;
  imagen_url: string | null;
}

export interface ClienteLocal {
  idCliente: number;
  nombre: string;
  telefono: string | null;
  ci: string | null;
}

export interface ReservaLocal {
  codigoReserva: number;
  uuidOperacion: string;
  estado: string;
  fecha: string;
  horario: string;
  idCliente: number;
  cliente: string | null;
  montoDeposito: number;
  lineas: { idProducto: number; cantidad: number }[];
}

export interface VentaLocal {
  idVenta: number | null;
  uuidOperacion: string;
  fecha: string;
  idCliente: number | null;
  cliente: string | null;
  ci: string | null;
  total: number;
  lineas: LineaVentaLocal[];
}

/** [CU20]: la caja de la sucursal, tal como la conoce este dispositivo. */
export interface CajaLocal {
  uuidOperacion: string;
  idCaja: number | null;
  codigoSucursal: number;
  montoInicial: number;
  fechaApertura: string;
  origen: 'en_linea' | 'sin_conexion';
  ingresosServidor: number;
  egresosServidor: number;
}

export interface NuevaOperacion {
  tipo: TipoOperacion;
  codigoSucursal: number | null;
  datos: Record<string, unknown>;
  total?: number;
  resumen: string;
  dependeDe?: string | null;
  uuidOperacion?: string;
}

/** Quién está usando el dispositivo (se lo pasa AuthService). */
interface Propietario {
  idUsuario: string;
  idTenant: number | null;
}

/**
 * Modo sin conexión: [CU12] preparación, [CU13] consultas locales, cola de
 * [CU14] [CU15] [CU19] [CU20] y [CU17] sincronización.
 *
 * Reparto de responsabilidades con el service worker: el SW cachea para que la
 * app ABRA sin red; este servicio mantiene los DATOS de negocio en IndexedDB y
 * entrega lo que se hizo sin conexión.
 *
 * Una operación nunca se borra del dispositivo (RF15): cambia de estado. Si la
 * red falla queda "Enviada" y se reintenta con esperas crecientes; el reenvío es
 * seguro porque el servidor reconoce el UUID (RNF05).
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly redSignal = signal<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly simuladoSignal = signal<boolean>(false);
  private readonly sincronizandoSignal = signal<boolean>(false);
  private readonly operacionesSignal = signal<OperacionLocal[]>([]);
  private readonly preparacionSignal = signal<Preparacion | null>(null);
  private readonly cajaSignal = signal<CajaLocal | null>(null);
  private readonly descargaSignal = signal<{ etiqueta: string; porcentaje: number } | null>(null);
  private readonly interrumpidaSignal = signal<boolean>(false);
  private readonly bloqueoSignal = signal<string | null>(null);
  private readonly sesionSignal = signal<boolean>(false);
  private readonly hayPinSignal = signal<boolean>(false);
  private readonly ultimaVerificacionSignal = signal<string | null>(null);
  private readonly relojSignal = signal<number>(Date.now());

  /** Red real y, para la demostración, modo sin conexión simulado. */
  readonly enLinea = computed(() => this.redSignal() && !this.simuladoSignal());
  readonly simulado = this.simuladoSignal.asReadonly();
  readonly sincronizando = this.sincronizandoSignal.asReadonly();
  readonly operaciones = this.operacionesSignal.asReadonly();
  readonly preparacion = this.preparacionSignal.asReadonly();
  readonly caja = this.cajaSignal.asReadonly();
  readonly descarga = this.descargaSignal.asReadonly();
  readonly descargaInterrumpida = this.interrumpidaSignal.asReadonly();
  /** [CU12] flujo alternativo 5: hay operaciones de otro usuario sin sincronizar. */
  readonly bloqueoPropietario = this.bloqueoSignal.asReadonly();
  /** [CU17] flujo alternativo 6: la sesión no se pudo renovar. */
  readonly sesionRequerida = this.sesionSignal.asReadonly();
  readonly hayPin = this.hayPinSignal.asReadonly();

  readonly pendientes = computed(() => this.operacionesSignal().filter(estaPendiente).length);
  readonly hayPendientes = computed(() => this.pendientes() > 0);
  readonly enConflicto = computed(() => this.operacionesSignal().filter(o => o.estado === 'En conflicto').length);
  readonly ultimaSync = computed(() => this.preparacionSignal()?.fechaDescarga ?? null);
  readonly dispositivoListo = computed(() => this.preparacionSignal()?.completa ?? false);
  /** [CU13] flujo alternativo 1. */
  readonly desactualizado = computed(() => {
    const prep = this.preparacionSignal();
    if (!prep) return false;
    return datosDesactualizados(prep.fechaDescarga, prep.configuracion.horasDatosVigentes, new Date(this.relojSignal()));
  });

  private iniciado = false;
  private propietario: Propietario | null = null;
  private temporizadorReintento: ReturnType<typeof setTimeout> | null = null;
  private fallosSeguidos = 0;

  constructor(
    private http: HttpClient,
    private localDb: LocalDbService,
    private notificationService: NotificationService,
  ) {}

  /** [CU12] flujo alternativo 2. */
  get compatible(): boolean {
    return this.localDb.disponible && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  /** Se llama una sola vez cuando hay sesión iniciada. */
  async iniciar(idUsuario: string, idTenant: number | null): Promise<void> {
    if (this.iniciado || !this.localDb.disponible) return;
    this.iniciado = true;
    this.propietario = { idUsuario, idTenant };

    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);

    await this.convertirColaAntigua();
    await this.revisarPropietario();
    await this.cargarEstadoLocal();

    if (this.enLinea()) {
      await this.marcarVerificacion();
      await this.sincronizar();
      await this.reanudarDescarga();
    }
  }

  detener(): void {
    if (!this.iniciado) return;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.temporizadorReintento) clearTimeout(this.temporizadorReintento);
    this.iniciado = false;
  }

  private onOnline = () => {
    this.redSignal.set(true);
    if (this.simuladoSignal()) return;
    this.alRecuperarConexion();
  };

  private onOffline = () => {
    this.redSignal.set(false);
    this.notificationService.warning('Sin conexión', 'Seguís operando con la base local del dispositivo. Se sincroniza al volver la red.');
  };

  private alRecuperarConexion(): void {
    this.notificationService.info('Conexión restablecida', 'Sincronizando lo que quedó pendiente…');
    void this.marcarVerificacion();
    void this.sincronizar().then(() => this.reanudarDescarga());
  }

  /** Para demostrar el modo sin conexión sin desconectar el equipo. */
  simularSinConexion(activar: boolean): void {
    this.simuladoSignal.set(activar);
    if (!activar && this.redSignal()) this.alRecuperarConexion();
  }

  private async cargarEstadoLocal(): Promise<void> {
    this.preparacionSignal.set(await this.localDb.getMeta<Preparacion>(CLAVE_PREPARACION));
    this.cajaSignal.set(await this.localDb.getMeta<CajaLocal>(CLAVE_CAJA));
    this.hayPinSignal.set((await this.localDb.getMeta(CLAVE_PIN)) !== null);
    this.ultimaVerificacionSignal.set(await this.localDb.getMeta<string>(CLAVE_VERIFICACION));
    await this.refrescarOperaciones();
    this.interrumpidaSignal.set((await this.localDb.getMeta(CLAVE_PROGRESO)) !== null);
  }

  private async refrescarOperaciones(): Promise<void> {
    const operaciones = await this.localDb.operaciones();
    this.operacionesSignal.set(operaciones.sort((a, b) => b.fechaOperacion.localeCompare(a.fechaOperacion)));
    this.relojSignal.set(Date.now());
  }

  /** La cola de la versión anterior no tenía estado: se convierte sin perder ventas. */
  private async convertirColaAntigua(): Promise<void> {
    const antiguas = await this.localDb.operacionesAntiguas();
    if (!antiguas.length) return;
    const catalogo = await this.localDb.leerColeccion<ProductoLocal>('catalogo');
    for (const vieja of antiguas) {
      const venta = vieja.tipo === 'venta_efectivo' ? vieja.payload.venta : vieja.payload;
      const items = (venta?.items ?? []).map((i: { idProducto: number; cantidad: number }) => ({
        ...i,
        precioUnitario: catalogo.find(p => p.idProducto === i.idProducto)?.venta ?? 0,
      }));
      const total = vieja.payload.monto ?? items.reduce((s: number, i: { precioUnitario: number; cantidad: number }) => s + i.precioUnitario * i.cantidad, 0);
      await this.localDb.guardarOperacion({
        id: vieja.id,
        uuidOperacion: venta?.uuidOperacion ?? crypto.randomUUID(),
        tipo: 'venta',
        estado: 'Registrada localmente',
        idTenant: null,
        idUsuario: null,
        codigoSucursal: venta?.codigoSucursal ?? null,
        fechaOperacion: venta?.fechaOperacion ?? vieja.creadoEn,
        dependeDe: null,
        total,
        resumen: 'Venta sin conexión',
        datos: { idCliente: venta?.idCliente, items, total, formaPago: 'Efectivo', montoRecibido: total },
        intentos: 0,
        ultimoIntento: null,
        fechaConfirmacion: null,
        idServidor: null,
        motivo: null,
        tipoConflicto: null,
      });
    }
  }

  /**
   * [CU12] flujo alternativo 5: los datos locales son de quien los descargó. Si
   * entra otro usuario, se reemplazan solo cuando no queda nada por entregar.
   */
  private async revisarPropietario(): Promise<void> {
    const actual = this.propietario!;
    const anterior = await this.localDb.getMeta<Propietario>(CLAVE_PROPIETARIO);
    const mismo = anterior !== null && anterior.idUsuario === actual.idUsuario && anterior.idTenant === actual.idTenant;
    if (anterior !== null && !mismo) {
      const sinEntregar = (await this.localDb.operaciones()).filter(sinConfirmar);
      const otraEmpresa = anterior.idTenant !== actual.idTenant;
      if (sinEntregar.length && otraEmpresa) {
        this.bloqueoSignal.set(
          `Este dispositivo tiene ${sinEntregar.length} operación(es) de otra empresa sin sincronizar. ` +
            'Inicie sesión con ese usuario para enviarlas antes de reemplazar los datos.',
        );
        return;
      }
      if (!sinEntregar.length) {
        await this.localDb.limpiarTodo();
      }
    }
    this.bloqueoSignal.set(null);
    await this.localDb.setMeta(CLAVE_PROPIETARIO, actual);
  }

  // --- [CU12] Preparar dispositivo ---------------------------------------

  private async espacioDisponible(): Promise<number | null> {
    if (!navigator.storage?.estimate) return null;
    const { quota, usage } = await navigator.storage.estimate();
    return quota === undefined || usage === undefined ? null : quota - usage;
  }

  /** Pasos 3 a 6: descarga por secciones, conservando lo ya bajado si se corta. */
  async preparar(codigoSucursal: number): Promise<boolean> {
    if (!this.enLinea() || this.bloqueoSignal()) return false;
    const progresoGuardado = await this.localDb.getMeta<ProgresoDescarga>(CLAVE_PROGRESO);
    const progreso: ProgresoDescarga =
      progresoGuardado?.codigoSucursal === codigoSucursal
        ? progresoGuardado
        : { codigoSucursal, seccion: 0, pagina: 1, limiteProductos: null };
    this.interrumpidaSignal.set(false);
    try {
      const servidor = await firstValueFrom(
        this.http.get<PreparacionServidor>(`${API_URL}/api/sync/preparacion`, { params: { codigoSucursal } }),
      );
      // [CU12] flujo alternativo 3: si no hay espacio, los de mayor rotación primero.
      const libre = await this.espacioDisponible();
      const necesario = servidor.secciones['productos'] * BYTES_POR_PRODUCTO;
      if (libre !== null && libre < necesario) {
        progreso.limiteProductos = Math.max(Math.floor(libre / BYTES_POR_PRODUCTO), MINIMO_PRODUCTOS_PARCIAL);
      }
      const total = Object.values(servidor.secciones).reduce((a, b) => a + b, 0) || 1;
      let bajadas = 0;
      let politica: PoliticaLocal | null = this.preparacionSignal()?.politica ?? null;

      for (let s = progreso.seccion; s < SECCIONES.length; s++) {
        const { seccion, coleccion, etiqueta } = SECCIONES[s];
        let pagina = s === progreso.seccion ? progreso.pagina : 1;
        let hayMas = true;
        while (hayMas) {
          await this.localDb.setMeta(CLAVE_PROGRESO, { ...progreso, seccion: s, pagina });
          this.descargaSignal.set({ etiqueta, porcentaje: Math.min(Math.round((bajadas / total) * 100), 99) });
          const datos = await firstValueFrom(
            this.http.get<PaginaSnapshot>(`${API_URL}/api/sync/snapshot/${seccion}`, {
              params: { codigoSucursal, pagina, tam: TAM_PAGINA },
            }),
          );
          if (coleccion === null) {
            politica = datos.items[0] as PoliticaLocal;
          } else {
            if (pagina === 1) await this.localDb.vaciar(coleccion);
            await this.localDb.agregarColeccion(coleccion, datos.items);
          }
          bajadas += datos.items.length;
          const topeProductos = seccion === 'productos' && progreso.limiteProductos !== null
            && pagina * TAM_PAGINA >= progreso.limiteProductos;
          hayMas = datos.hayMas && !topeProductos;
          pagina += 1;
        }
      }

      await this.actualizarCaja(codigoSucursal);
      const preparacion: Preparacion = {
        idTenant: servidor.idTenant,
        idUsuario: this.propietario?.idUsuario ?? '',
        codigoSucursal,
        sucursalNombre: servidor.sucursalNombre,
        idClienteGenerico: servidor.idClienteGenerico,
        configuracion: servidor.configuracion,
        politica,
        fechaDescarga: new Date().toISOString(),
        completa: true,
        parcial: progreso.limiteProductos !== null,
      };
      await this.localDb.setMeta(CLAVE_PREPARACION, preparacion);
      await this.localDb.borrarMeta(CLAVE_PROGRESO);
      this.preparacionSignal.set(preparacion);
      await this.refrescarOperaciones();
      return true;
    } catch (err) {
      const status = (err as HttpErrorResponse)?.status;
      if (status === 402 || status === 403) {
        await this.localDb.borrarMeta(CLAVE_PROGRESO);
        this.notificationService.error('No disponible', (err as HttpErrorResponse).error?.detail ?? 'No se pudo preparar el dispositivo.');
      } else {
        // [CU12] flujo alternativo 4: lo descargado se conserva y se reanuda solo.
        this.interrumpidaSignal.set(true);
        this.notificationService.warning('Descarga interrumpida', 'Lo descargado se conservó: seguirá al volver la conexión.');
      }
      return false;
    } finally {
      this.descargaSignal.set(null);
    }
  }

  private async reanudarDescarga(): Promise<void> {
    const progreso = await this.localDb.getMeta<ProgresoDescarga>(CLAVE_PROGRESO);
    if (progreso) {
      await this.preparar(progreso.codigoSucursal);
    } else if (this.preparacionSignal()?.completa) {
      // [CU17] paso 8: datos actualizados después de sincronizar.
      await this.preparar(this.preparacionSignal()!.codigoSucursal);
    }
  }

  /** Caja abierta en el servidor: el dispositivo sigue sumándole movimientos sin conexión. */
  private async actualizarCaja(codigoSucursal: number): Promise<void> {
    const local = this.cajaSignal();
    if (local?.origen === 'sin_conexion' && local.idCaja === null) return;
    const abierta = await firstValueFrom(
      this.http.get<{
        idCaja: number; uuidOperacion: string; montoInicial: number; fechaApertura: string; ingresos: number; egresos: number;
      } | null>(`${API_URL}/api/caja/actual`, { params: { codigoSucursal } }),
    ).catch(() => undefined);
    if (abierta === undefined) return;
    await this.guardarCaja(
      abierta
        ? {
            uuidOperacion: abierta.uuidOperacion, idCaja: abierta.idCaja, codigoSucursal, montoInicial: abierta.montoInicial,
            fechaApertura: abierta.fechaApertura, origen: 'en_linea', ingresosServidor: abierta.ingresos, egresosServidor: abierta.egresos,
          }
        : null,
    );
  }

  async guardarCaja(caja: CajaLocal | null): Promise<void> {
    if (caja) await this.localDb.setMeta(CLAVE_CAJA, caja);
    else await this.localDb.borrarMeta(CLAVE_CAJA);
    this.cajaSignal.set(caja);
  }

  async efectivoLocalDeCaja(): Promise<{ ingresos: number; egresos: number } | null> {
    const caja = this.cajaSignal();
    if (!caja) return null;
    const sinEntregar = caja.origen === 'en_linea' ? this.operacionesSignal().filter(sinConfirmar) : this.operacionesSignal();
    const { ingresos, egresos } = efectivoDeOperaciones(sinEntregar, caja.uuidOperacion);
    return { ingresos: ingresos + caja.ingresosServidor, egresos: egresos + caja.egresosServidor };
  }

  // --- [CU13] Consultas locales ------------------------------------------

  async catalogoLocal(): Promise<ProductoLocal[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<ProductoLocal>('catalogo') : [];
  }

  async clientesLocales(): Promise<ClienteLocal[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<ClienteLocal>('clientes') : [];
  }

  async reservasLocales(): Promise<ReservaLocal[]> {
    return this.localDb.disponible ? this.localDb.leerColeccion<ReservaLocal>('reservas') : [];
  }

  /** [CU19] paso 1: ventas descargadas más las registradas en este dispositivo. */
  async ventasLocales(): Promise<VentaLocal[]> {
    const descargadas = this.localDb.disponible ? await this.localDb.leerColeccion<VentaLocal>('ventas') : [];
    const catalogo = await this.catalogoLocal();
    const propias = this.operacionesSignal()
      .filter(o => o.tipo === 'venta' && !['Rechazada', 'Anulada'].includes(o.estado))
      .filter(o => !descargadas.some(v => v.uuidOperacion === o.uuidOperacion))
      .map((o): VentaLocal => ({
        idVenta: o.idServidor,
        uuidOperacion: o.uuidOperacion,
        fecha: o.fechaOperacion,
        idCliente: (o.datos['idCliente'] as number) ?? null,
        cliente: (o.datos['clienteNombre'] as string) ?? 'Cliente de esta venta',
        ci: null,
        total: o.total,
        lineas: (o.datos['items'] as { idProducto: number; cantidad: number; precioUnitario: number; nombre?: string }[]).map(i => {
          const p = catalogo.find(x => x.idProducto === i.idProducto);
          return {
            idProducto: i.idProducto, nombre: i.nombre ?? p?.nombre ?? `Producto ${i.idProducto}`, talla: p?.talla ?? null,
            color: p?.color ?? null, tipo: p?.tipo ?? null, idModelo: p?.idModelo ?? null, cantidad: i.cantidad,
            precioPagado: i.precioUnitario, disponibles: i.cantidad, cambios: 0,
          };
        }),
      }));
    return [...propias, ...descargadas];
  }

  /** Existencia conocida por producto: lo descargado menos lo registrado aquí (CU13 paso 4). */
  async existencias(): Promise<Map<number, number>> {
    const inventario = this.localDb.disponible ? await this.localDb.leerColeccion<InventarioLocal>('inventario') : [];
    const prep = this.preparacionSignal();
    const propias = inventario.filter(i => !prep || i.codigoSucursal === prep.codigoSucursal);
    const mapa = new Map<number, number>();
    for (const fila of propias) {
      mapa.set(fila.idProducto, existenciaLocal(fila, this.operacionesSignal(), fila.idProducto, prep?.fechaDescarga ?? null));
    }
    return mapa;
  }

  // --- Sesión guardada y PIN (CU14 flujo alternativo 5) ------------------

  private async huellaPin(pin: string, sal: Uint8Array): Promise<string> {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal.slice(), iterations: 120_000 }, clave, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async definirPin(pin: string): Promise<void> {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    await this.localDb.setMeta(CLAVE_PIN, { sal: Array.from(sal), huella: await this.huellaPin(pin, sal) });
    this.hayPinSignal.set(true);
  }

  async verificarPin(pin: string): Promise<boolean> {
    const guardado = await this.localDb.getMeta<{ sal: number[]; huella: string }>(CLAVE_PIN);
    if (!guardado) return false;
    const ok = (await this.huellaPin(pin, new Uint8Array(guardado.sal))) === guardado.huella;
    if (ok) await this.marcarVerificacion();
    return ok;
  }

  private async marcarVerificacion(): Promise<void> {
    const ahora = new Date().toISOString();
    await this.localDb.setMeta(CLAVE_VERIFICACION, ahora);
    this.ultimaVerificacionSignal.set(ahora);
    this.sesionSignal.set(false);
  }

  /** Sin PIN definido no se puede exigir: el dispositivo se prepara con conexión. */
  necesitaPin(): boolean {
    const prep = this.preparacionSignal();
    if (!prep || this.enLinea() || !this.hayPinSignal()) return false;
    return sesionVencida(this.ultimaVerificacionSignal(), prep.configuracion.horasSesionSinConexion, new Date());
  }

  // --- Borrador de venta (CU14 flujo alternativo 4) ----------------------

  guardarBorrador(clave: string, borrador: unknown | null): Promise<void> {
    return borrador === null ? this.localDb.borrarMeta(clave) : this.localDb.setMeta(clave, borrador);
  }

  leerBorrador<T>(clave: string): Promise<T | null> {
    return this.localDb.getMeta<T>(clave);
  }

  // --- Cola de operaciones -----------------------------------------------

  /** [RNF03] Devuelve la operación ya escrita en IndexedDB, o null si no se pudo guardar. */
  async registrarOperacion(nueva: NuevaOperacion): Promise<OperacionLocal | null> {
    if (!this.localDb.disponible) {
      this.notificationService.error('Sin base local', 'Este navegador no permite guardar datos sin conexión.');
      return null;
    }
    const operacion: OperacionLocal = {
      uuidOperacion: nueva.uuidOperacion ?? crypto.randomUUID(),
      tipo: nueva.tipo,
      estado: 'Registrada localmente',
      idTenant: this.preparacionSignal()?.idTenant ?? this.propietario?.idTenant ?? null,
      idUsuario: this.propietario?.idUsuario ?? null,
      codigoSucursal: nueva.codigoSucursal,
      fechaOperacion: new Date().toISOString(),
      dependeDe: nueva.dependeDe ?? null,
      total: nueva.total ?? 0,
      resumen: nueva.resumen,
      datos: nueva.datos,
      intentos: 0,
      ultimoIntento: null,
      fechaConfirmacion: null,
      idServidor: null,
      motivo: null,
      tipoConflicto: null,
    };
    operacion.id = await this.localDb.guardarOperacion(operacion);
    await this.refrescarOperaciones();
    if (this.enLinea()) void this.sincronizar();
    return operacion;
  }

  private async actualizar(operacion: OperacionLocal, cambios: Partial<OperacionLocal>): Promise<void> {
    await this.localDb.guardarOperacion({ ...operacion, ...cambios });
  }

  private aplicarRespuesta(resultado: ResultadoServidor): Partial<OperacionLocal> | null {
    if (resultado.estado === 'Reintentar' || resultado.estado === 'Desconocida') return null;
    const estado = resultado.estado as EstadoOperacion;
    return {
      estado,
      idServidor: resultado.idServidor,
      motivo: resultado.motivo,
      tipoConflicto: resultado.tipoConflicto,
      fechaConfirmacion: estado === 'Confirmada' ? new Date().toISOString() : null,
    };
  }

  /**
   * [CU17] Sincronizar operaciones pendientes. Devuelve cuántas se confirmaron.
   * Paso 2: toma las pendientes en orden y las marca "Enviada" sin borrarlas.
   */
  async sincronizar(): Promise<number> {
    if (!this.localDb.disponible || !this.enLinea() || this.sincronizandoSignal() || this.bloqueoSignal()) return 0;
    this.sincronizandoSignal.set(true);
    let confirmadas = 0;
    let conflictos = 0;
    try {
      const propias = (await this.localDb.operaciones()).filter(
        o => o.idTenant === null || this.propietario === null || o.idTenant === this.propietario.idTenant,
      );
      const cola = ordenarCola(propias.filter(estaPendiente));
      for (let i = 0; i < cola.length; i += TAM_LOTE) {
        const lote = cola.slice(i, i + TAM_LOTE);
        const ahora = new Date().toISOString();
        for (const op of lote) {
          await this.actualizar(op, { estado: 'Enviada', intentos: op.intentos + 1, ultimoIntento: ahora });
        }
        await this.refrescarOperaciones();
        const { resultados } = await firstValueFrom(
          this.http.post<{ resultados: ResultadoServidor[] }>(`${API_URL}/api/sync/lote`, {
            operaciones: lote.map(op => ({
              uuidOperacion: op.uuidOperacion, tipo: op.tipo, idTenant: op.idTenant, codigoSucursal: op.codigoSucursal,
              fechaOperacion: op.fechaOperacion, dependeDe: op.dependeDe, datos: op.datos,
            })),
          }),
        );
        for (const resultado of resultados) {
          const op = lote.find(o => o.uuidOperacion === resultado.uuidOperacion);
          if (!op) continue;
          const enviada = { ...op, estado: 'Enviada' as EstadoOperacion, intentos: op.intentos + 1, ultimoIntento: ahora };
          const cambios = this.aplicarRespuesta(resultado);
          if (cambios) {
            await this.actualizar(enviada, cambios);
            if (cambios.estado === 'Confirmada') {
              confirmadas += 1;
              await this.vincularCaja(op, resultado);
            }
            if (cambios.estado === 'En conflicto') conflictos += 1;
          } else {
            // [CU17] flujo alternativo 3: error del servidor, vuelve a la cola.
            await this.actualizar(enviada, { estado: 'Registrada localmente', motivo: resultado.motivo });
          }
        }
      }
      await this.actualizarDesdeServidor();
      this.fallosSeguidos = 0;
      if (confirmadas > 0) {
        await this.marcarVerificacion();
        this.notificationService.success('Sincronización completa', `Se confirmaron ${confirmadas} operación(es).`);
      }
      if (conflictos > 0) {
        this.notificationService.warning('Hay conflictos', `${conflictos} operación(es) quedaron en conflicto.`);
      }
      return confirmadas;
    } catch (err) {
      const status = (err as HttpErrorResponse)?.status;
      if (status === 401) {
        // [CU17] flujo alternativo 6: la sesión no se renovó; todo queda en el dispositivo.
        this.sesionSignal.set(true);
        this.notificationService.warning('Inicie sesión', 'Sus operaciones siguen guardadas: se enviarán al volver a entrar.');
      } else {
        // [CU17] flujo alternativo 1: quedan "Enviada" y se reintenta con esperas crecientes.
        this.fallosSeguidos += 1;
        this.programarReintento();
      }
      return confirmadas;
    } finally {
      await this.refrescarOperaciones();
      this.sincronizandoSignal.set(false);
    }
  }

  private programarReintento(): void {
    if (this.temporizadorReintento) clearTimeout(this.temporizadorReintento);
    this.temporizadorReintento = setTimeout(() => void this.sincronizar(), esperaReintento(this.fallosSeguidos));
  }

  /** Una caja abierta sin conexión ya existe en el servidor: se guarda su número. */
  private async vincularCaja(op: OperacionLocal, resultado: ResultadoServidor): Promise<void> {
    const caja = this.cajaSignal();
    if (op.tipo === 'caja_apertura' && caja?.uuidOperacion === op.uuidOperacion) {
      await this.guardarCaja({ ...caja, idCaja: resultado.idServidor });
    }
  }

  /** [CU16]: un conflicto pudo resolverse desde otro equipo. */
  private async actualizarDesdeServidor(): Promise<void> {
    const abiertas = (await this.localDb.operaciones()).filter(o => o.estado === 'En conflicto');
    if (!abiertas.length) return;
    const resultados = await firstValueFrom(
      this.http.post<ResultadoServidor[]>(`${API_URL}/api/sync/estado`, { uuids: abiertas.map(o => o.uuidOperacion) }),
    );
    for (const resultado of resultados) {
      const op = abiertas.find(o => o.uuidOperacion === resultado.uuidOperacion);
      const cambios = this.aplicarRespuesta(resultado);
      if (op && cambios) await this.actualizar(op, cambios);
    }
  }

  /** Lo que todavía no está confirmado de la caja abierta (CU20 flujo alternativo 2). */
  uuidsSinConfirmar(uuidCaja: string): string[] {
    return this.operacionesSignal()
      .filter(o => sinConfirmar(o) && o.datos['uuidCaja'] === uuidCaja)
      .map(o => o.uuidOperacion);
  }

  /**
   * Al cerrar sesión: el snapshot es del usuario que se va, pero lo que no se
   * entregó al servidor es dinero real y se queda (RNF03, CU12 alternativo 5).
   */
  async limpiar(): Promise<void> {
    if (!this.localDb.disponible) return;
    const sinEntregar = (await this.localDb.operaciones()).filter(sinConfirmar);
    if (!sinEntregar.length) {
      await this.localDb.limpiarTodo();
      this.preparacionSignal.set(null);
      this.cajaSignal.set(null);
    }
    this.operacionesSignal.set([]);
    this.bloqueoSignal.set(null);
  }
}
