# BRANDING + GITHUB — Cierre de publicación

Fecha: 16 de octubre de 2026, America/Cancun.

## Resultado verificado

**La identidad corporativa de BRANDING-01 a BRANDING-05 fue publicada con éxito.**
El usuario confirmó la aprobación visual de Electron y de los dos documentos
impresos en su solicitud final y autorizó expresamente commit/push tras validar.

- Rama local: `GYG+FRHB-implementado`.
- Rama remota: `origin/GYG+FRHB-implementado`.
- Origin de lectura y push comprobado:
  `https://github.com/LuisGarcia06/sistema-integrador-reservaciones.git`.
- [Rama publicada](https://github.com/LuisGarcia06/sistema-integrador-reservaciones/tree/GYG%2BFRHB-implementado).
- Base inicial coincidente local/remoto: `7c3096d15362bccfa9ca2cfb471557cac0fa737c`.
- Commit principal publicado: **`cacc9f1373bd9cdac058c2b010e82838542eccca`**.
- Mensaje: `feat: apply Community Tours corporate branding across app and PDFs`.
- [Commit de implementación](https://github.com/LuisGarcia06/sistema-integrador-reservaciones/commit/cacc9f1373bd9cdac058c2b010e82838542eccca).

La salida de Git confirmó:

```text
7c3096d..cacc9f1  HEAD -> GYG+FRHB-implementado
```

Después del push, `git ls-remote --heads origin refs/heads/GYG+FRHB-implementado`
devolvió exactamente `cacc9f1373bd9cdac058c2b010e82838542eccca`, igual al HEAD local de implementación.

Este informe se incorpora mediante un commit documental adicional y su publicación
se comprueba también con ls-remote. Su hash completo se entrega en la respuesta
final y puede obtenerse con `git log -1 --format=%H -- docs/BRANDING-GITHUB.md`.
No se inserta dentro del propio archivo el hash del commit que lo contiene, para
no crear una cadena de modificaciones documentales posteriores.

## Contenido publicado

El commit principal incluye **97 archivos** revisados y seleccionados explícitamente,
con unos **7.7 MB** de contenido; el recurso mayor pesa 477,821 bytes.
Este informe añade un archivo documental: **98 rutas** en total para la entrega.

| Categoría del commit principal | Archivos |
| --- | ---: |
| CSS, shell/UI y renderizadores frontend | 10 |
| Electron: espera del logo dentro del flujo autorizado de PDF | 1 |
| Pruebas y helpers sintéticos | 6 |
| Informes BRANDING-01 a BRANDING-05 | 5 |
| Recursos oficiales: dos extensiones idénticas del logo y README | 3 |
| Imágenes de validación y referencia aprobada | 63 |
| PDF sintéticos | 6 |
| Resúmenes JSON de validación sin credenciales | 3 |
| Total principal | 97 |

Los 63 PNG comprenden capturas de las pantallas reales con API simulada, la
referencia de diseño proporcionada y los renders de PDF. Su procedencia se
verificó con los harness y fixtures revisados. Las imágenes del logo no contienen
EXIF y son copias exactas del original aprobado. No se publicaron archivos
provenientes de un backend o una base de datos con reservaciones reales.

## Validación final

- **692 pruebas aprobadas en 35 suites**, cero fallos y cero pendientes.
- BRANDING-04 reportó 691/34; se agregó una prueba/suite de pantallas sin retirar
  pruebas anteriores.
- Nueve pantallas, panel Transportes y diálogos revisados en 1366 × 768 y
  1024 × 640, con 38 capturas y diez controles del harness de pantallas.
- Administrador, Consulta all y Consulta selected conservan acceso/visibilidad.
  Se verificaron búsqueda, filtros, paginación, sesiones y revocación.
- Seis PDF regenerados y once páginas comprobadas, con tamaño carta horizontal
  para Daily y vertical para ficha individual, sin páginas vacías ni recortes
  detectados. Las once columnas Daily y los datos funcionales permanecen.
- Los 13 renders de PDF/grises resultaron idénticos visualmente por SHA-256 a
  los aprobados antes de BRANDING-05.
- Ocho controles de impresión, incluido rechazo de Daily por IPC para selected,
  revocación durante diálogo/carga de logo y bloqueo ante logo roto.
- Correcciones finales acotadas: grid de filtros de Historial y Bitácora para
  eliminar desbordamientos; fixtures compartidos para los harness. Sin rediseño.

La regresión se ejecutó con entorno sintético, APP_CONFIG_PATH=NUL y pg bloqueado
por noPostgres.js. api.test.js quedó excluida por requerir persistencia real y
poder modificar datos. No se ejecutaron migraciones ni pruebas contra proveedores.
No se alteraron credenciales, permisos ACCESS-SCOPE, reglas de negocio, datos,
GetYourGuide/FareHarbor, WhatsApp deshabilitado ni lanzadores/instalador.

El detalle, límites y enlaces a las evidencias están en
[BRANDING-05.md](BRANDING-05.md). Los informes previos conservan su evidencia
histórica y remiten a la aprobación final del usuario.

## Seguridad y conservación de historial

Se leyó AGENTS.md, se revisó el diff completo y se auditó cada candidato antes
de añadirlo. El staging se preparó con una lista explícita, sin git add -A.
Se compararon los 97 blobs preparados con el contenido revisado y se comprobó
el rango del commit antes de publicar. El escaneo de texto no halló claves
privadas, JWT utilizables, tokens GitHub/Meta, URLs con credenciales ni
asignaciones de secretos en los archivos seleccionados. Los valores de sesión
de los harness son literales sintéticos; los informes JSON no incluyen tokens.
Los PDF se extrajeron/renderizaron y sus datos corresponden a los fixtures.

No entraron .env, credenciales, DPAPI, respaldos PostgreSQL, directorios de datos,
.access-scope-lab, node_modules, logs, instaladores, temporales ni archivos privados.
.gitignore se comprobó y no necesitó cambios. Los laboratorios y las evidencias
de fallos corregidos se conservaron localmente fuera del commit.

Origin se verificó antes de fetch y antes de publicar, incluidas sus URLs de
lectura y escritura. La base remota siguió siendo 7c3096d15362bccfa9ca2cfb471557cac0fa737c al comprobar
las referencias; merge-base confirmó que era ancestro de HEAD. Solo existía un
commit nuevo saliente y contenía exclusivamente los archivos de branding revisados.
El push fue normal, sin --force, merge/rebase automático, borrado de ramas,
reinicialización ni reescritura de commits antiguos. El token histórico de
WhatsApp no se manipuló ni se volvió a introducir en los cambios.

## Pendientes y límites

La **validación digital de identidad corporativa está cerrada y aprobada**.
Sigue pendiente la impresión física con la impresora/driver que se usará, tal
como acepta la solicitud. No se certifican PDF/UA, accesibilidad integral ni una
versión productiva; no se creó release, tag, rama nueva ni instalador.

El commit documental contiene únicamente este informe. Después de publicarlo se
verifican HEAD contra ls-remote y árbol de trabajo limpio, y se entregan ambos
hashes en el mensaje final sin generar cambios locales posteriores.
