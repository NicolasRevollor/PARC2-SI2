import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { CuponesService, MisCupones } from '../../../core/services/cupones.service';
import { CuBadgeComponent } from '../../../shared/components/cu-badge.component';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [CommonModule, CuBadgeComponent],
  template: `
    <div class="max-w-xl mx-auto p-6 sm:p-8">
      <div class="mb-6">
        <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Mi Cuenta</span>
        <h2 class="text-xl font-bold text-gray-900 mt-1">Datos de mi perfil</h2>
        <p class="text-sm text-gray-500 mt-1">Información de solo lectura asociada a tu cuenta.</p>
      </div>

      <div class="bg-[#18191d] rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5" *ngIf="authService.currentUser() as user; else noUser">
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

      <!-- [CU33] Mis cupones: cada 3 compras en una tienda, 30% en la siguiente -->
      <div *ngIf="cupones() as m" class="bg-[#18191d] rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 mt-6" data-testid="mis-cupones">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-base font-bold text-gray-900">Mis cupones</h3>
          <app-cu-badge cu="CU33"></app-cu-badge>
        </div>
        <p class="text-xs text-gray-500">{{ m.regla }}</p>
        <div *ngFor="let p of m.progreso" class="space-y-1">
          <p class="text-xs text-gray-700 flex justify-between"><span>{{ p.empresa }}</span>
            <span>{{ p.faltan === p.comprasPorCupon && p.compras > 0 ? '¡Cupón ganado! Próximo en ' + p.faltan + ' compras' : 'Te ' + (p.faltan === 1 ? 'falta 1 compra' : 'faltan ' + p.faltan + ' compras') }}</span></p>
          <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div class="h-full bg-emerald-500" [style.width.%]="((p.comprasPorCupon - p.faltan) / p.comprasPorCupon) * 100"></div>
          </div>
        </div>
        <p *ngIf="!m.cupones.length" class="text-sm text-gray-400">Todavía no tenés cupones.</p>
        <div *ngFor="let c of m.cupones" class="flex items-center justify-between gap-3 p-3 rounded-xl border"
             [ngClass]="c.estado === 'Disponible' ? 'border-emerald-300' : 'border-gray-200 opacity-60'" data-testid="cupon">
          <div>
            <p class="text-sm font-bold text-gray-900 font-mono">{{ c.codigo }}</p>
            <p class="text-[11px] text-gray-500">{{ c.porcentaje }}% en {{ c.empresa }} ·
              {{ c.estado === 'Usado' ? 'usado el ' + (c.fechaUso | date: 'dd/MM/yyyy') + ' (ahorraste Bs ' + c.montoDescontado.toFixed(2) + ')' : 'vence el ' + (c.fechaVencimiento | date: 'dd/MM/yyyy') }}</p>
          </div>
          <span class="text-[10px] font-bold uppercase" [ngClass]="c.estado === 'Disponible' ? 'text-emerald-600' : 'text-gray-400'">{{ c.estado }}</span>
        </div>
      </div>

      <ng-template #noUser>
        <div class="bg-[#18191d] rounded-2xl border border-gray-200 shadow-xs p-6 text-sm text-gray-500">
          No se encontraron datos de la cuenta.
        </div>
      </ng-template>
    </div>
  `
})
export class CustomerProfileComponent implements OnInit {
  readonly cupones = signal<MisCupones | null>(null);

  constructor(public authService: AuthService, private cuponesService: CuponesService) {}

  async ngOnInit(): Promise<void> {
    this.cupones.set(await this.cuponesService.misCupones());
  }
}
