# Compras y cupones preparados

Fecha de ejecución: **9 de noviembre de 2026**, hora de Bolivia. Tienda: tenant 1.

Se ejecutó el generador `app.demo_cupones` utilizando la conexión configurada localmente, sin imprimir claves ni URL de conexión. El guardado completo se confirmó y después se verificó desde otra conexión.

| Cliente | ID usuario | ID cliente | Ventas demo creadas | Cupón disponible | Descuento |
|---|---:|---:|---|---|---:|
| Juan Pérez Cliente | 6 | 1 | 8813, 8814, 8815 | CUP-EGCHUZ | 30 % |
| Maria Gomez Cliente | 7 | 2 | 8816, 8817, 8818 | CUP-GTTDLH | 30 % |
| Carla Mendoza | 42 | 3 | 8819, 8820, 8821 | CUP-YJNFPU | 30 % |
| Diego Rojas | 43 | 4 | 8822, 8823, 8824 | CUP-SPUN33 | 30 % |
| Valeria Quispe | 44 | 5 | 8825, 8826, 8827 | CUP-YBQVGZ | 30 % |

Cada cuenta tiene tres compras válidas del programa. La regla normal de fidelización emitió el cupón; no se insertaron descuentos arbitrarios ni se cambiaron contraseñas. Los cupones permanecieron disponibles al terminar, para permitir su prueba manual.

## Comprobaciones realizadas

- Quince compras persistidas con origen de pago `demo_cupon` y método «Compra demo (sin cobro)».
- Cinco cupones disponibles y no vencidos, IDs 1 a 5.
- Cinco notificaciones de cupón con `porCorreo = false`; no se enviaron correos.
- Para cada cliente, validación del cupón y cotización del producto 5: subtotal **Bs 260**, descuento **Bs 78** y total **Bs 182**.
- Autenticación contra Stripe: HTTP 200, utilizando claves de prueba.
- Compatibilidad entre ambas claves: se creó un intento de prueba, se recuperó usando la clave pública y se canceló. No se confirmó ningún cobro.
- Endpoint desplegado `https://parc2-si2.onrender.com/api/payments/config`: HTTP 200, `disponible = true` y clave pública presente. No se incluye su valor en este reporte.

La preparación utiliza existencias disponibles y registra las salidas, los historiales y la bitácora. No registra ingreso de efectivo en caja. Las compras de demostración forman parte de los datos y reportes de la base seleccionada.

## Prueba manual pendiente

Entrar con cualquiera de estas cuentas, abrir Perfil → Mis cupones, elegir una prenda y seleccionar el cupón en el resumen de compra. Completar el checkout con una tarjeta de prueba de Stripe y comprobar que el cupón pasa a «Usado» y no se puede reutilizar. La verificación realizada aquí confirma emisión, persistencia, elegibilidad y cotización; no se consumió ningún cupón ni se completó una compra con tarjeta desde el navegador.

Durante la ejecución se aplicó `DEBUG=false` únicamente al proceso de preparación para evitar un valor no interpretable como booleano. No se modificó el archivo `.env`.
