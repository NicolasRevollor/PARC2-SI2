import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationsAdminService } from '../../core/services/locations-admin.service';
import { Ciudad, CiudadIn, Sucursal, SucursalIn } from '../../core/models';

type LocationsTab = 'ciudades' | 'sucursales';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Administración</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Ciudades y Sucursales</h1>
          <p class="text-xs text-gray-500 mt-1">
            Administración de ciudades y sucursales del sistema.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            *ngIf="activeTab() === 'ciudades'"
            (click)="openCreateCityModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nueva Ciudad</span>
          </button>
          <button
            *ngIf="activeTab() === 'sucursales'"
            (click)="openCreateBranchModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nueva Sucursal</span>
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-gray-200">
        <button
          (click)="activeTab.set('ciudades')"
          [class.text-indigo-600]="activeTab() === 'ciudades'"
          [class.border-indigo-600]="activeTab() === 'ciudades'"
          [class.text-gray-500]="activeTab() !== 'ciudades'"
          [class.border-transparent]="activeTab() !== 'ciudades'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Ciudades
        </button>
        <button
          (click)="activeTab.set('sucursales')"
          [class.text-indigo-600]="activeTab() === 'sucursales'"
          [class.border-indigo-600]="activeTab() === 'sucursales'"
          [class.text-gray-500]="activeTab() !== 'sucursales'"
          [class.border-transparent]="activeTab() !== 'sucursales'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Sucursales
        </button>
      </div>

      <!-- Tabla de ciudades -->
      <div *ngIf="activeTab() === 'ciudades'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Nombre</th>
                <th class="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let c of locationsAdminService.cities()" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6">
                  <p class="font-bold text-gray-900">{{ c.nombCiudad }}</p>
                  <p class="text-[10px] text-gray-400">ID {{ c.idCiudad }}</p>
                </td>
                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-2">
                    <button
                      (click)="openEditCityModal(c)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Editar"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      (click)="confirmDeleteCity(c)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Eliminar"
                    >
                      <span class="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="locationsAdminService.cities().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay ciudades registradas todavía.
        </div>
      </div>

      <!-- Tabla de sucursales -->
      <div *ngIf="activeTab() === 'sucursales'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Nombre</th>
                <th class="p-3.5">Dirección</th>
                <th class="p-3.5">Ciudad</th>
                <th class="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let s of locationsAdminService.branches()" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6">
                  <p class="font-bold text-gray-900">{{ s.nombre }}</p>
                  <p class="text-[10px] text-gray-400">ID {{ s.codigoSucursal }}</p>
                </td>
                <td class="p-3.5 text-gray-700">{{ s.direccion }}</td>
                <td class="p-3.5 text-gray-700">{{ s.ciudad_nombre || '—' }}</td>
                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-2">
                    <button
                      (click)="openEditBranchModal(s)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Editar"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      (click)="confirmDeleteBranch(s)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Eliminar"
                    >
                      <span class="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="locationsAdminService.branches().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay sucursales registradas todavía.
        </div>
      </div>

    </div>

    <!-- Modal: Crear/Editar ciudad -->
    <div *ngIf="showCityModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showCityModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Administración</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">{{ editingCityId() ? 'Editar Ciudad' : 'Nueva Ciudad' }}</h2>
        </div>

        <form (ngSubmit)="saveCity()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="cityForm.nombCiudad" name="nombCiudad" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>

          <button
            type="submit"
            [disabled]="!cityForm.nombCiudad"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ editingCityId() ? 'Guardar Cambios' : 'Crear Ciudad' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Crear/Editar sucursal -->
    <div *ngIf="showBranchModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showBranchModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Administración</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">{{ editingBranchId() ? 'Editar Sucursal' : 'Nueva Sucursal' }}</h2>
        </div>

        <form (ngSubmit)="saveBranch()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="branchForm.nombre" name="nombre" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Dirección</label>
            <input type="text" [(ngModel)]="branchForm.direccion" name="direccion" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Ciudad</label>
            <select [(ngModel)]="branchForm.idCiudad" name="idCiudad" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option [ngValue]="0" disabled>Seleccionar ciudad</option>
              <option *ngFor="let c of locationsAdminService.cities()" [ngValue]="c.idCiudad">{{ c.nombCiudad }}</option>
            </select>
          </div>

          <button
            type="submit"
            [disabled]="!isBranchFormValid()"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ editingBranchId() ? 'Guardar Cambios' : 'Crear Sucursal' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Confirmar eliminación de ciudad -->
    <div *ngIf="deletingCity() as item" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-sm w-full rounded-2xl border border-gray-200 shadow-xl p-6 relative">
        <h2 class="text-base font-bold text-gray-900">¿Eliminar ciudad?</h2>
        <p class="text-xs text-gray-500 mt-2">
          Esta acción eliminará la ciudad "{{ item.nombCiudad }}" permanentemente. No se puede deshacer.
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <button (click)="deletingCity.set(null)" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button (click)="executeDeleteCity()" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Confirmar eliminación de sucursal -->
    <div *ngIf="deletingBranch() as item" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-sm w-full rounded-2xl border border-gray-200 shadow-xl p-6 relative">
        <h2 class="text-base font-bold text-gray-900">¿Eliminar sucursal?</h2>
        <p class="text-xs text-gray-500 mt-2">
          Esta acción eliminará la sucursal "{{ item.nombre }}" permanentemente. No se puede deshacer.
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <button (click)="deletingBranch.set(null)" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button (click)="executeDeleteBranch()" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `
})
export class LocationsComponent implements OnInit {
  activeTab = signal<LocationsTab>('ciudades');

  showCityModal = signal<boolean>(false);
  editingCityId = signal<number | null>(null);
  deletingCity = signal<Ciudad | null>(null);
  cityForm: CiudadIn = { nombCiudad: '' };

  showBranchModal = signal<boolean>(false);
  editingBranchId = signal<number | null>(null);
  deletingBranch = signal<Sucursal | null>(null);
  branchForm: SucursalIn = { nombre: '', direccion: '', idCiudad: 0 };

  constructor(public locationsAdminService: LocationsAdminService) {}

  ngOnInit() {
    this.locationsAdminService.loadCities();
    this.locationsAdminService.loadBranches();
  }

  // ── Ciudades ──

  openCreateCityModal() {
    this.editingCityId.set(null);
    this.cityForm = { nombCiudad: '' };
    this.showCityModal.set(true);
  }

  openEditCityModal(c: Ciudad) {
    this.editingCityId.set(c.idCiudad);
    this.cityForm = { nombCiudad: c.nombCiudad };
    this.showCityModal.set(true);
  }

  saveCity() {
    if (!this.cityForm.nombCiudad) return;
    const id = this.editingCityId();
    const payload: CiudadIn = { ...this.cityForm };

    const request = id
      ? this.locationsAdminService.updateCity(id, payload)
      : this.locationsAdminService.createCity(payload);

    request.then((result) => {
      if (result) {
        this.showCityModal.set(false);
      }
    });
  }

  confirmDeleteCity(c: Ciudad) {
    this.deletingCity.set(c);
  }

  executeDeleteCity() {
    const item = this.deletingCity();
    if (!item) return;
    this.locationsAdminService.deleteCity(item.idCiudad).then(() => {
      this.deletingCity.set(null);
    });
  }

  // ── Sucursales ──

  openCreateBranchModal() {
    this.editingBranchId.set(null);
    this.branchForm = { nombre: '', direccion: '', idCiudad: 0 };
    this.showBranchModal.set(true);
  }

  openEditBranchModal(s: Sucursal) {
    this.editingBranchId.set(s.codigoSucursal);
    this.branchForm = { nombre: s.nombre, direccion: s.direccion, idCiudad: s.idCiudad };
    this.showBranchModal.set(true);
  }

  isBranchFormValid(): boolean {
    return !!this.branchForm.nombre && !!this.branchForm.direccion && !!this.branchForm.idCiudad;
  }

  saveBranch() {
    if (!this.isBranchFormValid()) return;
    const id = this.editingBranchId();
    const payload: SucursalIn = { ...this.branchForm };

    const request = id
      ? this.locationsAdminService.updateBranch(id, payload)
      : this.locationsAdminService.createBranch(payload);

    request.then((result) => {
      if (result) {
        this.showBranchModal.set(false);
      }
    });
  }

  confirmDeleteBranch(s: Sucursal) {
    this.deletingBranch.set(s);
  }

  executeDeleteBranch() {
    const item = this.deletingBranch();
    if (!item) return;
    this.locationsAdminService.deleteBranch(item.codigoSucursal).then(() => {
      this.deletingBranch.set(null);
    });
  }
}
