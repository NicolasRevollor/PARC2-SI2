-- 016_superadmin_plataforma.sql
-- Migracion ADITIVA + seed de demostracion: rol de Superadministrador de la
-- plataforma SaaS y empresas (tenants) de ejemplo en distintos planes.
--
-- Depende de la 014 (tenant, plan, idTenant).
--
-- Modelo: el Superadministrador es el OPERADOR de la plataforma. Vive en el
-- tenant 1 (YouShop Collective, el proveedor del SaaS) y, ademas de todos los
-- permisos del Administrador de su propio tenant, tiene "plataforma.admin",
-- que habilita los endpoints /api/platform/* para ver y gestionar TODAS las
-- empresas suscritas (plan, estado, alta de nuevas empresas).
--
-- Contrasena: todos los usuarios de este seed usan el MISMO hash bcrypt que
-- los usuarios de base.sql. Si no se recuerda la contrasena de ese hash, se
-- restablece desde el login con "Olvido su contrasena?".
--
-- Idempotente: todo INSERT va con WHERE NOT EXISTS. Re-ejecutable sin error.

-- 1) Rol y permiso de plataforma -------------------------------------------
INSERT INTO "rol" ("nombreRol")
SELECT 'Superadministrador'
WHERE NOT EXISTS (SELECT 1 FROM "rol" WHERE "nombreRol" = 'Superadministrador');

INSERT INTO "permiso" ("nombrePermiso")
SELECT 'plataforma.admin'
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = 'plataforma.admin');

-- El Superadministrador hereda TODOS los permisos activos del Administrador
-- (puede operar el tenant 1 como cualquier admin) ...
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT su."codigoRol", ap."idPermiso"
FROM "rol" su
JOIN "rol" adm ON adm."nombreRol" = 'Administrador'
JOIN "asignacion_permiso" ap ON ap."codigoRol" = adm."codigoRol" AND ap."estado" = 'Activo'
WHERE su."nombreRol" = 'Superadministrador'
  AND NOT EXISTS (
      SELECT 1 FROM "asignacion_permiso" x
      WHERE x."codigoRol" = su."codigoRol" AND x."idPermiso" = ap."idPermiso"
  );

-- ... y ademas el permiso exclusivo de gestion de la plataforma.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT su."codigoRol", pe."idPermiso"
FROM "rol" su
JOIN "permiso" pe ON pe."nombrePermiso" = 'plataforma.admin'
WHERE su."nombreRol" = 'Superadministrador'
  AND NOT EXISTS (
      SELECT 1 FROM "asignacion_permiso" x
      WHERE x."codigoRol" = su."codigoRol" AND x."idPermiso" = pe."idPermiso"
  );

-- 2) Usuario Superadministrador (tenant 1, el operador del SaaS) ----------
INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol", "idTenant")
SELECT 'Super Administrador', 'superadmin@youshop.com',
       '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C',
       r."codigoRol", 1
FROM "rol" r
WHERE r."nombreRol" = 'Superadministrador'
  AND NOT EXISTS (SELECT 1 FROM "Usuario" WHERE "correo" = 'superadmin@youshop.com');

-- 3) Empresas (tenants) de demostracion, una por plan de pago y una Free Lite
INSERT INTO "tenant" ("nombre", "slug", "estado", "idPlan")
SELECT t.nombre, t.slug, 'Activo', p."idPlan"
FROM (
    VALUES
        ('Boutique Andina',    'boutique-andina', 'free_lite'),
        ('Moda Urbana La Paz', 'moda-urbana',     'basico'),
        ('Maison Oriente',     'maison-oriente',  'intermedio')
) AS t(nombre, slug, plan_codigo)
JOIN "plan" p ON p."codigo" = t.plan_codigo
WHERE NOT EXISTS (SELECT 1 FROM "tenant" x WHERE x."slug" = t.slug);

-- Un administrador por empresa: es quien la opera dentro de SU tenant (no
-- ve a las demas). Mismo hash de contrasena que el resto del seed.
INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol", "idTenant")
SELECT u.nombre, u.correo,
       '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C',
       r."codigoRol", t."idTenant"
FROM (
    VALUES
        ('Admin Boutique Andina', 'admin@boutiqueandina.bo', 'boutique-andina'),
        ('Admin Moda Urbana',     'admin@modaurbana.bo',     'moda-urbana'),
        ('Admin Maison Oriente',  'admin@maisonoriente.bo',  'maison-oriente')
) AS u(nombre, correo, slug)
JOIN "tenant" t ON t."slug" = u.slug
JOIN "rol" r ON r."nombreRol" = 'Administrador'
WHERE NOT EXISTS (SELECT 1 FROM "Usuario" x WHERE x."correo" = u.correo);

-- Sucursales de cada empresa (respetan el cupo de su plan: Free Lite 1,
-- Basico hasta 2, Intermedio hasta 5).
INSERT INTO "Sucursal" ("nombre", "direccion", "idCiudad", "idTenant")
SELECT s.nombre, s.direccion, c."idCiudad", t."idTenant"
FROM (
    VALUES
        ('Andina Centro',        'Calle 24 de Septiembre #210', 'Santa Cruz de la Sierra', 'boutique-andina'),
        ('Moda Urbana Sopocachi', 'Av. 20 de Octubre #1530',     'La Paz',                  'moda-urbana'),
        ('Moda Urbana Calacoto',  'Calle 21 de Calacoto #8000',  'La Paz',                  'moda-urbana'),
        ('Maison Oriente Norte',  'Av. Banzer 4to anillo #3300', 'Santa Cruz de la Sierra', 'maison-oriente')
) AS s(nombre, direccion, ciudad, slug)
JOIN "tenant" t ON t."slug" = s.slug
JOIN "Ciudad" c ON c."nombCiudad" = s.ciudad
WHERE NOT EXISTS (
    SELECT 1 FROM "Sucursal" x WHERE x."nombre" = s.nombre AND x."idTenant" = t."idTenant"
);
