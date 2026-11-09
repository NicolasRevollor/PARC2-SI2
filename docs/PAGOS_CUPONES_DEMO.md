# Compras con tarjeta y cupones de demostración

## Corrección de disponibilidad

La web antes decidía si mostraba «Comprar» usando únicamente `VITE_STRIPE_PUBLISHABLE_KEY`, fijada al compilar el frontend. Ahora consulta `GET /api/payments/config` y utiliza la clave pública configurada en el backend. La clave secreta nunca se envía al navegador. Si el backend no tiene Stripe configurado, no se habilita una compra que no puede cobrarse.

En Render, configurar estas dos variables en el servicio del backend:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Ambas claves deben pertenecer a la misma cuenta y entorno de Stripe. Los valores anteriores son marcadores, no credenciales. No guardar claves secretas en Vercel ni en variables con prefijo `VITE_`.

Después de desplegar los cambios de backend y web, comprobar `/api/payments/config`: debe devolver `disponible: true` y una clave `pk_test_...`. La web también conserva la alternativa de una clave pública `VITE_STRIPE_PUBLISHABLE_KEY` si el backend tiene Stripe configurado pero no una clave pública. El formulario muestra los errores de carga y habilita «Pagar» al estar listo.

Se conserva la verificación del pago en el servidor antes de crear la venta y el bloqueo de reutilización de un método de pago. Este cambio no convierte pagos simulados en pagos con tarjeta confirmados.

## Preparar al menos cinco clientes

Desde `backend/`, con sus dependencias y la conexión `DATABASE_URL` configuradas:

```powershell
python -m app.demo_cupones --tenant 1 --clientes 5
```

El generador necesita la estructura vigente de la base, incluidas las migraciones de fidelización y los campos de usuarios. Selecciona cinco clientes existentes de la empresa indicada que tengan cuenta activa y habilitada. No cambia sus contraseñas ni crea cuentas nuevas. Si faltan clientes, informa el problema sin guardar datos parciales.

Para cada cliente crea tres compras de una unidad con el método **«Compra demo (sin cobro)»**. Utiliza prendas con stock de la misma tienda, registra el detalle, movimiento de inventario, historial y bitácora, y llama a la misma regla de emisión de cupones que una venta normal. Esto descuenta hasta quince unidades del inventario y agrega ventas de demostración a los reportes de la base elegida. No se llama a Stripe, no se registra entrada de efectivo en caja y los avisos generados quedan solo en la aplicación, sin correo.

Toda la preparación se guarda en una transacción. Si falta stock u ocurre un error, se revierte. Los identificadores de operación son estables: repetir el comando no duplica las mismas tres compras por cliente.

Al terminar imprime los clientes y correos para identificar sus cuentas, los IDs de las compras nuevas, los cupones disponibles y una cotización que comprueba el descuento. No imprime contraseñas, claves ni la URL de conexión. Conserva los cupones disponibles para que se pruebe su uso desde la tienda; si ya se consumieron tras una ejecución anterior, no los reactiva ni regala compras adicionales.

## Verificar el cupón desde una cuenta

1. Iniciar sesión como uno de los clientes indicados por el generador.
2. Abrir Perfil → Mis cupones y comprobar que existe un cupón disponible del 30 % para la tienda correspondiente.
3. Elegir una prenda disponible y pulsar «Comprar» o abrir el carrito.
4. Seleccionar el cupón en el resumen: una prenda de Bs 120 debe quedar en Bs 84. El envío, si corresponde, no recibe ese descuento.
5. Completar el pago con una tarjeta del entorno de pruebas de Stripe y confirmar la compra.
6. Revisar la venta y el cupón: debe estar usado y ligado a esa venta. Un segundo intento de reutilización debe rechazarse.

La cotización del generador comprueba disponibilidad y cálculo. El canje completo por interfaz y el cobro externo solo se consideran verificados después de ejecutar estos pasos con la base y Stripe configurados.

## Estado de esta preparación

El archivo `backend/.env` estaba vacío durante la revisión y no había `DATABASE_URL` ni claves de Stripe en el proceso. Por ese motivo no se conectó la base ni se cargaron compras. El código y el comando quedan preparados para ejecutar la carga cuando se configure la conexión. No se modificó el despliegue ni se realizó `git push`.
