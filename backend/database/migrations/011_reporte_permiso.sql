-- 011_reporte_permiso.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Crea el permiso "reporte.ver" (no existia; primer permiso del modulo
-- pkg_analytics_ia/reportes, CU25) y lo asigna solo al rol Administrador
-- (codigoRol=1). El router reports.py protege sus endpoints con
-- require_permiso("reporte.ver").
--
-- Idempotente: INSERT ... SELECT ... WHERE NOT EXISTS, igual que 005/007.
-- Rollback: DELETE FROM "asignacion_permiso" WHERE "codigoRol" = 1 AND
-- "idPermiso" = (SELECT "idPermiso" FROM "permiso" WHERE "nombrePermiso" = 'reporte.ver');
-- DELETE FROM "permiso" WHERE "nombrePermiso" = 'reporte.ver';

INSERT INTO "permiso" ("nombrePermiso")
SELECT 'reporte.ver'
WHERE NOT EXISTS (
    SELECT 1 FROM "permiso" WHERE "nombrePermiso" = 'reporte.ver'
);

INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT 1, pe."idPermiso"
FROM "permiso" pe
WHERE pe."nombrePermiso" = 'reporte.ver'
  AND NOT EXISTS (
      SELECT 1
      FROM "asignacion_permiso" a
      WHERE a."codigoRol" = 1
        AND a."idPermiso" = pe."idPermiso"
  );
