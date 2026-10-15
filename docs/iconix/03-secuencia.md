# 3. Diagramas de secuencia

Tercer paso de ICONIX: cada objeto del análisis de robustez se convierte en
una línea de vida, y los caminos alternativos detectados ahí se expresan con
**fragmentos combinados** (`alt`, `opt`, `loop`, `break`, `par`, `critical`,
`ref`).

Los diagramas de la fase anterior (compra online, Stripe, POS, comprobante)
están en [`../../web/diagramSp2Sec.md`](../../web/diagramSp2Sec.md).

---

## CU28 — Cambio de talla dentro de la ventana de 24 h

Fragmentos usados: `alt` (ventana vencida / cantidad inválida / sin stock),
`opt` (motivo), `critical` (la doble corrección de stock es atómica).

<!-- CU28 -->
```plantuml
@startuml
skinparam shadowing false
autonumber

actor Cajero
boundary "Pantalla Devoluciones" as UI
control "ReturnsService" as Front
participant "API /api/returns" as API
control "Validador 24 h" as Ventana
database "Base de datos" as DB

Cajero -> UI: Abrir módulo de devoluciones
UI -> Front: Pedir items elegibles
Front -> API: GET /api/returns/elegibles
API -> DB: Ventas de las últimas 24 h + devoluciones previas
DB --> API: Items con horas restantes y cantidad devolvible
API --> Front: Lista de elegibles
Front --> UI: Poblar selector

Cajero -> UI: Elegir item, tipo de operación y cantidad

opt El operador registra un motivo
  Cajero -> UI: Escribir motivo del cambio
end

UI -> Front: Confirmar operación
Front -> API: POST /api/returns

API -> Ventana: ¿La venta sigue dentro de las 24 h?
Ventana -> DB: Leer Venta.fecha
DB --> Ventana: Fecha de la venta

alt La ventana de 24 h ya venció
  Ventana --> API: Fuera de plazo
  API --> Front: 409 con las horas de exceso
  Front --> UI: Mostrar rechazo
  UI --> Cajero: La operación no se registra
else Dentro de plazo
  Ventana --> API: Elegible
  API -> DB: Verificar que el producto pertenece a la venta

  alt Cantidad mayor a la devolvible
    DB --> API: Vendidas y ya devueltas
    API --> Front: 400 con el saldo real
    Front --> UI: Mostrar rechazo
  else Cantidad válida

    critical Transacción única: reingreso y entrega
      API -> DB: Reingresar la prenda original al inventario
      API -> DB: Registrar Movimiento de devolución

      alt Tipo = cambio de talla
        API -> DB: Buscar stock de la talla nueva

        alt Sin stock de la talla nueva
          DB --> API: Ninguna sucursal cubre la cantidad
          API --> Front: 409 — la transacción se revierte completa
          Front --> UI: Mostrar rechazo
        else Hay stock
          API -> DB: Descontar la prenda de la talla nueva
          API -> DB: Registrar Movimiento de cambio
        end

      else Tipo = devolución
        API -> DB: Calcular monto a devolver
      else Tipo = cambio de medida
        note right of API
          Ajuste de confección sobre la misma
          prenda: no mueve stock, solo registra
          medida original y medida nueva.
        end note
      end

      API -> DB: Persistir Devolución (fecha, cliente, tallas, usuario)
      API -> DB: Registrar en Bitácora
    end

    DB --> API: Commit
    API --> Front: 201 con la devolución creada
    Front --> UI: Actualizar historial y recargar elegibles
    UI --> Cajero: Confirmación con talla anterior → talla nueva
  end
end
@enduml
```

---

## CU29 — Reporte multi-sucursal con lectura de IA

Fragmentos usados: `alt` (plan sin IA / motor no configurado / respuesta
inválida), `par` (métricas y detalle se calculan en paralelo), `loop`
(validación de cada sugerencia), `ref` (reutiliza el consolidado).

<!-- CU29 -->
```plantuml
@startuml
skinparam shadowing false
autonumber

actor Administrador as Admin
boundary "Reportes · Multi-sucursal" as UI
control "ReportsService" as Front
participant "API /api/reports" as API
control "Guardia de plan" as Plan
control "Servicio de análisis" as Analisis
participant "Motor de IA" as IA
database "Base de datos" as DB

Admin -> UI: Elegir período
UI -> Front: Pedir consolidado
Front -> API: GET /api/reports/branches
API -> DB: Agregar ventas y stock por sucursal del tenant
DB --> API: Métricas por sucursal
API --> Front: Consolidado
Front --> UI: Tabla por sucursal

Admin -> UI: Presionar "Analizar con IA"
UI -> Front: Pedir análisis
Front -> API: GET /api/reports/ai-insights
API -> Plan: ¿El plan incluye IA?
Plan -> DB: Leer flags del plan del tenant
DB --> Plan: permiteIA

alt El plan no incluye IA
  Plan --> API: Denegado
  API --> Front: 402 Payment Required
  Front --> UI: Sugerir mejora de plan
  UI --> Admin: El consolidado sigue disponible
else El plan incluye IA
  Plan --> API: Habilitado

  ref over API, DB
    Mismo cálculo de métricas del consolidado
  end ref

  par Preparación del insumo
    API -> DB: Métricas por sucursal
  and
    API -> DB: Stock por producto y sucursal (muestra acotada)
  end

  alt Sin sucursales cargadas
    DB --> API: Conjunto vacío
    API --> Front: 400 — nada que analizar
  else Hay datos
    API -> Analisis: Analizar (solo métricas ya calculadas)
    Analisis -> IA: Prompt con salida estructurada

    alt El motor no está configurado
      IA --> Analisis: Falta credencial
      Analisis --> API: GeminiNoConfigurado
      API --> Front: 503
      Front --> UI: Avisar que falta configurar el motor
    else El motor responde
      IA --> Analisis: Resumen, hallazgos, transferencias y alertas

      alt La respuesta no es analizable
        Analisis --> API: AnalisisNoDisponible
        API --> Front: 503
      else Respuesta válida
        loop Por cada sugerencia devuelta
          Analisis -> Analisis: ¿La sucursal existe en los datos enviados?
          note right of Analisis
            Defensa contra alucinaciones: se descarta
            toda sugerencia que mencione sucursales
            fuera del conjunto analizado.
          end note
        end
        Analisis --> API: Análisis depurado
        API --> Front: 200 con análisis + métricas de respaldo
        Front --> UI: Mostrar lectura junto a la tabla
        UI --> Admin: Diagnóstico y transferencias sugeridas
      end
    end
  end
end
@enduml
```

---

## CU30 — Venta sin conexión y sincronización posterior

Fragmentos usados: `alt` (con/sin conexión, error definitivo vs. transitorio),
`loop` (vaciado de la cola), `break` (corte por error de red), `opt`
(refresco del snapshot).

<!-- CU30 -->
```plantuml
@startuml
skinparam shadowing false
autonumber

actor Cajero
boundary "Caja (POS)" as POS
control "OfflineSyncService" as Sync
control "LocalDbService" as LocalDb
database "Base local\n(IndexedDB)" as Local
participant "API" as API
database "Base central" as DB

== Operación sin conexión ==

Cajero -> POS: Confirmar venta en efectivo
POS -> Sync: ¿Hay conexión?

alt Sin conexión
  Sync -> LocalDb: Encolar venta (monto + items + cliente + sucursal)
  LocalDb -> Local: Guardar en la cola
  Local --> LocalDb: Operación encolada
  LocalDb --> Sync: Confirmado
  Sync --> POS: Aviso "guardada sin conexión"
  POS --> Cajero: Ticket cerrado, la prenda se entrega
  note right of Sync
    No se crea el método de pago todavía:
    el idMetPago lo genera el servidor, así
    que la operación queda compuesta
    (pago + venta) para el reenvío.
  end note
else Con conexión
  Sync --> POS: Continuar flujo normal
  POS -> API: POST /api/payment-methods y POST /api/sales
  API -> DB: Persistir venta
end

== Vuelve la conexión ==

Sync -> Sync: Evento "online"
Sync -> LocalDb: Leer cola ordenada por antigüedad
LocalDb -> Local: Consultar pendientes
Local --> LocalDb: Operaciones FIFO
LocalDb --> Sync: Cola

loop Por cada operación pendiente
  alt Venta en efectivo compuesta
    Sync -> API: POST /api/payment-methods (monto)
    API -> DB: Crear método de pago
    DB --> API: idMetPago
    API --> Sync: Método creado
    Sync -> API: POST /api/sales con ese idMetPago
  else Operación simple
    Sync -> API: POST al endpoint correspondiente
  end

  alt El servidor acepta
    API -> DB: Persistir y descontar stock
    DB --> API: Commit
    API --> Sync: 201
    Sync -> LocalDb: Eliminar de la cola
  else Rechazo definitivo (4xx no recuperable)
    API --> Sync: Error de validación
    Sync -> LocalDb: Marcar con el error y conservar
    note right of Sync
      No se reintenta en bucle: reenviar una
      venta inválida no la vuelve válida.
      Queda visible para revisión manual.
    end note
  else Error de red o sesión vencida
    API --> Sync: Sin respuesta / 401
    Sync -> LocalDb: Registrar intento fallido
    break Se corta el vaciado
      Sync --> Sync: Reintentar en la próxima reconexión
    end
  end
end

opt Hubo operaciones confirmadas
  Sync -> API: Descargar snapshot actualizado
  API --> Sync: Catálogo, sucursales e inventario
  Sync -> LocalDb: Reemplazar snapshot local
  LocalDb -> Local: Guardar
end

Sync --> POS: Actualizar contador de pendientes
POS --> Cajero: "Sincronización completa"
@enduml
```

---

## CU27 — Alta de recurso con verificación de cupo del plan

Fragmentos usados: `alt` (cupo disponible / agotado / plan ilimitado), `opt`
(mejora de plan desde el aviso).

<!-- CU27 -->
```plantuml
@startuml
skinparam shadowing false
autonumber

actor Administrador as Admin
boundary "Alta de sucursal" as UI
participant "API /api/branches" as API
control "Guardia de cupo" as Cupo
database "Base de datos" as DB

Admin -> UI: Completar datos de la nueva sucursal
UI -> API: POST /api/branches
API -> Cupo: Verificar cupo de sucursales
Cupo -> DB: Leer plan del tenant
DB --> Cupo: maxSucursales
Cupo -> DB: Contar sucursales del tenant
DB --> Cupo: Cantidad actual

alt El plan es ilimitado (tope = -1)
  Cupo --> API: Sin restricción
  API -> DB: Insertar sucursal con idTenant
  DB --> API: Sucursal creada
  API --> UI: 201
else Cupo disponible
  Cupo --> API: Habilitado
  API -> DB: Validar ciudad e insertar sucursal
  DB --> API: Sucursal creada
  API --> UI: 201
  UI --> Admin: Sucursal operativa
else Cupo agotado
  Cupo --> API: Tope alcanzado
  API --> UI: 402 con el detalle (usadas / permitidas)
  UI --> Admin: Aviso de mejora de plan

  opt El administrador decide mejorar el plan
    Admin -> UI: Elegir plan superior
    UI -> API: PATCH /api/tenant/plan
    API -> DB: Actualizar idPlan
    DB --> API: Plan actualizado
    API --> UI: Nuevo contexto con límites ampliados
    UI --> Admin: Reintentar el alta
  end
end
@enduml
```
