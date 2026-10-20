import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { HeaderComponent } from './shared/components/header.component';
import { SidebarComponent, AppView } from './shared/components/sidebar.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { SplashScreenComponent } from './shared/components/splash-screen.component';
import { LandingComponent } from './features/landing/landing.component';
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
import { ReturnsComponent } from './features/returns/returns.component';
import { SubscriptionComponent } from './features/subscription/subscription.component';
import { PwaService } from './core/services/pwa.service';
import { PlatformComponent } from './features/platform/platform.component';
import { PERMISO_PLATAFORMA } from './core/services/platform.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SplashScreenComponent,
    LandingComponent,
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
    IndicadoresComponent,
    ReturnsComponent,
    SubscriptionComponent,
    PlatformComponent
  ],
  template: `
    <!-- Branded loader overlay: shown briefly when moving from the landing page
         into the login screen, and while a restored session is resolving. -->
    <app-splash-screen *ngIf="showSplash()"></app-splash-screen>

    <!-- Public Marketing Landing Page: shown before login for unauthenticated visitors -->
    <app-landing
      *ngIf="showLanding() && !authService.isAuthenticated()"
      (enterLogin)="onEnterLogin()"
    ></app-landing>

    <!-- Top Level Screen Router: Show Login/Register or Authenticated Portal -->
    <ng-container *ngIf="!showLanding() || authService.isAuthenticated()">
    <ng-container *ngIf="!authService.isAuthenticated() || showAuthScreen(); else authGate">
      <app-login
        *ngIf="authMode() === 'login'"
        (loggedIn)="onLoginSuccess()"
        (showRegister)="authMode.set('register')"
        (backToLanding)="onBackToLanding()"
      ></app-login>
      <app-register
        *ngIf="authMode() === 'register'"
        (registered)="onRegisterSuccess()"
        (backToLogin)="authMode.set('login')"
        (backToLanding)="onBackToLanding()"
      ></app-register>
    </ng-container>

    <!-- Authenticated but currentUser() not yet resolved: branded loader to avoid
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
      <app-splash-screen></app-splash-screen>
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
          class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in"
          (click)="mobileMenuOpen.set(false)"
        >
          <div
            class="w-64 h-full bg-[#18191d] shadow-2xl"
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

            <app-returns
              *ngIf="activeView() === 'returns'"
            ></app-returns>

            <app-subscription
              *ngIf="activeView() === 'subscription'"
            ></app-subscription>

            <app-platform
              *ngIf="activeView() === 'platform'"
            ></app-platform>
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
  showSplash = signal<boolean>(false);
  showLanding = signal<boolean>(true);

  isCustomer = computed(() => this.authService.currentUser()?.rol === 'Cliente');

  constructor(
    public authService: AuthService,
    private pwaService: PwaService,
  ) {
    this.showLanding.set(!authService.isAuthenticated());
    // Registro del service worker e instalabilidad: no depende de la sesión,
    // la vitrina pública también se cachea para abrir sin red.
    void this.pwaService.iniciar();
  }

  onEnterLogin() {
    this.showSplash.set(true);
    setTimeout(() => {
      this.showLanding.set(false);
      this.showSplash.set(false);
    }, 1600);
  }

  onBackToLanding() {
    this.authMode.set('login');
    this.showLanding.set(true);
  }

  onLoginSuccess() {
    this.showAuthScreen.set(false);
    this.authMode.set('login');
    // El superadministrador entra directo a su consola de empresas.
    if (this.authService.currentUser()?.permisos.includes(PERMISO_PLATAFORMA)) {
      this.activeView.set('platform');
    }
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
      case 'returns':
        return 'Devoluciones y Cambios de Talla';
      case 'subscription':
        return 'Suscripción y Operación Local';
      case 'platform':
        return 'Consola de Plataforma';
      default:
        return 'Operaciones';
    }
  }
}
