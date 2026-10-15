import { Injectable, signal } from '@angular/core';
import { NotificationService } from './notification.service';

/** Evento no estándar de Chromium para el prompt de instalación. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Registro del service worker e instalación de la PWA (CU30).
 *
 * El navegador solo dispara `beforeinstallprompt` cuando la app cumple los
 * criterios de instalabilidad (manifest + SW + HTTPS o localhost), y el
 * prompt solo se puede mostrar desde un gesto del usuario: por eso el evento
 * se guarda y el botón "Instalar" aparece únicamente cuando existe.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly instalableSignal = signal<boolean>(false);
  private readonly instaladaSignal = signal<boolean>(false);
  private readonly actualizacionListaSignal = signal<boolean>(false);

  readonly instalable = this.instalableSignal.asReadonly();
  readonly instalada = this.instaladaSignal.asReadonly();
  readonly actualizacionLista = this.actualizacionListaSignal.asReadonly();

  private promptDiferido: BeforeInstallPromptEvent | null = null;
  private registro: ServiceWorkerRegistration | null = null;

  constructor(private notificationService: NotificationService) {}

  async iniciar(): Promise<void> {
    if (typeof window === 'undefined') return;

    this.instaladaSignal.set(
      window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari no implementa display-mode: standalone en matchMedia.
        (window.navigator as { standalone?: boolean }).standalone === true
    );

    window.addEventListener('beforeinstallprompt', (evento) => {
      evento.preventDefault(); // sin esto Chrome muestra su propio mini-infobar
      this.promptDiferido = evento as BeforeInstallPromptEvent;
      this.instalableSignal.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.promptDiferido = null;
      this.instalableSignal.set(false);
      this.instaladaSignal.set(true);
      this.notificationService.success('Aplicación instalada', 'Ya podés abrir YouShop desde tu dispositivo.');
    });

    await this.registrarServiceWorker();
  }

  private async registrarServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
      this.registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      this.registro.addEventListener('updatefound', () => {
        const nuevo = this.registro?.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          // "installed" con un controller activo == hay una versión nueva
          // esperando; sin controller es la primera instalación.
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            this.actualizacionListaSignal.set(true);
          }
        });
      });
    } catch {
      // Un SW que no registra degrada la app a "sin modo offline", no la rompe.
    }
  }

  /** Aplica la versión nueva del service worker y recarga. */
  aplicarActualizacion(): void {
    const esperando = this.registro?.waiting;
    if (!esperando) return;
    esperando.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
  }

  async instalar(): Promise<boolean> {
    if (!this.promptDiferido) return false;
    await this.promptDiferido.prompt();
    const { outcome } = await this.promptDiferido.userChoice;
    // El evento es de un solo uso: una vez consumido hay que esperar a que
    // el navegador lo vuelva a disparar.
    this.promptDiferido = null;
    this.instalableSignal.set(false);
    return outcome === 'accepted';
  }

  /** Borra las respuestas de API cacheadas (se llama al cerrar sesión). */
  limpiarCacheApi(): void {
    navigator.serviceWorker?.controller?.postMessage({ type: 'LIMPIAR_CACHE_API' });
  }
}
