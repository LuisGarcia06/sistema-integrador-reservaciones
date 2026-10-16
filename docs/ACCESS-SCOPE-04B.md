# ACCESS-SCOPE-04B - Electron, Express y PostgreSQL reales

## Resultado y alcance

Ejecucion final: **57 verificaciones aprobadas, 0 fallos**: 56 escenarios
integrales en Electron y una inspeccion automatica de los PDF reales.
Regresiones: **615 pruebas aprobadas en 27 suites**, 0 fallos.
Ambos PDF se renderizaron y sus dos paginas se revisaron visualmente.

Se ejecuto Electron 43.4.1 / Chromium 150.0.7871.224, cargando
`electron/main.js`, su preload y el frontend originales del repositorio.
El servidor fue el entrypoint real `backend/server.js`, por HTTP local.
Las consultas y transacciones fueron reales mediante la configuracion pg
centralizada. No se reemplazaron Electron, Express, autenticacion ni PostgreSQL
con mocks en estas pruebas E2E.

El fallo real de autorizacion de impresion/PDF se corrigio y se verifico.
La base de la empresa no se modifico. No se utilizo Git, no se instalaron
componentes ni se modificaron servicios/configuraciones globales.
No se declara el sistema listo para produccion.

## Identidad e aislamiento

| Propiedad | Empresa, solo lectura | Laboratorio final |
| --- | --- | --- |
| Host | localhost | 127.0.0.1 |
| Puerto PostgreSQL | 5432 | 51621 |
| Base | sian_kaan_reservaciones | access_scope_04b_c7515b95715f_test |
| Usuario | postgres | access_scope_lab |
| PostgreSQL | 18.3, identificado en 04A | 18.3, comprobado en 04B |
| Esquema | public | public |
| Express y frontend | No se utilizaron | http://127.0.0.1:3000/app/ |

Directorio PostgreSQL:
`A:/sistema-integrador-reservaciones/.access-scope-lab/04b-c7515b95715f/data`.
System identifier: `7696673840889835008`.

El laboratorio anterior de 04A sigue presente y detenido. Sus credenciales
PostgreSQL efimeras no se conservaron; no se cambio su autenticacion para
recuperarlo. Se creo otra instancia con initdb instalado y datos nuevos.
Antes de escribir se verificaron base, usuario, direccion, puerto, directorio
e identidad fisica. El harness Electron volvio a verificar base, directorio
y system identifier antes de sus comprobaciones SQL. Certeza de aislamiento alta.

Se cargo `database/schema.sql`, que YA contiene la migracion 016, y se verifico
la tabla puente en public. No se volvio a ejecutar 016, ni se modifico schema.sql.
El backend recibio variables del laboratorio y APP_CONFIG_PATH hacia un archivo
vacio; su conexion no cargo el .env de la empresa. Password del cluster y JWT
fueron generados en memoria, sin escribirlos en informes ni codigo.

Se comprobo que 3000 estuviera libre antes de iniciar el servidor. Si esta
ocupado, el validador falla y no reutiliza un backend ajeno. Se deshabilito el
worker GetYourGuide y se bloquearon solicitudes HTTP/HTTPS/fetch externas en
el proceso backend de prueba y la red del renderer. No se llamaron APIs de
GetYourGuide, FareHarbor, Meta o WhatsApp ni se usaron cuentas reales.

La conexion configurada solo se utilizo para SELECT con
`default_transaction_read_only=on`, antes y despues. Esquema y conteos de
todas las tablas public coincidieron. Estas comprobaciones no son un checksum
de cada valor real: la garantia de no escritura procede del modo de solo lectura
y de las conexiones separadas, no solo de comparar conteos. No se mostraron
credenciales, datos personales ni hashes de passwords reales.

## Perfiles, autenticacion y navegacion

Se sembraron 5 usuarios, 5 plataformas, 16 tours, un pais, 42 reservaciones,
una operacion y un transporte sinteticos. Todas las IDs provinieron de INSERT
RETURNING/catalogos del laboratorio; el frontend uso sus catalogos reales.

- Administrador: acceso completo; segundo Administrador para cambios concurrentes.
- Consulta all: lectura completa y navegacion previa conservadas.
- Consulta selected: GetYourGuide y FareHarbor, sin WhatsApp Business, Externa
  ni Booking Directo.
- Consulta selected vacio: ninguna asignacion ni resultados visibles.

Los cuatro perfiles iniciaron sesion mediante el formulario real. Se verificaron
el perfil mostrado y GET /api/auth/sesion. No se persistio la sesion de prueba
entre usuarios. La cuenta inactiva obtuvo 403 y no pudo autenticar ni operar.
La ausencia temporal real de la tabla puente produjo 500 sin acceso completo;
la interfaz limpio la sesion y regreso al login. La tabla se restauro en finally.

Selected vio solo Dashboard y Reservaciones. Las funciones internas de router
rechazaron Historial, Daily, Operaciones, Transportes, Usuarios, Bitacora y
Configuracion. Transportes se administra dentro del modulo operativo existente;
no se agrego una pantalla nueva. Pendientes no es una ruta independiente:
se verifico su ausencia en Dashboard y el 403 de /api/eventos-integracion.
Tambien se comprobaron los 403 de las APIs operativas. Historial comparte la API
de Reservaciones: se bloqueo su pantalla, sin prohibir fechas antiguas.

Administrador y Consulta all conservaron su navegacion segun rol. Consulta all
consulto Daily, Operaciones y Transportes, y no pudo escribir reservas ni cambiar
su propio alcance.

## Dashboard y Reservaciones

El DOM real de Electron coincidio con /api/dashboard/resumen: selected mostro
28 reservas vigentes y 56 PAX, un resumen identificado como parcial, recientes
autorizadas, sin planificacion global ni consultas a eventos de integracion.
Selected vacio mostro cero conteos/PAX y cero reservas.

Se verificaron listado, total 30, paginacion 25 + 5, filtro de catalogo autorizado,
busqueda por nombre/codigo/fecha/plataforma, filtros combinados y resultados vacios.
El detalle VISIBLE-0 del 2020-01-05 fue accesible desde Reservaciones. Los IDs
ocultos e inexistentes devolvieron la misma respuesta 404. No se agrego restriccion
por antiguedad.

La captura dashboard-selected.png de la ventana oculta resulto vacia y NO se
considera evidencia visual. La evidencia de estos escenarios son las aserciones
sobre DOM de Electron real y las respuestas HTTP/SQL, registradas en JSON.

## Administracion y sesiones simultaneas

Desde el formulario Usuarios se crearon Consulta all y selected; se verificaron
los valores y filas puente almacenados en PostgreSQL. Se probaron reemplazo y
eliminacion de plataformas, all-selected-all y Administrador-Consulta con alcance
explicito. Una ID inexistente introducida en el control del formulario fue
rechazada por el backend sin cambios parciales.

Dos sesiones con Administradores diferentes intentaron desactivar al otro al
mismo tiempo: respuestas 409 y 200, con un Administrador activo restante.
Se restauraron las cuentas sinteticas para continuar. Dos ediciones simultaneas
del alcance guardaron una configuracion completa, sin mezclar asignaciones.

Las ventanas tuvieron sesiones/perfiles independientes y JWT distintos.
Solicitudes concurrentes devolvieron 42 reservas globales para Administrador y
30 autorizadas para selected. Se comprobaron:

- Revocacion con detalle abierto: siguiente lectura 404 con el mismo JWT;
  foco retiro el detalle y sus datos.
- Revocacion antes de una accion: revalidacion, limpieza y nuevo listado filtrado.
- Renovacion periodica sin cambiar el intervalo de 30 segundos: detecto la
  revocacion en 28,889 segundos de espera, dentro del ciclo existente.
- Revocacion durante una busqueda: un bloqueo real de PostgreSQL mantuvo
  la consulta pendiente; revalidacion/abort y limpieza evitaron conservar datos.
- Respuesta real pendiente al cerrar sesion y cambiar a selected vacio:
  la respuesta anterior se descarto y no reaparecieron clientes.
- Cambios de rol y alcance con app abierta: menu y datos reconstruidos.
- Desactivacion: siguiente lectura rechazada y renovacion llevo al login.

El backend valida cada solicitud; una pantalla inactiva conserva la latencia de
deteccion por polling hasta el siguiente ciclo, foco o accion. No se agrego push
ni se alteraron intervalos de produccion.

## Impresion, PDF y correccion real

Se generaron con printToPDF real de Electron:

- reservacion-selected.pdf: reserva VISIBLE-2 autorizada.
- daily-admin.pdf: Daily del transporte sintetico que incluye VISIBLE-2.

Se extrajo el texto con pypdf, se renderizaron todas las paginas con PDFium y
se inspeccionaron las dos imagenes completas. Ambos archivos tienen una pagina,
son legibles y no presentan recortes ni superposiciones. Las comprobaciones
excluyeron codigos ocultos, clientes/observaciones ocultos y plataformas ajenas
a ese contenido. Los PDF y PNG quedaron dentro del laboratorio excluido por
.gitignore. No se enviaron documentos a impresoras fisicas.

Para cumplir esa prohibicion, se intercepto window.print como salida a impresora;
la preparacion del documento y el motor printToPDF fueron reales. La seleccion
del destino de showSaveDialog se automatizo hacia el laboratorio. Esto no valida
interaccion humana con el dialogo nativo ni cola/controlador de impresora fisica.

Se encontro que el IPC daily:export-pdf solo verificaba la ventana emisora:
un selected de la ventana principal podia exportar la pantalla actual. En ese
caso no obtuvo Daily oculto, pero se incumplia el rechazo del IPC.
Ademas, el boton de impresion Daily no revalidaba la sesion al pulsarlo.

Correcciones de producto, sin cambiar permisos, arquitectura o modelo:

- electron/main.js renueva sesion, exige vista/fecha/documento Daily y valida
  la autorizacion mediante el endpoint real /api/daily/operativo antes de generar
  PDF. Repite la verificacion antes de guardar y exige misma version/token.
- frontend/pages/daily.js revalida la sesion antes de enviar la impresion y
  comprueba que el usuario y el documento sigan autorizados.

La ejecucion final rechazo el IPC directo selected, retiro el Daily al revocar
el rol con la pantalla abierta e impidio guardar el PDF si se revocaban permisos
durante el dialogo. La impresion directa de una reserva oculta tambien fue
rechazada mediante 404, sin preparar documento ni invocar salida a impresora.
Administrador conservo impresion y exportacion actuales.

## Regresiones, errores del validador y limpieza

La interfaz administrativa creo, edito y cancelo una reserva; SQL confirmo estado
Cancelada y tres entradas de bitacora. Dos asignaciones concurrentes de 7 PAX
al mismo grupo obtuvieron 200/400, con 7 PAX asignados. Dos grupos de 12 alcanzaron
24 PAX; grupo 3 y vehiculo de capacidad 13 se rechazaron. Los validadores existentes
conservaron los limites 12/24. Las plataformas ocultas siguieron contando para
la capacidad administrativa.

Pasaron las 615 pruebas existentes de alcance, capacidad e integraciones en
27 suites aisladas. api.test.js se excluyo porque utiliza persistencia real;
el guard noPostgres impidio acceso real cuando una seleccion inicial del comando
la incluyo por error. La cobertura real de esta fase se ejecuto con el validador
E2E nuevo, sin tocar la conexion de esa suite.

Tambien se corrigieron errores de preparacion/sincronizacion del validador:
password no enumerable de pg.Pool al copiar config para lectura, timestamp
obligatorio del fixture, escape de ruta Windows en NODE_OPTIONS, respuesta sin
paginacion cuando no hay query page/limit, redeclaraciones entre ejecuciones JS,
espera del router, comparacion ambigua de nombres y perfil de una asercion.
Los intentos anteriores y sus evidencias se conservan; sus fallos no se presentan
como aprobados. La ejecucion final completa tiene 57 aprobadas / 0 fallos.

Se cerraron las sesiones, Electron, Express y PostgreSQL iniciados por el script.
report.json informa processes_stopped=true y cluster_stopped=true; no queda
postmaster.pid. No se eliminaron automaticamente datos ni informes.
Se conservaron respaldos custom before-e2e.dump y after-e2e.dump. Su identidad
y hashes estan en report.json. Son exclusivamente sinteticos.

## Archivos y reproduccion

Creados:

- scripts/validarAccessScopeElectron.cjs: prepara/verifica cluster, configura
  servidor y Electron, verifica empresa por lectura, respalda y detiene procesos.
- scripts/validarAccessScopeElectronHarness.cjs: automatiza Electron real,
  formularios, sesiones, concurrencia y printToPDF.
- scripts/accessScopeNetworkGuard.cjs: bloquea salida externa del backend de prueba.
- scripts/revisarAccessScopePdf.py: extraccion, comprobaciones y renderizado PDF.
- docs/ACCESS-SCOPE-04B.md: este informe.

Modificados:

- electron/main.js: autorizacion del IPC y verificacion antes de guardar.
- frontend/pages/daily.js: revalidacion antes de imprimir.
- README.md: enlace y estado de 04B.

No se modificaron backend, esquema, migraciones ni configuracion .env.

```powershell
node scripts/validarAccessScopeElectron.cjs

$taskUnitTestPaths = @(rg --files backend -g '*.test.js' | Where-Object { $_ -notlike '*api.test.js' })
node ./node_modules/jest/bin/jest.js --runInBand --setupFiles=./backend/__tests__/helpers/noPostgres.js --runTestsByPath @taskUnitTestPaths
```

El E2E crea siempre un cluster nuevo, no reutiliza bases ni credenciales.
Requiere PostgreSQL 18 instalado, Electron/dependencias existentes y puerto 3000
libre. ACCESS_SCOPE_PG_BIN permite especificar sus binarios; ACCESS_SCOPE_PYTHON
permite indicar Python con pypdf y pypdfium2. Por defecto usa el runtime disponible
identificado en esta tarea. El arranque PostgreSQL debe poder crear procesos de
Windows fuera del token restringido de la herramienta, como en 04A.
No instala componentes ni cambia servicios.

Evidencia final en `.access-scope-lab/04b-c7515b95715f/`:
report.json, electron-report.json, logs, fixture sintetico, respaldos, PDF, textos
e imagenes renderizadas. Los secretos del cluster y JWT no se conservan; para
repetir se crea otro laboratorio, o se restaura un respaldo en otra instancia
verificada. El fixture contiene solo la password sintetica de las cuentas de prueba.

## Riesgos pendientes y siguiente fase

La migracion 016 sigue pendiente en sian_kaan_reservaciones. No activar esta
funcionalidad en la empresa hasta preparar su migracion y aceptar el flujo.
Estas pruebas no certifican instalador, configuracion empaquetada, interaccion
manual del dialogo de guardado, todos los drivers de impresion, estres prolongado
ni aceptacion funcional de Community Tours. Tampoco certifican proveedores externos.

Siguiente fase recomendada: despliegue controlado en un entorno de preproduccion
identificado, sin servicios externos activos, con respaldo y restauracion ensayada.
Repetir E2E usando el build empaquetado, completar aceptacion manual de usuarios,
PDF/impresion y sesiones prolongadas; verificar el destino y el camino de esquema
antes de aplicar 016. Una base nueva con schema.sql no requiere esa migracion.
Para la base existente, ejecutar 016 una sola vez con registro y verificaciones
solo cuando esa operacion este autorizada. Planear ventana, recuperacion y monitoreo
antes de un cambio de conexion o activacion productiva. Esta tarea no desplego ni
migro la base de la empresa.
