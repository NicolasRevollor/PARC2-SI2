import { AfterViewChecked, Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { ChatMensaje } from '../../core/models';

interface MensajeMostrado {
  role: 'user' | 'model';
  texto: string;
  esSaludo?: boolean;
}

const SALUDO = '¡Hola! Preguntame sobre el catálogo o tus compras/reservas.';

/**
 * Widget flotante del asistente virtual (CU23). Desplazado a
 * `right-24` (no `right-6`, donde vive `app-toast-container`) para no
 * superponerse visualmente con los toasts cuando ambos están en pantalla.
 */
@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <button
      *ngIf="!abierto()"
      (click)="abrir()"
      class="fixed bottom-6 right-24 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-colors cursor-pointer"
      aria-label="Abrir asistente virtual"
      title="Asistente virtual"
    >
      <span class="material-symbols-outlined text-[26px]">smart_toy</span>
    </button>

    <div
      *ngIf="abierto()"
      class="fixed bottom-6 right-24 z-40 w-80 sm:w-96 h-[28rem] max-h-[70vh] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden"
    >
      <div class="px-4 py-3 bg-indigo-600 text-white flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[20px]">smart_toy</span>
          <span class="text-sm font-bold">Asistente YouShop</span>
        </div>
        <button (click)="cerrar()" class="hover:bg-indigo-700 rounded-lg p-1 transition-colors cursor-pointer" aria-label="Cerrar">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div #mensajesEl class="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        <div *ngFor="let m of mensajes()" class="flex" [class.justify-end]="m.role === 'user'">
          <div
            class="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
            [ngClass]="m.role === 'user'
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : (m.esSaludo ? 'bg-white border border-gray-200 text-gray-600 italic rounded-bl-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm')"
          >
            {{ m.texto }}
          </div>
        </div>

        <div *ngIf="cargando()" class="flex justify-start">
          <div class="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2 text-xs text-gray-400">
            Escribiendo…
          </div>
        </div>

        <div *ngIf="error()" class="flex justify-start">
          <div class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl rounded-bl-sm px-3 py-2 text-xs max-w-[90%]">
            {{ error() }}
          </div>
        </div>
      </div>

      <form (ngSubmit)="enviar()" class="p-2.5 border-t border-gray-200 flex items-center gap-2 shrink-0">
        <input
          type="text"
          [(ngModel)]="textoInput"
          name="mensaje"
          [disabled]="cargando()"
          placeholder="Escribí tu pregunta…"
          class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50"
        />
        <button
          type="submit"
          [disabled]="cargando() || !textoInput.trim()"
          class="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          aria-label="Enviar"
        >
          <span class="material-symbols-outlined text-[18px]">send</span>
        </button>
      </form>
    </div>
  `
})
export class ChatWidgetComponent implements AfterViewChecked {
  @ViewChild('mensajesEl') private mensajesEl?: ElementRef<HTMLDivElement>;

  abierto = signal<boolean>(false);
  cargando = signal<boolean>(false);
  error = signal<string | null>(null);
  textoInput = '';

  // Lo que se MUESTRA (incluye el saludo local, que nunca se manda al
  // backend). `historial` es lo que se ENVÍA — siempre exactamente lo que
  // el backend devolvió la última vez, nunca armado a mano acá, para no
  // desincronizarse de lo que el servidor realmente usó como contexto.
  mensajes = signal<MensajeMostrado[]>([{ role: 'model', texto: SALUDO, esSaludo: true }]);
  private historial: ChatMensaje[] = [];

  private debeScrollear = false;

  constructor(private chatService: ChatService) {}

  abrir(): void {
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  enviar(): void {
    const texto = this.textoInput.trim();
    if (!texto || this.cargando()) return;

    this.textoInput = '';
    this.error.set(null);
    this.mensajes.update(list => [...list, { role: 'user', texto }]);
    this.debeScrollear = true;
    this.cargando.set(true);

    this.chatService.enviarMensaje(texto, this.historial).then((res) => {
      this.cargando.set(false);
      if (!res) {
        this.error.set('No se pudo obtener respuesta. Intentá de nuevo.');
        return;
      }
      this.historial = res.historial;
      this.mensajes.update(list => [...list, { role: 'model', texto: res.respuesta }]);
      this.debeScrollear = true;
    });
  }

  ngAfterViewChecked(): void {
    if (this.debeScrollear && this.mensajesEl) {
      this.mensajesEl.nativeElement.scrollTop = this.mensajesEl.nativeElement.scrollHeight;
      this.debeScrollear = false;
    }
  }
}
