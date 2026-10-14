import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { HeaderComponent } from './shared/components/header.component';
import { SidebarComponent, AppView } from './shared/components/sidebar.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { SplashScreenComponent } from './shared/components/splash-screen.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ArchiveComponent } from './features/archive/archive.component';
import { InventoryComponent } from './features/inventory/inventory.component';
import { LogisticsComponent } from './features/logistics/logistics.component';
import { SuppliersComponent } from './features/suppliers/suppliers.component';
import { SeasonsComponent } from './features/seasons/seasons.component';
import { TeamComponent } from './features/team/team.component';
import { CustomerShellComponent } from './features/customer/customer-shell.component';
import { StaffReservationsComponent } from './features/reservations/staff-reservations.component';
import { PosComponent } from './features/pos/pos.component';
import { LocationsComponent } from './features/locations/locations.component';
import { ReportsComponent } from './features/reports/reports.component';
import { IndicadoresComponent } from './features/indicadores/indicadores.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SplashScreenComponent,
    LoginComponent,
    RegisterComponent,
    HeaderComponent,
    SidebarComponent,
    ToastContainerComponent,
    DashboardComponent,
    ArchiveComponent,
    InventoryComponent,
    LogisticsComponent,
    SuppliersComponent,
    SeasonsComponent,
    TeamComponent,
    CustomerShellComponent,
    StaffReservationsComponent,
    PosComponent,
    LocationsComponent,
    ReportsComponent,
    IndicadoresComponent
  ],
  template: `
    <!-- Initial Splash: shown briefly before the Login/Portal router takes over -->
    <app-splash-screen *ngIf="showSplash()"></app-splash-screen>

    <ng-container *ngIf="!showSplash()">
    <!-- Top Level Screen Router: Show Login/Register or Authenticated Portal -->
    <ng-container *ngIf="!authService.isAuthenticated() || showAuthScreen(); else authGate">
      <app-login
        *ngIf="authMode() === 'login'"
        (loggedIn)="onLoginSuccess()"
        (showRegister)="authMode.set('register')"
      ></app-login>
      <app-register
        *ngIf="authMode() === 'register'"
        (registered)="onRegisterSuccess()"
        (backToLogin)="authMode.set('login')"
      ></app-register>
    </ng-container>

    <!-- Authenticated but currentUser() not yet resolved: neutral loading state to avoid
         flashing the staff shell for a Cliente that reloads the page (loadTokenFromStorage
         sets isAuthenticated before fetchCurrentUser() resolves). -->
    <ng-template #authGate>
      <ng-container *ngIf="authService.currentUser() !== null; else loadingState">
        <ng-container *ngIf="isCustomer(); else portalLayout">
          <app-customer-shell (logout)="onLogout()"></app-customer-shell>
        </ng-container>
      </ng-container>
    </ng-template>

    <ng-template #loadingState>
      <div class="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-500 text-sm font-medium">
        Cargando sesión…
      </div>
    </ng-template>

    <!-- Main Operational Workspace Shell -->
    <ng-template #portalLayout>
      <div class="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
        
        <!-- Desktop Sidebar Navigation -->
        <div class="hidden md:block h-full shrink-0">
          <app-sidebar
            [currentView]="activeView()"
            (viewChange)="onViewChange($event)"
            (viewAuthScreen)="toggleAuthScreen()"
          ></app-sidebar>
        </div>

        <!-- Mobile Drawer Navigation -->
        <div
          *ngIf="mobileMenuOpen()"
          class="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-xs md:hidden animate-in fade-in"
          (click)="mobileMenuOpen.set(false)"
        >
          <div
            class="w-64 h-full bg-white shadow-2xl"
            (click)="$event.stopPropagation()"
          >
            <app-sidebar
              [currentView]="activeView()"
              (viewChange)="onViewChange($event); mobileMenuOpen.set(false)"
              (viewAuthScreen)="toggleAuthScreen(); mobileMenuOpen.set(false)"
            ></app-sidebar>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          
          <!-- Shared Header -->
          <app-header
            [activeViewTitle]="getViewTitle(activeView())"
            (toggleMobileMenu)="mobileMenuOpen.set(true)"
            (logout)="onLogout()"
          ></app-header>

          <!-- Scrollable View Container -->
          <main class="flex-1 overflow-y-auto bg-gray-50">
            <app-dashboard
              *ngIf="activeView() === 'dashboard'"
              (navigate)="onViewChange($event)"
            ></app-dashboard>

            <app-archive
              *ngIf="activeView() === 'archive'"
            ></app-archive>

            <app-inventory
              *ngIf="activeView() === 'inventory'"
            ></app-inventory>

            <app-logistics
              *ngIf="activeView() === 'logistics'"
            ></app-logistics>

            <app-suppliers
              *ngIf="activeView() === 'suppliers'"
            ></app-suppliers>

            <app-seasons
              *ngIf="activeView() === 'seasons'"
            ></app-seasons>

            <app-team
              *ngIf="activeView() === 'team'"
            ></app-team>

            <app-staff-reservations
              *ngIf="activeView() === 'reservations'"
            ></app-staff-reservations>

            <app-pos
              *ngIf="activeView() === 'pos'"
            ></app-pos>

            <app-locations
              *ngIf="activeView() === 'locations'"
            ></app-locations>

            <app-reports
              *ngIf="activeView() === 'reports'"
            ></app-reports>

            <app-indicadores
              *ngIf="activeView() === 'indicadores'"
            ></app-indicadores>
          </main>
        </div>
      </div>
    </ng-template>

    <!-- Global Toast Alert Messages -->
    <app-toast-container></app-toast-container>
    </ng-container>
  `
})
export class AppComponent {
  activeView = signal<AppView>('dashboard');
  showAuthScreen = signal<boolean>(false);
  mobileMenuOpen = signal<boolean>(false);
  authMode = signal<'login' | 'register'>('login');
  showSplash = signal<boolean>(true);

  isCustomer = computed(() => this.authService.currentUser()?.rol === 'Cliente');

  constructor(public authService: AuthService) {
    setTimeout(() => this.showSplash.set(false), 2200);
  }

  onLoginSuccess() {
    this.showAuthScreen.set(false);
    this.authMode.set('login');
  }

  onRegisterSuccess() {
    this.showAuthScreen.set(false);
    this.authMode.set('login');
  }

  onLogout() {
    this.showAuthScreen.set(true);
    this.authMode.set('login');
  }

  toggleAuthScreen() {
    this.showAuthScreen.set(true);
  }

  onViewChange(view: AppView) {
    this.activeView.set(view);
    this.showAuthScreen.set(false);
  }

  getViewTitle(view: AppView): string {
    switch (view) {
      case 'dashboard':
        return 'Centro de Operaciones';
      case 'archive':
        return 'Archivo y Catálogo de Prendas';
      case 'inventory':
        return 'Asignación Global de Stock';
      case 'logistics':
        return 'Despachos y Tránsito Seguro';
      case 'suppliers':
        return 'Gestión de Proveedores';
      case 'seasons':
        return 'Temporadas y Colecciones';
      case 'team':
        return 'Personal y Acceso a Nodos';
      case 'reservations':
        return 'Reservas y Atención en Sucursal';
      case 'pos':
        return 'Caja — Venta Presencial';
      case 'locations':
        return 'Ciudades y Sucursales';
      case 'reports':
        return 'Reportes de Ventas e Inventario';
      case 'indicadores':
        return 'Dashboard de Indicadores Empresariales';
      default:
        return 'Operaciones';
    }
  }
}
