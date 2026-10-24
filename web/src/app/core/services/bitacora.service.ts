import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BitacoraEmpresaPagina, FiltrosBitacoraEmpresa, UsuarioBitacora } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Bitácora de la empresa: todo usuario del personal tiene la suya. Con
 * `bitacora.ver` (Administrador, Encargado) el backend devuelve la actividad
 * de toda la organización; sin ese permiso, solo la del propio usuario.
 */
@Injectable({ providedIn: 'root' })
export class BitacoraService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  async cargar(filtros: FiltrosBitacoraEmpresa): Promise<BitacoraEmpresaPagina | null> {
    let params = new HttpParams().set('page', filtros.page).set('size', filtros.size);
    if (filtros.idUser) params = params.set('idUser', filtros.idUser);
    if (filtros.q.trim()) params = params.set('q', filtros.q.trim());
    if (filtros.fecha_desde) params = params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params = params.set('fecha_hasta', filtros.fecha_hasta);
    try {
      return await firstValueFrom(this.http.get<BitacoraEmpresaPagina>(`${API_URL}/api/logs`, { params }));
    } catch (err) {
      const detalle = (err as { error?: { detail?: string } })?.error?.detail;
      this.notificationService.error('Error', typeof detalle === 'string' ? detalle : 'No se pudo cargar la bitácora.');
      return null;
    }
  }

  async usuarios(): Promise<UsuarioBitacora[]> {
    try {
      return await firstValueFrom(this.http.get<UsuarioBitacora[]>(`${API_URL}/api/logs/usuarios`));
    } catch {
      return [];
    }
  }
}
