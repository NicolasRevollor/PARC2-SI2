import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../core/services/team.service';
import { InventoryService } from '../../core/services/inventory.service';
import { NotificationService } from '../../core/services/notification.service';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';
import { TeamMember, StaffRole, StaffCreado } from '../../core/models';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

const STAFF_ROLES: StaffRole[] = ['Administrador', 'Encargado de Sucursal', 'Cajero'];

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU24] Gestionar empleados y asignacion a sucursales
// Boundary: PersonalUI -> este componente
// Control: backend/app/routers/team.py -> create_staff_user, dar_de_baja,
//   reincorporar, asignar_sucursales, reenviar_activacion
// [CU25] el cupo de usuarios del plan lo verifica exigir_cupo() en el backend;
//   aca solo se muestra el consumo para avisar antes.
// ==================================================================

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Gobernanza de Seguridad y RBAC</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Directorio de Personal y Nodos de Acceso</h1>
          <app-cu-badge cu="CU24" [conNombre]="true" class="block mt-1"></app-cu-badge>
          <p class="text-xs text-gray-500 mt-1">
            Cada empleado recibe un correo para activar su cuenta y definir su contraseña. Dar de baja no borra sus ventas ni su bitácora.
          </p>
          <p *ngIf="tenantService.uso() && tenantService.plan()" class="text-xs mt-1" data-testid="cupo-usuarios"
             [ngClass]="cupoLleno() ? 'text-amber-700 font-semibold' : 'text-gray-500'">
            <app-cu-badge cu="CU25"></app-cu-badge>
            Usuarios del plan {{ tenantService.plan()!.nombre }}: {{ tenantService.uso()!.usuarios }} de {{ tenantService.formatearLimite(tenantService.plan()!.maxUsuarios) }}
            <span *ngIf="cupoLleno()"> · alcanzó el límite: mejore el plan para agregar más.</span>
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
          class="bg-[#18191d] rounded-xl border border-gray-200 p-5 shadow-xs hover:border-gray-300 transition-all flex flex-col justify-between"
          [class.opacity-60]="!member.activo"
          data-testid="miembro"
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

            <!-- [CU24] estado de la cuenta: activa, pendiente de activación o dada de baja -->
            <div class="flex items-center gap-2 flex-wrap text-[11px]" data-testid="estado-miembro">
              <span *ngIf="!member.activo" class="ys-chip border-rose-300 text-rose-600">Dado de baja {{ member.fechaBaja | date: 'dd/MM/yyyy' }}</span>
              <span *ngIf="member.activo && !member.cuentaActivada" class="ys-chip border-amber-300 text-amber-700">Pendiente de activación</span>
              <span *ngIf="member.activo && member.cuentaActivada" class="ys-chip border-emerald-300 text-emerald-700">Activo</span>
              <button *ngIf="member.activo && !member.cuentaActivada" (click)="reenviar(member)" class="text-indigo-600 hover:underline bg-transparent cursor-pointer">Reenviar activación</button>
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
                [disabled]="savingRoleFor() === member.idUser || !member.activo"
                [value]="member.rol"
                (change)="onRoleChange(member, $event)"
                class="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option *ngFor="let rol of staffRoles" [value]="rol">{{ rol }}</option>
              </select>
            </div>

            <!-- CU24: sucursales asignadas (el Encargado solo ve las suyas en el CU11) -->
            <div class="mt-3.5 pt-3 border-t border-gray-100">
              <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Sucursales asignadas</p>
              <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                <label *ngFor="let s of inventoryService.locations()"
                       class="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-700 cursor-pointer"
                       [class.opacity-50]="savingBranchesFor() === member.idUser">
                  <input type="checkbox" [checked]="member.sucursales.includes(s.codigoSucursal)"
                         [disabled]="savingBranchesFor() === member.idUser"
                         (change)="alternarSucursal(member, s.codigoSucursal)" />
                  {{ s.nombre }}
                </label>
              </div>
              <p class="text-[10px] text-gray-400 mt-1">
                {{ member.sucursales.length ? 'Solo ve los registros de estas sucursales.' : 'Sin asignar: ve toda la empresa.' }}
              </p>
            </div>
          </div>

          <!-- [CU24] alternativo 3: baja y reincorporación -->
          <div *ngIf="member.idUser !== miId()" class="mt-3.5 pt-3 border-t border-gray-100 flex justify-end">
            <button *ngIf="member.activo" (click)="pedirBaja.set(member)" class="ys-btn-sec py-1 text-xs" data-testid="dar-baja">
              <span class="material-symbols-outlined text-[16px]">person_off</span> Dar de baja
            </button>
            <button *ngIf="!member.activo" (click)="reincorporar(member)" class="ys-btn-sec py-1 text-xs">
              <span class="material-symbols-outlined text-[16px]">person_add</span> Reincorporar
            </button>
          </div>
        </div>
      </div>

      <!-- Registro de auditoría de seguridad -->
      <div class="bg-[#18191d] rounded-xl border border-gray-200 p-5 lg:p-6 shadow-xs">
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
    <div *ngIf="showCreateModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-md w-full max-h-[92vh] overflow-y-auto rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
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
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Rol</label>
            <select [(ngModel)]="form.rol" name="rol" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option *ngFor="let rol of staffRoles" [value]="rol">{{ rol }}</option>
            </select>
          </div>
          <div *ngIf="form.rol !== 'Administrador'">
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Sucursales</label>
            <div class="flex flex-wrap gap-1.5 mt-1 max-h-40 overflow-y-auto">
              <label *ngFor="let s of inventoryService.locations()"
                     class="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" [checked]="form.sucursales.includes(s.codigoSucursal)" (change)="alternarSucursalNueva(s.codigoSucursal)" />
                {{ s.nombre }}
              </label>
            </div>
          </div>

          <p class="text-[11px] text-gray-500">Sin contraseña: el empleado la define con el enlace de activación que le llega por correo (vale 72 horas).</p>
          <p *ngIf="form.rol !== 'Administrador' && !form.sucursales.length" class="text-[11px] text-amber-700">Sin sucursales asignadas verá los datos de toda la empresa.</p>

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

    <!-- [CU24] paso 5 y CU21 alt. 3: si el correo no salió, el enlace para entregarlo en persona -->
    <div *ngIf="enlace() as e" class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">No se pudo enviar el correo</h3>
        <p class="text-xs text-gray-600">La cuenta de {{ e.miembro.nombre }} quedó creada. Entréguele este enlace para que la active, o reenvíelo más tarde:</p>
        <input readonly class="ys-campo font-mono text-[11px]" [value]="e.enlaceActivacion" data-testid="enlace-activacion" />
        <div class="flex gap-2">
          <button (click)="copiar(e.enlaceActivacion!)" class="ys-btn-sec flex-1">Copiar enlace</button>
          <button (click)="enlace.set(null)" class="ys-btn flex-1">Listo</button>
        </div>
      </div>
    </div>

    <div *ngIf="pedirBaja() as m" class="ys-modal">
      <div class="ys-modal-caja max-w-md ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">Dar de baja a {{ m.nombre }}</h3>
        <p class="text-xs text-gray-600">Sus sesiones dejan de valer de inmediato. Sus ventas y su bitácora se conservan, y lo que registró sin conexión antes de la baja se acepta al sincronizar.</p>
        <div class="flex gap-2">
          <button (click)="pedirBaja.set(null)" class="ys-btn-sec flex-1">Volver</button>
          <button (click)="darDeBaja(m)" [disabled]="saving()" class="ys-btn flex-1" data-testid="confirmar-baja">Dar de baja</button>
        </div>
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
  savingBranchesFor = signal<number | null>(null);

  enlace = signal<StaffCreado | null>(null);
  pedirBaja = signal<TeamMember | null>(null);

  form: { nombre: string; email: string; rol: StaffRole; sucursales: number[] } = {
    nombre: '',
    email: '',
    rol: 'Cajero',
    sucursales: [],
  };

  constructor(
    public teamService: TeamService,
    public inventoryService: InventoryService,
    public tenantService: TenantService,
    private authService: AuthService,
    private notificationService: NotificationService,
  ) {}

  miId(): number | null {
    const id = this.authService.currentUser()?.id;
    return id ? Number(id) : null;
  }

  cupoLleno(): boolean {
    const plan = this.tenantService.plan();
    const uso = this.tenantService.uso();
    return !!plan && !!uso && plan.maxUsuarios !== -1 && uso.usuarios >= plan.maxUsuarios;
  }

  private detalle(err: unknown, porDefecto: string): string {
    return (err as { error?: { detail?: string } })?.error?.detail || porDefecto;
  }

  private mostrarActivacion(creado: StaffCreado, titulo: string): void {
    if (creado.correoEnviado) {
      this.notificationService.success(titulo, `Se envió el enlace de activación a ${creado.miembro.correo}.`);
    } else {
      this.enlace.set(creado);
    }
  }

  reenviar(member: TeamMember): void {
    this.teamService
      .reenviarActivacion(member.idUser)
      .then((creado) => this.mostrarActivacion(creado, 'Activación reenviada'))
      .catch((err) => this.notificationService.error('Error', this.detalle(err, 'No se pudo reenviar la activación.')));
  }

  copiar(texto: string): void {
    void navigator.clipboard?.writeText(texto);
    this.notificationService.success('Copiado', 'El enlace quedó en el portapapeles.');
  }

  darDeBaja(member: TeamMember): void {
    this.saving.set(true);
    this.teamService
      .cambiarEstado(member.idUser, 'baja')
      .then(() => {
        this.pedirBaja.set(null);
        this.notificationService.success('Baja registrada', `"${member.nombre}" ya no puede ingresar.`);
        void this.tenantService.cargarContexto();
      })
      .catch((err) => this.notificationService.error('Error', this.detalle(err, 'No se pudo dar de baja.')))
      .finally(() => this.saving.set(false));
  }

  reincorporar(member: TeamMember): void {
    this.teamService
      .cambiarEstado(member.idUser, 'alta')
      .then(() => {
        this.notificationService.success('Reincorporado', `"${member.nombre}" vuelve a tener acceso.`);
        void this.tenantService.cargarContexto();
      })
      .catch((err) => this.notificationService.error('No se pudo reincorporar', this.detalle(err, 'Intentá de nuevo.')));
  }

  ngOnInit() {
    if (!this.tenantService.contexto()) void this.tenantService.cargarContexto();
    this.teamService.loadTeam();
    this.teamService.loadAuditLog();
    if (this.inventoryService.locations().length === 0) void this.inventoryService.loadLocations();
  }

  alternarSucursalNueva(codigo: number): void {
    const actuales = this.form.sucursales;
    this.form.sucursales = actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo];
  }

  alternarSucursal(member: TeamMember, codigo: number): void {
    const nuevas = member.sucursales.includes(codigo)
      ? member.sucursales.filter((c) => c !== codigo)
      : [...member.sucursales, codigo];
    this.savingBranchesFor.set(member.idUser);
    this.teamService
      .asignarSucursales(member.idUser, nuevas)
      .then(() => this.notificationService.success('Sucursales actualizadas', `"${member.nombre}" quedó asignado.`))
      .catch((err) => this.notificationService.error('Error', err.error?.detail || 'No se pudieron asignar las sucursales.'))
      .finally(() => this.savingBranchesFor.set(null));
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

  canSubmitCreate(): boolean {
    return this.form.nombre.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.form.email.trim());
  }

  openCreateModal() {
    this.form = { nombre: '', email: '', rol: 'Cajero', sucursales: [] };
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
      .createStaffUser({ ...this.form, sucursales: this.form.rol === 'Administrador' ? [] : this.form.sucursales })
      .then((creado) => {
        this.saving.set(false);
        this.showCreateModal.set(false);
        this.mostrarActivacion(creado, 'Empleado registrado');
        void this.tenantService.cargarContexto();
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
