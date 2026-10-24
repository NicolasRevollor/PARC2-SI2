import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Endpoints donde un 401 significa "credenciales/enlace inválidos", no
// "access token vencido": no tiene sentido renovar y reintentar.
const RUTAS_SIN_RENOVACION = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const conToken = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(conToken).pipe(
    catchError((err: unknown) => {
      const renovable =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        token !== null &&
        !RUTAS_SIN_RENOVACION.some((ruta) => req.url.includes(ruta));
      if (!renovable) {
        return throwError(() => err);
      }
      // El access token dura 30 min: se renueva con el refresh token y se
      // reintenta UNA vez. Si no se puede renovar, se propaga el 401 original.
      return from(authService.refrescarSesion()).pipe(
        switchMap((nuevo) =>
          nuevo
            ? next(req.clone({ setHeaders: { Authorization: `Bearer ${nuevo}` } }))
            : throwError(() => err)
        )
      );
    })
  );
};
