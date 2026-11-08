import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChatIn, ChatMensaje, ChatOut } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU36] Conversar con el asistente virtual (por texto o por voz)
// Control: backend/app/routers/chat.py
//   cliente  -> POST /api/chat           (catalogo + sus compras y reservas)
//   publico  -> POST /api/chat/publico   (landing, sin cuenta: solo catalogo)
//   admin    -> POST /api/chat/admin     (datos del negocio y reportes PDF/CSV/HTML)
// ==================================================================

export type ModoChat = 'publico' | 'cliente' | 'admin';

/** [CU36] un reporte que el asistente dejo listo para descargar. */
export interface ArchivoChat {
  idSolicitud: number;
  titulo: string;
  formato: 'pdf' | 'csv' | 'html';
  ruta: string;
}

export interface ChatRespuesta extends ChatOut {
  archivos?: ArchivoChat[];
  motor?: string;
}

const RUTAS: Record<ModoChat, string> = { cliente: '/api/chat', publico: '/api/chat/publico', admin: '/api/chat/admin' };

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private detalle(err: unknown, porDefecto: string): string {
    return (err as { error?: { detail?: string } })?.error?.detail || porDefecto;
  }

  /** La respuesta, o `{ error }` con el motivo real (IA no configurada, demasiadas preguntas...). */
  enviarMensaje(mensaje: string, historial: ChatMensaje[], modo: ModoChat = 'cliente', origen: 'texto' | 'voz' = 'texto'): Promise<ChatRespuesta | { error: string }> {
    const payload: ChatIn & { origen?: string } = { mensaje, historial };
    if (modo === 'admin') payload.origen = origen;
    return firstValueFrom(this.http.post<ChatRespuesta>(`${API_URL}${RUTAS[modo]}`, payload)).catch((err) => ({
      error: this.detalle(err, 'No se pudo enviar el mensaje al asistente. Intentá de nuevo.'),
    }));
  }

  /** Voz -> texto en el servidor (si el navegador no tiene reconocimiento de voz). Requiere sesion. */
  transcribir(audio: Blob): Promise<{ texto: string; confianza: 'alta' | 'baja' } | null> {
    const datos = new FormData();
    const tipo = (audio.type || 'audio/webm').split(';')[0];
    datos.append('audio', new File([audio], `voz.${tipo.split('/')[1] || 'webm'}`, { type: tipo }));
    return firstValueFrom(this.http.post<{ texto: string; confianza: 'alta' | 'baja' }>(`${API_URL}/api/chat/transcribir`, datos)).catch((err) => {
      this.notificationService.warning('Voz', this.detalle(err, 'No se pudo transcribir el audio.'));
      return null;
    });
  }

  /** [CU36] descarga del reporte con la sesion del usuario (PDF y CSV se guardan, HTML se abre). */
  async descargar(archivo: ArchivoChat): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get(`${API_URL}${archivo.ruta}`, { observe: 'response', responseType: 'blob' }));
      const blob = r.body as Blob;
      const url = URL.createObjectURL(blob);
      if (archivo.formato === 'html') {
        window.open(url, '_blank');
        return;
      }
      const nombre = /filename="?([^"]+)"?/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `reporte.${archivo.formato}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      this.notificationService.error('Reporte', 'No se pudo descargar el reporte.');
    }
  }
}
