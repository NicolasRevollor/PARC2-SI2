# 2. Análisis de robustez

Segundo paso de ICONIX: por cada caso de uso se identifican los objetos
**frontera** (lo que el actor toca), **control** (la lógica que coordina) y
**entidad** (lo que se persiste). Regla de la notación respetada en todos los
diagramas:

- actor ↔ frontera ✔
- frontera ↔ control ✔
- control ↔ entidad ✔
- control ↔ control ✔
- actor ↔ control ✘ · frontera ↔ frontera ✘ · frontera ↔ entidad ✘ · entidad ↔ entidad ✘

Cada objeto está anotado con el archivo real que lo implementa.

## CU28 — Registrar cambio de talla dentro de 24 h

<!-- CU28 -->
```plantuml
@startuml
skinparam shadowing false
left to right direction

actor "Cajero" as Cajero

boundary "Pantalla Devoluciones\n(returns.component.ts)" as B_Pantalla
boundary "Formulario de cambio\n(modal)" as B_Form

control "ReturnsService (web)\n(returns.service.ts)" as C_Front
control "Router de devoluciones\n(returns.py)" as C_Router
control "Validador de ventana 24 h\n(dentro_de_ventana)" as C_Ventana
control "Resolución de inventario\n(disponibilidad.py)" as C_Stock
control "Registro de bitácora\n(bitacora.py)" as C_Bitacora

entity "Venta / DetalleVenta" as E_Venta
entity "Producto (talla original)" as E_ProdOrig
entity "Producto (talla nueva)" as E_ProdNuevo
entity "Inventario" as E_Inv
entity "Movimiento" as E_Mov
entity "Devolución" as E_Devol
entity "Bitácora" as E_Bit

Cajero --> B_Pantalla : abre el módulo
B_Pantalla --> C_Front : solicita items elegibles
C_Front --> C_Router : GET /api/returns/elegibles
C_Router --> C_Ventana : filtra por horas restantes
C_Ventana --> E_Venta : lee fecha de venta
C_Router --> E_Devol : descuenta lo ya devuelto

Cajero --> B_Form : elige item, talla nueva y motivo
B_Form --> C_Front : confirma operación
C_Front --> C_Router : POST /api/returns
C_Router --> C_Ventana : revalida la ventana en el servidor
C_Router --> E_Venta : verifica que el producto pertenece a la venta
C_Router --> E_ProdOrig : lee talla original
C_Router --> E_ProdNuevo : lee talla de reemplazo
C_Router --> E_Inv : reingresa la prenda devuelta
C_Router --> C_Stock : busca stock de la talla nueva
C_Stock --> E_Inv : descuenta la prenda entregada
C_Router --> E_Mov : registra ambos movimientos
C_Router --> E_Devol : persiste el cambio con fecha, cliente y tallas
C_Router --> C_Bitacora : deja traza de la operación
C_Bitacora --> E_Bit
C_Router --> C_Front : devuelve la devolución creada
C_Front --> B_Pantalla : actualiza historial y elegibles
@enduml
```

**Caminos alternativos detectados en el análisis** (se convierten en
fragmentos `alt` en el diagrama de secuencia):

1. La ventana de 24 h ya venció → no se toca inventario.
2. La cantidad pedida supera lo devolvible → se rechaza.
3. No hay stock de la talla nueva → no se registra nada (transacción íntegra).

## CU29 — Analizar sucursales con IA

<!-- CU29 -->
```plantuml
@startuml
skinparam shadowing false
left to right direction

actor "Administrador" as Admin

boundary "Reportes · pestaña\nMulti-sucursal" as B_Rep

control "ReportsService (web)" as C_Front
control "Router de reportes\n(reports.py)" as C_Router
control "Guardia de plan\n(require_feature permiteIA)" as C_Plan
control "Cálculo de métricas\n(reportes_ia.metricas_por_sucursal)" as C_Metricas
control "Analizador IA\n(reportes_ia.analizar_sucursales)" as C_IA
control "Filtro defensivo\n(descarta sucursales inexistentes)" as C_Filtro

entity "Tenant / Plan" as E_Plan
entity "Sucursal" as E_Suc
entity "Inventario" as E_Inv
entity "Venta / DetalleVenta" as E_Venta

Admin --> B_Rep : elige período y pide análisis
B_Rep --> C_Front : solicita consolidado + IA
C_Front --> C_Router : GET /api/reports/ai-insights
C_Router --> C_Plan : ¿el plan incluye IA?
C_Plan --> E_Plan : lee flags del plan
C_Router --> C_Metricas : calcula consolidado
C_Metricas --> E_Suc
C_Metricas --> E_Inv
C_Metricas --> E_Venta
C_Router --> C_IA : envía SOLO métricas calculadas
C_IA --> C_Filtro : valida la respuesta del modelo
C_Filtro --> C_Router : hallazgos y transferencias válidas
C_Router --> C_Front : análisis + métricas de respaldo
C_Front --> B_Rep : muestra tabla y lectura de IA
@enduml
```

## CU30 — Operar sin conexión y sincronizar

<!-- CU30 -->
```plantuml
@startuml
skinparam shadowing false
left to right direction

actor "Cajero" as Cajero

boundary "Caja (POS)" as B_Pos
boundary "Indicador de conexión\n(header)" as B_Estado
boundary "Service Worker\n(sw.js)" as B_SW

control "OfflineSyncService" as C_Sync
control "LocalDbService" as C_LocalDb
control "Router de ventas\n(sales.py)" as C_Ventas

entity "Snapshot local\n(catálogo, sucursales, inventario)" as E_Snapshot
entity "Cola de operaciones\n(outbox)" as E_Outbox
entity "Venta (servidor)" as E_Venta

Cajero --> B_Pos : arma el ticket
B_Pos --> C_Sync : ¿hay conexión?
C_Sync --> C_LocalDb : lee estado y snapshot
C_LocalDb --> E_Snapshot
C_Sync --> C_LocalDb : encola la venta en efectivo
C_LocalDb --> E_Outbox
C_Sync --> B_Estado : informa "modo sin conexión" y pendientes

Cajero --> B_SW : reabre la app sin red
B_SW --> C_Sync : entrega el shell cacheado

C_Sync --> C_Ventas : al reconectar reenvía la cola (FIFO)
C_Ventas --> E_Venta : persiste la venta
C_Sync --> C_LocalDb : elimina la operación confirmada
C_Sync --> B_Estado : actualiza contador de pendientes
@enduml
```

## CU26 / CU27 — Multitenencia y cupos del plan

<!-- CU26-CU27 -->
```plantuml
@startuml
skinparam shadowing false
left to right direction

actor "Administrador" as Admin

boundary "Suscripción y Plan\n(subscription.component.ts)" as B_Sub
boundary "Alta de sucursal / usuario / producto" as B_Alta

control "TenantService (web)" as C_Front
control "Router de tenant\n(tenants.py)" as C_RouterTenant
control "Contexto de tenant\n(tenancy.contexto_actual)" as C_Ctx
control "Guardia de cupo\n(tenancy.exigir_cupo)" as C_Cupo
control "Routers de alta\n(branches / team / products)" as C_RouterAlta

entity "Tenant" as E_Tenant
entity "Plan" as E_Plan
entity "Sucursal" as E_Suc
entity "Usuario" as E_User
entity "Producto" as E_Prod

Admin --> B_Sub : abre su suscripción
B_Sub --> C_Front : pide contexto y planes
C_Front --> C_RouterTenant : GET /api/tenant/me
C_RouterTenant --> C_Ctx : resuelve tenant del JWT
C_Ctx --> E_Tenant
C_Ctx --> E_Plan
C_RouterTenant --> E_Suc : cuenta consumo
C_RouterTenant --> E_User : cuenta consumo
C_RouterTenant --> E_Prod : cuenta consumo

Admin --> B_Alta : crea un recurso
B_Alta --> C_RouterAlta : POST del recurso
C_RouterAlta --> C_Cupo : ¿queda cupo en el plan?
C_Cupo --> E_Plan : lee el tope
C_Cupo --> E_Suc : cuenta lo usado
C_RouterAlta --> E_Suc : inserta con idTenant

Admin --> B_Sub : solicita cambio de plan
B_Sub --> C_Front : PATCH plan
C_Front --> C_RouterTenant : valida consumo contra el plan destino
C_RouterTenant --> E_Tenant : actualiza idPlan
@enduml
```
