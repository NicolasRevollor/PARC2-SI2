import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UserRole } from '../../core/models';
import { hasDigit, hasLower, hasSpecial, hasUpper, isStrong } from '../../shared/utils/password-rules';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="flex w-full h-screen overflow-hidden bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">

      <!-- Panel izquierdo: Presentación de marca (oculto en móvil) -->
      <section class="hidden md:flex md:w-5/12 lg:w-1/2 bg-gray-900 relative flex-col justify-between p-10 lg:p-14 overflow-hidden">
        <div class="absolute inset-0 z-0 pointer-events-none">
          <img
            alt="Arquitectura de operaciones YouShop"
            class="w-full h-full object-cover opacity-25 mix-blend-luminosity scale-105"
            src="https://images.unsplash.com/photo-1544441893-675973e31985?w=1600&auto=format&fit=crop&q=80"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-gray-900/60 via-gray-900/80 to-gray-900/95"></div>
        </div>

        <div class="relative z-10">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
              A
            </div>
            <div>
              <span class="text-2xl font-bold text-white tracking-tight block">YouShop</span>
              <span class="text-xs uppercase tracking-widest text-indigo-300 font-semibold">Nodo de Operaciones</span>
            </div>
          </div>
        </div>

        <div class="relative z-10 max-w-md">
          <div class="inline-block px-3 py-1 mb-4 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-200 text-xs font-bold tracking-wide uppercase">
            Versión 2026.4
          </div>
          <h1 class="text-2xl lg:text-3xl font-bold leading-snug text-white mb-3 tracking-tight">
            Excelencia en Gestión de Vestimenta Esencial
          </h1>
          <p class="text-sm text-gray-300 leading-relaxed">
            Acceso administrativo seguro al archivo YouShop, plataforma de operaciones y red global de inventario de boutiques.
          </p>

          <div class="mt-8 pt-6 border-t border-gray-800">
            <p class="text-xs uppercase tracking-widest text-gray-400 font-bold mb-3">Identidades de demostración rápidas:</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                (click)="selectDemoPersona('manager@youshop.com', 'Administrador')"
                class="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Admin (Helena)</span>
              </button>
              <button
                type="button"
                (click)="selectDemoPersona('curator@youshop.com', 'Cajero')"
                class="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Vendedor (Kenji)</span>
              </button>
              <button
                type="button"
                (click)="selectDemoPersona('logistics@youshop.com', 'Administrador')"
                class="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                <span>Logística (Astrid)</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Panel derecho: Interfaz de inicio de sesión -->
      <section class="w-full md:w-7/12 lg:w-1/2 flex items-center justify-center p-6 md:p-12 lg:p-16 bg-gray-50 relative">
        <div class="w-full max-w-md bg-white p-8 md:p-10 rounded-2xl border border-gray-200 shadow-sm relative z-10">

          <div class="md:hidden flex flex-col items-center justify-center mb-6">
            <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-md mb-2">A</div>
            <span class="text-xl font-bold text-gray-900 tracking-tight">YouShop</span>
            <span class="text-xs tracking-wider text-gray-500 uppercase">Nodo de Operaciones y Archivo</span>
          </div>

          <div class="text-center mb-8">
            <h2 class="text-xl font-bold text-gray-900">Acceso Administrativo</h2>
            <p class="text-xs text-gray-500 mt-1">Autentíquese con sus credenciales corporativas</p>
          </div>

          <form (ngSubmit)="onSubmit()" class="flex flex-col space-y-5">
            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="email">Correo Electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                [(ngModel)]="email"
                required
                placeholder="gerente@youshop.com"
                class="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="password">Contraseña</label>
              <div class="relative">
                <input
                  id="password"
                  name="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  required
                  placeholder="••••••••"
                  class="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all pr-10"
                />
                <button
                  type="button"
                  (click)="togglePasswordVisibility()"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors p-1"
                  [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  <span class="material-symbols-outlined text-[18px]">{{ showPassword() ? 'visibility' : 'visibility_off' }}</span>
                </button>
              </div>
            </div>

            <div class="pt-2">
              <button
                type="submit"
                [disabled]="isLoading()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg text-xs font-bold tracking-wide uppercase shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span *ngIf="isLoading()" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{{ isLoading() ? 'AUTENTICANDO...' : 'INICIAR SESIÓN' }}</span>
              </button>
            </div>

            <div class="flex justify-between items-center pt-2">
              <button type="button" (click)="openForgotPassword()" class="text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer">
                ¿Olvidó su contraseña?
              </button>
              <button type="button" (click)="openRequestAccess()" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer">
                Solicitar Acceso
              </button>
            </div>

            <div class="pt-1 text-center">
              <span class="text-xs text-gray-500">¿Sos cliente y no tenés cuenta?</span>
              <button type="button" (click)="onShowRegister()" class="ml-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer">
                Crear cuenta
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>

    <!-- Modal: Recuperar contraseña -->
    <div *ngIf="showForgotModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xl relative">
        <button (click)="showForgotModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <!-- Paso 1: Ingresar email -->
        <div *ngIf="recoveryStep() === 1">
          <div class="mb-5">
            <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Recuperación de Seguridad</span>
            <h3 class="text-lg font-bold text-gray-900 mt-1">Restablecer Contraseña</h3>
            <p class="text-xs text-gray-500 mt-1">Ingrese su correo registrado para recibir un enlace de recuperación.</p>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Correo Electrónico</label>
              <input type="email" [(ngModel)]="recoveryEmail" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="gerente@youshop.com" />
            </div>
            <button (click)="sendPasswordRecovery()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs">
              Enviar Enlace Seguro
            </button>
          </div>
        </div>

        <!-- Paso 2: Ingresar nueva contraseña -->
        <div *ngIf="recoveryStep() === 2">
          <div class="mb-5">
            <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Nueva Contraseña</span>
            <h3 class="text-lg font-bold text-gray-900 mt-1">Establezca su Contraseña</h3>
            <p class="text-xs text-gray-500 mt-1">Ingrese y confirme su nueva contraseña.</p>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nueva Contraseña</label>
              <input type="password" [(ngModel)]="recoveryNewPassword" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Mínimo 10 caracteres" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Confirmar Contraseña</label>
              <input type="password" [(ngModel)]="recoveryConfirmPassword" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Repita la contraseña" />
            </div>

            <!-- Reglas de contraseña -->
            <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
              <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requisitos de contraseña:</p>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="recoveryNewPassword.length >= 10" [class.text-gray-400]="recoveryNewPassword.length < 10">
                <span>{{ recoveryNewPassword.length >= 10 ? '✓' : '○' }}</span>
                <span>Mínimo 10 caracteres</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasLower(recoveryNewPassword)" [class.text-gray-400]="!hasLower(recoveryNewPassword)">
                <span>{{ hasLower(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 minúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasUpper(recoveryNewPassword)" [class.text-gray-400]="!hasUpper(recoveryNewPassword)">
                <span>{{ hasUpper(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 mayúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasDigit(recoveryNewPassword)" [class.text-gray-400]="!hasDigit(recoveryNewPassword)">
                <span>{{ hasDigit(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 número</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasSpecial(recoveryNewPassword)" [class.text-gray-400]="!hasSpecial(recoveryNewPassword)">
                <span>{{ hasSpecial(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 carácter especial</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="recoveryNewPassword === recoveryConfirmPassword && recoveryConfirmPassword.length > 0" [class.text-gray-400]="recoveryNewPassword !== recoveryConfirmPassword || recoveryConfirmPassword.length === 0">
                <span>{{ recoveryNewPassword === recoveryConfirmPassword && recoveryConfirmPassword.length > 0 ? '✓' : '○' }}</span>
                <span>Las contraseñas coinciden</span>
              </div>
            </div>

            <button
              (click)="submitNewPassword()"
              [disabled]="!isRecoveryPasswordValid()"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Establecer Contraseña
            </button>
          </div>
        </div>

        <!-- Paso 3: Éxito -->
        <div *ngIf="recoveryStep() === 3">
          <div class="text-center py-4">
            <div class="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <span class="material-symbols-outlined text-[28px] text-emerald-600">check_circle</span>
            </div>
            <h3 class="text-lg font-bold text-gray-900">Contraseña Actualizada</h3>
            <p class="text-xs text-gray-500 mt-2">Su contraseña ha sido restablecida exitosamente. Ahora puede iniciar sesión con su nueva contraseña.</p>
            <button (click)="showForgotModal.set(false)" class="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Solicitar acceso -->
    <div *ngIf="showRequestModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-lg w-full p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <button (click)="showRequestModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div class="mb-5">
          <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Provisión de Personal</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">Solicitar Acceso al Nodo</h3>
          <p class="text-xs text-gray-500 mt-1">Las solicitudes son revisadas por el Director Global de Operaciones.</p>
        </div>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre Completo</label>
              <input type="text" [(ngModel)]="reqName" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="ej. Marc Dubois" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Correo Corporativo</label>
              <input type="email" [(ngModel)]="reqEmail" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="marc.d@youshop.com" />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Departamento</label>
            <select [(ngModel)]="reqHub" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option value="ventas">Ventas</option>
              <option value="logistica">Logística</option>
              <option value="inventario">Inventario</option>
              <option value="admin">Administración</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Justificación del Acceso</label>
            <textarea [(ngModel)]="reqReason" rows="3" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="ej. Asignado a operaciones de reabastecimiento de boutique."></textarea>
          </div>
          <button (click)="submitAccessRequest()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs">
            Enviar Solicitud
          </button>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent implements OnInit {
  @Output() loggedIn = new EventEmitter<void>();
  @Output() showRegister = new EventEmitter<void>();

  email = '';
  password = '';
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  showForgotModal = signal<boolean>(false);
  showRequestModal = signal<boolean>(false);

  recoveryStep = signal<number>(1);
  recoveryEmail = '';
  recoveryToken = '';
  recoveryNewPassword = '';
  recoveryConfirmPassword = '';

  reqName = '';
  reqEmail = '';
  reqHub = 'ventas';
  reqReason = '';

  constructor(private authService: AuthService) {}

  ngOnInit() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      this.recoveryToken = token;
      this.recoveryNewPassword = '';
      this.recoveryConfirmPassword = '';
      this.recoveryStep.set(2);
      this.showForgotModal.set(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  togglePasswordVisibility() {
    this.showPassword.update(v => !v);
  }

  selectDemoPersona(email: string, _role: UserRole) {
    this.email = email;
    this.password = 'demo1234';
    this.onSubmit();
  }

  onSubmit() {
    this.isLoading.set(true);
    this.authService.login(this.email, this.password).then((ok) => {
      this.isLoading.set(false);
      if (ok) {
        this.loggedIn.emit();
      }
    });
  }

  openForgotPassword() {
    this.recoveryStep.set(1);
    this.recoveryEmail = '';
    this.recoveryNewPassword = '';
    this.recoveryConfirmPassword = '';
    this.recoveryToken = '';
    this.showForgotModal.set(true);
  }

  sendPasswordRecovery() {
    this.authService.resetPasswordGetToken(this.recoveryEmail).then((token) => {
      if (token) {
        this.recoveryToken = token;
        this.recoveryStep.set(2);
      }
    });
  }

  hasLower(value: string): boolean {
    return hasLower(value);
  }

  hasUpper(value: string): boolean {
    return hasUpper(value);
  }

  hasDigit(value: string): boolean {
    return hasDigit(value);
  }

  hasSpecial(value: string): boolean {
    return hasSpecial(value);
  }

  isRecoveryPasswordValid(): boolean {
    return (
      isStrong(this.recoveryNewPassword) &&
      this.recoveryNewPassword === this.recoveryConfirmPassword
    );
  }

  onShowRegister() {
    this.showRegister.emit();
  }

  submitNewPassword() {
    if (!this.isRecoveryPasswordValid() || !this.recoveryToken) return;
    this.authService.resetPasswordConfirm(this.recoveryToken, this.recoveryNewPassword).then((ok) => {
      if (ok) {
        this.recoveryStep.set(3);
      }
    });
  }

  openRequestAccess() {
    this.showRequestModal.set(true);
  }

  submitAccessRequest() {
    this.authService.requestAccess(this.reqEmail || 'staff@youshop.com', this.reqName, this.reqHub, this.reqReason);
    this.showRequestModal.set(false);
  }
}
