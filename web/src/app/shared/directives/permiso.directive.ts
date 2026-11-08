import { Directive, ElementRef, Input, effect, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Oculta un boton (o bloque) si el usuario no tiene el permiso:
 *   <button appPermiso="producto.crear" ...>
 *
 * Es solo cosmetico: la autorizacion real la hace el backend con require_permiso()
 * (sin el permiso responde 403). Sirve para que cada rol vea solo lo que puede hacer
 * y no aparezcan botones que despues fallan.
 */
@Directive({
  selector: '[appPermiso]',
  standalone: true,
})
export class PermisoDirective {
  private readonly permiso = signal<string>('');

  @Input({ required: true }) set appPermiso(valor: string) {
    this.permiso.set(valor);
  }

  constructor(el: ElementRef<HTMLElement>, auth: AuthService) {
    effect(() => {
      const permisos = auth.currentUser()?.permisos ?? [];
      const requeridos = this.permiso().split('|').map((p) => p.trim()).filter(Boolean);
      const puede = !requeridos.length || requeridos.some((p) => permisos.includes(p));
      el.nativeElement.style.display = puede ? '' : 'none';
    });
  }
}
