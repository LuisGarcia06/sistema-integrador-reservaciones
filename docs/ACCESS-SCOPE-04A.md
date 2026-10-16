# ACCESS-SCOPE-04A — PostgreSQL aislado y migracion 016

## Resultado

Se completo la validacion con PostgreSQL real: 57 verificaciones aprobadas,
0 fallos en la ejecucion final. Tambien pasaron las 615 pruebas existentes en
27 suites aisladas. No se ejecutaron operaciones productivas ni se utilizo Git.

La migracion 016 se ejecuto SOLO en una instancia nueva de laboratorio.
Sigue pendiente en la base de datos configurada para Community Tours.
ACCESS-SCOPE no esta listo para produccion; falta ACCESS-SCOPE-04B y aceptacion
integral en un entorno seguro.

## Entorno identificado

| Propiedad | Conexion configurada | Laboratorio final |
| --- | --- | --- |
| Host | localhost (servidor ::1) | 127.0.0.1 |
| Puerto | 5432 | 65435 |
| Base | sian_kaan_reservaciones | access_scope_04a_bc7083039a6c_test |
| Usuario de conexion | postgres | access_scope_lab |
| Version | PostgreSQL 18.3 | PostgreSQL 18.3 |
| Esquema | public | public |
| Finalidad | No certificada como desarrollo; protegida como base de empresa | Exclusiva de pruebas, creada en esta tarea |

La conexion configurada se inspecciono mediante SELECT y con
`default_transaction_read_only=on`. Existen usuarios, roles, plataformas y
reservaciones. Antes y despues de las pruebas, no existian
`usuarios.alcance_plataformas` ni `usuario_plataformas_visibles`.
No se consultaron datos personales ni hashes de usuarios reales.

No se encontro runner de migraciones en el repositorio ni tabla de registro
con nombre de migracion/version en los esquemas de usuario inspeccionados.
El mecanismo existente es aplicacion manual de archivos SQL numerados y
verificacion de sus efectos en el catalogo. No se agrego una tabla de tracking.

## Evidencia de aislamiento

Directorio de datos del laboratorio final:

`A:/sistema-integrador-reservaciones/.access-scope-lab/bc7083039a6c/data`

Identificador de cluster informado por `pg_control_system()`:
`7696661013399861312`.

Se utilizo initdb instalado en PostgreSQL 18, sin instalar componentes ni
registrar servicios. La instancia solo escucho en loopback, en un puerto
propio distinto de 5432, con usuario y password nuevos. El script comprobo
base, usuario, direccion, puerto, directorio y system_identifier antes de
usar la conexion para escrituras. El backend se conecto mediante su config
centralizada, con un archivo de entorno vacio y valores del laboratorio en
memoria; no cargo la configuracion de la empresa.

Certeza de aislamiento alta para estas pruebas: cluster fisicamente separado,
directorio nuevo, identidad verificada y solo datos sinteticos. No se copio
ninguna reservacion ni usuario real. La instancia quedo detenida al terminar;
los archivos se conservan en un directorio excluido por .gitignore.
Las credenciales del servidor y JWT fueron temporales, sin persistirlas en
codigo, informes o configuracion productiva.

El primer arranque en sandbox fallo al crear un token restringido de Windows.
La ejecucion autorizada fuera de esa limitacion permitio iniciar el cluster,
sin modificar configuraciones globales ni la instancia de la empresa.

## Migracion y compatibilidad de esquema

`016_alcance_plataformas_usuarios.sql` se aplico en
`access_scope_04a_bc7083039a6c_test`, despues de preparar el esquema anterior
mediante una copia en memoria del schema actual, omitiendo SOLO la columna,
CHECK y tabla puente de 016. No se modifico el archivo schema.sql.

Antes de la migracion se crearon 5 usuarios y 42 reservas sinteticas. La
comparacion SQL confirmo que permanecieron iguales los usuarios originales,
roles, hashes de password y todas las reservas. Los usuarios existentes
recibieron all; una cuenta nueva creada sin indicar modo obtuvo selected.

Se verificaron restricciones reales:

- NOT NULL del modo y de las dos columnas de la tabla puente.
- CHECK all/selected: un valor diferente produjo SQLSTATE 23514.
- PK compuesta: una asignacion duplicada produjo 23505.
- FK a usuarios y plataformas: IDs inexistentes produjeron 23503.

El esquema completo YA incluye 016. En una base nueva creada con schema.sql,
intentar aplicar tambien la migracion produjo 42701; se revirtio la transaccion
y se confirmo que el esquema quedo intacto. No aplicar ambos caminos.

Un conflicto intermedio al crear la tabla puente se probo en otra base aislada:
produjo 42P07 y ROLLBACK retiro los ALTER anteriores. La migracion es
transaccional y no elimina reservas, usuarios ni plataformas.

No se detectaron incompatibilidades que requirieran modificar el backend o
la migracion. Las correcciones realizadas fueron del validador: el delimitador
del trigger de fallo simulado y la preparacion de reservas asignadas para
medir capacidad. La primera ejecucion completa tuvo esos dos fallos de prueba;
la ejecucion final paso las 57 verificaciones.

## Pruebas reales

Se probaron las rutas, controllers y servicios reales con pg:

- Login y sesion para Administrador, Consulta all, selected y selected vacio.
- Listados, codigo, nombre, plataforma, fechas historicas y filtros combinados.
- Detalle visible y 404 identico para reserva oculta/inexistente.
- Paginacion 25 + 5 de las 30 reservas visibles y resumen por tour autorizado.
- Dashboard: selected recibio 28 reservas vigentes / 56 PAX; el total global
  era 40 / 176. Selected vacio recibio cero filas, conteos y PAX.
- Catalogos permitidos; plataformas restringidas a asignaciones de DB.
- 403 de Daily, observaciones, Operaciones, sugeridas, Transportes, integracion,
  detalles/diffs, Usuarios, Bitacora y catalogos operativos para selected.
- Compatibilidad de lectura de Consulta all en Daily, Operaciones, Transportes
  y eventos de integracion.
- Escrituras prohibidas a Consulta y configuracion de su propio alcance.
- Creacion/edicion administrativa, all-selected-all, IDs invalidos/duplicados,
  eleccion explicita y proteccion del ultimo Administrador.
- Trigger de fallo real durante INSERT de asignaciones: ROLLBACK con modo,
  nombre y permisos anteriores intactos.
- Revocacion y desactivacion reconocidas al reutilizar el mismo JWT.
- Error PostgreSQL real por ausencia temporal de tabla: 500 sin fallback all.
- Administrador creo, modifico y cancelo una reserva, con 3 entradas de auditoria.
- Capacidad operativa conto 20 PAX de una plataforma invisible para selected,
  en dos grupos sinteticos de 10. Los limites 12/24 y el rechazo de vehiculo
  de capacidad 13 siguieron vigentes.

Historial comparte la API de Reservaciones: se comprobo que las fechas antiguas
permitidas siguen accesibles. El bloqueo de Historial como pantalla pertenece
al frontend, cubierto por el harness Electron con mocks; su validacion contra
este PostgreSQL real corresponde a 04B.

No se montaron webhooks ni se iniciaron workers. No hubo llamadas reales a
GetYourGuide, FareHarbor o WhatsApp. Sus suites aisladas continuaron pasando;
esto no sustituye pruebas productivas de proveedores.

## Respaldo y recuperacion

Se generaron respaldos custom pg_dump antes y despues de 016 y hashes SHA-256:

- `before-016.dump`: 1243b2452ddb138f84399bb4e687d60025f5074107b30e7b51a7f16d324cfd39
- `after-016.dump`: 6604a844463d3ae4e2dc0e657cb26aa9d662a760455b32551fc7eb2effc3e4d6

Ubicacion: `.access-scope-lab/bc7083039a6c/`.
El respaldo previo se restauro con pg_restore en
`access_scope_04a_bc7083039a6c_restore_test`. Se compararon usuarios y reservas
sinteticas y se confirmo que la columna de alcance no existia en la restauracion.

Para una aplicacion futura en la empresa, que NO esta autorizada por esta tarea:

1. Verificar expresamente destino, responsable, ventana y configuracion; detener
   escrituras de la aplicacion durante el cambio.
2. Generar respaldo custom autorizado, conservarlo con acceso restringido y
   verificar checksum y restauracion en un destino separado.
3. Confirmar ausencia de 016 o detectar una aplicacion parcial antes de ejecutar.
   Usar un cliente que detenga la ejecucion ante errores (ON_ERROR_STOP).
4. Ante un fallo transaccional, revertir y verificar catalogo. Ante una
   recuperacion posterior, restaurar en otra base y validar antes de cambiar
   conexiones con autorizacion. No eliminar columnas/asignaciones silenciosamente.
5. Mantener un registro de ejecucion con fecha, hash SQL y verificacion de efectos.

No se respaldo ni copio la base de la empresa durante esta tarea.

## Artefactos y reproduccion

Creados: `scripts/validarAccessScopePostgres.cjs` y este documento.
Modificados: .gitignore para excluir laboratorios y README.md para enlazar
este resultado. No se modificaron archivos de la aplicacion ni migraciones.

El validador crea SIEMPRE otro cluster y nombres nuevos; no reutiliza una
base existente ni la conexion .env:

```powershell
node scripts/validarAccessScopePostgres.cjs
```

Requiere las herramientas PostgreSQL 18 instaladas y un contexto de Windows
que permita arrancar PostgreSQL. No instala ni modifica servicios. Los backups
son sinteticos; las credenciales efimeras no se conservan para reiniciar el
cluster directamente. Para repetir o continuar, generar otro laboratorio
verificado o restaurar el backup en otra instancia aislada verificada.

Informe JSON completo: `.access-scope-lab/bc7083039a6c/report.json`.

## ACCESS-SCOPE-04B recomendado

1. Crear una instancia aislada verificada y mantenerla activa solo durante
   la prueba, con backend apuntando explicitamente a ella y workers deshabilitados.
2. Probar Electron con su configuracion normal y backend/PostgreSQL reales:
   login, Usuarios, menu, Dashboard parcial, filtros, detalle y fechas historicas.
3. Usar sesiones simultaneas para revocaciones/cambios de rol y comprobar
   limpieza de datos, respuestas tardias, errores y tiempos de renovacion.
4. Verificar impresion/PDF, cierre/cambio de usuario y ausencia de datos ocultos.
5. Probar concurrencia de cambios administrativos, ultimo Administrador y
   capacidad. Registrar evidencia y aceptacion antes de planear produccion.

Pendientes: la prueba integral de Electron con DB real, concurrencia extendida,
aceptacion funcional y la aplicacion autorizada de 016 en el destino correcto.
