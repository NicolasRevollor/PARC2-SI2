import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteLocal, OfflineSyncService } from '../../core/services/offline-sync.service';

export interface ClienteElegido {
  idCliente: number | null;
  clienteNuevo: { nombre: string; ci: string } | null;
  nombre: string;
}

export const CLIENTE_GENERICO: ClienteElegido = { idCliente: null, clienteNuevo: null, nombre: 'Cliente genérico' };

/**
 * [CU14] paso 4 y [CU15] paso 2: cliente del almacenamiento local, cliente nuevo
 * con datos mínimos (nombre y CI) o "Cliente genérico".
 */
@Component({
  selector: 'app-local-customer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-2">
      <span class="ys-etiqueta">Cliente</span>
      <div class="flex gap-2 flex-wrap">
        <button *ngFor="let m of modos" (click)="cambiarModo(m.id)" type="button" class="ys-opcion" [ngClass]="{ 'ys-opcion-activa': modo() === m.id }">{{ m.etiqueta }}</button>
      </div>
      <div *ngIf="modo() === 'existente'" class="space-y-1">
        <input [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" name="buscarCliente" class="ys-campo" placeholder="Nombre, CI o teléfono" />
        <div class="max-h-36 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
          <button *ngFor="let c of filtrados()" (click)="elegirExistente(c)" type="button"
                  class="w-full px-3 py-1.5 text-left text-xs cursor-pointer bg-transparent hover:bg-gray-50"
                  [ngClass]="valor.idCliente === c.idCliente ? 'text-indigo-600 font-bold' : 'text-gray-700'">
            {{ c.nombre }} <span class="text-gray-400">{{ c.ci || '' }}</span>
          </button>
          <p *ngIf="!filtrados().length" class="px-3 py-2 text-xs text-gray-400">Sin clientes descargados con esos datos.</p>
        </div>
      </div>
      <div *ngIf="modo() === 'nuevo'" class="grid grid-cols-2 gap-2">
        <input [(ngModel)]="nombreNuevo" (ngModelChange)="elegirNuevo()" name="nombreNuevo" class="ys-campo" placeholder="Nombre" />
        <input [(ngModel)]="ciNuevo" (ngModelChange)="elegirNuevo()" name="ciNuevo" class="ys-campo" placeholder="CI" />
      </div>
    </div>
  `,
})
export class LocalCustomerComponent implements OnInit {
  @Input() valor: ClienteElegido = CLIENTE_GENERICO;
  @Output() valorChange = new EventEmitter<ClienteElegido>();

  readonly modos = [
    { id: 'generico', etiqueta: 'Cliente genérico' },
    { id: 'existente', etiqueta: 'Cliente registrado' },
    { id: 'nuevo', etiqueta: 'Cliente nuevo' },
  ];
  readonly modo = signal('generico');
  readonly clientes = signal<ClienteLocal[]>([]);
  readonly busqueda = signal('');
  nombreNuevo = '';
  ciNuevo = '';

  readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const lista = this.clientes().filter(c => !c.nombre.toLowerCase().startsWith('cliente generico'));
    const coinciden = q
      ? lista.filter(c => [c.nombre, c.ci, c.telefono].some(v => (v ?? '').toLowerCase().includes(q)))
      : lista;
    return coinciden.slice(0, 40);
  });

  constructor(private offlineSync: OfflineSyncService) {}

  async ngOnInit(): Promise<void> {
    this.clientes.set(await this.offlineSync.clientesLocales());
    if (this.valor.clienteNuevo) {
      this.modo.set('nuevo');
      this.nombreNuevo = this.valor.clienteNuevo.nombre;
      this.ciNuevo = this.valor.clienteNuevo.ci;
    } else if (this.valor.idCliente !== null) {
      this.modo.set('existente');
    }
  }

  cambiarModo(modo: string): void {
    this.modo.set(modo);
    if (modo === 'generico') this.valorChange.emit(CLIENTE_GENERICO);
  }

  elegirExistente(c: ClienteLocal): void {
    this.valorChange.emit({ idCliente: c.idCliente, clienteNuevo: null, nombre: c.nombre });
  }

  elegirNuevo(): void {
    const nombre = this.nombreNuevo.trim();
    const ci = this.ciNuevo.trim();
    this.valorChange.emit({ idCliente: null, clienteNuevo: nombre && ci ? { nombre, ci } : null, nombre: nombre || 'Cliente nuevo' });
  }

  /** "Cliente nuevo" exige nombre y CI antes de confirmar. */
  get incompleto(): boolean {
    return this.modo() === 'nuevo' && !this.valor.clienteNuevo;
  }
}
