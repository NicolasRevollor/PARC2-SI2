import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { CuponesService, MisCupones } from '../../../core/services/cupones.service';
import { AvisoStock, PedidoDomicilio, TiendaService } from '../../../core/services/tienda.service';
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

      <!-- [CU35] Mis pedidos a domicilio -->
      <div *ngIf="pedidos().length" class="bg-[#18191d] rounded-2xl border border-gray-200 shadow-xs p-6 space-y-3 mt-6" data-testid="mis-pedidos">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-base font-bold text-gray-900">Mis pedidos a domicilio</h3>
          <app-cu-badge cu="CU35"></app-cu-badge>
        </div>
        <div *ngFor="let p of pedidos()" class="p-3 rounded-xl border border-gray-200 text-xs space-y-0.5">
          <p class="flex justify-between"><b class="text-gray-900 font-mono">{{ p.codigo }}</b>
            <span class="font-bold uppercase text-[10px]" [ngClass]="p.estado === 'Completado' ? 'text-emerald-600' : p.estado === 'Fallido' ? 'text-rose-600' : 'text-indigo-600'">{{ textoEstado(p) }}</span></p>
          <p class="text-gray-600">{{ p.producto }} · Bs {{ p.total.toFixed(2) }} + envío Bs {{ p.costo.toFixed(2) }}</p>
          <p class="text-gray-500">{{ p.direccion }}<span *ngIf="p.fechaProgramada"> · llega el {{ p.fechaProgramada | date: 'dd/MM' }} por la {{ p.franja === 'tarde' ? 'tarde' : 'mañana' }}</span></p>
        </div>
      </div>

      <!-- [CU34] Avisos de stock -->
      <div *ngIf="avisos().length" class="bg-[#18191d] rounded-2xl border border-gray-200 shadow-xs p-6 space-y-3 mt-6" data-testid="mis-avisos">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-base font-bold text-gray-900">Avisos de stock</h3>
          <app-cu-badge cu="CU34"></app-cu-badge>
        </div>
        <div *ngFor="let a of avisos()" class="flex items-center justify-between gap-3 text-xs p-3 rounded-xl border"
             [ngClass]="a.estado === 'Avisado' ? 'border-emerald-300' : 'border-gray-200'">
          <div>
            <p class="font-bold text-gray-900">{{ a.producto }} · talla {{ a.talla || '—' }} {{ a.color || '' }}</p>
            <p class="text-gray-500">{{ a.estado === 'Avisado' ? '¡Volvió! Hay stock en ' + (a.sucursal || 'la tienda') : 'Esperando que vuelva' }}</p>
          </div>
          <button *ngIf="a.estado === 'Pendiente'" (click)="cancelarAviso(a)" class="text-gray-500 underline bg-transparent cursor-pointer">Quitar</button>
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
  readonly pedidos = signal<PedidoDomicilio[]>([]);
  readonly avisos = signal<AvisoStock[]>([]);

  constructor(public authService: AuthService, private cuponesService: CuponesService, private tiendaService: TiendaService) {}

  async ngOnInit(): Promise<void> {
    const [cupones, pedidos, avisos] = await Promise.all([
      this.cuponesService.misCupones(), this.tiendaService.misPedidos(), this.tiendaService.misAvisos(),
    ]);
    this.cupones.set(cupones);
    this.pedidos.set(pedidos);
    this.avisos.set(avisos);
  }

  textoEstado(p: PedidoDomicilio): string {
    return { Solicitado: 'Preparando', Programado: 'En camino', Completado: 'Entregado', Fallido: 'No pudimos entregarlo', Cancelado: 'Cancelado' }[p.estado] ?? p.estado;
  }

  async cancelarAviso(a: AvisoStock): Promise<void> {
    if (await this.tiendaService.cancelarAviso(a.idAviso)) this.avisos.update((l) => l.filter((x) => x.idAviso !== a.idAviso));
  }
}
