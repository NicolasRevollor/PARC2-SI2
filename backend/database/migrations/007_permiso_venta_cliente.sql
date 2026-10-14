-- 007_permiso_venta_cliente.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Otorga al rol Cliente (codigoRol=5) el permiso "venta.crear", ya existente
-- en la tabla "permiso" (insertado por 005_asignar_permisos_reales.sql).
-- Ese unico permiso habilita al Cliente como llamante legitimo de
-- POST /api/sales, POST /api/payments/intents y su verify: los tres routers
-- ya declaran require_permiso("venta.crear") (ver sales.py, payments.py).
-- La compra digital (CU17/CU18) queda protegida por un guard de ownership
-- nuevo en sales.py, no por un permiso nuevo (ver design.md, decision D1).
--
-- Idempotente: INSERT ... SELECT ... WHERE NOT EXISTS, igual que 005.
-- Rollback: DELETE FROM "asignacion_permiso" WHERE "codigoRol" = 5 AND
-- "idPermiso" = (SELECT "idPermiso" FROM "permiso" WHERE "nombrePermiso" = 'venta.crear');

INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT 5, pe."idPermiso"
FROM "permiso" pe
WHERE pe."nombrePermiso" = 'venta.crear'
  AND NOT EXISTS (
      SELECT 1
      FROM "asignacion_permiso" a
      WHERE a."codigoRol" = 5
        AND a."idPermiso" = pe."idPermiso"
  );
