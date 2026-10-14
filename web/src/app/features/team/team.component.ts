import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../core/services/team.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamMember, StaffRole } from '../../core/models';
import { hasDigit, hasLower, hasSpecial, hasUpper, hasMinLength, isStrong } from '../../shared/utils/password-rules';

const STAFF_ROLES: StaffRole[] = ['Administrador', 'Encargado de Sucursal', 'Cajero'];

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Gobernanza de Seguridad y RBAC</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Directorio de Personal y Nodos de Acceso</h1>
          <p class="text-xs text-gray-500 mt-1">
            Permisos basados en roles, registros de actividad y autorización de nodos administrativos.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            (click)="openCreateModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      <!-- Tarjetas de personal -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          *ngFor="let member of teamService.teamMembers()"
          class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs hover:border-gray-300 transition-all flex flex-col justify-between"
        >
          <div>
            <div class="flex items-start justify-between mb-3.5">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm border border-indigo-200">
                  {{ member.nombre.substring(0, 2).toUpperCase() }}
                </div>
                <div>
                  <h3 class="text-sm font-bold text-gray-900">{{ member.nombre }}</h3>
                  <p class="text-xs text-gray-500 truncate max-w-[140px]">{{ member.correo }}</p>
                </div>
              </div>

              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border"
                [ngClass]="getRolBadgeClass(member.rol)"
              >
                {{ member.rol }}
              </span>
            </div>

            <div class="mt-3.5 pt-3 border-t border-gray-100">
              <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Permisos Activos:</p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  *ngFor="let perm of member.permisos"
                  class="px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-medium"
                >
                  {{ perm.replace('_', ' ') }}
                </span>
              </div>
            </div>

            <div class="mt-3.5 pt-3 border-t border-gray-100">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Cambiar Rol</label>
              <select
                [disabled]="savingRoleFor() === member.idUser"
                [value]="member.rol"
                (change)="onRoleChange(member, $event)"
                class="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option *ngFor="let rol of staffRoles" [value]="rol">{{ rol }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Registro de auditoría de seguridad -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 lg:p-6 shadow-xs">
        <div class="flex items-center justify-between pb-3.5 border-b border-gray-100">
          <div>
            <h2 class="text-sm font-bold text-gray-900">Registro de Auditoría y Actividad de Seguridad</h2>
            <p class="text-xs text-gray-500">Registro inmutable de alteraciones de inventario, despachos y eventos de acceso</p>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider">Flujo en Vivo</span>
        </div>

        <div class="divide-y divide-gray-100 mt-1">
          <div *ngFor="let log of teamService.auditLogs()" class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div class="flex items-start space-x-2.5">
              <span class="material-symbols-outlined text-[18px] text-indigo-600 mt-0.5">verified_user</span>
              <div>
                <span class="font-bold text-gray-900">{{ log.usuario_nombre }}</span>
                <span class="text-gray-400 mx-1.5">•</span>
                <span class="text-gray-600">{{ log.accion }}</span>
              </div>
            </div>
            <div class="text-[11px] text-gray-400 shrink-0 font-medium">
              {{ log.fecha }} {{ log.hora }}
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal: Crear usuario de personal -->
    <div *ngIf="showCreateModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="closeCreateModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Gobernanza de Seguridad</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">Nuevo Usuario de Personal</h2>
        </div>

        <form (ngSubmit)="submitCreate()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="form.nombre" name="nombre" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Correo</label>
            <input type="email" [(ngModel)]="form.email" name="email" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Contraseña</label>
            <input type="password" [(ngModel)]="form.password" name="password" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Rol</label>
            <select [(ngModel)]="form.rol" name="rol" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option *ngFor="let rol of staffRoles" [value]="rol">{{ rol }}</option>
            </select>
          </div>

          <!-- Checklist en vivo de reglas de contraseña -->
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requisitos de contraseña:</p>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasMinLength(form.password)" [class.text-gray-400]="!hasMinLength(form.password)">
              <span>{{ hasMinLength(form.password) ? '✓' : '○' }}</span>
              <span>Mínimo 10 caracteres</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasLower(form.password)" [class.text-gray-400]="!hasLower(form.password)">
              <span>{{ hasLower(form.password) ? '✓' : '○' }}</span>
              <span>Al menos 1 minúscula</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasUpper(form.password)" [class.text-gray-400]="!hasUpper(form.password)">
              <span>{{ hasUpper(form.password) ? '✓' : '○' }}</span>
              <span>Al menos 1 mayúscula</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasDigit(form.password)" [class.text-gray-400]="!hasDigit(form.password)">
              <span>{{ hasDigit(form.password) ? '✓' : '○' }}</span>
              <span>Al menos 1 número</span>
            </div>
            <div class="flex items-center space-x-2 text-xs" [class.text-emerald-600]="hasSpecial(form.password)" [class.text-gray-400]="!hasSpecial(form.password)">
              <span>{{ hasSpecial(form.password) ? '✓' : '○' }}</span>
              <span>Al menos 1 carácter especial</span>
            </div>
          </div>

          <p *ngIf="createError()" class="text-xs text-rose-600">{{ createError() }}</p>

          <button
            type="submit"
            [disabled]="saving() || !canSubmitCreate()"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ saving() ? 'Creando...' : 'Crear Usuario' }}
          </button>
        </form>
      </div>
    </div>
  `
})
export class TeamComponent implements OnInit {
  staffRoles = STAFF_ROLES;

  showCreateModal = signal<boolean>(false);
  saving = signal<boolean>(false);
  createError = signal<string | null>(null);
  savingRoleFor = signal<number | null>(null);

  form: { nombre: string; email: string; password: string; rol: StaffRole } = {
    nombre: '',
    email: '',
    password: '',
    rol: 'Cajero',
  };

  constructor(
    public teamService: TeamService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit() {
    this.teamService.loadTeam();
    this.teamService.loadAuditLog();
  }

  getRolBadgeClass(rol: string): string {
    const lower = rol.toLowerCase();
    if (lower.includes('admin')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (lower.includes('encargado') || lower.includes('sucursal')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (lower.includes('cajero')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (lower.includes('proveedor')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (lower.includes('cliente')) return 'bg-gray-100 text-gray-600 border-gray-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
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

  hasMinLength(value: string): boolean {
    return hasMinLength(value);
  }

  canSubmitCreate(): boolean {
    return (
      this.form.nombre.trim().length > 0 &&
      this.form.email.trim().length > 0 &&
      isStrong(this.form.password)
    );
  }

  openCreateModal() {
    this.form = { nombre: '', email: '', password: '', rol: 'Cajero' };
    this.createError.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
  }

  submitCreate() {
    if (!this.canSubmitCreate()) return;

    this.createError.set(null);
    this.saving.set(true);

    this.teamService
      .createStaffUser({ ...this.form })
      .then(() => {
        this.saving.set(false);
        this.showCreateModal.set(false);
        this.notificationService.success('Usuario creado', `"${this.form.nombre}" fue agregado al equipo.`);
      })
      .catch((err) => {
        this.saving.set(false);
        const msg = err.error?.detail || 'No se pudo crear el usuario.';
        this.createError.set(msg);
        this.notificationService.error('Error', msg);
      });
  }

  onRoleChange(member: TeamMember, event: Event) {
    const nuevoRol = (event.target as HTMLSelectElement).value as StaffRole;
    if (nuevoRol === member.rol) return;

    this.savingRoleFor.set(member.idUser);

    this.teamService
      .changeRole(member.idUser, nuevoRol)
      .then(() => {
        this.savingRoleFor.set(null);
        this.notificationService.success(
          'Rol actualizado',
          `El rol de "${member.nombre}" cambiará en su próximo inicio de sesión.`,
        );
      })
      .catch((err) => {
        this.savingRoleFor.set(null);
        const msg = err.error?.detail || 'No se pudo cambiar el rol.';
        this.notificationService.error('Error', msg);
        (event.target as HTMLSelectElement).value = member.rol;
      });
  }
}
