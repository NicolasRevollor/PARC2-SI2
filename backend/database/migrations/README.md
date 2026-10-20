# Migraciones del backend

Las migraciones ubicadas en este directorio son **ADITIVAS** y **MANUALES**.
No se edita `database/base.sql`; el esquema base se crea solo con ese archivo
y luego se aplican estas migraciones encima.

## Aplicar manualmente sobre el contenedor `ropaDocker`

El contenedor Postgres ya corre (ver `compose.yml`):
- DB: `ropaDB`
- User: `yimysito`
- Password: `tarqui231`
- Puerto: `5432` en localhost

Secuencia recomendada (en el host, una sola vez):

```bash
# 1) Asegurarse de que Postgres este corriendo
docker start ropaDocker

# 2) Aplicar la migracion 001 (columna "referencia" en Movimiento)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/001_add_referencia_movimiento.sql

# 3) Aplicar la migracion 002 (imagenes de producto)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/002_add_imagenes_producto.sql

# 4) Aplicar la migracion 003 (bloqueo de cuenta tras intentos fallidos)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/003_add_bloqueo_login.sql

# 5) Aplicar la migracion 004 (bloqueo progresivo + activacion manual)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/004_add_bloqueo_progresivo.sql

# 6) Aplicar la migracion 005 (asignar permisos granulares a los roles reales)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/005_asignar_permisos_reales.sql

# 7) Aplicar la migracion 006 (columnas Stripe en metodo_pago)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/006_add_stripe_metodo_pago.sql

# 8) Aplicar la migracion 007 (permiso venta.crear para el rol Cliente, CU17/CU18)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/007_permiso_venta_cliente.sql

# 9) Aplicar la migracion 008 (columna idUserPago en metodo_pago, CU17/CU18)
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/008_add_metodo_pago_owner.sql
```

```bash
# 10) Migraciones 009 a 013 (reserva con deposito, binding de metodo de pago,
#     permiso de reportes, recomendacion -> producto, medidas del cliente)
for m in 009_add_reserva_deposito 010_add_metodo_pago_binding_consumo \
         011_reporte_permiso 012_add_recomendacion_producto 013_add_medidas_cliente; do
  docker exec -i ropaDocker psql -U yimysito -d ropaDB -v ON_ERROR_STOP=1 -f /dev/stdin \
    < "database/migrations/${m}.sql"
done

# 11) Migracion 014 (multitenencia + planes de suscripcion) — OBLIGATORIA
#     Crea "plan" y "tenant", siembra los 4 planes (free_lite, basico,
#     intermedio, avanzado) y el tenant 1, y agrega "idTenant" DEFAULT 1 a
#     Usuario, Sucursal, producto, Proveedor, Temporada y Colecciones.
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/014_multitenant_planes.sql

# 12) Migracion 015 (devoluciones y cambios de talla dentro de 24 h)
#     Depende de la 014: "devolucion" referencia "tenant".
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/015_devoluciones_cambio_talla.sql
```

```bash
# 13) Migracion 016 (Superadministrador de la plataforma + empresas demo)
#     Crea el rol Superadministrador (permiso "plataforma.admin"), el usuario
#     superadmin@youshop.com y 3 empresas de ejemplo (Free Lite, Basico e
#     Intermedio) con su administrador y sucursales. Depende de la 014.
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/016_superadmin_plataforma.sql

# 14) Migracion 017 (el Superadministrador queda SOLO con "plataforma.admin")
#     Corrige bases donde se aplico la primera version de la 016, que le
#     copiaba los permisos del Administrador y lo dejaba entrar a los modulos
#     de negocio de las empresas. En una base nueva no borra nada.
docker exec -i ropaDocker \
  psql -U yimysito -d ropaDB \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < database/migrations/017_superadmin_solo_plataforma.sql
```

> **Las migraciones 014 y 015 no son opcionales.** Los modelos SQLAlchemy ya
> mapean `Usuario.idTenant`, `producto.idTenant`, etc.; si la base no tiene
> esas columnas, cualquier consulta sobre esas tablas falla con
> `UndefinedColumnError`. Mismo criterio que la migracion 013.

Usar `ADD COLUMN IF NOT EXISTS` para que sean idempotentes (se pueden
re-ejecutar sin error). La migracion 005 usa `INSERT ... SELECT ... WHERE NOT EXISTS`
para ser igual de idempotente.

## Verificacion rapida

```bash
docker exec ropaDocker psql -U yimysito -d ropaDB -c '\d "Movimiento"'
docker exec ropaDocker psql -U yimysito -d ropaDB -c '\d "producto"'

# Permisos por rol (migracion 005):
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT r."codigoRol", r."nombreRol", COUNT(ap."idRolPermiso") AS total_permisos
   FROM "rol" r LEFT JOIN "asignacion_permiso" ap ON ap."codigoRol" = r."codigoRol"
   GROUP BY r."codigoRol", r."nombreRol" ORDER BY r."codigoRol";'

# El rol Cliente (5) debe tener venta.crear (migracion 007):
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT r."nombreRol", p."nombrePermiso"
   FROM "asignacion_permiso" a
   JOIN "rol" r ON r."codigoRol" = a."codigoRol"
   JOIN "permiso" p ON p."idPermiso" = a."idPermiso"
   WHERE r."codigoRol" = 5 AND p."nombrePermiso" = 'venta.crear';'

# Columna idUserPago en metodo_pago (migracion 008):
docker exec ropaDocker psql -U yimysito -d ropaDB -c '\d "metodo_pago"'

# Planes sembrados y tenant por defecto (migracion 014):
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT "codigo", "nombre", "precioMensual", "maxSucursales", "permiteIA" FROM "plan" ORDER BY "orden";'
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT t."idTenant", t."nombre", p."codigo" FROM "tenant" t JOIN "plan" p ON p."idPlan" = t."idPlan";'

# Toda fila preexistente quedo en el tenant 1 (no debe devolver ninguna fila):
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT COUNT(*) AS sin_tenant FROM "producto" WHERE "idTenant" IS NULL;'

# Tabla de devoluciones y sus permisos (migracion 015):
docker exec ropaDocker psql -U yimysito -d ropaDB -c '\d "devolucion"'
docker exec ropaDocker psql -U yimysito -d ropaDB -c \
  'SELECT r."nombreRol", p."nombrePermiso"
   FROM "asignacion_permiso" a
   JOIN "rol" r ON r."codigoRol" = a."codigoRol"
   JOIN "permiso" p ON p."idPermiso" = a."idPermiso"
   WHERE p."nombrePermiso" LIKE ''devolucion.%'' ORDER BY r."codigoRol";'
```
