import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CanjeNotaOut, NotaCredito } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Notas de crédito (CU7). El canje en caja sigue el mismo patrón que el
 * cobro en efectivo: devuelve un `idMetPago` que después paga la venta; si
 * el saldo no alcanza, el resto se cobra con otro medio en el mismo canje.
 */
@Injectable({ providedIn: 'root' })
export class CreditNotesService {
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private detalle(err: unknown, porDefecto: string): string {
    const detalle = (err as { error?: { detail?: unknown } })?.error?.detail;
    return typeof detalle === 'string' ? detalle : porDefecto;
  }

  async listar(filtros: { idCliente?: number; estado?: string } = {}): Promise<NotaCredito[]> {
    let params = new HttpParams();
    if (filtros.idCliente !== undefined) params = params.set('idCliente', filtros.idCliente);
    if (filtros.estado) params = params.set('estado', filtros.estado);
    try {
      return await firstValueFrom(this.http.get<NotaCredito[]>(`${API_URL}/api/credit-notes`, { params }));
    } catch {
      this.notificationService.error('Error', 'No se pudieron cargar las notas de crédito.');
      return [];
    }
  }

  async buscar(codigo: string): Promise<NotaCredito | null> {
    try {
      return await firstValueFrom(
        this.http.get<NotaCredito>(`${API_URL}/api/credit-notes/codigo/${encodeURIComponent(codigo.trim().toUpperCase())}`)
      );
    } catch (err) {
      this.notificationService.error('Nota de crédito', this.detalle(err, 'No se encontró la nota.'));
      return null;
    }
  }

  async canjear(codigo: string, montoTotal: number, idCliente: number, metodoComplemento: 'efectivo' | 'qr' | null): Promise<CanjeNotaOut | null> {
    try {
      const canje = await firstValueFrom(
        this.http.post<CanjeNotaOut>(`${API_URL}/api/credit-notes/canjear`, { codigo, montoTotal, idCliente, metodoComplemento })
      );
      this.notificationService.success(
        'Nota de crédito aplicada',
        `${canje.codigo}: Bs ${canje.montoNota.toFixed(2)}` +
          (canje.montoComplemento > 0 ? ` + Bs ${canje.montoComplemento.toFixed(2)} con otro medio` : '') +
          ` (saldo restante Bs ${canje.saldoRestante.toFixed(2)}).`,
      );
      return canje;
    } catch (err) {
      this.notificationService.error('No se pudo aplicar la nota', this.detalle(err, 'Revisá el código y el saldo.'));
      return null;
    }
  }

  async anular(idNotaCredito: number, motivo: string): Promise<NotaCredito | null> {
    try {
      const nota = await firstValueFrom(this.http.post<NotaCredito>(`${API_URL}/api/credit-notes/${idNotaCredito}/anular`, { motivo }));
      this.notificationService.info('Nota anulada', `${nota.codigo} ya no se puede usar.`);
      return nota;
    } catch (err) {
      this.notificationService.error('No se pudo anular', this.detalle(err, 'Revisá los datos.'));
      return null;
    }
  }

  async extender(idNotaCredito: number, fechaVencimiento: string, motivo?: string): Promise<NotaCredito | null> {
    try {
      const nota = await firstValueFrom(
        this.http.post<NotaCredito>(`${API_URL}/api/credit-notes/${idNotaCredito}/extender`, {
          fechaVencimiento: new Date(`${fechaVencimiento}T23:59:00`).toISOString(),
          motivo: motivo || null,
        })
      );
      this.notificationService.success('Vencimiento extendido', `${nota.codigo} vence el ${new Date(nota.fechaVencimiento).toLocaleDateString()}.`);
      return nota;
    } catch (err) {
      this.notificationService.error('No se pudo extender', this.detalle(err, 'La nueva fecha debe ser posterior.'));
      return null;
    }
  }
}
