import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthUser, LoginResponse, RegisterRequest } from '../models';
import { NotificationService } from './notification.service';
import { OfflineSyncService } from './offline-sync.service';
import { PwaService } from './pwa.service';
import { TenantService } from './tenant.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;
const CLAVE_USUARIO = 'auth_user';

export interface RegisterResult {
  ok: boolean;
  field?: 'email' | 'password';
  message?: string;
}

interface LoginBackendResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    idUser: string;
    nombre: string;
    correo: string;
    rol: string;
    permisos: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSignal = signal<AuthUser | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private accessTokenSignal = signal<string | null>(null);
  private refreshEnCurso: Promise<string | null> | null = null;

  public currentUser = this.currentUserSignal.asReadonly();
  public isAuthenticated = this.isAuthenticatedSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
    private tenantService: TenantService,
    private offlineSync: OfflineSyncService,
    private pwaService: PwaService,
  ) {
    this.loadTokenFromStorage();
  }

  /**
   * Arranque de sesión: contexto del tenant (plan vigente) + modo offline.
   * Nada de esto puede tumbar el login, así que los fallos se tragan dentro
   * de cada servicio y acá solo se dispara.
   */
  private async iniciarSesionLocal(): Promise<void> {
    await this.tenantService.cargarContexto();
    void this.offlineSync.iniciar();
  }

  private loadTokenFromStorage() {
    const token = localStorage.getItem('access_token');
    if (token) {
      this.accessTokenSignal.set(token);
      this.isAuthenticatedSignal.set(true);
      // Usuario de la última sesión: permite abrir la app SIN conexión (modo
      // offline, CU30) mientras /me no responde.
      const guardado = localStorage.getItem(CLAVE_USUARIO);
      if (guardado) {
        try {
          this.currentUserSignal.set(JSON.parse(guardado) as AuthUser);
        } catch {
          localStorage.removeItem(CLAVE_USUARIO);
        }
      }
      this.fetchCurrentUser();
    }
  }

  private guardarSesion(res: LoginBackendResponse): void {
    this.accessTokenSignal.set(res.access_token);
    localStorage.setItem('access_token', res.access_token);
    localStorage.setItem('refresh_token', res.refresh_token);
    this.establecerUsuario(this.mapBackendUser(res.user));
    this.isAuthenticatedSignal.set(true);
  }

  private establecerUsuario(usuario: AuthUser): void {
    this.currentUserSignal.set(usuario);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  }

  /**
   * Canjea el refresh token por un access token nuevo (el access dura 30 min).
   * Antes el refresh token se guardaba pero nunca se usaba: a la media hora
   * toda llamada daba 401 y la sesión se perdía. Una sola renovación a la vez
   * aunque fallen varias peticiones juntas. Devuelve el token nuevo o null.
   */
  refrescarSesion(): Promise<string | null> {
    if (this.refreshEnCurso) {
      return this.refreshEnCurso;
    }
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      return Promise.resolve(null);
    }
    this.refreshEnCurso = firstValueFrom(
      this.http
        .post<LoginBackendResponse>(`${API_URL}/api/auth/refresh`, { refresh_token: refreshToken })
        .pipe(timeout(15000))
    ).then((res) => {
      this.guardarSesion(res);
      return res.access_token;
    }).catch((err) => {
      // Refresh vencido, cuenta bloqueada o empresa suspendida: la sesión
      // terminó de verdad. Un error de red NO cierra la sesión (modo offline).
      if (this.esRechazoDeSesion(err)) {
        this.logout();
      }
      return null;
    }).finally(() => {
      this.refreshEnCurso = null;
    });
    return this.refreshEnCurso;
  }

  private esRechazoDeSesion(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    return status === 401 || status === 403 || status === 423;
  }

  private mapBackendUser(u: LoginBackendResponse['user']): AuthUser {
    return {
      id: u.idUser,
      nombre: u.nombre,
      email: u.correo,
      rol: u.rol as AuthUser['rol'],
      permisos: u.permisos,
    };
  }

  login(email: string, password: string): Promise<boolean> {
    return firstValueFrom(
      this.http.post<LoginBackendResponse>(`${API_URL}/api/auth/login`, { email, password })
    ).then((res) => {
      this.guardarSesion(res);
      void this.iniciarSesionLocal();
      this.notificationService.success('Acceso concedido', `Bienvenido, ${res.user.nombre}`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'Credenciales inválidas';
      this.notificationService.error('Error de autenticación', msg);
      return false;
    });
  }

  register(request: RegisterRequest): Promise<RegisterResult> {
    return firstValueFrom(
      this.http
        .post<LoginBackendResponse>(`${API_URL}/api/auth/register`, {
          nombre: request.nombre,
          email: request.email,
          password: request.password,
        })
        .pipe(timeout(15000))
    ).then((res) => {
      this.guardarSesion(res);
      void this.iniciarSesionLocal();
      this.notificationService.success('Registro exitoso', `Bienvenido, ${res.user.nombre}`);
      return { ok: true } as RegisterResult;
    }).catch((err) => {
      const status = err.status as number | undefined;
      if (status === 409) {
        const msg = this.extractErrorDetail(err) || 'El correo ya está registrado';
        this.notificationService.error('Error de registro', msg);
        return { ok: false, field: 'email', message: msg } as RegisterResult;
      }
      const msg = this.extractErrorDetail(err) || 'No se pudo completar el registro. Intentá de nuevo.';
      this.notificationService.error('Error de registro', msg);
      return { ok: false, field: this.extractErrorField(err), message: msg } as RegisterResult;
    });
  }

  // FastAPI devuelve `detail` como string en errores propios (409, etc.)
  // pero como una lista de objetos de validacion Pydantic en 422
  // (uno por campo, cada uno con `loc`/`msg`). Se normaliza a un string
  // legible para poder mostrarlo verbatim en el formulario.
  private extractErrorDetail(err: { error?: { detail?: unknown } }): string | null {
    const detail = err.error?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : String(item)))
        .join('; ');
    }
    return null;
  }

  // Para un 422 de Pydantic, `detail` es una lista de objetos con `loc`
  // (ej. ["body", "password"]) que indica qué campo realmente falló.
  // Cualquier otro caso (network error, timeout, 5xx) no es atribuible
  // a un campo puntual del form, así que no se etiqueta como 'password'.
  private extractErrorField(err: { error?: { detail?: unknown } }): 'email' | 'password' | undefined {
    const detail = err.error?.detail;
    if (!Array.isArray(detail)) {
      return undefined;
    }
    for (const item of detail) {
      if (item && typeof item === 'object' && 'loc' in item) {
        const loc = (item as { loc: unknown }).loc;
        if (Array.isArray(loc) && loc.includes('password')) {
          return 'password';
        }
        if (Array.isArray(loc) && (loc.includes('email') || loc.includes('correo'))) {
          return 'email';
        }
      }
    }
    return undefined;
  }

  fetchCurrentUser(): Promise<void> {
    return firstValueFrom(
      this.http
        .get<{ idUser: string; nombre: string; correo: string; rol: string; permisos: string[] }>(`${API_URL}/api/auth/me`)
        .pipe(timeout(10000))
    ).then((u) => {
      this.establecerUsuario({
        id: u.idUser,
        nombre: u.nombre,
        email: u.correo,
        rol: u.rol as AuthUser['rol'],
        permisos: u.permisos,
      });
      this.isAuthenticatedSignal.set(true);
      void this.iniciarSesionLocal();
    }).catch((err) => {
      // Sin red (o timeout) NO es una sesión inválida: antes se hacía logout
      // y eso borraba la cola offline de ventas pendientes. Se sigue con el
      // usuario guardado y el modo sin conexión.
      if (!this.esRechazoDeSesion(err) && this.currentUserSignal() !== null) {
        this.notificationService.warning('Sin conexión', 'Usando tu última sesión guardada en este dispositivo.');
        void this.iniciarSesionLocal();
        return;
      }
      if (!this.isAuthenticatedSignal()) {
        // El refresh ya cerró la sesión (y avisó).
        return;
      }
      this.notificationService.error('Sesión no válida', 'No pudimos validar tu sesión. Volvé a iniciar sesión.');
      this.logout();
    });
  }

  resetPassword(email: string): void {
    firstValueFrom(
      this.http.post(`${API_URL}/api/auth/forgot-password`, { email })
    ).then(() => {
      this.notificationService.info('Enlace de recuperación enviado', `Instrucciones enviadas a ${email}.`);
    }).catch(() => {
      this.notificationService.info('Enlace de recuperación enviado', `Instrucciones enviadas a ${email}.`);
    });
  }

  resetPasswordGetToken(email: string): Promise<string | null> {
    return firstValueFrom(
      this.http.post<{ reset_token_dev?: string }>(`${API_URL}/api/auth/forgot-password`, { email })
    ).then((res) => {
      if (res.reset_token_dev) {
        this.notificationService.success('Correo enviado', `Se encontró una cuenta asociada a ${email}.`);
        return res.reset_token_dev;
      } else {
        this.notificationService.info('Recuperación', `Si el correo existe, se ha enviado un enlace de recuperación.`);
        return null;
      }
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo procesar la solicitud de recuperación.');
      return null;
    });
  }

  resetPasswordConfirm(token: string, newPassword: string): Promise<boolean> {
    return firstValueFrom(
      this.http.post(`${API_URL}/api/auth/reset-password`, { token, new_password: newPassword })
    ).then(() => {
      this.notificationService.success('Contraseña actualizada', 'Su contraseña ha sido restablecida exitosamente.');
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'Token inválido o expirado.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    return firstValueFrom(
      this.http.patch(`${API_URL}/api/auth/password`, { current_password: currentPassword, new_password: newPassword })
    ).then(() => {
      this.notificationService.success('Contraseña actualizada', 'Su contraseña ha sido cambiada exitosamente.');
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo cambiar la contraseña.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }

  /**
   * El backend no tiene un endpoint de solicitudes de acceso: antes se hacía
   * POST a /api/auth/request-access (inexistente, 404) y se mostraba "Solicitud
   * enviada" igual, aunque nadie la recibía. Las cuentas de personal las crea
   * el Administrador de la organización desde "Equipo".
   */
  requestAccess(email: string, _fullName: string, _department: string, _justification: string): void {
    this.notificationService.info(
      'Pedí el acceso a tu administrador',
      `Las cuentas del personal las crea el Administrador de tu organización desde el módulo Equipo. Indicale el correo ${email}.`,
    );
  }

  logout(): void {
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    this.accessTokenSignal.set(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem(CLAVE_USUARIO);
    // El snapshot local, la cola pendiente y las respuestas de API cacheadas
    // son del usuario que se va: en un dispositivo compartido no pueden
    // quedar disponibles para el siguiente.
    this.tenantService.limpiar();
    this.offlineSync.detener();
    void this.offlineSync.limpiar();
    this.pwaService.limpiarCacheApi();
    this.notificationService.info('Sesión cerrada', 'Tu sesión administrativa ha terminado de forma segura.');
  }

  getToken(): string | null {
    return this.accessTokenSignal();
  }
}
