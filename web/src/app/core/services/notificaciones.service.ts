import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Notificacion } from '../models';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

// ==== AVISOS "TIPO PUSH" (correccion de la ingeniera) =============
// En palabras simples: este servicio le pregunta al backend que avisos tiene el usuario
//   ("Su prenda sera enviada el viernes 06/11", "Le devolvemos Bs 120 de su compra sin conexion"...).
//   La campanita (shared/components/notificaciones-bell.component.ts) los muestra.
//   Cada 60 segundos vuelve a preguntar, asi el aviso aparece solo, como un push.
// Backend: backend/app/routers/notificaciones.py  |  los avisos se crean en backend/app/services/notificaciones.py
// ==================================================================
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  readonly avisos = signal<Notificacion[]>([]);
  readonly noLeidas = signal<number>(0);
  private temporizador: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient) {}

  /** Empieza a revisar los avisos cada 60 s (lo llama la campanita al aparecer). */
  iniciar(): void {
    void this.cargar();
    if (this.temporizador === null) this.temporizador = setInterval(() => void this.cargar(), 60_000);
  }

  detener(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /** GET /api/notificaciones: los ultimos avisos del usuario que inicio sesion. */
  async cargar(): Promise<void> {
    try {
      const avisos = await firstValueFrom(this.http.get<Notificacion[]>(`${API_URL}/api/notificaciones`));
      this.avisos.set(avisos);
      this.noLeidas.set(avisos.filter((a) => !a.leida).length);
    } catch {
      // Sin conexion o sesion vencida: no se muestra nada nuevo, no hace falta avisar del error.
    }
  }

  /** POST /api/notificaciones/leer-todas: al abrir la campanita, todo queda como leido. */
  async leerTodas(): Promise<void> {
    if (this.noLeidas() === 0) return;
    try {
      await firstValueFrom(this.http.post(`${API_URL}/api/notificaciones/leer-todas`, {}));
      this.avisos.update((lista) => lista.map((a) => ({ ...a, leida: true })));
      this.noLeidas.set(0);
    } catch {
      // Si falla, se vuelve a intentar la proxima vez que se abra.
    }
  }
}
