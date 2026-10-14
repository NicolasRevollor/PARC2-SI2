import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuppliersService } from '../../core/services/suppliers.service';
import { Proveedor, ProveedorIn } from '../../core/models';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Red de Abastecimiento</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Gestión de Proveedores</h1>
          <p class="text-xs text-gray-500 mt-1">
            Directorio de proveedores de mercancía y sus datos de contacto.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            (click)="openCreateModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nuevo Proveedor</span>
          </button>
        </div>
      </div>

      <!-- Tabla de proveedores -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Nombre</th>
                <th class="p-3.5">Teléfono</th>
                <th class="p-3.5">Correo</th>
                <th class="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let p of suppliersService.suppliers()" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6">
                  <p class="font-bold text-gray-900">{{ p.nombre }}</p>
                  <p class="text-[10px] text-gray-400">ID {{ p.idProveedor }}</p>
                </td>
                <td class="p-3.5 text-gray-700">{{ p.telefono || '—' }}</td>
                <td class="p-3.5 text-gray-700">{{ p.correo || '—' }}</td>
                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-2">
                    <button
                      (click)="openEditModal(p)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Editar"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      (click)="confirmDelete(p)"
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

        <div *ngIf="suppliersService.suppliers().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay proveedores registrados todavía.
        </div>
      </div>

    </div>

    <!-- Modal: Crear/Editar proveedor -->
    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Abastecimiento</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">{{ editingId() ? 'Editar Proveedor' : 'Nuevo Proveedor' }}</h2>
        </div>

        <form (ngSubmit)="save()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="form.nombre" name="nombre" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Teléfono</label>
            <input type="text" [(ngModel)]="form.telefono" name="telefono" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Correo</label>
            <input type="email" [(ngModel)]="form.correo" name="correo" class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>

          <button
            type="submit"
            [disabled]="!form.nombre"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ editingId() ? 'Guardar Cambios' : 'Crear Proveedor' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Confirmar eliminación -->
    <div *ngIf="deletingItem() as item" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-sm w-full rounded-2xl border border-gray-200 shadow-xl p-6 relative">
        <h2 class="text-base font-bold text-gray-900">¿Eliminar proveedor?</h2>
        <p class="text-xs text-gray-500 mt-2">
          Esta acción eliminará a "{{ item.nombre }}" permanentemente. No se puede deshacer.
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <button (click)="deletingItem.set(null)" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button (click)="executeDelete()" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `
})
export class SuppliersComponent implements OnInit {
  showModal = signal<boolean>(false);
  editingId = signal<number | null>(null);
  deletingItem = signal<Proveedor | null>(null);

  form: ProveedorIn = { nombre: '', telefono: '', correo: '' };

  constructor(public suppliersService: SuppliersService) {}

  ngOnInit() {
    this.suppliersService.loadSuppliers();
  }

  openCreateModal() {
    this.editingId.set(null);
    this.form = { nombre: '', telefono: '', correo: '' };
    this.showModal.set(true);
  }

  openEditModal(p: Proveedor) {
    this.editingId.set(p.idProveedor);
    this.form = { nombre: p.nombre, telefono: p.telefono || '', correo: p.correo || '' };
    this.showModal.set(true);
  }

  save() {
    if (!this.form.nombre) return;
    const id = this.editingId();
    const payload: ProveedorIn = {
      nombre: this.form.nombre,
      telefono: this.form.telefono || null,
      correo: this.form.correo || null,
    };

    const request = id
      ? this.suppliersService.updateSupplier(id, payload)
      : this.suppliersService.createSupplier(payload);

    request.then((result) => {
      if (result) {
        this.showModal.set(false);
      }
    });
  }

  confirmDelete(p: Proveedor) {
    this.deletingItem.set(p);
  }

  executeDelete() {
    const item = this.deletingItem();
    if (!item) return;
    this.suppliersService.deleteSupplier(item.idProveedor).then(() => {
      this.deletingItem.set(null);
    });
  }
}
