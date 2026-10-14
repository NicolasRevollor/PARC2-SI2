import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Temporada, TemporadaIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class SeasonsService {
  private seasonsSignal = signal<Temporada[]>([]);
  public seasons = this.seasonsSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadSeasons(): Promise<void> {
    return firstValueFrom(
      this.http.get<Temporada[]>(`${API_URL}/api/seasons`)
    ).then((list) => {
      this.seasonsSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la lista de temporadas.');
    });
  }

  createSeason(payload: TemporadaIn): Promise<Temporada | null> {
    return firstValueFrom(
      this.http.post<Temporada>(`${API_URL}/api/seasons`, payload)
    ).then((temporada) => {
      this.seasonsSignal.update(list => [...list, temporada]);
      this.notificationService.success('Temporada creada', `"${temporada.nombreTemporada}" fue agregada.`);
      return temporada;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear la temporada.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateSeason(idTemporada: number, payload: TemporadaIn): Promise<Temporada | null> {
    return firstValueFrom(
      this.http.put<Temporada>(`${API_URL}/api/seasons/${idTemporada}`, payload)
    ).then((temporada) => {
      this.seasonsSignal.update(list => list.map(t => t.idTemporada === idTemporada ? temporada : t));
      this.notificationService.success('Temporada actualizada', `"${temporada.nombreTemporada}" fue actualizada.`);
      return temporada;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar la temporada.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteSeason(idTemporada: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/seasons/${idTemporada}`)
    ).then(() => {
      this.seasonsSignal.update(list => list.filter(t => t.idTemporada !== idTemporada));
      this.notificationService.warning('Temporada eliminada', `ID ${idTemporada} removida.`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo eliminar la temporada.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }
}
