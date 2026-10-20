-- 017_superadmin_solo_plataforma.sql
-- Correccion de la 016: el Superadministrador solo debe tener
-- "plataforma.admin".
--
-- La primera version de la 016 le copiaba todos los permisos del
-- Administrador, lo que le permitia entrar a los modulos operativos
-- (catalogo, inventario, caja, ventas...) que corresponden a cada empresa. El
-- operador del SaaS gestiona empresas; no opera el negocio de un cliente.
--
-- La 016 ya fue corregida para instalaciones nuevas; esta migracion limpia las
-- bases donde se aplico la version anterior. Idempotente: si el rol ya solo
-- tiene "plataforma.admin", no borra nada.

DELETE FROM "asignacion_permiso" ap
USING "rol" r, "permiso" p
WHERE ap."codigoRol" = r."codigoRol"
  AND ap."idPermiso" = p."idPermiso"
  AND r."nombreRol" = 'Superadministrador'
  AND p."nombrePermiso" <> 'plataforma.admin';
