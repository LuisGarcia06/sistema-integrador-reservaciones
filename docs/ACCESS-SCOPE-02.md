# ACCESS-SCOPE-02 — Base de datos y servicio de alcance

## Estado

Este documento describe el cierre de ACCESS-SCOPE-02. La integracion posterior
del backend se documenta en [ACCESS-SCOPE-03A](ACCESS-SCOPE-03A.md). La migracion
016 sigue pendiente; la fase de frontend y el cierre integral tambien.

Preparacion interna. La migracion 016 esta preparada, pero NO se ejecuto:
no se pudo verificar que la conexion configurada sea un entorno seguro y
autorizado. Las pruebas nuevas usan un mock de PostgreSQL y no cargan el pool real.

Este cambio NO protege todavia las lecturas de reservaciones. No habilitar
usuarios restringidos para uso real ni considerar esta fase lista para
despliegue hasta completar ACCESS-SCOPE-03.

## Modelo y compatibilidad

- `usuarios.alcance_plataformas`: `VARCHAR(20) NOT NULL`, CHECK `all` / `selected`.
- `usuario_plataformas_visibles`: `id_usuario` e `id_plataforma` obligatorios,
  PK compuesta y FK hacia usuarios y plataformas. No se agregan cascadas.
- La migracion agrega la columna con default temporal `all`: todos los usuarios
  existentes conservan ese valor, sin modificar sus roles ni asignaciones.
- Dentro de la misma transaccion, cambia el default a `selected` para las
  cuentas creadas despues. La tabla puente inicia vacia.
- El esquema completo utiliza directamente default `selected` para nuevas
  instalaciones. Administrador siempre obtiene acceso completo por su rol,
  aunque el valor almacenado sea `selected`.
- La creacion actual de usuarios omite la nueva columna y heredara el default
  de PostgreSQL cuando se aplique la migracion. No se modificaron sus rutas,
  validadores, servicios ni interfaz para permitir configurar el alcance.
- No se modifican plataformas, reservaciones ni reglas de capacidad.

## Migracion

El repositorio mantiene archivos SQL numerados en `database/migrations/`,
aplicados manualmente; no se encontro un runner en `package.json` ni scripts.

`016_alcance_plataformas_usuarios.sql` contiene `BEGIN`, los cambios de columna
y default, la tabla puente y `COMMIT`. Aplicar una sola vez sobre una base
existente que tenga usuarios, roles y plataformas, despues de verificar
explicitamente el entorno y autorizar la aplicacion. Ante un error, detener
la ejecucion y revertir la transaccion; no continuar ignorando errores.

En una instalacion nueva, `database/schema.sql` ya incluye este modelo:
no aplicar tambien la migracion 016. No se agrego ejecucion automatica al
arranque de Node.js o Electron.

## Contrato del servicio

`backend/services/alcanceReservaciones.service.js` exporta
`obtenerAlcanceReservacionesUsuario(idUsuario)`. En ACCESS-SCOPE-03, el ID
debera provenir de `req.usuario.id_usuario`, despues de autenticar la solicitud.
Nunca utilizar el ID del body/query ni aceptar roles o asignaciones del cliente.

La consulta parametrizada obtiene estado, rol, modo y asignaciones en un solo
snapshot de PostgreSQL. No usa cache ni datos de permisos del JWT.

| Usuario activo | Resultado |
| --- | --- |
| Administrador | `{ all: true }` |
| Consulta `all` | `{ all: true }` |
| Consulta `selected` | `{ all: false, platform_ids: [...] }` |
| Consulta `selected` sin asignaciones | `{ all: false, platform_ids: [] }` |

Una identidad invalida, usuario inexistente/inactivo, rol desconocido o
configuracion invalida rechaza la promesa con error generico y `statusCode=403`.
Los errores de PostgreSQL se propagan sin conceder acceso ni reutilizar
permisos anteriores. Incluye el caso de una migracion aun no aplicada.
El futuro middleware debe interrumpir la solicitud al fallar la resolucion y
responder a errores internos con un mensaje generico, sin detalles de SQL.

`all` representa el alcance de datos, no acceso a todos los modulos ni permiso
para modificar informacion. La autorizacion por rol sigue siendo necesaria.
Un array vacio siempre significa cero reservaciones autorizadas.

## Pruebas

Ejecutar solo las pruebas nuevas, sin conexion ni escritura en DB:

```powershell
npm test -- --runInBand --runTestsByPath backend/__tests__/alcanceReservaciones.service.test.js
```

Cubren acceso completo, seleccion y lista vacia; usuarios inexistentes e
inactivos; roles/modos invalidos; errores de DB; cambios de asignaciones,
modo, rol y estado entre resoluciones; rechazo de identidades del cliente;
y que la API actual de usuarios sigue rechazando configuracion de alcance.

Resultado de verificacion: 40 pruebas nuevas aprobadas. Al ejecutar tambien
`reservaciones.validator.test.js` y `capacidad.service.test.js`, pasaron
90 pruebas en 3 suites. `node --check` aprobo ambos archivos JavaScript nuevos.
Estas verificaciones no ejecutaron migraciones ni pruebas de escritura en DB.

Las comprobaciones de migracion y esquema verifican sus declaraciones SQL
sin ejecutarlas. La aplicacion real y comprobacion de CHECK, FK, PK y defaults
en PostgreSQL queda pendiente de una base aislada y verificada.

No ejecutar la suite completa sin revisar su destino: `api.test.js` utiliza
una base real y realiza escrituras mediante `helpers/testDatabase.js`.

## ACCESS-SCOPE-03

La decision funcional confirmada es:

- Administrador: acceso completo.
- Consulta `all`: conservar los permisos actuales.
- Consulta `selected`: solo Dashboard y Reservaciones, limitados a plataformas
  asignadas; sin Historial, Daily, Operaciones, Transportes, Eventos de
  integracion, Usuarios ni Bitacora.

Falta integrar la resolucion en backend, aplicar filtros a listados, detalle,
busquedas, conteos y Dashboard, y bloquear los modulos excluidos tambien por
API directa. No basta ocultarlos en la interfaz. El Historial actual reutiliza
`/api/reservaciones`; un filtro de fecha no identifica por si solo la pantalla.
Se debe precisar la politica de consulta de fechas historicas sin confiar en
un indicador de pantalla enviado por el cliente.

Tambien quedan la configuracion administrativa, los cambios de rol y sus
transacciones, la limpieza de datos de sesiones/exportaciones y las pruebas
integrales de privacidad. Esta fase no define una nueva politica de cambios
de rol ni modifica los permisos de los endpoints existentes.
