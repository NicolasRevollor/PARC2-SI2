import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeasonsService } from '../../core/services/seasons.service';
import { CollectionsService } from '../../core/services/collections.service';
import { Temporada, TemporadaIn, Coleccion, ColeccionIn } from '../../core/models';

type SeasonsTab = 'temporadas' | 'colecciones';

@Component({
  selector: 'app-seasons',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">

      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Catálogo</span>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">Temporadas y Colecciones</h1>
          <p class="text-xs text-gray-500 mt-1">
            Administración de temporadas y sus colecciones asociadas.
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button
            *ngIf="activeTab() === 'temporadas'"
            (click)="openCreateSeasonModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nueva Temporada</span>
          </button>
          <button
            *ngIf="activeTab() === 'colecciones'"
            (click)="openCreateCollectionModal()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Nueva Colección</span>
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-gray-200">
        <button
          (click)="activeTab.set('temporadas')"
          [class.text-indigo-600]="activeTab() === 'temporadas'"
          [class.border-indigo-600]="activeTab() === 'temporadas'"
          [class.text-gray-500]="activeTab() !== 'temporadas'"
          [class.border-transparent]="activeTab() !== 'temporadas'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Temporadas
        </button>
        <button
          (click)="activeTab.set('colecciones')"
          [class.text-indigo-600]="activeTab() === 'colecciones'"
          [class.border-indigo-600]="activeTab() === 'colecciones'"
          [class.text-gray-500]="activeTab() !== 'colecciones'"
          [class.border-transparent]="activeTab() !== 'colecciones'"
          class="px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer"
        >
          Colecciones
        </button>
      </div>

      <!-- Tabla de temporadas -->
      <div *ngIf="activeTab() === 'temporadas'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Nombre</th>
                <th class="p-3.5">Fecha Inicio</th>
                <th class="p-3.5">Fecha Fin</th>
                <th class="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let t of seasonsService.seasons()" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6">
                  <p class="font-bold text-gray-900">{{ t.nombreTemporada }}</p>
                  <p class="text-[10px] text-gray-400">ID {{ t.idTemporada }}</p>
                </td>
                <td class="p-3.5 text-gray-700">{{ t.fecha_ini }}</td>
                <td class="p-3.5 text-gray-700">{{ t.fecha_fin }}</td>
                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-2">
                    <button
                      (click)="openEditSeasonModal(t)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Editar"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      (click)="confirmDeleteSeason(t)"
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

        <div *ngIf="seasonsService.seasons().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay temporadas registradas todavía.
        </div>
      </div>

      <!-- Tabla de colecciones -->
      <div *ngIf="activeTab() === 'colecciones'" class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th class="p-3.5 pl-6">Nombre</th>
                <th class="p-3.5">Temporada</th>
                <th class="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs">
              <tr *ngFor="let c of collectionsService.collections()" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3.5 pl-6">
                  <p class="font-bold text-gray-900">{{ c.nombre_coleccion }}</p>
                  <p class="text-[10px] text-gray-400">ID {{ c.idColeccion }}</p>
                </td>
                <td class="p-3.5 text-gray-700">{{ c.temporada_nombre || '—' }}</td>
                <td class="p-3.5 text-right pr-6">
                  <div class="inline-flex items-center space-x-2">
                    <button
                      (click)="openEditCollectionModal(c)"
                      class="w-7 h-7 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 flex items-center justify-center transition-colors cursor-pointer border border-gray-200"
                      title="Editar"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      (click)="confirmDeleteCollection(c)"
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

        <div *ngIf="collectionsService.collections().length === 0" class="text-center py-12 text-gray-400 text-sm">
          No hay colecciones registradas todavía.
        </div>
      </div>

    </div>

    <!-- Modal: Crear/Editar temporada -->
    <div *ngIf="showSeasonModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showSeasonModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Catálogo</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">{{ editingSeasonId() ? 'Editar Temporada' : 'Nueva Temporada' }}</h2>
        </div>

        <form (ngSubmit)="saveSeason()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="seasonForm.nombreTemporada" name="nombreTemporada" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Fecha Inicio</label>
            <input type="date" [(ngModel)]="seasonForm.fecha_ini" name="fecha_ini" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Fecha Fin</label>
            <input type="date" [(ngModel)]="seasonForm.fecha_fin" name="fecha_fin" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>

          <p *ngIf="!isDateRangeValid()" class="text-[11px] text-red-600 font-semibold">
            La fecha de fin no puede ser anterior a la fecha de inicio.
          </p>

          <button
            type="submit"
            [disabled]="!seasonForm.nombreTemporada || !isDateRangeValid()"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ editingSeasonId() ? 'Guardar Cambios' : 'Crear Temporada' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Crear/Editar colección -->
    <div *ngIf="showCollectionModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-md w-full rounded-2xl border border-gray-200 shadow-xl p-6 md:p-8 relative">
        <button (click)="showCollectionModal.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="mb-5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Catálogo</span>
          <h2 class="text-lg font-bold text-gray-900 mt-0.5">{{ editingCollectionId() ? 'Editar Colección' : 'Nueva Colección' }}</h2>
        </div>

        <form (ngSubmit)="saveCollection()" class="space-y-4">
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Nombre</label>
            <input type="text" [(ngModel)]="collectionForm.nombre_coleccion" name="nombre_coleccion" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-700 uppercase tracking-wide">Temporada</label>
            <select [(ngModel)]="collectionForm.idTemporada" name="idTemporada" required class="w-full mt-1 px-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
              <option [ngValue]="0" disabled>Seleccionar temporada</option>
              <option *ngFor="let t of seasonsService.seasons()" [ngValue]="t.idTemporada">{{ t.nombreTemporada }}</option>
            </select>
          </div>

          <button
            type="submit"
            [disabled]="!collectionForm.nombre_coleccion || !collectionForm.idTemporada"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-colors shadow-xs mt-4"
          >
            {{ editingCollectionId() ? 'Guardar Cambios' : 'Crear Colección' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Confirmar eliminación de temporada -->
    <div *ngIf="deletingSeason() as item" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-sm w-full rounded-2xl border border-gray-200 shadow-xl p-6 relative">
        <h2 class="text-base font-bold text-gray-900">¿Eliminar temporada?</h2>
        <p class="text-xs text-gray-500 mt-2">
          Esta acción eliminará la temporada "{{ item.nombreTemporada }}" permanentemente. No se puede deshacer.
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <button (click)="deletingSeason.set(null)" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button (click)="executeDeleteSeason()" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Confirmar eliminación de colección -->
    <div *ngIf="deletingCollection() as item" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="bg-white max-w-sm w-full rounded-2xl border border-gray-200 shadow-xl p-6 relative">
        <h2 class="text-base font-bold text-gray-900">¿Eliminar colección?</h2>
        <p class="text-xs text-gray-500 mt-2">
          Esta acción eliminará la colección "{{ item.nombre_coleccion }}" permanentemente. No se puede deshacer.
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <button (click)="deletingCollection.set(null)" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button (click)="executeDeleteCollection()" class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-red-600 hover:bg-red-700 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `
})
export class SeasonsComponent implements OnInit {
  activeTab = signal<SeasonsTab>('temporadas');

  showSeasonModal = signal<boolean>(false);
  editingSeasonId = signal<number | null>(null);
  deletingSeason = signal<Temporada | null>(null);
  seasonForm: TemporadaIn = { nombreTemporada: '', fecha_ini: '', fecha_fin: '' };

  showCollectionModal = signal<boolean>(false);
  editingCollectionId = signal<number | null>(null);
  deletingCollection = signal<Coleccion | null>(null);
  collectionForm: ColeccionIn = { nombre_coleccion: '', idTemporada: 0 };

  constructor(
    public seasonsService: SeasonsService,
    public collectionsService: CollectionsService,
  ) {}

  ngOnInit() {
    this.seasonsService.loadSeasons();
    this.collectionsService.loadCollections();
  }

  // ── Temporadas ──

  isDateRangeValid(): boolean {
    if (!this.seasonForm.fecha_ini || !this.seasonForm.fecha_fin) return true;
    return this.seasonForm.fecha_fin >= this.seasonForm.fecha_ini;
  }

  openCreateSeasonModal() {
    this.editingSeasonId.set(null);
    this.seasonForm = { nombreTemporada: '', fecha_ini: '', fecha_fin: '' };
    this.showSeasonModal.set(true);
  }

  openEditSeasonModal(t: Temporada) {
    this.editingSeasonId.set(t.idTemporada);
    this.seasonForm = { nombreTemporada: t.nombreTemporada, fecha_ini: t.fecha_ini, fecha_fin: t.fecha_fin };
    this.showSeasonModal.set(true);
  }

  saveSeason() {
    if (!this.seasonForm.nombreTemporada || !this.isDateRangeValid()) return;
    const id = this.editingSeasonId();
    const payload: TemporadaIn = { ...this.seasonForm };

    const request = id
      ? this.seasonsService.updateSeason(id, payload)
      : this.seasonsService.createSeason(payload);

    request.then((result) => {
      if (result) {
        this.showSeasonModal.set(false);
      }
    });
  }

  confirmDeleteSeason(t: Temporada) {
    this.deletingSeason.set(t);
  }

  executeDeleteSeason() {
    const item = this.deletingSeason();
    if (!item) return;
    this.seasonsService.deleteSeason(item.idTemporada).then(() => {
      this.deletingSeason.set(null);
    });
  }

  // ── Colecciones ──

  openCreateCollectionModal() {
    this.editingCollectionId.set(null);
    this.collectionForm = { nombre_coleccion: '', idTemporada: 0 };
    this.showCollectionModal.set(true);
  }

  openEditCollectionModal(c: Coleccion) {
    this.editingCollectionId.set(c.idColeccion);
    this.collectionForm = { nombre_coleccion: c.nombre_coleccion, idTemporada: c.idTemporada };
    this.showCollectionModal.set(true);
  }

  saveCollection() {
    if (!this.collectionForm.nombre_coleccion || !this.collectionForm.idTemporada) return;
    const id = this.editingCollectionId();
    const payload: ColeccionIn = { ...this.collectionForm };

    const request = id
      ? this.collectionsService.updateCollection(id, payload)
      : this.collectionsService.createCollection(payload);

    request.then((result) => {
      if (result) {
        this.showCollectionModal.set(false);
      }
    });
  }

  confirmDeleteCollection(c: Coleccion) {
    this.deletingCollection.set(c);
  }

  executeDeleteCollection() {
    const item = this.deletingCollection();
    if (!item) return;
    this.collectionsService.deleteCollection(item.idColeccion).then(() => {
      this.deletingCollection.set(null);
    });
  }
}
