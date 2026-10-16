# ACCESS-SCOPE-03B — Administracion de alcance e interfaz

## Estado

Configuracion administrativa y frontend implementados y verificados con
mocks. La migracion 016 NO se ejecuto. No se conecto la implementacion a
usuarios reales, no se realizaron operaciones en PostgreSQL ni se utilizo
Git. ACCESS-SCOPE no se considera completo ni listo para produccion hasta
validar la migracion y el flujo integral en un entorno seguro.

## Endpoints

Se ampliaron los endpoints existentes `/api/usuarios`:

- GET listado y GET `/:id`: incluyen `alcance_plataformas` y `platform_ids`.
- POST: Consulta requiere alcance explicito; selected puede tener cero IDs.
- PATCH `/:id`: configura modo/asignaciones, conservando el modo anterior
  cuando un Consulta existente recibe cambios de otros campos.
- Roles, cambio de password y permisos exclusivos de Administrador se conservan.

Los IDs y el modo se validan en validators y la configuracion dependiente del
rol se valida tambien en el servicio. Se rechazan IDs que no sean enteros
positivos, duplicados o inexistentes. all no admite asignaciones no vacias.
Administrador no recibe controles de alcance ni acepta esos campos en su
configuracion administrativa. Consulta no puede configurar sus permisos.

El modo y las asignaciones se guardan en la misma transaccion que los datos
del usuario. Se verifica el catalogo mediante SELECT parametrizado y bloqueos
FOR KEY SHARE, se actualiza el modo y se reemplazan las filas de la tabla puente.
Un error provoca ROLLBACK; no se conservan cambios parciales. Se mantienen los
bloqueos y protecciones del ultimo Administrador activo y de la propia cuenta.

Administrador -> Consulta exige un alcance final explicito. Consulta ->
Administrador obtiene acceso completo por rol; su configuracion almacenada
queda inactiva y una degradacion futura vuelve a exigir alcance explicito.

El login ahora devuelve modo efectivo y plataformas desde PostgreSQL despues
de verificar credenciales. Se agrego `GET /api/auth/sesion`, autenticado, para
consultar exclusivamente el usuario del JWT verificado, ignorando IDs de query.
No permite configurar permisos. Devuelve `Cache-Control: no-store`.

Sin el esquema 016, login/renovacion y lecturas que requieren alcance fallan
de manera segura. No hay fallback que conceda all ante errores de esquema.

## Interfaz y sesion

Usuarios carga el catalogo de plataformas desde el endpoint existente.
El formulario de Consulta exige elegir Todas o Plataformas seleccionadas y
muestra casillas segun la opcion. Las ediciones conservan la configuracion
recibida del backend. Ningun ID de plataforma o rol esta fijado en el formulario.

La sesion conoce rol, modo efectivo e IDs autorizados. No se establece una
sesion con alcance ausente o invalido. Se verifica antes de navegar y antes
de solicitudes protegidas, agrupando verificaciones simultaneas; tambien
se renueva cada 30 segundos y al recuperar foco/visibilidad.

Al reconocer un cambio de permisos, cerrar sesion o cambiar usuario:

- Se incrementa la version de sesion y se abortan solicitudes pendientes.
- Las respuestas pertenecientes a otra version se descartan.
- Se limpian caches, filtros, seleccion, modales y estados de todas las paginas.
- Se retiran DOM, datos de impresion y timers de pendientes de integracion.
- Se reconstruye la vista segun los permisos verificados.

Un fallo de renovacion borra los datos y vuelve al login. La deteccion de
cambios externos es por verificacion/polling, no por notificaciones push:
una pantalla inactiva puede reconocer una revocacion en el siguiente ciclo
(de 30 segundos), al recuperar el foco o al realizar una accion. El backend
valida cada solicitud independientemente de esa frecuencia de interfaz.

Consulta selected solo ve Dashboard y Reservaciones. La misma politica bloquea
la navegacion directa a otras pantallas. Administrador y Consulta all conservan
la navegacion previa segun sus permisos.

El Dashboard parcial identifica la limitacion a plataformas asignadas, muestra
reservaciones/PAX y recientes visibles, y omite grupos, salidas, alertas de
planificacion y el panel de pendientes. Tampoco solicita eventos de integracion
ni inicia su timer para selected. No se modifican calculos de capacidad.

Reservaciones conserva filtros, paginacion y detalle mediante el backend
protegido en 03A. El catalogo de plataformas del filtro viene ya autorizado.
Se conservan las prohibiciones de escritura de Consulta y el manejo de errores
403/404. Sin asignaciones, se muestra un estado vacio. Reservas antiguas de
plataformas autorizadas siguen consultables; Historial solo se excluye como vista.

## Verificacion

Resultado: 615 pruebas aprobadas en 27 suites aisladas. Incluye las suites
anteriores de capacidad e integraciones, 24 pruebas nuevas de administracion/
sesion y una prueba Electron que ejecuta 12 escenarios sobre el DOM real.

El helper `frontendScopeHarness.cjs` sirve los archivos reales del frontend
con una API simulada local. Usa una ventana Electron oculta, sin integracion
Node en renderer y con un perfil temporal independiente. Deshabilita GPU y
sandbox solo en este proceso de pruebas para funcionar en el entorno actual;
no modifica la configuracion de Electron de la aplicacion.

Sus escenarios cubren menu/navegacion, Dashboard parcial y all, catalogo
restringido, detalle y errores 403/404, selected vacio, creacion/edicion,
cambio visual Administrador -> Consulta, renovacion, limpieza de impresion,
respuestas tardias y fallo de verificacion.

Las pruebas de backend usan un pool mock y un estado transaccional simulado
para demostrar COMMIT/ROLLBACK y la ausencia de cambios parciales. No prueban
bloqueos concurrentes reales de PostgreSQL.

Para ejecutar las suites sin conexiones reales a PostgreSQL:

```powershell
$taskUnitTestPaths = @(rg --files backend -g '*.test.js' | Where-Object { $_ -notmatch '(^|[\\/])api\.test\.js$' })
node ./node_modules/jest/bin/jest.js --runInBand --setupFiles=./backend/__tests__/helpers/noPostgres.js --runTestsByPath @taskUnitTestPaths
```

`api.test.js` y scripts de persistencia real se excluyen. La prueba Electron
usa su propio servidor HTTP simulado y no arranca `backend/server.js` ni workers.
Las dos pruebas que antes exigian rechazar campos de alcance en fase 02 se
actualizaron al contrato administrativo de 03B; las restricciones por rol
siguen cubiertas por pruebas de rutas.

## Archivos

Creados:

- `backend/__tests__/usuariosAlcance.test.js`
- `backend/__tests__/frontendScope.test.js`
- `backend/__tests__/helpers/frontendScopeHarness.cjs`
- `docs/ACCESS-SCOPE-03B.md`

Modificados:

- `backend/validators/usuarios.validator.js`
- `backend/services/usuarios.service.js`
- `backend/services/auth.service.js`
- `backend/controllers/auth.controller.js`
- `backend/routes/auth.routes.js`
- `backend/__tests__/alcanceReservaciones.service.test.js`
- `frontend/js/auth.js`
- `frontend/js/api.js`
- `frontend/js/layout.js`
- `frontend/js/router.js`
- `frontend/pages/usuarios.js`
- `frontend/pages/dashboard.js`
- `frontend/pages/reservaciones.js`
- `frontend/pages/historial.js`
- `frontend/pages/daily.js`
- `frontend/pages/operaciones.js`
- `frontend/pages/bitacora.js`
- `frontend/pages/configuracion.js`
- `frontend/css/pages.css`
- `README.md`
- `docs/ACCESS-SCOPE-03A.md`

Las paginas operativas excluidas solo reciben hooks para limpiar su estado
al invalidar la sesion. No se modificaron esquema, migraciones, integraciones,
reglas de capacidad ni configuracion productiva de Electron.

## Pruebas integrales pendientes

1. Identificar y autorizar expresamente una base aislada; no reutilizar la
   conexion configurada sin confirmar su finalidad.
2. Aplicar 016 una vez sobre una base existente compatible, o usar el esquema
   completo para una instalacion nueva sin repetir esa migracion.
3. Verificar backfill all de usuarios existentes, defaults, CHECK, FK y PK;
   probar transacciones y concurrencia con datos sinteticos.
4. Recorrer creacion, edicion, cambios de rol, sesiones simultaneas,
   revocaciones, filtros, paginacion, historicos, accesos directos y detalles.
5. Verificar en Electron con su configuracion normal impresion, PDF, cambio
   de usuario y limpieza de datos anteriores; reconstruir instalador solo
   despues de aceptar el flujo completo.

Estas verificaciones y la aceptacion funcional siguen pendientes. No activar
usuarios restringidos en produccion basandose solo en las pruebas con mocks.
