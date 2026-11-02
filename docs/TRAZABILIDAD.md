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

## Modelo de dominio (sección 3.1) y diagrama de clases de la BD

Las 32 entidades están en `backend/app/models/__init__.py`. Arriba de cada clase dice su paquete:
busca, por ejemplo, `entidad Devolucion` o `Paquete "Posventa"`.
