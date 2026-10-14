import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { hasDigit, hasLower, hasSpecial, hasUpper, isStrong } from '../../shared/utils/password-rules';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="flex w-full h-screen overflow-hidden bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <section class="w-full flex items-center justify-center p-6 md:p-12 lg:p-16 bg-gray-50 relative">
        <div class="w-full max-w-md bg-white p-8 md:p-10 rounded-2xl border border-gray-200 shadow-sm relative z-10">

          <div class="flex flex-col items-center justify-center mb-6">
            <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-md mb-2">Y</div>
            <span class="text-xl font-bold text-gray-900 tracking-tight">YouShop</span>
            <span class="text-xs tracking-wider text-gray-500 uppercase">Portal de Clientes</span>
          </div>

          <div class="text-center mb-8">
            <h2 class="text-xl font-bold text-gray-900">Crear Cuenta</h2>
            <p class="text-xs text-gray-500 mt-1">Registrate para reservar prendas y ver el catálogo</p>
          </div>

          <form (ngSubmit)="onSubmit()" class="flex flex-col space-y-5">
            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="nombre">Nombre Completo</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                [(ngModel)]="nombre"
                required
                placeholder="Nombre y apellido"
                class="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="email">Correo Electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                [(ngModel)]="email"
                (ngModelChange)="emailError.set(null)"
                required
                placeholder="nombre@correo.com"
                class="w-full bg-white border rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                [class.border-gray-200]="!emailError()"
                [class.border-rose-400]="emailError()"
              />
              <p *ngIf="emailError()" class="text-xs text-rose-600 mt-1">{{ emailError() }}</p>
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="password">Contraseña</label>
              <div class="relative">
                <input
                  id="password"
                  name="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  (ngModelChange)="passwordError.set(null)"
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

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wider" for="confirmPassword">Confirmar Contraseña</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="confirmPassword"
                required
                placeholder="Repita la contraseña"
                class="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>

            <!-- Checklist en vivo de reglas de contraseña -->
            <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
              <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requisitos de contraseña:</p>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="password.length >= 10" [class.text-gray-400]="password.length < 10">
                <span>{{ password.length >= 10 ? '✓' : '○' }}</span>
                <span>Mínimo 10 caracteres</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasLower(password)" [class.text-gray-400]="!hasLower(password)">
                <span>{{ hasLower(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 minúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasUpper(password)" [class.text-gray-400]="!hasUpper(password)">
                <span>{{ hasUpper(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 mayúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasDigit(password)" [class.text-gray-400]="!hasDigit(password)">
                <span>{{ hasDigit(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 número</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasSpecial(password)" [class.text-gray-400]="!hasSpecial(password)">
                <span>{{ hasSpecial(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 carácter especial</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="passwordsMatch()" [class.text-gray-400]="!passwordsMatch()">
                <span>{{ passwordsMatch() ? '✓' : '○' }}</span>
                <span>Las contraseñas coinciden</span>
              </div>
            </div>

            <p *ngIf="passwordError()" class="text-xs text-rose-600">{{ passwordError() }}</p>

            <div class="pt-2">
              <button
                type="submit"
                [disabled]="isLoading() || !canSubmit()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg text-xs font-bold tracking-wide uppercase shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span *ngIf="isLoading()" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{{ isLoading() ? 'CREANDO CUENTA...' : 'CREAR CUENTA' }}</span>
              </button>
            </div>

            <div class="text-center pt-2">
              <span class="text-xs text-gray-500">¿Ya tenés una cuenta?</span>
              <button type="button" (click)="onBackToLogin()" class="ml-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer">
                Iniciar sesión
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  `
})
export class RegisterComponent {
  @Output() registered = new EventEmitter<void>();
  @Output() backToLogin = new EventEmitter<void>();

  nombre = '';
  email = '';
  password = '';
  confirmPassword = '';

  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  emailError = signal<string | null>(null);
  passwordError = signal<string | null>(null);

  constructor(private authService: AuthService) {}

  togglePasswordVisibility() {
    this.showPassword.update((v) => !v);
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

  passwordsMatch(): boolean {
    return this.password.length > 0 && this.password === this.confirmPassword;
  }

  canSubmit(): boolean {
    return (
      this.nombre.trim().length > 0 &&
      this.email.trim().length > 0 &&
      isStrong(this.password) &&
      this.passwordsMatch()
    );
  }

  onSubmit() {
    if (!this.canSubmit()) return;

    this.emailError.set(null);
    this.passwordError.set(null);
    this.isLoading.set(true);

    this.authService
      .register({ nombre: this.nombre, email: this.email, password: this.password })
      .then((result) => {
        this.isLoading.set(false);
        if (result.ok) {
          this.registered.emit();
          return;
        }
        if (result.field === 'email') {
          this.emailError.set(result.message || 'El correo ya está registrado');
        } else if (result.field === 'password') {
          this.passwordError.set(result.message || 'No se pudo completar el registro');
        }
        // Sin campo específico (network error, timeout, 5xx): el toast de
        // NotificationService ya informó el error, no se atribuye a un campo.
      });
  }

  onBackToLogin() {
    this.backToLogin.emit();
  }
}
