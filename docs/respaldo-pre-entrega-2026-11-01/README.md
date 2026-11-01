# Respaldo previo a entrega — 1 de noviembre de 2026

Rama local prevista: `respaldo-pre-entrega-2026-11-01`, desde
`e7a5f487ef2d1ab38b9189e879d69596781043d7` de `GYG+FRHB-implementado`.
No se sobrescriben otras ramas. El push requiere autorizacion expresa posterior.

## Destino verificado

`origin`: https://github.com/LuisGarcia06/sistema-integrador-reservaciones.git

La API autenticada de GitHub confirmo el 1 de noviembre de 2026 que el repositorio
es **publico**. La rama nueva tambien seria publica. No se cambio su privacidad.
`master` es la rama predeterminada. La consulta real de referencias remotas confirmo
que `GYG+FRHB-implementado` termina en `23d9ea2`; el trabajo local contiene ademas
los commits `6dbd1d0` y `e7a5f48`, que se conservaran en la ascendencia.

## Inventario inicial y seleccion

Antes de crear archivos de esta auditoria habia 388 archivos versionados,
69 modificados, indice vacio y 7,825 archivos sin seguimiento (1,317,237,244 bytes).
Se conservan los 69 cambios, sin reconstruir ni corregir su comportamiento.

De los 7,825 originales se seleccionan 1,261 archivos nuevos: 552 fuentes actuales
(backend, frontend, Electron, SQL, scripts, pruebas y shared), 134 documentos,
317 fuentes historicas y 258 archivos del candidato funcional. Los otros 6,564
son salidas generadas o evidencia bruta local; no se borran ni se modifican.
Los archivos de esta auditoria y los ajustes a .gitignore/.gitattributes se suman
por separado. Los conteos de revision-02 incluyen seis reportes de la revision
inicial y el script de auditoria; no son trabajo nuevo del producto.

Inventario por ruta, tamano, SHA256 y decision: `inventario-inicial.json`.
Los 69 archivos modificados: `revision-69.json`. Exclusiones exactas:
`excluidos-inicial.tsv`. Seleccion original: `incluir-inicial.txt`.
`revision-02/` conserva la segunda lectura y la resolucion de alertas.

La comparacion final de contenido amplio esta seleccion: entre las rutas
inicialmente excluidas habia 97 variantes de codigo no representadas por las
fuentes seleccionadas ni los ZIP funcionales. Se guardan copias exactas en
`fuentes-unicas/`; `fuentes-unicas.json` liga sus hashes a 164 rutas originales.
Otras 4,891 rutas fuente excluidas ya estaban representadas por contenido igual
(normalizando solo CRLF/LF) en las fuentes o ZIP incluidos. Los scripts de
generacion, revision y recoleccion unicos tambien quedan conservados. Ninguno
se ejecuto. Esta ampliacion corrige la clasificacion inicial sin tocar originales.
Los 6,564 excluidos iniciales se desglosan ahora en 164 rutas representadas por
estas copias y 6,400 archivos que permanecen exclusivamente locales. Los runtimes
y sus avisos de licencias generados no se confunden con codigo propio.

## Version funcional identificada, sin promover experimentos

Referencia historica: **2E.6, candidate-08, attempt-10**. Se preservan las fuentes
propias expandidas, los inventarios originales y los dos ZIP exactos. Los ZIP
contienen fuentes y dependencias de ese candidato, sin runtime Electron/Node,
base poblada, credenciales ni autorizacion productiva. No se ejecutaron.

| Archivo | SHA256 |
| --- | --- |
| server-candidate026.zip | 98bfa757b7ebbfb2368e69b60cafa8869bee0577c5582aeb0838f5a92d96c091 |
| client-candidate026.zip | 456bf37b5cc106ec0c6672ada58ec6bd08d9557d173381bc7f3b5b8e5ebf6c0c |

`revision-02/version-funcional-2E6.json` es un resumen derivado del resultado real:
15 grupos PostgreSQL/HTTPS/Electron y cuatro sesiones Electron, incluyendo login,
Reservaciones, Daily/PDF, reinicio y restauracion. Distingue esa evidencia de las
1,121 pruebas Jest con mocks. Conserva SHA256 y ruta de la evidencia original,
sin copiar snapshots de filas, perfiles o autoridades. El original permanece local
intacto. La version probada usaba PostgreSQL 18.3 y Electron 43.4.1.

La carpeta candidata y sus inventarios se guardan con `-text` para evitar cambios
de finales de linea que invaliden sus hashes. No se reescribieron inventarios
historicos ni se regeneraron los paquetes.

Las fuentes actuales incluyen cambios experimentales posteriores (opcion C,
V-01 a V-04 y contrato experimental 18.6). Se respaldan como trabajo de desarrollo;
**no se certifican como version funcional, instalador listo o entrega productiva**.
La recuperacion de candidate-08 debe hacerse en destino separado, con runtimes y
configuracion nueva autorizada; el respaldo no autoriza aprovisionamiento.

## Exclusiones y seguridad

No se agregan .env/.env.test, secretos, claves privadas, credenciales DPAPI,
certificados privados, dumps, directorios PostgreSQL, perfiles Electron, runtimes,
instaladores, cuarentenas ni datos de clientes exportados. .env.example conserva
campos vacios o marcadores. Las copias node_modules del candidato se recuperan
del ZIP revisado; no se agregan tambien como miles de archivos expandidos.

Los reportes JSON brutos, capturas, PDF de ensayo, logs y archivos antes/despues
con posibles datos permanecen locales. Los documentos/binarios que ya estaban
versionados se conservan en su historia; no se presentan como binarios nuevos
auditados exhaustivamente. Los reportes publicables nuevos contienen metadatos,
hashes y conclusiones, sin valores secretos.

Se contrastan en memoria secretos locales conocidos y asignaciones historicas,
ademas de patrones de tokens, JWT, URI con credenciales y claves privadas completas.
En cuatro README de dependencias dentro del ZIP se revisaron ejemplos publicos:
los PEM estan truncados con puntos suspensivos y no son claves utilizables; las
URI son ejemplos del proveedor. Las excepciones se fijan por ruta, regla y hash,
sin aplicarlas a codigo propio ni a coincidencias de secretos conocidos.

Hay asignaciones historicas no vacias en .env.example: un token de verificacion
WhatsApp y una contrasena PostgreSQL. No se presume que sigan vigentes ni que sean
credenciales reales; no aparecen en la seleccion actual. Documentos anteriores
ya registraban el hallazgo WhatsApp. La rama conserva ascendencia existente;
no elimina esos valores de la historia ni equivale a revocarlos. No se imprimen
sus valores. No se reescribe el historial ni se usa push --force.

## Verificacion y limites

Se comprueban inventarios, ZIP y contenido exacto del indice/commits. No se ejecutan
tests funcionales, migraciones, servicios, integraciones o instaladores. El objetivo
es preservar el trabajo, no certificar de nuevo su funcionamiento. Las revisiones
de patrones reducen el riesgo; no demuestran ausencia de todo secreto desconocido.
El push y la confirmacion del hash en GitHub permanecen pendientes de autorizacion.
