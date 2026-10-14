import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DispatchIn, DispatchOut } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class DispatchService {
  private dispatchesSignal = signal<DispatchOut[]>([]);
  public dispatches = this.dispatchesSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadDispatches(): Promise<void> {
    return firstValueFrom(
      this.http.get<DispatchOut[]>(`${API_URL}/api/dispatches`)
    ).then((list) => {
      this.dispatchesSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar los despachos.');
    });
  }

  createDispatch(request: DispatchIn): Promise<DispatchOut | null> {
    return firstValueFrom(
      this.http.post<DispatchOut>(`${API_URL}/api/dispatches`, request)
    ).then((order) => {
      this.dispatchesSignal.update(list => [order, ...list]);
      this.notificationService.success('Despacho creado', `Referencia ${order.referencia} registrada.`);
      return order;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear el despacho.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }
}
