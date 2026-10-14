import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-xl mx-auto p-6 sm:p-8">
      <div class="mb-6">
        <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Mi Cuenta</span>
        <h2 class="text-xl font-bold text-gray-900 mt-1">Datos de mi perfil</h2>
        <p class="text-sm text-gray-500 mt-1">Información de solo lectura asociada a tu cuenta.</p>
      </div>

      <div class="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5" *ngIf="authService.currentUser() as user; else noUser">
        <div class="flex items-center space-x-4">
          <div class="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg border border-indigo-200">
            {{ user.nombre.substring(0, 2).toUpperCase() }}
          </div>
          <div>
            <p class="text-base font-bold text-gray-900 leading-tight">{{ user.nombre }}</p>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase border border-indigo-100">
              {{ user.rol }}
            </span>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombre</p>
            <p class="text-sm text-gray-900 font-medium mt-0.5">{{ user.nombre }}</p>
          </div>
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Correo Electrónico</p>
            <p class="text-sm text-gray-900 font-medium mt-0.5">{{ user.email }}</p>
          </div>
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rol</p>
            <p class="text-sm text-gray-900 font-medium mt-0.5">{{ user.rol }}</p>
          </div>
        </div>
      </div>

      <ng-template #noUser>
        <div class="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 text-sm text-gray-500">
          No se encontraron datos de la cuenta.
        </div>
      </ng-template>
    </div>
  `
})
export class CustomerProfileComponent {
  constructor(public authService: AuthService) {}
}
