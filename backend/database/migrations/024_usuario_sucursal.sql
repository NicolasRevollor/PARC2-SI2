-- 024_usuario_sucursal.sql
-- Asignacion del personal a una o varias sucursales de su empresa (CU24).
-- La usa el CU11 (flujo alternativo 2): el Encargado de sucursal solo ve el
-- historial y los indicadores de devoluciones de sus sucursales; el
-- Administrador de empresa ve todas.
--
-- Corre igual en el SQL Editor de Supabase (sentencia por sentencia) y en
-- psql, y es re-ejecutable.

CREATE TABLE IF NOT EXISTS "usuario_sucursal" (
    "idUser"           INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON DELETE CASCADE ON UPDATE CASCADE,
    "codigoSucursal"   INTEGER NOT NULL REFERENCES "Sucursal"("codigoSucursal") ON DELETE CASCADE ON UPDATE CASCADE,
    "fechaAsignacion"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "pk_usuario_sucursal" PRIMARY KEY ("idUser", "codigoSucursal")
);
CREATE INDEX IF NOT EXISTS "idx_usuario_sucursal_sucursal" ON "usuario_sucursal" ("codigoSucursal");

-- El personal de ejemplo de la sucursal central (encargado.central,
-- cajero.central) queda asignado a la sucursal "Central" de su empresa.
INSERT INTO "usuario_sucursal" ("idUser", "codigoSucursal")
SELECT u."idUser", s."codigoSucursal"
FROM "Usuario" u
JOIN "rol" r ON r."codigoRol" = u."codigoRol"
JOIN "Sucursal" s ON s."idTenant" = u."idTenant" AND s."nombre" ILIKE '%central%'
WHERE r."nombreRol" IN ('Encargado de Sucursal', 'Cajero')
  AND u."correo" ILIKE '%central%'
ON CONFLICT ("idUser", "codigoSucursal") DO NOTHING;
