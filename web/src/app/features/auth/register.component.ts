import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { hasDigit, hasLower, hasSpecial, hasUpper, isStrong } from '../../shared/utils/password-rules';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .font-headline { font-family: 'Playfair Display', Georgia, serif; }
  `],
  template: `
    <main class="relative flex w-full h-screen overflow-hidden bg-[#121316] text-[#e3e2e6] font-sans selection:bg-[#7a1c30] selection:text-white">

      <!-- Volver a la landing page -->
      <button
        type="button"
        (click)="backToLanding.emit()"
        class="absolute top-5 left-5 z-20 flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#18191d]/90 backdrop-blur-md border border-[#564243]/50 text-[#dcc0c1] hover:text-white hover:border-[#7a1c30] text-xs uppercase tracking-widest transition-colors cursor-pointer"
      >
        <span class="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>Volver</span>
      </button>

      <section class="w-full flex items-center justify-center p-6 md:p-12 lg:p-16 bg-[#121316] relative overflow-y-auto">
        <div class="w-full max-w-md bg-[#18191d] p-8 md:p-10 rounded-[2.5rem] border border-[#564243]/50 shadow-2xl relative z-10">

          <div class="flex flex-col items-center justify-center mb-6">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#9b1d3d] to-[#53101e] flex items-center justify-center text-white font-headline font-bold text-base shadow-md mb-2">Y</div>
            <span class="font-headline text-xl font-medium text-white tracking-tight"><span class="text-[#ff8da1]">You</span>Shop</span>
            <span class="text-xs tracking-wider text-[#a48b8c] uppercase font-mono">Portal de Clientes</span>
          </div>

          <div class="text-center mb-8">
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block mb-1">Nueva Membresía</span>
            <h2 class="font-headline text-xl text-white">Crear Cuenta</h2>
            <p class="text-xs text-[#a48b8c] mt-1">Registrate para reservar prendas y ver el catálogo</p>
          </div>

          <form (ngSubmit)="onSubmit()" class="flex flex-col space-y-5">
            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="nombre">Nombre Completo</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                [(ngModel)]="nombre"
                required
                placeholder="Nombre y apellido"
                class="w-full bg-[#121316] border border-[#564243] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#6b6366] focus:outline-none focus:border-[#7a1c30] transition-all"
              />
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="email">Correo Electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                [(ngModel)]="email"
                (ngModelChange)="emailError.set(null)"
                required
                placeholder="nombre@correo.com"
                class="w-full bg-[#121316] border rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#6b6366] focus:outline-none transition-all"
                [class]="emailError() ? 'border-rose-400' : 'border-[#564243] focus:border-[#7a1c30]'"
              />
              <p *ngIf="emailError()" class="text-xs text-rose-400 mt-1">{{ emailError() }}</p>
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="password">Contraseña</label>
              <div class="relative">
                <input
                  id="password"
                  name="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  (ngModelChange)="passwordError.set(null)"
                  required
                  placeholder="••••••••"
                  class="w-full bg-[#121316] border border-[#564243] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#6b6366] focus:outline-none focus:border-[#7a1c30] transition-all pr-10"
                />
                <button
                  type="button"
                  (click)="togglePasswordVisibility()"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[#a48b8c] hover:text-white transition-colors p-1 bg-transparent border-0 cursor-pointer"
                  [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  <span class="material-symbols-outlined text-[18px]">{{ showPassword() ? 'visibility' : 'visibility_off' }}</span>
                </button>
              </div>
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="confirmPassword">Confirmar Contraseña</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="confirmPassword"
                required
                placeholder="Repita la contraseña"
                class="w-full bg-[#121316] border border-[#564243] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#6b6366] focus:outline-none focus:border-[#7a1c30] transition-all"
              />
            </div>

            <!-- Checklist en vivo de reglas de contraseña -->
            <div class="p-3.5 bg-[#121316] rounded-2xl border border-[#564243]/50 space-y-1.5">
              <p class="text-[10px] font-bold uppercase tracking-wider text-[#a48b8c] mb-2">Requisitos de contraseña:</p>
              <div class="flex items-center space-x-2 text-xs" [class]="password.length >= 10 ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ password.length >= 10 ? '✓' : '○' }}</span>
                <span>Mínimo 10 caracteres</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasLower(password) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasLower(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 minúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasUpper(password) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasUpper(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 mayúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasDigit(password) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasDigit(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 número</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasSpecial(password) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasSpecial(password) ? '✓' : '○' }}</span>
                <span>Al menos 1 carácter especial</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="passwordsMatch() ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ passwordsMatch() ? '✓' : '○' }}</span>
                <span>Las contraseñas coinciden</span>
              </div>
            </div>

            <p *ngIf="passwordError()" class="text-xs text-rose-400">{{ passwordError() }}</p>

            <div class="pt-2">
              <button
                type="submit"
                [disabled]="isLoading() || !canSubmit()"
                class="w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 px-4 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 border-0"
              >
                <span *ngIf="isLoading()" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{{ isLoading() ? 'CREANDO CUENTA...' : 'CREAR CUENTA' }}</span>
              </button>
            </div>

            <div class="text-center pt-2">
              <span class="text-xs text-[#a48b8c]">¿Ya tenés una cuenta?</span>
              <button type="button" (click)="onBackToLogin()" class="ml-1 text-xs font-semibold text-[#ff8da1] hover:text-[#ffb2ba] transition-colors cursor-pointer bg-transparent border-0">
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
  @Output() backToLanding = new EventEmitter<void>();

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
