// Reglas de fortaleza de contraseña — reflejan exactamente
// `validate_password_strength` en `backend/app/security.py` (líneas 32-38):
// minimo 10 caracteres, 1 minuscula (`[a-z]`), 1 mayuscula (`[A-Z]`),
// 1 numero (`\d`), 1 caracter especial = no alfanumerico (`[^A-Za-z0-9]`).
//
// `hasSpecial` usa deliberadamente el mismo `[^A-Za-z0-9]` que el backend,
// más amplio que la whitelist de simbolos que login.component.ts usaba antes
// de este cambio — esa whitelist era la que estaba desalineada con el backend,
// no esta regla.
//
// Funciones puras. Nunca se usan como literales de regex dentro de un
// binding de template Angular (rompe la compilacion AOT); se invocan
// siempre desde metodos de la clase del componente.

export function hasLower(value: string): boolean {
  return /[a-z]/.test(value);
}

export function hasUpper(value: string): boolean {
  return /[A-Z]/.test(value);
}

export function hasDigit(value: string): boolean {
  return /[0-9]/.test(value);
}

export function hasSpecial(value: string): boolean {
  return /[^A-Za-z0-9]/.test(value);
}

export function hasMinLength(value: string): boolean {
  return value.length >= 10;
}

export function isStrong(value: string): boolean {
  return (
    hasMinLength(value) &&
    hasLower(value) &&
    hasUpper(value) &&
    hasDigit(value) &&
    hasSpecial(value)
  );
}
