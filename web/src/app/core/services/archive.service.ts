import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ProductOut, PaginatedProducts, ProductoIn, ProveedorOption, ColeccionOption } from '../models';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({
  providedIn: 'root'
})
export class ArchiveService {
  private productsSignal = signal<ProductOut[]>([]);
  private proveedoresSignal = signal<ProveedorOption[]>([]);
  private coleccionesSignal = signal<ColeccionOption[]>([]);
  private totalSignal = signal<number>(0);

  public products = this.productsSignal.asReadonly();
  public proveedores = this.proveedoresSignal.asReadonly();
  public colecciones = this.coleccionesSignal.asReadonly();
  public total = this.totalSignal.asReadonly();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadProducts(filters?: { idColeccion?: number; idProveedor?: number; tipo?: string; talla?: string; color?: string; q?: string; page?: number; size?: number }): Promise<void> {
    let params = new HttpParams();
    if (filters?.idColeccion) params = params.set('idColeccion', filters.idColeccion.toString());
    if (filters?.idProveedor) params = params.set('idProveedor', filters.idProveedor.toString());
    if (filters?.tipo) params = params.set('tipo', filters.tipo);
    if (filters?.talla) params = params.set('talla', filters.talla);
    if (filters?.color) params = params.set('color', filters.color);
    if (filters?.q) params = params.set('q', filters.q);
    if (filters?.page) params = params.set('page', filters.page.toString());
    if (filters?.size) params = params.set('size', filters.size.toString());

    return firstValueFrom(
      this.http.get<PaginatedProducts>(`${API_URL}/api/products`, { params })
    ).then((res) => {
      this.productsSignal.set(res.items);
      this.totalSignal.set(res.total);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo cargar el catálogo.');
    });
  }

  loadProveedores(): Promise<void> {
    return firstValueFrom(
      this.http.get<ProveedorOption[]>(`${API_URL}/api/suppliers`)
    ).then((list) => {
      this.proveedoresSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar los proveedores.');
    });
  }

  loadColecciones(): Promise<void> {
    return firstValueFrom(
      this.http.get<ColeccionOption[]>(`${API_URL}/api/collections`)
    ).then((list) => {
      this.coleccionesSignal.set(list);
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudieron cargar las colecciones.');
    });
  }

  uploadImagen(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append('file', file);

    return firstValueFrom(
      this.http.post<{ imagen_url: string }>(`${API_URL}/api/products/upload-imagen`, formData)
    ).then((res) => res.imagen_url).catch((err) => {
      const msg = err.error?.detail || 'No se pudo subir la imagen.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  addProduct(newProduct: ProductoIn): Promise<ProductOut | null> {
    return firstValueFrom(
      this.http.post<ProductOut>(`${API_URL}/api/products`, newProduct)
    ).then((product) => {
      this.productsSignal.update(list => [product, ...list]);
      this.notificationService.success('Producto agregado', `"${product.nombre}" añadido al catálogo.`);
      return product;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo agregar el producto.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  updateProduct(id: number, updates: Partial<ProductoIn>): Promise<ProductOut | null> {
    return firstValueFrom(
      this.http.put<ProductOut>(`${API_URL}/api/products/${id}`, updates)
    ).then((product) => {
      this.productsSignal.update(list => list.map(p => p.idProducto === id ? product : p));
      this.notificationService.info('Producto actualizado', `${product.nombre}`);
      return product;
    }).catch((err) => {
      const msg = err.error?.detail || 'No se pudo actualizar el producto.';
      this.notificationService.error('Error', msg);
      return null;
    });
  }

  deleteProduct(id: number): Promise<boolean> {
    return firstValueFrom(
      this.http.delete(`${API_URL}/api/products/${id}`)
    ).then(() => {
      this.productsSignal.update(list => list.filter(p => p.idProducto !== id));
      this.notificationService.warning('Producto eliminado', `ID: ${id} removido del catálogo.`);
      return true;
    }).catch(() => {
      this.notificationService.error('Error', 'No se pudo eliminar el producto.');
      return false;
    });
  }
}
