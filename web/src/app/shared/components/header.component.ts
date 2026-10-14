import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="h-16 bg-white border-b border-gray-200 px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">

      <!-- Izquierda: Menú móvil y breadcrumb -->
      <div class="flex items-center space-x-3">
        <button
          (click)="toggleMobileMenu.emit()"
          class="md:hidden text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Alternar navegación"
        >
          <span class="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <div class="flex items-center space-x-2 text-sm">
          <span class="font-bold text-gray-900 tracking-tight">YouShop</span>
          <span class="text-gray-300">/</span>
          <span class="text-gray-400 hidden sm:inline">Operaciones</span>
          <span class="text-gray-300 hidden sm:inline">/</span>
          <span class="font-medium text-gray-900">{{ activeViewTitle }}</span>
        </div>
      </div>

      <!-- Derecha: Estado en vivo e identidad de usuario -->
      <div class="flex items-center space-x-3">

        <!-- Indicador de estado del sistema -->
        <div class="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-[11px] font-bold text-emerald-700 uppercase tracking-tight">Bóveda Sincronizada</span>
        </div>

        <!-- Menú de usuario -->
        <div class="relative" *ngIf="authService.currentUser() as user">
          <button
            (click)="showUserDropdown.update(v => !v)"
            class="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-left cursor-pointer border border-transparent hover:border-gray-200"
          >
            <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs border border-indigo-200">
              {{ user.nombre.substring(0, 2).toUpperCase() }}
            </div>
            <div class="hidden md:block">
              <p class="text-xs font-bold text-gray-900 leading-tight">{{ user.nombre }}</p>
              <p class="text-[10px] text-gray-500 font-medium">{{ user.rol }}</p>
            </div>
            <span class="material-symbols-outlined text-[16px] text-gray-400">expand_more</span>
          </button>

          <!-- Menú desplegable -->
          <div
            *ngIf="showUserDropdown()"
            class="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            <div class="px-3 py-2 border-b border-gray-100">
              <p class="text-xs font-bold text-gray-900">{{ user.nombre }}</p>
              <p class="text-xs text-gray-500 truncate">{{ user.email }}</p>
              <span class="inline-block mt-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase border border-indigo-100">
                {{ user.rol }}
              </span>
            </div>

            <div class="py-1">
              <p class="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Permisos activos:</p>
              <div class="px-3 py-1 flex flex-wrap gap-1">
                <span *ngFor="let perm of user.permisos" class="px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600 text-[9px] font-medium">
                  {{ perm.replace('_', ' ') }}
                </span>
              </div>
            </div>

            <div class="pt-1 border-t border-gray-100 space-y-0.5">
              <button
                (click)="openChangePassword()"
                class="w-full text-left px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs font-semibold text-gray-700 flex items-center space-x-2"
              >
                <span class="material-symbols-outlined text-[16px]">lock</span>
                <span>Cambiar Contraseña</span>
              </button>
              <button
                (click)="onLogout()"
                class="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-xs font-semibold text-rose-600 flex items-center space-x-2"
              >
                <span class="material-symbols-outlined text-[16px]">logout</span>
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Modal: Cambiar contraseña -->
    <div *ngIf="showChangePasswordModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xl relative">
        <button (click)="showChangePasswordModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
        <div class="mb-5">
          <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Seguridad de Cuenta</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">Cambiar Contraseña</h3>
          <p class="text-xs text-gray-500 mt-1">Ingrese su contraseña actual y la nueva contraseña.</p>
        </div>
        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Contraseña Actual</label>
            <input type="password" [(ngModel)]="currentPassword" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Ingrese su contraseña actual" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nueva Contraseña</label>
            <input type="password" [(ngModel)]="newPassword" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Mínimo 10 caracteres" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Confirmar Nueva Contraseña</label>
            <input type="password" [(ngModel)]="confirmPassword" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Repita la nueva contraseña" />
          </div>

          <!-- Reglas de contraseña -->
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requisitos de contraseña:</p>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="newPassword.length >= 10" [class.text-gray-400]="newPassword.length < 10">
              <span>{{ newPassword.length >= 10 ? '✓' : '○' }}</span>
              <span>Mínimo 10 caracteres</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasLower(newPassword)" [class.text-gray-400]="!hasLower(newPassword)">
              <span>{{ hasLower(newPassword) ? '✓' : '○' }}</span>
              <span>Al menos 1 minúscula</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasUpper(newPassword)" [class.text-gray-400]="!hasUpper(newPassword)">
              <span>{{ hasUpper(newPassword) ? '✓' : '○' }}</span>
              <span>Al menos 1 mayúscula</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasDigit(newPassword)" [class.text-gray-400]="!hasDigit(newPassword)">
              <span>{{ hasDigit(newPassword) ? '✓' : '○' }}</span>
              <span>Al menos 1 número</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasSpecial(newPassword)" [class.text-gray-400]="!hasSpecial(newPassword)">
              <span>{{ hasSpecial(newPassword) ? '✓' : '○' }}</span>
              <span>Al menos 1 carácter especial</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="newPassword === confirmPassword && confirmPassword.length > 0" [class.text-gray-400]="newPassword !== confirmPassword || confirmPassword.length === 0">
              <span>{{ newPassword === confirmPassword && confirmPassword.length > 0 ? '✓' : '○' }}</span>
              <span>Las contraseñas coinciden</span>
            </div>
          </div>

          <button
            (click)="submitChangePassword()"
            [disabled]="!isChangePasswordValid()"
            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Actualizar Contraseña
          </button>
        </div>
      </div>
    </div>
  `
})
export class HeaderComponent {
  @Input() activeViewTitle = 'Centro de Operaciones';
  @Output() toggleMobileMenu = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  showUserDropdown = signal<boolean>(false);
  showChangePasswordModal = signal<boolean>(false);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  constructor(public authService: AuthService) {}

  openChangePassword() {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.showUserDropdown.set(false);
    this.showChangePasswordModal.set(true);
  }

  hasLower(value: string): boolean {
    return /[a-z]/.test(value);
  }

  hasUpper(value: string): boolean {
    return /[A-Z]/.test(value);
  }

  hasDigit(value: string): boolean {
    return /[0-9]/.test(value);
  }

  hasSpecial(value: string): boolean {
    return /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value);
  }

  isChangePasswordValid(): boolean {
    return (
      this.currentPassword.length > 0 &&
      this.newPassword.length >= 10 &&
      this.hasLower(this.newPassword) &&
      this.hasUpper(this.newPassword) &&
      this.hasDigit(this.newPassword) &&
      this.hasSpecial(this.newPassword) &&
      this.newPassword === this.confirmPassword
    );
  }

  submitChangePassword() {
    if (!this.isChangePasswordValid()) return;
    this.authService.changePassword(this.currentPassword, this.newPassword).then((ok) => {
      if (ok) {
        this.showChangePasswordModal.set(false);
      }
    });
  }

  onLogout() {
    this.showUserDropdown.set(false);
    this.authService.logout();
    this.logout.emit();
  }
}
