-- 005_asignar_permisos_reales.sql
-- Migracion ADITIVA obligatoria para el backend.
--
-- Motivo: el seed real del usuario (base.sql) usa roles con nombres propios
-- (Administrador, Encargado de Sucursal, Cajero, Proveedor, Cliente) y
-- permisos como GESTION_GLOBAL_SISTEMA / ACCESO_CLIENTE_OMNICANAL, mientras
-- que TODOS los routers verifican permisos granulares en minuscula con
-- puntos: producto.listar, producto.crear, inventario.ver, equipo.ver,
-- bitacora.ver, usuario.admin, etc. Como el Administrador real (codigoRol=1)
-- solo tenia GESTION_GLOBAL_SISTEMA, no pasaba require_permiso() y la web
-- mostraba "No se pudo cargar" en casi todo (incluida la bitacora).
--
-- Esta migracion:
--   1) Se asegura de que TODOS los permisos granulares que usa el codigo
--      existan en "permiso" (insertandolos si faltan, idempotente).
--   2) Asigna esos permisos a los roles reales por codigoRol (aditivo).
--      NO borra ni toca los permisos que ya tienen asignados
--      (GESTION_GLOBAL_SISTEMA, ACCESO_CLIENTE_OMNICANAL, ...).
--
-- Idempotente: re-ejecutable sin error (INSERT ... SELECT ... WHERE NOT EXISTS).

-- 1) Garantizar que existan los permisos granulares que verifica el codigo.
INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (
    VALUES
        ('producto.listar'),
        ('producto.crear'),
        ('producto.editar'),
        ('producto.eliminar'),
        ('inventario.ver'),
        ('inventario.ajustar'),
        ('inventario.traspasar'),
        ('venta.crear'),
        ('venta.ver'),
        ('reserva.crear'),
        ('reserva.gestionar'),
        ('usuario.admin'),
        ('equipo.ver'),
        ('bitacora.ver'),
        ('recomendacion.gestionar'),
        ('cliente.ver')
) AS p(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre
);

-- 2) Asignar permisos por rol real (codigoRol confirmado via psql).
--    Administrador=1, Encargado de Sucursal=2, Cajero=3, Proveedor=4, Cliente=5.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT d.codigoRol,
       pe."idPermiso"
FROM (
    VALUES
        -- Administrador (1): TODOS los permisos granulares.
        (1, 'producto.listar'),
        (1, 'producto.crear'),
        (1, 'producto.editar'),
        (1, 'producto.eliminar'),
        (1, 'inventario.ver'),
        (1, 'inventario.ajustar'),
        (1, 'inventario.traspasar'),
        (1, 'venta.crear'),
        (1, 'venta.ver'),
        (1, 'reserva.crear'),
        (1, 'reserva.gestionar'),
        (1, 'usuario.admin'),
        (1, 'equipo.ver'),
        (1, 'bitacora.ver'),
        (1, 'recomendacion.gestionar'),
        (1, 'cliente.ver'),
        -- Encargado de Sucursal (2).
        (2, 'producto.listar'),
        (2, 'producto.crear'),
        (2, 'producto.editar'),
        (2, 'inventario.ver'),
        (2, 'inventario.ajustar'),
        (2, 'inventario.traspasar'),
        (2, 'venta.ver'),
        (2, 'reserva.gestionar'),
        (2, 'equipo.ver'),
        (2, 'cliente.ver'),
        (2, 'bitacora.ver'),
        (2, 'recomendacion.gestionar'),
        -- Cajero (3).
        (3, 'producto.listar'),
        (3, 'inventario.ver'),
        (3, 'venta.crear'),
        (3, 'venta.ver'),
        (3, 'reserva.crear'),
        (3, 'cliente.ver'),
        -- Proveedor (4): solo lectura de catalogo.
        (4, 'producto.listar'),
        -- Cliente (5).
        (5, 'producto.listar'),
        (5, 'reserva.crear')
) AS d(codigoRol, nombrePermiso)
JOIN "permiso" pe ON pe."nombrePermiso" = d.nombrePermiso
WHERE NOT EXISTS (
    SELECT 1
    FROM "asignacion_permiso" a
    WHERE a."codigoRol" = d.codigoRol
      AND a."idPermiso" = pe."idPermiso"
);