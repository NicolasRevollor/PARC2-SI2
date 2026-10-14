import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { CustomerProfileComponent } from './profile/customer-profile.component';
import { CatalogComponent } from './catalog/catalog.component';
import { CustomerReservationsComponent } from './reservations/customer-reservations.component';
import { ChatWidgetComponent } from '../../shared/components/chat-widget.component';

export type CustomerView = 'catalog' | 'reservations' | 'profile';

@Component({
  selector: 'app-customer-shell',
  standalone: true,
  imports: [CommonModule, CustomerProfileComponent, CatalogComponent, CustomerReservationsComponent, ChatWidgetComponent],
  template: `
    <div class="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">

      <!-- Navegación superior del cliente (sin sidebar tipo staff) -->
      <header class="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div class="flex items-center space-x-6">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs">
              Y
            </div>
            <span class="font-bold text-base tracking-tight text-gray-900">YouShop</span>
          </div>

          <nav class="hidden sm:flex items-center space-x-1">
            <button
              (click)="currentView.set('catalog')"
              [class.bg-indigo-50]="currentView() === 'catalog'"
              [class.text-indigo-700]="currentView() === 'catalog'"
              [class.text-gray-600]="currentView() !== 'catalog'"
              class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
            >
              Catálogo
            </button>
            <button
              (click)="currentView.set('reservations')"
              [class.bg-indigo-50]="currentView() === 'reservations'"
              [class.text-indigo-700]="currentView() === 'reservations'"
              [class.text-gray-600]="currentView() !== 'reservations'"
              class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
            >
              Mis Reservas
            </button>
            <button
              (click)="currentView.set('profile')"
              [class.bg-indigo-50]="currentView() === 'profile'"
              [class.text-indigo-700]="currentView() === 'profile'"
              [class.text-gray-600]="currentView() !== 'profile'"
              class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
            >
              Mi Perfil
            </button>
          </nav>
        </div>

        <div class="flex items-center space-x-3" *ngIf="authService.currentUser() as user">
          <button
            (click)="onAbrirCarrito()"
            class="relative p-2 rounded-lg hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 transition-colors cursor-pointer"
            aria-label="Ver carrito"
            title="Ver carrito"
          >
            <span class="material-symbols-outlined text-[20px]">shopping_cart</span>
            <span
              *ngIf="cartService.cantidadTotal() > 0"
              class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {{ cartService.cantidadTotal() }}
            </span>
          </button>
          <div class="hidden md:block text-right">
            <p class="text-xs font-bold text-gray-900 leading-tight">{{ user.nombre }}</p>
            <p class="text-[10px] text-gray-500 font-medium">{{ user.rol }}</p>
          </div>
          <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs border border-indigo-200">
            {{ user.nombre.substring(0, 2).toUpperCase() }}
          </div>
          <button
            (click)="onLogout()"
            class="p-2 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <span class="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </header>

      <!-- Navegación inferior móvil -->
      <nav class="sm:hidden flex items-center justify-around bg-white border-b border-gray-200 py-1 shrink-0">
        <button
          (click)="currentView.set('catalog')"
          [class.text-indigo-700]="currentView() === 'catalog'"
          [class.text-gray-500]="currentView() !== 'catalog'"
          class="flex-1 text-center py-2 text-xs font-semibold cursor-pointer"
        >
          Catálogo
        </button>
        <button
          (click)="currentView.set('reservations')"
          [class.text-indigo-700]="currentView() === 'reservations'"
          [class.text-gray-500]="currentView() !== 'reservations'"
          class="flex-1 text-center py-2 text-xs font-semibold cursor-pointer"
        >
          Mis Reservas
        </button>
        <button
          (click)="currentView.set('profile')"
          [class.text-indigo-700]="currentView() === 'profile'"
          [class.text-gray-500]="currentView() !== 'profile'"
          class="flex-1 text-center py-2 text-xs font-semibold cursor-pointer"
        >
          Mi Perfil
        </button>
      </nav>

      <!-- Contenido de la vista actual -->
      <main class="flex-1 overflow-y-auto bg-gray-50">
        <app-customer-catalog *ngIf="currentView() === 'catalog'"></app-customer-catalog>

        <app-customer-reservations *ngIf="currentView() === 'reservations'"></app-customer-reservations>

        <app-customer-profile *ngIf="currentView() === 'profile'"></app-customer-profile>
      </main>

      <app-chat-widget></app-chat-widget>
    </div>
  `
})
export class CustomerShellComponent {
  currentView = signal<CustomerView>('catalog');

  @Output() logout = new EventEmitter<void>();

  constructor(
    public authService: AuthService,
    public cartService: CartService,
  ) {}

  onLogout() {
    this.authService.logout();
    this.logout.emit();
  }

  onAbrirCarrito() {
    this.currentView.set('catalog');
    this.cartService.abrirPanel();
  }
}
