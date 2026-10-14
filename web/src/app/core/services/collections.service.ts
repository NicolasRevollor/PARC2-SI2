import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Coleccion, ColeccionIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class CollectionsService {
  private collectionsSignal = signal<Coleccion[]>([]);
  public collections = this.collectionsSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadCollections(): Promise<void> {
    return firstValueFrom(
      this.http.get<Coleccion[]>(`${API_URL}/api/collections`)
    ).then((list) => {
      this.collectionsSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la lista de colecciones.');
    });
  }

  createCollection(payload: ColeccionIn): Promise<Coleccion | null> {
    return firstValueFrom(
      this.http.post<Coleccion>(`${API_URL}/api/collections`, payload)
    ).then((coleccion) => {
      this.collectionsSignal.update(list => [...list, coleccion]);
      this.notificationService.success('Colección creada', `"${coleccion.nombre_coleccion}" fue agregada.`);
      return coleccion;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear la colección.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateCollection(idColeccion: number, payload: ColeccionIn): Promise<Coleccion | null> {
    return firstValueFrom(
      this.http.put<Coleccion>(`${API_URL}/api/collections/${idColeccion}`, payload)
    ).then((coleccion) => {
      this.collectionsSignal.update(list => list.map(c => c.idColeccion === idColeccion ? coleccion : c));
      this.notificationService.success('Colección actualizada', `"${coleccion.nombre_coleccion}" fue actualizada.`);
      return coleccion;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar la colección.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteCollection(idColeccion: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/collections/${idColeccion}`)
    ).then(() => {
      this.collectionsSignal.update(list => list.filter(c => c.idColeccion !== idColeccion));
      this.notificationService.warning('Colección eliminada', `ID ${idColeccion} removida.`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo eliminar la colección.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }
}
