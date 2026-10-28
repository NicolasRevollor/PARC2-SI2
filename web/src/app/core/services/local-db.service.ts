import { Injectable } from '@angular/core';

/**
 * Base de datos local del dispositivo (IndexedDB), sin librerías externas.
 *
 * Es la "base temporal" del modo sin conexión: el
 * catálogo, las sucursales y el inventario se guardan acá para poder operar
 * con la red caída, y las mutaciones que no se pudieron enviar quedan en la
 * cola `outbox` hasta que vuelva la conexión.
 *
 * Por qué IndexedDB y no localStorage: localStorage es síncrono (bloquea el
 * hilo de UI), guarda solo strings y tiene ~5 MB; un catálogo con imágenes y
 * una cola de ventas no entran ni conviene serializarlos a mano.
 */

export const DB_NOMBRE = 'youshop-local';
export const DB_VERSION = 1;

/** Colecciones que se replican desde el servidor (snapshot de solo lectura). */
export type ColeccionLocal = 'catalogo' | 'sucursales' | 'inventario';

const STORES_SNAPSHOT: Record<ColeccionLocal, string> = {
  catalogo: 'idProducto',
  sucursales: 'codigoSucursal',
  inventario: 'idInv',
};

const STORE_OUTBOX = 'outbox';
const STORE_META = 'meta';

/**
 * `venta_efectivo` es una operacion COMPUESTA: sin conexion no existe
 * todavia el `idMetPago` (lo genera el servidor), asi que se guarda el
 * monto cobrado junto con la venta y la sincronizacion crea primero el
 * metodo de pago y recien despues la venta.
 */
export type TipoOperacion = 'venta' | 'venta_efectivo' | 'devolucion';

export interface OperacionPendiente {
  id?: number;
  tipo: TipoOperacion;
  /** Cuerpo exacto que se le va a mandar al endpoint cuando vuelva la red. */
  payload: unknown;
  creadoEn: string;
  intentos: number;
  ultimoError?: string | null;
}

function promesa<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

@Injectable({ providedIn: 'root' })
export class LocalDbService {
  private db: IDBDatabase | null = null;
  private abriendo: Promise<IDBDatabase> | null = null;

  /** IndexedDB no existe en SSR ni en navegación privada de algunos navegadores. */
  get disponible(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private abrir(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    // Sin este guard, dos llamadas concurrentes abren dos conexiones y la
    // segunda queda bloqueada esperando el upgrade de la primera.
    if (this.abriendo) return this.abriendo;

    this.abriendo = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NOMBRE, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [nombre, keyPath] of Object.entries(STORES_SNAPSHOT)) {
          if (!db.objectStoreNames.contains(nombre)) {
            db.createObjectStore(nombre, { keyPath });
          }
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          db.createObjectStore(STORE_OUTBOX, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'clave' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    }).finally(() => {
      this.abriendo = null;
    });

    return this.abriendo;
  }

  private async tx(store: string, modo: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.abrir();
    return db.transaction(store, modo).objectStore(store);
  }

  // --- Snapshot del servidor -------------------------------------------

  /** Reemplaza por completo una colección local con lo que vino del servidor. */
  async guardarColeccion<T>(coleccion: ColeccionLocal, items: T[]): Promise<void> {
    const db = await this.abrir();
    await new Promise<void>((resolve, reject) => {
      const transaccion = db.transaction(coleccion, 'readwrite');
      const store = transaccion.objectStore(coleccion);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error);
      transaccion.onabort = () => reject(transaccion.error);
    });
  }

  async leerColeccion<T>(coleccion: ColeccionLocal): Promise<T[]> {
    const store = await this.tx(coleccion, 'readonly');
    return promesa(store.getAll() as IDBRequest<T[]>);
  }

  async contar(coleccion: ColeccionLocal): Promise<number> {
    const store = await this.tx(coleccion, 'readonly');
    return promesa(store.count());
  }

  // --- Cola de operaciones pendientes (outbox) --------------------------

  async encolar(tipo: TipoOperacion, payload: unknown): Promise<number> {
    const store = await this.tx(STORE_OUTBOX, 'readwrite');
    const operacion: OperacionPendiente = {
      tipo,
      payload,
      creadoEn: new Date().toISOString(),
      intentos: 0,
      ultimoError: null,
    };
    const clave = await promesa(store.add(operacion) as IDBRequest<IDBValidKey>);
    return Number(clave);
  }

  async pendientes(): Promise<OperacionPendiente[]> {
    const store = await this.tx(STORE_OUTBOX, 'readonly');
    const todas = await promesa(store.getAll() as IDBRequest<OperacionPendiente[]>);
    // FIFO: una venta anterior tiene que reenviarse antes que la siguiente,
    // porque ambas descuentan del mismo stock.
    return todas.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  }

  async contarPendientes(): Promise<number> {
    const store = await this.tx(STORE_OUTBOX, 'readonly');
    return promesa(store.count());
  }

  async eliminarPendiente(id: number): Promise<void> {
    const store = await this.tx(STORE_OUTBOX, 'readwrite');
    await promesa(store.delete(id) as unknown as IDBRequest<undefined>);
  }

  async registrarFallo(operacion: OperacionPendiente, error: string): Promise<void> {
    if (operacion.id === undefined) return;
    const store = await this.tx(STORE_OUTBOX, 'readwrite');
    await promesa(
      store.put({ ...operacion, intentos: operacion.intentos + 1, ultimoError: error }) as IDBRequest<IDBValidKey>
    );
  }

  // --- Metadatos (última sincronización, etc.) --------------------------

  async setMeta(clave: string, valor: unknown): Promise<void> {
    const store = await this.tx(STORE_META, 'readwrite');
    await promesa(store.put({ clave, valor }) as IDBRequest<IDBValidKey>);
  }

  async getMeta<T>(clave: string): Promise<T | null> {
    const store = await this.tx(STORE_META, 'readonly');
    const fila = await promesa(store.get(clave) as IDBRequest<{ clave: string; valor: T } | undefined>);
    return fila ? fila.valor : null;
  }

  /**
   * Borra todo lo local. Se llama al cerrar sesión: el snapshot y la cola
   * pertenecen al usuario que estaba operando, no al dispositivo.
   */
  async limpiarTodo(): Promise<void> {
    const db = await this.abrir();
    const stores = [...Object.keys(STORES_SNAPSHOT), STORE_OUTBOX, STORE_META];
    await new Promise<void>((resolve, reject) => {
      const transaccion = db.transaction(stores, 'readwrite');
      for (const nombre of stores) {
        transaccion.objectStore(nombre).clear();
      }
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error);
    });
  }
}
