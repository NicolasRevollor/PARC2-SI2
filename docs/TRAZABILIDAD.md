# Trazabilidad: diagramas del informe ↔ código

## Cómo encontrar un diagrama en el código

1. En Visual Studio Code aprieta **Ctrl + Shift + F** (buscar en todos los archivos).
2. Escribe lo que te pidan, por ejemplo:
   - `[CU4]` → todo el código del CU4. **Escríbelo con corchetes**: si buscas `CU1` sin corchetes también salen CU10, CU11, etc.
   - `Clases CU4` o `Robustez CU4` → el código de ese diagrama.
   - `ControlDevoluciones.calcularDiferencia` → el método exacto del diagrama de clases.
   - `ResolverCambioUI` → la pantalla (boundary) del diagrama.
3. Arriba de cada función encontrada hay un bloque como este:

```python
# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# Diagramas del informe: "Robustez CU4" y "Clases CU4"
# Nombre en el diagrama: ControlDevoluciones.calcularDiferencia()
# En palabras simples: cuanto paga de mas (o le sobra) el cliente ...
# ==================================================================
```

> **Ojo:** los comentarios **sin corchetes** que ya estaban en el código (por ejemplo, `CU12` en
> `payments.py` o `CU22` en `recomendaciones_gemini.py`) son del **primer parcial**. Los de este
> informe siempre van **con corchetes**: `[CU4]`.

## Cómo se lee un diagrama de robustez / clases en el código

| En el diagrama | En el código |
|---|---|
| **Boundary / clase `...UI`** (pantalla) | Componente Angular en `web/src/app/features/...` (o pantalla Flutter en `mobile/app/lib/screens/...`) |
| **Control `ControlDevoluciones`** | Endpoints de `backend/app/routers/returns.py` + reglas de `backend/app/services/devoluciones.py` |
| **Entidad** (`Devolucion`, `Inventario`, ...) | Clase en `backend/app/models/__init__.py` (= tabla de la base de datos) |
| **«interface» `PasarelaDePagos`** | `backend/app/services/pagos_stripe.py` → `reembolsar_payment_intent()` (Stripe) |
| **`Bitacora.registrarBitacora()`** | `backend/app/services/bitacora.py` → `registrar_bitacora()` |

## Diagramas de clases (CU1 a CU10): métodos del Control y dónde están

| CU | Pantalla (UI del diagrama) | Archivo de la pantalla | Métodos del Control → función en el backend |
|---|---|---|---|
| CU1 | `RegistrarDevolucionUI` | `features/returns/return-new.component.ts` | `buscarVenta` → `buscar_ventas` · `validarElegibilidad`/`calcularElegibilidad` → `evaluar_elegibilidad`, `_nuevo_caso` · `marcarRequiereAutorizacion` → `_controlar_limite_mensual` · `registrarSolicitud` → `registrar_en_tienda` |
| CU2 | `MisComprasUI` | `features/customer/returns/customer-returns.component.ts` · móvil `screens/returns_screen.dart` | `listarMisCompras` → `mis_compras` · `consultarStock` → `stock_reemplazo` · `enviarSolicitud` → `solicitar_en_linea` · `Inventario.apartarVariante` → `reservar` |
| CU3 | `InspeccionarDevolucionUI` | `features/returns/return-inspect.component.ts` | `buscarSolicitud` → `buscar_por_codigo` · `compararSKU` → `codigo_coincide` · `decidirInspeccion` → `decidir_inspeccion` · `registrarInspeccion` → `inspeccionar` · `liberarReservaApartada` → `liberar_reserva` |
| CU4 | `ResolverCambioUI` | `features/returns/return-resolve.component.ts` | `obtenerVariantes` → `stock_reemplazo` · `calcularDiferencia` → `diferencia_variante` · `exigirAutorizacion` → `exigir_autorizacion` · `resolver` → `resolver` / `resolver_caso` |
| CU5 | `CambioOtroProductoUI` | `features/returns/return-resolve.component.ts` | `calcularCredito`/`obtenerCredito` → `credito_del_caso` · `cotizarProducto` → `_crear_venta_cambio` · `resolver` → `resolver_caso` |
| CU6 | `ProcesarReembolsoUI` | `return-resolve.component.ts` y `return-refunds.component.ts` | `calcularMonto`/`obtenerMontoReembolso` → `credito_del_caso` · `marcarReembolso` → `reembolsar` · `PasarelaDePagos.reembolsar` → `reembolsar_payment_intent` |
| CU7 | `ResolverDevolucionUI` (y la bandeja de avisos) | `return-resolve.component.ts`, `shared/components/notificaciones-bell.component.ts` | **Emitir nota de devolución** → `devoluciones.py` → `nota_de_devolucion()` · PDF → `returns.py` → `comprobante` · aviso al cliente → `avisar_resultado()` |
| CU8 | `ResolverCambioUI` | `return-resolve.component.ts` y `return-tray.component.ts` | `resolverComo` → `_sin_stock` · `completarCambio` → `completar_cambio` / `completar_cambio_pendiente` |
| CU9 | `PoliticaDevolucionesUI` | `features/returns/return-policy.component.ts` | `obtenerPoliticaVigente` → `ver_politica` / `politica_vigente` · `guardarPolitica` → `guardar_politica` · `validarPolitica` → `errores_politica` · `usarPoliticaDePlataforma` → clase `Politica` |
| CU10 | `ResolverDevolucionUI` | `return-resolve.component.ts` y `return-inventory.component.ts` | `iniciarTransaccion`/`confirmarTransaccion`/`revertirTransaccion` → dentro de `resolver` (returns.py) · `decidirDestino` → `destino_por_condicion` · `recibirPrendaDevuelta` → `recibir_prenda` · `descontarVariante` → `entregar_prenda` |

Los archivos de pantalla están en `web/src/app/`; los del backend en `backend/app/routers/returns.py` y `backend/app/services/devoluciones.py`.

## Diagramas de robustez (CU1 a CU10): cada control y dónde está

Busca el nombre del control **entre comillas**, por ejemplo `"BuscarVenta"`, o `Robustez CU3`. Cada comentario
también dice el **número de mensaje** del diagrama (por ejemplo, "mensaje 8: evaluarPrenda(...)").

| CU | Boundary (pantalla) | Control del diagrama de robustez | Función en el código |
|---|---|---|---|
| CU1 | "Registrar Devolución o Cambio" → `return-new.component.ts` | `BuscarVenta` | `returns.py` → `buscar_ventas` |
| | | `ValidarElegibilidad` | `returns.py` → `_nuevo_caso` + `devoluciones.py` → `evaluar_elegibilidad` |
| | | `RegistrarSolicitud` | `returns.py` → `registrar_en_tienda` |
| CU2 | "Mis Compras / Solicitar Cambio" → `customer-returns.component.ts` / móvil `returns_screen.dart` | `ControlDevoluciones` | `mis_compras`, `stock_reemplazo`, `solicitar_en_linea` |
| CU3 | "Inspeccionar Devolución" → `return-inspect.component.ts` | `BuscarSolicitud` | `returns.py` → `buscar_por_codigo` |
| | | `EvaluarCondicion` | `devoluciones.py` → `codigo_coincide`, `decidir_inspeccion` |
| | | `RegistrarInspeccion` | `returns.py` → `inspeccionar` |
| CU4 | "Resolver Cambio" → `return-resolve.component.ts` | `ConsultarVariantes` | `returns.py` → `stock_reemplazo` |
| | | `CalcularDiferencia` | `devoluciones.py` → `diferencia_variante` |
| | | `ConfirmarCambio` | `returns.py` → `resolver` + `devoluciones.py` → `resolver_caso` |
| CU5 | "Cambio por Otro Producto" → `return-resolve.component.ts` | `ControlDevoluciones` | `credito_del_caso`, `resolver_caso`, `_crear_venta_cambio` |
| CU6 | "Procesar Reembolso" → `return-resolve.component.ts` | `CalcularMontoReembolso` | `devoluciones.py` → `credito_del_caso`, `medio_de_pago` |
| | | `EjecutarReembolso` | `devoluciones.py` → `reembolsar` |
| | "Pasarela de Pagos : Stripe" | (boundary externo) | `pagos_stripe.py` → `reembolsar_payment_intent` |
| CU7 | "Resolver Devolución" → `return-resolve.component.ts` | (rehacer el diagrama: ver nota abajo) | `devoluciones.py` → `nota_de_devolucion`, `avisar_resultado` · `returns.py` → `comprobante` |
| CU8 | "Resolver Cambio" → `return-resolve.component.ts` | `BuscarStockSucursales` | `returns.py` → `stock_reemplazo` + `devoluciones.py` → `stock_por_sucursal` |
| | | `Backend : GestionarTraslado` | `devoluciones.py` → `_sin_stock` |
| | | `CompletarCambio` | `returns.py` → `completar_cambio` + `devoluciones.py` → `completar_cambio_pendiente` |
| CU9 | "Política de Devoluciones" → `return-policy.component.ts` | `ObtenerPolitica` | `returns.py` → `ver_politica` |
| | | `ValidarPolitica` | `devoluciones.py` → `errores_politica` |
| | | `GuardarVersionPolitica` | `returns.py` → `guardar_politica` |
| CU10 | "Resolver Devolución" → `return-resolve.component.ts` / `return-inventory.component.ts` | `ResolverDevolucion` | `returns.py` → `resolver` |
| | | `DeterminarDestino` | `devoluciones.py` → `destino_por_condicion` |
| | | `MoverInventario` | `devoluciones.py` → `recibir_prenda`, `entregar_prenda` |

Las entidades de los diagramas de robustez (`Venta`, `Devolucion`, `PoliticaDevolucion`, `Bitacora`, ...)
son las clases de `backend/app/models/__init__.py`. `Bitacora` siempre es `services/bitacora.py` → `registrar_bitacora`.

## Diagramas de secuencia (CU1 a CU10): lifelines y fragmentos

Busca `Secuencia CU4` o el nombre de un mensaje del diagrama (por ejemplo `calcularDiferencia`).
Los fragmentos también están marcados **dentro del código**, justo en la línea donde ocurren:
busca `[alt`, `[opt`, `[loop` o `[break` junto con el CU, por ejemplo `Secuencia CU3: [break`.

| CU | Lifelines del diagrama (pantalla → controles) | Fragmentos marcados en el código |
|---|---|---|
| CU1 | "Registrar Devolución o Cambio" → `BuscarVenta`, `ValidarElegibilidad`, `RegistrarSolicitud` | break venta no encontrada (`buscar_ventas`), alt no elegible (`_nuevo_caso`), opt recargo (`calcular_recargo`), loop por prenda (`registrar_en_tienda`) |
| CU2 | "Mis Compras / Solicitar Cambio" → `ListarComprasElegibles`, `ValidarSolicitud`, `RegistrarSolicitudEnLinea` | loop por prenda (`_venta_para_devolucion`), alt solicitud abierta / fuera de plazo (`solicitar_en_linea`, `_nuevo_caso`), opt apartar variante |
| CU3 | "Inspeccionar Devolución" → `BuscarSolicitud`, `EvaluarCondicion`, `RegistrarInspeccion` | break estado inválido, alt no corresponde / deteriorada / aprobada, opt descuento por deterioro (`inspeccionar`) |
| CU4 | "Resolver Cambio" → `ConsultarVariantes`, `CalcularDiferencia`, `ConfirmarCambio` | break sin stock → CU8 (`resolver_caso`), alt diferencia > 0 / ≤ 0 (`_liquidar`) |
| CU5 | "Cambio por Otro Producto" → `CalcularCredito`, `CotizarProductos`, `ConfirmarCambio` | loop por producto y alt sin stock (`resolver_caso`), alt total > crédito / ≤ crédito (`_liquidar`) |
| CU6 | "Procesar Reembolso" → `CalcularMontoReembolso`, `EjecutarReembolso`, `Stripe` | opt umbral de autorización (`resolver_caso`), alt efectivo / tarjeta / QR (`reembolsar`), opt pasarela falla (`intentar_reembolso_tarjeta`) |
| CU7 | "Resolver Devolución" (rehacer el diagrama) | si se devolvió dinero, la nota sale en `comprobante` y el aviso en `avisar_resultado` |
| CU8 | "Resolver Cambio" → `BuscarStockSucursales`, `GestionarTraslado`, `CompletarCambio` | alt traslado / otra sucursal / ninguna tiene stock (`_sin_stock`), opt el cliente retira (`completar_cambio`) |
| CU9 | "Política de Devoluciones" → `ObtenerPolitica`, `ValidarPolitica`, `GuardarVersionPolitica` | opt política de plataforma (clase `Politica`), alt valores inválidos / válidos (`guardar_politica`) |
| CU10 | "Resolver Devolución" → `ResolverDevolucion`, `DeterminarDestino`, `MoverInventario` | alt apta / defecto (`recibir_prenda`), opt es un cambio (`entregar_prenda`), alt falló → `revertirTransaccion` / todo OK → `confirmarTransaccion` (`resolver` en returns.py) |

## Guía rápida para defender: el camino de una petición (ejemplo CU4)

Si te preguntan "¿cómo funciona el sistema?", sigue este recorrido con un caso concreto (cambio de talla, CU4):

| # | Capa (diagrama lógico 4.2.1) | Qué pasa | Archivo |
|---|---|---|---|
| 1 | Presentación | El empleado elige la talla nueva y aprieta "Confirmar" | `web/src/app/features/returns/return-resolve.component.ts` → `confirmar()` |
| 2 | Presentación | El servicio Angular manda la petición HTTP con el token JWT | `web/src/app/core/services/returns.service.ts` → `resolver()` |
| 3 | Infraestructura (seguridad) | El backend revisa el token y el permiso del rol | `backend/app/security.py` → `require_permiso` |
| 4 | Negocio (router) | El endpoint recibe el pedido, verifica que el caso sea de la empresa y esté "Aprobada" | `backend/app/routers/returns.py` → `resolver()` |
| 5 | Negocio (reglas) | Se calcula la diferencia, se cobra o se da saldo a favor y se mueve el inventario | `backend/app/services/devoluciones.py` → `resolver_caso()` |
| 6 | Datos | Los modelos SQLAlchemy guardan todo en PostgreSQL en **una sola transacción** | `backend/app/models/__init__.py`, `backend/app/database.py` |
| 7 | Presentación | La pantalla recibe la respuesta y muestra el comprobante | `return-resolve.component.ts` |

En el diagrama físico (4.2.2), los pasos 1-2 ocurren en el **navegador del personal** (la app viene de **Vercel**);
los pasos 3-6 en **Render** (Python + FastAPI) y la base de datos está en **Supabase** (PostgreSQL).

Frases útiles:
- "Cada empresa solo ve sus datos porque **todas las consultas filtran por `idTenant`**, que sale del token y nunca del usuario."
- "Si algo falla en medio de un cambio, **no se hace el commit** y la base de datos deshace todo (CU10, `revertirTransaccion`)."
- "Las reglas de negocio están en `services/devoluciones.py`, separadas de los endpoints; por eso se pueden probar con pytest sin base de datos."

## Cambios por las correcciones de la ingeniera (segunda revisión)

| Corrección | Qué se hizo en el código | Dónde buscar |
|---|---|---|
| **Ya no hay notas de crédito ("planes a crédito")** | Se borraron las notas de crédito (tablas, API, pantallas del POS y "Mis notas"). Si al cliente le sobra plata **siempre se le devuelve en dinero** y recibe una **nota de devolución**. El CU7 pasa a ser **"Emitir nota de devolución"**. | `devoluciones.py` → `nota_de_devolucion()`, `_liquidar()`; migración `025_sin_notas_credito_avisos_medidas.sql` |
| **3. Aviso tipo push o correo, y devolver el dinero si compró algo sin internet** | Bandeja de **notificaciones** (campanita en la web y "Mis avisos" en la app) + **correo** (Brevo). Si una venta hecha sin internet se rechaza al sincronizar, al cliente le llega "Le devolvemos Bs X" y al personal "Devolver Bs X". | `services/notificaciones.py`, `routers/notificaciones.py`, `routers/sales.py` → `_avisar_devolucion_venta_sin_conexion()`, `notificaciones-bell.component.ts` |
| **6. Push: "su prenda será enviada el día viernes"** | Cuando se trae la talla de otra sucursal (CU8), al cliente le llega "Su prenda será enviada el viernes 06/11". También hay avisos al recibir la solicitud, al inspeccionar y al terminar. | `devoluciones.py` → `_sin_stock()` (busca `AVISO TIPO PUSH`) |
| **7. Nota de devolución** | Es el comprobante (PDF y aviso) que dice cuánto dinero se devolvió, por qué medio y en qué estado está. Su número es el código del caso (DEV-000123). | `devoluciones.py` → `nota_de_devolucion()`, `returns.py` → `comprobante` |
| **8. Distinción entre tallas: "L más grande o L menos grande"** | Cada prenda guarda sus **medidas reales en cm** (pecho, largo, cintura). Al elegir otra talla, el sistema dice si es **más grande o más chica y por cuántos cm** (una "L" oversize no mide lo mismo que una "L" normal). | `devoluciones.py` → `comparar_tallas()`, `returns.py` → `GET /comparar-tallas`, pantallas `return-resolve` y `customer-returns`, app móvil |

> **Ojo con los diagramas del CU7**: los diagramas de robustez, secuencia y clases del CU7 del informe todavía
> dibujan notas de crédito (`EmitirNotaCredito`, `ConsultarNotas`, `CanjearNota`, `ControlNotasCredito`).
> Hay que rehacerlos como **"Emitir nota de devolución"**, y quitar `NotaCredito` y `NotaCreditoMovimiento`
> del modelo de dominio y del diagrama de la base de datos (agregar `Notificacion`).

## CU11 a CU20: dónde está cada caso de uso

Busca `[CU14]` **con corchetes**, igual que en los demás. En la web cada pantalla muestra además una
**marca visible** con el código del CU (`shared/components/cu-badge.component.ts`); en el menú y en las
pestañas también aparece el código. En la app móvil la marca es `CuMarca` (`screens/offline/staff_shell.dart`).

El módulo está en el menú **Operación sin conexión** (una pestaña por CU) y **Apertura y cierre de caja**.

| CU | Pantalla web (`web/src/app/`) | Pantalla móvil | Control en el backend (`backend/app/`) |
|---|---|---|---|
| CU11 | `features/returns/return-history.component.ts` | no aplica (solo web) | `routers/returns.py` → `listar_devoluciones`, `analisis`, `exportar_excel`, `exportar_pdf` |
| CU12 | `features/offline/prepare-device.component.ts` | `_PrepararPantalla` | `routers/sync.py` → `preparacion`, `snapshot` · `services/preparacion.py` |
| CU13 | `features/offline/offline-catalog.component.ts`; Cliente: `features/customer/catalog/catalog.component.ts` | `_CatalogoPantalla`; Cliente: aviso en `main_navigation_shell.dart` | No usa el servidor: `core/offline-rules.ts` → `existenciaLocal` |
| CU14 | `features/offline/offline-sale.component.ts` (también dentro del POS sin red) | `_VentaPantalla` | `services/operaciones_offline.py` → `aplicar_venta` |
| CU15 | `features/offline/offline-reservation.component.ts` | `_ReservaPantalla` | `services/operaciones_offline.py` → `aplicar_reserva`, `aplicar_cancelacion` |
| CU16 | `features/offline/pending-operations.component.ts` | `_OperacionesPantalla` | `routers/sync.py` → `estado_operaciones`, `registro_sincronizacion` |
| CU17 | `core/services/offline-sync.service.ts` → `sincronizar()`; botón en `pending-operations.component.ts` | `services/offline_sync_service.dart` → `sincronizar()` | `routers/sync.py` → `sincronizar_lote` · `services/operaciones_offline.py` → `procesar_operacion` |
| CU18 | `features/offline/conflicts.component.ts` | no aplica (solo web) | `routers/sync.py` → `resolver_conflicto` · `services/conflictos.py` → `resolver` |
| CU19 | `features/offline/offline-exchange.component.ts` | `_CambioPantalla` | `services/operaciones_offline.py` → `aplicar_cambio`, `aplicar_custodia` |
| CU20 | `features/caja/caja.component.ts` | `_CajaPantalla` | `routers/caja.py` · `services/caja.py` (y `aplicar_apertura`, `aplicar_cierre` sin conexión) |

Los datos locales están en IndexedDB (`core/services/local-db.service.ts`) y en SQLite (`services/offline_db.dart`).
Las reglas que corren en el dispositivo son las mismas en web y móvil: `core/offline-rules.ts` y `services/offline_rules.dart`.

### Entidades nuevas (migración 026)

| Entidad | Tabla | Para qué |
|---|---|---|
| `Caja` | `caja` | Turno de caja de una sucursal (CU20) |
| `MovimientoCaja` | `movimiento_caja` | Cada ingreso o egreso en efectivo (CU20) |
| `ConflictoSincronizacion` | `conflicto_sincronizacion` | Operación que espera la decisión del Encargado (CU18) |
| `ConfiguracionOperacion` | `configuracion_operacion` | Tiempos y umbrales de cada empresa (CU13, CU14, CU18, CU20) |

### Frases útiles para defender

- "Una operación sin conexión **nunca se borra del dispositivo**: cambia de estado. Por eso, si se corta la red a mitad del envío, se reintenta sin riesgo."
- "El **UUID** evita duplicados: si el servidor ya lo procesó, devuelve el resultado original sin registrar nada nuevo."
- "Una operación **en conflicto no mueve stock**: lo mueve la decisión del Encargado."
- "Cada operación del lote va **en su propia transacción**: si una falla, las demás siguen."

### Diferencias con el informe (hay que actualizarlo)

| Dónde | Dice el informe | Qué hace el sistema | Por qué |
|---|---|---|---|
| CU11 paso 4 | Indicador "notas de crédito emitidas" | No existe | La ingeniera eliminó las notas de crédito |
| CU14 alternativo 2 | "Tarjeta, QR o nota de crédito" | El botón existe y explica que solo se acepta efectivo | Se dejó el texto del CU; la nota de crédito ya no existe en línea |
| CU19 alternativo 1 | El saldo a favor "se emitirá como nota de crédito" | Queda como **reembolso en efectivo pendiente** con su **nota de devolución** (CU7); al entregarlo sale de caja | Misma corrección de la ingeniera |
| CU4, CU5, CU6, CU14 | "La caja debe estar abierta" | Ahora se exige de verdad: cobrar o devolver efectivo con la caja cerrada responde error | Era precondición del informe y antes no existía la caja |
| CU12 (permiso) | Encargado no tenía `venta.crear` ni `reserva.crear` | La migración 026 se los da | CU15, CU19 y CU20 lo nombran como actor |

## Revisión del CU11 al CU20 (07/11/2026)

Se revisó cada flujo contra el informe. Lo que se corrigió:

| CU | Qué estaba mal | Cómo quedó |
|---|---|---|
| CU14 | La venta sin conexión dejaba el movimiento de stock como "Venta N (sin conexion)". Los reportes por sucursal, el CU1 y el CU11 buscan "Venta N", así que esas ventas quedaban **sin sucursal** | El motivo es "Venta N" y que vino sin conexión lo dice la referencia. La migración 027 corrige las ventas viejas |
| CU12, CU20 | Preparar dispositivo y Caja ofrecían **todas** las sucursales, también aquellas en las que el usuario no trabaja | Ofrecen solo las asignadas (`GET /api/sync/sucursales`). El POS también rechaza cobrar en una sucursal ajena |
| CU12 | "Clientes frecuentes" eran los registrados en orden alfabético | Son los que más compraron primero, incluidos los que compraron en la empresa sin estar registrados en ella |
| CU15 | La fecha límite de la reserva se guardaba en hora UTC | Se guarda en la hora de Bolivia, que es la que ve el cliente |
| CU18 | Para reasignar una reserva había que escribir el id de la prenda o el código de la sucursal | El conflicto trae las otras tallas/colores con existencia y las otras sucursales con la prenda: se elige con un botón |
| CU20 | El Encargado no se enteraba de un cierre con diferencia que esperaba su aprobación | Recibe una notificación |
| Dashboard (CU24 del P1) | El Encargado veía las ventas de toda la empresa | Ve solo sus sucursales, igual que en el CU30 |

## Plataforma SaaS, reportes con IA y modelos (CU21 a CU30)

Migración: `backend/database/migrations/027_saas_reportes_ia_modelos.sql` (después de la 026).

| CU | Pantalla web (`web/src/app/`) | Menú | Control en el backend (`backend/app/`) |
|---|---|---|---|
| CU21 | `features/platform/platform.component.ts` | Superadmin → Empresas suscritas | `routers/platform.py` → `crear_empresa`, `reenviar_activacion` · `services/cuentas.py` (enlace de activación) |
| CU22 | `features/platform/platform-subscriptions.component.ts` | Superadmin → Suscripciones | `routers/platform.py` → `renovar_suscripcion`, `suspender_suscripcion`, `reactivar_suscripcion`, `cancelar_suscripcion`, `revisar_por_cron` · `services/suscripciones.py` |
| CU23 | `features/platform/platform-plans.component.ts` | Superadmin → Planes | `routers/platform.py` → `crear_plan`, `editar_plan`, `eliminar_plan` |
| CU24 | `features/team/team.component.ts` | Personal y Nodos | `routers/team.py` → `create_staff_user`, `dar_de_baja`, `reincorporar`, `asignar_sucursales` |
| CU25 | No tiene pantalla: corre en **cada** pedido | — | `services/acceso.py` (middleware: cuenta y suscripción) · `services/tenancy.py` → `require_feature`, `exigir_cupo` |
| CU26 | `features/reports-ia/reports-ia.component.ts` | Reportes con IA | `routers/reportes_generativos.py` → `consultar` · `services/reportes_generativos.py` → `interpretar` (Gemini o reglas), `validar`, `ejecutar`, `resumir` |
| CU27 | La misma pantalla, botón del micrófono | Reportes con IA | Navegador (reconocimiento de voz) o `routers/reportes_generativos.py` → `transcribir` |
| CU28 | Reportes con IA (botones PDF/Excel) y `features/reports/reports.component.ts` | Reportes con IA · Reportes | `routers/reportes_generativos.py` → `exportar` · `services/exportacion.py` → `pdf`, `excel` |
| CU29 | `features/modelos-ia/modelos-ia.component.ts` | Modelos de IA | `routers/inteligencia.py` → `datos_disponibles`, `entrenar`, `publicar` · `services/modelos_ia.py` |
| CU30 | `features/dashboard-analitico/dashboard-analitico.component.ts` | Dashboard analítico | `routers/inteligencia.py` → `dashboard` |

Los activadores de cuenta (CU21 paso 6 y CU24 paso 5) usan el mismo formulario que "Olvidé mi contraseña"
(`features/auth/login.component.ts`): el enlace trae `&activar=1`, vale 72 horas y sirve una sola vez.

### Qué responde el CU25

| Situación | Respuesta | Mensaje |
|---|---|---|
| El plan no incluye la función (IA, sin conexión, varias sucursales) | 402 | "Funcionalidad no incluida en su plan…" |
| Se llegó al límite de sucursales, usuarios o productos | 402 | Indica el recurso y el límite |
| Suscripción en periodo de gracia y el pedido modifica algo | 403 | "…solo se permiten consultas hasta que se renueve" |
| Suscripción suspendida o cancelada | 403 | "La suscripcion de su empresa esta suspendida…" |
| Empleado dado de baja | 401 | "Su cuenta fue dada de baja" |

Las operaciones sin conexión registradas antes de la suspensión o de la baja se aceptan al sincronizar (CU17).

### Ciclo de la suscripción (CU22)

`Activa` → faltan 7 días: **Por vencer** (aviso) → vence: **En periodo de gracia** (7 días, solo consulta) → **Suspendida**.
Renovar registra un pago simulado y la deja Activa. La revisión la hace cada día el workflow
`.github/workflows/respaldos-automaticos.yml` (y también se aplica sola cuando la empresa hace un pedido).

### Modelos del CU29

| Modelo | Tipo | Algoritmo | Métrica mínima para publicar |
|---|---|---|---|
| Predicción de demanda | Supervisado (regresión) | RandomForestRegressor | R² ≥ 0,25 (también muestra MAE) |
| Probabilidad de devolución por talla | Supervisado (clasificación) | RandomForestClassifier | F1 ≥ 0,30 y exactitud ≥ 0,60 |
| Segmentación de clientes | No supervisado | KMeans (k de 2 a 5, el de mejor silueta) | Silueta ≥ 0,25 |
| Detección de anomalías | No supervisado | IsolationForest | Al menos 30 días con ventas |

Con pocos datos reales se completan con **datos sintéticos** generados a partir de los reales (cantidad, semanas y
estacionalidad elegibles); la versión queda marcada como entrenada con ellos.

### Frases útiles para defender

- "La IA **no escribe SQL**: devuelve una interpretación (métricas, agrupaciones, filtros) que el backend valida contra una lista cerrada y convierte en una consulta parametrizada de solo lectura, siempre filtrada por la empresa del token."
- "Si no hay clave de Gemini, el reporte igual funciona con el **motor de reglas**; la pantalla dice cuál se usó."
- "El plan se verifica **en el backend en cada pedido**: esconder un botón en la interfaz no es seguridad."
- "Un modelo que no alcanza la métrica mínima **no se puede publicar**, y si un entrenamiento falla sigue la versión publicada anterior."

### Diferencias con el informe (hay que actualizarlo)

| Dónde | Dice el informe | Qué hace el sistema | Por qué |
|---|---|---|---|
| CU26, fila "Precondiciones" de la tabla del caso de uso (no la lista 2.6.1) | "...un plan con reportes generativos (Profesional)" | Los planes son Básico, Intermedio y Avanzado; la IA está en Intermedio y Avanzado | Así están configurados los planes (CU23) |
| CU27 plataforma | "Web, Móvil" | Se dicta desde la web, que también funciona en el navegador del celular (PWA). La app Flutter es del Cliente y no tiene reportes | Los actores del CU27 son Administrador y Encargado |
| CU28 alternativo 1 | "Supera la cantidad de filas permitida" | Más de 1000 filas se genera en segundo plano y llega una notificación; se descarga desde Reportes con IA → Exportaciones | El número no estaba en el informe |
| CU22 | Estados | Además de los del informe, en la base existe "Finalizada" para suscripciones viejas reemplazadas por un cambio de plan | Historial de la migración 023 |

## Delivery de devoluciones (CU31 y CU32) y nota de devolución (CU7)

Migración: `backend/database/migrations/028_domicilio_nota_devolucion.sql` (después de la 027).

El delivery son **dos casos de uso en orden**:

1. **CU31 Recoger a domicilio la prenda devuelta.** En el CU2 el cliente elige "que la recojan en mi casa" (dirección, teléfono, día y horario). El personal programa el recojo (fecha, franja y repartidor); el repartidor la recoge y la prenda llega a la sucursal → pasa a **inspección (CU3)**. Mientras la prenda sigue en la casa del cliente, el sistema no deja inspeccionarla.
2. **CU32 Entregar a domicilio la prenda del cambio.** Solo si la inspección aprobó la prenda y el caso es un **cambio** (CU4, CU5 o CU8): al resolverlo, la prenda nueva sale del stock y el caso queda **"En camino a domicilio"**. Cuando el repartidor la entrega, el caso se completa. Si es una devolución con reembolso no hay entrega: solo recojo.

| CU | Pantalla web | Pantalla móvil | Control en el backend |
|---|---|---|---|
| CU31 | Cliente: `features/customer/returns/customer-returns.component.ts` (formulario del CU2). Personal: `features/returns/return-delivery.component.ts` (Devoluciones → **Recojos y entregas**) | `screens/returns_screen.dart` (formulario de solicitud) | `routers/domicilio.py` → `programar`, `completar`, `fallido`, `cancelar_recojo` · `services/domicilio.py` → `solicitar_recojo` |
| CU32 | `features/returns/return-delivery.component.ts` | Estado "En camino a tu casa" | `services/devoluciones.py` → `resolver_caso` / `completar_cambio_pendiente` llaman a `domicilio.preparar_entrega` · `routers/domicilio.py` → `completar` |
| CU7 | `shared/components/nota-devolucion.component.ts` (botón "Nota de devolución" en el detalle del caso y en "Mis solicitudes") | Botón **NOTA** en cada solicitud con reembolso | `routers/domicilio.py` → `nota_devolucion`, `nota_devolucion_pdf` · `services/nota_devolucion.py` |

### Controles del CU7 (nota de devolución)

| Control | Dónde | Qué hace |
|---|---|---|
| `GenerarNotaDevolucion` | `services/nota_devolucion.py` → `armar_nota()` | Junta **lo que el cliente devolvió** (prenda, talla, color, cantidad, motivo y estado en que llegó), cuánto valía, qué se descontó (recargo, deterioro, delivery), si se llevó otra prenda y **cuánto dinero se le devolvió**, por qué medio y en qué estado está el reembolso |
| `GenerarNotaDevolucion.puedeEmitirse` | `puede_emitirse()` | Alternativo 1: si no se devolvió dinero (cambio sin saldo a favor) responde que corresponde el comprobante de cambio |
| `ExportarNotaDevolucion` | `pdf()` | El PDF que se entrega al cliente |
| `NotificarNotaDevolucion` | `services/devoluciones.py` → `avisar_resultado()` | Aviso en la app y correo "Nota de devolución DEV-…: le devolvimos Bs …" |

### Reglas del delivery

- Cada viaje cuesta lo que fija la política (CU9: "Recojo y entrega a domicilio", por defecto Bs 15). Se **descuenta del valor de la prenda devuelta** (o suma a la diferencia del cambio).
- Es **gratis** si el motivo es defecto de fábrica o prenda equivocada (la culpa es de la tienda).
- Si el repartidor no encuentra al cliente, el viaje queda "Fallido" y se reprograma. El cliente también puede llevarla o retirarla en la sucursal.
- Si se cancela el recojo, el cliente vuelve a tener plazo para llevarla a la sucursal y no se le cobra.
- Una solicitud con recojo pendiente no se anula sola por vencimiento.

### Sin "crédito"

Ya no quedan notas de crédito en pantallas ni en datos: la venta del cambio por otro producto se paga con el
"Valor de prenda devuelta" (antes "Crédito por devolución"), las pantallas dicen "Valor a favor" y la venta sin
conexión ya no menciona la nota de crédito como medio de pago.

## Cupones de descuento por compras (CU33)

Migración: `backend/database/migrations/030_cupones_fidelidad.sql`.

**Regla:** cada 3 compras de un cliente en una empresa, el sistema le emite un cupón del **30%** para su siguiente
compra de cualquier producto en esa empresa. Vence a los 90 días y sirve una sola vez.

| Paso | Dónde |
|---|---|
| Contar compras (desde que arrancó el programa; una compra devuelta por completo no cuenta) | `services/cupones.py` → `compras_validas()` |
| Emitir el cupón al completar 3, 6, 9… compras y avisar al cliente (app y correo) | `cupones.registrar_compra()`, llamado desde `routers/sales.py` (en línea y POS) y `services/operaciones_offline.py` (sin conexión) |
| Ver cupones y cuánto falta | Web: Perfil del cliente (`features/customer/profile`). Móvil: Perfil → **Mis cupones** (`screens/cupones_screen.dart`). API `GET /api/cupones/mios` |
| Elegir el cupón al pagar | Web: checkout (`features/customer/checkout/purchase-modal.component.ts`) y POS (`features/pos/pos.component.ts`) con `shared/components/cupon-selector.component.ts`. Móvil: carrito (`screens/cart_modal.dart`). API `POST /api/cupones/cotizar` |
| Validar y aplicar | `cupones.cupon_para_compra()` (es del cliente, de esta empresa, disponible, no vencido; la fila se bloquea para que dos compras no lo usen) y `precio_con_descuento()` |
| Cobrar con el descuento | `routers/payments.py` (tarjeta) y `routers/sales.py` (venta). El precio con descuento queda en cada línea de la venta, así una devolución reembolsa lo que de verdad se pagó |
| Marcar usado | `cupones.marcar_usado()` |

Sin conexión las compras **suman** para el próximo cupón, pero **no se puede usar** un cupón (no hay cómo validarlo).
El conteo arranca el día en que se corre la migración: el historial anterior no genera cupones.

## Aviso de stock (CU34), envío de compras en línea (CU35) y asistente virtual (CU36)

Migración: `backend/database/migrations/031_aviso_stock_envio_pedidos.sql`.

| CU | Qué hace | Pantallas | Backend |
|---|---|---|---|
| CU34 Avisar cuando vuelve el stock de una talla | Si la talla está agotada, el detalle de la prenda muestra "Avisame cuando vuelva". Cuando vuelve a haber stock, el cliente recibe el aviso en la app y por correo | Web: detalle de la prenda (`features/customer/catalog/product-detail.component.ts`) y Perfil → Avisos de stock. Móvil: detalle de la prenda (`screens/try_on_screen.dart`) | `routers/avisos_stock.py`. El aviso lo dispara la **base**: trigger `trg_avisar_reposicion` sobre `Inventario`, venga de donde venga el stock (lote, traslado, devolución, reserva cancelada o una corrección manual) |
| CU35 Entregar a domicilio una compra en línea | Al pagar, el cliente elige "Retiro en sucursal" o "Envío a domicilio" (dirección, teléfono y horario). El cobro incluye el envío. El pedido aparece en Devoluciones → Recojos y entregas, donde el personal lo programa y marca la entrega | Web: checkout (`purchase-modal.component.ts`), Perfil → Mis pedidos a domicilio, personal en `return-delivery.component.ts`. Móvil: carrito (`screens/cart_modal.dart`) | `routers/sales.py` y `routers/payments.py` (cobro con envío) · `services/domicilio.py` → `registrar_pedido`, `costo_envio` (viaje de tipo "pedido") · `GET /api/pedidos/mios` |
| CU36 Conversar con el asistente virtual (texto o voz) | Chat con Gemini en la landing (visitante: solo catálogo), en la tienda del cliente (también sus compras y reservas) y en el portal del personal (datos del negocio y reportes en PDF, CSV o HTML). Se le habla con el micrófono y puede leer las respuestas en voz alta | Web: `shared/components/chat-widget.component.ts` (modos `publico`, `cliente`, `admin`). Móvil: `screens/chat_widget.dart` (micrófono con `speech_to_text` y lectura en voz con `flutter_tts`) | `routers/chat.py` · `services/chat_gemini.py` (cliente y visitante) · `services/chat_admin.py` (personal: usa el motor del CU26) · `services/exportacion.py` → `pdf`, `csv`, `html` |

**Reglas del CU35:** el envío cuesta lo que fija la política (el mismo delivery del CU9, por defecto Bs 15) y no lleva
el descuento del cupón. Solo vale para compras en línea: el POS no hace envíos.

**Reglas del CU36:**
- La landing no pide cuenta: tiene un límite de 20 preguntas cada 10 minutos por IP y solo consulta el catálogo.
- La voz la reconoce el navegador (Chrome y Edge). Si el navegador no puede y hay sesión, graba y transcribe el servidor con Gemini.
- El asistente del personal necesita el permiso `reporte.ia` y un plan con IA (CU25). La IA solo interpreta el pedido: el backend valida y consulta únicamente los datos de la empresa y, para un Encargado, de sus sucursales.
- Si no hay clave de Gemini, el asistente del personal igual arma reportes con el motor de reglas. El de clientes avisa que no está configurado.

## Modelo de dominio (sección 3.1) y diagrama de clases de la BD

Las 43 entidades (36 hasta la migración 026, más `PagoSuscripcion`, `ReporteSolicitud`, `ReporteExportacion` y `ModeloIA` de la 027, `EntregaDomicilio` de la 028, `Cupon` de la 030 y `AvisoStock` de la 031) están en `backend/app/models/__init__.py`. Arriba de cada clase dice su paquete:
busca, por ejemplo, `entidad Devolucion` o `Paquete "Posventa"`.
