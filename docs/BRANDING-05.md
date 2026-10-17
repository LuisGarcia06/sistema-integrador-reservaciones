# BRANDING-05 — Validación final y cierre de identidad corporativa

Fecha: 16 de octubre de 2026, America/Cancun.

## Resultado y aprobación

La solicitud **BRANDING-05 + GITHUB** del usuario confirma la aprobación visual
de Electron, Login, Sidebar, Dashboard, componentes, Daily PDF y documento
individual, y autoriza expresamente commit y push tras verificaciones satisfactorias.
No se solicitó una segunda aprobación ni se rediseñaron las secciones aprobadas.

La validación digital quedó cerrada. El resultado de la publicación y el commit
se registran por separado en [BRANDING-GITHUB.md](BRANDING-GITHUB.md).
La impresión física continúa pendiente y no impide este cierre digital.

## Fases revisadas e identidad

Se leyeron AGENTS.md y los informes [BRANDING-01](BRANDING-01.md),
[BRANDING-02](BRANDING-02.md), [BRANDING-03](BRANDING-03.md) y
[BRANDING-04](BRANDING-04.md). Estos conservan sus resultados históricos y enlazan
ahora al cierre posterior; las antiguas menciones de aprobación pendiente se
resuelven con la autorización expresa de la solicitud actual.

variables.css sigue siendo la única fuente del tema. Se comprobaron los cinco
valores oficiales: azul #011689, turquesa #00A499, aqua #24E0CF, lima #94D000 y
blanco #FFFFFF. No se añadieron colores decorativos ni fuentes externas. Permanecen
los neutros auxiliares, el turquesa oscuro accesible de acciones y el rojo semántico
aprobado para errores/cancelaciones. No hay referencias CSS a variables sin definir.

Los dos archivos oficiales .jpg/.jpeg son binariamente idénticos, 1296 × 932 px,
sin EXIF. Sidebar, Login y encabezados impresos conservan imagen completa,
proporción automática y recursos locales. No se generó ni recortó un logo nuevo.
El modo compacto reduce el logo completo, sin inventar otra variante.

## Pantallas y componentes verificados

Se utilizó el frontend real servido por API HTTP simulada en 127.0.0.1, con
perfil temporal de Electron y datos exclusivamente sintéticos. El simulador de
pantallas solo acepta GET y bloquea red externa. No arranca PostgreSQL ni el
backend productivo. No hay copia independiente de las pantallas de producto.

Se generaron **38 capturas**, 19 por resolución, en **1366 × 768** y
**1024 × 640**. Se inspeccionaron visualmente y mediante estilos/geometría:

| Pantalla | Evidencia y comprobación |
| --- | --- |
| Login | Logo completo, formulario de correo/contraseña legible, botón corporativo. |
| Dashboard | Indicadores, tabla de recientes, accesos existentes, menú expandido y contraído. |
| Reservaciones | Filtros, tabla, 29 filas sintéticas, paginación y búsqueda; detalle, nueva y cancelación. |
| Historial | Filtros, filas históricas y ventana de detalle. |
| Usuarios | Tabla de roles/alcances, formulario Consulta y selector de alcance. |
| Operaciones | Grupos, sugerencias, tabla y formulario de nueva operación. |
| Transportes | Panel dentro de Operaciones y formulario de edición con catálogos. |
| Daily | Agrupación, datos, resumen, aviso de sin asignar y controles existentes. |
| Configuración | Catálogos, pestaña Vehículos y formulario de alta sin enviarlo. |
| Bitácora | Filtros y tabla, acciones sintéticas Crear/Cancelar. |

Se verificaron navegación, tipografía local, tablas, filtros, formularios,
ventanas emergentes, lectura y nombres accesibles del Sidebar. No se detectaron
desbordamientos horizontales globales tras las correcciones. Las tablas anchas
mantienen el scroll interno intencionado y los formularios largos mantienen su
scroll vertical. La revisión no exige eliminar datos para ajustarlos al viewport.

Se emularon hover y focus-visible en Chromium para comprobar fondo de acción
#006B64 y contorno azul. La navegación activa conserva #011689 y texto blanco.
Esto no se presenta como auditoría completa con lector de pantalla/teclado.

[Mediciones y controles de pantalla](branding-05/validacion.json). Las imágenes
individuales están en docs/branding-05; por ejemplo:

- [Historial 1366](branding-05/historial-1366.png).
- [Historial 1024](branding-05/historial-1024.png).
- [Bitácora 1024](branding-05/bitacora-1024.png).
- [Nuevo usuario Consulta](branding-05/usuario-consulta-1024.png).
- [Panel Transportes](branding-05/transportes-1024.png).
- [Edición de transporte](branding-05/transporte-editar-1024.png).

La etiqueta preexistente «Datos reales» del Dashboard pertenece al producto;
todos los registros de estas capturas siguen siendo fixtures sintéticos. Los
formularios se abrieron y cerraron sin enviar cambios a una API real.

## Daily PDF

Se regeneraron los tres casos de BRANDING-04 mediante el manejador IPC original,
preload y printToPDF reales con API/destino simulados. Se conservaron carta
horizontal 792 × 612 pt, márgenes 8 mm, once columnas y agrupación por transporte.
Se verificaron logo, horarios, niños, importes, vendedor/plataforma, observaciones,
reservaciones canceladas, exclusión de su conteo activo y cabeceras repetibles.

| Caso | Páginas | Evidencia |
| --- | ---: | --- |
| Un transporte | 1 | [PDF](branding-04/daily-un-transporte.pdf) |
| Varios transportes | 2 | [PDF](branding-04/daily-varios-transportes.pdf) |
| Observaciones extensas | 4 | [PDF](branding-04/daily-observaciones-extensas.pdf) |

## Impresión individual

Se regeneraron programada, cancelada y textos largos por la acción existente de
Reservaciones, capturando su documento con el motor Electron. Se conservan carta
vertical 612 × 792 pt y márgenes 12 mm, independientes de la página Daily.
Permanecen cliente, servicio, pickup, PAX/niños, información comercial, estado,
observaciones y cancelación/motivo. No se cambiaron cálculos ni textos funcionales.

| Caso | Páginas | Evidencia |
| --- | ---: | --- |
| Programada | 1 | [PDF](branding-04/reservacion-programada.pdf) |
| Cancelada | 1 | [PDF](branding-04/reservacion-cancelada.pdf) |
| Textos largos | 2 | [PDF](branding-04/reservacion-textos-extensos.pdf) |

Se comprobaron las **once páginas de los seis PDF** mediante extracción de texto,
dimensiones y renders Poppler. No hay páginas vacías ni caracteres fuera de página;
están los 90 marcadores de notas del operador, los 65 de la ficha extensa y sus
textos finales. Se inspeccionaron todas las páginas en BRANDING-04 y los 13 PNG
regenerados (incluidas las dos vistas en grises) conservaron exactamente sus hashes
visuales respecto al inicio de BRANDING-05. No hubo cambios visuales en los PDF.

El harness verificó los ocho controles de impresión: datos iguales al formato
previo con los mismos fixtures, 11 columnas, logo decodificado, limpieza afterprint,
Consulta all/selected, rechazo de Daily por ruta/IPC para selected, revocación
durante guardado o carga de logo, logo roto y detalle no autorizado. No se usó
impresora física ni se cambió el mecanismo de exportar/guardar.

## Regresión segura

**692 pruebas aprobadas en 35 suites; cero fallos, cero pruebas pendientes.**
BRANDING-04 reportó 691/34; la diferencia es una prueba/suite adicional de pantallas.
Las suites anteriores se conservaron completas.

Se ejecutaron todas las suites backend excepto api.test.js, más
scripts/probarPersistenciaGetYourGuide.test.js, con --runInBand, --no-cache y
helpers/noPostgres.js. El entorno se construyó sin credenciales heredadas, con
APP_CONFIG_PATH=NUL, valores sintéticos y sincronización Gmail desactivada.
El bloqueo de pg impide query/connect reales incluso ante un mock omitido.
api.test.js se excluye porque requiere persistencia y puede modificar datos.

Se conservaron pruebas de autenticación/sesiones, ACCESS-SCOPE y sus tres perfiles,
restricciones, validadores, capacidad 12/24, reservaciones/cancelaciones,
operaciones, asignaciones, Daily, impresión, exportación y revocación. Las
integraciones se prueban mediante mocks; no se habilitaron proveedores.

Se añadieron brandingScreens.test.js y su harness. Se extrajeron los fixtures de
printBrandingHarness.cjs a brandingFixtures.cjs para compartir exactamente los
mismos datos sintéticos. No se retiró ninguna prueba ni se redujo cobertura para
obtener un resultado verde.

## Fallos encontrados y correcciones de esta fase

1. Historial conservaba mínimos de ocho columnas de filtros que desbordaban a
   1366 px. Se aplicó grid adaptable, manteniendo controles y parámetros.
2. Bitácora desbordaba a 1024 px con Sidebar expandido por mínimos fijos de filtros.
   Se aplicó el mismo ajuste de distribución, sin cambiar auditoría ni consultas.
3. Se actualizó un comentario histórico de variables.css sobre BRANDING-04,
   aclarando que los documentos usan ahora roles --print-*.

Ambas correcciones son CSS de pantalla, acotadas y justificadas técnicamente;
no alteran el diseño aprobado ni afectan impresión. Las primeras ejecuciones del
harness también requirieron ajustar la coerción booleana de condiciones DOM y el
ID real del formulario de catálogo. Esos ajustes eran del test, no fallos del
producto. La ejecución final conserva todos los controles y no presenta fallos.
La evidencia de fallos corregidos se conserva en el laboratorio privado.

## Seguridad, límites y cierre

Se revisaron el diff de implementación completo, archivos nuevos y recursos.
Solo se preparan fuentes, tests y documentación de BRANDING-01 a 05 con evidencia
sintética de tamaño razonable. .gitignore sigue excluyendo .env, credenciales,
DPAPI, respaldos/datos PostgreSQL, laboratorios, node_modules, logs e instaladores.
La revisión también examina el contenido preparado, no solo .gitignore.

No se modificaron PostgreSQL, reservaciones, esquema, reglas operativas,
autenticación/roles, implementación ACCESS-SCOPE, GetYourGuide/FareHarbor,
WhatsApp deshabilitado ni lanzadores/instalador. No se instalaron dependencias,
se ejecutaron migraciones o se construyó una versión productiva.

Pendientes: impresión física con el equipo/driver elegido, auditoría completa de
accesibilidad y eventual variante compacta oficial del logo. No son bloqueos de
esta aceptación digital; no se afirma PDF/UA, una validación con datos reales o
certificación de producción. Con aprobación visual expresa y verificaciones
satisfactorias, **BRANDING-05 queda cerrado digitalmente**.
