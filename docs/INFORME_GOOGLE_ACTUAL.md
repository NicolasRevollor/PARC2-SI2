# Informe original: lectura en Markdown

Fuente: [Google Docs](https://docs.google.com/document/d/1j5LivBwIz-WoMbSy50Dwhx-kBtKa9pH7FNxTS-Uj4bY/edit).

Exportado el 8 de noviembre de 2026. Se conserva el texto y las tablas; se omiten las 140 imagenes y diagramas de la exportacion. Esta es una copia de lectura del documento original; la propuesta de los puntos 5.4 a 5.6 se entrega por separado.

---

UNIVERSIDAD AUTÓNOMA GABRIEL RENÉ MORENO FACULTAD DE INGENIERÍA Y CIENCIAS DE LA COMPUTACIÓN Y TELECOMUNICACIONES

GRUPO #1

Plataforma SaaS multiempresa con operación sin conexión e inteligencia artificial para la gestión comercial y posventa de tiendas de moda

Integrantes:

Adalid Nicolas Revollo Roman                            220002290

Nishizawa Cuellar Anju Clara                          223045551

Docente:

MSC. Garzón Cuellar Angélica

Materia:

Sistemas de Información II

Santa Cruz de la Sierra, Gestión 2-2026

Índice

[Capítulo I        1](#h.cgnw2aofcul6)

[1.1 Introducción        1](#h.s18e7rr6c3lt)

[1.2. Planteamiento del problema        1](#h.zgouj2yvqni2)

[1.3 Objetivos del proyecto        2](#h.85lzhxt2gv6m)

[1.3.1 Objetivo general        2](#h.m2s6enu3sa7g)

[1.3.2 Objetivos específicos        2](#h.jita8astadw5)

[1.4 Justificación        3](#h.sxczmeryn7yp)

[1.5 Alcance        3](#h.dd3szbeehcbm)

[1.5.2 Limitaciones        4](#h.elqgof589t72)

[1.6. Metodología de desarrollo ICONIX        5](#h.k59exrter1w3)

[CAPÍTULO II. ANÁLISIS DE REQUISITOS        6](#h.9kqqzdyq6bez)

[2.1. Descripción del sistema propuesto        6](#h.5gtxygwqke3g)

[2.2. Identificación de actores        6](#h.ah3dq7d2lsgf)

[2.3. Requisitos funcionales y no funcionales        7](#h.d3zf1b36v23a)

[2.4. Reglas de negocio        11](#h.sstsan1xttwv)

[2.5. Diagrama UML de casos de uso        12](#h.cw8pyq59s6ha)

[2.6. Especificación de casos de uso        13](#h.iqmjh4jiawoq)

[2.6.1 Lista de casos de usos        13](#h.3b7ofuemlsof)

[2.6.2 Casos de uso        17](#h.o1gnxoftrg6a)

[CAPÍTULO III. ANÁLISIS Y DISEÑO CON ICONIX        84](#h.ctojvolnojvz)

[3.1. Modelo de dominio        84](#h.mtaxg83l06rj)

[3.2. Diagramas de robustez        85](#h.q51scrf9qgh)

[3.3. Diagramas de secuencia UML        112](#h.spjr7d2d1a8d)

[3.4. Diagrama de clases UML        124](#h.grkb7igoc3p5)

[3.5. Diseño de la base de datos        133](#h.3xo2n2hrw2ut)

[3.6. Diseño de interfaces de usuario        134](#h.wfo2beuffs00)

[CAPÍTULO IV. DESARROLLO E IMPLEMENTACIÓN        146](#h.gg0ulfinttaq)

[4.1. Herramientas y tecnologías utilizadas        146](#h.a60f5rvhiwuq)

[4.2. Diseño de la arquitectura del sistema        146](#h.wzibtzdkuh42)

[4.2.1 Diseño lógico        146](#h.m4cnabuhaqn2)

[4.2.2 Diseño físico        147](#h.6a1xd7c0dv99)

[4.2.3 Diseño de redes        148](#h.l22r0kslncmq)

[4.3. Implementación de la base de datos        149](#h.f0cjrdhd5bmm)

[4.4. Desarrollo de los módulos del sistema        183](#h.nflm2sbfhw2i)

[4.5. Integración de componentes        183](#h.wm8wlyjbwe57)

[CAPÍTULO V. PRUEBAS Y RESULTADOS        184](#h.eqokhoa60ql6)

[5.1 Plan de pruebas        184](#h.fygastxxbw0l)

[5.2. Pruebas funcionales        184](#h.848c4p52nfgu)

[5.3. Pruebas de integración        193](#h.vyki7gn8axx4)

[5.4. Corrección de errores        198](#h.yto80174a0nd)

[5.5. Resultados de las pruebas        199](#h.75obq2pz16de)

[5.6. Casos de prueba        200](#h.h4y9filhhpag)

[CAPÍTULO VI. CONCLUSIONES Y RECOMENDACIONES        206](#h.hu43ikn0mukg)

[6.1. Conclusiones        206](#h.byb77f7m4n71)

[6.2. Recomendaciones        206](#h.7ldbdtx54mkz)

[7. BIBLIOGRAFÍA        207](#h.472aez2fjkow)

[8. ANEXOS        208](#h.6yzpbbbuvpy8)

# Capítulo I

## 1.1 Introducción

En la actualidad, las empresas comerciales necesitan administrar grandes volúmenes de información de forma segura y sin interrupciones. Sin embargo, la mayoría de los sistemas de gestión dependen de una conexión permanente a Internet. En las tiendas físicas, una caída de la red detiene la atención en caja, retrasa las ventas y puede provocar la pérdida de datos.

Para resolver este problema, el presente proyecto evoluciona la plataforma desarrollada en el primer parcial hacia YouShop Collective, una solución omnicanal construida bajo el enfoque Offline-First. La aplicación web en Angular se convierte en una Aplicación Web Progresiva (PWA) que guarda la información en IndexedDB; el almacenamiento local con SQLite en la aplicación móvil Flutter está planificado para una siguiente entrega. Así, el catálogo puede consultarse y las ventas de contado y las reservas pueden registrarse aunque no haya conexión. Cuando la red se restablece, un proceso de sincronización envía las operaciones pendientes al servidor, evita registros duplicados y permite resolver las diferencias de stock o de precio.

En el ámbito del negocio, la plataforma está orientada a tiendas de ropa, donde una de las principales causas de devolución es la diferencia entre la talla nominal y las medidas reales de cada prenda. Por ello, el sistema registra las medidas en centímetros de cada pieza y automatiza los cambios y las devoluciones: valida el plazo de 24 horas desde la entrega, registra la inspección de la prenda, cobra o reembolsa la diferencia de precio cuando el cliente cambia a otra talla o producto, y actualiza el inventario.

En cuanto a su comercialización, el sistema adopta el modelo de Software como Servicio (SaaS) con arquitectura multitenant. Varias empresas comparten la misma infraestructura y la misma base de datos PostgreSQL, pero la información de cada una permanece aislada mediante su identificador de empresa (tenant). El acceso a las funcionalidades se regula según el plan de suscripción contratado. Además, la plataforma incorpora un módulo de inteligencia artificial que genera reportes a partir de solicitudes en lenguaje natural, escritas o por voz, e integra modelos de Machine Learning para predecir la demanda, agrupar clientes y detectar anomalías.

Finalmente, el desarrollo se guía por la metodología ICONIX, un proceso centrado en casos de uso que utiliza los diagramas de robustez como puente entre el análisis y el diseño. Esto asegura que los requerimientos, los modelos UML 2.5+ y el código implementado se mantengan coherentes.

## 1.2. Planteamiento del problema

Las empresas dedicadas a la comercialización de prendas de vestir enfrentan limitaciones técnicas y operativas estructurales en sus soluciones informáticas tradicionales:

1. Pérdida de Operatividad por Fallas de Red: La caída de conectividad en tiendas físicas paraliza la atención en mostrador, impidiendo procesar ventas de contado y reservas.
2. Altos Costos de Infraestructura Individual: Las pequeñas y medianas boutiques carecen de capital para desplegar infraestructura propia, requiriendo plataformas SaaS que aíslen su información de forma segura a costos accesibles.
3. Inconsistencia de Inventario Distribuido: El registro de operaciones locales en ausencia de red introduce riesgos de colisión de stock y duplicación de transacciones durante la sincronización posterior.
4. Dificultad en la Toma de Decisiones: Los sistemas tradicionales ofrecen reportes estáticos rígidos que no permiten consultar información entre múltiples sucursales utilizando lenguaje natural o analítica predictiva.

## 1.3 Objetivos del proyecto

### 1.3.1 Objetivo general

Desarrollo de una plataforma SaaS multitenant de comercio electrónico impulsada por inteligencia artificial para el sector de la moda.

### 1.3.2 Objetivos específicos

* Aplicar la metodología ICONIX al modelado de los nuevos requerimientos, de modo que cada caso de uso tenga su diagrama de robustez, su diagrama de secuencia y su código correspondiente.
* Adaptar la base de datos PostgreSQL a un esquema compartido por varias empresas, identificando cada registro con su empresa para que ninguna pueda ver ni modificar la información de otra.
* Desarrollar la administración de empresas clientes y de sus planes de suscripción, controlando desde el servidor la cantidad de sucursales, usuarios y productos, y las funciones habilitadas en cada plan.
* Convertir la aplicación web en Angular en una aplicación instalable que siga atendiendo consultas de catálogo, ventas de contado y reservas cuando la tienda pierde la conexión, guardando los datos en IndexedDB.
* Habilitar en la aplicación móvil Flutter el almacenamiento local con SQLite del catálogo, los clientes y las operaciones realizadas sin conexión, sin perder datos al cerrar la aplicación.
* Diseñar un proceso de sincronización que envíe las operaciones pendientes al recuperar la conexión, evite registros duplicados y permita resolver los casos en que el stock o los precios locales no coinciden con los del servidor.
* Automatizar la gestión de cambios y devoluciones de prendas: validación de plazos, inspección del estado de la prenda, cobro o reembolso de las diferencias de precio y actualización del inventario.
* Construir un módulo de inteligencia artificial que interprete solicitudes de reportes escritas o habladas y genere tablas, gráficos y archivos PDF o Excel con los datos reales de cada empresa, sin acceso libre de la IA a la base de datos.
* Entrenar y evaluar modelos de aprendizaje supervisado y no supervisado, con datos reales y sintéticos, para predecir la demanda, agrupar clientes y detectar anomalías, y mostrar sus resultados en un dashboard.
* Verificar las reglas críticas del sistema con pruebas automatizadas, funcionales y de integración: aislamiento entre empresas, idempotencia de la sincronización y consistencia del inventario.

## 1.4 Justificación

La evolución de YouShop se justifica técnicamente por la necesidad de migrar hacia arquitecturas distribuidas de alta disponibilidad (Offline-First), donde la resiliencia en el punto de venta primar sobre la dependencia constante de la nube. Económicamente, la adopción del modelo SaaS Multitenant maximiza el aprovechamiento de recursos de infraestructura y permite monetizar el software mediante planes de suscripción escalables. Operativamente, la integración de IA generativa simplifica el acceso a métricas de negocio para usuarios no técnicos, mientras que el marco metodológico ICONIX asegura un costo de mantenimiento bajo gracias a la trazabilidad entre el código y la documentación UML 2.5+.

## 1.5 Alcance

* Arquitectura SaaS multitenant con base de datos compartida y aislamiento lógico por empresa mediante la columna idTenant.
* Aplicación Web progresiva (PWA) desarrollada en Angular 22 con TypeScript, compilada con Vite y estilizada con Tailwind CSS, con RxJS para la programación reactiva.
* Instalación de la PWA y funcionamiento sin conexión mediante Service Worker y Web App Manifest, con persistencia local en IndexedDB.
* Aplicación Móvil multiplataforma desarrollada en Flutter (Dart), con persistencia local en SQLite (sqflite), detección de conectividad (connectivity\_plus), almacenamiento seguro de credenciales (flutter\_secure\_storage) y manejo de estado con Provider.
* Servidor Backend REST API en Python con FastAPI, ejecutado sobre el servidor ASGI Uvicorn.
* Acceso a datos asíncrono con el ORM SQLAlchemy 2 y el controlador asyncpg, y validación de datos con Pydantic.
* Base de Datos Central PostgreSQL, con scripts de migración SQL aditivos y versionados.
* Autenticación basada en tokens JWT (python-jose) y cifrado de contraseñas con bcrypt.
* Motor de sincronización diferida con soporte de idempotencia mediante identificadores UUID y log de observabilidad.
* Integración con la pasarela de pagos Stripe (SDK de Python, Stripe.js en la web y flutter\_stripe en el móvil).
* Integración con el modelo de inteligencia artificial Google Gemini (SDK google-genai) para el procesamiento de lenguaje natural por texto y voz.
* Módulo de Machine Learning en Python con modelos supervisados y no supervisados.
* Generación de documentos PDF con ReportLab y de hojas de cálculo Excel con openpyxl.
* Envío de correos electrónicos transaccionales a través de la API de Brevo.
* Almacenamiento de archivos (imágenes y respaldos) en Supabase Storage.
* Visión por computadora en el móvil con la cámara del dispositivo y Google ML Kit (detección de pose).
* Despliegue en la nube: frontend Web en Vercel, backend en Render y base de datos PostgreSQL en Supabase.
* Entorno de desarrollo local con Docker (Docker Compose y PostgreSQL 17).
* Pruebas automatizadas del backend con pytest y httpx.
* Control de versiones con Git y repositorio en GitHub.

## 1.5.2 Limitaciones

* Para el prototipo académico no existe cobro real de los planes: una suscripción activa se renueva automáticamente cada mes y la contratación y el cambio de plan se registran de forma administrativa.
* Las ventas offline están restringidas a la modalidad de contado de forma obligatoria.

## 1.6. Metodología de desarrollo ICONIX

El proyecto adopta la metodología ICONIX, un proceso simplificado y guiado por Casos de Uso que utiliza aproximadamente el 20% de los diagramas del Lenguaje de Modelado Unificado (UML) para cubrir el 80% del análisis y diseño. ICONIX vincula de forma explícita los requisitos con la implementación mediante cuatro fases principales:

1. Análisis de Requisitos: Modelo de Dominio inicial, Prototipado/Storyboard de GUI, Diagrama de Casos de Uso organizado en paquetes y Matriz de Trazabilidad.
2. Análisis y Diseño Preliminar: Especificación de Fichas de Casos de Uso y Diagramas de Robustez (Boundary, Controller, Entity) para identificar objetos de diseño y refinar el modelo de clases.
3. Diseño: Diagramas de Secuencia (con fragmentos combinados alt, loop, opt), Diagrama de Clases refinado y diseño estático de Base de Datos.
4. Implementación: Arquitectura de componentes/despliegue, desarrollo de código fuente, sincronización y ejecución del plan de pruebas.

# 

# 

# CAPÍTULO II. ANÁLISIS DE REQUISITOS

## 2.1. Descripción del sistema propuesto

El sistema propuesto es la evolución SaaS de la plataforma YouShop. Funciona sobre una arquitectura desacoplada donde el servidor central en FastAPI gestiona las reglas de negocio y almacena los datos delimitados por empresa (tenant\_id) en PostgreSQL. Los clientes web (Angular PWA) y móviles (Flutter) operan bajo el esquema Offline-First: al perder conectividad a red, las consultas de catálogo, ventas de contado y reservas se registran en bases de datos locales temporales (IndexedDB / SQLite). Al reconectarse, un servicio de sincronización envía las operaciones en cola procesando confirmaciones y rechazando duplicados. La plataforma incluye un Módulo de IA para la generación interactiva de reportes empresariales multisucursal mediante lenguaje natural.

## 2.2. Identificación de actores

|  |  |  |
| --- | --- | --- |
| ID | Actor | Descripción |
| A1 | Cliente | Consulta el catálogo, realiza compras y reservas, y solicita cambios o devoluciones desde la tienda en línea. |
| A2 | Administrador de plataforma | Administra la plataforma SaaS: registra empresas, configura planes y controla el estado de las suscripciones. |
| A3 | Administrador de empresa | Administra su empresa (tenant): sucursales, personal, políticas de posventa, reportes con IA y modelos analíticos. |
| A4 | Encargado de sucursal | Supervisa la operación de su sucursal: inspecciona devoluciones, autoriza montos, resuelve conflictos y consulta reportes. |
| A5 | Empleado (rol "Cajero" en el sistema) | Atiende en la sucursal: registra ventas, reservas, cambios y devoluciones, con o sin conexión, y opera la caja. |
| A6 | Proveedor | Recibe los reclamos por prendas con defecto de fábrica (CU10). No interactúa con el sistema. |
| A7 | Visitantes | Clientes no registrados que quieren revisar la página web |

## 2.3. Requisitos funcionales y no funcionales

Requisitos Funcionales (RF)

Módulo de devoluciones y cambios

* RF01 (Registro de solicitudes de devolución o cambio): El sistema permitirá al personal de sucursal y al cliente desde la tienda en línea registrar una solicitud sobre una venta pagada. Antes de aceptarla, validará el plazo desde la entrega, las cantidades ya devueltas, la categoría de la prenda y el número máximo de cambios.
* RF02 (Inspección de prendas devueltas): El encargado de sucursal registrará el estado de la prenda (apta, defectuosa o deteriorada) y decidirá si la solicitud se aprueba o se rechaza.
* RF03 (Procesamiento de cambios): El sistema procesará cambios por otra talla, color o medida del mismo modelo, o por un producto diferente. Calculará automáticamente la diferencia de precio que hay que cobrar o devolver al cliente.

* RF04 (Reembolsos y nota de devolución): El sistema devolverá el dinero por el medio de pago original (efectivo, QR/transferencia o tarjeta) y entregará al cliente una nota de devolución con el monto, el medio y el estado del reembolso. Todo saldo a favor de un cambio se devuelve en dinero.

* RF05 (Cambio sin stock disponible): Cuando la variante solicitada no tenga existencias, el sistema ofrecerá buscarla en otra sucursal, reservarla o elegir otra alternativa.
* RF06 (Política de posventa por empresa): Cada empresa podrá configurar su propia política de devoluciones: plazo (24 horas por defecto), categorías que no admiten devolución y máximo de cambios por prenda.
* RF07 (Inventario por devolución): Toda devolución o cambio aprobado generará un movimiento de inventario y enviará la prenda a su destino (vendible o merma).
* RF08 (Historial de devoluciones): El sistema mostrará el historial de devoluciones y cambios, con indicadores por motivo, producto, talla y sucursal.

Módulo de operación sin conexión y sincronización

* RF09 (Preparación del dispositivo): Antes de quedarse sin red, el usuario podrá descargar al dispositivo el catálogo, las variantes, los precios, las existencias de sus sucursales autorizadas y los datos mínimos de clientes. Se guardarán en IndexedDB en la PWA y en SQLite en Flutter.
* RF10 (Catálogo sin conexión): El usuario podrá consultar productos, precios, tallas, colores y existencias sin conexión. El sistema mostrará la fecha de la última actualización y avisará cuando los datos puedan estar desactualizados.
* RF11 (Venta de contado sin conexión): El sistema registrará localmente ventas de contado con los siguientes datos:

* identificador único (UUID), empresa, sucursal y usuario responsable;
* cliente (opcional), fecha y hora;
* prendas con su variante, cantidades y precios aplicados;
* total, forma de pago y estado de sincronización.

* RF12 (Reserva sin conexión): El sistema registrará localmente reservas de prendas, con su UUID y su detalle.
* RF13 (Cambio de prenda sin conexión): El sistema permitirá registrar cambios de prenda sin conexión. Se confirmarán en el servidor cuando vuelva la red.
* RF14 (Seguimiento de operaciones locales): El usuario podrá ver sus operaciones locales con su estado: En el dispositivo, la operación queda en la cola de pendientes con su número de intentos y el último error. En el servidor, cada operación queda como Pendiente, Sincronizada o En conflicto, y el registro de sincronización indica si fue Aplicada, Duplicada o Rechazada.
* RF15 (Sincronización): Al recuperar la conexión, el sistema enviará la cola de operaciones pendientes al servidor y reintentará las que fallen. Ninguna operación se borrará del dispositivo hasta que el servidor la confirme.
* RF16 (Resolución de conflictos): El encargado podrá revisar y resolver las operaciones que choquen con el servidor, por ejemplo por stock insuficiente o un precio distinto.
* RF17 (Control de caja): El sistema registrará la apertura y el cierre de caja de cada turno, con o sin conexión.

Módulo SaaS multiempresa

* RF18 (Registro de empresas): El administrador de plataforma registrará las empresas contratantes (tenants) y designará un administrador para cada una.
* RF19 (Planes de suscripción): El administrador de plataforma podrá configurar desde el backend los planes Básico, Intermedio y Avanzado, con sus límites de sucursales, usuarios y productos y las funciones habilitadas.
* RF20 (Gestión de suscripciones): El sistema permitirá:

* asignar un plan a una empresa, con fecha de inicio y de vencimiento;
* consultar y cambiar el estado de la suscripción (Activa, Suspendida, Vencida o Finalizada);
* cambiar de plan;
* simular la renovación.

* RF21 (Personal y sucursales): Cada empresa administrará sus empleados, sus roles y su asignación a sucursales.
* RF22 (Control por plan): Antes de ejecutar una operación, el backend verificará que esté permitida por el plan y que no supere sus límites.

Módulo de inteligencia artificial y analítica

* RF23 (Reportes en lenguaje natural): El usuario podrá pedir un reporte escribiendo en lenguaje natural. El sistema:

* identificará el tipo de reporte y los filtros (fechas, sucursal, categoría, producto);
* ejecutará una consulta controlada y mostrará el resultado en una tabla o un gráfico;
* pedirá aclaración si la solicitud es ambigua o no está soportada.

* RF24 (Reportes por voz): El usuario podrá pedir el mismo reporte por voz. El sistema lo convertirá a texto antes de interpretarlo.
* RF25 (Exportación): Los reportes generados podrán exportarse a PDF o CSV (compatible con Excel).
* RF26 (Modelos de Machine Learning): El sistema permitirá entrenar y evaluar con datos reales y sintéticos dos tipos de modelos, mostrando sus métricas:

* un modelo supervisado para predecir la demanda;
* modelos no supervisados para agrupar clientes y detectar anomalías.

* RF27 (Dashboard analítico): El sistema mostrará en un dashboard los indicadores del negocio, las predicciones y los patrones detectados, con filtros por período, sucursal y categoría.

Requisitos No Funcionales (RNF)

* RNF01 (Seguridad de acceso): El inicio de sesión usará JWT con tiempo de expiración y las contraseñas se guardarán cifradas con bcrypt. Cada endpoint comprobará el permiso del rol y la función del plan antes de responder.
* RNF02 (Aislamiento entre empresas): El idTenant se tomará siempre del token y nunca de un dato enviado por el cliente, y toda consulta filtrará por ese valor. Si un usuario intenta acceder a un recurso de otra empresa, el sistema lo rechazará y lo registrará en la Bitácora.
* RNF03 (Durabilidad de datos locales): Toda operación sin conexión se guardará en IndexedDB o SQLite antes de confirmarse al usuario. Esas operaciones deben conservarse aunque se cierre el navegador, se reinicie la app o se apague el dispositivo.
* RNF04 (Consistencia venta–inventario): Toda transacción sin conexión queda primero en la cola local de pendientes y solo se elimina de ella cuando el servidor responde con éxito. En el servidor se registra con estadoSincronizacion "Sincronizada"; si se reenvía con el mismo UUID, se devuelve la operación original y se registra como "Duplicada".
* RNF05 (No duplicación al reenviar): El servidor usará el UUID de cada operación como clave de idempotencia. Si recibe una operación ya procesada, devolverá el resultado original sin crear otro registro.
* RNF06 (Tolerancia a fallos de red): Una operación solo pasará a “Confirmada” cuando el servidor responda con éxito. Si hay un error o se agota el tiempo de espera, seguirá como pendiente y se volverá a intentar.
* RNF07 (Organización del código): El código se separará por responsabilidades: interfaz (componentes Angular y pantallas Flutter), lógica de negocio (servicios y routers de FastAPI), persistencia (modelos SQLAlchemy y almacenamiento local) y sincronización (OfflineSyncService).
* RNF08 (Compatibilidad): La PWA será instalable en navegadores modernos como Chrome, Edge y Safari, mediante Service Worker y Web App Manifest. La app Flutter funcionará en Android e iOS.
* RNF09 (Tiempo de respuesta): El catálogo se cargará paginado y apoyado en índices por idTenant y fecha, con respuestas de menos de 2 segundos. Los reportes de IA limitarán la cantidad de filas consultadas para no sobrecargar la base de datos.
* RNF10 (Trazabilidad de la sincronización): Cada intento de sincronización registrará el UUID, la empresa, la sucursal, el dispositivo, la fecha, el resultado y el motivo de rechazo. No se guardarán contraseñas, tokens ni datos de pago.
* RNF11 (Pruebas automatizadas): Se implementarán pruebas con pytest para las reglas críticas: aislamiento entre empresas, idempotencia, consistencia del inventario, política de devoluciones y límites de cada plan.
* RNF12 (Correspondencia modelo–código): Las clases, controles y entidades de los diagramas UML 2.5+ tendrán los mismos nombres que en el código. Los diagramas se actualizarán con cada cambio.
* RNF13 (Retroalimentación al usuario): La interfaz mostrará siempre si hay conexión y cuántas operaciones hay pendientes, y avisará cuando la información consultada pueda estar desactualizada.
* RNF14 (Uso controlado de la IA): La IA no ejecutará consultas SQL directamente. Devolverá una solicitud estructurada (tipo de reporte y filtros) que el backend validará contra una lista de reportes permitidos antes de consultar la base de datos.

## 2.4. Reglas de negocio

* RN01 (Aislamiento Obligatorio): Toda petición REST backend debe incluir el tenant\_id validado en el Token de sesión.
* RN02 (Restricción de Ventas Offline): Las ventas registradas sin conexión deberán ser obligatoriamente de contado.
* RN03 (Límite de Sucursales): Un tenant con Plan Básico no podrá crear más de 2 sucursales activas.
* RN04 (Marcado de Sincronización): Toda transacción offline debe iniciar localmente con estado PENDIENTE\_SYNC y cambiar a SINCRONIZADO solo tras HTTP 200 OK del servidor central.

## 2.5. Diagrama UML de casos de uso

## 

## 2.6. Especificación de casos de uso

### 2.6.1 Lista de casos de usos

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| ID | Caso de uso | Actores | Prioridad | Entorno |
| CU1 | Registrar solicitud de devolución o cambio en tienda | Empleado, Encargado de sucursal | Alta | Web |
| CU2 | Solicitar devolución o cambio desde la tienda en línea | Cliente | Alta | Web |
| CU3 | Inspeccionar estado de la prenda devuelta | Encargado de sucursal | Alta | Web, Móvil |
| CU4 | Procesar cambio de talla, color o medida | Empleado, Encargado de sucursal | Alta | Web |
| CU5 | Procesar cambio por un producto diferente | Empleado, Encargado de sucursal | Alta | Web |
| CU6 | Procesar reembolso de dinero | Empleado, Encargado de sucursal | Alta | Web |
| CU8 | Gestionar cambio sin stock disponible | Empleado, Encargado de sucursal, Cliente | Alta | Web |
| CU9 | Configurar política de devoluciones y cambios | Administrador de empresa | Alta | Web |
| CU10 | Actualizar inventario por devolución o cambio | Empleado, Encargado de sucursal | Alta | Web |
| CU11 | Consultar historial y análisis de devoluciones | Administrador de empresa, Encargado de sucursal | Alta | Web |
| CU12 | Preparar dispositivo para operación sin conexión | Empleado, Encargado de sucursal | Alta | Web, móvil |
| CU13 | Consultar catálogo, precios y existencias sin conexión | Empleado, Encargado de sucursal, Cliente | Alta | Web, Móvil |
| CU14 | Registrar venta de contado sin conexión | Empleado | Alta | Web, Móvil |
| CU15 | Registrar reserva de prendas sin conexión | Encargado de sucursal, Empleado | Alta | Web, Móvil |
| CU16 | Consultar operaciones pendientes y resultado de sincronización | Empleado, Encargado de sucursal | Alta | Web, Móvil |
| CU17 | Sincronizar operaciones pendientes | Empleado, Encargado de sucursal | Alta | Web, Móvil |
| CU18 | Resolver conflictos de sincronización | Encargado de sucursal, Administrador de empresa | Alta | Web |
| CU19 | Registrar cambio de prenda sin conexión | Empleado, Encargado de sucursal | Alta | Web, Móvil |
| CU20 | Gestionar apertura y cierre de caja | Empleado, Encargado de sucursal | Alta | Web, Móvil |
| CU21 | Registrar empresa contratante (tenant) | Administrador de plataforma | Alta | Web |
| CU22 | Administrar estado de las suscripciones | Administrador de plataforma | Alta | Web |
| CU23 | Configurar planes de suscripción | Administrador de plataforma | Alta | Web |
| CU24 | Gestionar empleados y asignación a sucursales | Administrador de empresa | Alta | Web |
| CU25 | Verificar límites y funcionalidades del plan | Administrador de empresa, Encargado de sucursal, Empleado, Cliente | Alta | Web, Móvil |
| CU26 | Solicitar reporte generativo en lenguaje natural | Administrador de empresa, Encargado de sucursal | Media | Web |
| CU27 | Solicitar reporte generativo por voz | Administrador de empresa, Encargado de sucursal | Media | Web |
| CU28 | Exportar reporte a PDF o Excel | Administrador de empresa, Encargado de sucursal | Media | Web |
| CU29 | Entrenar y evaluar modelos de Machine Learning | Administrador de empresa | Media | Web |
| CU30 | Visualizar dashboard analítico inteligente | Administrador de empresa, Encargado de sucursal | Media | Web |
| CU31 | Recoger a domicilio la prenda devuelta | Cliente, Empleado, Encargado de sucursal. | Media | Web, móvil |
| CU32 | Entregar a domicilio la prenda del cambio | Empleado, Encargado, Cliente | Alta | Web, móvil |
| CU33 | Obtener y usar un cupón de descuento por compras | Cliente, Empleado | Baja | Web, móvil |
| CU34 | Avisar cuando vuelve el stock de una talla | Cliente | Alta | Web, móvil |
| CU35 | Entregar a domicilio una compra en línea | Cliente, Empleado, Encargado | Media | Web, móvil |
| CU36 | Conversar con el asistente virtual (texto o voz) | Visitante, Cliente, Administrador de empresa, Encargado | Baja | Web, móvil |

### 2.6.2 Casos de uso

CU1: Registrar solicitud de devolución o cambio en tienda

|  |  |
| --- | --- |
| Nombre: | Registrar solicitud de devolución o cambio en tienda |
| Autor: | Adalid Nicolas Revollo Roman |
| Fecha: | 15/10/2026 |
| Descripción: | Permite al personal de la sucursal recibir a un cliente que desea devolver o cambiar una o varias prendas de una venta, validar si la operación es elegible según la política de la empresa (plazo, estado de la venta, cantidades y categoría) y registrar la solicitud para su inspección. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado (permiso devolucion.registrar) en una sucursal de su empresa, la suscripción debe estar activa y debe existir conexión a Internet (para el caso sin conexión se aplica el CU19). |
| Flujo Normal: | 1. El actor ingresa a la opción "Devoluciones y Cambios" y pulsa "Nueva solicitud".  2. El sistema solicita identificar la venta mediante el número de comprobante, el código QR del comprobante o la búsqueda por cliente (nombre, CI o teléfono).  3. El actor ingresa el dato de búsqueda y selecciona la venta.  4. El sistema muestra el detalle de la venta: fecha y hora de entrega, sucursal de origen, prendas (talla, color, cantidad), precio efectivamente pagado por cada prenda (con descuentos prorrateados), forma de pago y las cantidades que ya fueron devueltas o cambiadas anteriormente.  5. El actor selecciona la(s) prenda(s) y la cantidad a devolver, el motivo (no le quedó la talla, ajuste de medida, cambio de color, defecto de fábrica, producto equivocado, ya no lo desea) y la resolución que pide el cliente: cambio por otra talla/color del mismo modelo, cambio por otro producto o reembolso del dinero.  6. El sistema valida que la venta esté en estado "Pagada" y sincronizada, que pertenezca al idTenant del actor, que la solicitud esté dentro del plazo configurado (contado desde la fecha y hora de entrega), que la cantidad no supere lo vendido menos lo ya devuelto, que la categoría admita devolución y que la prenda no haya superado el número máximo de cambios permitido.  7. El sistema registra la solicitud con un código único, estado "En inspección", la sucursal receptora, el usuario responsable y la fecha y hora exacta, y deriva al CU3 (Inspeccionar estado de la prenda devuelta). |
| Flujo Alternativo: | 1. Si la venta no existe o pertenece a otra empresa, el sistema responde "Venta no encontrada" sin revelar información de otro tenant.  2. Si la solicitud está fuera de plazo, el sistema aplica la política configurada (CU9): la rechaza indicando la fecha límite que tenía el cliente, o permite continuar aplicando el recargo por demora calculado automáticamente. Si el motivo es "defecto de fábrica", se evalúa contra el plazo de garantía, que es mayor que el plazo de cambio.  3. Si la prenda pertenece a una categoría no retornable (ropa interior, trajes de baño, liquidación "venta final"), el sistema solo permite continuar cuando el motivo es defecto de fábrica.  4. Si el cliente no presenta comprobante, el actor busca la venta por los datos del cliente; si fue una venta a "Cliente genérico" sin comprobante, el sistema no permite registrar la solicitud.  5. Si la venta ya fue devuelta en su totalidad, o la prenda ya alcanzó el máximo de cambios, el sistema informa que no quedan unidades elegibles. El plazo de una prenda recibida por cambio no se reinicia: se cuenta desde la venta original.  6. Si la venta fue registrada sin conexión y aún figura como pendiente de sincronización, el sistema solicita sincronizarla primero (CU17); si no hay conexión, se aplica el CU19.  7. Si la venta se realizó en otra sucursal de la misma empresa o fue una compra digital, el sistema permite la solicitud y registra como sucursal receptora la sucursal del actor.  8. Si el cliente ya superó el máximo de devoluciones permitidas en el mes, el sistema exige la autorización del Encargado de sucursal para continuar. |
| Poscondiciones: | Queda registrada una solicitud de devolución o cambio en estado "En inspección", vinculada a la venta original, al cliente y a la sucursal receptora, con fecha y hora inmutables en el historial. |

 

CU2: Solicitar devolución o cambio desde la tienda en línea

|  |  |
| --- | --- |
| Nombre: | Solicitar devolución o cambio desde la tienda en línea |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 18/10/2026 |
| Descripción: | Permite al cliente iniciar desde la PWA o la aplicación móvil una solicitud de devolución o cambio de una compra digital o presencial asociada a su cuenta, indicando el motivo y la resolución deseada, y elegir la sucursal donde entregará la prenda. |
| Actores: | Cliente. |
| Precondiciones: | El cliente debe estar autenticado y tener al menos una compra en estado "Pagada" y "Entregada" asociada a su cuenta. |
| Flujo Normal: | 1. El cliente ingresa a "Mis compras" y selecciona la compra.  2. El sistema muestra las prendas de la compra con su estado de elegibilidad y el tiempo restante para solicitar un cambio o devolución.  3. El cliente selecciona la prenda, la cantidad, el motivo, la resolución deseada (otra talla/color, otro producto o reembolso) y, de forma opcional, adjunta fotografías de la prenda.  4. Si elige cambio de talla o color, el sistema muestra las variantes del mismo modelo con su precio actual y su disponibilidad por sucursal.  5. El cliente elige la sucursal donde entregará la prenda y confirma la solicitud.  6. El sistema valida la elegibilidad (mismas reglas del CU1), genera un código de devolución con QR y una fecha límite de entrega en sucursal, y, si pidió una variante disponible, la aparta a su nombre hasta esa fecha.  7. El sistema envía al cliente un aviso (notificación en la aplicación y correo) con el código de la solicitud, la sucursal elegida y la fecha límite para entregar la prenda. |
| Flujo Alternativo: | 1. Si la compra está fuera de plazo, el sistema oculta la opción y muestra la fecha límite que tenía; si la política permite recargo, muestra el monto del recargo antes de confirmar.  2. Si la prenda ya tiene una solicitud abierta, el sistema muestra la solicitud existente en lugar de crear otra.  3. Si el cliente no entrega la prenda hasta la fecha límite, el sistema anula la solicitud, libera la variante apartada y le avisa al cliente que la solicitud fue anulada.  4. Si el motivo es defecto de fábrica en una compra digital, el sistema ofrece el recojo a domicilio y registra que el costo de envío no se cobra al cliente. |
| Poscondiciones: | Se registra una solicitud en estado "Pendiente de entrega" con su código QR; al presentarse el cliente en la sucursal, el personal la carga y continúa con el CU3. |

 

CU3: Inspeccionar estado de la prenda devuelta

|  |  |
| --- | --- |
| Nombre: | Inspeccionar estado de la prenda devuelta |
| Autor: | Adalid Nicolas Revollo Roman |
| Fecha: | 18/10/2026 |
| Descripción: | Permite al encargado verificar físicamente que la prenda devuelta corresponde a la vendida y evaluar su estado, para decidir si se acepta, se acepta con descuento por deterioro o se rechaza, y a qué inventario debe ingresar. |
| Actores: | Encargado de sucursal. |
| Precondiciones: | Debe existir una solicitud de devolución o cambio en estado "En inspección" o "Pendiente de entrega" y la prenda debe estar físicamente en la sucursal. |
| Flujo Normal: | 1. El actor abre la solicitud (por código, QR o desde la lista de solicitudes pendientes).  2. El sistema muestra los datos de la prenda vendida (producto, SKU, talla, color) y la lista de verificación de estado: etiquetas originales, sin señales de uso, sin manchas ni olores, sin roturas, accesorios completos.  3. El actor escanea el código de la prenda y completa la lista de verificación, registrando observaciones y fotografías.  4. El sistema comprueba que el SKU escaneado coincide con el producto, talla y color de la venta.  5. El actor selecciona el resultado de la inspección: "Apta para reventa", "Defecto de fábrica", "Deteriorada por uso" o "No corresponde".  6. El sistema registra el resultado y, si la prenda es aceptada, cambia el estado de la solicitud a "Aprobada" y deriva a la resolución pedida: CU4, CU5 o CU6. En ambos casos avisa al cliente (aplicación y correo) si su prenda fue aprobada o rechazada y, si fue rechazada, el motivo. |
| Flujo Alternativo: | 1. Si el SKU escaneado no coincide con el vendido, el sistema marca la inspección como "No corresponde", rechaza la solicitud y la prenda se devuelve al cliente.  2. Si la prenda está deteriorada por uso, el sistema aplica la política: rechazo de la solicitud o aceptación con un descuento por deterioro (porcentaje configurado) que reduce el monto a favor del cliente; el cliente decide si acepta.  3. Si la prenda tiene defecto de fábrica, se acepta aunque el motivo inicial fuera otro, el cliente puede elegir reembolso total aunque la política general solo permita cambios, y la prenda se destina a inventario no vendible.  4. Si la solicitud incluye varias unidades, el actor inspecciona cada una; el sistema permite aprobar unas y rechazar otras (aprobación parcial).  5. Si el cliente no acepta el resultado de la inspección, el actor registra la disconformidad y la solicitud pasa a "En revisión" para el Administrador de empresa. |
| Poscondiciones: | La solicitud queda "Aprobada" (total o parcialmente) o "Rechazada" con el motivo, las fotografías y el destino de inventario de cada prenda (vendible o no vendible). |

 

CU4: Procesar cambio de talla, color o medida

|  |  |
| --- | --- |
| Nombre: | Procesar cambio de talla, color o medida |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 20/10/2026 |
| Descripción: | Permite cambiar la prenda devuelta por otra variante del mismo modelo (otra talla o color) o registrar un ajuste de medida, calculando automáticamente la diferencia de precio para cobrarla al cliente o devolverle en dinero el saldo a su favor. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | La solicitud debe estar en estado "Aprobada" (CU3) y la resolución elegida debe ser cambio del mismo modelo. Para cobrar una diferencia o devolver un saldo en efectivo la caja debe estar abierta (CU20). |
| Flujo Normal: | 1. El sistema muestra las variantes del mismo modelo con su precio actual, su existencia en la sucursal y, para cada talla, si es más grande o más chica que la devuelta y por cuántos centímetros (pecho, largo y cintura). Una misma talla puede medir distinto según el modelo, por ejemplo una "L" oversize y una "L" normal.  2. El actor selecciona la nueva talla o color que pide el cliente.  3. El sistema calcula la diferencia: precio de la nueva variante menos el precio efectivamente pagado por la prenda devuelta (con descuentos prorrateados y menos el recargo por demora o descuento por deterioro, si corresponde).  4. Si elige cambio de talla o color, el sistema muestra las variantes del mismo modelo con su precio actual, su disponibilidad por sucursal y, para cada talla, si es más grande o más chica que la que devuelve y por cuántos centímetros (pecho, largo y cintura).  5. Si la nueva variante cuesta más (por ejemplo, la talla XL tiene un precio mayor que la M), el sistema muestra el monto a cobrar y el actor registra el pago de la diferencia con efectivo, tarjeta o QR.  6. Si la nueva variante cuesta menos, el sistema muestra el saldo a favor del cliente y se lo devuelve en dinero por el medio de pago de la venta original (CU6), entregándole su nota de devolución (CU7).  7. El sistema envía al cliente un aviso (notificación en la aplicación y correo) con el código de la solicitud, la sucursal elegida y la fecha límite para entregar la prenda.  8. El sistema registra la devolución de tipo "cambio\_talla" con talla original, talla nueva, montos y forma de pago de la diferencia; actualiza el inventario (CU10); emite el comprobante de cambio y registra la operación en la bitácora y avisa al cliente (aplicación y correo) que su cambio está listo. |
| Flujo Alternativo: | 1. Si la nueva variante no tiene existencia en la sucursal, se continúa con el CU8 (Gestionar cambio sin stock disponible).  2. Si el cliente no quiere pagar la diferencia, el actor puede elegir otra variante, cambiar la resolución a reembolso (CU6) o cambio por otro producto (CU5), o cancelar la solicitud devolviéndole su prenda.  3. Si el precio del modelo subió después de la venta y la política "respetar precio original en cambios del mismo modelo" está activa, el sistema no cobra el aumento general de precio; solo cobra la diferencia propia de la variante (por ejemplo, el recargo de tallas grandes).  4. Si el pago de la diferencia con tarjeta o QR es rechazado, el sistema mantiene el cambio sin confirmar y permite elegir otro método de pago.  5. Si se trata de un ajuste de medida de la misma pieza (cintura, largo de manga o basta), el sistema registra el tipo "cambio\_medida" con la medida original y la nueva, genera una orden de ajuste con fecha de entrega y cobra el costo del ajuste solo si la solicitud está fuera del plazo libre de recargo.  6. Si la diferencia a cobrar supera el umbral configurado, se requiere la autorización del Encargado de sucursal.  7. Si la caja está cerrada y la diferencia se cobra o se devuelve en efectivo, el sistema no permite confirmar el cambio hasta que se abra la caja (CU20). |
| Poscondiciones: | El cliente recibe la nueva variante (u orden de ajuste), la diferencia queda cobrada o el saldo a favor devuelto en dinero con su nota de devolución, la venta original queda vinculada al cambio y el inventario refleja la entrada y la salida de las prendas. |

 

## 

CU5: Procesar cambio por un producto diferente

|  |  |
| --- | --- |
| Nombre: | Procesar cambio por un producto diferente |
| Autor: | Adalid Nicolas Revollo Roman |
| Fecha: | 20/10/2026 |
| Descripción: | Permite cambiar una prenda devuelta por uno o varios productos distintos, usando como crédito el valor efectivamente pagado por la prenda devuelta y resolviendo la diferencia a favor de la tienda o del cliente. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | La solicitud debe estar en estado "Aprobada" y la resolución elegida debe ser cambio por otro producto. Si se cobra o se devuelve dinero en efectivo, la caja debe estar abierta (CU20). |
| Flujo Normal: | 1. El sistema muestra el crédito disponible del cliente: precio efectivamente pagado por la prenda devuelta, menos recargos o descuentos por deterioro.  2. El actor agrega al detalle del cambio el o los productos nuevos que elige el cliente, escaneando su código o buscándolos en el catálogo.  3. El sistema valida la existencia de cada producto en la sucursal y calcula el total de los productos nuevos a su precio vigente, aplicando las promociones activas.  4. El sistema compara el total nuevo con el crédito: si el total es mayor, muestra la diferencia a cobrar; si es menor, muestra el saldo a favor.  5. El actor registra el cobro de la diferencia (efectivo, tarjeta o QR) o, si hay saldo a favor, el sistema se lo devuelve en dinero por el medio de pago original (CU6) y le entrega su nota de devolución (CU7).  6. El actor confirma el cambio.  7. El sistema registra la devolución vinculada a una nueva venta por los productos entregados, actualiza el inventario (CU10) y emite el comprobante de cambio. |
| Flujo Alternativo: | 1. Si la prenda devuelta formaba parte de una promoción condicionada (por ejemplo, 2x1 o descuento por comprar dos prendas), el sistema recalcula la promoción de la venta original sin la prenda devuelta y el crédito se reduce en el beneficio que el cliente pierde.  2. Si la política de la empresa no permite reembolsos, eso solo impide pedir la devolución del dinero de la prenda; el saldo a favor de un cambio siempre se devuelve en dinero.  3. Si alguno de los productos nuevos no tiene existencia, el sistema no lo agrega y permite consultar otras sucursales (CU8).  4. Si el cliente desiste de todos los productos nuevos, el actor puede cambiar la resolución a reembolso (CU6) o cancelar la solicitud.  5. Se elimina, porque ya no se puede pagar con una nota de crédito. |
| Poscondiciones: | Se registra el cambio con la venta original y la nueva venta enlazadas, la diferencia cobrada o el saldo a favor devuelto en dinero con su nota de devolución, y el inventario actualizado. |

 

CU6: Procesar reembolso de dinero

|  |  |
| --- | --- |
| Nombre: | Procesar reembolso de dinero |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 22/10/2026 |
| Descripción: | Permite devolver al cliente el dinero de una prenda devuelta, o un saldo a favor de un cambio, por el mismo medio con el que pagó, calculando el monto exacto y registrando el egreso. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | Debe existir una solicitud "Aprobada" con resolución de reembolso o un saldo a favor proveniente del CU4 o CU5. Para reembolsos en efectivo la caja debe estar abierta. |
| Flujo Normal: | 1. El sistema calcula el monto a reembolsar: precio efectivamente pagado por las prendas devueltas (con descuentos prorrateados), menos el recargo por demora y el descuento por deterioro, si corresponden.  2. El sistema muestra el monto y el medio de reembolso, que por defecto es el mismo medio de pago de la venta original.  3. El actor confirma el reembolso.  4. Si el pago original fue en efectivo, el sistema registra un egreso en la caja abierta e indica el monto a entregar.  5. Si el pago original fue con tarjeta o pago electrónico, el sistema solicita el reembolso a la pasarela de pagos sobre la transacción original y registra el estado "Reembolso en proceso" hasta recibir la confirmación.  6. El sistema registra la devolución con su monto devuelto, cambia la venta a "Parcialmente devuelta" o "Devuelta", actualiza el inventario (CU10) y emite la nota de devolución al cliente (CU7). |
| Flujo Alternativo: | 1. Si la venta se pagó con medios combinados (parte en efectivo y parte con tarjeta), el sistema reparte el reembolso entre los mismos medios en la misma proporción.  2. Si la caja no tiene efectivo suficiente, el sistema ofrece emitir una nota de crédito (CU7) o registrar un reembolso diferido por transferencia con los datos bancarios del cliente.  3. Si la pasarela rechaza o no responde, el reembolso queda "Pendiente", el sistema lo reintenta y lo muestra en la lista de reembolsos pendientes del encargado.  4. Si fue un pago por QR o transferencia, el sistema registra el reembolso como transferencia pendiente con la cuenta de destino y el comprobante adjunto al realizarla.  5. Si el monto supera el umbral configurado, se requiere la autorización del Encargado de sucursal.  6. En compras digitales, el costo de envío no se reembolsa, salvo que el motivo sea defecto de fábrica o error de la tienda.  7. Se elimina, porque ya no existe la nota de crédito como alternativa al dinero. |
| Poscondiciones: | El dinero queda devuelto o en proceso de devolución, el egreso queda registrado en caja o en la pasarela, y la venta original refleja el monto devuelto y el cliente recibe su nota de devolución. |

CU07: Emitir nota de devolución

|  |  |
| --- | --- |
| Nombre: | Emitir nota de devoluvión |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 22/10/2026 |
| Descripción: | Genera y entrega al cliente la nota de devolución: el comprobante del dinero que se le devolvió por una devolución o por el saldo a favor de un cambio, con el monto, el medio de reembolso, su estado y el código del caso. |
| Actores: | Empleado, Encargado de sucursal, Cliente. |
| Precondiciones: | Debe existir un caso de devolución o cambio en el que se devolvió dinero al cliente (CU6, o el saldo a favor de un CU4, CU5 o CU8). |
| Flujo Normal: | 1. Al registrarse el reembolso (CU6), el sistema arma la nota de devolución con el número del caso (por ejemplo, DEV-000123), el monto devuelto en Bs y el medio: en efectivo, por QR/transferencia o a la tarjeta. 2. Si el reembolso todavía no terminó (tarjeta en proceso o transferencia pendiente), la nota indica su estado y, si existe, la referencia de la pasarela o de la transferencia. 3. El sistema envía la nota al cliente como aviso en la aplicación (bandeja de notificaciones) y por correo, con el título "Nota de devolución DEV-000123: le devolvimos Bs X". 4. El actor abre el caso y descarga la nota en PDF (con QR) para imprimirla y entregarla al cliente. |
| Flujo Alternativo: | 1. Si en el caso no se devolvió dinero (cambio sin costo o con diferencia cobrada), el sistema emite el comprobante de cambio en lugar de la nota de devolución y avisa al cliente que su cambio está listo. 2. Si el cliente no retiró a tiempo la prenda de un cambio pendiente (CU8), el sistema convierte el caso en devolución, deja el dinero pendiente de entregar y le avisa "Le devolveremos Bs X"; la nota se emite cuando el personal entrega el dinero. 3. Si el correo no se puede enviar, el aviso queda en la bandeja de la aplicación y el envío se reintenta. |
| Poscondiciones: | El cliente cuenta con la nota de devolución (aviso, correo y PDF) que respalda cuánto dinero se le devolvió, por qué medio y en qué estado está el reembolso. |

CU8: Gestionar cambio sin stock disponible

|  |  |
| --- | --- |
| Nombre: | Gestionar cambio sin stock disponible |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 22/10/2026 |
| Descripción: | Permite resolver un cambio cuando la talla, color o producto que pide el cliente no tiene existencia en la sucursal, ofreciendo traerlo de otra sucursal, atenderlo en otra sucursal, elegir otra prenda o recibir el reembolso. |
| Actores: | Empleado, Encargado de sucursal, Cliente. |
| Precondiciones: | Debe existir una solicitud "Aprobada" en el CU4 o CU5 y la variante solicitada no debe tener existencia en la sucursal del actor. |
| Flujo Normal: | 1. El sistema informa la falta de stock y consulta la existencia de la variante en las demás sucursales de la misma empresa.  2. El sistema muestra las sucursales con existencia y las opciones: traslado a esta sucursal, atención en otra sucursal, elegir otra prenda o reembolso.  3. Si el cliente elige el traslado, el sistema aparta la variante en la sucursal de origen a nombre del cliente y genera una transferencia entre sucursales.  4. El sistema registra la recepción de la prenda devuelta, emite un comprobante de "Cambio pendiente" con la fecha estimada de llegada y congela el plazo de cambio del cliente mientras espera y le envía un aviso (aplicación y correo) del tipo "Su prenda será enviada el viernes 06/11", con la fecha de llegada y la fecha límite para retirarla.  5. Cuando la prenda llega a la sucursal, el sistema notifica al cliente; al presentarse, el actor completa el cambio con el CU4 o CU5. |
| Flujo Alternativo: | 1. Si el cliente prefiere ir a otra sucursal, el sistema aparta la variante allí, genera un código de cambio que esa sucursal puede cargar y le avisa "Su prenda lo espera en <sucursal>" con la fecha límite de retiro.  2. Si ninguna sucursal tiene existencia, el sistema ofrece elegir otra prenda (CU5), inscribir al cliente en una lista de espera (se le avisa cuando haya reposición) o el reembolso (CU6), que se permite aunque la política normal solo admita cambios, porque la tienda no puede entregar lo pedido.  3. Si el cliente no recoge la prenda dentro del plazo de retiro, el sistema libera la prenda apartada, convierte el caso en devolución y deja pendiente la devolución de su dinero por el medio de pago original (aparece en "Reembolsos pendientes"); al cliente le llega el aviso "Le devolveremos Bs X".  4. Si el plan de la empresa tiene una sola sucursal, el sistema omite la consulta a otras sucursales. |
| Poscondiciones: | El cambio queda pendiente con prenda apartada o trasladada, o se resuelve con otra prenda o con el reembolso del dinero, sin que el cliente pierda su derecho por el tiempo de espera. |

 

CU9: Configurar política de devoluciones y cambios

|  |  |
| --- | --- |
| Nombre: | Configurar política de devoluciones y cambios |
| Autor: | Adalid Nicolas Revollo Roman |
| Fecha: | 23/10/2026 |
| Descripción: | Permite al administrador de la empresa definir las reglas de posventa que el sistema aplicará automáticamente: plazos, recargos, categorías no retornables, forma de entregar los saldos a favor y límites de autorización. |
| Actores: | Administrador de empresa. |
| Precondiciones: | El actor debe estar autenticado con permiso tenant.admin y la suscripción debe estar activa. |
| Flujo Normal: | 1. El actor ingresa a "Configuración > Política de devoluciones".  2. El sistema muestra la política vigente con sus valores por defecto: plazo de cambio de 24 horas desde la entrega, plazo de garantía por defecto de fábrica, acción fuera de plazo, recargo por demora, categorías no retornables, máximo de cambios por prenda, forma de entregar el saldo a favor, validez de las notas de crédito, respeto del precio original en cambios del mismo modelo, umbral de autorización y máximo de devoluciones por cliente al mes.  3. El actor modifica los valores (por ejemplo, la acción fuera de plazo: "Rechazar" o "Aplicar recargo" en porcentaje o monto por hora o día de demora).  4. El sistema valida que los plazos y montos sean positivos y coherentes (el plazo de garantía no puede ser menor que el plazo de cambio).  5. El sistema guarda la política como una nueva versión con fecha de vigencia y registra el cambio en la bitácora. |
| Flujo Alternativo: | 1. Si algún valor es inválido, el sistema marca el campo y no guarda la política.  2. Las ventas realizadas antes del cambio conservan la versión de la política vigente al momento de la venta; el sistema muestra un aviso de esta regla al guardar.  3. Si la empresa no configuró una política, el sistema aplica la política por defecto de la plataforma. |
| Poscondiciones: | La nueva versión de la política queda vigente para las ventas posteriores, y los casos de uso CU1 a CU8 la aplican automáticamente. |

 

CU10: Actualizar inventario por devolución o cambio

|  |  |
| --- | --- |
| Nombre: | Actualizar inventario por devolución o cambio |
| Autor: | Anju Clara Nishizawa Cuellar |
| Fecha: | 23/10/2026 |
| Descripción: | Proceso que el sistema ejecuta automáticamente, al confirmar el empleado o el encargado un cambio o reembolso, para registrar en una sola transacción las entradas y salidas de inventario provocadas por una devolución o cambio, enviando cada prenda devuelta al inventario que corresponde según su estado. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | Debe confirmarse un cambio (CU4, CU5) o un reembolso (CU6) con el resultado de inspección de cada prenda (CU3). |
| Flujo Normal: | 1. El sistema inicia una transacción en la base de datos central.  2. Por cada prenda "Apta para reventa", incrementa la cantidad disponible en el inventario de la sucursal receptora y registra un movimiento "Entrada por devolución" con referencia a la devolución.  3. Por cada prenda con "Defecto de fábrica" o "Deteriorada", la registra en el inventario no vendible (merma) de la sucursal con su motivo.  4. Por cada prenda entregada en un cambio, descuenta la cantidad disponible y registra un movimiento "Salida por cambio".  5. El sistema confirma la transacción y actualiza la disponibilidad que consultan el catálogo, la PWA y la aplicación móvil. |
| Flujo Alternativo: | 1. Si alguna operación falla, el sistema revierte toda la transacción, la solicitud permanece "Aprobada" sin completar y se notifica al actor para reintentar.  2. Si la prenda con defecto tiene proveedor registrado, el sistema genera un reclamo al proveedor con el lote, la fecha de compra y las fotografías de la inspección.  3. Si la sucursal receptora es distinta de la sucursal de venta, la prenda entra al inventario de la sucursal receptora.  4. Si el producto devuelto fue dado de baja del catálogo, la prenda entra al inventario marcada como "Producto inactivo" para que el encargado decida su destino. |
| Poscondiciones: | El inventario de la sucursal refleja de forma consistente las prendas devueltas y entregadas, con movimientos trazables a la devolución de origen. |

 

CU11: Consultar historial y análisis de devoluciones

|  |  |
| --- | --- |
| Nombre: | Consultar historial y análisis de devoluciones |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite consultar el historial de devoluciones y cambios de la empresa e identificar productos y tallas con más devoluciones para detectar problemas de tallaje o calidad. |
| Actores: | Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado con permiso devolucion.ver. |
| Flujo Normal: | 1. El actor ingresa a "Devoluciones y Cambios > Historial".  2. El sistema muestra la lista de devoluciones y cambios con fecha y hora, cliente, venta, prenda, tipo, motivo, resultado de la inspección, montos cobrados o devueltos y usuario responsable.  3. El actor aplica filtros por rango de fechas, sucursal, tipo, motivo, producto, talla, cliente o estado.  4. El sistema muestra indicadores: cantidad de casos, unidades devueltas, cambios realizados, solicitudes rechazadas, monto total reembolsado, tasa de devolución por producto y por talla, motivos más frecuentes y clientes con devoluciones frecuentes.  5. El actor selecciona un registro para ver su detalle completo y su línea de tiempo (solicitud, inspección, resolución, inventario).  6. El actor puede exportar el resultado a PDF o Excel. |
| Flujo Alternativo: | 1. Si no hay registros para los filtros, el sistema muestra "No se encontraron devoluciones".  2. El Encargado de sucursal solo ve los registros de las sucursales que tiene asignadas (CU24); el Administrador ve todas las sucursales de su empresa. |
| Poscondiciones: | El actor obtiene el historial y los indicadores de posventa de su empresa sin acceso a datos de otros tenants. |

CU12: Preparar dispositivo para operación sin conexión

|  |  |
| --- | --- |
| Nombre: | Preparar dispositivo para operación sin conexión |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite instalar la PWA o preparar la aplicación móvil y descargar al almacenamiento local (IndexedDB o SQLite) el subconjunto de datos que la sucursal necesita para operar sin Internet. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado con conexión a Internet, asignado a una sucursal, y el plan de su empresa debe permitir la operación sin conexión. |
| Flujo Normal: | 1. El actor selecciona "Instalar aplicación" en el navegador (PWA) o abre la aplicación Flutter.  2. El sistema registra el Service Worker y guarda en caché los recursos de la aplicación (pantallas, scripts, estilos e imágenes necesarias).  3. El actor pulsa "Preparar modo sin conexión".  4. El sistema descarga los productos y variantes de su sucursal con precios, tallas, colores y existencias, las sucursales autorizadas, los datos mínimos de clientes frecuentes, las reservas vigentes, las ventas recientes y la política de devoluciones vigente.  5. El sistema guarda los datos en el almacenamiento local asociados al idTenant y a la sucursal, junto con la fecha y hora de la descarga.  6. El sistema muestra "Dispositivo listo para operar sin conexión" con la fecha de la última actualización. |
| Flujo Alternativo: | 1. Si el plan no incluye la operación sin conexión, el sistema oculta la opción e informa que debe mejorar su plan.  2. Si el navegador no es compatible con Service Worker o IndexedDB, el sistema informa que el modo sin conexión no está disponible en ese navegador.  3. Si el almacenamiento disponible es insuficiente, el sistema descarga primero los productos con mayor rotación e informa que la descarga es parcial.  4. Si la conexión se interrumpe durante la descarga, el sistema conserva lo descargado y la reanuda al recuperar la conexión.  5. Si en el dispositivo hay datos de otro usuario o empresa, el sistema exige sincronizar sus operaciones pendientes antes de reemplazarlos. |
| Poscondiciones: | El dispositivo cuenta con la aplicación instalada y una copia local de los datos necesarios para operar sin Internet, identificada con su empresa, sucursal y fecha de actualización. |

 

CU13: Consultar catálogo, precios y existencias sin conexión

|  |  |
| --- | --- |
| Nombre: | Consultar catálogo, precios y existencias sin conexión |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite consultar productos, precios, tallas, colores y existencias conocidas desde el almacenamiento local cuando no hay Internet, indicando que la información puede estar desactualizada. |
| Actores: | Empleado, Encargado de sucursal, Cliente. |
| Precondiciones: | El dispositivo debe haberse preparado previamente (CU12). |
| Flujo Normal: | 1. El sistema detecta la falta de conexión y muestra el indicador "Modo sin conexión".  2. El actor busca un producto por nombre, código, categoría, talla o color.  3. El sistema consulta el almacenamiento local y muestra los resultados con precio, variantes y existencia conocida.  4. El sistema calcula la existencia local como la existencia descargada menos las ventas y reservas registradas sin conexión en ese dispositivo.  5. El sistema muestra junto a cada dato la fecha y hora de la última actualización. |
| Flujo Alternativo: | 1. Si la última actualización supera el tiempo máximo configurado, el sistema muestra la advertencia "La información puede estar desactualizada".  2. Si el producto buscado no fue descargado, el sistema informa que no está disponible sin conexión.  3. Si las imágenes no están en caché, el sistema muestra una imagen genérica.  4. Al recuperar la conexión, el sistema retira el indicador y ofrece actualizar los datos. |
| Poscondiciones: | El actor consulta la información local conocida y sabe desde cuándo no se actualiza. |

CU14: Registrar venta de contado sin conexión

|  |  |
| --- | --- |
| Nombre: | Registrar venta de contado sin conexión |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite registrar una venta presencial pagada en efectivo cuando no hay Internet, guardándola en el almacenamiento local con un identificador único para sincronizarla después. |
| Actores: | Empleado. |
| Precondiciones: | El dispositivo debe estar preparado (CU12), la caja debe estar abierta (CU20) y el Empleado debe tener una sesión válida guardada en el dispositivo. |
| Flujo Normal: | 1. El Empleado inicia una nueva venta en modo sin conexión.  2. El Empleado agrega las prendas escaneando su código o buscándolas en el catálogo local.  3. El sistema valida la existencia local conocida de cada variante y usa el precio local.  4. El Empleado selecciona un cliente del almacenamiento local, registra un cliente nuevo con datos mínimos (nombre y CI) o elige "Cliente genérico".  5. El sistema calcula el total y habilita únicamente el pago en efectivo.  6. El Empleado ingresa el monto recibido; el sistema calcula el cambio y el Empleado confirma la recepción del efectivo.  7. Usa los nombres de los campos reales: uuidOperacion, fechaOperacion (la hora real del dispositivo) y origenRegistro "sin conexión".    8. El sistema agrega la operación a la cola de pendientes, descuenta la existencia local y emite un comprobante provisional con la leyenda "Sujeto a confirmación del servidor". |
| Flujo Alternativo: | 1. Si la existencia local conocida es cero, el sistema no agrega la prenda, salvo que la empresa permita ventas con stock no confirmado; en ese caso la marca para revisión en la sincronización.  2. Si el Empleado intenta pagar con tarjeta o QR, el sistema indica que sin conexión solo se aceptan pagos en efectivo.  3. Si el monto recibido es menor que el total, el sistema no permite confirmar la venta.  4. Si la aplicación se cierra antes de confirmar, la venta en curso se conserva como borrador y se recupera al abrirla.  5. Si la sesión guardada superó el tiempo máximo sin conexión, el sistema pide al Empleado su PIN local antes de continuar. |
| Poscondiciones: | La venta queda guardada en el almacenamiento local con estado "Registrada localmente", persiste aunque se cierre la aplicación y queda en la cola para su sincronización (CU17). |

 

CU15: Registrar reserva de prendas sin conexión

|  |  |
| --- | --- |
| Nombre: | Registrar reserva de prendas sin conexión |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite registrar la reserva de prendas para un cliente cuando no hay Internet, apartando la existencia local y guardando la operación para confirmarla al sincronizar. |
| Actores: | Encargado de sucursal, Empleado. |
| Precondiciones: | El dispositivo debe estar preparado (CU12) y el plan de la empresa debe permitir la operación sin conexión. |
| Flujo Normal: | 1. El actor selecciona "Nueva reserva" en modo sin conexión.  2. El actor selecciona o registra al cliente con datos mínimos.  3. El actor agrega las prendas y variantes que el cliente desea apartar.  4. El sistema valida la existencia local conocida y calcula la fecha y hora límite de retiro según la política.  5. El actor registra, si corresponde, el depósito en efectivo.  6. El sistema genera un uuidOperacion y guarda la reserva con su empresa, sucursal, usuario, fechaOperacion, origenRegistro “sin conexión”, estado “Registrada localmente” y su detalle de prendas (detalle\_reserva). Luego aparta la existencia local y la agrega a la cola de pendientes.  7. El sistema entrega al cliente un comprobante provisional indicando que la reserva será confirmada al restablecerse la conexión. |
| Flujo Alternativo: | 1. Si la existencia local es cero, el sistema no permite reservar esa variante.  2. Si al sincronizar la reserva es rechazada por falta de stock, el sistema la marca en conflicto (CU18) para notificar al cliente y devolver el depósito.  3. Si el cliente cancela la reserva antes de sincronizar, el sistema cambia su estado local a "Cancelada" y libera la existencia apartada; la cancelación también se sincroniza. |
| Poscondiciones: | La reserva queda guardada localmente con estado "Registrada localmente", con existencia apartada y en la cola de sincronización. |

 

CU16: Consultar operaciones pendientes y resultado de sincronización

|  |  |
| --- | --- |
| Nombre: | Consultar operaciones pendientes y resultado de sincronización |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al usuario ver las ventas, reservas y cambios registrados en el dispositivo, su estado de sincronización y el motivo de los rechazos o conflictos. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | El actor debe tener acceso a la aplicación en el dispositivo (con o sin conexión). |
| Flujo Normal: | 1. El actor ingresa a "Operaciones pendientes".  2. El sistema muestra las operaciones locales con su tipo, UUID, fecha y hora, total y estado: Registrada localmente, Enviada, Confirmada, Rechazada o En conflicto.  3. El actor filtra por tipo, estado o fecha.  4. El actor selecciona una operación.  5. El sistema muestra su detalle, la cantidad de intentos de envío, la fecha del último intento, el identificador asignado por el servidor (si fue confirmada) y el motivo del rechazo o conflicto. |
| Flujo Alternativo: | 1. Si no hay operaciones, el sistema muestra "No hay operaciones pendientes".  2. Si hay conexión, el actor puede pulsar "Sincronizar ahora", que ejecuta el CU17.  3. Si una operación está en conflicto, el sistema muestra un acceso a su resolución (CU18) para usuarios con permiso. |
| Poscondiciones: | El actor conoce el estado real de cada operación registrada en su dispositivo. |

 

CU17: Sincronizar operaciones pendientes

|  |  |
| --- | --- |
| Nombre: | Sincronizar operaciones pendientes |
| Autor: |  |
| Fecha: |  |
| Descripción: | Proceso que el sistema ejecuta automáticamente al recuperar la conexión (o cuando el usuario lo solicita) para enviar al servidor las operaciones registradas sin conexión, garantizando que ninguna se pierda ni se registre dos veces (idempotencia), y actualizar su estado local según la respuesta. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | Debe existir al menos una operación en estado "Registrada localmente" o "Enviada" y el dispositivo debe recuperar la conexión, o el usuario debe pulsar "Sincronizar ahora". |
| Flujo Normal: | 1. El sistema detecta la conexión y renueva el token de sesión.  2. El sistema toma las operaciones pendientes en el orden en que se registraron y las marca como "Enviada", sin borrarlas del almacenamiento local.  3. El sistema envía el lote al servidor; cada operación lleva su UUID como clave de idempotencia, su empresa y su sucursal.  4. El servidor valida que la empresa y la sucursal de cada operación correspondan al usuario autenticado y que la suscripción esté activa.  5. El servidor verifica si el UUID ya fue procesado; si es así, devuelve el resultado anterior sin registrar nada nuevo.  6. Para cada operación nueva, el servidor valida existencias, precios y reglas de negocio, y registra la venta, reserva o cambio junto con su movimiento de inventario en una sola transacción.  7. El servidor responde por cada operación: "Confirmada" con su identificador en el servidor, "Rechazada" o "En conflicto" con su motivo.  8. Si una venta registrada sin conexión es rechazada, el sistema avisa al cliente (aplicación y correo) "Le devolvemos Bs X de su compra" y al personal "Devolver Bs X de una venta sin conexión". Si quedan operaciones en conflicto, avisa al personal para que las revise (CU18). |
| Flujo Alternativo: | 1. Si la conexión se pierde durante el envío, las operaciones conservan el estado "Enviada" y el sistema reintenta con intervalos crecientes.  2. Si el servidor registró la operación pero la respuesta no llegó, el reenvío con el mismo UUID devuelve la confirmación original sin duplicar la venta.  3. Si el servidor responde con error interno, las operaciones vuelven a la cola y se reintentan; nunca se eliminan del almacenamiento local.  4. Si una operación depende de otra (por ejemplo, un cambio sobre una venta hecha sin conexión), el sistema envía primero la operación de la que depende.  5. Si la suscripción de la empresa fue suspendida, el servidor acepta las operaciones registradas antes de la fecha de suspensión y rechaza las posteriores.  6. Si la sesión no puede renovarse, el sistema pide iniciar sesión nuevamente y conserva todas las operaciones.  7. Si una operación pertenece a otra empresa o sucursal no autorizada, el servidor la rechaza y la operación queda en el dispositivo para revisión del administrador. |
| Poscondiciones: | Cada operación queda Confirmada, Rechazada o En conflicto, sin duplicados en el servidor, y el dispositivo tiene datos actualizados. |

 

CU18: Resolver conflictos de sincronización

|  |  |
| --- | --- |
| Nombre: | Resolver conflictos de sincronización |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al encargado resolver las operaciones sin conexión que el servidor no pudo confirmar automáticamente porque los datos locales no coincidían con los del servidor. |
| Actores: | Encargado de sucursal, Administrador de empresa. |
| Precondiciones: | Debe existir al menos una operación en estado "En conflicto" y el actor debe tener permiso sync.resolver. |
| Flujo Normal: | 1. El actor ingresa a "Conflictos de sincronización".  2. El sistema lista los conflictos con su tipo: stock insuficiente en el servidor, precio local desactualizado, producto desactivado, cliente duplicado o reserva sin existencia.  3. El actor selecciona un conflicto y el sistema muestra lo que se registró en el dispositivo comparado con los datos del servidor.  4. Para una venta con stock insuficiente, en la que la prenda ya fue entregada al cliente, el actor elige "Aceptar venta con ajuste": el sistema confirma la venta y registra un ajuste de inventario con alerta de discrepancia para revisión.  5. Para una venta con precio desactualizado, el actor elige "Respetar precio cobrado": el sistema confirma la venta y registra la diferencia como descuento autorizado.  6. El sistema cambia el estado de la operación a "Confirmada" y registra en la bitácora la decisión y el usuario. |
| Flujo Alternativo: | 1. Si la venta no se concretó físicamente, el actor elige "Anular venta" y el sistema registra la anulación y el egreso de caja correspondiente, y avisa al cliente "Le devolvemos Bs X" para que retire su dinero en la sucursal.  2. Para una reserva sin existencia, el actor la reasigna a otra variante o sucursal, o la cancela; el sistema avisa al cliente del cambio en su reserva  3. Para un cliente duplicado, el actor elige fusionar el cliente nuevo con el existente.  4. Si el conflicto supera el umbral de monto, solo el Administrador de empresa puede resolverlo. |
| Poscondiciones: | El conflicto queda resuelto, la operación queda Confirmada o Anulada y el inventario y la caja son consistentes con lo que ocurrió en la tienda. |

 

CU19: Registrar cambio de prenda sin conexión

|  |  |
| --- | --- |
| Nombre: | Registrar cambio de prenda sin conexión |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite atender sin Internet un cambio sencillo de talla o color, con las restricciones necesarias para no perder control del dinero, y dejarlo pendiente de validación en el servidor. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | El dispositivo debe estar preparado (CU12), la caja debe estar abierta y la venta original debe estar en el almacenamiento local (una venta reciente descargada o una venta registrada sin conexión en ese dispositivo). |
| Flujo Normal: | 1. El actor busca la venta original en el almacenamiento local.  2. El sistema valida el plazo de cambio con la política descargada y las cantidades disponibles para cambio.  3. El actor inspecciona la prenda y registra el resultado (CU3, versión local).  4. El actor selecciona la nueva talla o color del mismo modelo con existencia local.  5. El sistema calcula la diferencia; si es a cobrar, el actor la recibe en efectivo.  6. El sistema guarda la operación "Cambio" con su UUID, la referencia a la venta original y el estado "Registrada localmente", ajusta la existencia local y emite un comprobante provisional. |
| Flujo Alternativo: | 1. Si la nueva variante es más barata, el sistema no entrega dinero sin conexión: registra el saldo a favor como un reembolso en efectivo pendiente. Al sincronizar, el personal lo entrega desde la caja y el cliente recibe su nota de devolución (CU7).  2. Si el cliente pide reembolso o cambio por otro producto, el sistema indica que requiere conexión.  3. Si la venta original no está en el almacenamiento local, el actor puede registrar una "Recepción en custodia" de la prenda con comprobante para el cliente; el cambio se completa al recuperar la conexión.  4. Si al sincronizar el servidor determina que el cambio no cumplía la política, la operación queda en conflicto (CU18). |
| Poscondiciones: | El cambio queda registrado localmente, con la diferencia cobrada en efectivo o el saldo a favor pendiente de devolver en efectivo, y en la cola de sincronización. |

 

CU20: Gestionar apertura y cierre de caja

|  |  |
| --- | --- |
| Nombre: | Gestionar apertura y cierre de caja |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite abrir la caja de la sucursal con un monto inicial y cerrarla con el arqueo, considerando las ventas en efectivo, las diferencias cobradas en cambios y los reembolsos, con o sin conexión. |
| Actores: | Empleado, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado y asignado a la sucursal. |
| Flujo Normal: | 1. El Empleado selecciona "Abrir caja" e ingresa el monto inicial en efectivo.  2. El sistema registra la apertura con fecha, hora, usuario y sucursal (localmente si no hay conexión).  3. Durante la jornada, el sistema registra como ingresos las ventas en efectivo y las diferencias cobradas en cambios, y como egresos los reembolsos en efectivo.  4. Al final de la jornada, el Empleado selecciona "Cerrar caja" e ingresa el efectivo contado.  5. El sistema calcula el monto esperado (inicial + ingresos − egresos), muestra la diferencia (sobrante o faltante) y el resumen por tipo de operación.  6. El Empleado confirma el cierre y el sistema registra el arqueo. |
| Flujo Alternativo: | 1. Si la diferencia supera el umbral configurado, el sistema exige una justificación y la aprobación del Encargado de sucursal.  2. Si hay operaciones sin sincronizar, el sistema registra un cierre provisional y lo convierte en definitivo cuando todas las operaciones de la jornada se confirman.  3. Si el Empleado intenta abrir una caja que ya está abierta, el sistema muestra la caja abierta existente. |
| Poscondiciones: | La caja queda abierta o cerrada con su arqueo registrado e incluye las operaciones realizadas sin conexión. |

 

CU21: Registrar empresa contratante (tenant)

|  |  |
| --- | --- |
| Nombre: | Registrar empresa contratante (tenant) |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al administrador de la plataforma registrar una nueva empresa cliente, asignarle un plan y crear su administrador, generando su entorno lógico independiente. |
| Actores: | Administrador de plataforma. |
| Precondiciones: | El actor debe estar autenticado con rol Administrador de plataforma. |
| Flujo Normal: | 1. El actor ingresa a "Empresas" y pulsa "Nueva empresa".  2. El sistema muestra el formulario: razón social, NIT, identificador corto (slug), plan, fecha de inicio y fecha de vencimiento de la suscripción, y nombre y correo del administrador.  3. El actor completa los datos y confirma.  4. El sistema valida que el NIT, el slug y el correo no estén registrados.  5. El sistema crea en una sola transacción el tenant, su suscripción y el usuario Administrador de empresa asociado al nuevo idTenant, junto con la política de devoluciones por defecto.  6. El sistema envía al administrador un correo de activación para definir su contraseña y registra la operación en la bitácora. |
| Flujo Alternativo: | 1. Si el NIT, el slug o el correo ya existen, el sistema marca el campo y no registra la empresa.  2. Si la fecha de vencimiento es anterior a la de inicio, el sistema muestra un error.  3. Si falla el envío del correo, la empresa queda registrada y el actor puede reenviar la activación. |
| Poscondiciones: | La empresa queda registrada como tenant activo con su plan, suscripción y administrador, aislada de las demás empresas. |

 

CU22: Administrar estado de las suscripciones

|  |  |
| --- | --- |
| Nombre: | Administrar estado de las suscripciones |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al administrador de la plataforma consultar, renovar, suspender y reactivar las suscripciones de las empresas; el sistema también controla automáticamente los vencimientos. |
| Actores: | Administrador de plataforma. |
| Precondiciones: | El actor debe estar autenticado con rol Administrador de plataforma. |
| Flujo Normal: | 1. El actor ingresa a "Suscripciones".  2. El sistema lista las empresas con su plan, fecha de inicio, fecha de vencimiento y estado: Activa, Por vencer, En periodo de gracia, Suspendida o Cancelada.  3. El actor selecciona una empresa y elige "Renovar".  4. El sistema registra administrativamente el pago simulado, extiende la fecha de vencimiento según el periodo elegido y cambia el estado a "Activa".  5. El sistema registra la operación en la bitácora y notifica al administrador de la empresa. |
| Flujo Alternativo: | 1. El actor puede suspender una suscripción registrando el motivo; los usuarios de esa empresa ya no pueden operar.  2. El actor puede reactivar una suscripción suspendida.  3. Cada día, el sistema notifica a las empresas cuya suscripción vence pronto; al vencer, pasa la suscripción a "En periodo de gracia" (solo consulta) y, al terminar la gracia, a "Suspendida".  4. Las operaciones sin conexión registradas antes de la suspensión se aceptan al sincronizar (CU17), para no perder ventas reales. |
| Poscondiciones: | La suscripción de cada empresa refleja su estado real y las restricciones se aplican de inmediato. |

 

CU23: Configurar planes de suscripción

|  |  |
| --- | --- |
| Nombre: | Configurar planes de suscripción |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite definir y modificar desde el backend los planes de la plataforma, con sus límites (sucursales, usuarios, productos) y funcionalidades habilitadas (IA, operación sin conexión). |
| Actores: | Administrador de plataforma. |
| Precondiciones: | El actor debe estar autenticado con rol Administrador de plataforma. |
| Flujo Normal: | 1. El actor ingresa a "Planes".  2. El sistema muestra los planes con su precio mensual, límites y funcionalidades.  3. El actor crea un plan o edita uno existente, indicando el máximo de sucursales activas, usuarios y productos (−1 para ilimitado) y si permite reportes generativos con IA, operación sin conexión y varias sucursales.  4. El sistema valida los valores y guarda el plan.  5. El sistema registra el cambio en la bitácora. |
| Flujo Alternativo: | 1. Si al reducir un límite hay empresas que ya lo superan, el sistema lista esas empresas y aplica el nuevo límite solo a nuevas altas, manteniendo el uso actual de las existentes hasta que cambien de plan.  2. Un plan con empresas asociadas no puede eliminarse; solo puede desactivarse para nuevas contrataciones.  3. Si el código del plan ya existe, el sistema muestra un error. |
| Poscondiciones: | Los planes quedan configurados y el sistema aplica sus límites y funcionalidades a las empresas que los tienen. |

 

CU24: Gestionar empleados y asignación a sucursales

|  |  |
| --- | --- |
| Nombre: | Gestionar empleados y asignación a sucursales |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al administrador de la empresa registrar empleados, asignarles un rol y una o varias sucursales, y darlos de baja, respetando el límite de usuarios del plan. |
| Actores: | Administrador de empresa. |
| Precondiciones: | El actor debe estar autenticado con permiso usuario.admin y la suscripción debe estar activa. |
| Flujo Normal: | 1. El actor ingresa a "Personal" y pulsa "Nuevo empleado".  2. El sistema muestra el formulario: nombre, correo, rol (Encargado de sucursal o Empleado) y sucursales asignadas.  3. El actor completa los datos y confirma.  4. El sistema verifica el límite de usuarios del plan y que las sucursales pertenezcan a la empresa.  5. El sistema crea el usuario con el idTenant de la empresa, sus sucursales y su rol, y envía el correo de activación. |
| Flujo Alternativo: | 1. Si se alcanzó el límite de usuarios del plan, el sistema informa que debe mejorar el plan.  2. Si el correo ya está registrado en la plataforma, el sistema muestra "El correo ya está en uso" sin indicar a qué empresa pertenece.  3. Al dar de baja a un empleado, el sistema invalida sus sesiones; las operaciones sin conexión que registró antes de la baja se siguen aceptando al sincronizar.  4. Si el actor intenta modificar un usuario de otra empresa, el sistema responde "Usuario no encontrado". |
| Poscondiciones: | El empleado queda registrado, asignado a sus sucursales con su rol, o dado de baja sin perder la trazabilidad de sus operaciones. |

 

CU25: Verificar límites y funcionalidades del plan

|  |  |
| --- | --- |
| Nombre: | Verificar límites y funcionalidades del plan |
| Autor: |  |
| Fecha: |  |
| Descripción: | Proceso que el backend ejecuta en cada solicitud de cualquier usuario para comprobar su empresa, el estado de su suscripción y si su plan permite la funcionalidad o el recurso solicitado, sin depender de que la interfaz oculte opciones. |
| Actores: | Administrador de empresa, Encargado de sucursal, Empleado, Cliente. |
| Precondiciones: | Debe recibirse una solicitud autenticada a la API. |
| Flujo Normal: | 1. El sistema obtiene el idTenant, el rol y los permisos desde el token de sesión.  2. El sistema consulta la suscripción y el plan vigentes de la empresa (con caché de corta duración).  3. El sistema verifica que la suscripción esté activa.  4. El sistema verifica que la funcionalidad solicitada esté habilitada en el plan (por ejemplo, reportes generativos con IA u operación sin conexión).  5. Si la operación crea un recurso con límite (sucursal, usuario o producto), el sistema compara el uso actual con el límite del plan.  6. El sistema permite la operación y filtra toda consulta por el idTenant del usuario. |
| Flujo Alternativo: | 1. Si la funcionalidad no está incluida en el plan, el sistema responde "Funcionalidad no incluida en su plan" con la sugerencia de mejorar el plan.  2. Si se alcanzó el límite, el sistema rechaza la creación indicando el recurso y el límite.  3. Si la suscripción está en periodo de gracia, el sistema solo permite operaciones de consulta.  4. Si la suscripción está suspendida o cancelada, el sistema rechaza la solicitud. |
| Poscondiciones: | Solo se ejecutan las operaciones permitidas por el plan y el estado de la suscripción de la empresa del usuario. |

 

CU26: Solicitar reporte generativo en lenguaje natural

|  |  |
| --- | --- |
| Nombre: | Solicitar reporte generativo en lenguaje natural |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al usuario autorizado pedir un reporte escribiendo en lenguaje natural; la IA interpreta la solicitud y el backend construye y ejecuta una consulta controlada sobre los datos reales de su empresa, mostrando el resultado en tabla o gráfico. |
| Actores: | Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado con permiso reporte.ia y su empresa debe tener un plan con reportes generativos (Profesional). |
| Flujo Normal: | 1. El actor ingresa a "Reportes con IA" y escribe su solicitud, por ejemplo: "Mostrame las ventas de septiembre agrupadas por sucursal".  2. El sistema envía al servicio de IA la solicitud junto con el catálogo de métricas, dimensiones y filtros permitidos (no el esquema de la base de datos).  3. El servicio de IA devuelve la interpretación estructurada: tipo de reporte, métricas, agrupaciones, filtros (fechas, sucursales, categorías, productos), orden, límite y tipo de visualización sugerido.  4. El backend valida la interpretación contra la lista de operaciones permitidas, agrega el filtro del idTenant del token y restringe las sucursales según el rol del actor.  5. El backend construye una consulta parametrizada de solo lectura y la ejecuta con tiempo y cantidad de filas máximos.  6. El sistema muestra el reporte en tabla o gráfico (barras, líneas o torta según el tipo de dato), los filtros aplicados y un resumen narrativo generado por la IA a partir de los resultados.  7. El actor puede ajustar los filtros o pedir otro reporte, guardar la solicitud como favorita o exportarlo (CU28). |
| Flujo Alternativo: | 1. Si la solicitud es ambigua (por ejemplo, "los productos más vendidos" sin indicar si es por unidades o por ingresos, o "este mes" al inicio de un mes), el sistema pregunta mostrando opciones para elegir.  2. Si la solicitud está incompleta (falta el período), el sistema aplica un valor por defecto, como el mes actual, y lo indica en los filtros aplicados.  3. Si la solicitud no es soportada o intenta modificar datos (por ejemplo, "borrá las ventas de ayer"), el sistema la rechaza y muestra ejemplos de reportes disponibles.  4. Si la solicitud pide información de otra empresa, el sistema la rechaza; ningún dato fuera del idTenant es consultado.  5. Si un Encargado de sucursal pide datos de otras sucursales, el sistema limita el reporte a su sucursal e informa la restricción.  6. Si no hay datos para los filtros, el sistema muestra "No hay datos para el período o filtros indicados".  7. Si el plan es Básico, el CU25 rechaza el acceso y el sistema sugiere mejorar el plan. |
| Poscondiciones: | El actor obtiene un reporte construido dinámicamente con datos reales de su empresa y la solicitud queda registrada en el historial de reportes. |

 

CU27: Solicitar reporte generativo por voz

|  |  |
| --- | --- |
| Nombre: | Solicitar reporte generativo por voz |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite al usuario dictar su solicitud de reporte; el sistema la convierte a texto, permite revisarla y continúa con la generación del reporte. |
| Actores: | Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | Las mismas del CU26, además de un micrófono disponible y conexión a Internet. |
| Flujo Normal: | 1. El actor pulsa el ícono de micrófono en "Reportes con IA".  2. El sistema solicita permiso para usar el micrófono y comienza a grabar.  3. El actor dicta su solicitud y pulsa "Detener".  4. El sistema convierte el audio a texto y muestra la transcripción.  5. El actor confirma o corrige la transcripción.  6. El sistema continúa con el flujo del CU26 desde el paso 2. |
| Flujo Alternativo: | 1. Si el actor no concede el permiso del micrófono, el sistema mantiene disponible la escritura.  2. Si la transcripción tiene baja confianza o hubo mucho ruido, el sistema pide repetir la solicitud o escribirla.  3. Si no hay conexión, la opción de voz no está disponible. |
| Poscondiciones: | La solicitud dictada se procesa igual que una solicitud escrita. |

 

CU28: Exportar reporte a PDF o Excel

|  |  |
| --- | --- |
| Nombre: | Exportar reporte a PDF o Excel |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite descargar un reporte generado (convencional o generativo) en PDF o Excel con un formato de reporte formal construido dinámicamente según su contenido. |
| Actores: | Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | Debe existir un reporte generado en pantalla (CU24 del primer parcial o CU26). |
| Flujo Normal: | 1. El actor pulsa "Exportar" y elige PDF o Excel.  2. El sistema arma el documento con un encabezado (nombre y logo de la empresa, título del reporte, filtros aplicados, fecha de generación y usuario), la tabla de datos con totales y subtotales, el gráfico y el resumen narrativo.  3. En Excel, el sistema agrega una hoja con los datos sin formato para análisis.  4. El sistema descarga el archivo y registra la exportación en la bitácora. |
| Flujo Alternativo: | 1. Si el reporte supera la cantidad de filas permitida para la descarga directa, el sistema lo genera en segundo plano y notifica al actor cuando esté listo.  2. Si el reporte no tiene datos, el sistema no permite exportarlo. |
| Poscondiciones: | El actor obtiene el reporte en el formato elegido, identificado con su empresa y los filtros aplicados. |

 

CU29: Entrenar y evaluar modelos de Machine Learning

|  |  |
| --- | --- |
| Nombre: | Entrenar y evaluar modelos de Machine Learning |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite preparar los datos (reales y sintéticos), entrenar modelos supervisados (predicción de demanda y probabilidad de devolución por talla) y no supervisados (segmentación de clientes y detección de anomalías), evaluarlos y publicar los que cumplan las métricas mínimas. |
| Actores: | Administrador de empresa. |
| Precondiciones: | El actor debe estar autenticado con permiso ia.modelos y el plan de la empresa debe incluir IA. |
| Flujo Normal: | 1. El actor ingresa a "Modelos de IA" y selecciona el modelo a entrenar.  2. El sistema muestra la cantidad de datos reales disponibles de la empresa y ofrece completarlos con datos sintéticos según parámetros (cantidad de registros, período, estacionalidad).  3. El actor confirma la fuente de datos y las variables.  4. El servicio de IA genera los datos sintéticos si se pidieron, limpia y transforma los datos (valores faltantes, codificación de categorías, normalización) y los divide en entrenamiento y prueba.  5. El servicio de IA entrena el modelo y calcula sus métricas (MAE y R² para predicción, exactitud y F1 para clasificación, coeficiente de silueta para segmentación).  6. El sistema muestra las métricas comparadas con la versión anterior del modelo.  7. El actor publica la nueva versión y el sistema la usa en el dashboard (CU30). |
| Flujo Alternativo: | 1. Si los datos reales no alcanzan el mínimo, el sistema recomienda usar datos sintéticos e indica en el modelo que fue entrenado con ellos.  2. Si las métricas no alcanzan el umbral mínimo, el sistema no permite publicar la versión.  3. Si el entrenamiento falla, el sistema registra el error y conserva la versión publicada anterior.  4. Los datos de entrenamiento solo incluyen información de la empresa del actor. |
| Poscondiciones: | Queda una nueva versión del modelo registrada con sus métricas y, si fue publicada, disponible para el dashboard analítico. |

 

CU30: Visualizar dashboard analítico inteligente

|  |  |
| --- | --- |
| Nombre: | Visualizar dashboard analítico inteligente |
| Autor: |  |
| Fecha: |  |
| Descripción: | Permite visualizar los indicadores del negocio junto con los resultados de los modelos de Machine Learning: predicciones de demanda, segmentos de clientes, anomalías detectadas y métricas de evaluación. |
| Actores: | Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | El actor debe estar autenticado, el plan debe incluir IA y debe existir al menos un modelo publicado (CU29). |
| Flujo Normal: | 1. El actor ingresa a "Dashboard analítico".  2. El sistema muestra los indicadores principales (ventas, ticket promedio, rotación de stock, tasa de devoluciones) del período y sucursal seleccionados.  3. El sistema muestra la predicción de demanda por producto y sucursal para las próximas semanas, con recomendaciones de reposición.  4. El sistema muestra los segmentos de clientes encontrados con sus características y las anomalías detectadas (ventas atípicas, devoluciones inusuales de una talla o producto).  5. El sistema muestra las métricas del modelo usado y una interpretación narrativa generada por la IA.  6. El actor cambia los filtros de período, sucursal o categoría y el sistema actualiza los gráficos. |
| Flujo Alternativo: | 1. Si no hay modelos publicados, el sistema muestra solo los indicadores convencionales y un acceso al CU29.  2. El Encargado de sucursal solo ve la información de su sucursal.  3. Si el plan es Básico, el CU25 rechaza el acceso a las secciones de IA. |
| Poscondiciones: | El actor visualiza indicadores y resultados de los modelos de su empresa para apoyar la toma de decisiones. |

CU31: Recoger a domicilio la prenda devuelta

|  |  |
| --- | --- |
| Nombre | Recoger a domicilio la prenda devuelta |
| Autor |  |
| Fecha | 08/11/2026 |
| Descripción | Permite que, en lugar de llevar la prenda a la sucursal, el cliente pida que la recojan en su casa, y que el personal programe y registre el recojo hasta que la prenda llega a la sucursal para su inspección. |
| Actores | Cliente, Empleado, Encargado de sucursal. |
| Precondiciones | Debe existir una solicitud registrada en el CU2 en estado "Pendiente de entrega" y la política de la empresa debe ofrecer recojo y entrega a domicilio (CU9). |
| Flujo Normal | 1. En el CU2, el cliente elige "Que la recojan en mi casa" e indica dirección, referencia, teléfono, fecha preferida y franja horaria (mañana o tarde). 2. El sistema valida los datos, calcula el costo del viaje según la política y registra el recojo como "Solicitado". 3. El actor ingresa a "Devoluciones > Recojos y entregas" y ve los recojos solicitados. 4. El actor programa el recojo con su fecha, franja y repartidor; el sistema lo marca como "Programado" y avisa al cliente. 5. El repartidor recoge la prenda y la lleva a la sucursal; el actor registra el recojo como "Completado". 6. El sistema pasa la solicitud a "En inspección", avisa al cliente "Recogimos su prenda" y continúa con el CU3. |
| Flujo Alternativo | 1. Si la empresa no ofrece recojo a domicilio, el sistema solo permite elegir una sucursal. 2. Si faltan la dirección o el teléfono, la franja no es mañana o tarde, o la fecha preferida es anterior a hoy, el sistema no registra el recojo. 3. Si el repartidor no encuentra al cliente, el actor registra el viaje como "Fallido" con el motivo; el sistema avisa al cliente y el viaje se vuelve a programar. Desde el segundo intento fallido, el aviso le ofrece también acercarse a la sucursal con su código. 4. Si se cancela el recojo, el cliente vuelve a tener plazo para llevar la prenda a la sucursal y no se le cobra el viaje. 5. El viaje es gratis si el motivo es defecto de fábrica o prenda equivocada; si no, su costo se descuenta del valor de la prenda devuelta. 6. Mientras la prenda siga en la casa del cliente, el sistema no permite inspeccionarla y la solicitud no se anula por vencimiento. |
| Poscondiciones | La prenda devuelta queda en la sucursal, la solicitud en "En inspección" y el viaje registrado con su fecha, repartidor y costo. |

CU32: Entregar a domicilio la prenda del cambio

|  |  |
| --- | --- |
| Nombre: | Entregar a domicilio la prenda del cambio |
| Autor: |  |
| Fecha: | 08/11/2026 |
| Descripción: | Permite enviar a la casa del cliente la prenda nueva de un cambio cuya solicitud se hizo con delivery, y registrar la entrega hasta completar el caso. |
| Actores: | Empleado, Encargado de sucursal, Cliente. |
| Precondiciones: | La inspección debe haber aprobado la prenda (CU3), el caso debe ser un cambio (CU4, CU5 o CU8) y la solicitud debe haberse hecho con recojo a domicilio (CU31). |
| Flujo Normal: | 1. Al resolver el cambio, la prenda nueva sale del stock y el sistema registra su entrega a domicilio con la dirección del cliente; el caso pasa a "En camino a domicilio". 2. El sistema suma el costo del viaje a la diferencia del cambio, según la política. 3. El actor programa la entrega en "Devoluciones > Recojos y entregas" con su fecha, franja y repartidor; el sistema avisa al cliente. 4. El repartidor entrega la prenda y el actor registra la entrega como "Completado". 5. El sistema da el caso por "Completada" y avisa al cliente. |
| Flujo Alternativo: | 1. Si el caso es una devolución con reembolso, no hay entrega: solo el recojo del CU31. 2. Si el repartidor no encuentra al cliente, el actor registra el viaje como "Fallido" con el motivo; el sistema avisa al cliente y el viaje se vuelve a programar. Desde el segundo intento fallido, el aviso le ofrece también acercarse a la sucursal con su código. 3. Si el cliente prefiere retirar la prenda en la sucursal, el actor se la entrega allí y completa el caso. 4. El viaje es gratis si el motivo de la devolución fue defecto de fábrica o prenda equivocada. |
| Poscondiciones: | El cliente recibe la prenda nueva en su casa, el caso queda "Completada" y el viaje registrado con su fecha, repartidor y costo. |

CU33: Obtener y usar un cupón de descuento por compras

|  |  |
| --- | --- |
| Nombre: | Obtener y usar un cupón de descuento por compras |
| Autor: |  |
| Fecha: | 08/11/2026 |
| Descripción: | Premia a los clientes frecuentes: cada 3 compras en una empresa, el sistema le emite al cliente un cupón del 30% para su siguiente compra en esa empresa. |
| Actores: | Cliente, Empleado. |
| Precondiciones: | El cliente debe estar identificado en la compra. Cuentan las compras hechas en la misma empresa desde que se inició el programa de cupones. |
| Flujo Normal: | 1. Cuando el cliente completa una compra (en línea, en el punto de venta o sin conexión), el sistema cuenta sus compras válidas en esa empresa. 2. Al llegar a 3, 6, 9… compras, el sistema emite un cupón del 30% con un código único, válido por 90 días y de un solo uso, y avisa al cliente (aplicación y correo). 3. El cliente ve sus cupones y cuántas compras le faltan para el próximo en su perfil (web) o en "Mis cupones" (aplicación móvil). 4. Al pagar, el cliente (en el checkout o el carrito) o el Empleado (en el punto de venta) elige el cupón. 5. El sistema valida que el cupón sea del cliente, de esa empresa, esté disponible y no haya vencido, y calcula el precio con descuento. 6. Al confirmar el pago, el sistema registra el precio con descuento en cada línea de la venta y marca el cupón como "Usado". |
| Flujo Alternativo: | 1. Una compra devuelta por completo no cuenta para el próximo cupón. 2. Sin conexión, las compras suman para el próximo cupón, pero no se puede usar un cupón porque no hay cómo validarlo. 3. Si el cupón venció, queda como "Vencido" y no se puede usar. 4. Dos compras al mismo tiempo no pueden usar el mismo cupón: el sistema lo bloquea mientras lo valida. 5. El cupón no descuenta el costo del envío a domicilio (CU35). 6. Las compras hechas antes de iniciar el programa no generan cupones. |
| Poscondiciones: | El cupón queda emitido o usado y la venta guarda el precio con descuento, para que una devolución posterior reembolse lo que el cliente realmente pagó. |

CU34: Avisar cuando vuelve el stock de una tall

|  |  |
| --- | --- |
| Nombre: | Avisar cuando vuelve el stock de una talla |
| Autor: |  |
| Fecha: | 08/11/2026 |
| Descripción: | Permite al cliente pedir que le avisen cuando una talla agotada vuelve a tener existencia. |
| Actores: | Cliente. |
| Precondiciones: | El cliente debe haber iniciado sesión y la talla elegida debe estar agotada. |
| Flujo Normal: | 1. En el detalle de una prenda, el cliente elige una talla agotada. 2. El sistema muestra la opción "Avisame cuando vuelva". 3. El cliente la pulsa y el sistema registra el aviso como "Pendiente". 4. Cuando vuelve a haber existencia de esa talla (ingreso de mercadería, traslado, devolución, reserva cancelada o una corrección de inventario), el sistema detecta la reposición. 5. El sistema avisa al cliente en la aplicación y por correo, y marca el aviso como "Avisado". 6. El cliente puede ver y cancelar sus avisos en "Perfil > Avisos de stock". |
| Flujo Alternativo: | 1. Si el cliente ya tiene un aviso pendiente para esa talla, el sistema no registra otro. 2. Si el cliente cancela el aviso, queda como "Cancelado" y no se le avisa. |
| Poscondiciones: | El cliente recibe el aviso cuando la talla vuelve a estar disponible y el aviso queda registrado como avisado o cancelado. |

CU35: Entregar a domicilio una compra en línea

|  |  |
| --- | --- |
| Nombre: | Entregar a domicilio una compra en línea |
| Autor: |  |
| Fecha: | 08/11/2026 |
| Descripción: | Permite al cliente recibir en su casa una compra hecha en la tienda en línea, pagando el envío junto con la compra, y al personal programar y registrar la entrega. |
| Actores: | Cliente, Empleado, Encargado de sucursal. |
| Precondiciones: | La compra debe hacerse en la tienda en línea (web o aplicación) y la política de la empresa debe ofrecer envío a domicilio (CU9). |
| Flujo Normal: | 1. Al pagar, el cliente elige "Retiro en sucursal" o "Envío a domicilio". 2. Si elige el envío, indica dirección, referencia, teléfono, fecha preferida y franja horaria (mañana o tarde). 3. El sistema suma al total el costo del envío que fija la política (por defecto Bs 15). 4. Al confirmarse el pago, el sistema registra el pedido a domicilio como "Solicitado". 5. El actor programa el envío en "Devoluciones > Recojos y entregas" con su fecha, franja y repartidor. 6. El repartidor entrega la compra y el actor la registra como "Completado"; el sistema avisa al cliente "Entregamos su compra". 7. El cliente sigue el estado del envío en "Perfil > Mis pedidos a domicilio". |
| Flujo Alternativo: | 1. Si la tienda no hace envíos a domicilio, el sistema solo permite el retiro en sucursal. 2. Si faltan la dirección o el teléfono, o la franja no es mañana o tarde, el sistema no permite confirmar el envío. 3. El cupón de descuento (CU33) no se aplica al costo del envío. 4. Si el repartidor no encuentra al cliente, el actor registra el viaje como "Fallido" con el motivo; el sistema avisa al cliente y el viaje se vuelve a programar. Desde el segundo intento fallido, el aviso le ofrece también acercarse a la sucursal con su código. 5. El punto de venta de la tienda física no hace envíos. |
| Poscondiciones: | El cliente recibe su compra en su casa y el envío queda registrado con su costo, fecha y repartidor. |

CU36: Conversar con el asistente virtual

|  |  |
| --- | --- |
| Nombre: | Conversar con el asistente virtual (texto o voz) |
| Autor: |  |
| Fecha: | 08/11/2026 |
| Descripción: | Permite consultar a un asistente con inteligencia artificial, escribiendo o hablando, que responde según quién pregunta: visitantes, clientes o personal de la empresa. |
| Actores: | Visitante, Cliente, Administrador de empresa, Encargado de sucursal. |
| Precondiciones: | El visitante no necesita cuenta. El cliente y el personal deben haber iniciado sesión; el personal además necesita el permiso reporte.ia y un plan que incluya IA (CU25). |
| Flujo Normal: | 1. El actor abre el asistente: en la página de inicio (visitante), en la tienda (cliente) o en el portal del personal. 2. El actor escribe su pregunta o la dicta con el micrófono. 3. El sistema interpreta la pregunta con IA según el modo: el visitante consulta el catálogo; el cliente, el catálogo y sus propias compras y reservas; el personal, los datos del negocio de su empresa (y, si es Encargado, solo de sus sucursales). 4. El sistema responde en el chat y, si el actor lo pide, lee la respuesta en voz alta. 5. El personal puede pedir un reporte y el sistema lo genera en PDF, CSV o HTML para descargar. |
| Flujo Alternativo: | 1. En la página de inicio, cada dirección IP puede hacer como máximo 20 preguntas cada 10 minutos. 2. Si el navegador no puede reconocer la voz y hay una sesión iniciada, el sistema graba el audio y lo transcribe en el servidor. 3. Si no está configurada la clave de la IA, el asistente del personal arma los reportes con un motor de reglas y el del cliente avisa que no está disponible. 4. La IA solo interpreta el pedido: el sistema valida lo que se pide y consulta únicamente los datos permitidos para ese usuario. 5. Si el personal no tiene el permiso o el plan no incluye IA, el asistente del personal no está disponible. |
| Poscondiciones: | El actor obtiene la respuesta (y, si es personal, el reporte) usando solo los datos a los que tiene acceso. |

# CAPÍTULO III. ANÁLISIS Y DISEÑO CON ICONIX

## 3.1. Modelo de dominio

## 

## 3.2. Diagramas de robustez

## 

## 3.3. Diagramas de secuencia UML

## 3.4. Diagrama de clases UML

        

## 3.5. Diseño de la base de datos

## 

## 3.6. Diseño de interfaces de usuario

CU1 - Registrar solicitud de devolución o cambio en tienda

CU2 - Solicitar devolución o cambio desde la tienda en línea

CU3 -  Inspeccionar estado de la prenda devuelta

CU4 - Procesar cambio de talla, color o medida

CU5 - Procesar cambio por un producto diferente

CU6 - Procesar reembolso de dinero

 

CU8 - Gestionar cambio sin stock disponible

CU9 - Configurar política de devoluciones y cambios

CU10 - Actualizar inventario por devolución o cambio

CU12 -Preparar dispositivo para operación sin conexión

CU13 - Consultar catálogo, precios y existencias sin conexión

CU14 - Registrar venta de contado sin conexión

CU15 - Registrar reserva de prendas sin conexión

           

CU16 - Consultar operaciones pendientes y resultado de sincronización

CU17 - Sincronizar operaciones pendientes

CU18 - Resolver conflictos de sincronización

CU19- Registrar cambio de prenda sin conexión

CU20 - Gestionar apertura y cierre de caja

CU21 -Registrar empresa contratante (tenant)

CU22 - Administrar estado de las suscripciones

CU23 - Configurar planes de suscripción

        CU24 - Gestionar empleados y asignación a sucursales

CU25 - Verificar límites y funcionalidades del plan

CU26 - Solicitar reporte generativo en lenguaje natural

CU27 - Solicitar reporte generativo por voz

CU28 - Exportar reporte a PDF o Excel

CU29 - Entrenar y evaluar modelos de Machine Learning

CU30 - Visualizar dashboard analítico inteligente

CU31 - Recoger a domicilio la prenda devuelta

CU32 - Entregar a domicilio la prenda del cambio

CU33 - Obtener y usar un cupón de descuento por compras

CU34 - Avisar cuando vuelve el stock de una talla

CU35 - Entregar a domicilio una compra en línea  

CU36 - Conversar con el asistente virtual (texto o voz)

# CAPÍTULO IV. DESARROLLO E IMPLEMENTACIÓN

## 4.1. Herramientas y tecnologías utilizadas

* Backend: Python con FastAPI (API REST).
* Frontend Web & PWA: Angular con Service Worker e IndexedDB.
* Aplicación Móvil: Flutter con Dart.
* Base de Datos Central: PostgreSQL con aislamiento Multitenant.
* Inteligencia Artificial: Google Gemini (google-genai) para reportes y análisis generativos. Las librerías de Machine Learning (Scikit-Learn, Pandas) se incorporarán en la siguiente entrega.
* Metodología y Modelado: ICONIX con UML 2.5+.
* Pagos: Stripe.
* Almacenamiento de archivos y respaldos: Supabase Storage.

## 4.2. Diseño de la arquitectura del sistema

### 4.2.1 Diseño lógico

### 4.2.2 Diseño físico

### 4.2.3 Diseño de redes

## 4.3. Implementación de la base de datos

CREATE TABLE "plan" (

    "idPlan"               SERIAL PRIMARY KEY,

    "codigo"               VARCHAR(30)   NOT NULL UNIQUE,

    "nombre"               VARCHAR(60)   NOT NULL,

    "descripcion"          VARCHAR(255),

    "precioMensual"        NUMERIC(10,2) NOT NULL DEFAULT 0.00,

    "maxSucursales"        INTEGER NOT NULL DEFAULT 1,    -- -1 = ilimitado

    "maxUsuarios"          INTEGER NOT NULL DEFAULT 2,    -- -1 = ilimitado

    "maxProductos"         INTEGER NOT NULL DEFAULT 50,   -- -1 = ilimitado

    "permiteIA"            BOOLEAN NOT NULL DEFAULT FALSE,

    "permiteOffline"       BOOLEAN NOT NULL DEFAULT FALSE,

    "permiteMultiSucursal" BOOLEAN NOT NULL DEFAULT FALSE,

    "orden"                INTEGER NOT NULL DEFAULT 0

);

CREATE TABLE "tenant" (

    "idTenant"  SERIAL PRIMARY KEY,

    "nombre"    VARCHAR(120) NOT NULL,

    "slug"      VARCHAR(60)  NOT NULL UNIQUE,

    "estado"    VARCHAR(20)  NOT NULL DEFAULT 'Activo',

    "fechaAlta" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    "idPlan"    INTEGER      NOT NULL,

    CONSTRAINT "fk\_tenant\_plan" FOREIGN KEY ("idPlan") REFERENCES "plan"("idPlan") ON UPDATE CASCADE

);

-- Una suscripcion vigente por empresa; las anteriores quedan como historial

-- de cambios de plan.

CREATE TABLE "suscripcion" (

    "idSuscripcion"    BIGSERIAL PRIMARY KEY,

    "idTenant"         INTEGER       NOT NULL,

    "idPlan"           INTEGER       NOT NULL,

    "fechaInicio"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    "fechaVencimiento" TIMESTAMPTZ   NOT NULL,

    "estado"           VARCHAR(12)   NOT NULL DEFAULT 'Activa',

    "precioMensual"    NUMERIC(10,2) NOT NULL DEFAULT 0.00,   -- precio al contratar

    "creadoEn"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "chk\_suscripcion\_estado" CHECK ("estado" IN ('Activa', 'Suspendida', 'Vencida', 'Finalizada')),

    CONSTRAINT "chk\_suscripcion\_fechas" CHECK ("fechaVencimiento" > "fechaInicio"),

    CONSTRAINT "chk\_suscripcion\_precio" CHECK ("precioMensual" >= 0),

    CONSTRAINT "fk\_suscripcion\_tenant" FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_suscripcion\_plan" FOREIGN KEY ("idPlan") REFERENCES "plan"("idPlan") ON UPDATE CASCADE

);

CREATE UNIQUE INDEX "uq\_suscripcion\_vigente" ON "suscripcion" ("idTenant")

    WHERE "estado" IN ('Activa', 'Suspendida');

CREATE INDEX "idx\_suscripcion\_vencimiento" ON "suscripcion" ("estado", "fechaVencimiento");

-- ---------------------------------------------------------------------

-- 2. Seguridad: roles, permisos, usuarios, bitacora y respaldos

-- ---------------------------------------------------------------------

CREATE TABLE "rol" (

    "codigoRol" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombreRol" VARCHAR(50) NOT NULL UNIQUE

);

CREATE TABLE "permiso" (

    "idPermiso"     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombrePermiso" VARCHAR(100) NOT NULL UNIQUE

);

CREATE TABLE "asignacion\_permiso" (

    "idRolPermiso"    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "fechaAsignacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    "estado"          VARCHAR(20) NOT NULL DEFAULT 'Activo',

    "codigoRol"       INT NOT NULL,

    "idPermiso"       INT NOT NULL,

    CONSTRAINT "fk\_asig\_rol"     FOREIGN KEY ("codigoRol") REFERENCES "rol"("codigoRol") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_asig\_permiso" FOREIGN KEY ("idPermiso") REFERENCES "permiso"("idPermiso") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "uq\_rol\_permiso"  UNIQUE ("codigoRol", "idPermiso")

);

CREATE TABLE "Usuario" (

    "idUser"             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"             VARCHAR(100) NOT NULL,

    "correo"             VARCHAR(100) NOT NULL UNIQUE,

    "contraseña"         VARCHAR(255) NOT NULL,

    "codigoRol"          INT NOT NULL,

    "intentosFallidos"   INTEGER NOT NULL DEFAULT 0,

    "bloqueadoHasta"     TIMESTAMP NULL,

    "vecesBloqueado"     INTEGER NOT NULL DEFAULT 0,

    "requiereActivacion" BOOLEAN NOT NULL DEFAULT FALSE,

    "idTenant"           INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fk\_usuario\_rol"    FOREIGN KEY ("codigoRol") REFERENCES "rol"("codigoRol") ON UPDATE CASCADE,

    CONSTRAINT "fk\_usuario\_tenant" FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_usuario\_tenant" ON "Usuario" ("idTenant");

CREATE TABLE "Bitacora" (

    "idBitacora" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "accion"     VARCHAR(150) NOT NULL,

    "hora"       TIME NOT NULL,

    "fecha"      DATE NOT NULL,

    "ip"         INET NOT NULL,

    "idUser"     INT NOT NULL,

    CONSTRAINT "fk\_bitacora\_usuario" FOREIGN KEY ("idUser") REFERENCES "Usuario"("idUser") ON DELETE CASCADE

);

CREATE INDEX "idx\_bitacora\_fecha\_user" ON "Bitacora" ("fecha", "idUser");

CREATE TABLE "respaldo" (

    "idRespaldo"     BIGSERIAL PRIMARY KEY,

    "idTenant"       INTEGER     NOT NULL,

    "tipo"           VARCHAR(12) NOT NULL,

    "estado"         VARCHAR(12) NOT NULL,

    "almacenamiento" VARCHAR(10) NOT NULL,

    "ruta"           VARCHAR(255),

    "tamanoBytes"    BIGINT  NOT NULL DEFAULT 0,

    "filas"          INTEGER NOT NULL DEFAULT 0,

    "error"          VARCHAR(500),

    "creadoEn"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "idUsuario"      INTEGER,

    CONSTRAINT "chk\_respaldo\_tipo"           CHECK ("tipo" IN ('manual', 'automatico')),

    CONSTRAINT "chk\_respaldo\_estado"         CHECK ("estado" IN ('Completado', 'Fallido')),

    CONSTRAINT "chk\_respaldo\_almacenamiento" CHECK ("almacenamiento" IN ('supabase', 'local')),

    CONSTRAINT "fk\_respaldo\_tenant"  FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_respaldo\_usuario" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE

);

CREATE INDEX "idx\_respaldo\_tenant\_fecha" ON "respaldo" ("idTenant", "creadoEn" DESC);

-- ---------------------------------------------------------------------

-- 3. Ubicacion: ciudades y sucursales

-- ---------------------------------------------------------------------

CREATE TABLE "Ciudad" (

    "idCiudad"   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombCiudad" VARCHAR(100) NOT NULL

);

CREATE INDEX "idx\_ciudad\_nombre" ON "Ciudad" ("nombCiudad");

CREATE TABLE "Sucursal" (

    "codigoSucursal" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"         VARCHAR(100) NOT NULL,

    "direccion"      VARCHAR(255) NOT NULL,

    "idCiudad"       INT NOT NULL,

    "idTenant"       INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fk\_sucursal\_ciudad" FOREIGN KEY ("idCiudad") REFERENCES "Ciudad"("idCiudad") ON UPDATE CASCADE,

    CONSTRAINT "fk\_sucursal\_tenant" FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_sucursal\_ciudad" ON "Sucursal" ("idCiudad");

CREATE INDEX "idx\_sucursal\_tenant" ON "Sucursal" ("idTenant");

-- ---------------------------------------------------------------------

-- 4. Catalogo: proveedores, temporadas, colecciones, modelos y variantes

-- ---------------------------------------------------------------------

CREATE TABLE "Proveedor" (

    "idProveedor" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"      VARCHAR(100) NOT NULL,

    "telefono"    VARCHAR(20),

    "correo"      VARCHAR(100),

    "idTenant"    INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fk\_proveedor\_tenant" FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_proveedor\_nombre" ON "Proveedor" ("nombre");

CREATE INDEX "idx\_proveedor\_tenant" ON "Proveedor" ("idTenant");

CREATE TABLE "Temporada" (

    "idTemporada"     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombreTemporada" VARCHAR(100) NOT NULL,

    "fecha\_ini"       DATE NOT NULL,

    "fecha\_fin"       DATE NOT NULL,

    "idTenant"        INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "chk\_temporada\_fechas" CHECK ("fecha\_fin" >= "fecha\_ini"),

    CONSTRAINT "fk\_temporada\_tenant"  FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_temporada\_fechas" ON "Temporada" ("fecha\_ini", "fecha\_fin");

CREATE INDEX "idx\_temporada\_tenant" ON "Temporada" ("idTenant");

CREATE TABLE "Colecciones" (

    "idColeccion"      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre\_coleccion" VARCHAR(100) NOT NULL,

    "idTemporada"      INT NOT NULL,

    "idTenant"         INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fk\_coleccion\_temporada" FOREIGN KEY ("idTemporada") REFERENCES "Temporada"("idTemporada") ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT "fk\_colecciones\_tenant"  FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_coleccion\_temporada" ON "Colecciones" ("idTemporada");

CREATE INDEX "idx\_colecciones\_tenant"  ON "Colecciones" ("idTenant");

-- Modelo de prenda: agrupa sus variantes (cada fila de "producto" es un SKU

-- con su talla y color).

CREATE TABLE "modelo\_producto" (

    "idModelo"    SERIAL PRIMARY KEY,

    "nombre"      VARCHAR(120) NOT NULL,

    "tipo"        VARCHAR(50),

    "descripcion" TEXT,

    "idTenant"    INTEGER NOT NULL,

    CONSTRAINT "uq\_modelo\_tenant\_nombre" UNIQUE ("idTenant", "nombre"),

    CONSTRAINT "fk\_modelo\_tenant" FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE TABLE "producto" (

    "idProducto"           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"               VARCHAR(150) NOT NULL,

    "descripcion"          TEXT,

    "costo"                NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "venta"                NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "tipo"                 VARCHAR(50),

    "talla"                VARCHAR(20),

    "color"                VARCHAR(50),

    "imagen\_url"           TEXT NULL,

    "imagenes\_secundarias" TEXT[] NULL DEFAULT '{}',

    "idProveedor"          INT NOT NULL,

    "idColeccion"          INT NOT NULL,

    "idModelo"             INTEGER,

    "idTenant"             INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "chk\_producto\_precios"   CHECK ("venta" >= 0 AND "costo" >= 0),

    CONSTRAINT "fk\_producto\_proveedor"  FOREIGN KEY ("idProveedor") REFERENCES "Proveedor"("idProveedor") ON UPDATE CASCADE,

    CONSTRAINT "fk\_producto\_coleccion"  FOREIGN KEY ("idColeccion") REFERENCES "Colecciones"("idColeccion") ON UPDATE CASCADE,

    CONSTRAINT "fk\_producto\_modelo"     FOREIGN KEY ("idModelo") REFERENCES "modelo\_producto"("idModelo") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_producto\_tenant"     FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_producto\_busqueda"  ON "producto" ("nombre", "tipo", "talla", "color");

CREATE INDEX "idx\_producto\_proveedor" ON "producto" ("idProveedor");

CREATE INDEX "idx\_producto\_coleccion" ON "producto" ("idColeccion");

CREATE INDEX "idx\_producto\_modelo"    ON "producto" ("idModelo");

CREATE INDEX "idx\_producto\_tenant"    ON "producto" ("idTenant");

-- ---------------------------------------------------------------------

-- 5. Inventario y movimientos de stock

-- ---------------------------------------------------------------------

CREATE TABLE "Inventario" (

    "idInv"              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "cantidad\_actual"    INT NOT NULL DEFAULT 0,

    "cantidad\_reservada" INT NOT NULL DEFAULT 0,

    "codigoSucursal"     INT NOT NULL,

    "idProducto"         INT NOT NULL,

    CONSTRAINT "chk\_inv\_cantidades"   CHECK ("cantidad\_actual" >= 0 AND "cantidad\_reservada" >= 0),

    CONSTRAINT "fk\_inv\_sucursal"      FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,

    CONSTRAINT "fk\_inv\_producto"      FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "uq\_sucursal\_producto" UNIQUE ("codigoSucursal", "idProducto")

);

CREATE TABLE "Movimiento" (

    "idMov"      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "tipo"       VARCHAR(50) NOT NULL,

    "cantidad"   INT NOT NULL,

    "fecha"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    "motivo"     VARCHAR(255),

    "referencia" VARCHAR(50) NULL,

    "idInv"      INT NOT NULL,

    CONSTRAINT "fk\_movimiento\_inventario" FOREIGN KEY ("idInv") REFERENCES "Inventario"("idInv") ON UPDATE CASCADE

);

CREATE INDEX "idx\_movimiento\_inv\_fecha" ON "Movimiento" ("idInv", "fecha");

-- ---------------------------------------------------------------------

-- 6. Clientes, pagos, reservas, ventas y sincronizacion

-- ---------------------------------------------------------------------

CREATE TABLE "Cliente" (

    "idCliente" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"    VARCHAR(100) NOT NULL,

    "telefono"  VARCHAR(20),

    "direccion" VARCHAR(255),

    "altura"    INTEGER,

    "pecho"     INTEGER,

    "cintura"   INTEGER,

    "tiro"      INTEGER,

    "idUser"    INT NOT NULL UNIQUE,

    CONSTRAINT "fk\_cliente\_usuario" FOREIGN KEY ("idUser") REFERENCES "Usuario"("idUser") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE TABLE "metodo\_pago" (

    "idMetPago"             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "tipo"                  VARCHAR(50) NOT NULL,

    "estado"                VARCHAR(30) NOT NULL DEFAULT 'Activo',

    "fecha"                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    "monto"                 NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "stripePaymentIntentId" VARCHAR(255),

    "moneda"                VARCHAR(3),

    "estadoStripe"          VARCHAR(30),

    "origen"                VARCHAR(20),

    "idUserPago"            INTEGER,

    "idProducto"            INTEGER,

    "codigoSucursal"        INTEGER,

    "consumidoEn"           TIMESTAMPTZ,

    CONSTRAINT "chk\_metodo\_monto"         CHECK ("monto" >= 0),

    CONSTRAINT "fk\_metodo\_pago\_usuario"   FOREIGN KEY ("idUserPago") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,

    CONSTRAINT "fk\_metodo\_pago\_producto"  FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_metodo\_pago\_sucursal"  FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE

);

CREATE UNIQUE INDEX "uq\_metodo\_pago\_stripe\_pi" ON "metodo\_pago" ("stripePaymentIntentId")

    WHERE "stripePaymentIntentId" IS NOT NULL;

CREATE TABLE "Reserva" (

    "codigoReserva"        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "fecha"                DATE NOT NULL,

    "horario"              TIME NOT NULL,

    "estado"               VARCHAR(30) NOT NULL DEFAULT 'Pendiente',

    "montoDeposito"        NUMERIC(10,2),

    "idCliente"            INT NOT NULL,

    "codigoSucursal"       INT NOT NULL,

    "idProducto"           INT NOT NULL,

    "idMetPago"            INTEGER,

    -- Sincronizacion (idempotencia por UUID)

    "uuidOperacion"        UUID NOT NULL DEFAULT gen\_random\_uuid(),

    "origenRegistro"       VARCHAR(12) NOT NULL DEFAULT 'en\_linea',

    "estadoSincronizacion" VARCHAR(12) NOT NULL DEFAULT 'Sincronizada',

    "fechaOperacion"       TIMESTAMPTZ,

    "fechaSincronizacion"  TIMESTAMPTZ,

    CONSTRAINT "chk\_reserva\_origen\_registro"      CHECK ("origenRegistro" IN ('en\_linea', 'sin\_conexion')),

    CONSTRAINT "chk\_reserva\_estado\_sincronizacion" CHECK ("estadoSincronizacion" IN ('Pendiente', 'Sincronizada', 'Conflicto')),

    CONSTRAINT "fk\_reserva\_cliente"  FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,

    CONSTRAINT "fk\_reserva\_sucursal" FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,

    CONSTRAINT "fk\_reserva\_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_reserva\_pago"     FOREIGN KEY ("idMetPago") REFERENCES "metodo\_pago"("idMetPago") ON UPDATE CASCADE

);

CREATE INDEX "idx\_reserva\_cliente"      ON "Reserva" ("idCliente");

CREATE INDEX "idx\_reserva\_estado\_fecha" ON "Reserva" ("estado", "fecha");

CREATE UNIQUE INDEX "uq\_reserva\_uuid\_operacion" ON "Reserva" ("uuidOperacion");

CREATE TABLE "detalle\_reserva" (

    "idDetalleReserva" BIGSERIAL PRIMARY KEY,

    "codigoReserva"    INTEGER NOT NULL,

    "idProducto"       INTEGER NOT NULL,

    "cantidad"         INTEGER NOT NULL DEFAULT 1,

    "precioUnitario"   NUMERIC(12,2) NOT NULL,   -- precio al reservar

    CONSTRAINT "chk\_detalle\_reserva\_cantidad" CHECK ("cantidad" > 0),

    CONSTRAINT "chk\_detalle\_reserva\_precio"   CHECK ("precioUnitario" >= 0),

    CONSTRAINT "uq\_detalle\_reserva\_producto"  UNIQUE ("codigoReserva", "idProducto"),

    CONSTRAINT "fk\_detalle\_reserva\_reserva"   FOREIGN KEY ("codigoReserva") REFERENCES "Reserva"("codigoReserva") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_detalle\_reserva\_producto"  FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE

);

CREATE INDEX "idx\_detalle\_reserva\_producto" ON "detalle\_reserva" ("idProducto");

CREATE TABLE "Venta" (

    "idVenta"              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "fecha"                TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    "total"                NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "idCliente"            INT NOT NULL,

    "idMetPago"            INT NOT NULL,

    -- Sincronizacion (idempotencia por UUID)

    "uuidOperacion"        UUID NOT NULL DEFAULT gen\_random\_uuid(),

    "origenRegistro"       VARCHAR(12) NOT NULL DEFAULT 'en\_linea',

    "estadoSincronizacion" VARCHAR(12) NOT NULL DEFAULT 'Sincronizada',

    "fechaOperacion"       TIMESTAMPTZ,   -- hora real en el dispositivo

    "fechaSincronizacion"  TIMESTAMPTZ,   -- hora en que llego al servidor

    CONSTRAINT "chk\_venta\_total"                  CHECK ("total" >= 0),

    CONSTRAINT "chk\_venta\_origen\_registro"        CHECK ("origenRegistro" IN ('en\_linea', 'sin\_conexion')),

    CONSTRAINT "chk\_venta\_estado\_sincronizacion"  CHECK ("estadoSincronizacion" IN ('Pendiente', 'Sincronizada', 'Conflicto')),

    CONSTRAINT "fk\_venta\_cliente" FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,

    CONSTRAINT "fk\_venta\_pago"    FOREIGN KEY ("idMetPago") REFERENCES "metodo\_pago"("idMetPago") ON UPDATE CASCADE

);

CREATE INDEX "idx\_venta\_fecha"   ON "Venta" ("fecha");

CREATE INDEX "idx\_venta\_cliente" ON "Venta" ("idCliente");

CREATE UNIQUE INDEX "uq\_venta\_uuid\_operacion" ON "Venta" ("uuidOperacion");

CREATE TABLE "detalle\_venta" (

    "codigoVenta"     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "cantidad"        INT NOT NULL,

    "precio\_unitario" NUMERIC(12,2) NOT NULL,

    "idProducto"      INT NOT NULL,

    "idVenta"         INT NOT NULL,

    "codigoReserva"   INT NULL,

    CONSTRAINT "chk\_detalle\_cantidad" CHECK ("cantidad" > 0),

    CONSTRAINT "fk\_detalle\_producto"  FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_detalle\_venta"     FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_detalle\_reserva"   FOREIGN KEY ("codigoReserva") REFERENCES "Reserva"("codigoReserva") ON DELETE SET NULL ON UPDATE CASCADE

);

CREATE INDEX "idx\_detalle\_venta"    ON "detalle\_venta" ("idVenta");

CREATE INDEX "idx\_detalle\_producto" ON "detalle\_venta" ("idProducto");

CREATE TABLE "historial" (

    "codigoHistorial" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "fecha"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    "idProducto"      INT NOT NULL,

    "idCliente"       INT NOT NULL,

    "idVenta"         INT NOT NULL,

    CONSTRAINT "fk\_historial\_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_historial\_cliente"  FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,

    CONSTRAINT "fk\_historial\_venta"    FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE INDEX "idx\_historial\_busqueda" ON "historial" ("idCliente", "idProducto");

-- Log de sincronizacion (RNF10): una fila por cada operacion recibida de la

-- cola de un dispositivo, con su resultado.

CREATE TABLE "registro\_sincronizacion" (

    "idRegistro"     BIGSERIAL PRIMARY KEY,

    "uuidOperacion"  UUID        NOT NULL,

    "tipoOperacion"  VARCHAR(12) NOT NULL,

    "resultado"      VARCHAR(12) NOT NULL,

    "detalle"        VARCHAR(255),

    "idReferencia"   INTEGER,          -- idVenta o codigoReserva resultante

    "fechaOperacion" TIMESTAMPTZ,

    "fechaRecepcion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "dispositivo"    VARCHAR(120),

    "idUsuario"      INTEGER,

    "idTenant"       INTEGER,

    CONSTRAINT "chk\_registro\_sync\_tipo"      CHECK ("tipoOperacion" IN ('venta', 'reserva', 'devolucion')),

    CONSTRAINT "chk\_registro\_sync\_resultado" CHECK ("resultado" IN ('Aplicada', 'Duplicada', 'Rechazada')),

    CONSTRAINT "fk\_registro\_sync\_usuario" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_registro\_sync\_tenant"  FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE INDEX "idx\_registro\_sync\_tenant" ON "registro\_sincronizacion" ("idTenant", "fechaRecepcion");

CREATE INDEX "idx\_registro\_sync\_uuid"   ON "registro\_sincronizacion" ("uuidOperacion");

-- ---------------------------------------------------------------------

-- 7. Recomendaciones con IA

-- ---------------------------------------------------------------------

CREATE TABLE "Recomendaciones" (

    "idRecomendacion" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    "nombre"          VARCHAR(100) NOT NULL,

    "importancia"     VARCHAR(30) DEFAULT 'Media',

    "idCliente"       INT NOT NULL,

    "idProducto"      INTEGER,

    CONSTRAINT "fk\_recomendacion\_cliente"  FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_recomendacion\_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE

);

CREATE INDEX "idx\_recomendacion\_cliente" ON "Recomendaciones" ("idCliente");

-- ---------------------------------------------------------------------

-- 8. Posventa: politica, devoluciones y cambios, notas de credito e

--    inventario no vendible (CU1 a CU11)

-- ---------------------------------------------------------------------

-- CU9: politica de devoluciones versionada (una fila por version)

CREATE TABLE "politica\_devolucion" (

    "idPolitica"              BIGSERIAL PRIMARY KEY,

    "idTenant"                INTEGER NOT NULL,

    "version"                 INTEGER NOT NULL,

    "vigenteDesde"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "plazoCambioHoras"        INTEGER NOT NULL DEFAULT 24,

    "plazoGarantiaDias"       INTEGER NOT NULL DEFAULT 30,

    "accionFueraPlazo"        VARCHAR(10) NOT NULL DEFAULT 'rechazar',

    "recargoTipo"             VARCHAR(10) NOT NULL DEFAULT 'porcentaje',

    "recargoValor"            NUMERIC(12,2) NOT NULL DEFAULT 5,

    "recargoUnidad"           VARCHAR(5) NOT NULL DEFAULT 'dia',

    "categoriasNoRetornables" TEXT[] NOT NULL DEFAULT '{}',

    "maxCambiosPorPrenda"     INTEGER NOT NULL DEFAULT 2,

    "saldoAFavor"             VARCHAR(15) NOT NULL DEFAULT 'cliente\_elige',

    "permiteReembolso"        BOOLEAN NOT NULL DEFAULT TRUE,

    "vigenciaNotaCreditoDias" INTEGER NOT NULL DEFAULT 90,

    "respetarPrecioOriginal"  BOOLEAN NOT NULL DEFAULT TRUE,

    "umbralAutorizacion"      NUMERIC(12,2) NOT NULL DEFAULT 500,

    "maxDevolucionesMes"      INTEGER NOT NULL DEFAULT 3,

    "accionDeterioro"         VARCHAR(10) NOT NULL DEFAULT 'rechazar',

    "descuentoDeterioroPct"   NUMERIC(5,2) NOT NULL DEFAULT 30,

    "permiteSolicitudEnLinea" BOOLEAN NOT NULL DEFAULT TRUE,

    "diasEntregaEnLinea"      INTEGER NOT NULL DEFAULT 3,

    "diasRetiroCambio"        INTEGER NOT NULL DEFAULT 7,

    "costoAjusteMedida"       NUMERIC(12,2) NOT NULL DEFAULT 20,

    "condiciones"             VARCHAR(1000) NOT NULL DEFAULT

        'La prenda debe estar sin uso, limpia, con sus etiquetas y se presenta con el comprobante de compra. Una prenda con defecto de fabrica siempre se acepta dentro del plazo de garantia.',

    "creadoEn"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "idUsuario"               INTEGER,

    CONSTRAINT "uq\_politica\_version"      UNIQUE ("idTenant", "version"),

    CONSTRAINT "chk\_politica\_plazo"       CHECK ("plazoCambioHoras" BETWEEN 1 AND 720),

    CONSTRAINT "chk\_politica\_garantia"    CHECK ("plazoGarantiaDias" \* 24 >= "plazoCambioHoras" AND "plazoGarantiaDias" <= 730),

    CONSTRAINT "chk\_politica\_fuera\_plazo" CHECK ("accionFueraPlazo" IN ('rechazar', 'recargo')),

    CONSTRAINT "chk\_politica\_recargo"     CHECK ("recargoTipo" IN ('porcentaje', 'monto') AND "recargoUnidad" IN ('hora', 'dia') AND "recargoValor" >= 0),

    CONSTRAINT "chk\_politica\_saldo"       CHECK ("saldoAFavor" IN ('reembolso', 'nota\_credito', 'cliente\_elige')),

    CONSTRAINT "chk\_politica\_deterioro"   CHECK ("accionDeterioro" IN ('rechazar', 'descuento') AND "descuentoDeterioroPct" BETWEEN 0 AND 100),

    CONSTRAINT "chk\_politica\_positivos"   CHECK (

        "maxCambiosPorPrenda" >= 1 AND "vigenciaNotaCreditoDias" BETWEEN 1 AND 730 AND "umbralAutorizacion" >= 0

        AND "maxDevolucionesMes" >= 1 AND "diasEntregaEnLinea" BETWEEN 1 AND 60 AND "diasRetiroCambio" BETWEEN 1 AND 60

        AND "costoAjusteMedida" >= 0),

    CONSTRAINT "fk\_politica\_tenant"  FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_politica\_usuario" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE

);

CREATE INDEX "idx\_politica\_tenant\_vigencia" ON "politica\_devolucion" ("idTenant", "vigenteDesde");

-- CU1 a CU8: caso de devolucion o cambio

CREATE TABLE "devolucion" (

    "idDevolucion"         BIGSERIAL PRIMARY KEY,

    "codigo"               VARCHAR(20),                       -- DEV-000123

    "tipo"                 VARCHAR(20) NOT NULL,

    "origen"               VARCHAR(10) NOT NULL DEFAULT 'tienda',

    "cantidad"             INTEGER NOT NULL DEFAULT 1,

    "motivo"               VARCHAR(255),

    "motivoCategoria"      VARCHAR(12),

    "estado"               VARCHAR(20) NOT NULL DEFAULT 'Completada',

    "fecha"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "fechaVenta"           TIMESTAMPTZ NOT NULL,

    "precioPagado"         NUMERIC(12,2),                     -- precio efectivamente pagado por unidad

    "idPolitica"           BIGINT,                            -- version de politica aplicada

    "recargo"              NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "requiereAutorizacion" BOOLEAN NOT NULL DEFAULT FALSE,

    "motivoAutorizacion"   VARCHAR(255),

    "idAutorizador"        INTEGER,

    "fechaAutorizacion"    TIMESTAMPTZ,

    "fechaLimiteEntrega"   TIMESTAMPTZ,                       -- CU2

    "fotos"                TEXT[] NOT NULL DEFAULT '{}',

    -- CU3: inspeccion

    "condicion"            VARCHAR(15),

    "checklist"            JSONB,

    "codigoEscaneado"      VARCHAR(40),

    "notasInspeccion"      VARCHAR(255),

    "idInspector"          INTEGER,

    "fechaInspeccion"      TIMESTAMPTZ,

    "descuentoDeterioro"   NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "motivoRechazo"        VARCHAR(255),

    "destinoInventario"    VARCHAR(12),

    -- CU4 / CU5 / CU8: cambios

    "tallaOriginal"        VARCHAR(20),

    "tallaNueva"           VARCHAR(20),

    "medidaOriginal"       VARCHAR(60),

    "medidaNueva"          VARCHAR(60),

    "diferencia"           NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "idMetPagoDiferencia"  INTEGER,

    "idVentaCambio"        INTEGER,                           -- CU5: nueva venta enlazada

    "fechaEntregaAjuste"   DATE,

    "sucursalEntrega"      INTEGER,

    "idInvReservado"       INTEGER,

    "opcionSinStock"       VARCHAR(14),

    "fechaLlegadaEstimada" TIMESTAMPTZ,

    "fechaLimiteRetiro"    TIMESTAMPTZ,

    -- CU6 / CU7: reembolso y nota de credito

    "montoDevuelto"        NUMERIC(12,2) NOT NULL DEFAULT 0.00,

    "metodoReembolso"      VARCHAR(12),

    "estadoReembolso"      VARCHAR(22),

    "referenciaReembolso"  VARCHAR(150),

    "cuentaDestino"        VARCHAR(120),

    "idNotaCredito"        BIGINT,                            -- FK agregada tras crear nota\_credito

    "fechaResolucion"      TIMESTAMPTZ,

    -- Referencias

    "idVenta"              INTEGER NOT NULL,

    "idProducto"           INTEGER NOT NULL,

    "idProductoNuevo"      INTEGER,

    "idCliente"            INTEGER NOT NULL,

    "codigoSucursal"       INTEGER,                           -- sucursal receptora

    "idUsuario"            INTEGER NOT NULL,

    "idTenant"             INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "chk\_devolucion\_tipo" CHECK ("tipo" IN (

        'cambio\_talla', 'cambio\_color', 'cambio\_medida', 'cambio\_producto', 'devolucion', 'nota\_credito')),

    CONSTRAINT "chk\_devolucion\_estado" CHECK ("estado" IN (

        'PendienteEntrega', 'EnInspeccion', 'EnRevision', 'Aprobada', 'CambioPendiente',

        'Completada', 'Rechazada', 'Anulada', 'Cancelada')),

    CONSTRAINT "chk\_devolucion\_cantidad" CHECK ("cantidad" > 0),

    CONSTRAINT "chk\_devolucion\_cambio\_destino" CHECK (

        "estado" <> 'Completada' OR "tipo" NOT IN ('cambio\_talla', 'cambio\_color', 'cambio\_producto')

        OR "idProductoNuevo" IS NOT NULL),

    CONSTRAINT "chk\_devolucion\_origen" CHECK ("origen" IN ('tienda', 'en\_linea')),

    CONSTRAINT "chk\_devolucion\_motivo" CHECK (

        "motivoCategoria" IS NULL OR "motivoCategoria" IN ('talla', 'medida', 'color', 'defecto', 'equivocado', 'no\_desea')),

    CONSTRAINT "chk\_devolucion\_condicion" CHECK (

        "condicion" IS NULL OR "condicion" IN ('apta', 'defectuosa', 'deteriorada', 'no\_corresponde')),

    CONSTRAINT "chk\_devolucion\_destino" CHECK (

        "destinoInventario" IS NULL OR "destinoInventario" IN ('vendible', 'no\_vendible')),

    CONSTRAINT "chk\_devolucion\_sin\_stock" CHECK (

        "opcionSinStock" IS NULL OR "opcionSinStock" IN ('traslado', 'otra\_sucursal', 'espera')),

    CONSTRAINT "chk\_devolucion\_reembolso" CHECK (

        ("metodoReembolso" IS NULL OR "metodoReembolso" IN ('efectivo', 'qr', 'tarjeta', 'nota\_credito'))

        AND ("estadoReembolso" IS NULL OR "estadoReembolso" IN ('Completado', 'EnProceso', 'Pendiente', 'TransferenciaPendiente'))),

    CONSTRAINT "chk\_devolucion\_montos" CHECK ("recargo" >= 0 AND "descuentoDeterioro" >= 0),

    CONSTRAINT "fk\_devolucion\_venta"          FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_producto"       FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_prod\_nuevo"     FOREIGN KEY ("idProductoNuevo") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_cliente"        FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_sucursal"       FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_usuario"        FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_tenant"         FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_politica"       FOREIGN KEY ("idPolitica") REFERENCES "politica\_devolucion"("idPolitica") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_autorizador"    FOREIGN KEY ("idAutorizador") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_inspector"      FOREIGN KEY ("idInspector") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_pago\_diferencia" FOREIGN KEY ("idMetPagoDiferencia") REFERENCES "metodo\_pago"("idMetPago") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_venta\_cambio"   FOREIGN KEY ("idVentaCambio") REFERENCES "Venta"("idVenta") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_suc\_entrega"    FOREIGN KEY ("sucursalEntrega") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,

    CONSTRAINT "fk\_devolucion\_inv\_reservado"  FOREIGN KEY ("idInvReservado") REFERENCES "Inventario"("idInv") ON UPDATE CASCADE

);

CREATE UNIQUE INDEX "uq\_devolucion\_codigo"       ON "devolucion" ("codigo");

CREATE INDEX "idx\_devolucion\_cliente\_fecha"      ON "devolucion" ("idCliente", "fecha");

CREATE INDEX "idx\_devolucion\_venta"              ON "devolucion" ("idVenta");

CREATE INDEX "idx\_devolucion\_tenant\_fecha"       ON "devolucion" ("idTenant", "fecha");

CREATE INDEX "idx\_devolucion\_tenant\_estado"      ON "devolucion" ("idTenant", "estado");

CREATE INDEX "idx\_devolucion\_sucursal"           ON "devolucion" ("codigoSucursal");

-- CU7: notas de credito y sus movimientos

CREATE TABLE "nota\_credito" (

    "idNotaCredito"    BIGSERIAL PRIMARY KEY,

    "codigo"           VARCHAR(20)   NOT NULL UNIQUE,         -- NC-000007

    "monto"            NUMERIC(12,2) NOT NULL,

    "saldo"            NUMERIC(12,2) NOT NULL,

    "estado"           VARCHAR(12)   NOT NULL DEFAULT 'Vigente',

    "fechaEmision"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    "fechaVencimiento" TIMESTAMPTZ   NOT NULL,

    "motivo"           VARCHAR(255),

    "motivoAnulacion"  VARCHAR(255),

    "idCliente"        INTEGER NOT NULL,

    "idDevolucion"     BIGINT,

    "idUsuario"        INTEGER NOT NULL,

    "idTenant"         INTEGER NOT NULL,

    CONSTRAINT "chk\_nota\_monto"  CHECK ("monto" > 0),

    CONSTRAINT "chk\_nota\_saldo"  CHECK ("saldo" >= 0 AND "saldo" <= "monto"),

    -- "Vencida" no se guarda: se deduce de fechaVencimiento al leerla.

    CONSTRAINT "chk\_nota\_estado" CHECK ("estado" IN ('Vigente', 'Usada', 'Anulada')),

    CONSTRAINT "fk\_nota\_cliente"    FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_devolucion" FOREIGN KEY ("idDevolucion") REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_usuario"    FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_tenant"     FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_nota\_credito\_cliente" ON "nota\_credito" ("idCliente");

CREATE INDEX "idx\_nota\_credito\_tenant"  ON "nota\_credito" ("idTenant", "fechaEmision");

-- Referencia circular devolucion <-> nota\_credito: la FK se agrega al final.

ALTER TABLE "devolucion"

    ADD CONSTRAINT "fk\_devolucion\_nota\_credito" FOREIGN KEY ("idNotaCredito")

    REFERENCES "nota\_credito"("idNotaCredito") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "nota\_credito\_movimiento" (

    "idMovimiento"      BIGSERIAL PRIMARY KEY,

    "idNotaCredito"     BIGINT        NOT NULL,

    "tipo"              VARCHAR(12)   NOT NULL,

    "monto"             NUMERIC(12,2) NOT NULL DEFAULT 0,

    "saldoResultante"   NUMERIC(12,2) NOT NULL,

    "montoComplemento"  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- canje parcial: resto con otro medio

    "metodoComplemento" VARCHAR(12),

    "idMetPago"         INTEGER,

    "idDevolucion"      BIGINT,

    "detalle"           VARCHAR(255),

    "fecha"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "idUsuario"         INTEGER NOT NULL,

    CONSTRAINT "chk\_nota\_mov\_tipo"   CHECK ("tipo" IN ('emision', 'consumo', 'reintegro', 'anulacion', 'extension')),

    CONSTRAINT "chk\_nota\_mov\_montos" CHECK ("monto" >= 0 AND "montoComplemento" >= 0 AND "saldoResultante" >= 0),

    CONSTRAINT "fk\_nota\_mov\_nota"       FOREIGN KEY ("idNotaCredito") REFERENCES "nota\_credito"("idNotaCredito") ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_mov\_pago"       FOREIGN KEY ("idMetPago") REFERENCES "metodo\_pago"("idMetPago") ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_mov\_devolucion" FOREIGN KEY ("idDevolucion") REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_nota\_mov\_usuario"    FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON UPDATE CASCADE

);

CREATE INDEX "idx\_nota\_mov\_nota" ON "nota\_credito\_movimiento" ("idNotaCredito", "fecha");

CREATE INDEX "idx\_nota\_mov\_pago" ON "nota\_credito\_movimiento" ("idMetPago");

-- CU10: inventario no vendible (merma y reclamos al proveedor)

CREATE TABLE "inventario\_no\_vendible" (

    "idNoVendible"   BIGSERIAL PRIMARY KEY,

    "codigoSucursal" INTEGER NOT NULL,

    "idProducto"     INTEGER NOT NULL,

    "cantidad"       INTEGER NOT NULL,

    "motivo"         VARCHAR(12) NOT NULL,

    "idDevolucion"   BIGINT,

    "idProveedor"    INTEGER,                                 -- reclamo al proveedor

    "estado"         VARCHAR(12) NOT NULL DEFAULT 'Pendiente',

    "observaciones"  VARCHAR(255),

    "fecha"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    "idTenant"       INTEGER NOT NULL,

    CONSTRAINT "chk\_no\_vendible\_cantidad" CHECK ("cantidad" > 0),

    CONSTRAINT "chk\_no\_vendible\_motivo"   CHECK ("motivo" IN ('defecto', 'deterioro')),

    CONSTRAINT "chk\_no\_vendible\_estado"   CHECK ("estado" IN ('Pendiente', 'Reclamado', 'Repuesto', 'Desechado')),

    CONSTRAINT "fk\_no\_vendible\_sucursal"   FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,

    CONSTRAINT "fk\_no\_vendible\_producto"   FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,

    CONSTRAINT "fk\_no\_vendible\_devolucion" FOREIGN KEY ("idDevolucion") REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "fk\_no\_vendible\_proveedor"  FOREIGN KEY ("idProveedor") REFERENCES "Proveedor"("idProveedor") ON UPDATE CASCADE,

    CONSTRAINT "fk\_no\_vendible\_tenant"     FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON UPDATE CASCADE

);

CREATE INDEX "idx\_no\_vendible\_tenant" ON "inventario\_no\_vendible" ("idTenant", "fecha");

## 

## 4.4. Desarrollo de los módulos del sistema

* Módulo 1: Cuentas, Seguridad, Usuarios y Sucursales
* Módulo 2: Catálogo de Productos, Proveedores e Inventario Global
* Módulo 3: Experiencia Omnicanal, Reservas y Vestidor Virtual (RA)
* Módulo 4: Ventas, Punto de Venta (POS) y Pagos
* Módulo 5: Inteligencia Artificial, Analítica y Reportabilidad

## 4.5. Integración de componentes

        

## 

# CAPÍTULO V. PRUEBAS Y RESULTADOS

## 5.1 Plan de pruebas

Objetivo

Comprobar que los 36 casos de uso cumplen sus fichas: flujo normal y alternativos, aislamiento entre empresas (idTenant) y funcionamiento sin conexión.

Alcance

Tabla CU1 a CU36 con nombre y actor. Ojo: CU7 ahora es "Emitir nota de devolución", no "Gestionar notas de crédito".

Niveles

Unitarias (reglas de negocio puras), funcionales (cada CU de punta a punta) e integración (API ↔ PostgreSQL ↔ servicios externos).

Herramientas

pytest, pytest-asyncio, httpx (cliente de la API), base de prueba aparte (TEST\_DATABASE\_URL), navegador con DevTools en modo sin conexión para la PWA y un dispositivo Android para la app Flutter.

Entorno

Backend FastAPI local (puerto 8000), PostgreSQL en Docker (ropaDocker, puerto 5434), web Angular (puerto 3000). Para Stripe y Gemini se usan claves de prueba.

Criterios de entrada

CU implementado, migraciones aplicadas hasta la 031 y datos semilla cargados.

Criterios de salida

0 pruebas fallidas, cada CU con al menos un caso de su flujo normal y uno alternativo, y ningún error de severidad Alta abierto.

## 5.2. Pruebas funcionales

Cada caso de uso se prueba contra su especificación: primero el flujo normal completo y después cada flujo alternativo que cambia el resultado. Las reglas de cálculo de cada caso de uso tienen además una prueba unitaria automatizada que las respalda.

|  |  |  |  |
| --- | --- | --- | --- |
| Caso de uso | Flujo normal que se verifica | Flujos alternativos que se verifican | Prueba automatizada que lo respalda |
| CU1 | Buscar la venta por comprobante, QR o cliente; registrar la solicitud en estado "En inspección" con código único | Venta de otra empresa responde "Venta no encontrada"; fuera de plazo se rechaza o aplica recargo; categoría no retornable; unidades agotadas | test\_dentro\_del\_plazo\_de\_cambio\_de\_24\_h, test\_fuera\_de\_plazo\_se\_rechaza\_indicando\_la\_fecha\_limite, test\_fuera\_de\_plazo\_con\_recargo\_por\_dia\_de\_demora, test\_el\_recargo\_nunca\_supera\_el\_valor\_de\_la\_prenda, test\_defecto\_de\_fabrica\_se\_evalua\_contra\_la\_garantia, test\_categoria\_no\_retornable\_solo\_por\_defecto, test\_maximo\_de\_cambios\_y\_unidades\_agotadas |
| CU2 | Ver "Mis compras" con tiempo restante; enviar la solicitud en estado "Pendiente de entrega" con código QR y fecha límite | Prenda con solicitud abierta muestra la existente; compra fuera de plazo; la variante pedida queda apartada | Mismas reglas de elegibilidad del CU1, test\_venta\_recien\_hecha\_esta\_dentro\_de\_la\_ventana, test\_venta\_de\_hace\_23\_horas\_sigue\_siendo\_elegible, test\_venta\_de\_hace\_mas\_de\_24\_horas\_ya\_no\_es\_elegible, test\_el\_limite\_exacto\_de\_24\_horas\_queda\_fuera, test\_fecha\_naive\_se\_interpreta\_como\_utc\_y\_no\_explota |
| CU3 | Escanear la prenda, completar la lista de verificación y dejar la solicitud "Aprobada" | SKU que no coincide queda "No corresponde"; deteriorada se rechaza o se acepta con descuento; defecto de fábrica va a no vendible | test\_el\_codigo\_escaneado\_debe\_coincidir\_con\_la\_prenda, test\_deteriorada\_segun\_la\_politica, test\_defecto\_de\_fabrica\_se\_acepta\_y\_va\_al\_inventario\_no\_vendible |
| CU4 | Elegir otra talla, color o medida, calcular la diferencia y completar el cambio | Cambio sin costo; diferencia a cobrar; saldo a favor; precio original respetado; talla comparada por centímetros | test\_clasificacion\_del\_cambio, test\_cambio\_sin\_costo\_y\_diferencia\_propia\_de\_la\_variante, test\_respetar\_precio\_original\_no\_cobra\_el\_aumento\_general, test\_la\_talla\_nueva\_es\_mas\_grande\_por\_centimetros, test\_una\_l\_puede\_ser\_mas\_chica\_que\_otra\_l, test\_sin\_medidas\_se\_usa\_el\_orden\_de\_las\_tallas |
| CU5 | Agregar productos nuevos, comparar con el valor a favor de la prenda devuelta y crear la venta de cambio | Total mayor cobra la diferencia; total menor deja saldo a favor que se devuelve en dinero | test\_credito\_descuenta\_recargo\_y\_deterioro, test\_clasificacion\_del\_cambio |
| CU6 | Calcular el monto y reembolsar por el mismo medio de pago de la venta | Política sin reembolso; monto sobre el umbral pide autorización | test\_el\_reembolso\_usa\_el\_medio\_de\_la\_venta, test\_umbral\_de\_autorizacion |
| CU7 | Emitir la nota de devolución con la prenda, los descuentos y el monto devuelto, y descargarla en PDF | Caso sin dinero devuelto no emite nota; reembolso en proceso se indica en la nota; si falla el correo, el aviso queda en la aplicación | test\_codigos, test\_la\_nota\_de\_devolucion\_dice\_cuanto\_y\_por\_que\_medio, test\_la\_nota\_avisa\_si\_el\_reembolso\_sigue\_pendiente, test\_cu31\_cu7\_devolucion\_recogida\_descuenta\_el\_delivery\_y\_emite\_la\_nota |
| CU8 | Variante sin stock: trasladarla desde otra sucursal, congelar el plazo y entregarla cuando llega | Atención en otra sucursal; ninguna sucursal con stock ofrece otra prenda, lista de espera o reembolso; no retira a tiempo y pasa a devolución | Sin prueba automatizada propia; se verifica de forma manual (sección 5.6) |
| CU9 | Ver la política vigente y guardar una nueva versión | Valores inválidos marcados por campo; garantía menor que el plazo de cambio | test\_la\_garantia\_no\_puede\_ser\_menor\_que\_el\_plazo\_de\_cambio, test\_valores\_invalidos\_se\_marcan\_por\_campo |
| CU10 | La prenda apta entra al stock vendible y la entregada en un cambio sale del inventario | Defectuosa o deteriorada va al inventario no vendible | test\_defecto\_de\_fabrica\_se\_acepta\_y\_va\_al\_inventario\_no\_vendible; el movimiento de stock se verifica en integración (sección 5.3) |
| CU11 | Ver el historial con filtros, indicadores y detalle; exportar a PDF o Excel | Sin registros muestra "No se encontraron devoluciones"; el Encargado solo ve sus sucursales | test\_el\_administrador\_ve\_todas\_las\_sucursales, test\_el\_encargado\_asignado\_solo\_ve\_sus\_sucursales, test\_el\_personal\_sin\_asignar\_ve\_toda\_la\_empresa, test\_el\_filtro\_de\_sucursal\_no\_amplia\_el\_alcance, test\_excel\_con\_reporte\_indicadores\_y\_datos\_sin\_formato |
| CU12 | Preparar el modo sin conexión: descargar catálogo, existencias, clientes, reservas, ventas y política | Plan sin operación sin conexión se rechaza; conexión interrumpida conserva lo descargado | test\_cu12\_preparacion\_descarga\_todas\_las\_secciones, test\_cu12\_plan\_sin\_operacion\_sin\_conexion\_responde\_402 |
| CU13 | Buscar productos sin conexión y ver precio, variantes y existencia local con fecha de actualización | Datos desactualizados muestran advertencia; producto no descargado; imagen genérica si no está en caché | Sin prueba automatizada propia; se verifica de forma manual en el navegador sin conexión (sección 5.6) |
| CU14 | Registrar la venta en efectivo sin conexión con su UUID y descontar la existencia local | Pago con tarjeta rechazado sin conexión; cliente nuevo o genérico; monto recibido menor no se confirma | test\_cu14\_cliente\_nuevo\_y\_generico, test\_cu14\_cu17\_venta\_confirmada\_descuenta\_y\_entra\_a\_caja, test\_cu17\_venta\_con\_tarjeta\_se\_rechaza, test\_operacion\_sin\_conexion\_guarda\_uuid\_y\_fechas |
| CU15 | Registrar la reserva sin conexión, apartar la existencia y calcular la fecha límite | Sin existencia no se reserva; cancelación libera lo apartado; rechazo al sincronizar pasa a conflicto | test\_cu15\_reserva\_aparta\_y\_la\_cancelacion\_libera, test\_cu15\_confirmar\_reserva\_con\_varias\_prendas, test\_cu15\_cu18\_reserva\_sin\_existencia\_se\_reasigna |
| CU16 | Ver las operaciones locales con su estado, intentos, identificador del servidor y motivo | Sin operaciones muestra "No hay operaciones pendientes"; "Sincronizar ahora" ejecuta el CU17; acceso a resolver conflictos | Sin prueba automatizada propia; se verifica de forma manual en la pantalla de operaciones pendientes (sección 5.6) |
| CU17 | Enviar el lote de operaciones pendientes en orden y confirmarlas en el servidor | Reenvío del mismo UUID no duplica; operación de otra empresa se rechaza sin detener el lote; suscripción suspendida acepta lo anterior y rechaza lo posterior | test\_cu17\_reenviar\_el\_uuid\_no\_duplica, test\_cu17\_rechaza\_otra\_empresa\_y\_sigue\_con\_el\_lote, test\_cu17\_suspendida\_acepta\_lo\_anterior\_y\_rechaza\_lo\_posterior, test\_suspension\_acepta\_lo\_anterior\_y\_rechaza\_lo\_posterior, test\_operacion\_en\_linea\_no\_lleva\_uuid\_del\_dispositivo |
| CU18 | Listar los conflictos, comparar dispositivo y servidor, y aceptar la venta con ajuste | Anular la venta registra el egreso; respetar precio; reasignar reserva; fusionar cliente duplicado; sobre el umbral solo resuelve el Administrador; el Empleado no tiene permiso | test\_stock\_insuficiente\_es\_conflicto, test\_precio\_distinto\_es\_conflicto\_en\_venta\_pero\_no\_en\_reserva, test\_reserva\_sin\_stock\_tiene\_su\_propio\_conflicto, test\_producto\_inexistente\_gana\_a\_los\_demas\_conflictos, test\_producto\_desactivado\_solo\_se\_puede\_anular, test\_lineas\_que\_coinciden\_no\_son\_conflicto, test\_umbral\_de\_conflicto\_reserva\_el\_caso\_al\_administrador, test\_cu18\_stock\_insuficiente\_no\_mueve\_nada\_hasta\_aceptar\_con\_ajuste, test\_cu18\_respetar\_precio\_registra\_el\_descuento, test\_cu18\_anular\_venta\_registra\_el\_egreso, test\_cu18\_decision\_invalida\_y\_umbral\_de\_administrador, test\_cu18\_el\_empleado\_no\_tiene\_permiso, test\_cu18\_cliente\_duplicado\_se\_fusiona |
| CU19 | Registrar el cambio de talla o color sin conexión con comprobante provisional | Saldo a favor queda como reembolso pendiente; venta no descargada pasa a custodia; fuera de política queda en conflicto; venta en conflicto deja el cambio pendiente | test\_cu19\_cambio\_de\_talla\_completo, test\_cu19\_saldo\_a\_favor\_queda\_como\_reembolso\_pendiente, test\_cu19\_fuera\_de\_politica\_queda\_en\_conflicto\_y\_se\_puede\_aceptar, test\_cu19\_venta\_en\_conflicto\_deja\_el\_cambio\_pendiente, test\_cu19\_custodia\_se\_vincula\_a\_su\_venta |
| CU20 | Abrir la caja, registrar ingresos y egresos, y cerrarla con el arqueo | Diferencia sobre el umbral pide justificación y aprobación; operaciones sin sincronizar dejan cierre provisional; abrir dos veces muestra la caja existente | test\_arqueo\_esperado\_es\_inicial\_mas\_ingresos\_menos\_egresos, test\_arqueo\_negativo\_es\_faltante, test\_cierre\_con\_diferencia\_en\_el\_umbral\_no\_pide\_nada, test\_cierre\_sobre\_el\_umbral\_lo\_aprueba\_el\_encargado, test\_el\_encargado\_cierra\_con\_justificacion\_sin\_esperar\_aprobacion, test\_con\_operaciones\_sin\_confirmar\_el\_cierre\_es\_provisional, test\_cu20\_abrir\_dos\_veces\_devuelve\_la\_misma, test\_cu20\_pos\_en\_efectivo\_exige\_caja\_abierta, test\_cu20\_cierre\_exacto\_queda\_cerrado, test\_cu20\_diferencia\_grande\_pide\_justificacion\_y\_aprobacion, test\_cu20\_apertura\_y\_cierre\_sin\_conexion, test\_cu20\_cierre\_provisional\_pasa\_a\_definitivo\_al\_resolver\_el\_conflicto, test\_cu20\_una\_sola\_caja\_por\_sucursal\_aunque\_abran\_sin\_conexion, test\_rnf02\_otra\_empresa\_no\_ve\_la\_caja |
| CU21 | Registrar la empresa con su suscripción y su administrador en una transacción y enviar la activación | NIT, slug o correo repetidos marcan su campo; fecha de vencimiento anterior al inicio | test\_cu21\_alta\_completa\_y\_activacion, test\_cu21\_datos\_repetidos\_marcan\_su\_campo |
| CU22 | Renovar la suscripción, extender el vencimiento y dejarla "Activa" | Suspender y reactivar; vencimiento pasa a gracia y luego a suspendida; la operadora no se suspende; el cron exige secreto | test\_cu22\_renovar\_suspender\_reactivar, test\_cu22\_vencimiento\_gracia\_y\_suspension\_automatica, test\_cu22\_la\_operadora\_no\_se\_suspende\_y\_el\_cron\_pide\_secreto, test\_cu22\_vence\_pasa\_a\_gracia\_y\_luego\_a\_suspendida, test\_cu22\_por\_vencer\_se\_calcula, test\_sumar\_meses\_mismo\_dia, test\_sumar\_meses\_cruza\_el\_anio, test\_sumar\_meses\_fin\_de\_mes\_cae\_en\_el\_ultimo\_dia |
| CU23 | Crear y editar un plan con sus límites y funcionalidades | Plan con empresas solo se desactiva; código repetido da error | test\_cu23\_crear\_editar\_y\_desactivar\_plan |
| CU24 | Crear el empleado con rol y sucursales y enviar la activación | Límite de usuarios del plan; baja invalida la sesión; operaciones anteriores a la baja se aceptan | test\_cu24\_empleado\_activacion\_baja\_y\_trazabilidad, test\_cu24\_usuario\_dado\_de\_baja\_no\_opera, test\_cu24\_operaciones\_antes\_de\_la\_baja\_se\_aceptan, test\_la\_huella\_cambia\_al\_cambiar\_la\_contrasena |
| CU25 | Verificar suscripción activa, funcionalidad del plan y límites antes de cada operación | Funcionalidad no incluida; límite alcanzado; en gracia solo consultas; suspendida rechaza todo menos sesión y sincronización | test\_cu25\_cupo\_y\_funcionalidades\_del\_plan, test\_cu25\_en\_gracia\_solo\_consultas, test\_cu25\_suspendida\_rechaza\_todo\_menos\_sesion\_y\_sincronizacion, test\_access\_token\_se\_reconoce\_como\_acceso\_y\_no\_como\_refresh, test\_refresh\_token\_no\_sirve\_como\_acceso |
| CU26 | Escribir la solicitud, interpretarla con IA, validarla y mostrar tabla, gráfico y resumen | Solicitud ambigua pide aclaración; sin período usa el mes actual; pedir modificar datos u otra empresa se rechaza; el Encargado ve solo sus sucursales | test\_cu26\_ejemplo\_del\_informe, test\_cu26\_mas\_vendidos\_sin\_criterio\_pide\_aclaracion, test\_cu26\_este\_mes\_al\_inicio\_del\_mes\_pide\_aclaracion, test\_cu26\_sin\_periodo\_usa\_el\_mes\_actual\_y\_lo\_indica, test\_cu26\_rechaza\_modificar\_datos\_y\_otra\_empresa, test\_cu26\_encargado\_limitado\_a\_sus\_sucursales, test\_cu26\_dos\_agrupaciones\_y\_rango, test\_cu26\_reporte\_aclaracion\_rechazo\_y\_favorito, test\_cu26\_encargado\_ve\_solo\_su\_sucursal |
| CU27 | Dictar la solicitud, transcribirla, confirmarla y seguir con el CU26 | Sin servicio de transcripción o con formato de audio inválido se pide escribirla | test\_cu27\_transcripcion\_sin\_servicio\_o\_formato\_invalido |
| CU28 | Exportar el reporte a PDF o Excel con encabezado, totales y hoja de datos | Más de 1000 filas se genera en segundo plano; reporte vacío no se exporta | test\_cu28\_exportar\_pdf\_excel\_y\_segundo\_plano, test\_sales\_rows\_to\_pdf\_bytes\_es\_un\_pdf\_no\_vacio, test\_sales\_rows\_to\_pdf\_bytes\_vacio\_no\_falla, test\_inventory\_rows\_to\_pdf\_bytes\_es\_un\_pdf\_no\_vacio, test\_sales\_rows\_to\_csv\_exacto, test\_sales\_totals\_suma\_monto\_y\_cantidad |
| CU29 | Entrenar el modelo, calcular sus métricas y publicar la versión | Métricas bajo el umbral no se publican; se compara con la versión publicada | test\_cu29\_cu30\_entrenar\_publicar\_y\_dashboard, test\_cu29\_compara\_con\_la\_version\_publicada |
| CU30 | Ver indicadores, predicción de demanda, segmentos, anomalías e interpretación de la IA | Sin modelos publicados solo indicadores convencionales; si la IA falla se usan reglas | test\_cu29\_cu30\_entrenar\_publicar\_y\_dashboard, test\_reglas\_sugieren\_transferencia\_de\_exceso\_a\_quiebre, test\_reglas\_sin\_exceso\_no\_transfieren\_y\_alertan\_quiebre\_total, test\_respaldo\_usa\_reglas\_y\_avisa\_cuando\_la\_ia\_falla, test\_cortes\_de\_dia\_en\_hora\_de\_bolivia |
| CU31 | Solicitar el recojo, programarlo, recoger la prenda y pasarla a inspección | Datos incompletos o fecha pasada no se registran; cancelar vuelve a la sucursal sin cobro; recojo pendiente no vence | test\_cu31\_cu32\_recojo\_inspeccion\_y\_entrega\_del\_cambio, test\_cu31\_cancelar\_recojo\_vuelve\_a\_la\_sucursal\_y\_no\_cobra, test\_cu31\_un\_recojo\_pendiente\_no\_se\_anula\_por\_vencimiento, test\_cu31\_validaciones |
| CU32 | Registrar la entrega del cambio, programarla, entregar y completar el caso | Devolución con reembolso no tiene entrega; el cliente retira en sucursal; viaje gratis por defecto de fábrica | test\_cu31\_cu32\_recojo\_inspeccion\_y\_entrega\_del\_cambio, test\_cu31\_cu7\_devolucion\_recogida\_descuenta\_el\_delivery\_y\_emite\_la\_nota |
| CU33 | A la 3.ª compra se emite el cupón del 30 % y se usa una sola vez al pagar | Compra devuelta no cuenta; compras sin conexión suman; cupón vencido o ajeno se rechaza | test\_reglas\_del\_cupon, test\_cu33\_tres\_compras\_dan\_un\_cupon\_y\_se\_usa\_una\_vez, test\_cu33\_validaciones, test\_cu33\_una\_compra\_devuelta\_no\_cuenta, test\_cu33\_compras\_sin\_conexion\_suman |
| CU34 | Registrar el aviso de una talla agotada y avisar al cliente cuando vuelve el stock | Aviso pendiente repetido no se registra; aviso cancelado no se notifica | test\_cu34\_avisa\_cuando\_vuelve\_el\_stock, test\_cu34\_validaciones |
| CU35 | Elegir envío a domicilio, sumar el costo, programar y entregar la compra | Datos incompletos no se confirman; el punto de venta no hace envíos | test\_cu35\_compra\_en\_linea\_con\_envio\_hasta\_la\_entrega, test\_cu35\_el\_pos\_no\_hace\_envios |
| CU36 | Preguntar por texto o voz, recibir la respuesta y descargar el reporte en PDF, CSV o HTML | Límite de preguntas por IP en la página de inicio; sin permiso o sin plan con IA no hay asistente del personal | test\_reglas\_del\_asistente, test\_cu36\_admin\_pide\_un\_reporte\_y\_lo\_descarga\_en\_pdf\_csv\_y\_html, test\_cu36\_permisos\_y\_perfiles, test\_cu36\_chat\_publico\_tiene\_limite\_por\_ip |

## 5.3. Pruebas de integración

Las pruebas de integración comprueban que cada endpoint deja la base de datos en el estado correcto. Revisan el estado de cada caso, el inventario, los pagos, la caja, las suscripciones y la bitácora. Se ejecutan con pytest y httpx contra la API conectada a una base PostgreSQL de prueba (TEST\_DATABASE\_URL), con un usuario de una empresa, una sucursal y una venta pagada. Los casos que funcionan sin conexión se prueban también en el navegador, revisando lo que queda guardado en IndexedDB. La IA (Gemini), los pagos (Stripe) y el correo (Brevo) se prueban con sus claves de prueba o con su respaldo cuando el servicio no responde.

|  |  |  |  |
| --- | --- | --- | --- |
| Caso de uso | Endpoint | Tablas que se verifican | Qué se comprueba |
| CU1 | GET /api/returns/ventas?q= y POST /api/returns | Venta, devolucion, Bitacora | La venta de otra empresa no aparece; la solicitud queda "EnInspeccion" con código y fila en la bitácora |
| CU2 | GET /api/returns/mis-compras y POST /api/returns/solicitudes | devolucion, Inventario, Bitacora | La solicitud queda "PendienteEntrega" con fecha límite; la variante pedida suma a cantidad\_reservada |
| CU3 | POST /api/returns/{id}/inspeccion | devolucion | El estado pasa a "Aprobada", "Rechazada" o "EnRevision"; la aprobación parcial crea un caso nuevo con las unidades rechazadas |
| CU4 | POST /api/returns/{id}/resolver (cambio\_talla, cambio\_color, cambio\_medida) | devolucion, Inventario, Movimiento, metodo\_pago | Entra la prenda devuelta, sale la nueva y la diferencia queda cobrada; la solicitud queda "Completada" |
| CU5 | POST /api/returns/{id}/resolver (cambio\_producto) | Venta, detalle\_venta, metodo\_pago, Inventario | Se crea una venta nueva vinculada a la devolución; el valor a favor de la prenda devuelta se descuenta del total |
| CU6 | POST /api/returns/{id}/resolver (devolucion), /reembolso/reintentar y /reembolso/confirmar | devolucion, metodo\_pago | Se registra el monto devuelto y el estado del reembolso: "Completado", "TransferenciaPendiente" o "Pendiente" si la pasarela falla |
| CU7 | GET /api/returns/{id}/nota-devolucion y /nota-devolucion.pdf | devolucion, entrega\_domicilio, metodo\_pago, notificacion | La nota muestra el valor de la prenda, los descuentos (recargo, deterioro y delivery) y el monto devuelto con su medio; sin dinero devuelto no se emite; el aviso queda en notificaciones |
| CU8 | POST /api/returns/{id}/resolver sin stock y POST /api/returns/{id}/completar-cambio | Inventario, Movimiento, devolucion | El traslado registra "salida\_traspaso" y "entrada\_traspaso"; la solicitud queda "CambioPendiente" hasta el retiro |
| CU9 | GET /api/returns/politica, GET /politica/versiones y PUT /api/returns/politica | politica\_devolucion, Bitacora | Cada guardado crea una versión nueva; las ventas anteriores siguen con la versión que regía al venderse |
| CU10 | GET /api/returns/inventario y PATCH /api/returns/no-vendible/{id} (después de un CU4, CU5 o CU6) | Inventario, Movimiento, inventario\_no\_vendible | La prenda apta suma stock con "Entrada por devolución"; la defectuosa o deteriorada queda en no vendible |
| CU11 | GET /api/returns, /analisis, /alcance y /export.xlsx, /export.pdf | devolucion, usuario\_sucursal | El Encargado solo recibe casos de sus sucursales; el filtro de sucursal no amplía el alcance; el Excel trae la hoja de datos sin formato |
| CU12 | GET /api/sync/preparacion y /api/sync/snapshot/{seccion} | producto, Inventario, Cliente, Reserva, Venta, politica\_devolucion, plan | Se descargan todas las secciones de la sucursal; con un plan sin operación sin conexión responde 402 |
| CU13 | Sin llamada al servidor (lee IndexedDB: catalogo, inventario, meta) | catalogo, inventario, meta (IndexedDB) | La existencia local es la descargada menos lo vendido y reservado sin conexión; se muestra la fecha de la última actualización |
| CU14 | POST /api/sync/lote (operación "venta") | Venta, detalle\_venta, Inventario, movimiento\_caja, registro\_sincronizacion | La venta confirmada descuenta stock y entra a la caja; el cliente nuevo o genérico se registra; la venta con tarjeta se rechaza |
| CU15 | POST /api/sync/lote (operaciones "reserva" y "cancelar\_reserva") | Reserva, detalle\_reserva, Inventario | La reserva aparta cantidad\_reservada y la cancelación la libera; sin existencia pasa a conflicto |
| CU16 | POST /api/sync/estado | registro\_sincronizacion, conflicto\_sincronizacion | Para cada UUID devuelve su estado (confirmada, rechazada o en conflicto), el identificador del servidor y el motivo |
| CU17 | POST /api/sync/lote | registro\_sincronizacion, Venta, Inventario, suscripcion | Reenviar el mismo UUID no duplica la venta; una operación de otra empresa se rechaza sin detener el lote; con la suscripción suspendida se acepta lo anterior y se rechaza lo posterior |
| CU18 | GET /api/sync/conflictos y POST /api/sync/conflictos/{id}/resolver | conflicto\_sincronizacion, Venta, Inventario, Movimiento, movimiento\_caja, Cliente | Nada se mueve hasta resolver; "aceptar con ajuste" registra el ajuste de inventario; "anular" registra el egreso de caja; el cliente duplicado se fusiona; sobre el umbral solo resuelve el Administrador |
| CU19 | POST /api/sync/lote (operaciones "cambio" y "custodia") | devolucion, Inventario, registro\_sincronizacion | El cambio de talla queda completo; el saldo a favor queda como reembolso pendiente; fuera de política queda en conflicto; la custodia se vincula a su venta |
| CU20 | GET /api/caja/actual, POST /api/caja/abrir, /{id}/cerrar y /{id}/aprobar | caja, movimiento\_caja | Una sola caja abierta por sucursal; el cierre exacto queda "Cerrada"; la diferencia grande pide justificación y aprobación; el cierre provisional pasa a definitivo al resolver el conflicto; otra empresa no ve la caja |
| CU21 | POST /api/platform/tenants y /tenants/{id}/activacion | tenant, suscripcion, Usuario, politica\_devolucion, Bitacora | La empresa, su suscripción, su administrador y su política se crean en una sola transacción; NIT, slug o correo repetidos no crean nada |
| CU22 | POST /api/platform/tenants/{id}/renovar, /suspender, /reactivar y /suscripciones/cron | suscripcion, pago\_suscripcion, Bitacora, notificacion | La renovación extiende el vencimiento y registra el pago; el cron pasa a gracia y luego a suspendida, y exige el secreto; la operadora no se suspende |
| CU23 | GET/POST /api/platform/planes, PUT y DELETE /planes/{id} | plan, Bitacora | El plan se crea y edita; un plan con empresas solo se desactiva |
| CU24 | POST /api/team, /{id}/baja, /{id}/alta y PUT /{id}/sucursales | Usuario, usuario\_sucursal, rol, Bitacora | El empleado queda en su empresa con sus sucursales; al darlo de baja su token deja de servir; sus operaciones sin conexión previas se aceptan |
| CU25 | Cualquier endpoint protegido (dependencia de verificación del plan) | suscripcion, plan, Sucursal, Usuario, producto | Al superar el cupo responde con el recurso y el límite; sin la funcionalidad responde "no incluida en su plan"; en gracia solo permite consultas |
| CU26 | POST /api/reports/ia/consultar, GET /ia/historial y PATCH /ia/{id}/favorita | reporte\_solicitud, Venta, detalle\_venta | La consulta se filtra por idTenant; la solicitud ambigua pide aclaración; pedir modificar datos se rechaza; el Encargado ve solo su sucursal |
| CU27 | POST /api/reports/ia/transcribir | reporte\_solicitud | Sin servicio de transcripción o con formato de audio inválido se responde con error claro y se ofrece escribir |
| CU28 | POST /api/reports/exportar y GET /exportaciones/{id}/archivo | reporte\_exportacion, Bitacora | Se generan el PDF y el Excel; más de 1000 filas pasa a segundo plano y se avisa cuando está listo |
| CU29 | GET /api/ia/modelos/datos, POST /modelos/entrenar y /modelos/{id}/publicar | modelo\_ia | El modelo se entrena con los datos de la empresa y guarda sus métricas; se compara con la versión publicada |
| CU30 | GET /api/ia/dashboard y /api/dashboard/kpis | modelo\_ia, Venta, Inventario, devolucion | Muestra indicadores, predicción y anomalías del modelo publicado; si la IA falla se usan las reglas de respaldo |
| CU31 | POST /api/returns/solicitudes (con recojo) y /domicilio/{id}/programar, /completar, /fallido, /cancelar | entrega\_domicilio, devolucion, notificacion | El recojo pasa de "Solicitado" a "Programado" y "Completado"; cancelarlo devuelve el plazo sin cobrar; un recojo pendiente no se anula por vencimiento |
| CU32 | POST /api/returns/{id}/resolver (con entrega) y /domicilio/{id}/completar | entrega\_domicilio, devolucion, Inventario | La prenda nueva sale del stock; el caso queda "En camino a domicilio" y luego "Completada"; el costo del viaje se suma a la diferencia |
| CU33 | GET /api/cupones/mios, POST /api/cupones/cotizar y POST /api/sales | cupon, Venta | A la 3.ª compra se emite el cupón; se usa una sola vez; la compra devuelta no cuenta; las compras sin conexión suman |
| CU34 | POST /api/avisos-stock, GET /mios y DELETE /{id} | aviso\_stock, Inventario, notificacion | Al reponer stock, el trigger trg\_avisar\_reposicion marca el aviso como "Avisado" y crea la notificación; no se repite un aviso pendiente |
| CU35 | POST /api/payments/intents, /intents/{id}/verify y GET /api/pedidos/mios | Venta, entrega\_domicilio, metodo\_pago | El total suma el costo del envío; al confirmar el pago, el pedido queda "Solicitado" hasta la entrega; el punto de venta no hace envíos |
| CU36 | POST /api/chat, /api/chat/publico, /api/chat/admin y GET /admin/reportes/{id}.{formato} | reporte\_solicitud, Venta, producto | El asistente solo consulta los datos permitidos para el rol; el reporte se descarga en PDF, CSV y HTML; el chat público corta por límite de preguntas por IP |

## 5.4. Corrección de errores

Durante las pruebas se encontraron 8 errores en el módulo de devoluciones; todos se corrigieron en el backend (backend/app/routers/returns.py): E8 el 14/10/2026 y los otros siete el 23/10/2026. E8 quedó además cubierto por una prueba automatizada.

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| N.º | CU | Error encontrado | Corrección aplicada | Severidad |
| E1 | CU1 | Dos devoluciones simultáneas de la misma línea de venta pasaban las dos el control de "unidades disponibles" y se devolvían más prendas de las vendidas | La venta se bloquea (SELECT … FOR UPDATE) mientras se registra la solicitud, así las dos operaciones se ejecutan una después de otra | Alta |
| E2 | CU1, CU2 | Una venta de otra empresa respondía con un mensaje distinto al de una venta inexistente, lo que revelaba que existía | Se responde "Venta no encontrada" en los dos casos | Alta |
| E3 | CU1, CU2 | Se aceptaba como sucursal receptora una sucursal de otra empresa | Se valida que la sucursal pertenezca a la empresa del usuario; si no, "Sucursal inexistente" | Alta |
| E4 | CU4, CU5 | Se aceptaba como prenda de reemplazo un producto de otra empresa | Se valida que el producto nuevo sea de la misma empresa | Alta |
| E5 | CU10 | Al reingresar la prenda devuelta se podía usar una fila de inventario de una sucursal de otra empresa | La búsqueda del inventario se filtra por las sucursales de la empresa | Alta |
| E6 | CU1 | El personal veía en la búsqueda prendas de otras empresas | La consulta del personal se filtra por la empresa del usuario | Media |
| E7 | CU4 | Un cambio de medida se rechazaba si la prenda no tenía fila de inventario, aunque un ajuste de confección no mueve stock | El cambio de medida ya no busca ni exige una fila de inventario | Media |
| E8 | CU1, CU2 | Comparar una fecha de venta sin zona horaria con la hora actual en UTC lanzaba una excepción al calcular el plazo | Las fechas sin zona horaria se interpretan como UTC antes de comparar | Media |

La prueba test\_fecha\_naive\_se\_interpreta\_como\_utc\_y\_no\_explota cubre el error E8 para que no vuelva a aparecer.

## 5.5. Resultados de las pruebas

Las 28 pruebas automatizadas del módulo pasaron sin fallos (28 de 28, 100 %) en la ejecución del 25/10/2026, con un tiempo total de 2,93 segundos.

Comando ejecutado en backend/:

python -m pytest tests/test\_devoluciones.py tests/test\_returns.py -v

|  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| CU | Grupo de pruebas | Archivo | Pruebas | Aprobadas | Fallidas |
| CU1, CU2 | Elegibilidad: plazo, recargo, garantía, categorías, unidades | test\_devoluciones.py | 7 | 7 | 0 |
| CU1, CU2 | Ventana de 24 horas y fechas sin zona horaria | test\_returns.py | 6 | 6 | 0 |
| CU3, CU10 | Inspección, destino de inventario y crédito | test\_devoluciones.py | 4 | 4 | 0 |
| CU4, CU5 | Clasificación del cambio, diferencia y saldo a favor | test\_devoluciones.py | 4 | 4 | 0 |
| CU6 | Medio de reembolso y umbral de autorización | test\_devoluciones.py | 2 | 2 | 0 |
| CU7 | Códigos y vencimiento de notas de crédito | test\_devoluciones.py | 2 | 2 | 0 |
| CU9 | Validación de la política | test\_devoluciones.py | 3 | 3 | 0 |
| Total |  |  | 28 | 28 | 0 |

La ejecución mostró 56 advertencias de obsolescencia (asyncio.iscoroutinefunction) que vienen de las librerías FastAPI y Starlette, no del código del proyecto, y no afectan los resultados.

El CU8 no tiene una prueba unitaria propia y el movimiento de stock del CU10 depende de la base de datos; los dos se validan con las pruebas de integración de la sección 5.3.

## 5.6. Casos de prueba

Se definieron 31 casos de prueba para los CU1 a CU10: 24 automatizados, que agrupan las 28 pruebas de pytest y están aprobados, y 7 de integración que se ejecutan contra la API con la base de datos. Los montos están en bolivianos (Bs).

|  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| ID | CU | Descripción | Datos de entrada | Resultado esperado | Tipo | Resultado |
| CP-01 | CU1 | Solicitud dentro del plazo de 24 h | Venta de hace 23 h, prenda de Bs 120 | Elegible, estado "en\_plazo", queda menos de 1 h | Automatizada | Aprobado |
| CP-02 | CU1 | Fuera de plazo con la política "Rechazar" | Venta de hace 25 h | No elegible; el mensaje indica la fecha límite | Automatizada | Aprobado |
| CP-03 | CU1 | Fuera de plazo con recargo | Venta de hace 54 h (30 h de demora), recargo 5 % por día, prenda de Bs 120 | Elegible con recargo de Bs 12,00 (2 días iniciados) | Automatizada | Aprobado |
| CP-04 | CU1 | El recargo no supera el valor de la prenda | Recargo Bs 50 por hora, prenda de Bs 120, 10 h y 0 h de demora | Bs 120,00 (tope) y Bs 0,00 | Automatizada | Aprobado |
| CP-05 | CU1 | Defecto de fábrica contra la garantía | Defecto en una venta de hace 10 días y en otra de hace 31 días | 10 días: elegible por garantía; 31 días: no elegible | Automatizada | Aprobado |
| CP-06 | CU1 | Categoría no retornable | "Polera Oversize" marcada como no retornable, con y sin defecto | Sin defecto: "no\_retornable"; con defecto: elegible | Automatizada | Aprobado |
| CP-07 | CU1 | Máximo de cambios y unidades agotadas | 2 cambios previos; 0 unidades disponibles | "max\_cambios"; "sin\_unidades" | Automatizada | Aprobado |
| CP-08 | CU1, CU2 | Límite de la ventana de 24 h | Ventas de hace 5 min, 24 h exactas y 24 h 1 min | Solo la de 5 min queda dentro; las otras, fuera | Automatizada | Aprobado |
| CP-09 | CU1, CU2 | Fecha de venta sin zona horaria | Fecha guardada sin zona horaria | Se interpreta como UTC y no lanza excepción | Automatizada | Aprobado |
| CP-10 | CU1 | Venta de otra empresa | Búsqueda por número de una venta de otro tenant | 404 "Venta no encontrada" | Integración | Por ejecutar |
| CP-11 | CU2 | Solicitud en línea con cambio de talla | Cliente pide otra talla con stock en la sucursal elegida | Solicitud "PendienteEntrega" con QR y fecha límite; la variante queda apartada | Integración | Por ejecutar |
| CP-12 | CU2 | Prenda con una solicitud abierta | Segunda solicitud para la misma prenda | 409 con el código de la solicitud abierta | Integración | Por ejecutar |
| CP-13 | CU3 | El SKU escaneado no coincide | Código "YS-000041" para el producto 42 | No coincide; la solicitud queda "Rechazada" por "no corresponde" | Automatizada | Aprobado |
| CP-14 | CU3 | Prenda deteriorada | Política "rechazar"; política "descuento" 30 % aceptado y no aceptado | Rechazada; Aprobada con 30 %; Rechazada | Automatizada | Aprobado |
| CP-15 | CU3, CU10 | Defecto de fábrica | Resultado "defectuosa" y resultado "apta" | Aprobada con destino "no\_vendible"; la apta va a "vendible" | Automatizada | Aprobado |
| CP-16 | CU3 | Crédito con recargo y deterioro | Prenda de Bs 120, recargo Bs 12, deterioro Bs 36 | Crédito de Bs 72,00; nunca negativo (Bs 10 con recargo Bs 12 da Bs 0,00) | Automatizada | Aprobado |
| CP-17 | CU4 | Clasificación del cambio | Polera M negra por L negra, M gris, L gris y jean 32 negro | cambio\_talla, cambio\_color, cambio\_producto, cambio\_producto | Automatizada | Aprobado |
| CP-18 | CU4 | Diferencia propia de la variante | Pagado Bs 120; variante nueva de Bs 120 y de Bs 130 | Bs 0,00 ("Cambio sin costo") y Bs 10,00 | Automatizada | Aprobado |
| CP-19 | CU4 | Respetar el precio original | Pagado Bs 120; el modelo subió a Bs 150 | Con la opción activa, Bs 0,00; sin ella, Bs 30,00 | Automatizada | Aprobado |
| CP-20 | CU4, CU5 | Saldo a favor según la política | Política nota de crédito, reembolso, cliente elige, sin dinero y sin dinero con defecto | Nota, reembolso, reembolso, nota y reembolso | Automatizada | Aprobado |
| CP-21 | CU5 | Cambio por otro producto con diferencia | Crédito Bs 120; dos productos por Bs 150 | Venta nueva de Bs 150 vinculada; Bs 30 cobrados; solicitud "Completada" | Integración | Por ejecutar |
| CP-22 | CU6 | El reembolso usa el medio de la venta | Ventas pagadas con tarjeta Stripe, QR, nota de crédito, efectivo y sin pago registrado | tarjeta, qr, nota\_credito, efectivo y efectivo | Automatizada | Aprobado |
| CP-23 | CU6 | Umbral de autorización | Umbral Bs 300; montos Bs 300,01 y Bs 300,00 | Bs 300,01 pide autorización; Bs 300,00 no | Automatizada | Aprobado |
| CP-24 | CU7 | Códigos únicos | Nota 7, caso 123, producto 42 | NC-000007, DEV-000123, YS-000042 | Automatizada | Aprobado |
| CP-25 | CU7 | Vencimiento de la nota | Nota "Vigente" que vence mañana, una que venció hace 1 s y una "Usada" | Vigente, Vencida y Usada | Automatizada | Aprobado |
| CP-26 | CU7 | Canje con saldo insuficiente | Nota con saldo Bs 50, venta de Bs 80, resto en efectivo | Se aplican Bs 50 y se cobran Bs 30; la nota queda "Usada" | Integración | Por ejecutar |
| CP-27 | CU8 | Traslado desde otra sucursal | Variante sin stock en la sucursal y con 3 unidades en otra | Movimientos "salida\_traspaso" y "entrada\_traspaso"; solicitud "CambioPendiente" | Integración | Por ejecutar |
| CP-28 | CU9 | Garantía menor que el plazo de cambio | Plazo de 72 h y garantía de 2 días | Error en plazoGarantiaDias; la política por defecto no tiene errores | Automatizada | Aprobado |
| CP-29 | CU9 | Saldo a favor en dinero sin reembolso | saldoAFavor "reembolso" con permiteReembolso falso | Error en saldoAFavor | Automatizada | Aprobado |
| CP-30 | CU9 | Valores inválidos marcados por campo | Recargo 150 %, descuento por deterioro −1 %, máximo de cambios 0 | Error en los 3 campos | Automatizada | Aprobado |
| CP-31 | CU10 | Entrada de una prenda apta | Cambio confirmado de una prenda apta | +1 en el inventario de la sucursal; movimiento "Entrada por devolución" | Integración | Aprobación |

# 

# CAPÍTULO VI. CONCLUSIONES Y RECOMENDACIONES

## 6.1. Conclusiones

1. La aplicación de la metodología ICONIX demostró ser pragmática y eficiente, permitiendo mantener la documentación UML 2.5+ estrictamente sincronizada con la evolución del código fuente.
2. La arquitectura Multitenant (Shared Schema) en PostgreSQL garantizó el aislamiento lógico total entre empresas contratantes, permitiendo escalar el sistema bajo un modelo SaaS con regulación estricta por planes de suscripción.
3. La estrategia Offline-First sobre la PWA en Angular con IndexedDB resolvió el problema de la falta de red en tienda, permitiendo procesar ventas y reservas locales con sincronización e idempotencia posterior sin pérdida de datos.
4. La integración del módulo de IA Generativa y Machine Learning democratizó el acceso a la información empresarial, permitiendo construir reportes y gráficos en tiempo real mediante consultas en lenguaje natural.

## 6.2. Recomendaciones

1. Implementar pasarelas de pago recurrentes reales en producción para automatizar la renovación de planes de suscripción SaaS.
2. Ampliar los algoritmos de resolución de conflictos offline mediante interfaces visuales para que los administradores gestionen colisiones complejas de stock manualmente.
3. Incorporar caché avanzado a nivel de backend para optimizar los tiempos de respuesta del modelo de IA en reportes con volúmenes masivos de datos.

# 

# 7. BIBLIOGRAFÍA

1. Rosenberg, D., & Stephens, M. (2007). Use Case Driven Object Modeling with UML: Theory and Practice. Apress.
2. Garzón Cuéllar, A. (2026). Especificación del Examen Parcial 2 - Sistemas de Información 2. UAGRM.
3. Fowler, M. (2003). Patterns of Enterprise Application Architecture. Addison-Wesley.
4. FastAPI Documentation. Python High Performance Framework.[https://fastapi.tiangolo.com/](https://www.google.com/url?q=https://fastapi.tiangolo.com/&sa=D&source=editors&ust=1794199076843637&usg=AOvVaw2iRzU5QyXX3escxBAiq_Kb)

# 

# 8. ANEXOS

Link y Código QR del repositorio

[https://github.com/NicolasRevollor/PARC2-SI2](https://www.google.com/url?q=https://github.com/NicolasRevollor/PARC2-SI2&sa=D&source=editors&ust=1794199076843888&usg=AOvVaw2jZooVHxHEEBpGrwza3jRE)

Link y Código QR de la Web

[https://parc-2-si-2.vercel.app/](https://www.google.com/url?q=https://parc-2-si-2.vercel.app/&sa=D&source=editors&ust=1794199076844044&usg=AOvVaw05pKWU111Jd0DrhcH-YoUi)

Casos de usos del primer parcial

|  |  |  |  |
| --- | --- | --- | --- |
| ID | Caso de uso | Actores | Prioridad |
| CU1 | Registrar Cliente | Cliente | Alta |
| CU2 | Autenticar e Iniciar Sesión | Todos | Alta |
| CU3 | Gestionar Usuarios y Roles | Admin | Alta |
| CU4 | Gestionar Ciudades y Sucursales | Admin | Alta |
| CU5 | Administrar Catálogo de Productos | Admin, Encargado de Sucursal | Media |
| CU6 | Gestionar Temporadas y Colecciones | Admin, Encargado de Sucursal | Alta |
| CU7 | Gestionar Proveedores | Admin, Encargado de Sucursal | Media |
| CU8 | Consultar Disponibilidad e Inventario Global | Cliente, Encargado de Sucursal | Alta |
| CU9 | Registrar Movimientos de Inventario | Encargado de Sucursal | Media |
| CU10 | Consultar Catálogo Multicanal | Encargado de Sucursal, Cliente | Media |
| CU11 | Utilizar Vestidor Virtual (RA) | Cliente, Encargado de Sucursal | Alta |
| CU12 | Registrar Reserva de Prendas | Encargado de Sucursal, Cliente | Media |
| CU13 | Consultar y Cancelar Reservas | Cliente, Encargado de Sucursal | Media |
| CU14 | Recepcionar y Preparar Reserva | Cliente, Encargado de Sucursal | Alta |
| CU15 | Confirmar Recepción/Atención de Cliente | Encargado de Sucursal, cliente | Baja |
| CU16 | Realizar Compra Digital (Web/Móvil) | Cliente | Alta |
| CU17 | Procesar Pago Electrónico | Cliente | Baja |
| CU18 | Registrar Venta Presencial (POS) | Cajero | Baja |
| CU19 | Procesar Pago en Caja y Emitir Comprobante | Encargado de Sucursal | Media |
| CU20 | Actualizar Inventario Automáticamente | Sistema | Alta |
| CU21 | Obtener recomendaciones inteligentes | Cliente | Media |
| CU22 | Interactuar con asistente virtual/ChatBot | Cliente | Media |
| CU23 | Visualizar dashboard de indicadores empresariales | Administrador | Media |
| CU24 | Generar reportes de ventas e inventarios | Administrador/Encargado de Sucursal | Media |
