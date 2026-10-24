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

      <!-- Panel izquierdo: Presentación de marca (oculto en móvil) -->
      <section class="hidden md:flex md:w-5/12 lg:w-1/2 bg-[#121316] relative flex-col justify-between p-10 lg:p-14 overflow-hidden">
        <div class="absolute inset-0 z-0 pointer-events-none">
          <img
            alt="Arquitectura de operaciones YouShop"
            class="w-full h-full object-cover opacity-25 mix-blend-luminosity scale-105"
            src="/landing/perchero-poleras.jpg"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-[#121316]/60 via-[#121316]/85 to-[#121316]/95"></div>
          <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-gradient-to-br from-[#7a1c30]/25 via-[#53101e]/20 to-transparent rounded-full blur-[120px]"></div>
        </div>

        <div class="relative z-10 mt-10">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-[#9b1d3d] to-[#53101e] text-white flex items-center justify-center font-headline text-sm font-bold tracking-tighter shadow-md shadow-[#7a1c30]/40">
              Y
            </div>
            <div>
              <span class="font-headline text-2xl font-medium text-white tracking-tight block">
                <span class="text-[#ff8da1]">You</span>Shop
              </span>
              <span class="text-xs uppercase tracking-widest text-[#ffb2bb]/80 font-mono">Nodo de Operaciones</span>
            </div>
          </div>
        </div>

        <div class="relative z-10 max-w-md">
          <div class="inline-block px-4 py-1 mb-4 bg-[#1f1f23] border border-[#7a1c30]/60 rounded-full text-[#ffb2ba] text-xs font-bold tracking-wide uppercase">
            Versión 2026.4
          </div>
          <h1 class="font-headline text-2xl lg:text-3xl leading-snug text-white mb-3 tracking-tight">
            Excelencia en Gestión de Vestimenta Esencial
          </h1>
          <p class="text-sm text-[#dcc0c1] leading-relaxed font-light">
            Acceso administrativo seguro al archivo YouShop, plataforma de operaciones y red global de inventario de boutiques.
          </p>

          <div class="mt-8 pt-6 border-t border-[#564243]/40">
            <p class="text-xs uppercase tracking-widest text-[#a48b8c] font-bold mb-3">Identidades de demostración rápidas:</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                (click)="selectDemoPersona('manager@youshop.com', 'Administrador')"
                class="px-3 py-1.5 bg-[#18191d] hover:bg-[#22242a] border border-[#564243]/60 hover:border-[#7a1c30] rounded-full text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Admin (Helena)</span>
              </button>
              <button
                type="button"
                (click)="selectDemoPersona('curator@youshop.com', 'Cajero')"
                class="px-3 py-1.5 bg-[#18191d] hover:bg-[#22242a] border border-[#564243]/60 hover:border-[#7a1c30] rounded-full text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Vendedor (Kenji)</span>
              </button>
              <button
                type="button"
                (click)="selectDemoPersona('logistics@youshop.com', 'Administrador')"
                class="px-3 py-1.5 bg-[#18191d] hover:bg-[#22242a] border border-[#564243]/60 hover:border-[#7a1c30] rounded-full text-xs font-medium text-white transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <span class="w-2 h-2 rounded-full bg-[#ff8da1]"></span>
                <span>Logística (Astrid)</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Panel derecho: Interfaz de inicio de sesión -->
      <section class="w-full md:w-7/12 lg:w-1/2 flex items-center justify-center p-6 md:p-12 lg:p-16 bg-[#121316] relative overflow-y-auto">
        <div class="w-full max-w-md bg-[#18191d] p-8 md:p-10 rounded-[2.5rem] border border-[#564243]/50 shadow-2xl relative z-10">

          <div class="md:hidden flex flex-col items-center justify-center mb-6">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#9b1d3d] to-[#53101e] flex items-center justify-center text-white font-headline font-bold text-base shadow-md mb-2">Y</div>
            <span class="font-headline text-xl font-medium text-white tracking-tight"><span class="text-[#ff8da1]">You</span>Shop</span>
            <span class="text-xs tracking-wider text-[#a48b8c] uppercase font-mono">Nodo de Operaciones y Archivo</span>
          </div>

          <div class="text-center mb-8">
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block mb-1">Portal Conexión Bóveda</span>
            <h2 class="font-headline text-xl text-white">Acceso Administrativo</h2>
            <p class="text-xs text-[#a48b8c] mt-1">Autentíquese con sus credenciales corporativas</p>
          </div>

          <form (ngSubmit)="onSubmit()" class="flex flex-col space-y-5">
            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="email">Correo Electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                [(ngModel)]="email"
                required
                placeholder="gerente@youshop.com"
                class="w-full bg-[#121316] border border-[#564243] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#6b6366] focus:outline-none focus:border-[#7a1c30] transition-all"
              />
            </div>

            <div class="flex flex-col space-y-1.5">
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wider" for="password">Contraseña</label>
              <div class="relative">
                <input
                  id="password"
                  name="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
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

            <div class="pt-2">
              <button
                type="submit"
                [disabled]="isLoading()"
                class="w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 px-4 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 border-0"
              >
                <span *ngIf="isLoading()" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{{ isLoading() ? 'AUTENTICANDO...' : 'INICIAR SESIÓN' }}</span>
              </button>
            </div>

            <div class="flex justify-between items-center pt-2">
              <button type="button" (click)="openForgotPassword()" class="text-xs font-medium text-[#a48b8c] hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0">
                ¿Olvidó su contraseña?
              </button>
              <button type="button" (click)="openRequestAccess()" class="text-xs font-semibold text-[#ff8da1] hover:text-[#ffb2ba] transition-colors cursor-pointer bg-transparent border-0">
                Solicitar Acceso
              </button>
            </div>

            <div class="pt-1 text-center">
              <span class="text-xs text-[#a48b8c]">¿Sos cliente y no tenés cuenta?</span>
              <button type="button" (click)="onShowRegister()" class="ml-1 text-xs font-semibold text-[#ff8da1] hover:text-[#ffb2ba] transition-colors cursor-pointer bg-transparent border-0">
                Crear cuenta
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>

    <!-- Modal: Recuperar contraseña -->
    <div *ngIf="showForgotModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-md w-full p-6 sm:p-8 rounded-[2.5rem] border border-[#564243]/50 shadow-2xl relative">
        <button (click)="showForgotModal.set(false)" class="absolute top-4 right-4 text-[#a48b8c] hover:text-white p-1 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <!-- Paso 1: Ingresar email -->
        <div *ngIf="recoveryStep() === 1">
          <div class="mb-5">
            <span class="text-[10px] font-bold tracking-wider text-[#ff8da1] uppercase font-mono">Recuperación de Seguridad</span>
            <h3 class="font-headline text-lg text-white mt-1">Restablecer Contraseña</h3>
            <p class="text-xs text-[#a48b8c] mt-1">Ingrese su correo registrado para recibir un enlace de recuperación.</p>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Correo Electrónico</label>
              <input type="email" [(ngModel)]="recoveryEmail" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="gerente@youshop.com" />
            </div>
            <button (click)="sendPasswordRecovery()" class="w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 rounded-full text-xs font-bold tracking-wide uppercase transition-all hover:brightness-110 shadow-lg shadow-[#7a1c30]/40 cursor-pointer border-0">
              Enviar Enlace Seguro
            </button>
          </div>
        </div>

        <!-- Paso 2: Ingresar nueva contraseña -->
        <div *ngIf="recoveryStep() === 2">
          <div class="mb-5">
            <span class="text-[10px] font-bold tracking-wider text-[#ff8da1] uppercase font-mono">Nueva Contraseña</span>
            <h3 class="font-headline text-lg text-white mt-1">Establezca su Contraseña</h3>
            <p class="text-xs text-[#a48b8c] mt-1">Ingrese y confirme su nueva contraseña.</p>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Nueva Contraseña</label>
              <input type="password" [(ngModel)]="recoveryNewPassword" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="Mínimo 10 caracteres" />
            </div>
            <div>
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Confirmar Contraseña</label>
              <input type="password" [(ngModel)]="recoveryConfirmPassword" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="Repita la contraseña" />
            </div>

            <!-- Reglas de contraseña -->
            <div class="p-3.5 bg-[#121316] rounded-2xl border border-[#564243]/50 space-y-1.5">
              <p class="text-[10px] font-bold uppercase tracking-wider text-[#a48b8c] mb-2">Requisitos de contraseña:</p>
              <div class="flex items-center space-x-2 text-xs" [class]="recoveryNewPassword.length >= 10 ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ recoveryNewPassword.length >= 10 ? '✓' : '○' }}</span>
                <span>Mínimo 10 caracteres</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasLower(recoveryNewPassword) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasLower(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 minúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasUpper(recoveryNewPassword) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasUpper(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 mayúscula</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasDigit(recoveryNewPassword) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasDigit(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 número</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="hasSpecial(recoveryNewPassword) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ hasSpecial(recoveryNewPassword) ? '✓' : '○' }}</span>
                <span>Al menos 1 carácter especial</span>
              </div>
              <div class="flex items-center space-x-2 text-xs" [class]="(recoveryNewPassword === recoveryConfirmPassword && recoveryConfirmPassword.length > 0) ? 'text-emerald-400' : 'text-[#6b6366]'">
                <span>{{ recoveryNewPassword === recoveryConfirmPassword && recoveryConfirmPassword.length > 0 ? '✓' : '○' }}</span>
                <span>Las contraseñas coinciden</span>
              </div>
            </div>

            <button
              (click)="submitNewPassword()"
              [disabled]="!isRecoveryPasswordValid()"
              class="w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 rounded-full text-xs font-bold tracking-wide uppercase transition-all hover:brightness-110 shadow-lg shadow-[#7a1c30]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0"
            >
              Establecer Contraseña
            </button>
          </div>
        </div>

        <!-- Paso 3: Éxito -->
        <div *ngIf="recoveryStep() === 3">
          <div class="text-center py-4">
            <div class="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto mb-4">
              <span class="material-symbols-outlined text-[28px] text-emerald-400">check_circle</span>
            </div>
            <h3 class="font-headline text-lg text-white">Contraseña Actualizada</h3>
            <p class="text-xs text-[#a48b8c] mt-2">Su contraseña ha sido restablecida exitosamente. Ahora puede iniciar sesión con su nueva contraseña.</p>
            <button (click)="showForgotModal.set(false)" class="mt-5 w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 rounded-full text-xs font-bold tracking-wide uppercase transition-all hover:brightness-110 shadow-lg shadow-[#7a1c30]/40 cursor-pointer border-0">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Solicitar acceso -->
    <div *ngIf="showRequestModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-lg w-full p-6 sm:p-8 rounded-[2.5rem] border border-[#564243]/50 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button (click)="showRequestModal.set(false)" class="absolute top-4 right-4 text-[#a48b8c] hover:text-white p-1 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div class="mb-5">
          <span class="text-[10px] font-bold tracking-wider text-[#ff8da1] uppercase font-mono">Provisión de Personal</span>
          <h3 class="font-headline text-lg text-white mt-1">Solicitar Acceso al Nodo</h3>
          <p class="text-xs text-[#a48b8c] mt-1">Las solicitudes son revisadas por el Director Global de Operaciones.</p>
        </div>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Nombre Completo</label>
              <input type="text" [(ngModel)]="reqName" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="ej. Marc Dubois" />
            </div>
            <div>
              <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Correo Corporativo</label>
              <input type="email" [(ngModel)]="reqEmail" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="marc.d@youshop.com" />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Departamento</label>
            <select [(ngModel)]="reqHub" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-full text-sm text-white focus:border-[#7a1c30] focus:outline-none">
              <option value="ventas">Ventas</option>
              <option value="logistica">Logística</option>
              <option value="inventario">Inventario</option>
              <option value="admin">Administración</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-[#a48b8c] uppercase tracking-wide">Justificación del Acceso</label>
            <textarea [(ngModel)]="reqReason" rows="3" class="w-full mt-1 px-4 py-2.5 bg-[#121316] border border-[#564243] rounded-2xl text-sm text-white focus:border-[#7a1c30] focus:outline-none" placeholder="ej. Asignado a operaciones de reabastecimiento de boutique."></textarea>
          </div>
          <button (click)="submitAccessRequest()" class="w-full bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white py-3 rounded-full text-xs font-bold tracking-wide uppercase transition-all hover:brightness-110 shadow-lg shadow-[#7a1c30]/40 cursor-pointer border-0">
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
  @Output() backToLanding = new EventEmitter<void>();

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
