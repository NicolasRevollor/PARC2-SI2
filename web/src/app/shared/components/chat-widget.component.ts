import { AfterViewChecked, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import type { ArchivoChat, ModoChat } from '../../core/services/chat.service';
import { ChatMensaje } from '../../core/models';

interface MensajeMostrado {
  role: 'user' | 'model';
  texto: string;
  esSaludo?: boolean;
  archivos?: ArchivoChat[];
}

/** Reconocimiento de voz del navegador (Chrome y Edge lo exponen con prefijo). */
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const SALUDOS: Record<ModoChat, string> = {
  publico: '¡Hola! Soy el asistente de YouShop. Preguntame por prendas, tallas, precios, stock, envíos o cambios. Podés escribir o hablarme con el micrófono.',
  cliente: '¡Hola! Preguntame sobre el catálogo o tus compras y reservas. Podés escribir o hablarme con el micrófono.',
  admin: 'Hola. Pedime datos del negocio o un reporte, por ejemplo: "ventas de octubre por sucursal en PDF" o "stock por categoría en CSV y HTML".',
};

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU36] Conversar con el asistente virtual (por texto o por voz)
// Boundary: AsistenteUI -> este componente. Va en la landing (modo "publico"),
//   en la tienda del cliente ("cliente") y en el portal del personal ("admin").
// Voz: el navegador transcribe (reconocimiento de voz); si no puede y hay sesion,
//   graba y transcribe el servidor. Las respuestas se pueden leer en voz alta.
// ==================================================================
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
      data-testid="abrir-chat"
    >
      <span class="material-symbols-outlined text-[26px]">{{ modo === 'admin' ? 'support_agent' : 'smart_toy' }}</span>
    </button>

    <div
      *ngIf="abierto()"
      class="fixed bottom-6 right-4 sm:right-24 z-40 w-[calc(100vw-2rem)] sm:w-96 h-[30rem] max-h-[75vh] bg-[#18191d] rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden"
      data-testid="chat"
    >
      <div class="px-4 py-3 bg-indigo-600 text-white flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[20px]">{{ modo === 'admin' ? 'support_agent' : 'smart_toy' }}</span>
          <div>
            <p class="text-sm font-bold leading-tight">{{ modo === 'admin' ? 'Asistente de gestión' : 'Asistente YouShop' }}</p>
            <p class="text-[10px] opacity-80 leading-tight">CU36 · texto o voz</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button (click)="alternarVoz()" class="hover:bg-indigo-700 rounded-lg p-1 transition-colors cursor-pointer"
                  [attr.aria-label]="leerEnVoz() ? 'No leer las respuestas' : 'Leer las respuestas en voz alta'"
                  [title]="leerEnVoz() ? 'Leyendo las respuestas en voz alta' : 'Leer las respuestas en voz alta'" data-testid="leer-voz">
            <span class="material-symbols-outlined text-[18px]">{{ leerEnVoz() ? 'volume_up' : 'volume_off' }}</span>
          </button>
          <button (click)="cerrar()" class="hover:bg-indigo-700 rounded-lg p-1 transition-colors cursor-pointer" aria-label="Cerrar">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      <div #mensajesEl class="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        <div *ngFor="let m of mensajes()" class="flex flex-col" [class.items-end]="m.role === 'user'" [class.items-start]="m.role !== 'user'">
          <div
            class="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-line"
            [ngClass]="m.role === 'user'
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : (m.esSaludo ? 'bg-[#18191d] border border-gray-200 text-gray-600 italic rounded-bl-sm' : 'bg-[#18191d] border border-gray-200 text-gray-800 rounded-bl-sm')"
            data-testid="mensaje"
          >
            {{ m.texto }}
          </div>
          <!-- [CU36] reportes listos para descargar -->
          <div *ngIf="m.archivos?.length" class="flex flex-wrap gap-1.5 mt-1" data-testid="archivos">
            <button *ngFor="let a of m.archivos" (click)="descargar(a)"
                    class="px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 text-[11px] font-bold uppercase flex items-center gap-1 bg-transparent cursor-pointer hover:bg-emerald-50"
                    [attr.data-testid]="'descargar-' + a.formato">
              <span class="material-symbols-outlined text-[14px]">{{ a.formato === 'pdf' ? 'picture_as_pdf' : a.formato === 'csv' ? 'table_view' : 'html' }}</span>{{ a.formato }}
            </button>
          </div>
        </div>

        <div *ngIf="cargando()" class="flex justify-start">
          <div class="bg-[#18191d] border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2 text-xs text-gray-400">
            {{ modo === 'admin' ? 'Preparando…' : 'Escribiendo…' }}
          </div>
        </div>

        <div *ngIf="error()" class="flex justify-start">
          <div class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl rounded-bl-sm px-3 py-2 text-xs max-w-[90%]">
            {{ error() }}
          </div>
        </div>
      </div>

      <p *ngIf="grabando()" class="px-3 py-1 text-[11px] text-rose-600 bg-rose-50 border-t border-rose-100" data-testid="escuchando">Escuchando… hablá y tocá el micrófono para terminar.</p>
      <form (ngSubmit)="enviar()" class="p-2.5 border-t border-gray-200 flex items-center gap-2 shrink-0">
        <!-- [CU36] comando de voz -->
        <button type="button" (click)="grabando() ? detener() : escuchar()" [disabled]="cargando() || !vozDisponible()"
                class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                [ngClass]="grabando() ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'border-gray-200 text-gray-600 hover:border-indigo-300'"
                [title]="vozDisponible() ? (grabando() ? 'Terminar' : 'Hablar') : 'Este navegador no reconoce la voz: usá Chrome o Edge, o escribí'"
                aria-label="Hablar" data-testid="microfono">
          <span class="material-symbols-outlined text-[18px]">{{ grabando() ? 'stop' : 'mic' }}</span>
        </button>
        <input
          type="text"
          [(ngModel)]="textoInput"
          name="mensaje"
          [disabled]="cargando()"
          [placeholder]="modo === 'admin' ? 'Pedí un reporte…' : 'Escribí tu pregunta…'"
          class="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50"
          data-testid="texto-chat"
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
export class ChatWidgetComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('mensajesEl') private mensajesEl?: ElementRef<HTMLDivElement>;
  /** publico (landing), cliente (tienda) o admin (portal del personal). */
  @Input() set modo(valor: ModoChat) {
    this.modoActual = valor;
    this.mensajes.set([{ role: 'model', texto: SALUDOS[valor], esSaludo: true }]);
    this.historial = [];
  }
  get modo(): ModoChat {
    return this.modoActual;
  }
  private modoActual: ModoChat = 'cliente';

  abierto = signal<boolean>(false);
  cargando = signal<boolean>(false);
  error = signal<string | null>(null);
  grabando = signal<boolean>(false);
  leerEnVoz = signal<boolean>(false);
  textoInput = '';

  // Lo que se MUESTRA (incluye el saludo local, que nunca se manda al
  // backend). `historial` es lo que se ENVÍA — siempre exactamente lo que
  // el backend devolvió la última vez, nunca armado a mano acá.
  mensajes = signal<MensajeMostrado[]>([{ role: 'model', texto: SALUDOS.cliente, esSaludo: true }]);
  private historial: ChatMensaje[] = [];
  private debeScrollear = false;
  private reconocedor: Reconocedor | null = null;
  private grabadora: MediaRecorder | null = null;
  private pedazos: Blob[] = [];
  private flujo: MediaStream | null = null;

  constructor(private chatService: ChatService, private zone: NgZone) {}

  private claseReconocedor(): (new () => Reconocedor) | undefined {
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  /** Sin reconocimiento en el navegador, la voz la transcribe el servidor (solo con sesion). */
  vozDisponible(): boolean {
    return !!this.claseReconocedor() || (this.modo !== 'publico' && typeof MediaRecorder !== 'undefined');
  }

  abrir(): void {
    this.abierto.set(true);
  }

  cerrar(): void {
    this.detener();
    window.speechSynthesis?.cancel();
    this.abierto.set(false);
  }

  alternarVoz(): void {
    this.leerEnVoz.update((v) => !v);
    if (!this.leerEnVoz()) window.speechSynthesis?.cancel();
  }

  enviar(origen: 'texto' | 'voz' = 'texto'): void {
    const texto = this.textoInput.trim();
    if (!texto || this.cargando()) return;

    this.textoInput = '';
    this.error.set(null);
    this.mensajes.update(list => [...list, { role: 'user', texto }]);
    this.debeScrollear = true;
    this.cargando.set(true);

    this.chatService.enviarMensaje(texto, this.historial, this.modo, origen).then((res) => {
      this.cargando.set(false);
      if ('error' in res) {
        this.error.set(res.error);
        return;
      }
      this.historial = res.historial;
      this.mensajes.update(list => [...list, { role: 'model', texto: res.respuesta, archivos: res.archivos }]);
      this.debeScrollear = true;
      // Si preguntó con la voz, la respuesta se lee aunque no haya activado la lectura.
      if (this.leerEnVoz() || origen === 'voz') this.hablar(res.respuesta);
    });
  }

  descargar(a: ArchivoChat): void {
    void this.chatService.descargar(a);
  }

  // --- Voz ------------------------------------------------------------------

  private hablar(texto: string): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = 'es-ES';
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
    if (voz) frase.voice = voz;
    window.speechSynthesis.speak(frase);
  }

  async escuchar(): Promise<void> {
    this.error.set(null);
    window.speechSynthesis?.cancel();
    const Clase = this.claseReconocedor();
    if (Clase) {
      const r = new Clase();
      r.lang = 'es-BO';
      r.interimResults = false;
      r.continuous = false;
      let texto = '';
      r.onresult = (e) => this.zone.run(() => {
        texto = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      });
      r.onerror = (e) => this.zone.run(() => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.error.set('No se dio permiso al micrófono: podés escribir tu pregunta.');
        else if (e.error === 'network') this.error.set('La voz necesita conexión a Internet.');
        else if (e.error !== 'no-speech' && e.error !== 'aborted') this.error.set('No se pudo usar el micrófono.');
      });
      r.onend = () => this.zone.run(() => {
        this.grabando.set(false);
        this.reconocedor = null;
        this.usarTranscripcion(texto);
      });
      this.reconocedor = r;
      this.grabando.set(true);
      r.start();
      return;
    }
    // Navegador sin reconocimiento: se graba y transcribe el servidor.
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.error.set('No se dio permiso al micrófono: podés escribir tu pregunta.');
      return;
    }
    this.pedazos = [];
    this.grabadora = new MediaRecorder(this.flujo);
    this.grabadora.ondataavailable = (e) => this.pedazos.push(e.data);
    this.grabadora.onstop = () => this.zone.run(() => void this.transcribirEnServidor());
    this.grabadora.start();
    this.grabando.set(true);
  }

  detener(): void {
    this.reconocedor?.stop();
    if (this.grabadora?.state === 'recording') this.grabadora.stop();
    this.flujo?.getTracks().forEach((t) => t.stop());
    this.grabando.set(false);
  }

  private async transcribirEnServidor(): Promise<void> {
    const audio = new Blob(this.pedazos, { type: this.grabadora?.mimeType || 'audio/webm' });
    this.grabadora = null;
    if (audio.size < 1000) return;
    this.cargando.set(true);
    const r = await this.chatService.transcribir(audio);
    this.cargando.set(false);
    if (r && r.confianza === 'alta') this.usarTranscripcion(r.texto);
    else if (r) this.error.set('No se entendió bien: repetí la pregunta o escribila.');
  }

  /** Lo dictado se manda como pregunta (y la respuesta se lee en voz alta). */
  private usarTranscripcion(texto: string): void {
    if (texto.trim().length < 2) return;
    this.textoInput = texto.trim();
    this.enviar('voz');
  }

  ngAfterViewChecked(): void {
    if (this.debeScrollear && this.mensajesEl) {
      this.mensajesEl.nativeElement.scrollTop = this.mensajesEl.nativeElement.scrollHeight;
      this.debeScrollear = false;
    }
  }

  ngOnDestroy(): void {
    this.detener();
    window.speechSynthesis?.cancel();
  }
}
