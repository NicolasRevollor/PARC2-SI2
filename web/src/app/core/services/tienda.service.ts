import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU34] Avisar cuando vuelve el stock de una talla -> backend/app/routers/avisos_stock.py
// [CU35] Entregar a domicilio una compra en linea  -> backend/app/routers/domicilio.py (/api/pedidos)
// ==================================================================

export interface AvisoStock {
  idAviso: number;
  idProducto: number;
  producto: string;
  talla: string | null;
  color: string | null;
  precio: number;
  imagen_url: string | null;
  estado: 'Pendiente' | 'Avisado' | 'Cancelado';
  fechaRegistro: string;
  fechaAviso: string | null;
  sucursal: string | null;
}

export interface PedidoDomicilio {
  idEntrega: number;
  idVenta: number;
  codigo: string;
  estado: 'Solicitado' | 'Programado' | 'Completado' | 'Fallido' | 'Cancelado';
  direccion: string;
  fechaProgramada: string | null;
  franja: 'manana' | 'tarde' | null;
  repartidor: string | null;
  costo: number;
  producto: string;
  total: number;
  fechaCompra: string;
  observaciones: string | null;
}

/** [CU35] Datos del envio que se mandan con la compra. */
export interface EntregaPedido {
  direccion: string;
  telefono: string;
  referencia?: string | null;
  franja?: 'manana' | 'tarde' | null;
}

@Injectable({ providedIn: 'root' })
export class TiendaService {
  constructor(private http: HttpClient, private notificationService: NotificationService) {}

  private detalle(err: unknown, porDefecto: string): string {
    return (err as { error?: { detail?: string } })?.error?.detail || porDefecto;
  }

  // --- [CU34] -----------------------------------------------------------------
  estadoStock(idProducto: number): Promise<{ agotado: boolean; idAviso: number | null } | null> {
    return firstValueFrom(this.http.get<{ agotado: boolean; idAviso: number | null }>(`${API_URL}/api/avisos-stock/estado/${idProducto}`)).catch(() => null);
  }

  async pedirAviso(idProducto: number): Promise<AvisoStock | null> {
    try {
      const aviso = await firstValueFrom(this.http.post<AvisoStock>(`${API_URL}/api/avisos-stock`, { idProducto }));
      this.notificationService.success('Te avisaremos', `Cuando vuelva ${aviso.producto} talla ${aviso.talla ?? ''} te llega un aviso.`);
      return aviso;
    } catch (err) {
      this.notificationService.warning('Aviso de stock', this.detalle(err, 'No se pudo registrar el aviso.'));
      return null;
    }
  }

  async cancelarAviso(idAviso: number): Promise<boolean> {
    return firstValueFrom(this.http.delete(`${API_URL}/api/avisos-stock/${idAviso}`)).then(() => true).catch(() => false);
  }

  misAvisos(): Promise<AvisoStock[]> {
    return firstValueFrom(this.http.get<AvisoStock[]>(`${API_URL}/api/avisos-stock/mios`)).catch(() => []);
  }

  // --- [CU35] -----------------------------------------------------------------
  misPedidos(): Promise<PedidoDomicilio[]> {
    return firstValueFrom(this.http.get<PedidoDomicilio[]>(`${API_URL}/api/pedidos/mios`)).catch(() => []);
  }
}
