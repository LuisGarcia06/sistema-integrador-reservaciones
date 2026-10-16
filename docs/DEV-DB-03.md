# DEV-DB-03 — Usuario PostgreSQL limitado y pruebas de Electron

Fecha de verificación: 15 de octubre de 2026. Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.

DEV-DB-03 completado para desarrollo. Se resolvió el bloqueo de arranque registrado en DEV-DB-02: Express y Electron desde fuentes funcionan con la cuenta limitada y las cuatro cuentas ficticias. No se declara la aplicación preparada para producción.

## 1. Rol creado y contraseña

Se confirmó primero que `sian_kaan_dev_app` no existía y se creó exclusivamente ese rol global, con LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION y NOBYPASSRLS. No tiene membresías ni es propietario de bases.

Se generó una clave exclusiva con 32 bytes criptográficamente aleatorios. Quedó cifrada mediante DPAPI en `.access-scope-lab/dev-db-02/postgres-dev.credentials.clixml`, recuperable por el usuario Windows actual en este equipo; ACL para dicho usuario y SYSTEM. No se cambió la contraseña de postgres.

Los dos intentos iniciales con `psql` y `\password` agotaron el tiempo y sus transacciones se revirtieron: el rol seguía ausente. El usuario autorizó expresamente sustituir ese mecanismo por SCRAM automatizado. El verificador SCRAM-SHA-256 se calculó en memoria y se transmitió mediante parámetros, con registro de parámetros deshabilitado en esa transacción. No se guardaron claves ni verificadores en argumentos, SQL persistido, informes o logs de la tarea. Se verificó la contraseña mediante una conexión autenticada real.

## 2. Privilegios concedidos

Todos los GRANT de objetos se aplicaron únicamente en `sian_kaan_reservaciones_dev`, esquema `public`. No se cambiaron ACL de otras bases ni de PUBLIC.

| Privilegio | Objetos |
| --- | --- |
| CONNECT | Base `sian_kaan_reservaciones_dev` |
| USAGE | Esquema `public` de desarrollo |
| SELECT | Las 18 tablas existentes de desarrollo |
| INSERT | usuarios, tours, paises, plataformas, vehiculos, operadores, guias, operaciones_tour, transportes_operacion, reservaciones, daily_observaciones, bitacora, usuario_plataformas_visibles |
| UPDATE de tabla | usuarios, tours, vehiculos, operadores, guias, operaciones_tour, transportes_operacion, reservaciones, daily_observaciones |
| UPDATE de columna | Solo `plataformas.id_plataforma` |
| DELETE | Solo `usuario_plataformas_visibles` |
| USAGE de secuencia | Las 12 secuencias de identidad de las tablas con INSERT; la tabla puente no utiliza secuencia |

Las 18 tablas son roles, usuarios, tours, paises, plataformas, usuario_plataformas_visibles, vehiculos, operadores, guias, operaciones_tour, transportes_operacion, reservaciones, daily_observaciones, eventos_integracion, reservas_integracion_link, equivalencias_tours_externos, integracion_sync_estado y bitacora. SELECT permite las lecturas existentes de aplicación y diagnóstico; las cuatro tablas de integración no recibieron permisos de escritura.

El UPDATE de columna en plataformas es necesario para el `SELECT ... FOR KEY SHARE` que ya utiliza la validación transaccional de asignaciones. No concede UPDATE de nombre ni de la tabla completa. No se concedieron propiedad, CREATE de esquema/base, TRUNCATE, administración ni privilegios sobre objetos futuros. USAGE permite las identidades con RETURNING; no se necesitó SELECT de secuencias. La matriz exacta y los nombres de secuencias constan en `grants.json`.

## 3. Aislamiento comprobado

Las 16 comprobaciones terminaron aprobadas con conexión autenticada como `sian_kaan_dev_app`: identidad, atributos, ausencia de membresías/propiedad, ausencia de CREATE, lectura sintética, INSERT con secuencia, UPDATE de reservación y DELETE de asignación. Las escrituras de comprobación se revirtieron por completo; las secuencias pueden avanzar aun con ROLLBACK y no se reiniciaron.

Se inspeccionaron los privilegios efectivos sobre relaciones, columnas, secuencias y funciones SECURITY DEFINER de las otras cinco bases no plantilla que admitían conexión. Ninguna ofreció acceso a tablas de aplicación, secuencias ni funciones SECURITY DEFINER propias a esta cuenta. No se intentó crear ni eliminar bases: la denegación se comprobó mediante atributos, ausencia de membresías y ausencia de propiedad, sin operaciones destructivas.

## 4. Acceso a datos empresariales

La cuenta puede establecer conexión a la base principal por el CONNECT preexistente de PUBLIC. Esto no concede acceso a sus datos. Las lecturas reales `SELECT 1 ... LIMIT 0` sobre usuarios y reservaciones principales fueron denegadas con SQLSTATE 42501; los privilegios efectivos de lectura y escritura sobre las demás tablas/columnas empresariales también resultaron ausentes.

PUBLIC conserva sus derechos previos de CONNECT y TEMPORARY; el rol puede acceder a catálogos PostgreSQL y a sus propios objetos temporales. No se presenta esto como aislamiento físico ni como imposibilidad de conectar. No se ejecutaron REVOKE ni cambios de permisos sobre la principal. Las comprobaciones de esa base utilizaron conexiones y transacciones de solo lectura.

## 5. Conexión y configuración

Identidad autenticada: PostgreSQL 18.3, localhost (::1), puerto 5432, base `sian_kaan_reservaciones_dev`, esquema public, rol `sian_kaan_dev_app`. Se confirmó el mismo identificador de clúster registrado en DEV-DB-02 y el esquema ACCESS-SCOPE existente: 18 tablas, columna alcance_plataformas y tabla puente con sus restricciones.

Se actualizó exclusivamente `.access-scope-lab/dev-db-02/config.env` para fijar DB_USER=sian_kaan_dev_app. Se conservaron DB_HOST=localhost, DB_PORT=5432, DB_NAME=sian_kaan_reservaciones_dev, JWT exclusivo y GYG_GMAIL_SYNC_ENABLED=false. El archivo no contiene DB_PASSWORD; el lanzador la recupera del archivo cifrado. La comunicación de datos sigue pasando por Express y el pool central existente.

## 6. Arranque protegido

Se reutilizó el mecanismo de DEV-DB-02 y se añadió la validación del usuario fijado en configuración. El entorno del hijo descarta credenciales DB/PG/JWT/proveedores y NODE_OPTIONS heredadas. APP_CONFIG_PATH señala exclusivamente la configuración de desarrollo.

Antes de escuchar, se valida destino, clúster, rol efectivo, ausencia de privilegios elevados y esquema ACCESS-SCOPE. El puerto 3000 debe estar libre. Electron crea su propio backend y espera su confirmación por IPC privado con nonce; no adopta un backend ajeno por su respuesta de salud. Ante discrepancias aborta. No se añadió un endpoint público de metadatos.

## 7. Express

Express inició con el pool real conectado a desarrollo como `sian_kaan_dev_app`. El endpoint de salud respondió HTTP 200. No apareció el error de alcance_plataformas. No se inició el worker de sincronización; las rutas de integración quedaron deshabilitadas con 503 y el arranque de pruebas bloqueó conexiones salientes a proveedores. No hubo solicitudes externas durante la prueba.

## 8. Electron

Electron 43.4.1 abrió desde el código fuente y mostró la pantalla de inicio de sesión. Se usaron el perfil separado y el backend propio de desarrollo. Se comprobaron sandbox, contextIsolation, webSecurity y ausencia de nodeIntegration.

La automatización utilizó temporalmente un inspector local para operar las ventanas reales y se cerró al terminar. Además, se ejecutó el comando normal de usuario sin depurador: salud 200, apertura satisfactoria y cierre normal. No se utilizó un instalador empaquetado.

Las capturas login.png, selected-reservaciones.png y selected-empty.png quedaron en la carpeta de evidencias; se inspeccionaron visualmente la pantalla de acceso y el listado limitado.

## 9. Cuatro perfiles ficticios

Todos iniciaron sesión mediante el formulario real y obtuvieron 200 en GET `/api/auth/sesion`.

| Cuenta | Rol / alcance | Reservaciones listadas | Vigentes el 2026-10-15 | PAX vigentes |
| --- | --- | ---: | ---: | ---: |
| admin.dev@example.test | Administrador / all | 6 | 4 | 11 |
| consulta.all.dev@example.test | Consulta / all | 6 | 4 | 11 |
| consulta.selected.dev@example.test | Consulta / selected | 4 | 2 | 5 |
| consulta.empty.dev@example.test | Consulta / selected vacío | 0 | 0 | 0 |

Administrador mostró los módulos administrativos y acceso completo a plataformas. Consulta all conservó sus módulos generales de lectura. Selected mostró solo Dashboard y Reservaciones, con FareHarbor y GetYourGuide; selected vacío mostró esos módulos sin datos y no adquirió acceso completo por omisión. El total del listado incluye la reservación histórica y la cancelada, a diferencia de las métricas vigentes del día.

## 10. Seguridad y pruebas

Resultado final: 174 pruebas aisladas aprobadas en 6 suites, 16 comprobaciones de aislamiento PostgreSQL y 14 comprobaciones integradas de Electron/HTTP/PostgreSQL, sin fallos en las ejecuciones finales.

Se comprobaron filtros y búsqueda por código; paginación con límite admitido 25, segunda página vacía y total conservado; rechazo 400 del límite no permitido 2; detalle autorizado 200; detalle oculto/inexistente 404; módulos excluidos 403; y POST de reservaciones bloqueado con 403 para las tres cuentas Consulta.

La revocación se probó en dos sesiones reales independientes: Administrador retiró FareHarbor de selected y su sesión ya abierta dejó de acceder al detalle (404). Al refrescar sesión, desaparecieron los datos y la opción de filtro revocados. Se restauraron después las dos asignaciones originales y se comprobó nuevamente la visibilidad. El cierre de sesión limpió token en memoria y datos de la interfaz.

La primera prueba posterior a crear el rol encontró una transacción de comprobación abierta en READ ONLY; se corrigió el ensayo de escritura para usar una transacción reversible en desarrollo. No se recreó ni cambió la contraseña del rol existente. También se corrigieron la espera de disponibilidad de Electron y el límite de paginación de la prueba. Los fallos históricos y el timeout inicial de psql se conservan como evidencia; las ejecuciones finales indicadas aquí son las aprobadas.

Las suites utilizaron el bloqueo noPostgres y rutas de prueba explícitas; no se ejecutaron suites destructivas para bases _test, TRUNCATE ni DROP. La prueba integrada utilizó únicamente los datos sintéticos existentes.

## 11. Archivos y evidencias

Creados en esta fase:

- scripts/devDb03.cjs: aprovisionamiento autorizado, aislamiento y estado final.
- scripts/DevDb03.ps1: recuperación cifrada y comandos de desarrollo.
- scripts/probarElectronDevDb03.cjs: prueba real de los cuatro perfiles y limpieza.
- backend/__tests__/devDb03.test.js: validaciones del usuario y entorno.
- docs/DEV-DB-03.md: este informe.

Modificados: scripts/devDb02.cjs y docs/DEV-DB-02.md. No se modificaron electron/main.js, backend/config/database.js, tablas, migraciones ni dependencias en esta fase.

Se actualizó la configuración independiente y se generó el archivo cifrado PostgreSQL. Las evidencias locales están bajo `.access-scope-lab/dev-db-03/`: preflight.json, grants.json, isolation.json, electron.json, normal-launch.json, final-state.json, unit-tests.json, protected-before.json, protected-after.json, protected-final.json y capturas. Los informes no contienen contraseñas ni tokens. La carpeta del laboratorio permanece excluida de Git y del empaquetado; no publicar config.env ni los archivos de credenciales.

## 12. Comando exacto de arranque

En PowerShell, con el mismo usuario Windows que creó el archivo cifrado:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\DevDb03.ps1 -Modo Electron
```

Este comando abre Electron y su Express protegido; no solicita ni muestra la clave PostgreSQL. PostgreSQL local debe estar iniciado y el puerto HTTP 3000 libre. Si se detecta un destino distinto o un proceso que ocupa el puerto, el arranque se detiene sin finalizar procesos ajenos. No usar el instalador ni sustituir este comando por el arranque general para estas pruebas.

Para consultar las cuatro contraseñas ficticias entregadas en DEV-DB-02, exclusivamente en la consola local:

```powershell
.\scripts\DevDb02.ps1 -Modo MostrarClaves
```

Para consultar el estado final sin mostrar claves ni escribir datos:

```powershell
.\scripts\DevDb03.ps1 -Modo EstadoFinal
```

No repetir Preparar, PrepararSCRAM ni la inicialización de DEV-DB-02: el rol y los datos ya existen. El aprovisionamiento rechaza un rol preexistente.

## 13. Limpieza y límites pendientes

Se cerraron exclusivamente los procesos iniciados por la tarea, incluido el arranque normal posterior. El puerto 3000 quedó sin listener. Se conservaron el servidor PostgreSQL, el rol nuevo, la base de desarrollo, sus cuatro usuarios, seis reservaciones, dos asignaciones restauradas y la configuración cifrada. daily_observaciones quedó sin filas de prueba.

No quedan bloqueos para este arranque de desarrollo. Ambas bases siguen compartiendo clúster y los derechos previos de PUBLIC siguen vigentes. DPAPI requiere este usuario/equipo. La validación se limita a los escenarios descritos; no es aceptación productiva ni prueba de instalador. Las integraciones reales, distribución y actualización de la base principal quedan fuera de esta fase.

## 14. Base principal y .env intactos

Las huellas de estructura/ACL y los recuentos de filas de la principal coincidieron antes y después; el hash de `.env` también coincidió. Todas las conexiones de inspección a la principal fueron de solo lectura. La comparación de recuentos no pretende ser un checksum de cada valor de sus filas.

No se cambiaron datos, esquema, permisos ni PUBLIC de la principal. La única creación global autorizada fue el rol nuevo. No se ejecutaron migraciones ni se aplicó la 016 a la principal; tampoco se crearon bases ni se restauraron respaldos.

## 15. Git

No se utilizó Git. No hubo comandos Git, commits, ramas ni cambios publicados. Tampoco se instalaron dependencias o software.
