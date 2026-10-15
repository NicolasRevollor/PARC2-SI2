# 4. Arquitectura — vista lógica y vista física

Cuarto paso de ICONIX: dónde vive el código que implementa los casos de uso.
Se documentan las dos vistas pedidas, **lógica** (cómo está organizado) y
**física** (dónde se ejecuta), usando niveles C4 para la descomposición y MVC
para la organización interna.

Los diagramas usan PlantUML estándar (sin librerías externas) para que
rendericen sin conexión.

---

## 4.1 C4 — Nivel 1: Contexto

<!-- C4-L1 -->
```plantuml
@startuml
skinparam shadowing false
skinparam rectangle {
  BackgroundColor<<sistema>> #1f141a
  FontColor<<sistema>> white
  BackgroundColor<<externo>> #e8e8e8
}
left to right direction

actor "Cliente" as Cliente
actor "Personal de boutique\n(Cajero / Encargado)" as Staff
actor "Administrador" as Admin

rectangle "YouShop Collective\nPlataforma SaaS multitenant de\noperaciones de boutiques" <<sistema>> as Sistema

rectangle "Stripe\nCobros con tarjeta" <<externo>> as Stripe
rectangle "Google Gemini\nChat, recomendaciones y\nanálisis multi-sucursal" <<externo>> as Gemini
rectangle "Supabase Storage\nImágenes de producto" <<externo>> as Supabase
rectangle "Brevo\nCorreo transaccional" <<externo>> as Brevo

Cliente --> Sistema : explora, reserva y compra
Staff --> Sistema : vende, cambia tallas\ny mueve inventario
Admin --> Sistema : administra catálogo,\npersonal, planes y reportes

Sistema --> Stripe : crea y verifica\npagos
Sistema --> Gemini : envía métricas y\nconsultas
Sistema --> Supabase : sube imágenes
Sistema --> Brevo : envía recuperación\nde contraseña
@enduml
```

---

## 4.2 C4 — Nivel 2: Contenedores

<!-- C4-L2 -->
```plantuml
@startuml
skinparam shadowing false
skinparam componentStyle rectangle

actor "Cliente" as Cliente
actor "Personal / Administrador" as Staff

package "YouShop Collective" {
  component "Web PWA\nAngular 22 + Vite + Tailwind\n(instalable, opera sin conexión)" as Web
  component "App móvil\nFlutter" as Movil
  component "API REST\nFastAPI + SQLAlchemy async" as API
  database "PostgreSQL\nEsquema compartido con\ncolumna idTenant" as PG
  database "Base local del dispositivo\nIndexedDB: snapshot + cola" as Local
  component "Service Worker\nCache de shell y GETs" as SW
}

cloud "Servicios externos" {
  component "Stripe" as Stripe
  component "Gemini" as Gemini
  component "Supabase Storage" as Supabase
  component "Brevo" as Brevo
}

Cliente --> Web : HTTPS
Cliente --> Movil
Staff --> Web : HTTPS

Web <--> SW : intercepta pedidos GET
Web <--> Local : lee snapshot / encola operaciones
Web --> API : JSON + JWT (Bearer)
Movil --> API : JSON + JWT (Bearer)

API --> PG : SQL (asyncpg)
API --> Stripe : Payment Intents
API --> Gemini : salida estructurada
API --> Supabase : subida de imágenes
API --> Brevo : correo de recuperación

Local ..> API : reenvío de la cola al reconectar
@enduml
```

**Decisión de multitenencia.** De las tres estrategias posibles se eligió
**base de datos compartida + esquema compartido + columna discriminante
(`idTenant`)**:

| Estrategia | Aislamiento | Costo | Aplicable sobre el esquema ya en producción |
|------------|-------------|-------|----------------------------------------------|
| Base por tenant | Máximo | Alto | No (requiere migrar y multiplicar conexiones) |
| Esquema por tenant | Alto | Medio | Parcial (duplica DDL en cada alta) |
| **Columna `idTenant`** | **Lógico, en la consulta** | **Bajo** | **Sí: `DEFAULT 1` deja intactas todas las filas previas** |

Solo las entidades raíz llevan la columna (`Usuario`, `Sucursal`, `producto`,
`Proveedor`, `Temporada`, `Colecciones`); las hojas heredan el tenant por su
clave foránea, para no mantener la misma verdad en dos lugares.

---

## 4.3 C4 — Nivel 3: Componentes de la API

<!-- C4-L3 -->
```plantuml
@startuml
skinparam shadowing false
skinparam componentStyle rectangle

package "API REST (FastAPI)" {

  package "Routers (capa de entrada)" {
    component "auth.py" as R_Auth
    component "products.py / branches.py\nsuppliers.py / seasons.py" as R_Cat
    component "inventory.py / dispatches.py" as R_Inv
    component "sales.py / payments.py" as R_Ventas
    component "returns.py\n(CU28)" as R_Ret
    component "reports.py\n(CU25 + CU29)" as R_Rep
    component "tenants.py\n(CU26/CU27)" as R_Ten
  }

  package "Servicios (reglas de negocio)" {
    component "tenancy.py\ncontexto, flags y cupos" as S_Ten
    component "disponibilidad.py\nresolución de stock" as S_Disp
    component "reportes_ia.py\nmétricas + análisis" as S_IA
    component "recomendaciones_gemini.py" as S_Reco
    component "chat_gemini.py" as S_Chat
    component "pagos_stripe.py" as S_Pagos
    component "bitacora.py" as S_Bit
    component "usuarios.py\nclaims del JWT" as S_Usr
  }

  package "Modelo (SQLAlchemy)" {
    component "models/__init__.py\nTenant, Plan, Devolucion,\nProducto, Inventario, Venta…" as M
  }

  component "security.py\nJWT y permisos" as Sec
}

database "PostgreSQL" as PG

R_Auth --> S_Usr
R_Auth --> Sec
R_Cat --> S_Ten
R_Inv --> S_Disp
R_Ventas --> S_Disp
R_Ventas --> S_Pagos
R_Ventas --> S_Reco
R_Ret --> S_Disp
R_Ret --> S_Ten
R_Ret --> S_Bit
R_Rep --> S_IA
R_Rep --> S_Ten
R_Ten --> S_Ten
R_Ten --> S_Bit

S_Ten --> M
S_Disp --> M
S_IA --> M
S_Usr --> M
S_Bit --> M
M --> PG

note bottom of S_Ten
  Doble puerta de autorización:
  **permiso** (qué puede hacer el rol) con
  require_permiso, y **plan** (qué incluye la
  suscripción) con require_feature.
end note
@enduml
```

---

## 4.4 Vista lógica — organización MVC

El backend sigue un MVC por capas y el frontend un MVVM con *signals*, que es
la variante de MVC que impone Angular.

<!-- MVC -->
```plantuml
@startuml
skinparam shadowing false
skinparam componentStyle rectangle

package "Frontend (Angular)" {
  package "Vista" {
    component "Componentes standalone\nreturns / subscription /\nreports / pos / dashboard" as V_Comp
    component "Plantillas + Tailwind" as V_Tpl
  }
  package "Modelo de vista (controlador)" {
    component "Servicios con signals\ntenant / returns / reports /\noffline-sync / pwa" as V_Svc
  }
  package "Modelo" {
    component "core/models/index.ts\ninterfaces del contrato" as V_Model
    component "LocalDbService\n(IndexedDB)" as V_Local
  }
}

package "Backend (FastAPI)" {
  package "Controlador" {
    component "Routers\n(validación + orquestación)" as B_Router
  }
  package "Modelo" {
    component "Servicios de dominio" as B_Svc
    component "Modelos SQLAlchemy" as B_Model
    component "Esquemas Pydantic\n(contrato de entrada/salida)" as B_Schema
  }
  package "Vista" {
    component "Respuestas JSON\n+ CSV / PDF" as B_View
  }
}

V_Comp --> V_Svc : invoca acciones
V_Svc --> V_Comp : expone signals (render reactivo)
V_Tpl ..> V_Comp
V_Svc --> V_Model
V_Svc --> V_Local : snapshot y cola offline
V_Svc --> B_Router : HTTPS/JSON

B_Router --> B_Schema : valida
B_Router --> B_Svc : delega reglas
B_Svc --> B_Model
B_Router --> B_View : serializa
B_View --> V_Svc

note right of B_Svc
  Las reglas que no pueden depender del
  cliente viven acá: ventana de 24 h, cupos
  del plan, aislamiento por tenant y
  validación de la salida del modelo de IA.
end note
@enduml
```

---

## 4.5 Vista física — despliegue

<!-- DEPLOY -->
```plantuml
@startuml
skinparam shadowing false

node "Dispositivo del usuario" {
  artifact "Navegador / PWA instalada" as Browser
  database "IndexedDB\nyoushop-local" as IDB
  artifact "Service Worker\n(caches: shell, assets, api)" as SWn
  artifact "App Flutter\n(Android / iOS)" as Flutter
}

node "Vercel\nHosting estático" as Vercel {
  artifact "Bundle Angular\n(index.html, assets, sw.js,\nmanifest.webmanifest)" as Bundle
}

node "Render\nContenedor de aplicación" as Render {
  artifact "Uvicorn + FastAPI" as Uvicorn
}

node "Supabase" as SupabaseNode {
  database "PostgreSQL\n(pooler Supavisor)" as PGn
  artifact "Storage\nbucket primSI2" as Bucket
}

cloud "Stripe" as StripeN
cloud "Google Gemini" as GeminiN
cloud "Brevo" as BrevoN

Browser --> Bundle : descarga inicial (HTTPS)
Browser --> SWn : registra
SWn --> IDB
Browser --> Uvicorn : /api/** (HTTPS + JWT)
Flutter --> Uvicorn : /api/** (HTTPS + JWT)

Uvicorn --> PGn : asyncpg (TLS)
Uvicorn --> Bucket : HTTPS
Uvicorn --> StripeN : HTTPS
Uvicorn --> GeminiN : HTTPS
Uvicorn --> BrevoN : HTTPS

note right of SWn
  Sin conexión el shell sale del cache y los
  datos de negocio de IndexedDB; las
  mutaciones esperan en la cola local.
end note

note bottom of PGn
  El pooler en modo "transaction" no admite
  prepared statements: por eso el motor se
  configura con las cachés de statements
  apagadas (ver app/database.py).
end note
@enduml
```

---

## 4.6 Modelo de datos de las capacidades nuevas

<!-- ER -->
```plantuml
@startuml
skinparam shadowing false
hide circle
skinparam linetype ortho

entity "plan" {
  * idPlan : serial <<PK>>
  --
  codigo : varchar(30) <<unique>>
  nombre : varchar(60)
  precioMensual : numeric
  maxSucursales : int
  maxUsuarios : int
  maxProductos : int
  permiteIA : bool
  permiteOffline : bool
  permiteMultiSucursal : bool
  soloLocal : bool
}

entity "tenant" {
  * idTenant : serial <<PK>>
  --
  nombre : varchar(120)
  slug : varchar(60) <<unique>>
  estado : varchar(20)
  idPlan : int <<FK>>
}

entity "Usuario" {
  * idUser : int <<PK>>
  --
  idTenant : int <<FK>>
}

entity "Sucursal" {
  * codigoSucursal : int <<PK>>
  --
  idTenant : int <<FK>>
}

entity "producto" {
  * idProducto : int <<PK>>
  --
  talla : varchar(20)
  idTenant : int <<FK>>
}

entity "Venta" {
  * idVenta : int <<PK>>
  --
  fecha : timestamptz
  idCliente : int <<FK>>
}

entity "devolucion" {
  * idDevolucion : bigserial <<PK>>
  --
  tipo : varchar(20)
  cantidad : int
  fecha : timestamptz
  fechaVenta : timestamptz
  tallaOriginal : varchar(20)
  tallaNueva : varchar(20)
  medidaOriginal : varchar(60)
  medidaNueva : varchar(60)
  montoDevuelto : numeric
  idVenta : int <<FK>>
  idProducto : int <<FK>>
  idProductoNuevo : int <<FK>>
  idCliente : int <<FK>>
  codigoSucursal : int <<FK>>
  idUsuario : int <<FK>>
  idTenant : int <<FK>>
}

plan ||--o{ tenant
tenant ||--o{ Usuario
tenant ||--o{ Sucursal
tenant ||--o{ producto
tenant ||--o{ devolucion
Venta ||--o{ devolucion
producto ||--o{ devolucion
Sucursal ||--o{ devolucion
Usuario ||--o{ devolucion

note right of devolucion
  "fechaVenta" es un snapshot inmutable de
  Venta.fecha: la ventana de 24 h queda
  auditada en la propia fila y el historial
  es reconstruible sin releer la venta.
end note
@enduml
```
