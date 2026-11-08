import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU33] Obtener y usar cupon de descuento por compras
// Control: backend/app/routers/cupones.py y services/cupones.py (ControlCupones)
// En palabras simples: cada 3 compras en una tienda, el cliente gana un cupon del
//   30% para su siguiente compra en esa tienda. El descuento lo calcula siempre el
//   servidor; la pantalla solo lo muestra.
// ==================================================================

export interface Cupon {
  idCupon: number;
  codigo: string;
  idTenant: number;
  empresa: string | null;
  idCliente: number;
  porcentaje: number;
  estado: 'Disponible' | 'Usado' | 'Vencido';
  fechaEmision: string;
  fechaVencimiento: string;
  idVentaOrigen: number | null;
  idVentaUso: number | null;
  montoDescontado: number;
  fechaUso: string | null;
  cliente?: string;
}

export interface MisCupones {
  cupones: Cupon[];
  progreso: { idTenant: number; empresa: string; compras: number; faltan: number; comprasPorCupon: number }[];
  regla: string;
}

export interface Cotizacion {
  subtotal: number;
  descuento: number;
  total: number;
  idCupon: number | null;
  cuponesDisponibles: Cupon[];
  compras: number;
  faltan: number;
  /** [CU35] costo del envio a domicilio de la tienda (null si no hace envios). */
  costoEnvio: number | null;
}

export type ItemCompra = { idProducto: number; cantidad: number };

@Injectable({ providedIn: 'root' })
export class CuponesService {
  constructor(private http: HttpClient) {}

  misCupones(): Promise<MisCupones | null> {
    return firstValueFrom(this.http.get<MisCupones>(`${API_URL}/api/cupones/mios`)).catch(() => null);
  }

  /** Total del carrito con o sin cupon. `idCliente` solo lo manda el POS. */
  cotizar(items: ItemCompra[], idCupon: number | null, idCliente?: number | null): Promise<Cotizacion | null> {
    const cuerpo: Record<string, unknown> = { items, idCupon };
    if (idCliente) cuerpo['idCliente'] = idCliente;
    return firstValueFrom(this.http.post<Cotizacion>(`${API_URL}/api/cupones/cotizar`, cuerpo)).catch(() => null);
  }

  deLaEmpresa(filtros: { idCliente?: number; estado?: string } = {}): Promise<Cupon[]> {
    const params: Record<string, string> = {};
    if (filtros.idCliente) params['idCliente'] = String(filtros.idCliente);
    if (filtros.estado) params['estado'] = filtros.estado;
    return firstValueFrom(this.http.get<Cupon[]>(`${API_URL}/api/cupones`, { params })).catch(() => []);
  }
}
