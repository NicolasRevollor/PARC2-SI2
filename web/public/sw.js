/*
 * Service worker de YouShop (PWA + modo sin conexion).
 *
 * Escrito a mano a proposito: el proyecto ya compila con Vite + Analog y
 * meter un plugin de PWA cambiaria el pipeline de build entero para algo que
 * son ~150 lineas. Sin dependencias nuevas.
 *
 * Estrategias por tipo de pedido:
 *   - Navegacion (HTML)      -> red primero, cae al shell cacheado (SPA).
 *   - Assets con hash        -> cache primero (el nombre cambia en cada build).
 *   - GET a la API           -> red primero, cae a la ultima respuesta buena.
 *   - Resto (fuentes, CDN)   -> stale-while-revalidate.
 *
 * Los pedidos que NO son GET nunca se cachean ni se "reintentan" desde acá:
 * las mutaciones hechas sin conexion viven en la cola (outbox) de IndexedDB
 * que maneja la app (offline-sync.service.ts), que es quien sabe de permisos,
 * tokens y orden de reenvio.
 */

// v2: cambio de catalogo (solo poleras oversize y jeans). Subir la version
// hace que "activate" borre los caches viejos, incluidas respuestas de la API
// con productos que ya no existen.
// v3: CU12-CU20. /api/sync y /api/caja no se cachean: un dato viejo de caja o
// de la cola confundiria al usuario; lo local vive en IndexedDB.
const VERSION = 'youshop-v3';
const CACHE_SHELL = `${VERSION}-shell`;
const CACHE_ASSETS = `${VERSION}-assets`;
const CACHE_API = `${VERSION}-api`;
const CACHE_TERCEROS = `${VERSION}-terceros`;

const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

// Rutas de la API que NO se cachean: respuestas con datos de pago o tokens
// no tienen por que quedar en disco del dispositivo.
const API_NUNCA_CACHEAR = ['/api/auth/', '/api/payments/', '/api/sync/', '/api/caja/'];

/**
 * [CU12] paso 2: guarda los scripts y estilos del build. Tienen hash en el
 * nombre, asi que se leen del index.html: la primera carga ocurre antes de que
 * el SW controle la pagina y sin esto recargar sin conexion quedaria en blanco.
 */
async function precargarAssets() {
  const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
  const rutas = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const cache = await caches.open(CACHE_ASSETS);
  await cache.addAll(rutas);
  await precargarFuentes(html);
}

/**
 * [CU12] paso 2: las fuentes vienen de Google. Sin ellas, sin conexion los iconos
 * de Material Symbols se ven como texto ("point_of_sale"). Si Google no responde
 * no se aborta la instalacion: la app funciona igual, solo se ve peor.
 */
async function precargarFuentes(html) {
  try {
    const hojas = [...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));
    const cache = await caches.open(CACHE_TERCEROS);
    for (const hoja of hojas) {
      const respuesta = await fetch(hoja, { mode: 'cors' });
      if (!respuesta.ok) continue;
      await cache.put(hoja, respuesta.clone());
      const css = await respuesta.text();
      const fuentes = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
      // La hoja de texto trae decenas de subconjuntos: alcanza con los ultimos (latin).
      await Promise.all(fuentes.slice(-6).map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => undefined)));
    }
  } catch (error) {
    console.warn('No se pudieron guardar las fuentes para usar sin conexion', error);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      // addAll falla entero si UN recurso falla; el shell es chico y
      // obligatorio, asi que esa semantica es la deseada.
      .then((cache) => cache.addAll(SHELL))
      .then(precargarAssets)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.filter((clave) => !clave.startsWith(VERSION)).map((clave) => caches.delete(clave))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Al cerrar sesion la app manda este mensaje: el cache de la API guarda
 * respuestas del usuario que se fue y no puede quedar disponible para el
 * siguiente que entre en el mismo dispositivo.
 */
self.addEventListener('message', (event) => {
  const tipo = event.data && event.data.type;
  if (tipo === 'LIMPIAR_CACHE_API') {
    event.waitUntil(caches.delete(CACHE_API));
  } else if (tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function esApi(url) {
  return url.pathname.startsWith('/api/');
}

function esCacheable(url) {
  return !API_NUNCA_CACHEAR.some((prefijo) => url.pathname.startsWith(prefijo));
}

async function redPrimeroConFallback(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const respuesta = await fetch(request);
    if (respuesta && respuesta.ok) {
      cache.put(request, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    const cacheada = await cache.match(request);
    if (cacheada) {
      return cacheada;
    }
    throw error;
  }
}

async function cachePrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  // ignoreVary: los <script crossorigin> llevan cabecera Origin y la precarga no;
  // con "Vary: Origin" del servidor nunca coincidirian y fallaria sin conexion.
  const cacheada = await cache.match(request, { ignoreVary: true });
  if (cacheada) {
    return cacheada;
  }
  const respuesta = await fetch(request);
  if (respuesta && respuesta.ok) {
    cache.put(request, respuesta.clone());
  }
  return respuesta;
}

async function staleWhileRevalidate(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const cacheada = await cache.match(request, { ignoreVary: true });
  const enRed = fetch(request)
    .then((respuesta) => {
      if (respuesta && respuesta.ok) {
        cache.put(request, respuesta.clone());
      }
      return respuesta;
    })
    .catch(() => cacheada);
  return cacheada || enRed;
}

async function responderNavegacion(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_SHELL);
    // La SPA resuelve el ruteo en cliente: devolver el shell alcanza para
    // que la app arranque sin conexion y lea su base local.
    const shell = (await cache.match('/index.html')) || (await cache.match('/'));
    if (shell) {
      return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return; // las mutaciones las maneja la cola de la app, no el SW
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(responderNavegacion(request));
    return;
  }

  if (esApi(url)) {
    if (esCacheable(url)) {
      event.respondWith(redPrimeroConFallback(request, CACHE_API));
    }
    return;
  }

  if (url.origin === self.location.origin) {
    // /assets/* sale del build con hash en el nombre -> inmutable.
    const inmutable = url.pathname.startsWith('/assets/');
    event.respondWith(
      inmutable ? cachePrimero(request, CACHE_ASSETS) : staleWhileRevalidate(request, CACHE_ASSETS)
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request, CACHE_TERCEROS));
});
