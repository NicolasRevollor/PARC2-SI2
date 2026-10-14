import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Proveedor, ProveedorIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class SuppliersService {
  private suppliersSignal = signal<Proveedor[]>([]);
  public suppliers = this.suppliersSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadSuppliers(): Promise<void> {
    return firstValueFrom(
      this.http.get<Proveedor[]>(`${API_URL}/api/suppliers`)
    ).then((list) => {
      this.suppliersSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la lista de proveedores.');
    });
  }

  createSupplier(payload: ProveedorIn): Promise<Proveedor | null> {
    return firstValueFrom(
      this.http.post<Proveedor>(`${API_URL}/api/suppliers`, payload)
    ).then((proveedor) => {
      this.suppliersSignal.update(list => [...list, proveedor]);
      this.notificationService.success('Proveedor creado', `"${proveedor.nombre}" fue agregado.`);
      return proveedor;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear el proveedor.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateSupplier(idProveedor: number, payload: ProveedorIn): Promise<Proveedor | null> {
    return firstValueFrom(
      this.http.put<Proveedor>(`${API_URL}/api/suppliers/${idProveedor}`, payload)
    ).then((proveedor) => {
      this.suppliersSignal.update(list => list.map(p => p.idProveedor === idProveedor ? proveedor : p));
      this.notificationService.success('Proveedor actualizado', `"${proveedor.nombre}" fue actualizado.`);
      return proveedor;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar el proveedor.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteSupplier(idProveedor: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/suppliers/${idProveedor}`)
    ).then(() => {
      this.suppliersSignal.update(list => list.filter(p => p.idProveedor !== idProveedor));
      this.notificationService.warning('Proveedor eliminado', `ID ${idProveedor} removido.`);
      return true;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo eliminar el proveedor.';
      this.notificationService.error('Error', msg);
      return false;
    });
  }
}
