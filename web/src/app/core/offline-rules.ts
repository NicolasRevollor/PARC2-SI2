/**
 * Reglas del modo sin conexión (CU13 a CU20) que se calculan en el dispositivo.
 * Son funciones puras: no tocan IndexedDB ni la red, y se prueban con node:test.
 * El servidor las vuelve a validar al sincronizar (CU17).
 */

export type TipoOperacion =
  | 'venta'
  | 'reserva'
  | 'cancelar_reserva'
  | 'cambio'
  | 'custodia'
  | 'caja_apertura'
  | 'caja_cierre';

/** Estados del CU16 (y "Anulada", poscondición del CU18). */
export type EstadoOperacion =
  | 'Registrada localmente'
  | 'Enviada'
  | 'Confirmada'
  | 'Rechazada'
  | 'En conflicto'
  | 'Anulada';

export interface ItemOperacion {
  idProducto: number;
  cantidad: number;
  precioUnitario: number;
  nombre?: string;
  stockNoConfirmado?: boolean;
}

export interface OperacionLocal {
  id?: number;
  uuidOperacion: string;
  tipo: TipoOperacion;
  estado: EstadoOperacion;
  idTenant: number | null;
  idUsuario: string | null;
  codigoSucursal: number | null;
  fechaOperacion: string;
  dependeDe: string | null;
  total: number;
  resumen: string;
  // Forma según el tipo: ver DatosVenta, DatosReserva, etc. del backend.
  datos: Record<string, any>;
  intentos: number;
  ultimoIntento: string | null;
  fechaConfirmacion: string | null;
  idServidor: number | null;
  motivo: string | null;
  tipoConflicto: string | null;
}

export interface InventarioLocal {
  idInv: number;
  idProducto: number;
  codigoSucursal: number;
  cantidad_actual: number;
  cantidad_reservada: number;
}

export interface PoliticaLocal {
  plazoCambioHoras: number;
  plazoGarantiaDias: number;
  accionFueraPlazo: string;
  categoriasNoRetornables: string[];
  maxCambiosPorPrenda: number;
  respetarPrecioOriginal: boolean;
  accionDeterioro: string;
  descuentoDeterioroPct: number;
}

export interface LineaVentaLocal {
  idProducto: number;
  nombre: string;
  talla: string | null;
  color: string | null;
  tipo: string | null;
  idModelo: number | null;
  cantidad: number;
  precioPagado: number;
  disponibles: number;
  cambios: number;
}

export const ESTADOS_PENDIENTES: readonly EstadoOperacion[] = ['Registrada localmente', 'Enviada'];

/** Una operación ya no se va a enviar: el servidor respondió algo definitivo. */
export function estaPendiente(op: OperacionLocal): boolean {
  return ESTADOS_PENDIENTES.includes(op.estado);
}

/** Las que siguen sin estar confirmadas: una caja con estas cierra provisional (CU20). */
export function sinConfirmar(op: OperacionLocal): boolean {
  return estaPendiente(op) || op.estado === 'En conflicto';
}

/**
 * CU13 paso 4: existencia descargada menos lo registrado en el dispositivo.
 * Lo confirmado después de la descarga también resta, porque el snapshot todavía
 * no lo refleja. Una operación rechazada o anulada no resta.
 */
export function existenciaLocal(
  inventario: InventarioLocal | undefined,
  operaciones: OperacionLocal[],
  idProducto: number,
  fechaDescarga: string | null,
): number {
  let disponible = inventario ? inventario.cantidad_actual - inventario.cantidad_reservada : 0;
  const cancelada = new Set(
    operaciones.filter(o => o.tipo === 'cancelar_reserva').map(o => o.datos['uuidReserva'] as string | undefined),
  );
  for (const op of operaciones) {
    const posteriorADescarga =
      op.estado === 'Confirmada' && (!fechaDescarga || (op.fechaConfirmacion ?? '') > fechaDescarga);
    if (!sinConfirmar(op) && !posteriorADescarga) continue;
    if (op.tipo === 'venta' || (op.tipo === 'reserva' && !cancelada.has(op.uuidOperacion))) {
      for (const item of (op.datos['items'] ?? []) as ItemOperacion[]) {
        if (item.idProducto === idProducto) disponible -= item.cantidad;
      }
    } else if (op.tipo === 'cambio' && op.datos['idProductoNuevo'] === idProducto) {
      disponible -= op.datos['cantidad'] as number;
    } else if (op.tipo === 'cancelar_reserva') {
      // Reserva que venía del servidor: lo apartado vuelve a estar libre.
      for (const linea of (op.datos['liberar'] ?? []) as { idProducto: number; cantidad: number }[]) {
        if (linea.idProducto === idProducto) disponible += linea.cantidad;
      }
    }
  }
  return Math.max(disponible, 0);
}

/** CU13 flujo alternativo 1. */
export function datosDesactualizados(fechaDescarga: string | null, horasVigentes: number, ahora: Date): boolean {
  if (!fechaDescarga) return true;
  return ahora.getTime() - new Date(fechaDescarga).getTime() > horasVigentes * 3_600_000;
}

/** CU14 paso 6: null si el efectivo no alcanza (flujo alternativo 3). */
export function calcularCambio(total: number, recibido: number): number | null {
  const cambio = Math.round((recibido - total) * 100) / 100;
  return cambio < 0 ? null : cambio;
}

/** CU14 flujo alternativo 5: la sesión guardada superó el tiempo máximo. */
export function sesionVencida(ultimaVerificacion: string | null, horasMaximas: number, ahora: Date): boolean {
  return datosDesactualizados(ultimaVerificacion, horasMaximas, ahora);
}

/** CU15 paso 4. */
export function fechaLimiteReserva(desde: Date, horasRetiro: number): Date {
  return new Date(desde.getTime() + horasRetiro * 3_600_000);
}

/** CU17 flujo alternativo 1: intervalos crecientes, con tope de 5 minutos. */
export function esperaReintento(intentos: number): number {
  return Math.min(5_000 * 2 ** Math.max(intentos - 1, 0), 300_000);
}

/**
 * CU17 paso 2 y flujo alternativo 4: en el orden en que se registraron, pero una
 * operación nunca sale antes que aquella de la que depende.
 */
export function ordenarCola(operaciones: OperacionLocal[]): OperacionLocal[] {
  const porFecha = [...operaciones].sort(
    (a, b) => a.fechaOperacion.localeCompare(b.fechaOperacion) || (a.id ?? 0) - (b.id ?? 0),
  );
  const presentes = new Set(porFecha.map(o => o.uuidOperacion));
  const enviadas = new Set<string>();
  const orden: OperacionLocal[] = [];
  const agregar = (op: OperacionLocal, visitando: Set<string>) => {
    if (enviadas.has(op.uuidOperacion) || visitando.has(op.uuidOperacion)) return;
    visitando.add(op.uuidOperacion);
    if (op.dependeDe && presentes.has(op.dependeDe)) {
      agregar(porFecha.find(o => o.uuidOperacion === op.dependeDe)!, visitando);
    }
    enviadas.add(op.uuidOperacion);
    orden.push(op);
  };
  porFecha.forEach(op => agregar(op, new Set()));
  return orden;
}

export interface EvaluacionCambio {
  puede: boolean;
  motivo: string | null;
  fechaLimite: Date;
}

/** CU19 paso 2: plazo y cantidades con la política descargada. */
export function evaluarCambioLocal(
  fechaVenta: string,
  linea: LineaVentaLocal,
  cantidad: number,
  esDefecto: boolean,
  politica: PoliticaLocal,
  ahora: Date,
): EvaluacionCambio {
  const venta = new Date(fechaVenta);
  const limite = new Date(venta.getTime() + politica.plazoCambioHoras * 3_600_000);
  const garantia = new Date(venta.getTime() + politica.plazoGarantiaDias * 86_400_000);
  const no = (motivo: string, fecha = limite): EvaluacionCambio => ({ puede: false, motivo, fechaLimite: fecha });
  if (cantidad > linea.disponibles) return no(`Solo quedan ${linea.disponibles} unidad(es) disponibles para cambio`);
  if (linea.cambios >= politica.maxCambiosPorPrenda) return no('La prenda ya alcanzó el máximo de cambios');
  if (linea.tipo && politica.categoriasNoRetornables.includes(linea.tipo) && !esDefecto) {
    return no(`${linea.tipo} no admite cambio: solo por defecto de fábrica`);
  }
  if (esDefecto) {
    return ahora < garantia ? { puede: true, motivo: null, fechaLimite: garantia } : no('La garantía ya venció', garantia);
  }
  if (ahora >= limite) {
    // El recargo por demora lo calcula el servidor: fuera de plazo requiere conexión.
    return no(`Fuera de plazo: la fecha límite era ${limite.toLocaleString('es-BO')}`);
  }
  return { puede: true, motivo: null, fechaLimite: limite };
}

/** CU19 paso 5: misma fórmula que `diferencia_variante` del backend. */
export function diferenciaCambio(
  precioPagado: number,
  precioActualOriginal: number,
  precioActualNueva: number,
  cantidad: number,
  descuentoDeterioroPct: number,
  respetarPrecioOriginal: boolean,
): number {
  const valor = precioPagado * cantidad;
  const credito = valor - (valor * descuentoDeterioroPct) / 100;
  const nueva = respetarPrecioOriginal ? precioPagado + (precioActualNueva - precioActualOriginal) : precioActualNueva;
  return Math.round((nueva * cantidad - credito) * 100) / 100;
}

export interface MovimientoLocal {
  ingresos: number;
  egresos: number;
}

/** CU20 paso 3: el efectivo de las operaciones de esta caja hechas en el dispositivo. */
export function efectivoDeOperaciones(operaciones: OperacionLocal[], uuidCaja: string): MovimientoLocal {
  let ingresos = 0;
  let egresos = 0;
  for (const op of operaciones) {
    if (op.datos['uuidCaja'] !== uuidCaja || op.estado === 'Rechazada' || op.estado === 'Anulada') continue;
    if (op.tipo === 'venta') ingresos += op.datos['total'] as number;
    else if (op.tipo === 'reserva') ingresos += (op.datos['deposito'] as number) ?? 0;
    else if (op.tipo === 'cambio') ingresos += (op.datos['montoCobrado'] as number) ?? 0;
    else if (op.tipo === 'cancelar_reserva') egresos += (op.datos['devolverDeposito'] as number) ?? 0;
  }
  return { ingresos, egresos };
}

/** CU20 paso 5. */
export function arqueo(montoInicial: number, ingresos: number, egresos: number, contado: number) {
  const esperado = Math.round((montoInicial + ingresos - egresos) * 100) / 100;
  return { esperado, diferencia: Math.round((contado - esperado) * 100) / 100 };
}
