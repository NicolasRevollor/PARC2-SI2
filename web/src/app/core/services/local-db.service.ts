import { Injectable } from '@angular/core';
import { OperacionLocal } from '../offline-rules';

/**
 * [CU12] [RNF03] Base de datos local del dispositivo (IndexedDB), sin librerías externas.
 *
 * Guarda el snapshot de la sucursal (catálogo, existencias, clientes, reservas,
 * ventas recientes), la cola de operaciones hechas sin conexión y los metadatos
 * (última descarga, PIN, caja abierta, borrador de venta).
 *
 * Por qué IndexedDB y no localStorage: localStorage es síncrono (bloquea el
 * hilo de UI), guarda solo strings y tiene ~5 MB; un catálogo con imágenes y
 * una cola de ventas no entran ni conviene serializarlos a mano.
 */

export const DB_NOMBRE = 'youshop-local';
export const DB_VERSION = 2;

/** Colecciones que se replican desde el servidor (snapshot de solo lectura). */
export type ColeccionLocal = 'catalogo' | 'sucursales' | 'inventario' | 'clientes' | 'reservas' | 'ventas';

const STORES_SNAPSHOT: Record<ColeccionLocal, string> = {
  catalogo: 'idProducto',
  sucursales: 'codigoSucursal',
  inventario: 'idInv',
  clientes: 'idCliente',
  reservas: 'codigoReserva',
  ventas: 'idVenta',
};

const STORE_OUTBOX = 'outbox';
const STORE_META = 'meta';

/** Forma de la cola antes del CU16 (versión 1 de la base). */
export interface OperacionAntigua {
  id?: number;
  tipo: string;
  payload: any;
  creadoEn: string;
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
    await this.vaciar(coleccion);
    await this.agregarColeccion(coleccion, items);
  }

  /** [CU12] flujo alternativo 4: cada página queda guardada apenas llega. */
  async agregarColeccion<T>(coleccion: ColeccionLocal, items: T[]): Promise<void> {
    const db = await this.abrir();
    await new Promise<void>((resolve, reject) => {
      const transaccion = db.transaction(coleccion, 'readwrite');
      const store = transaccion.objectStore(coleccion);
      for (const item of items) {
        store.put(item);
      }
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error);
      transaccion.onabort = () => reject(transaccion.error);
    });
  }

  async vaciar(coleccion: ColeccionLocal): Promise<void> {
    const store = await this.tx(coleccion, 'readwrite');
    await promesa(store.clear() as IDBRequest<undefined>);
  }

  async leerColeccion<T>(coleccion: ColeccionLocal): Promise<T[]> {
    const store = await this.tx(coleccion, 'readonly');
    return promesa(store.getAll() as IDBRequest<T[]>);
  }

  async contar(coleccion: ColeccionLocal): Promise<number> {
    const store = await this.tx(coleccion, 'readonly');
    return promesa(store.count());
  }

  // --- Cola de operaciones (outbox) ------------------------------------

  /** [RNF03] La operación queda escrita antes de confirmarse al usuario. */
  async guardarOperacion(operacion: OperacionLocal): Promise<number> {
    const store = await this.tx(STORE_OUTBOX, 'readwrite');
    return Number(await promesa(store.put(operacion) as IDBRequest<IDBValidKey>));
  }

  /** Lee la cola sin tocar lo que escriba otra pantalla: nunca borra (RF15). */
  async operaciones(): Promise<OperacionLocal[]> {
    const todas = await this.filasOutbox();
    return todas.filter((o): o is OperacionLocal => 'uuidOperacion' in o);
  }

  private async filasOutbox(): Promise<(OperacionLocal | OperacionAntigua)[]> {
    const store = await this.tx(STORE_OUTBOX, 'readonly');
    return promesa(store.getAll() as IDBRequest<(OperacionLocal | OperacionAntigua)[]>);
  }

  async operacionesAntiguas(): Promise<OperacionAntigua[]> {
    const todas = await this.filasOutbox();
    return todas.filter((o): o is OperacionAntigua => !('uuidOperacion' in o));
  }

  // --- Metadatos (descarga, PIN, caja, borrador) -----------------------

  async setMeta(clave: string, valor: unknown): Promise<void> {
    const store = await this.tx(STORE_META, 'readwrite');
    await promesa(store.put({ clave, valor }) as IDBRequest<IDBValidKey>);
  }

  async getMeta<T>(clave: string): Promise<T | null> {
    const store = await this.tx(STORE_META, 'readonly');
    const fila = await promesa(store.get(clave) as IDBRequest<{ clave: string; valor: T } | undefined>);
    return fila ? fila.valor : null;
  }

  async borrarMeta(clave: string): Promise<void> {
    const store = await this.tx(STORE_META, 'readwrite');
    await promesa(store.delete(clave) as IDBRequest<undefined>);
  }

  /**
   * Borra todo lo local. Solo se llama cuando no queda nada sin sincronizar:
   * el snapshot es del usuario que operaba, pero una operación pendiente es
   * dinero real y nunca se pierde (CU12 flujo alternativo 5).
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
