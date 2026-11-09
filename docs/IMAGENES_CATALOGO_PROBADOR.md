# Subir tus propias fotos y recortes de prendas

## Dónde se hace

Entrá a la web como Administrador o como personal con permiso para editar productos. Abrí **Archivo y Catálogo**, buscá la prenda y pulsá **Cambiar fotos**.

El formulario separa dos imágenes:

- **Foto del catálogo:** la foto que aparece en las tarjetas y en el detalle del producto. Acepta JPEG, PNG y WEBP.
- **Recorte para el probador móvil:** una imagen de la prenda sin fondo. Acepta PNG o WEBP con transparencia real. El móvil utiliza este recorte sobre la cámara; la foto del catálogo se conserva por separado.

Ambas admiten hasta **5 MB**. Se puede ver la vista previa antes de pulsar **Guardar fotos**. También se puede agregar el recorte al crear un producto nuevo o quitarlo desde Cambiar fotos. La edición corresponde a la variante seleccionada, con su talla y color; no cambia sus precios ni inventario.

## Preparar una imagen que descargaste

1. Abrí la imagen original, descargala a tu computadora y comprobá que corresponda a la prenda y al color elegidos.
2. Para el catálogo podés usar una foto con fondo.
3. Para el probador prepará una vista frontal de la prenda, sin persona, sin fondo y con poco margen alrededor. Guardala en PNG o WEBP transparente.
4. Seleccioná cada archivo en el campo correspondiente y guardá los cambios.

Cambiar la extensión de JPG a PNG no elimina el fondo. Una cuadrícula dibujada dentro de una foto tampoco es transparencia. El servidor comprueba que el archivo sea una imagen real y rechaza los recortes opacos o completamente invisibles. No se realiza eliminación automática del fondo.

## Verla en el móvil

Instalá la versión nueva de la app y recargá el catálogo o cerrá y volvé a abrir la aplicación. Seleccioná la variante modificada y abrí el probador con cámara, dando permiso cuando se solicite.

El recorte recibido desde la API tiene prioridad sobre las imágenes antiguas. Las poleras se colocan tomando los hombros como referencia y los jeans toman las caderas. Es una superposición 2D que sigue la pose; una fotografía no se convierte en un modelo 3D ni simula la caída de la tela. El alineado final debe comprobarse con la cámara de un teléfono real.

## Almacenamiento configurado

Se creó en el proyecto de Supabase el bucket **`primSI2`**, público para lectura y limitado a imágenes JPEG, PNG y WEBP de hasta 5 MB. El bucket privado de respaldos no se modificó.

En `backend/.env` quedó configurado:

```dotenv
SUPABASE_STORAGE_BUCKET=primSI2
```

El backend también necesita `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La clave de servicio permanece en el servidor y no se debe incluir en el frontend ni en el APK.

Si usás Render, esas tres variables deben estar configuradas en el servicio de Render: guardar un `.env` local no las copia al despliegue. Para visualizar el nuevo botón y que la API guarde el recorte, también deben desplegarse los cambios del backend y de la web.

## Verificación realizada

- Migración `032_imagen_probador.sql` aplicada sobre la base configurada: se agregó una columna opcional; no se reemplazaron las fotos existentes.
- Bucket creado y comprobado con una subida temporal de PNG transparente y lectura pública HTTP 200. El archivo de prueba se eliminó después.
- Backend: 137 pruebas aprobadas y 62 integraciones omitidas por requerir una base exclusiva de pruebas. Incluye validación de formatos, transparencia y permisos para subir imágenes.
- Web: comprobación TypeScript y compilación de producción correctas.
- Móvil: 17 pruebas aprobadas y una integración omitida antes de la compilación del APK. La cámara y la posición de cada recorte requieren comprobación en un dispositivo real.
- Android: APK de producción generado y firma verificada, con librerías ARM de 32 y 64 bits y x86 de 64 bits. Se comprobó que los 47 archivos Dart de la copia de compilación coinciden con el proyecto original.

El APK quedó en [YouShop-release.apk](</D:/CodexBuild/parc2-mobile-d7e867c3/YouShop-release.apk>) (101,4 MB). La compilación se hizo en D: porque C: no tenía espacio suficiente. El SDK y las cachés de esa copia están dentro de `D:\CodexBuild\parc2-mobile-d7e867c3`; no se borraron los originales.

No se descargaron fotos de Google ni se reemplazaron imágenes de productos automáticamente: la elección y la subida se realizan desde el formulario.
