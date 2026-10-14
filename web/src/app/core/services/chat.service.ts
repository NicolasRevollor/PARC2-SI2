import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChatIn, ChatMensaje, ChatOut } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Servicio del chatbot (CU23). Consume `POST /api/chat` — requiere Cliente
 * autenticado, el backend deriva `idCliente` del JWT.
 */
@Injectable({
  providedIn: 'root'
})
export class ChatService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  enviarMensaje(mensaje: string, historial: ChatMensaje[]): Promise<ChatOut | null> {
    const payload: ChatIn = { mensaje, historial };
    return firstValueFrom(
      this.http.post<ChatOut>(`${API_URL}/api/chat`, payload)
    ).catch((err) => {
      const msg = err.error?.detail || 'No se pudo enviar el mensaje al asistente.';
      this.notificationService.error('Asistente virtual', msg);
      return null;
    });
  }
}
