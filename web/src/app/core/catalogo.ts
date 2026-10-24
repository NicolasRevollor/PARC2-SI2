/**
 * Catalogo de la tienda: solo poleras oversize y jeans.
 *
 * Es la misma definicion que siembra la migracion 020 en la base (tipo,
 * colores, tallas e imagenes en /productos). Los filtros y el alta de
 * productos se arman desde aca para que nadie cargue una prenda fuera de la
 * oferta (un "Blazer", un color que no se vende, una talla inexistente).
 */

export const TIPO_POLERA = 'Polera Oversize';
export const TIPO_JEANS = 'Jeans';
export const TIPOS_PRENDA = [TIPO_POLERA, TIPO_JEANS] as const;
export type TipoPrenda = (typeof TIPOS_PRENDA)[number];

export const COLORES_POR_TIPO: Record<TipoPrenda, string[]> = {
  [TIPO_POLERA]: ['Blanco', 'Negro', 'Guinda', 'Gris'],
  [TIPO_JEANS]: ['Negro', 'Blanco'],
};

export const TALLAS_POR_TIPO: Record<TipoPrenda, string[]> = {
  [TIPO_POLERA]: ['S', 'M', 'L', 'XL'],
  [TIPO_JEANS]: ['28', '30', '32', '34', '36'],
};

/** Todos los colores que vende la tienda (para filtros sin tipo elegido). */
export const COLORES_TIENDA = ['Blanco', 'Negro', 'Guinda', 'Gris'];

/** Muestra de color para chips/filtros. */
export const HEX_COLOR: Record<string, string> = {
  Blanco: '#f4f3ef',
  Negro: '#1d1d20',
  Guinda: '#6b1a2b',
  Gris: '#9a9ca2',
};

export const IMAGEN_SIN_FOTO = '/productos/sin-imagen.jpg';

// "Polera Oversize" + "Negro" -> "polera-oversize-negra" (la polera concuerda
// en femenino; el jean en masculino).
const SLUG_POLERA: Record<string, string> = { Blanco: 'blanca', Negro: 'negra', Guinda: 'guinda', Gris: 'gris' };
const SLUG_JEANS: Record<string, string> = { Negro: 'negro', Blanco: 'blanco' };

function slugImagen(tipo: string | null | undefined, color: string | null | undefined): string | null {
  if (!tipo || !color) return null;
  if (tipo === TIPO_POLERA && SLUG_POLERA[color]) return `polera-oversize-${SLUG_POLERA[color]}`;
  if (tipo === TIPO_JEANS && SLUG_JEANS[color]) return `jeans-${SLUG_JEANS[color]}`;
  return null;
}

/** Foto de frente del catalogo para un tipo+color (null si no existe esa combinacion). */
export function imagenCatalogo(tipo: string | null | undefined, color: string | null | undefined): string | null {
  const slug = slugImagen(tipo, color);
  return slug ? `/productos/${slug}.jpg` : null;
}

/** Foto de espalda (imagen secundaria). */
export function imagenEspalda(tipo: string | null | undefined, color: string | null | undefined): string | null {
  const slug = slugImagen(tipo, color);
  return slug ? `/productos/${slug}-espalda.jpg` : null;
}

/** Nombre comercial sugerido: "Polera Oversize Guinda", "Jeans Blanco". */
export function nombreSugerido(tipo: string | null | undefined, color: string | null | undefined): string {
  if (tipo === TIPO_POLERA && color && SLUG_POLERA[color]) {
    const femenino = SLUG_POLERA[color];
    return `${TIPO_POLERA} ${femenino.charAt(0).toUpperCase()}${femenino.slice(1)}`;
  }
  if (tipo === TIPO_JEANS && color) return `${TIPO_JEANS} ${color}`;
  return '';
}

export function esTipoPrenda(tipo: string | null | undefined): tipo is TipoPrenda {
  return tipo === TIPO_POLERA || tipo === TIPO_JEANS;
}
