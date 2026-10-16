# ACCESS-SCOPE-03A — Autorizacion y filtrado en backend

La continuacion administrativa y de interfaz esta documentada en
[ACCESS-SCOPE-03B](ACCESS-SCOPE-03B.md). Este documento conserva el cierre de 03A.

## Estado y requisito de despliegue

El backend integra el alcance por plataforma. Esta fase se verifico con
mocks y datos sinteticos; no se ejecutaron migraciones ni escrituras en
PostgreSQL y no se habilitaron usuarios restringidos en produccion.

La migracion 016 sigue pendiente. Sin la columna y tabla de esa migracion,
la resolucion de permisos falla y las lecturas protegidas responden 500,
incluso para Administrador y Consulta all. No existe fallback a acceso total.
No desplegar este cambio antes de completar la migracion en un entorno
verificado, ACCESS-SCOPE-03B y pruebas integrales.

## Autorizacion

La autenticacion existente verifica el JWT y consulta el usuario/rol actual
como antes. `autorizarRoles` conserva primero la validacion de roles. En
lecturas GET y HEAD, delega al middleware de alcance, que:

1. Consulta `obtenerAlcanceReservacionesUsuario(req.usuario.id_usuario)`.
2. Valida el resultado y lo conserva en `req.alcanceReservaciones` solo durante
   esa solicitud, para evitar consultas duplicadas.
3. Para alcance selected, permite exclusivamente la lista de rutas registrada
   por Express. No utiliza Referer, headers, parametros de pantalla ni permisos
   enviados por el frontend.
4. Responde 403 para modulos excluidos/configuracion invalida y 500 generico
   para errores internos de resolucion. Nunca continua tras un fallo.
5. Establece `Cache-Control: no-store` en lecturas autorizadas.

El alcance se vuelve a consultar en la siguiente solicitud, reconociendo
cambios de asignaciones, modo, rol o estado incluso con el mismo JWT.
La autorizacion de escrituras permanece basada en los roles actuales; no se
conceden permisos nuevos ni se filtran sus consultas internas de capacidad.

## Endpoints de Consulta selected

| Lectura | Politica |
| --- | --- |
| `/api/reservaciones` | Filas, filtros, total, paginacion y resumen por tour autorizados |
| `/api/reservaciones/:id` | Reserva visible o 404 indistinguible de inexistencia |
| `/api/dashboard/resumen` | Solo PAX/conteo visible y reservaciones recientes |
| `/api/tours` | Catalogo general necesario para filtros y etiquetas; sin reservas ni agregados |
| `/api/paises` | Catalogo general necesario para etiquetas; sin reservas ni agregados |
| `/api/plataformas` | Solo IDs y nombres de plataformas asignadas; total visible |

Los demas GET/HEAD autorizados por rol se deniegan con 403 para selected:
Daily, Daily operativo, observaciones Daily, Operaciones, sugeridas, detalle
de Operaciones, Transportes, detalles, Eventos de integracion, detalles y
diffs; tambien guias, operadores, vehiculos y detalle de tours, que no son
necesarios para Dashboard/Reservaciones. Usuarios y Bitacora conservan su
restriccion anterior para Administrador. La lista explicita tambien evita
que un endpoint de lectura nuevo conceda acceso selected por omision.

Las rutas publicas de login y recepcion/verificacion de webhooks no se
convierten en rutas de consulta de reservaciones ni se modifican.

## Consultas

`backend/utils/alcanceReservaciones.js` exige un alcance valido. No permite
interpretar un valor ausente como all. Construye el predicado parametrizado
`id_plataforma = ANY($N::int[])`, con alias controlado por el backend y un array
obtenido exclusivamente del servicio de permisos. Un array vacio no coincide
con ninguna fila.

El constructor comun de Reservaciones combina el predicado con todos los
filtros existentes mediante AND. Listado sin paginacion, filas paginadas,
COUNT y resumen por tour utilizan el mismo alcance antes de LIMIT/OFFSET.
La lectura publica por ID aplica tambien el predicado dentro de SQL. Las
funciones internas `obtenerReservacionPorIdConDb` y las transacciones
administrativas mantienen sus consultas y bloqueos originales.

No se agregan restricciones de fechas. Historial reutiliza la API de
Reservaciones: tambien recibe solo plataformas autorizadas, pero puede
buscar reservas antiguas permitidas. La ocultacion de la navegacion a esa
pantalla queda para ACCESS-SCOPE-03B, sin distinguir solicitudes mediante
indicadores manipulables del cliente.

El Dashboard selected devuelve `alcance_parcial: true`, metricas de
reservaciones/PAX visibles, recientes filtradas antes de LIMIT 10,
`alertas: {}` y `salidas_hoy: []`. Omite metricas de grupos y no consulta
operaciones, sugerencias ni capacidad global. No incluye observaciones
compartidas. Administrador y Consulta all conservan el contenido operativo
previo del Dashboard y los permisos de lectura anteriores.

## Pruebas y reproduccion segura

`accessScope.routes.test.js` ejecuta rutas, autenticacion, resolucion de
alcance, controllers y servicios reales de Reservaciones, Dashboard y
Plataformas con un pool mock. Un driver aislado evalua los predicados SQL
sobre reservas visibles y ocultas; si el SQL omite el filtro, los datos
ocultos se devuelven y las pruebas fallan. Se comprueban escrituras denegadas,
404 identico, filtros combinados, fechas historicas, count, resumen por tour,
paginacion, Dashboard parcial, permisos anteriores y cambios entre solicitudes.

Las pruebas existentes de Eventos de integracion simulan alcance all para
verificar su contrato previo sin llamar a PostgreSQL.

Resultado: 590 pruebas aprobadas en 25 suites de backend, incluidas las
pruebas nuevas, las de ACCESS-SCOPE-02, capacidad e integraciones existentes.
Se excluyo `api.test.js`, que realiza escrituras contra una base real.

Para reproducir las suites aisladas con todas las conexiones reales a pg
bloqueadas por un setup exclusivo de pruebas:

```powershell
$taskUnitTestPaths = @(rg --files backend -g '*.test.js' | Where-Object { $_ -notmatch '(^|[\\/])api\.test\.js$' })
node ./node_modules/jest/bin/jest.js --runInBand --setupFiles=./backend/__tests__/helpers/noPostgres.js --runTestsByPath @taskUnitTestPaths
```

El helper no cambia configuracion de la aplicacion ni del script de pruebas.
La aplicacion del SQL y las pruebas con PostgreSQL real quedan pendientes de
un ambiente aislado y verificado.

## ACCESS-SCOPE-03B

Falta adaptar menu y navegacion de Consulta selected; reconocer el alcance
en la sesion del frontend; evitar que Dashboard solicite pendientes de
integracion que ahora devuelven 403; ocultar campos/indicadores operativos
omitidos del Dashboard parcial; y cerrar la configuracion administrativa,
los cambios de rol/alcance y el manejo de datos cargados previamente.

No se modificaron interfaces, esquema, migraciones, catalogo de plataformas,
reglas de capacidad ni datos reales en esta fase. Los usuarios existentes
conservaran all al aplicar la migracion 016; las nuevas cuentas partiran de
selected sin asignaciones. Los permisos efectivos de lectura solo funcionaran
cuando el esquema requerido este disponible.
