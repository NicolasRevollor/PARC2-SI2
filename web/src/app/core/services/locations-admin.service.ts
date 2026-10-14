import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Ciudad, CiudadIn, Sucursal, SucursalIn } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class LocationsAdminService {
  private citiesSignal = signal<Ciudad[]>([]);
  private branchesSignal = signal<Sucursal[]>([]);

  public cities = this.citiesSignal.asReadonly();
  public branches = this.branchesSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  private deleteConflictMessage(err: any, fallback: string): string {
    if (err.error?.detail) return err.error.detail;
    if (err.status === 409 || err.status === 500) {
      return 'No se pudo eliminar: aún existen registros que dependen de este elemento.';
    }
    return fallback;
  }

  // ── Ciudades ──

  loadCities(): Promise<void> {
    return firstValueFrom(
      this.http.get<Ciudad[]>(`${API_URL}/api/cities`)
    ).then((list) => {
      this.citiesSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar la lista de ciudades.');
    });
  }

  createCity(payload: CiudadIn): Promise<Ciudad | null> {
    return firstValueFrom(
      this.http.post<Ciudad>(`${API_URL}/api/cities`, payload)
    ).then((ciudad) => {
      this.citiesSignal.update(list => [...list, ciudad]);
      this.notificationService.success('Ciudad creada', `"${ciudad.nombCiudad}" fue agregada.`);
      return ciudad;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear la ciudad.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateCity(idCiudad: number, payload: CiudadIn): Promise<Ciudad | null> {
    return firstValueFrom(
      this.http.put<Ciudad>(`${API_URL}/api/cities/${idCiudad}`, payload)
    ).then((ciudad) => {
      this.citiesSignal.update(list => list.map(c => c.idCiudad === idCiudad ? ciudad : c));
      this.notificationService.success('Ciudad actualizada', `"${ciudad.nombCiudad}" fue actualizada.`);
      return ciudad;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar la ciudad.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteCity(idCiudad: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/cities/${idCiudad}`)
    ).then(() => {
      this.citiesSignal.update(list => list.filter(c => c.idCiudad !== idCiudad));
      this.notificationService.warning('Ciudad eliminada', `ID ${idCiudad} removida.`);
      return true;
    }).catch((err) => {
      const msg = this.deleteConflictMessage(err, 'No se pudo eliminar la ciudad.');
      this.notificationService.error('Error', msg);
      return false;
    });
  }

  // ── Sucursales ──

  loadBranches(): Promise<void> {
    return firstValueFrom(
      this.http.get<Sucursal[]>(`${API_URL}/api/branches`)
    ).then((list) => {
      this.branchesSignal.set(list);
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo cargar la lista de sucursales.';
      this.notificationService.error('Error', msg);
    });
  }

  createBranch(payload: SucursalIn): Promise<Sucursal | null> {
    return firstValueFrom(
      this.http.post<Sucursal>(`${API_URL}/api/branches`, payload)
    ).then((sucursal) => {
      this.branchesSignal.update(list => [...list, sucursal]);
      this.notificationService.success('Sucursal creada', `"${sucursal.nombre}" fue agregada.`);
      return sucursal;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo crear la sucursal.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateBranch(codigoSucursal: number, payload: SucursalIn): Promise<Sucursal | null> {
    return firstValueFrom(
      this.http.put<Sucursal>(`${API_URL}/api/branches/${codigoSucursal}`, payload)
    ).then((sucursal) => {
      this.branchesSignal.update(list => list.map(s => s.codigoSucursal === codigoSucursal ? sucursal : s));
      this.notificationService.success('Sucursal actualizada', `"${sucursal.nombre}" fue actualizada.`);
      return sucursal;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar la sucursal.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteBranch(codigoSucursal: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/branches/${codigoSucursal}`)
    ).then(() => {
      this.branchesSignal.update(list => list.filter(s => s.codigoSucursal !== codigoSucursal));
      this.notificationService.warning('Sucursal eliminada', `ID ${codigoSucursal} removida.`);
      return true;
    }).catch((err) => {
      const msg = this.deleteConflictMessage(err, 'No se pudo eliminar la sucursal.');
      this.notificationService.error('Error', msg);
      return false;
    });
  }
}
