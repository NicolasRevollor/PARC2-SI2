import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

export interface ResumenConcepto {
  tipo: string;
  concepto: string;
  etiqueta: string;
  monto: number;
  cantidad: number;
}

export interface MovimientoCaja {
  idMovimientoCaja: number;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  etiqueta: string;
  monto: number;
  referencia: string | null;
  fecha: string;
  usuario: string | null;
}

export interface CajaServidor {
  idCaja: number;
  uuidOperacion: string;
  origenRegistro: string;
  codigoSucursal: number;
  sucursal: string | null;
  estado: 'Abierta' | 'CierreProvisional' | 'PendienteAprobacion' | 'Cerrada';
  montoInicial: number;
  fechaApertura: string;
  usuarioApertura: string | null;
  fechaCierre: string | null;
  usuarioCierre: string | null;
  efectivoContado: number | null;
  ingresos: number;
  egresos: number;
  montoEsperado: number;
  diferencia: number | null;
  justificacion: string | null;
  aprobador: string | null;
  operacionesPendientes: number;
  resumen: ResumenConcepto[];
  umbralDiferencia: number;
}

/** [CU20] Gestionar apertura y cierre de caja: llamadas con conexión. */
@Injectable({ providedIn: 'root' })
export class CajaService {
  constructor(private http: HttpClient) {}

  actual(codigoSucursal: number): Promise<CajaServidor | null> {
    return firstValueFrom(this.http.get<CajaServidor | null>(`${API_URL}/api/caja/actual`, { params: { codigoSucursal } }));
  }

  abrir(codigoSucursal: number, montoInicial: number): Promise<CajaServidor> {
    return firstValueFrom(this.http.post<CajaServidor>(`${API_URL}/api/caja/abrir`, { codigoSucursal, montoInicial }));
  }

  cerrar(idCaja: number, efectivoContado: number, justificacion: string | null, operacionesPendientes: string[]): Promise<CajaServidor> {
    return firstValueFrom(
      this.http.post<CajaServidor>(`${API_URL}/api/caja/${idCaja}/cerrar`, { efectivoContado, justificacion, operacionesPendientes }),
    );
  }

  aprobar(idCaja: number): Promise<CajaServidor> {
    return firstValueFrom(this.http.post<CajaServidor>(`${API_URL}/api/caja/${idCaja}/aprobar`, {}));
  }

  historial(codigoSucursal: number | null): Promise<CajaServidor[]> {
    const params: Record<string, number> = codigoSucursal === null ? {} : { codigoSucursal };
    return firstValueFrom(this.http.get<CajaServidor[]>(`${API_URL}/api/caja/historial`, { params }));
  }

  movimientos(idCaja: number): Promise<MovimientoCaja[]> {
    return firstValueFrom(this.http.get<MovimientoCaja[]>(`${API_URL}/api/caja/${idCaja}/movimientos`));
  }
}
