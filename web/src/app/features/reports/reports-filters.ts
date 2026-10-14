import type { InventoryReportFiltros, SalesReportFiltros } from '../../core/models';

/** Sentinel de "sin filtrar" usado por los <select> de sucursal/producto. */
export const REPORT_FILTER_ALL = 'ALL';

export interface SalesReportFormState {
  fechaDesde: string; // '' o 'YYYY-MM-DD'
  fechaHasta: string;
  codigoSucursal: string; // 'ALL' o el codigoSucursal como string
  idProducto: string; // 'ALL' o el idProducto como string
}

export interface InventoryReportFormState {
  codigoSucursal: string;
  idProducto: string;
}

/**
 * Valida que la fecha "desde" no sea posterior a la fecha "hasta". Campos
 * vacíos (sin filtrar) siempre son válidos. Devuelve el mensaje de error a
 * mostrar, o `null` si el rango es válido.
 */
export function validateDateRange(fechaDesde: string, fechaHasta: string): string | null {
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    return 'La fecha "desde" no puede ser posterior a la fecha "hasta".';
  }
  return null;
}

export function buildSalesFiltros(form: SalesReportFormState): SalesReportFiltros {
  const filtros: SalesReportFiltros = {};
  if (form.fechaDesde) filtros.fecha_desde = form.fechaDesde;
  if (form.fechaHasta) filtros.fecha_hasta = form.fechaHasta;
  if (form.codigoSucursal && form.codigoSucursal !== REPORT_FILTER_ALL) {
    filtros.codigoSucursal = Number(form.codigoSucursal);
  }
  if (form.idProducto && form.idProducto !== REPORT_FILTER_ALL) {
    filtros.idProducto = Number(form.idProducto);
  }
  return filtros;
}

export function buildInventoryFiltros(form: InventoryReportFormState): InventoryReportFiltros {
  const filtros: InventoryReportFiltros = {};
  if (form.codigoSucursal && form.codigoSucursal !== REPORT_FILTER_ALL) {
    filtros.codigoSucursal = Number(form.codigoSucursal);
  }
  if (form.idProducto && form.idProducto !== REPORT_FILTER_ALL) {
    filtros.idProducto = Number(form.idProducto);
  }
  return filtros;
}
