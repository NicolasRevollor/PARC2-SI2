import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformService } from '../../core/services/platform.service';
import { TenantService } from '../../core/services/tenant.service';
import { EmpresaCreada, EmpresaIn, EmpresaOut } from '../../core/models';
import { CuBadgeComponent } from '../../shared/components/cu-badge.component';

/**
 * Consola de plataforma del superadministrador (migración 016): ve y gestiona
 * todas las empresas suscritas al SaaS. Cada administrador de empresa sigue
 * viendo solo la suya desde "Suscripción y Plan". La bitácora y los respaldos
 * de la plataforma tienen su propia entrada en el menú.
 */
@Component({
  selector: 'app-platform',
  standalone: true,
  imports: [CommonModule, FormsModule, CuBadgeComponent],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-200">

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Superadministrador</span>
          <h1 class="text-xl font-bold text-gray-900 mt-0.5">Empresas suscritas</h1>
          <app-cu-badge cu="CU21" [conNombre]="true" class="block mt-1"></app-cu-badge>
          <p class="text-xs text-gray-500 mt-1">
            Todas las organizaciones que operan sobre la plataforma: plan, consumo y estado de la suscripción.
          </p>
        </div>
        <button (click)="abrirAlta()"
                class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs flex items-center gap-2 cursor-pointer">
          <span class="material-symbols-outlined text-[18px]">add_business</span>
          <span>Nueva empresa</span>
        </button>
      </div>

      <!-- Indicadores de la plataforma -->
      <div *ngIf="platformService.resumen() as r" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Empresas</span>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ r.totalEmpresas }}</p>
          <p class="text-xs text-gray-500 mt-1">{{ r.activas }} activas · {{ r.suspendidas }} suspendidas</p>
        </div>
        <div class="bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Ingreso mensual</span>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ r.ingresoMensual.toLocaleString() }} Bs</p>
          <p class="text-xs text-gray-500 mt-1">Suma de los planes de empresas activas</p>
        </div>
        <div class="lg:col-span-2 bg-[#18191d] p-5 rounded-xl border border-gray-200 shadow-2xs">
          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Empresas por plan</span>
          <div class="grid grid-cols-4 gap-2 mt-2">
            <div *ngFor="let p of r.porPlan" class="text-center p-2 rounded-lg bg-gray-50 border border-gray-200">
              <p class="text-lg font-bold text-gray-900">{{ p.empresas }}</p>
              <p class="text-[10px] uppercase tracking-wide text-gray-500">{{ p.nombre }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Listado de empresas -->
      <div class="bg-[#18191d] rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div *ngIf="platformService.cargando() && platformService.empresas().length === 0"
             class="p-8 text-center text-sm text-gray-500">Cargando empresas…</div>

        <div *ngIf="platformService.empresas().length > 0" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr class="text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                <th class="px-5 py-2.5">Empresa</th>
                <th class="px-5 py-2.5">Administrador</th>
                <th class="px-5 py-2.5">Plan</th>
                <th class="px-5 py-2.5 text-right">Sucursales</th>
                <th class="px-5 py-2.5 text-right">Usuarios</th>
                <th class="px-5 py-2.5 text-right">Productos</th>
                <th class="px-5 py-2.5">Estado</th>
                <th class="px-5 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let e of platformService.empresas()" class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-3">
                  <div *ngIf="editandoNombre() !== e.tenant.idTenant" class="flex items-center gap-1.5 group/nombre">
                    <p class="font-semibold text-gray-900">{{ e.tenant.nombre }}</p>
                    <button (click)="empezarEdicion(e)" title="Cambiar nombre"
                            class="p-0.5 rounded text-gray-400 hover:text-indigo-600 bg-transparent border-0 cursor-pointer opacity-60 group-hover/nombre:opacity-100">
                      <span class="material-symbols-outlined text-[15px]">edit</span>
                    </button>
                  </div>
                  <div *ngIf="editandoNombre() === e.tenant.idTenant" class="flex items-center gap-1.5">
                    <input type="text" [(ngModel)]="nombreEditado" (keyup.enter)="guardarNombre(e)" (keyup.escape)="cancelarEdicion()"
                           maxlength="120" autofocus
                           class="px-2 py-1 bg-gray-50 border border-indigo-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-44" />
                    <button (click)="guardarNombre(e)" [disabled]="nombreEditado.trim().length < 2" title="Guardar"
                            class="p-1 rounded text-emerald-600 hover:bg-emerald-50 bg-transparent border-0 cursor-pointer disabled:opacity-40">
                      <span class="material-symbols-outlined text-[16px]">check</span>
                    </button>
                    <button (click)="cancelarEdicion()" title="Cancelar"
                            class="p-1 rounded text-gray-400 hover:bg-gray-100 bg-transparent border-0 cursor-pointer">
                      <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                  <p class="text-[10px] text-gray-400 font-mono">{{ e.tenant.slug }}{{ e.tenant.nit ? ' · NIT ' + e.tenant.nit : '' }} · desde {{ e.tenant.fechaAlta | date: 'dd/MM/yyyy' }}</p>
                </td>
                <td class="px-5 py-3 text-gray-600">{{ e.adminCorreo || '—' }}</td>
                <td class="px-5 py-3">
                  <select [ngModel]="e.plan.codigo" (ngModelChange)="cambiarPlan(e, $event)"
                          [disabled]="procesando() === e.tenant.idTenant"
                          class="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    <option *ngFor="let p of tenantService.planes()" [ngValue]="p.codigo">
                      {{ p.nombre }} ({{ p.precioMensual.toLocaleString() }} Bs)
                    </option>
                    <option *ngIf="!planOfrecido(e.plan.codigo)" [ngValue]="e.plan.codigo">{{ e.plan.nombre }} (desactivado)</option>
                  </select>
                </td>
                <td class="px-5 py-3 text-right font-mono text-gray-700">{{ e.uso.sucursales }} / {{ tenantService.formatearLimite(e.plan.maxSucursales) }}</td>
                <td class="px-5 py-3 text-right font-mono text-gray-700">{{ e.uso.usuarios }} / {{ tenantService.formatearLimite(e.plan.maxUsuarios) }}</td>
                <td class="px-5 py-3 text-right font-mono text-gray-700">{{ e.uso.productos }} / {{ tenantService.formatearLimite(e.plan.maxProductos) }}</td>
                <td class="px-5 py-3">
                  <!-- El estado de la suscripcion se administra en "Suscripciones" (CU22). -->
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                        [ngClass]="e.tenant.estado === 'Activo'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-600 border-rose-200'">
                    {{ e.suscripcion?.etiqueta || e.tenant.estado }}
                  </span>
                </td>
                <td class="px-5 py-3 text-right whitespace-nowrap">
                  <button (click)="respaldar(e)" [disabled]="procesando() === e.tenant.idTenant" title="Respaldar ahora"
                          class="p-1.5 mr-1 rounded-lg text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer disabled:opacity-40 align-middle">
                    <span class="material-symbols-outlined text-[18px]">backup</span>
                  </button>
                  <button *ngIf="e.tenant.idTenant !== 1" (click)="reenviar(e)" [disabled]="procesando() === e.tenant.idTenant"
                          title="Reenviar la activacion del administrador (CU21 alt. 3)"
                          class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                    Reenviar activación
                  </button>
                  <span *ngIf="e.tenant.idTenant === 1" class="text-[10px] uppercase tracking-wide text-gray-400">Operadora</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal: alta de empresa -->
    <div *ngIf="mostrarAlta()"
         class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-[#18191d] max-w-lg w-full p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <button (click)="mostrarAlta.set(false)"
                class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 bg-transparent border-0 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Nueva suscripción</span>
          <h3 class="text-lg font-bold text-gray-900 mt-1">Dar de alta una empresa</h3>
          <p class="text-xs text-gray-500 mt-1">Se crean en un solo paso la empresa, su suscripción, su administrador y la política de devoluciones por defecto.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Razón social</label>
            <input type="text" [(ngModel)]="alta.nombre" (ngModelChange)="sugerirSlug()" placeholder="Boutique Ejemplo S.R.L." name="nombre"
                   class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('nombre')" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">NIT</label>
              <input type="text" [(ngModel)]="alta.nit" placeholder="1234567019" name="nit" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('nit')" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Identificador</label>
              <input type="text" [(ngModel)]="alta.slug" placeholder="boutique-ejemplo" name="slug" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('slug')" />
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Plan</label>
            <select [(ngModel)]="alta.codigoPlan" name="plan" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('codigoPlan')">
              <option *ngFor="let p of tenantService.planes()" [ngValue]="p.codigo">
                {{ p.nombre }} — {{ p.precioMensual.toLocaleString() }} Bs/mes
              </option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Inicio de la suscripción</label>
              <input type="date" [(ngModel)]="alta.fechaInicio" name="inicio" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('fechaInicio')" />
            </div>
            <div>
              <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Vencimiento</label>
              <input type="date" [(ngModel)]="alta.fechaVencimiento" name="vence" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('fechaVencimiento')" />
            </div>
          </div>
          <p *ngIf="fechasInvalidas()" class="text-xs text-rose-600 -mt-2">La fecha de vencimiento debe ser posterior a la de inicio.</p>

          <div class="pt-2 border-t border-gray-100">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Administrador de la empresa</p>
            <div class="space-y-3">
              <input type="text" [(ngModel)]="alta.adminNombre" placeholder="Nombre completo" name="adminNombre" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('adminNombre')" />
              <input type="email" [(ngModel)]="alta.adminCorreo" placeholder="admin@empresa.com" name="adminCorreo" class="w-full mt-1 px-3.5 py-2 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none" [ngClass]="claseCampo('adminCorreo')" />
              <p class="text-[11px] text-gray-500">Recibirá un correo para crear su contraseña: nadie más la conoce.</p>
            </div>
          </div>
          <p *ngIf="errorAlta()" class="text-xs text-rose-600">{{ errorAlta() }}</p>

          <button (click)="crear()" [disabled]="!puedeCrear() || guardando()" data-testid="crear-empresa"
                  class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs">
            {{ guardando() ? 'Creando…' : 'Crear empresa' }}
          </button>
        </div>
      </div>
    </div>

    <!-- [CU21] pasos 5-6: resultado del alta y activacion del administrador -->
    <div *ngIf="resultado() as r" class="ys-modal">
      <div class="ys-modal-caja max-w-lg ys-tarjeta space-y-3">
        <h3 class="text-lg font-bold text-gray-900">{{ r.empresa.tenant.nombre }} quedó registrada</h3>
        <p class="text-xs text-gray-600">Plan {{ r.empresa.plan.nombre }} · vence el {{ r.empresa.suscripcion?.fechaVencimiento | date: 'dd/MM/yyyy' }}</p>
        <p *ngIf="r.correoEnviado" class="text-sm text-emerald-600">Se envió el correo de activación a {{ r.empresa.adminCorreo }}.</p>
        <div *ngIf="!r.correoEnviado" class="space-y-2">
          <p class="text-sm text-amber-700">El correo no se pudo enviar. Entregue este enlace al administrador (vence en 72 horas):</p>
          <textarea readonly rows="3" class="ys-campo font-mono text-[11px]" data-testid="enlace-activacion">{{ r.enlaceActivacion }}</textarea>
          <button (click)="copiar(r.enlaceActivacion)" class="ys-btn-sec">Copiar enlace</button>
        </div>
        <button (click)="resultado.set(null)" class="ys-btn w-full">Listo</button>
      </div>
    </div>
  `
})
export class PlatformComponent implements OnInit {
  readonly resultado = signal<EmpresaCreada | null>(null);
  readonly errorAlta = signal<string | null>(null);
  readonly campoError = signal<string | null>(null);
  /** idTenant de la empresa cuyo nombre se está editando (null: ninguna). */
  readonly editandoNombre = signal<number | null>(null);
  nombreEditado = '';

  readonly mostrarAlta = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  /** idTenant de la fila con una operación en curso (deshabilita sus controles). */
  readonly procesando = signal<number | null>(null);

  alta: EmpresaIn = this.altaVacia();

  constructor(
    public platformService: PlatformService,
    public tenantService: TenantService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.platformService.cargar(), this.tenantService.cargarPlanes()]);
  }

  private altaVacia(): EmpresaIn {
    const hoy = new Date();
    const vence = new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
    const iso = (d: Date) => d.toLocaleDateString('sv');
    return {
      nombre: '', nit: '', slug: '', codigoPlan: 'basico', fechaInicio: iso(hoy), fechaVencimiento: iso(vence),
      adminNombre: '', adminCorreo: '',
    };
  }

  claseCampo(campo: string): string {
    return this.campoError() === campo ? 'border-rose-500' : 'border-gray-200';
  }

  fechasInvalidas(): boolean {
    return !!this.alta.fechaInicio && !!this.alta.fechaVencimiento && this.alta.fechaVencimiento <= this.alta.fechaInicio;
  }

  planOfrecido(codigo: string): boolean {
    return this.tenantService.planes().some(p => p.codigo === codigo);
  }

  copiar(texto: string | null): void {
    if (texto) void navigator.clipboard?.writeText(texto);
  }

  async reenviar(empresa: EmpresaOut): Promise<void> {
    this.procesando.set(empresa.tenant.idTenant);
    const r = await this.platformService.reenviarActivacion(empresa.tenant.idTenant);
    this.procesando.set(null);
    if (r) this.resultado.set({ ...r, empresa });
  }

  abrirAlta(): void {
    this.alta = this.altaVacia();
    this.errorAlta.set(null);
    this.campoError.set(null);
    this.mostrarAlta.set(true);
  }

  /** "Boutique Ñandú Sur" → "boutique-nandu-sur" (mismo patrón que valida el backend). */
  sugerirSlug(): void {
    this.alta.slug = this.alta.nombre
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  puedeCrear(): boolean {
    const a = this.alta;
    return !!(a.nombre.trim() && /^[0-9]{5,}(-[0-9A-Za-z]+)?$/.test(a.nit) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug) && a.codigoPlan
      && !this.fechasInvalidas() && a.adminNombre.trim() && a.adminCorreo.includes('@'));
  }

  async crear(): Promise<void> {
    if (!this.puedeCrear()) return;
    this.guardando.set(true);
    const { creada, campo, error } = await this.platformService.crearEmpresa(this.alta);
    this.guardando.set(false);
    this.campoError.set(campo);
    this.errorAlta.set(error);
    if (creada) {
      this.mostrarAlta.set(false);
      this.resultado.set(creada);
    }
  }

  async cambiarPlan(empresa: EmpresaOut, codigo: string): Promise<void> {
    if (codigo === empresa.plan.codigo) return;
    this.procesando.set(empresa.tenant.idTenant);
    const ok = await this.platformService.cambiarPlan(empresa.tenant.idTenant, codigo);
    if (!ok) {
      // El <select> ya mostró el plan nuevo; si el backend lo rechazó, se
      // recarga para que vuelva a reflejar el plan real.
      await this.platformService.cargar();
    }
    this.procesando.set(null);
  }

  empezarEdicion(empresa: EmpresaOut): void {
    this.nombreEditado = empresa.tenant.nombre;
    this.editandoNombre.set(empresa.tenant.idTenant);
  }

  cancelarEdicion(): void {
    this.editandoNombre.set(null);
  }

  async guardarNombre(empresa: EmpresaOut): Promise<void> {
    const nombre = this.nombreEditado.trim();
    if (nombre.length < 2) return;
    if (nombre === empresa.tenant.nombre) {
      this.cancelarEdicion();
      return;
    }
    if (await this.platformService.renombrar(empresa.tenant.idTenant, nombre)) {
      this.cancelarEdicion();
    }
  }

  async respaldar(empresa: EmpresaOut): Promise<void> {
    this.procesando.set(empresa.tenant.idTenant);
    await this.platformService.respaldarAhora(empresa.tenant.idTenant);
    this.procesando.set(null);
  }

}
