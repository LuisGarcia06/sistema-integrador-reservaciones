# DEV-DB-02 - Inicializacion controlada de desarrollo
Fecha: 15 de octubre de 2026, America/Cancun.

## Resultado y limite actual
Esquema y seeds inicializados exclusivamente en sian_kaan_reservaciones_dev. Un tour y seis reservaciones sinteticas confirmados. Cuatro usuarios ficticios creados con claves aleatorias por autorizacion posterior del usuario. Las claves se entregan mediante un archivo cifrado para su usuario de Windows y un visor local.
Solo existe el login PostgreSQL postgres, confirmado por consulta y por el usuario. Es superusuario. Se uso temporalmente para mantenimiento autorizado; no se persistio su password en configuracion de desarrollo. El arranque real rechazo esa cuenta antes de escuchar HTTP. No se abrio Electron. Se necesita una cuenta limitada autorizada para habilitar su ejecucion; crear o modificar roles globales queda fuera de esta tarea.

## Identidad verificada antes de escribir
| Propiedad | Resultado |
| --- | --- |
| Base | sian_kaan_reservaciones_dev |
| Host / direccion | localhost / ::1/128 |
| Puerto | 5432 |
| Esquema | public |
| Usuario de mantenimiento | postgres |
| Version | 18.3 |
| Identificador del cluster | 7632825987452064788 |
La comprobacion inicial uso BEGIN READ ONLY y default_transaction_read_only=on. Se confirmo ausencia de relaciones, funciones, tipos, extensiones de usuario y esquemas adicionales. El guard actual tambien comprueba servidores/wrappers externos, publicaciones, triggers de evento y otros objetos de catalogo.
psql 18 ejecuto schema.sql y seeds.sql con -X, ON_ERROR_STOP=1 y --single-transaction. En esa misma conexion y transaccion se repitieron usuario, base, direccion local, puerto, esquema, version, cluster y vacio. Un fallo aborta y revierte. No hubo fallos SQL ni reparaciones mediante eliminacion.

## Esquema y catalogos
18 tablas, 18 PK, 18 FK y 15 CHECK, todos validados en catalogos. Columna usuarios.alcance_plataformas NOT NULL, default selected, CHECK all/selected. Puente usuario_plataformas_visibles con PK (id_usuario,id_plataforma) y FK a usuarios/plataformas.
Tablas: `bitacora`, `daily_observaciones`, `equivalencias_tours_externos`, `eventos_integracion`, `guias`, `integracion_sync_estado`, `operaciones_tour`, `operadores`, `paises`, `plataformas`, `reservaciones`, `reservas_integracion_link`, `roles`, `tours`, `transportes_operacion`, `usuario_plataformas_visibles`, `usuarios`, `vehiculos`.
Seeds confirmados: roles Administrador y Consulta; plataformas FareHarbor, GetYourGuide, WhatsApp Business y Externa; pais No especificado. No se agrego Booking Directo. IDs resueltos por nombre y RETURNING.
No se ejecutaron la migracion 016 ni migraciones anteriores: schema.sql ya incluye ACCESS-SCOPE.

## Datos sinteticos
Tour activo: Tour DEV-DB-01. Hotel Sintetico DEV, clientes ficticios, pickup 08:00, turno Manana explicito (almacenado con su acento), ninos=0, total=100, deposito=0, saldo=100. Sin telefonos, importaciones, operaciones ni asignaciones automaticas.
| Codigo | Fecha | Plataforma | PAX | Estado |
| --- | --- | --- | ---: | --- |
| DEV-GYG-001 | 2026-10-15 | GetYourGuide | 2 | Pendiente |
| DEV-FH-001 | 2026-10-15 | FareHarbor | 3 | Pendiente |
| DEV-WA-001 | 2026-10-15 | WhatsApp Business | 4 | Pendiente |
| DEV-EXT-001 | 2026-10-15 | Externa | 2 | Pendiente |
| DEV-GYG-HIST | 2020-01-05 | GetYourGuide | 1 | Pendiente |
| DEV-FH-CAN | 2026-10-15 | FareHarbor | 1 | Cancelada |
Los registros vigentes e historico se validaron como altas Pendiente, conforme al validator. El fixture cancelado se inserto con estado final Cancelada y motivo sintetico. No hay catalogo separado de estados; Dashboard reconoce Pendiente, Confirmada y Activa como vigentes.
La fecha de prueba esta fijada en 2026-10-15; al abrir otro dia, seleccionarla expresamente. Las metricas del dia actual pueden ser distintas.

## Usuarios y contrasenas
| Correo | Rol | Alcance almacenado | Asignaciones |
| --- | --- | --- | --- |
| admin.dev@example.test | Administrador | all | Ninguna asignacion |
| consulta.all.dev@example.test | Consulta | all | Ninguna asignacion |
| consulta.selected.dev@example.test | Consulta | selected | FareHarbor, GetYourGuide |
| consulta.empty.dev@example.test | Consulta | selected | Ninguna asignacion |
El usuario autorizo sustituir la captura manual por generacion automatica y solicito recibir las claves. Se generaron cuatro claves distintas de 32 caracteres con RandomNumberGenerator (24 bytes aleatorios por clave). Se guardaron como PSCredential mediante Export-Clixml: cifrado DPAPI para el usuario Windows actual en esta maquina. Se comprobo recuperacion exacta y ausencia de texto plano en el archivo. Los hashes bcryptjs de coste 12 solo estan en PostgreSQL. Las claves se transmitieron por stdin al proceso local, sin argumentos, logs o informes.
El aprovisionamiento usa una transaccion, verifica nuevamente destino/esquema, bloquea usuarios/asignaciones para evitar concurrencia y rechaza cualquier cuenta ya existente. No hace upsert ni cambia cuentas. Las asignaciones se insertan con parametros e IDs consultados. Administrador almacena all, con acceso efectivo completo por rol.

## Configuracion y arranque protegido
Configuracion exclusiva: .access-scope-lab/dev-db-02/config.env. Selecciona localhost:5432/sian_kaan_reservaciones_dev, JWT independiente y GYG_GMAIL_SYNC_ENABLED=false. No contiene DB_USER ni DB_PASSWORD. Se solicitan en cada arranque. El archivo y evidencias estan excluidos por /.access-scope-lab/ y por las exclusiones existentes del empaquetado.
ACL verificadas: usuario Windows actual y SYSTEM; los archivos heredan esas reglas de la carpeta nueva. No se modificaron ACL de otras carpetas.
El lanzador construye un entorno con lista permitida de variables Windows, descarta variables DB/PG/JWT/proveedores y NODE_OPTIONS heredadas y fija APP_CONFIG_PATH. Rechaza roles elevados y membresias privilegiadas. No carga .env como alternativa en el arranque de la aplicacion.
Electron activa el modo optativo APP_DEV_DB02=1 desde el lanzador y usa un perfil separado. En este modo comprueba que 3000 no tenga listeners, crea exclusivamente su propio backend y espera una confirmacion IPC con nonce aleatorio. No reutiliza respuestas HTTP de salud. El backend valida su pool PostgreSQL efectivo y ACCESS-SCOPE antes de bind/listen. Si falla, no hay ventana; si el backend propio termina, Electron se cierra. No se agrego un endpoint de metadatos.
El backend de desarrollo importa server.js sin ejecutar su bloque main: no inicia el worker. Bloquea rutas de integraciones, HTTP/HTTPS/fetch/HTTP2 salientes y sockets TCP distintos de PostgreSQL local. No hay credenciales externas en el entorno. GYG_GMAIL_SYNC_ENABLED=false no se usa como unica barrera.
Sin APP_DEV_DB02 el flujo normal de Electron conserva su comportamiento. No se cambiaron .env, backend/config/database.js ni configuraciones productivas persistentes.

## Comandos manuales
Desde PowerShell o la terminal de VS Code:
```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\DevDb02.ps1 -Modo Electron
```
Este comando esta preparado, pero actualmente se detiene si se introduce postgres. No eludir el rechazo ni usar npm run desktop para esta prueba. Una cuenta limitada y sus permisos requieren autorizacion aparte; este script no crea roles ni modifica ACL PostgreSQL.
Las cuatro cuentas ya estan creadas. No volver a ejecutar el modo Usuarios; rechaza cuentas existentes. El modo de captura manual sigue disponible para otro entorno expresamente preparado:
```powershell
.\scripts\DevDb02.ps1 -Modo Usuarios
```
Para repetir las verificaciones sin introducir claves ni mostrarlas, descifrar temporalmente el archivo local:
```powershell
.\scripts\DevDb02.ps1 -Modo VerificarGuardadas
```
No volver a ejecutar inicializarDevDb02.cjs sobre esta base: rechaza la base no vacia. No usar crearUsuarioPrueba.js ni las suites para bases _test.

## Pruebas y comprobaciones
170 pruebas aisladas aprobadas, 0 fallos, 5 suites. PostgreSQL real bloqueado mediante noPostgres. Incluyen destino incorrecto, esquema incompleto, credenciales heredadas, privilegios, puertos ocupados en Windows, IPC/nonce, salida de proceso, apertura/cierre de Electron simulado, bloqueo de proveedores y middleware de autorizacion.
Prueba con proceso backend real: DEV_BACKEND_REJECTED / DEV_PRIVILEGED_ROLE_FORBIDDEN; rechazo esperado=true. El pool real conecto a desarrollo y rechazo postgres antes de importar/servir la aplicacion. No inicio listeners HTTP ni Electron.
33 verificaciones adicionales aprobadas con PostgreSQL real, handlers y middleware de las rutas registradas. Transporte en proceso, sin listener HTTP ni GUI: no equivale a prueba de login mediante la interfaz Electron.
| Perfil | Login | Sesion | Reservas listadas | Vigentes en fecha | PAX vigentes |
| --- | ---: | ---: | ---: | ---: | ---: |
| admin.dev@example.test | 200 | 200 | 6 | 4 | 11 |
| consulta.all.dev@example.test | 200 | 200 | 6 | 4 | 11 |
| consulta.selected.dev@example.test | 200 | 200 | 4 | 2 | 5 |
| consulta.empty.dev@example.test | 200 | 200 | 0 | 0 | 0 |
Oracle SQL inicial para 2026-10-15: 4 vigentes / 11 PAX globales. Selected debe ver 2 vigentes / 5 PAX; selected vacio, 0/0. Listado sin filtros: 6 globales, 4 de plataformas seleccionadas, 0 para selected vacio; incluye historico y cancelada. Las comprobaciones calculan metricas por SQL antes de comparar.
Los fallos iniciales de la prueba de puerto revelaron el comportamiento de bind comodin de Windows. Se corrigio con inventario de listeners y comprobacion de direcciones concretas. Se corrigio tambien la herencia de ACL y el cierre sin diagnostico de la primera consola. Las ejecuciones finales indicadas son las aprobadas.

## Archivos y evidencias
Modificado: electron/main.js (solo modo de desarrollo optativo).
Creados: scripts/devDb02.cjs; scripts/inicializarDevDb02.cjs; scripts/usuariosDevDb02.cjs; scripts/verificarDevDb02.cjs; scripts/backendDevDb02.cjs; scripts/arrancarDevDb02.cjs; scripts/DevDb02.ps1; backend/__tests__/devDb02.test.js; docs/DEV-DB-02.md.
Generados bajo .access-scope-lab/dev-db-02/: config.env, perfil Electron, before.json, initialization.json, schema-seeds.txt, database-verification.json, runtime-guard.json, protected-state.json, unit-tests.json y estados/informes de captura cuando correspondan. No publicar config.env.

## Estado protegido y pendientes
Base principal: solo SELECT en conexiones con default_transaction_read_only=on y transaccion READ ONLY, para comparar metadatos de estructura; nunca escrituras ni lectura de datos personales. Huella de estructura conservada=true. .env conservado=true. La huella estructural no pretende ser un checksum de todos los datos.
No se utilizo Git. No se instalaron dependencias ni software, no se crearon bases o roles globales, no se modifico el cluster, no se restauro ningun respaldo y no se ejecutaron APIs externas ni instaladores.
Pendiente: cuenta PostgreSQL limitada autorizada; arranque positivo de Electron/Express y prueba GUI/HTTP con esa cuenta. Ambas bases comparten cluster: esto no ofrece aislamiento fisico. La base principal sigue sin actualizarse a ACCESS-SCOPE y no se declara preparada para produccion.

## Entrega de credenciales autorizada
Archivo cifrado: .access-scope-lab/dev-db-02/usuarios-dev.credentials.clixml. Solo el usuario Windows actual, en este equipo, puede recuperarlas mediante DPAPI; las ACL del archivo permiten usuario actual y SYSTEM. Archivo excluido de empaquetado y control de versiones. No editar ni publicar su contenido. No se incluyen contrasenas en este documento.
Se abrio una ventana local del visor para entregar los correos y sus claves al usuario. Puede cerrarla al terminar y volver a consultarlas con:

```powershell
.\scripts\DevDb02.ps1 -Modo MostrarClaves
```

La consola de captura anterior se cerro y no quedan procesos de aprovisionamiento, backend ni Electron iniciados por estas pruebas. El visor de claves es una ventana local de entrega al usuario.
Estado final: cuatro usuarios, seis reservaciones, dos asignaciones de plataforma, cuatro hashes bcrypt de coste 12; 33 comprobaciones con PostgreSQL real y 170 pruebas aisladas aprobadas.

## Continuación completada: DEV-DB-03

El bloqueo histórico descrito arriba quedó resuelto el 15 de octubre de 2026 mediante la creación autorizada del rol limitado sian_kaan_dev_app. La configuración independiente ahora incluye DB_USER; la contraseña PostgreSQL se recupera de un archivo local cifrado con DPAPI. Express y Electron desde fuentes se verificaron con las cuatro cuentas ficticias: 174 pruebas aisladas y 14 comprobaciones integradas aprobadas, además de 16 comprobaciones de aislamiento.

El comando vigente de desarrollo es:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\DevDb03.ps1 -Modo Electron
```

Los detalles de permisos, aislamiento, claves, pruebas y límites están en [DEV-DB-03](DEV-DB-03.md). El texto anterior conserva el estado histórico al cerrar DEV-DB-02.
