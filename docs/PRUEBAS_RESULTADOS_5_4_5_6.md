# Pruebas y resultados de YouShop Collective

Texto propuesto para sustituir los puntos 5.4, 5.5 y 5.6 del informe. Fecha de corte: **8 de noviembre de 2026**. Alcance: devoluciones y cambios, operación sin conexión, plataforma SaaS, reportes, inteligencia artificial, delivery, fidelización y asistente virtual, correspondientes a CU1–CU36.

Se tomó como referencia el [documento de Google](https://docs.google.com/document/d/1j5LivBwIz-WoMbSy50Dwhx-kBtKa9pH7FNxTS-Uj4bY/edit), cuya copia de lectura se encuentra en [INFORME_GOOGLE_ACTUAL.md](INFORME_GOOGLE_ACTUAL.md), y el código de `backend/tests`. Los resultados indicados como aprobados proceden de la ejecución descrita en 5.5. Los resultados esperados de pruebas pendientes representan criterios de aceptación, no observaciones de una ejecución.

## 5.4. Corrección de errores

La corrección de errores se organizó en cuatro actividades: identificar el comportamiento incorrecto, localizar su causa, aplicar la modificación y verificar que el resultado coincidiera con la regla de negocio. Cuando fue posible aislar el comportamiento, se utilizaron pruebas automatizadas para prevenir su reaparición. Las correcciones que involucran transacciones, inventario y aislamiento entre empresas requieren además pruebas de integración con PostgreSQL.

### 5.4.1. Errores registrados en el informe original

El documento original registra ocho incidencias del módulo de devoluciones. Sus fechas y correcciones se conservan como antecedentes documentales: E8 figura corregido el 14 de octubre de 2026 y E1–E7 el 23 de octubre de 2026. Estas fechas no corresponden a la ejecución actual.

| ID | Caso de uso | Error registrado | Corrección documentada | Severidad registrada | Verificación al corte |
|---|---|---|---|---|---|
| E1 | CU1 | Dos solicitudes simultáneas podían superar las unidades vendidas. | Bloquear la venta con `SELECT … FOR UPDATE` durante el registro. | Alta | Pendiente de repetir una prueba concurrente con PostgreSQL. |
| E2 | CU1, CU2 | La respuesta permitía distinguir una venta ajena de una inexistente. | Responder «Venta no encontrada» en ambos casos. | Alta | Pendiente de integración entre dos empresas. |
| E3 | CU1, CU2 | Se podía seleccionar una sucursal receptora de otra empresa. | Validar la pertenencia de la sucursal al tenant autenticado. | Alta | Pendiente de integración. |
| E4 | CU4, CU5 | Se admitía una prenda de reemplazo perteneciente a otra empresa. | Filtrar y validar el producto por empresa. | Alta | Pendiente de integración. |
| E5 | CU10 | El reingreso podía utilizar inventario de una sucursal ajena. | Restringir la búsqueda a las sucursales de la empresa. | Alta | Pendiente de integración y verificación de movimientos. |
| E6 | CU1 | La búsqueda del personal incluía prendas de otras empresas. | Filtrar la consulta por el tenant del usuario. | Media | Pendiente de integración. |
| E7 | CU4 | El ajuste de medida exigía existencia en inventario aunque no movía stock. | Excluir ese ajuste de la comprobación de stock de reemplazo. | Media | Pendiente de repetir el flujo completo. |
| E8 | CU1, CU2 | Comparar fechas sin zona horaria con fechas UTC producía una excepción. | Interpretar las fechas sin zona como UTC antes de compararlas. | Media | Aprobada la regresión unitaria `test_fecha_naive_se_interpreta_como_utc_y_no_explota`. |

La ejecución actual respalda directamente la regresión de E8. Los otros siete antecedentes no se consideran nuevamente validados por el solo hecho de que las pruebas unitarias hayan pasado.

### 5.4.2. Correcciones y comprobaciones posteriores

| ID | Módulo | Problema o inconsistencia comprobada | Modificación aplicada | Evidencia y estado |
|---|---|---|---|---|
| E9 | Asistente virtual, CU36 | En una prueba directa anterior, el modelo `gemini-2.5-flash` respondió 404 indicando que ya no estaba disponible para usuarios nuevos de esa clave. El backend presentaba el fallo como 503. | Se reemplazó el modelo por `gemini-3.5-flash`. | En esa prueba manual respondió HTTP 200 y «OK». Antecedente de esta sesión; no se repitió la llamada externa en la ejecución de 5.5. |
| E10 | Consulta de catálogo, CU36 | El resultado de `buscar_productos` se enviaba a Gemini con el rol `tool`, en lugar del rol `user` utilizado para `functionResponse`. | Se corrigió el rol y se conservó íntegro el contenido de la llamada del modelo. | Aprobado `test_catalogo_y_reintento_no_repiten_la_consulta`, con Gemini y catálogo simulados. Pendiente de confirmar en Render. |
| E11 | Disponibilidad del chat, CU36 | Un error temporal de Gemini terminaba la consulta sin recuperación controlada por la aplicación. | Hasta tres intentos para 429, 500, 502, 503, 504 y errores de transporte; esperas de 1 y 2 segundos. Los errores 400 y 403 terminan sin reintento. | Seis ejecuciones parametrizadas aprobadas: recuperación de 503, 429 y timeout; rechazo inmediato de 400 y 403; límite de tres intentos ante 503 persistente. |
| E12 | Diagnóstico del chat, CU36 | El mensaje HTTP genérico no permitía conocer el código original de Gemini. | Registro del modelo, código y número de intento, sin registrar la clave, la consulta ni el cuerpo del error. | Las pruebas verifican la presencia del código y la ausencia de los textos privados usados como señuelo. La configuración del cliente verifica timeout de 20 segundos por intento y ausencia de reintentos duplicados del SDK. |
| E13 | Autenticación, transversal | El código de las pruebas documenta el riesgo de aceptar tokens de renovación o recuperación como tokens de acceso. | Diferenciar los tipos de token y conservar la distinción para tokens anteriores al campo `type`. | Cinco pruebas de `test_security.py` aprobadas, incluida la huella de contraseña. |
| E14 | Documentación de resultados | El punto 5.5 seguía informando 28 pruebas de octubre, aunque la suite y el alcance habían crecido. | Sustituir la cifra histórica por el resultado actual y separar aprobadas de omitidas. | XML de esta ejecución: 178 casos recolectados, 116 aprobados, 62 omitidos, 0 fallos y 0 errores. |
| E15 | Documentación de CU7 | Los puntos antiguos aún describían notas de crédito, mientras la implementación actual usa notas de devolución. | Documentar el comprobante del monto devuelto, el medio de pago y el estado del reembolso. | Aprobadas las pruebas de contenido y de reembolso pendiente en `test_devoluciones.py`. |

Los errores 429 y 503 pueden persistir aunque el formato de la solicitud sea correcto. Los reintentos mejoran la recuperación ante fallos temporales; no garantizan disponibilidad de Gemini ni sustituyen la revisión de cuotas. Las pruebas locales del chat no permiten atribuir todos los 503 observados en producción a una única causa.

## 5.5. Resultados de las pruebas

### 5.5.1. Entorno y procedimiento

El 8 de noviembre de 2026 se ejecutó la suite del backend en Windows, con Python 3.12.10 y pytest 8.3.4. Se utilizaron valores de configuración ficticios y servicios simulados en las pruebas que así lo requieren. No se cargó el archivo `.env`, no se utilizaron credenciales reales y no se conectó una base de datos de producción.

El lanzador de la ejecución se encuentra en [ejecutar_pruebas_aisladas.py](evidencias/ejecutar_pruebas_aisladas.py). Se ejecuta desde la raíz del proyecto, con las dependencias del backend instaladas:

```powershell
python docs/evidencias/ejecutar_pruebas_aisladas.py
```

El lanzador deshabilita expresamente `TEST_DATABASE_URL`, inyecta una configuración de prueba y ejecuta pytest sobre `backend/tests`. Por ello, las pruebas marcadas como dependientes de una base de datos se omiten. El detalle verificable se entrega en [resultados_pytest.xml](evidencias/resultados_pytest.xml) y en el [listado de ejecuciones](evidencias/RESULTADOS_DETALLADOS.md).

### 5.5.2. Resultado general

| Indicador | Resultado observado |
|---|---:|
| Casos recolectados, incluidas parametrizaciones | 178 |
| Pruebas ejecutadas y aprobadas | 116 |
| Pruebas fallidas | 0 |
| Errores de ejecución o colección | 0 |
| Pruebas omitidas | 62 |
| Advertencias | 4 |
| Tiempo informado por pytest | 7,63 segundos |
| Éxito sobre pruebas ejecutadas | 100 %: 116 de 116 |
| Proporción ejecutada sobre la suite recolectada | 65,17 %: 116 de 178 |

El 100 % corresponde únicamente a las pruebas efectivamente ejecutadas. Las 62 omitidas no se contabilizan como aprobadas. La proporción ejecutada tampoco representa cobertura del código ni porcentaje de requisitos validados.

### 5.5.3. Resultados por archivo

| Archivo en `backend/tests` | Recolectadas | Aprobadas | Fallidas | Errores | Omitidas |
|---|---:|---:|---:|---:|---:|
| `test_caja_sincronizacion.py` | 14 | 14 | 0 | 0 | 0 |
| `test_catalogo.py` | 4 | 4 | 0 | 0 | 0 |
| `test_chat_gemini_unit.py` | 8 | 8 | 0 | 0 | 0 |
| `test_cu12_cu20_integracion.py` | 30 | 0 | 0 | 0 | 30 |
| `test_cu21_cu30_integracion.py` | 14 | 0 | 0 | 0 | 14 |
| `test_cu21_cu30_reglas.py` | 14 | 14 | 0 | 0 | 0 |
| `test_cu31_cu32_domicilio.py` | 5 | 0 | 0 | 0 | 5 |
| `test_cu33_cupones.py` | 5 | 0 | 0 | 0 | 5 |
| `test_cu34_cu35.py` | 4 | 0 | 0 | 0 | 4 |
| `test_cu36_chatbot.py` | 4 | 0 | 0 | 0 | 4 |
| `test_devoluciones.py` | 24 | 24 | 0 | 0 | 0 |
| `test_historial_devoluciones.py` | 5 | 5 | 0 | 0 | 0 |
| `test_reportes_ia.py` | 9 | 9 | 0 | 0 | 0 |
| `test_reports.py` | 12 | 12 | 0 | 0 | 0 |
| `test_respaldos.py` | 10 | 10 | 0 | 0 | 0 |
| `test_returns.py` | 6 | 6 | 0 | 0 | 0 |
| `test_security.py` | 5 | 5 | 0 | 0 | 0 |
| `test_suscripcion_sincronizacion.py` | 5 | 5 | 0 | 0 | 0 |
| **Total** | **178** | **116** | **0** | **0** | **62** |

Las cuatro advertencias corresponden a obsolescencias en dependencias: una por `ast.NameConstant` en ReportLab y tres por `datetime.utcnow()` en python-jose. No produjeron fallos en esta ejecución. La cifra de 56 advertencias indicada en el documento original pertenecía a otra ejecución y no se conserva como resultado actual.

### 5.5.4. Interpretación y verificaciones pendientes

Los resultados respaldan las reglas de plazos, recargos, inspección y diferencias de precio; el contenido de las notas de devolución; el cálculo de caja y la clasificación de conflictos; las restricciones de suscripción; la interpretación local de reportes; el alcance de sucursales; la exportación de archivos; las reglas de respaldos; la distinción de tokens y el manejo simulado de errores del chatbot.

Quedan pendientes de ejecución 30 pruebas del grupo CU12–CU20, 14 del grupo CU21–CU30, cinco de delivery CU31–CU32, cinco del archivo de cupones CU33, cuatro de CU34–CU35 y cuatro del chat CU36. Algunas reglas puras están dentro de archivos marcados completos como dependientes de PostgreSQL, por lo que también se omiten en esta corrida. Esto incluye `test_reglas_del_cupon` y `test_reglas_del_asistente`.

Para cerrar la validación se necesita una base PostgreSQL exclusiva de pruebas, con las migraciones y datos requeridos por las fixtures, y la ejecución de los flujos funcionales de la sección 5.6. También falta comprobar los servicios externos y el despliegue: pagos, correo, Gemini, reconocimiento de voz y continuidad de la operación sin conexión en un navegador real. Las pruebas actuales no incluyen mediciones de carga, concurrencia real, cobertura de código ni aceptación de usuarios.

## 5.6. Casos de prueba

Cada caso identifica la condición inicial, la acción o entrada, el resultado esperado y el estado observado. Los importes se expresan en bolivianos (Bs). Se distinguen pruebas de reglas o servicios aislados y flujos completos de integración o interfaz. Un resultado unitario aprobado no supone que la pantalla, el endpoint y la persistencia del mismo caso de uso estén aprobados.

### 5.6.1. Casos ejecutados de reglas y servicios aislados

Las siguientes filas agrupan escenarios representativos. Una fila puede corresponder a varias funciones o parametrizaciones; por ello su cantidad no debe sumarse como si fuera el total de pytest. El anexo contiene las 178 ejecuciones individuales con su estado real.

| ID | CU o módulo | Precondición y entrada | Acción | Resultado esperado | Resultado observado | Archivo de evidencia |
|---|---|---|---|---|---|---|
| CP-A01 | CU1, CU2 | Venta de hace 23 h; política de 24 h. | Evaluar elegibilidad. | Solicitud dentro del plazo y aproximadamente una hora restante. | Aprobado. | `test_devoluciones.py`, `test_returns.py` |
| CP-A02 | CU1, CU2 | Venta de hace 25 h; rechazo fuera de plazo. | Evaluar elegibilidad y el límite exacto de 24 h. | Rechazo fuera de plazo; la función de ventana estricta considera vencidas las 24 h exactas. | Aprobado. | `test_devoluciones.py`, `test_returns.py` |
| CP-A03 | CU1 | Prenda de Bs 120; 30 h de demora; recargo del 5 % por día iniciado. | Calcular recargo. | Dos días iniciados: Bs 12. El recargo nunca supera el valor de la prenda. | Aprobado. | `test_devoluciones.py` |
| CP-A04 | CU1 | Defecto de fábrica a los 10 y 31 días. | Evaluar garantía. | Elegible a los 10 días; rechazada a los 31 días con la política de prueba. | Aprobado. | `test_devoluciones.py` |
| CP-A05 | CU1, CU2 | Categoría no retornable; máximo de cambios alcanzado o cero unidades disponibles. | Evaluar cada restricción. | Rechazo por la causa correspondiente; la excepción por defecto se evalúa con garantía. | Aprobado. | `test_devoluciones.py` |
| CP-A06 | CU1, CU2 | Fecha de venta sin zona horaria, dos horas anterior a UTC. | Calcular elegibilidad y horas restantes. | No se produce `TypeError`; quedan 22 h. | Aprobado. | `test_returns.py` |
| CP-A07 | CU3 | SKU escaneado distinto al de la prenda. | Decidir inspección. | Solicitud rechazada por no corresponder. | Aprobado. | `test_devoluciones.py` |
| CP-A08 | CU3, CU10 | Prenda deteriorada con política de rechazo y con política de descuento del 30 %. | Evaluar inspección con y sin aceptación del descuento. | Rechazo o aprobación según política y consentimiento; un defecto se destina a no vendible. | Aprobado en reglas; no se ejecutó el movimiento real de inventario. | `test_devoluciones.py` |
| CP-A09 | CU4, CU5 | Cambios M negra a L negra, M gris, L gris y jean. | Clasificar el cambio. | Talla, color o producto según los atributos; rechazo de clasificación inconsistente. | Aprobado. | `test_devoluciones.py` |
| CP-A10 | CU4, CU5 | Pago de Bs 120; variante de Bs 120 o Bs 130. | Calcular diferencia. | Bs 0 y Bs 10, respectivamente. | Aprobado. | `test_devoluciones.py` |
| CP-A11 | CU4 | Prenda comprada a Bs 120 cuyo precio general subió a Bs 150. | Comparar con y sin respeto al precio original. | Bs 0 si se respeta el precio original; Bs 30 si no se respeta. | Aprobado. | `test_devoluciones.py` |
| CP-A12 | CU4 | Prendas con medidas de pecho y largo; otra comparación con la misma letra L. | Comparar tallas. | Se informa la diferencia en centímetros, aunque dos prendas tengan la misma talla nominal; sin medidas se usa el orden de tallas. | Aprobado. | `test_devoluciones.py` |
| CP-A13 | CU5, CU6 | Valor Bs 120; recargo Bs 12 y deterioro Bs 36. | Calcular valor a favor y medio de reembolso. | Valor a favor Bs 72; medio coherente con el pago original. | Aprobado en reglas. | `test_devoluciones.py` |
| CP-A14 | CU6 | Umbral de autorización Bs 300. | Evaluar Bs 300 y Bs 300,01. | Solo Bs 300,01 supera el umbral. | Aprobado. | `test_devoluciones.py` |
| CP-A15 | CU7 | Caso DEV-000123; devolución Bs 80 en efectivo; otro caso con reembolso pendiente. | Construir la nota de devolución. | Código, importe y medio correctos; advertencia si el reembolso sigue pendiente. | Aprobado. | `test_devoluciones.py` |
| CP-A16 | CU9 | Plazo de cambio de 72 h y garantía de dos días; porcentajes inválidos. | Validar política. | Error asociado al campo correspondiente; la garantía no puede ser menor al plazo de cambio. | Aprobado. | `test_devoluciones.py` |
| CP-A17 | CU11 | Administrador y Encargado con diferentes sucursales asignadas. | Resolver alcance y aplicar filtro. | El filtro no amplía las sucursales autorizadas; Excel con reporte, indicadores y datos. | Aprobado en funciones de alcance y generación del archivo. | `test_historial_devoluciones.py` |
| CP-A18 | CU13 | Catálogo definido por tipo, color y talla. | Validar combinaciones. | 26 productos de la oferta; rechazo de prendas y combinaciones ajenas. | Aprobado para catálogo; no prueba IndexedDB. | `test_catalogo.py` |
| CP-A19 | CU17, CU18 | Línea con cantidad mayor al stock o precio local distinto. | Clasificar conflicto. | `stock_insuficiente` o `precio_desactualizado`; una reserva no trata igual el cambio de precio. | Aprobado. | `test_caja_sincronizacion.py` |
| CP-A20 | CU18 | Producto desactivado y conflicto superior al umbral. | Calcular decisiones permitidas. | Producto desactivado solo anulable; el exceso del umbral requiere Administrador. | Aprobado en reglas. | `test_caja_sincronizacion.py` |
| CP-A21 | CU17, CU24, CU25 | Operaciones anteriores y posteriores a una suspensión o baja. | Evaluar fecha de operación. | Aceptar lo realizado antes; rechazar lo posterior según la regla evaluada. | Aprobado en reglas; pendiente de persistencia. | `test_caja_sincronizacion.py`, `test_cu21_cu30_reglas.py` |
| CP-A22 | CU20 | Inicial Bs 100, ingresos Bs 250, egresos Bs 50, contado Bs 300. | Calcular arqueo y decisión de cierre. | Esperado Bs 300 y diferencia Bs 0; diferencias altas requieren aprobación; pendientes producen cierre provisional. | Aprobado. | `test_caja_sincronizacion.py` |
| CP-A23 | CU22 | Suscripción vencida hace uno u ocho días; otra próxima a vencer. | Calcular estado; sumar meses desde un fin de mes. | Gracia, suspendida o por vencer según fecha; 31 de enero más un mes resulta en 28 de febrero de 2026. | Aprobado. | `test_cu21_cu30_reglas.py`, `test_suscripcion_sincronizacion.py` |
| CP-A24 | CU24, CU25 | Cuenta dada de baja o suscripción en gracia/suspendida. | Evaluar autorización por método y ruta. | Baja: 401; en gracia se permiten consultas y se bloquean escrituras; se mantienen las excepciones de sincronización previstas. | Aprobado en función de decisión, sin petición HTTP real. | `test_cu21_cu30_reglas.py` |
| CP-A25 | CU26 | «Mostrame las ventas de septiembre agrupadas por sucursal». | Interpretar y validar con fecha de referencia de noviembre de 2026. | Fuente ventas, agrupación sucursal y rango del 1 al 30 de septiembre. | Aprobado. | `test_cu21_cu30_reglas.py` |
| CP-A26 | CU26 | Petición ambigua, intento de borrar datos o consulta de otra empresa. | Interpretar por reglas y validar alcance. | Aclaración ante ambigüedad; rechazo de escritura o acceso ajeno; Encargado limitado a sus sucursales. | Aprobado. | `test_cu21_cu30_reglas.py` |
| CP-A27 | CU28 | Filas de ventas e inventario y conjuntos vacíos. | Ordenar, totalizar y exportar. | Totales y CSV correctos; archivos PDF no vacíos y válidos por su cabecera; Excel con las hojas esperadas. | Aprobado en generación; sin descarga por navegador. | `test_reports.py`, `test_historial_devoluciones.py` |
| CP-A28 | CU29 | R² nuevo 0,4 frente a 0,3; MAE nuevo 1 frente a 1,5. | Comparar métricas. | Diferencias R² = 0,1 y MAE = −0,5; sin versión anterior se devuelve comparación vacía. | Aprobado; no equivale a entrenar ni publicar un modelo. | `test_cu21_cu30_reglas.py` |
| CP-A29 | Reportes con IA | Gemini simulado con error y métricas por sucursal. | Activar respaldo por reglas y calcular cortes del día. | Respaldo con aviso cuando falla IA; cortes horarios de Bolivia y montos numéricos correctos. | Aprobado. | `test_reportes_ia.py` |
| CP-A30 | Respaldos | Secreto correcto/incorrecto; archivos por tenant; retención mínima. | Validar secreto, serializar y seleccionar borrado. | Rechazar secreto incorrecto, conservar el último respaldo, recuperar montos/fechas y rechazar escapes de carpeta. | Aprobado en reglas; no prueba restauración real de PostgreSQL. | `test_respaldos.py` |
| CP-A31 | Seguridad | Tokens de acceso, renovación y recuperación. | Clasificar y verificar huella de contraseña. | Cada token conserva su finalidad; cambiar contraseña cambia la huella. | Aprobado. | `test_security.py` |
| CP-A32 | CU36 | Errores simulados 503, 429 y timeout seguidos de respuesta válida. | Consultar mediante el helper de reintentos. | Recuperación en el segundo intento y una espera de un segundo. | Aprobado en las tres parametrizaciones. | `test_chat_gemini_unit.py` |
| CP-A33 | CU36 | Error persistente 503, o errores 400 y 403. | Agotar o descartar reintentos. | Máximo tres intentos para 503; uno para 400/403; logs sin textos privados. | Aprobado en las tres parametrizaciones. | `test_chat_gemini_unit.py` |
| CP-A34 | CU36 | Gemini solicita catálogo; el segundo turno falla una vez. | Ejecutar herramienta y repetir solo la llamada a Gemini. | Catálogo consultado una vez; mismo contexto y firma del modelo; resultado con rol `user`. | Aprobado con catálogo y Gemini simulados. | `test_chat_gemini_unit.py` |
| CP-A35 | CU36 | Creación del cliente de Gemini interceptada por una prueba. | Inspeccionar opciones HTTP. | Timeout de 20 000 ms y un intento en el SDK para evitar multiplicar los reintentos de la aplicación. | Aprobado. | `test_chat_gemini_unit.py` |

### 5.6.2. Casos de integración y aceptación por caso de uso

**Precondiciones generales:** base PostgreSQL exclusiva de pruebas con las migraciones aplicadas; empresas A y B; usuarios con roles y permisos diferentes; sucursales, productos, existencias y una venta pagada. Para operación sin conexión, preparar el dispositivo con conexión antes de desconectar. Para servicios externos, utilizar cuentas de prueba o simulaciones controladas y registrar cuál se empleó.

**Estado de todas las filas siguientes: pendiente de ejecución funcional completa en esta entrega.** Algunas cuentan con pruebas automatizadas de integración ya escritas, pero omitidas en la corrida actual; otras requieren comprobación manual de interfaz. Las expectativas descritas no constituyen resultados observados.

| ID | CU | Flujo normal: preparación y pasos | Resultado esperado normal | Flujo alternativo y resultado esperado | Evidencia prevista |
|---|---|---|---|---|---|
| CP-I01 | CU1 | Personal de A busca una venta propia vigente y registra una solicitud. | Caso con código único y estado de inspección; bitácora registrada. | Venta de B o inexistente: misma respuesta sin revelar datos; dos solicitudes concurrentes no superan las unidades vendidas. | API, tablas y prueba concurrente dedicada. |
| CP-I02 | CU2 | Cliente solicita devolución desde una compra propia y elige entrega en sucursal. | Solicitud pendiente de entrega con fecha límite y datos correctos. | Otra cuenta intenta usar la venta: rechazo; solicitud abierta no duplica la misma unidad. | API y pantalla Mis compras. |
| CP-I03 | CU3 | Personal recibe la prenda y registra SKU coincidente y condición apta. | Solicitud aprobada. | SKU distinto: rechazo; deterioro o defecto siguen la política vigente. | API, estado del caso y bitácora. |
| CP-I04 | CU4 | Resolver un caso aprobado con otra talla/color disponible. | Diferencia correcta y movimientos consistentes de ambas prendas. | Ajuste de medida sin inventario: no exigir stock de reemplazo; producto ajeno rechazado. | API, inventario y movimientos. |
| CP-I05 | CU5 | Elegir producto diferente y pagar la diferencia. | Venta de cambio vinculada; valor de la prenda devuelta aplicado una sola vez. | Reemplazo de menor valor: saldo a favor según política; producto de B rechazado. | API, venta, pagos e inventario. |
| CP-I06 | CU6 | Solicitud aprobada con devolución de dinero; resolver por el medio correspondiente. | Monto correcto y estado de reembolso coherente. | Pasarela simulada falla: reembolso pendiente, sin indicar que se pagó; exceso de umbral requiere autorización. | API y registro de pago/pasarela. |
| CP-I07 | CU7 | Abrir una devolución con dinero reembolsado y descargar su nota. | Comprobante con prenda, descuentos, monto, medio y estado. | Cambio sin devolución de dinero: mostrar comprobante que corresponda, sin inventar un reembolso. | API de nota y revisión del PDF. |
| CP-I08 | CU8 | Solicitar cambio sin stock local y gestionar existencia en otra sucursal. | Traslado registrado y cambio pendiente hasta la entrega. | Sin stock en ninguna sucursal: ofrecer opciones autorizadas sin descontar inventario inexistente. | API, traslado y movimientos. |
| CP-I09 | CU9 | Administrador cambia una política con parámetros válidos. | Nueva versión; las ventas anteriores mantienen la política correspondiente. | Garantía menor al plazo de cambio o porcentajes inválidos: errores por campo. | API, versiones de política y venta. |
| CP-I10 | CU10 | Completar cambio o devolución de prenda apta y otra defectuosa. | Apta al stock vendible; defectuosa al no vendible; trazabilidad de movimientos. | Repetir la resolución: no duplicar entradas ni salidas; inventario de B inaccesible. | Tablas de inventario y movimientos. |
| CP-I11 | CU11 | Administrador consulta historial, aplica filtros y exporta. | Indicadores consistentes y archivos con datos del alcance autorizado. | Encargado filtra una sucursal ajena: no amplía su acceso; sin datos, mensaje de vacío. | API y validación visual de exportaciones. |
| CP-I12 | CU12 | Preparar dispositivo con conexión y descargar las secciones. | Catálogo, stock y datos autorizados disponibles para trabajo local. | Plan sin función: 402; interrupción conserva el último estado utilizable. | `test_cu12_cu20_integracion.py` y navegador. |
| CP-I13 | CU13 | Tras preparar dispositivo, desconectar y consultar catálogo. | Productos y existencias locales visibles, con indicación de datos locales. | Sin preparación previa: informar falta de datos; no presentar stock desactualizado como confirmado. | Navegador e IndexedDB. |
| CP-I14 | CU14 | Con caja y catálogo preparados, desconectar y registrar venta en efectivo. | Operación local pendiente; al sincronizar, venta y movimiento de caja únicos. | Tarjeta sin conexión: rechazo; reenvío del UUID no duplica la venta. | `test_cu12_cu20_integracion.py` y navegador. |
| CP-I15 | CU15 | Registrar reserva y sincronizar con stock suficiente. | Stock reservado; confirmación con fecha y hora de Bolivia. | Sin stock: conflicto; cancelación libera lo reservado. | `test_cu12_cu20_integracion.py`. |
| CP-I16 | CU16 | Crear operaciones locales y consultar su seguimiento. | Estado, intentos y último error visibles; transición al recibir confirmación. | Timeout: conservar operación pendiente y permitir reintento. | Interfaz de pendientes e IndexedDB. |
| CP-I17 | CU17 | Enviar lote pendiente y repetir un UUID ya aplicado. | Confirmación idempotente; sin doble cobro ni doble descuento de stock. | Operación ajena rechazada sin impedir procesar las válidas del lote. | `test_cu12_cu20_integracion.py`. |
| CP-I18 | CU18 | Provocar conflicto de stock/precio y resolver con actor autorizado. | Ajuste o anulación trazable, con inventario y caja coherentes. | Empleado sin permiso o decisión inválida: rechazo; umbral alto exige Administrador. | `test_cu12_cu20_integracion.py`. |
| CP-I19 | CU19 | Registrar cambio local asociado a una venta y sincronizar. | Caso vinculado, diferencia e inventario consistentes. | Venta aún en conflicto: cambio queda pendiente; saldo a favor no se presenta como reembolsado antes de pagarse. | `test_cu12_cu20_integracion.py`. |
| CP-I20 | CU20 | Abrir caja, registrar operaciones y cerrar con arqueo exacto. | Una caja abierta por sucursal; cierre definitivo sin diferencia. | Pendientes: cierre provisional; diferencia alta: justificación y aprobación. | `test_cu12_cu20_integracion.py`. |
| CP-I21 | CU21 | Superadministrador registra empresa y su administrador activa la cuenta. | Empresa, usuario y suscripción correctos; enlace de activación utilizable una vez. | Datos repetidos: errores por campo; enlace vencido o reutilizado rechazado. | `test_cu21_cu30_integracion.py`. |
| CP-I22 | CU22 | Renovar, suspender y reactivar una suscripción de prueba. | Estados, fechas e historial coherentes. | Vencimiento provoca gracia/suspensión; cron sin secreto rechazado; empresa operadora protegida según regla. | `test_cu21_cu30_integracion.py`. |
| CP-I23 | CU23 | Crear, editar y desactivar un plan desde Superadmin. | Límites y funciones guardados; plan desactivado no se ofrece a nuevas altas. | Actor sin permiso o parámetros inválidos: rechazo sin cambios parciales. | `test_cu21_cu30_integracion.py`. |
| CP-I24 | CU24 | Dar alta a personal, asignarle sucursal, darlo de baja y reincorporarlo. | Acceso según rol y estado; operaciones conservan trazabilidad. | Usuario dado de baja no opera; sincronización respeta la fecha de su operación. | `test_cu21_cu30_integracion.py`. |
| CP-I25 | CU25 | Ejecutar una función incluida y crear un recurso bajo el cupo del plan. | Operación permitida. | Función excluida o cupo agotado: 402; gracia bloquea escrituras; suspensión limita acceso. | `test_cu21_cu30_integracion.py`. |
| CP-I26 | CU26 | Pedir ventas de un período por sucursal y guardar favorito. | Reporte de solo lectura con datos del tenant y alcance del actor. | Ambigüedad: pedir aclaración; modificación de datos o consulta ajena: rechazo. | `test_cu21_cu30_integracion.py`. |
| CP-I27 | CU27 | Con micrófono autorizado, dictar una consulta de reporte. | Texto reconocido y confirmación de la consulta; alternativa de transcripción cuando corresponda. | Formato no soportado, audio incomprensible o servicio caído: mensaje controlado y opción de escribir. | Integración de transcripción y navegador con micrófono. |
| CP-I28 | CU28 | Exportar reporte autorizado a PDF y Excel. | Archivo válido, filtros y datos correctos. | Más de 1000 filas: proceso en segundo plano y notificación; otra empresa no descarga el archivo. | `test_cu21_cu30_integracion.py` y revisión visual. |
| CP-I29 | CU29 | Entrenar con datos de prueba, revisar métricas y publicar versión apta. | Versión y métricas registradas; procedencia sintética indicada cuando se use. | Métrica insuficiente o entrenamiento fallido: no publicar ni sustituir la versión activa. | `test_cu21_cu30_integracion.py`. |
| CP-I30 | CU30 | Abrir dashboard con modelos publicados y filtros autorizados. | Indicadores coherentes con el tenant y las sucursales permitidas. | Sin modelo o datos insuficientes: estado informativo; Encargado no ve sucursales ajenas. | `test_cu21_cu30_integracion.py`. |
| CP-I31 | CU31 | Cliente pide recojo; personal programa y confirma recepción en sucursal. | Recogida trazable; inspección habilitada después de recibir la prenda. | Recojo fallido reprogramable; cancelación no cobra viaje; recojo pendiente no vence como entrega en tienda. | `test_cu31_cu32_domicilio.py`. |
| CP-I32 | CU32 | Aprobar y resolver cambio con entrega a domicilio. | Prenda de reemplazo descontada; caso en camino y completado al entregarse. | Devolución solo con reembolso: no crear entrega de reemplazo; fallo de entrega mantiene trazabilidad. | `test_cu31_cu32_domicilio.py`. |
| CP-I33 | CU33 | Completar tres compras válidas y usar el cupón en la siguiente. | Cupón del 30 %, un solo uso y descuento reflejado en líneas de venta. | Vencido, ajeno o reutilizado: rechazo; compra totalmente devuelta no cuenta; compras sin conexión sí suman al sincronizar. | `test_cu33_cupones.py`. |
| CP-I34 | CU34 | Pedir aviso de una talla agotada y reponer existencias. | Aviso en aplicación y envío de correo según configuración; sin avisos repetidos indebidos. | Suscripción inválida al aviso: rechazo; reposición por distintos movimientos activa el mecanismo previsto. | `test_cu34_cu35.py` y servicio de correo de prueba. |
| CP-I35 | CU35 | Cliente compra en línea con dirección, teléfono y envío. | Total incluye delivery; pedido programable hasta entrega. | POS no admite envío; cupón descuenta prendas, no el costo del viaje. | `test_cu34_cu35.py`. |
| CP-I36 | CU36 | Visitante pregunta por catálogo; cliente por sus compras; personal autorizado por reportes. | Cada perfil recibe solo su alcance; catálogo termina el ciclo de herramienta y los reportes se descargan. | Límite público: 429 tras 20 pedidos en 10 minutos; sin clave: 503 controlado; Gemini temporalmente caído: reintentos limitados; voz con alternativa escrita. | `test_cu36_chatbot.py`, pruebas unitarias y Render. |

### 5.6.3. Criterio de cierre

Una prueba se considera aprobada cuando el resultado observado coincide con el esperado y existe evidencia de su ejecución. Para integración se debe registrar el estado HTTP, los cambios persistidos, la identidad del tenant y la ausencia de duplicados. Para interfaz se deben conservar capturas o grabaciones y el navegador utilizado. Para servicios externos se debe indicar si la respuesta fue real o simulada.

Al corte, se cuenta con 116 ejecuciones automatizadas aprobadas. El cierre funcional completo queda pendiente de ejecutar las integraciones omitidas y los flujos de interfaz descritos. No se declara ausencia de errores de producción ni aprobación integral de CU1–CU36 con esta corrida aislada.

### Evidencias entregadas

- [Documento original convertido a Markdown](INFORME_GOOGLE_ACTUAL.md).
- [Resultado individual de las 178 ejecuciones](evidencias/RESULTADOS_DETALLADOS.md).
- [Reporte XML producido por pytest](evidencias/resultados_pytest.xml).
- [Lanzador reproducible sin lectura de `.env`](evidencias/ejecutar_pruebas_aisladas.py).
- [Versiones de las dependencias utilizadas](evidencias/ENTORNO_PRUEBAS.md).
