# Documentación ICONIX — YouShop Collective

Esta carpeta contiene el modelado del sistema siguiendo **ICONIX**, que avanza
en cuatro pasos encadenados: cada artefacto se deriva del anterior y ninguno
inventa elementos que no existan en el código.

| # | Artefacto | Archivo | Pregunta que responde |
|---|-----------|---------|------------------------|
| 1 | Modelo de casos de uso | [01-casos-de-uso.md](01-casos-de-uso.md) | ¿Quién usa el sistema y para qué? |
| 2 | Análisis de robustez | [02-robustez.md](02-robustez.md) | ¿Qué objetos (frontera, control, entidad) participan en cada caso? |
| 3 | Diagramas de secuencia | [03-secuencia.md](03-secuencia.md) | ¿En qué orden colaboran, incluyendo los caminos alternativos? |
| 4 | Arquitectura (C4 + MVC) | [04-arquitectura.md](04-arquitectura.md) | ¿Cómo se despliega y se organiza el código que lo implementa? |

Los diagramas de secuencia **ya implementados en la fase anterior** (compra
online, pago con Stripe, POS, comprobante, inventario automático) viven en
[`../../web/diagramSp2Sec.md`](../../web/diagramSp2Sec.md) y no se duplican
acá: este directorio cubre el modelo completo de casos de uso y el detalle de
las capacidades nuevas.

## Trazabilidad con el código

Cada caso de uso nuevo indica los archivos que lo implementan, para que el
diagrama no quede desincronizado del sistema:

| CU | Capacidad | Backend | Frontend |
|----|-----------|---------|----------|
| CU26 | Multitenencia | `app/services/tenancy.py`, migración 014 | `core/services/tenant.service.ts` |
| CU27 | Planes de suscripción | `app/routers/tenants.py` | `features/subscription/` |
| CU28 | Devolución / cambio de talla (24 h) | `app/routers/returns.py`, migración 015 | `features/returns/` |
| CU29 | Reporte multi-sucursal con IA | `app/services/reportes_ia.py`, `app/routers/reports.py` | `features/reports/` (pestaña Multi-sucursal) |
| CU30 | PWA, modo offline y base local | — (sin backend propio) | `public/sw.js`, `core/services/local-db.service.ts`, `core/services/offline-sync.service.ts`, `core/services/pwa.service.ts` |

## Cómo renderizar los diagramas

Los diagramas están en **PlantUML** embebido en Markdown, igual que
`web/diagramSp2Sec.md`:

- VS Code: extensión *PlantUML* (`Alt+D` para previsualizar).
- Web: pegar el bloque en <https://www.plantuml.com/plantuml>.
- CLI: `java -jar plantuml.jar docs/iconix/*.md`.
