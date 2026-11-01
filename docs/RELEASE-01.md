# RELEASE-01 — Auditoría de preparación para producción

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 16 de octubre de 2026. **Alcance:** diagnóstico, sin intervención productiva.  
**Directorio:** `A:\sistema-integrador-reservaciones`.  
**Repositorio:** https://github.com/LuisGarcia06/sistema-integrador-reservaciones  
**Rama local:** `GYG+FRHB-implementado`.  
**Commit examinado:** `23d9ea21c04070aba3a49fd212d6a3106276c3a2`.

## 1. Resumen ejecutivo

**Resultado: NO-GO para comenzar operaciones con datos reales.** Hay una base funcional amplia, diseño aprobado y regresión automatizada satisfactoria, pero faltan controles de configuración, una cuenta PostgreSQL de operación, calificación del instalador actual, preparación de datos y aceptación de la empresa. Este dictamen no significa que las funciones probadas estén averiadas: significa que todavía no existe evidencia suficiente de una instalación y operación seguras.

Hallazgos principales:

1. **Comprobado:** `.env` contiene valores configurados para contraseña PostgreSQL y secreto JWT; sus permisos heredados permiten `Modify` a `Authenticated Users` y lectura a `BUILTIN\Usuarios`. No se imprimieron sus valores. Es necesario restringir el acceso y evaluar sustitución de los secretos antes del uso real. No se demuestra que alguien los haya utilizado indebidamente.
2. **Comprobado en configuración, privilegios actuales no consultados:** la ejecución habitual apunta a `sian_kaan_reservaciones` con `DB_USER=postgres`. La autorización histórica para usar esa cuenta fue temporal y para pruebas. Existe un rol limitado de desarrollo documentado, pero no una cuenta de operación productiva acreditada.
3. **Comprobado en código:** Electron normal reutiliza un backend por respuesta HTTP de salud, sin verificar su identidad de ambiente/base. También hereda variables de entorno que pueden prevalecer sobre `config.env`. Los lanzadores protegidos de laboratorio sí tienen controles adicionales; eso no acredita la ruta instalada normal.
4. **Pendiente:** los 35 casos humanos del instalador siguen sin ejecutar. El instalador histórico revisado no está firmado y no acredita el código actual con BRANDING terminado.
5. **Comprobado en esta auditoría:** **692 pruebas aprobadas en 35 suites, cero fallos y cero pendientes**, con PostgreSQL bloqueado y proveedores simulados. `api.test.js` fue excluida porque prepara y limpia una base persistente.
6. **Pendiente:** restauración operativa vigente, primer Administrador seguro, inicialización desde los datos ficticios actuales, aceptación por la empresa y decisión del alcance inicial de GetYourGuide/FareHarbor.

La prioridad propuesta es **RELEASE-03 primero**, por la protección de credenciales y el contrato de configuración que necesitará el instalador; después RELEASE-02, RELEASE-04 y RELEASE-05. No se inició ninguna de esas etapas.

## 2. Método, evidencia y límites

Se leyó `AGENTS.md` y se inspeccionaron fuentes actuales, rutas, servicios, validadores, frontend, Electron, SQL, configuración de empaquetado, suites y documentación. Git se utilizó únicamente en lectura: estado inicialmente limpio, rama y commit indicados arriba. No se consultó ni actualizó el remoto durante esta auditoría; la afirmación de publicación de BRANDING procede del cierre existente y del contexto confirmado por el usuario.

Convenciones de este informe:

- **Comprobado:** observado en fuentes/configuración/metadatos actuales o en la ejecución aislada de esta fase.
- **Histórico:** ejecución registrada en un informe anterior, con su alcance y fecha; no se repitió contra PostgreSQL.
- **Potencial:** consecuencia posible de un comportamiento observado, sin incidente reproducido en operación.
- **No verificado:** requiere una máquina, cuenta, autorización o prueba operativa que esta fase no ejecuta.

Evidencia local, excluida de Git por `.access-scope-lab/`:

- `.access-scope-lab/release-01/baseline.json`: SHA-256 inicial de los 343 archivos rastreados.
- `.access-scope-lab/release-01/jest-results.json` y `jest.log`: resultados de la regresión aislada.
- `.access-scope-lab/release-01/verification.json`: resumen, suites y comparación de archivos rastreados.
- `.access-scope-lab/release-01/env-acl-summary.json`: únicamente grupos amplios y permisos de `.env`, sin contenido del archivo.

No se abrió una conexión a PostgreSQL, no se leyeron tokens OAuth/DPAPI ni se probaron credenciales. Se inspeccionaron solo campos de configuración no sensibles y presencia de valores sensibles, sin revelarlos. No se evaluó mediante explotación la seguridad del equipo ni se hizo una auditoría de vulnerabilidades de todas las dependencias. No se levantó la aplicación habitual contra la base principal.

## 3. Arquitectura verificada

| Capa | Implementación actual | Evidencia y evaluación |
|---|---|---|
| Escritorio | Electron, proceso principal y preload | `electron/main.js`, `electron/preload.js`; inicia Express como proceso hijo usando el ejecutable Electron con `ELECTRON_RUN_AS_NODE=1`. |
| Interfaz | HTML, CSS y JavaScript | `frontend/`, router, vistas y componentes; variables corporativas centrales y logo oficial. No requiere cambiar el stack. |
| API | Express, controladores, servicios, validadores y middleware | `backend/server.js`, `backend/routes/`, `backend/controllers/`, `backend/services/`. Rutas `/api`; escucha normal en `127.0.0.1:3000`. |
| Datos | PostgreSQL mediante `pg` | Conexión central en `backend/config/database.js`; frontend sin acceso directo a PostgreSQL. |
| Integraciones | Gmail para GYG; HTTP y webhook para FH | Directorios separados en `backend/integrations/`; eventos, vínculos, equivalencias y estado de sincronización persistentes. |
| Impresión | HTML/CSS y motor Electron | Daily PDF y documento individual; sin biblioteca adicional de PDF. |

Versiones fijadas actualmente en `package-lock.json`: Electron **43.4.1**, electron-builder **26.15.3**, Express **5.2.1**, pg **8.23.0**, bcryptjs **3.0.3**, jsonwebtoken **9.0.3**, dotenv **17.4.2**, googleapis **105.0.0**, @google-cloud/local-auth **2.1.0**, Jest **30.5.2**, supertest **7.3.0**. El binario local de Electron declara también 43.4.1. Esto identifica lo examinado; no certifica ausencia de vulnerabilidades ni que esas versiones sean las más recientes.

Protecciones existentes: sandbox y context isolation activados, `nodeIntegration=false`, bloqueo de ventanas/navegación ajenas, IPC con validación del emisor, CSP y cabeceras de seguridad; validación de permisos en backend. `GET /` confirma que Express responde, **no** que PostgreSQL esté disponible ni que la base sea la correcta.

## 4. Estado funcional y nivel real de validación

Clasificación: **IP** = implementado y probado dentro del alcance indicado; **IV** = implementado, validación operativa pendiente; **PAR** = parcial; **NI** = no implementado; **FA** = fuera del alcance actual. Una marca IP no equivale a aceptación productiva.

| Funcionalidad | Estado y evidencia actual | Validación que falta para lanzamiento |
|---|---|---|
| Login y autenticación | IP: bcrypt, JWT, consulta del usuario activo en cada petición; `auth.service.js`, `auth.middleware.js`, rutas de sesión y suites de permisos. | Credenciales propias de operación, caducidad/recuperación, fallos de BD y uso en equipo instalado. |
| Administrador | IP: acciones de escritura protegidas por rol; usuarios y operaciones restringidos en API. | Recorrido completo por personal autorizado y separación de usuarios Windows. |
| Consulta all | IP: alcance resuelto en backend, lectura sin escritura; suites ACCESS-SCOPE y sesiones. | Aceptación de los módulos/impresiones permitidos en instalación real. |
| Consulta selected | IP: lista explícita de rutas y filtro por plataformas; detalle no visible devuelve 404; denegación de rutas fuera de alcance. | Cada conjunto real de plataformas, usuario sin plataformas y revocación entre sesiones instaladas. |
| ACCESS-SCOPE | IP: relectura de permisos, limpieza visual y comprobaciones de IPC/PDF; pruebas actuales e informes `PROD-ACCESS-02B`, `DEV-DB-03`. | Firma de aceptación de los tres perfiles; no cambiar la política durante el lanzamiento. |
| Dashboard | IP: resumen dinámico, filtros por alcance y render con API ficticia. | Totales contrastados con una jornada sintética conocida y luego aceptación de empresa. |
| Reservaciones: alta, edición, cancelación | IP: rutas/validadores/servicios, transacciones y bitácora; pruebas aisladas y evidencia histórica de DB. | Recorrido económico y operativo completo; concurrencia real, validación de formatos/importes y cancelación por empresa. |
| Búsquedas y filtros | IP: filtros parametrizados, validación, alcance y UI. | Volumen representativo, fechas límites, acentos y búsqueda habitual de operadores. |
| Historial | IP: vista y consultas de reservaciones por filtros; política de alcance conservada. | Confirmación de periodos, visibilidad y procedimiento de consulta por empresa. |
| Usuarios | IP: CRUD administrativo, cambio de contraseña, alcance, protección del último Administrador y de autodesactivación. | Primer Administrador desde una BD inicializada y recuperación por pérdida total de acceso. |
| Configuración y catálogos | IV: rutas/servicios y pantallas de tours, países, plataformas, guías, operadores y vehículos. | Catálogos iniciales aprobados y CRUD completo contra ambiente aislado persistente; no todos tienen una suite específica. |
| Operaciones y transporte | IP: grupos explícitos por fecha/tour/turno/número, asignaciones manuales y sugerencias. | Jornada completa, cambios simultáneos, reubicaciones y errores con PostgreSQL real aislado. |
| Capacidad | IP: máximo 12 por grupo/transporte, 24 por tour/fecha/turno y capacidad del vehículo; bloqueos y validación en servicios. | Concurrencia real entre dos sesiones/usuarios; no basta una simulación de `FOR UPDATE`. |
| Daily | IP: agrupación y datos existentes, observaciones y permisos. | Conciliación de una jornada completa, reservaciones sin asignar y cierre operativo. |
| Daily PDF | IP: carta horizontal, 11 columnas y branding aprobado; generación Electron y validaciones de permisos. | Archivo guardado mediante diálogo nativo real y prueba con impresora elegida. |
| Impresión individual | IP: carta vertical, economía/cliente/tour/estado/observaciones y cancelación; fixtures largos. | Impresión física, escala/márgenes y aceptación operativa. |
| Bitácora | IP: modificaciones de reservaciones y auditoría en la misma transacción. | Política de consulta/retención/exportación; no constituye por sí sola un registro completo de seguridad del sistema. |
| Manejo de errores | PAR: validaciones HTTP, errores de servicios, escucha de error del Pool y errores de inicio/configuración. | Recuperación visible ante caída del hijo, tiempos de espera, diagnóstico persistente y reinicio de Windows. |
| Recuperación total de acceso / primer usuario productivo | NI: no hay flujo productivo acreditado de bootstrap ni recuperación sin Administrador. El cambio de contraseña por Administrador sí existe. | Procedimiento seguro, autorizado, trazable y ensayado. |
| Instalación, actualización y desinstalación aceptadas | IV: configuración NSIS y payload histórico probado. | Casos manuales de máquina limpia, actualización y retirada. |
| WhatsApp Cloud API | FA: deshabilitado deliberadamente por código y sin rutas montadas. | Mantener bloqueo; conservar procedencia/catálogo WhatsApp Business. |

Fuentes funcionales: `backend/routes/*.routes.js`, `backend/services/{reservaciones,operaciones,transportes,capacidad,daily,dashboard,usuarios,bitacora}.service.js`, `backend/validators/`, `backend/middleware/`, `frontend/js/{auth,api,router,layout}.js`, `frontend/pages/` y suites detalladas en la sección 8.

Observación de especificación: `README.md:59` dice que canceladas o completadas no cuentan para capacidad. `capacidad.service.js` excluye explícitamente `Cancelada`; las sugerencias operativas usan estados activos definidos en su servicio. La actualización de `estado` en `reservaciones.validator.js:461` acepta texto no vacío, sin enumeración equivalente. **La discrepancia de documentación es comprobada; no se reprodujo un sobrecupo ni se decidió cambiar reglas.** Antes de aceptar operación, confirmar estados soportados, transiciones y efecto en capacidad, incluido si «Completada» realmente pertenece al flujo.

## 5. PostgreSQL, credenciales y recuperación

### 5.1 Configuración y separación de ambientes

| Elemento | Observación | Interpretación |
|---|---|---|
| `.env` habitual | `localhost:5432`, `sian_kaan_reservaciones`, usuario `postgres`; contraseña/JWT presentes; GYG deshabilitado. | No es una configuración final autorizada para producción. No se probó autenticación ni se consultaron privilegios actuales. |
| DEV protegido | Configuración separada para `sian_kaan_reservaciones_dev` y `sian_kaan_dev_app`. | `DEV-DB-03.md` acredita históricamente rol limitado y aislamiento; no trasladar permisos sin revisar necesidades productivas. |
| Prueba principal protegida | Lanzador `ProdAccessTest` y perfil/configuración propios; excepción temporal con `postgres`. | `PROD-ACCESS-02B.md` acredita pruebas, no habilitación productiva. |
| Instalado normal | `%APPDATA%`/`app.getPath('userData')` más `config.env`; se exige presencia de seis claves. | Sin asistente de aprovisionamiento/ACL acreditado ni comprobación de base/rol efectivo. |

**ACL comprobada de `.env`:** permisos heredados `Authenticated Users: Modify, Synchronize` y `BUILTIN\Usuarios: ReadAndExecute, Synchronize`. El riesgo incluye lectura de secretos y alteración del destino de conexión. No se modificaron ACL; no se asegura que todos los demás archivos privados tengan el mismo permiso. Los almacenes DPAPI y permisos restringidos del laboratorio documentados en DEV no protegen automáticamente este `.env` ni el futuro `config.env` instalado.

En `electron/main.js:190`, `buildBackendEnvironment()` copia `process.env` completo y agrega `APP_CONFIG_PATH` al empaquetado. `backend/config/database.js` carga dotenv sin `override`; el código de dotenv conserva valores ya existentes. Por tanto, un `DB_NAME`, `DB_USER` o secreto heredado puede prevalecer sobre el archivo validado. `validatePackagedConfig()` verifica texto no vacío; no demuestra conectividad, identidad, rol mínimo ni que un valor entre comillas represente una cadena útil.

En `electron/main.js:231`, la ruta normal acepta el backend ya presente si su salud coincide. No hay comprobación de propietario, versión, ambiente o identidad PostgreSQL. **La reutilización es comprobada; conectarse accidentalmente a una base distinta es un riesgo potencial, no un incidente ocurrido en esta fase.** Los controles de `scripts/devDb02.cjs` y `scripts/prodAccessTest.cjs` no se deben asumir activos en el instalador, y permanecieron intactos.

### 5.2 Cuenta mínima y protección necesarias

Preparar posteriormente una cuenta de ejecución exclusiva, sin superusuario, creación de roles/bases, replicación ni propiedad del esquema; separar instalación/migración de ejecución. Definir permisos explícitos por tabla, columna y secuencia según funciones aprobadas, sin otorgar `ALL` generalizado. Si se incluyen integraciones, revisar también escrituras en eventos, vínculos, equivalencias y checkpoints.

`DEV-DB-03.md` acredita un rol limitado funcional de desarrollo, pero sus permisos deliberadamente restringidos de integración no deben copiarse como solución productiva completa. Verificar denegación efectiva de DDL y acceso al ambiente ajeno, uso con la app y rotación de credenciales, sin publicar contraseñas. Elegir custodio, cuenta Windows, ACL, almacenamiento y recuperación. No se implementó ni ejecutó nada de esta propuesta.

JWT no tiene secreto de respaldo incrustado; las contraseñas de usuarios se comparan con bcrypt y las nuevas se almacenan con hash. El token del frontend permanece en memoria, con revalidación de sesión y limpieza al salir. Falta acordar política de contraseñas, expiración, intentos abusivos y recuperación; no se identificó limitación de intentos en la ruta de login. No se acredita MFA ni un flujo de contraseña olvidada.

### 5.3 PostgreSQL 18, integridad y fallos

- Evidencia **histórica** en `DEV-DB-03.md` y `PROD-ACCESS-02B.md`: funcionamiento con PostgreSQL **18.3**, pruebas de roles y aplicación de ACCESS-SCOPE. Esto respalda compatibilidad observada, sin certificar otras instalaciones ni el estado actual del servidor.
- `schema.sql`: 18 tablas; identidades en 17 tablas y clave compuesta en `usuario_plataformas_visibles`; claves foráneas, unicidades y checks. Capacidad agregada y auditoría se controlan también en servicios/transacciones; no son una restricción SQL global de suma de PAX.
- `reservaciones.service.js`: creación, actualización, cancelación y asignación con transacciones/bitácora; columnas dinámicas acotadas y valores parametrizados. Código de reservación aleatorio con unicidad y reintentos. No es una certificación exhaustiva de todo SQL o concurrencia en producción.
- `database.js` mantiene Express disponible cuando falla una conexión ociosa del Pool. No configura explícitamente timeout de conexión/consulta, SSL o presupuestos de espera. En un despliegue remoto deberán definirse cifrado y red; el actual apunta a loopback.
- Electron normal registra la salida del backend, pero no demuestra recuperación automática ni un aviso operativo suficiente. La salud de Express no acredita salud de DB. Reinicio de PostgreSQL/Windows y fallo de proceso siguen pendientes en la instalación real.

### 5.4 Migraciones, respaldos y restauración

Existen migraciones `001` a `016`; el esquema consolidado ya contiene sus estructuras finales. No se encontró un registro automático de versiones aplicadas. Varias migraciones tienen transformaciones/precondiciones y no son idempotentes: **no aplicar toda la carpeta sobre `schema.sql` ni repetir 016 a ciegas**. README enumera solo 001–007 en sus pasos iniciales y luego advierte específicamente que una base nueva ya incluye ACCESS-SCOPE; se necesita un procedimiento único y actualizado.

`PROD-ACCESS-02B.md` registra que **016 fue aplicada** a la base principal después de respaldo y ensayo de restauración. Esta evidencia es posterior al pendiente que aparece en documentos antiguos de 05A; no se afirma que 016 siga pendiente. El estado actual deberá comprobarse por inventario autorizado antes de cualquier futuro cambio.

Hay evidencia histórica de `pg_dump` en formato custom y restauración ensayada en un clúster aislado, con comprobación de tablas, claves y secuencias. Ese respaldo pequeño y sus tiempos no determinan RTO/RPO de operación real. **No se generó ni restauró un respaldo nuevo en RELEASE-01.**

Faltan política y responsables: frecuencia y retención, cifrado, copia fuera del equipo, monitor de fallo, custodia de claves, RPO/RTO aceptados y simulacro periódico. Un dump de la base no resuelve por sí solo roles globales, configuración de PostgreSQL, permisos Windows, JWT u OAuth. Una restauración con `--no-owner --no-acl` tampoco acredita la recuperación de privilegios. PostgreSQL describe las opciones en [respaldo](https://www.postgresql.org/docs/18/backup.html) y el tratamiento de objetos globales en [pg_dumpall](https://www.postgresql.org/docs/18/app-pg-dumpall.html).

## 6. Instalador y operación Windows

### 6.1 Configuración y artefactos comprobados

- `package.json`: electron-builder/NSIS, Windows **x64**, asistente (`oneClick=false`), instalación por usuario (`perMachine=false`), directorio no seleccionable. ARM/x86 no están calificados.
- Incluye Electron, frontend, backend y dependencias; ASAR con backend/frontend/node_modules desempaquetados. Excluye `.env`, configuraciones locales, secretos, respaldos, SQL, scripts, documentos y pruebas.
- PostgreSQL **no está incluido**; el servidor debe instalarse/configurarse de forma independiente o existir un destino autorizado. El operador instalado no necesita Node/npm del entorno de desarrollo: el hijo utiliza el runtime Electron. Para construir sí se requiere el entorno de desarrollo compatible; el paquete npm de Electron declara Node >=22.12.
- Configuración por usuario fuera del paquete; datos de negocio en PostgreSQL. Actualizar o retirar Electron no debe limpiar la base ni perder el archivo de configuración; debe probarse esa conservación.
- Instalador histórico presente: `.access-scope-lab/05a-build-7703bfb9a1eb/Sistema-Integrador-Reservaciones-1.0.0-x64.exe`, **106439091 bytes**, SHA-256 **`596b86a5760fa7dbea4c386f0f130ded4c1a10da54bac2da97fc06999e9497f0`**, coincidente con 05A. `Get-AuthenticodeSignature` consultado ahora devuelve **NotSigned**.
- También existe un ejecutable en `dist/` y otros builds locales con versión 1.0.0. No fueron ejecutados. No hay un instalador actual calificado que enlace inequívocamente versión, commit, checksum y aprobación BRANDING final. README ya advierte que `dist/` puede estar desactualizado.

`ACCESS-SCOPE-05A.md` acredita **64 comprobaciones del payload extraído**, ASAR inspeccionado y pruebas con Electron/Express/PostgreSQL de aquella fase. No equivale a instalar mediante NSIS. `ACCESS-SCOPE-05A-aceptacion.md` declara **35 casos PENDIENTES**. `ACCESS-SCOPE-05B-preparacion.md` preparó el plan, sin ejecutar la VM/aceptación.

Equipo observado mediante lecturas locales: Windows 10 Home Single Language, 10.0.19045, x64, aproximadamente 19.8 GiB RAM; espacio libre aproximado A: 334.1 GiB y C: 30.4 GiB. `HypervisorPresent=false`; las consultas de disponibilidad de `VBoxManage`, `vmrun` y `Get-VM` no encontraron esos comandos. Esto **no acredita** que no exista ninguna alternativa de virtualización. No se creó una VM ni se habilitaron características de Windows.

El soporte general de Windows 10 terminó el 14 de octubre de 2025; no se verificó cobertura ESU del equipo. La elección de un Windows mantenido o cobertura aplicable es una decisión previa de despliegue, según [Microsoft](https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/windows-10-support-has-ended-on-october-14-2025). No se inventa un mínimo de hardware: falta medir el instalador y una jornada representativa en el equipo objetivo.

### 6.2 Validación pendiente y condiciones del laboratorio

| Prueba | Estado real | Condición/evidencia necesaria |
|---|---|---|
| Máquina limpia, asistente, accesos directos y primer arranque | No ejecutada como aceptación | VM/equipo independiente autorizado, Windows/licencia, snapshot y fixture sintético. |
| Configuración ausente/incompleta | Probada históricamente en payload | Repetir con instalador actual; comprobar ACL por usuario y destino efectivo. |
| Puerto ocupado y backend ajeno | Riesgo observado en código | Probar rechazo/identificación inequívoca; no aceptar solo el texto de salud. |
| Dos perfiles Windows, dos sesiones y aislamiento | Pendiente | Cuentas de laboratorio, archivos protegidos y políticas de instancia/puerto. |
| Caída/reinicio de PostgreSQL y backend | Prueba parcial histórica | Usuario entiende el fallo, no hay corrupción ni duplicados y existe recuperación definida. |
| Reiniciar Windows y volver a abrir | Pendiente | Servicio PG listo/configurado, procesos sin huérfanos y configuración preservada. |
| Guardar PDF con diálogo real e imprimir | Motor PDF probado; aceptación nativa pendiente | Destino real de guardado, cancelación, cambios de permiso y una impresora autorizada. |
| Actualizar versión previa | Pendiente | Versión anterior calificada, copia de seguridad, conservación de datos/configuración y reversión ensayada. |
| Desinstalar/reinstalar | Pendiente | Conservar PostgreSQL/configuración según política; procesos y accesos directos correctos. |
| Firma/SmartScreen y distribución | Binario histórico sin firma; comportamiento no probado | Decidir canal y política de firma; observar avisos reales. No prometer ausencia de SmartScreen por firmar. |

No hay autoactualizador, servicio Windows ni arranque automático de Electron configurados en el proyecto. La operación propuesta es apertura manual; PostgreSQL necesita su propia estrategia de inicio. No se exige agregar un autoactualizador para el primer lanzamiento: puede usarse una actualización manual controlada y documentada.

## 7. Integraciones: evidencia separada por proveedor

### 7.1 GetYourGuide

**Clasificación:** preparación técnica y pruebas mediante mocks; autorización/configuración y aceptación real pendientes. **No se acredita operación actual con credenciales reales.**

| Aspecto | Implementación verificada | Límite o requisito real |
|---|---|---|
| Cliente y obtención | `getyourguideGmail.service.js`: Gmail API y lectura de correos; parser de mensajes. | No es un cliente directo de la API de reservaciones GetYourGuide. Definir que Gmail será el canal aprobado. |
| Autenticación | OAuth Google, alcance `gmail.readonly`, renovación y persistencia de tokens. | Cuenta empresarial, consentimiento y acceso autorizados; no se probaron tokens. |
| Configuración instalada | Rutas por defecto `process.cwd()/secrets/credentials.json` y `gmail-token.json`; la función admite opciones. | El worker usa valores por defecto; no hay aprovisionamiento productivo externo por usuario acreditado. El paquete excluye `secrets/`. |
| Secretos | JSON local, combinación de refresh token y sanitización de diagnósticos. | El servicio no impone DPAPI/ACL. Definir almacenamiento seguro; los fallos de persistencia del listener no tienen alarma operativa acreditada. |
| Sincronización | Worker con flag, intervalo por defecto 120 s, history/checkpoint, recuperación por history inválido, paginación/lotes y backoff de cuota por defecto 900 s. | Flag local inspeccionado: `false`. No se activó ni se llamó a Gmail. Validar reinicios, cuotas y cuenta efectiva. |
| Mapeo | Parser, normalización, equivalencias externas, diferencias de modificación. | Ensayar formatos reales autorizados, idioma, zona horaria, importes y cambios de plantilla. |
| Duplicados | Unicidad de eventos por proveedor/ID y vínculos de reserva; persistencia y estado. | Reentregas, orden alterado y recuperación con DB real aislada y luego proveedor autorizado. |
| Altas/cambios/cancelaciones | `getyourguideReservationApplication.service.js`: revisión/aprobación y aplicación transaccional de los tres tipos. | No es una incorporación automática sin revisión. Aceptar quién revisa y cómo se concilia. |
| Errores/reintentos | Diagnósticos sanitizados, recuperación y backoff; suites Gmail/parser/sync/aplicación. | Responsables de incidencias, visibilidad de retrasos y reconciliación operativa pendientes. |

Tener scripts de prueba real no acredita que hayan pasado con una cuenta empresarial vigente. RELEASE-01 no ejecutó esos scripts ni evaluó la autenticidad de correos reales.

### 7.2 FareHarbor

**Clasificación:** cliente, webhook, normalización y aplicación preparados técnicamente y probados con mocks; contrato/autorización/configuración y aceptación con proveedor pendientes. **No se acredita que esté operativa con credenciales reales.**

| Aspecto | Implementación verificada | Límite o requisito real |
|---|---|---|
| HTTP/autenticación | `fareharbor.client.js`: URL base obligatoria, claves App/User por cabeceras y consulta de compañías/reserva. | En configuración local inspeccionada, URL/claves/compañía no están configuradas. No se usó una URL supuesta ni se llamó al proveedor. |
| Recepción | Dos alias POST montados en `server.js`; JSON limitado a 256 kb; autenticación con `key` y secreto configurado. | Servidor normal en loopback. Falta diseñar/autorizar el receptor público, TLS, accesos y contrato real del webhook si se necesita. |
| Seguridad del webhook | Rechaza clave ausente/incorrecta y configuración sin secreto; secreto local presente, sin mostrarlo. | Se transporta la clave en query. Evaluar registro de URLs, rotación y mecanismo admitido por proveedor antes de exponerlo; no se comprobó un túnel o despliegue externo. |
| Obtención y sincronización | Consulta HTTP disponible y eventos a partir del payload recibido. | No hay worker periódico FH. Persistir el webhook no implica que se haya consultado la reserva actual al proveedor. |
| Mapeo y duplicados | Mapper, fingerprint, eventos/vínculos con unicidad y revisión administrativa. | Validar payload/versiones contractuales, reentregas y eventos fuera de orden con datos autorizados. |
| Altas/cambios/cancelaciones | Servicios separados de aplicación, preview/diff y transacciones/auditoría. | Aceptación de moneda, equivalencias, estados, rechazo y conflictos simultáneos. |
| Errores/reintentos | Distingue errores de red y estados 400/403/404/429/5xx; pruebas simuladas. | El cliente no implementa un timeout explícito con AbortController ni ciclo de retry/backoff; acordar recuperación antes de operación dependiente de FH. |

### 7.3 WhatsApp

`backend/config/whatsapp.js` exporta `Object.freeze({ habilitado: false })`. `server.js` no carga ni monta rutas WhatsApp; servicios/controladores tienen guardas y las suites de deshabilitación pasan. Una variable de entorno heredada no lo reactiva. La plataforma **WhatsApp Business** se conserva en seeds/catálogo como procedencia de captura manual/histórica.

La eliminación anterior de la app Meta fue declarada por el usuario en el cierre GitHub; RELEASE-01 no accedió a Meta ni certifica configuraciones externas. El lanzamiento debe conservar el bloqueo actual, sin incorporar secretos históricos o activar servicios. No se reactivó ni eliminó código.

**Decisión de alcance:** la empresa debe decidir si GYG/FH son requisito del día uno. Es viable evaluar un lanzamiento de captura manual con integraciones sin activar, pero exige aceptación explícita del flujo y de que no existe sincronización operativa acreditada. Si los proveedores son requisito inicial, sus validaciones se vuelven bloqueadores de ese lanzamiento.

## 8. Pruebas actuales, ejecución segura y vacíos

Inventario: **36 archivos `*.test.js`** en el alcance del proyecto: 33 en `backend/__tests__`, dos en `backend/integrations/getyourguide/__tests__` y uno en `scripts`. Se ejecutaron **35 suites / 692 pruebas**, todas aprobadas, cero pendientes. Se excluyó únicamente `backend/__tests__/api.test.js`.

Aislamiento aplicado al proceso Jest: entorno permitido y sintético, `NODE_ENV=test`, `APP_CONFIG_PATH=NUL`, host `invalid.test`, nombre de DB sintético, JWT de prueba, GYG deshabilitado y `--setupFiles=./backend/__tests__/helpers/noPostgres.js`. Este helper sustituye `pg.Pool` y rechaza consultas/conexiones reales; las suites inyectan sus DB/clientes falsos. Se ejecutó en un solo proceso con `--runInBand --no-cache --runTestsByPath` y resultados JSON locales. No se utilizó `npm test` sin selección.

| Área | Evidencia de esta ejecución | Qué no demuestra |
|---|---|---|
| Permisos y usuarios | 97 pruebas de rutas ACCESS-SCOPE, 40 de alcance de reservaciones, 24 de usuarios/alcance y escenarios frontend/IPC. | Configuración de cuentas reales, aislamiento Windows ni UAT. |
| Reservaciones/operaciones | 42 de validadores, ocho de capacidad y escenarios transaccionales de integraciones/acceso. | Concurrencia real de PostgreSQL, jornada completa ni todo CRUD de catálogos. |
| Proveedores | Gmail/parser/sync y aplicación GYG; cliente/mapper/webhook/diff/aplicación FH; persistencia inyectada. | Autorización del proveedor, contratos vigentes, red ni procesamiento real. |
| Electron y frontend | `brandingScreens`, `frontendScope`, `printBranding`: renderer/IPC/motor Electron reales, API sintética y perfiles temporales. | Instalación NSIS, diálogo humano de guardado, impresora o Windows limpio. |
| Ambientes/errores | Suites `devDb02`, `devDb03`, `prodAccess02b`, `databaseErrors`. | Ejecución actual contra bases principal/dev ni creación de roles. |
| WhatsApp | Guardas de servicio/controlador y `whatsappDisabled`. | Estado de una cuenta externa Meta. |

Los tres helpers visuales usan servidor ficticio en loopback/puerto efímero, sin iniciar `backend/server.js` productivo. La ejecución actual confirma los tests, sin sustituir la aprobación visual previa: `BRANDING-05.md` registra 38 capturas en dos resoluciones y seis PDF sintéticos, once páginas en total, revisados en el cierre de identidad. Daily: 1/2/4 páginas según escenario; individual: 1/1/2 páginas. Las antiguas notas de aprobación pendiente de BRANDING-03/04 quedaron superadas por el cierre BRANDING-05 y la aprobación del usuario.

`api.test.js` carga `.env.test`; `helpers/testDatabase.js` comprueba nombre `_test` y `current_database()`, pero también ejecuta limpieza con `TRUNCATE ... RESTART IDENTITY CASCADE`. No se contó con una base desechable verificada para repetirla. **No ejecutarla sobre principal ni DEV compartida**, ni suponer que el sufijo sustituye el aislamiento comprobado.

Vacíos pendientes: API end-to-end persistente en clúster desechable, carreras de capacidad/transacciones, carga representativa y tiempos, disco sin espacio, pérdida de energía/red, reinicio Windows, actualizaciones/reversión, impresión física, alertas/respaldo y aceptación humana. No se generó cobertura porcentual nueva ni auditoría de dependencias; no se afirma que estén certificadas.

## 9. Propuesta de preparación de datos — sin ejecución

El usuario confirmó que la base principal contiene datos **ficticios** y desea reconstruir reservaciones, usuarios, tours y configuración operativa desde cero. La evidencia histórica de cantidades de filas describe ensayos anteriores, no un inventario actual. Esta sección propone un procedimiento; **no autoriza limpieza, una base nueva ni SQL destructivo**.

### 9.1 Inventario y dependencias del esquema actual

| Grupo | Tablas | Dependencias y tratamiento propuesto |
|---|---|---|
| Roles mínimos | `roles` | Administrador y Consulta; conservar/recrear por nombre bajo plan aprobado. No suponer IDs fijos. |
| Identidad y acceso | `usuarios`, `usuario_plataformas_visibles` | Usuarios dependen de roles; puente depende de usuarios/plataformas. Eventos y bitácora pueden referir usuarios. Recrear cuentas propias y permisos explícitos. |
| Catálogos | `tours`, `paises`, `plataformas`, `vehiculos`, `operadores`, `guias` | Reservaciones y operaciones los referencian; equivalencias dependen de tours. Definir datos reales de catálogo antes de capturar. |
| Operación | `operaciones_tour`, `transportes_operacion`, `reservaciones`, `daily_observaciones` | Reserva → transporte → operación → tour/guía; transporte → vehículo/operador. Observación Daily por fecha. |
| Integración y estado técnico | `eventos_integracion`, `reservas_integracion_link`, `equivalencias_tours_externos`, `integracion_sync_estado` | Vínculos referencian reservas; eventos referencian revisores/aplicadores; checkpoint y deduplicación afectan reimportación. Acordar fecha de corte y conciliación. |
| Auditoría | `bitacora` | Referencias a usuarios/reservaciones; archivar prueba con el respaldo y decidir conservación separada. No eliminarla tácitamente. |

Catálogos mínimos del `seeds.sql`: roles Administrador/Consulta, país «No especificado» y plataformas FareHarbor/GetYourGuide/WhatsApp Business/Externa. No crea tours ni un primer Administrador. Validar con empresa cuáles conservar y agregar; la procedencia WhatsApp Business puede seguir siendo necesaria sin Cloud API.

### 9.2 Secuencia propuesta para RELEASE-05

1. Aprobar por escrito destino, inventario, responsables, ventana sin usuarios/proveedores, datos ficticios a retirar, conservación y mecanismo de reversión.
2. Generar respaldo nuevo identificado por fecha/hash fuera de Git; preservar por separado roles/permisos/configuración y secretos con custodia restringida. Restaurarlo en destino aislado y comprobar relaciones, secuencias y acceso antes de autorizar el corte.
3. Elegir entre reinicialización controlada del destino existente y una base nueva. Son alternativas pendientes; ninguna se creó. Exigir autorización específica para la elegida, sin reutilizar la autorización de esta auditoría.
4. Para una base nueva, usar el esquema consolidado validado y seeds mínimos. Para una existente, inventariar estructura y migraciones; no repetirlas indiscriminadamente. Preparar un procedimiento revisable y ensayarlo primero sobre copia ficticia.
5. Si se elige limpieza en sitio, definir orden por claves: vínculos/bitácora y referencias de eventos antes de reservas/usuarios; reservas antes de transportes; transportes antes de operaciones; operaciones/equivalencias antes de tours; puente de alcance antes de usuarios/plataformas. Acordar también observaciones, checkpoints y eventos. No usar borrado en cascada como sustituto de ese inventario.
6. Mantener integridad y atomicidad del procedimiento aprobado. Las identidades requieren decidir reinicio/conservación; no reasignar IDs con vínculos externos activos ni cambiar secuencias sin control. Verificar ausencia de huérfanos, unicidades, próximos IDs y capacidad.
7. Crear el primer Administrador por un mecanismo dedicado, autenticado y sin contraseñas en código/logs; establecer credenciales propias y recuperación. No usar como bootstrap productivo `scripts/crearUsuarioPrueba.js`, que crea/actualiza identidades ficticias y carga `.env` directamente.
8. Cargar tours y catálogos aprobados; usuarios/perfiles y plataformas visibles; guías, operadores, vehículos, turnos y grupos según reglas existentes. Hacer una validación controlada cuya información de prueba no quede mezclada con la operación inicial.
9. Para GYG/FH, acordar corte/importación y vínculos/checkpoints para no reintroducir información ficticia o duplicar reservas al reiniciar. Mantener proveedores sin activar hasta autorización expresa y criterios propios cumplidos.
10. Registrar aceptación del estado inicial, respaldo posterior y checklist de reversión; habilitar operación solo cuando todos los bloqueadores estén cerrados.

No se adjuntan comandos de limpieza ni se creó un script que los ejecute.

## 10. Preparación operativa y decisiones de la empresa

Antes de instalar definitivamente deben acordarse:

- Equipo Windows mantenido/licenciado, responsable local y disponibilidad de laboratorio independiente; ubicación de PostgreSQL (el diseño actual es local), inicio del servicio, red si aplica, almacenamiento y acceso físico.
- Alcance del primer día: captura manual o proveedores activos; propietario de cuenta Gmail, autorizaciones FH y responsable de revisar/aplicar eventos. No asumir conectividad entrante al escritorio.
- Administrador principal y suplente, política de contraseñas, recuperación sin acceso, separación de cuentas Windows y quién puede consultar datos económicos/operativos conforme a los permisos existentes.
- Tours, turnos explícitos, tarifas/divisas/tipo de cambio, países, plataformas, guías, operadores y vehículos con capacidad hasta 12; confirmar el significado operativo de estados y cancelaciones.
- Frecuencia de respaldo, RPO/RTO, destino fuera del equipo, cifrado, custodia, responsable de restaurar y prueba periódica; requisitos de conservación y acceso a datos de clientes, PDF y bitácora.
- Versionado, distribución/firma aceptada, política de actualización/reversión y persona que autoriza las ventanas. No distribuir indistintamente los varios archivos 1.0.0 existentes.
- Impresora, papel carta, orientación por documento, destino/custodia de PDF y aceptación de impresión; los permisos actuales se conservan.
- Capacitación y responsable de soporte: contacto, horario, datos de diagnóstico permitidos, severidades y seguimiento de incidentes.

Flujo diario a ensayar: abrir y comprobar ambiente/fecha → login/perfil → revisar/capturar reservas → validar PAX/pagos/pickups → preparar grupos y transporte sin autoasignar → conciliar Dashboard/Daily → revisar cambios/cancelaciones y bitácora → exportar/imprimir → comprobar respaldo/cierre. Ensayar también Consulta all/selected y revocación durante una sesión.

Contingencia pendiente de aceptación: registro manual numerado con los mínimos datos necesarios, acceso restringido, anotación de hora/responsable y conciliación posterior con búsqueda de duplicados. Ante caída, no cambiar de base o ejecutar limpieza para «resolver» el problema. Registrar diagnóstico sin secretos, identificar el destino, recuperar por procedimiento y comunicar qué reservas necesitan conciliación. No hay un mecanismo offline de captura/replicación implementado.

## 11. Matriz de riesgos y prioridades

P0: bloquea lanzamiento o riesgo crítico. P1: resolver antes de datos reales. P2: mejora para estabilidad. P3: puede posponerse. Los pendientes condicionados a integraciones solo bloquean un lanzamiento que dependa de ellas.

| ID | Área | Hallazgo | Evidencia | Riesgo | Prioridad | Acción | Criterio de aceptación |
|---|---|---|---|---|---|---|---|
| R01 | Secretos locales | **Comprobado:** `.env` con secretos configurados y ACL amplia | Lectura ACL; resumen privado de esta fase | Lectura o alteración por otros usuarios locales; no hay abuso demostrado | P0 | Restringir ACL, definir custodia y evaluar/realizar sustitución autorizada de secretos | Solo cuenta responsable/SYSTEM/admin autorizados acceden; credenciales finales nuevas o revisión explícita de exposición, sin alterar otros ambientes |
| R02 | Lanzamiento | **No verificado:** instalación actual y aceptación humana | 35 casos pendientes; 05A/05B; ausencia de build actual calificado | Fallos de instalación/actualización o configuración sin detectar | P0 | Calificar instalador actual en laboratorio y aceptación empresarial | Artefacto único por commit/hash, M01–M35 ejecutados o excepciones justificadas aprobadas; cero bloqueadores |
| R03 | PostgreSQL | **Configuración comprobada:** uso habitual de `postgres`; privilegios actuales no consultados | `.env`, `database.js`, excepción histórica PROD-ACCESS-02B | Privilegios excesivos y contaminación de ambientes | P1 | Cuenta operativa mínima y propietario/migrador separado | App completa funciona; DDL y acceso ajeno denegados; credenciales propias protegidas |
| R04 | Ambiente | **Código comprobado; consecuencia potencial:** reutilización por salud y herencia DB_* | `electron/main.js:190,231`; dotenv sin override | Operar sobre destino/configuración diferentes a los aprobados | P1 | Definir y verificar identidad/propiedad/configuración efectiva del backend normal | Colisiones/ambiente ajeno fallan de forma clara; destino y rol comprobados en instalador |
| R05 | Recuperación | **Histórico parcial:** dump/restauración de prueba; operación continua no acreditada | PROD-ACCESS-02B, sin respaldo nuevo en esta fase | Pérdida de trabajo o imposibilidad de recuperar acceso/datos | P1 | Política, copia externa protegida, alerta y restauración integral | Simulacro completo con roles/configuración, RPO/RTO medidos y responsable |
| R06 | Datos iniciales | **Decisión confirmada, ejecución pendiente:** limpiar datos ficticios y recrear usuarios/tours | Solicitud; esquema de 18 tablas/seeds sin Administrador | Borrado no reversible, FK rotas o arranque sin acceso | P1 | Ensayar propuesta, backup restaurable y autorización específica | Estado inicial aprobado, integridad, Administrador y catálogos verificados; reversión posible |
| R07 | Esquema | **Comprobado:** SQL consolidado + migraciones no idempotentes; guía inicial incompleta | schema.sql, 001–016, README:91–101/141 | Reaplicar cambios sobre estructura final | P1 | Manifiesto y guía diferenciada nueva/existente | Inicialización y actualización ensayadas sin duplicar cambios; versión acreditada |
| R08 | Primer acceso | **No implementado:** bootstrap productivo y recuperación total documentada | Seeds, usuarios.routes, crearUsuarioPrueba.js | Bloqueo de administración o uso de usuarios ficticios | P1 | Mecanismo dedicado y procedimiento de recuperación | Primer admin seguro, suplencia y recuperación probados sin credenciales incrustadas |
| R09 | Reglas/UAT | **Discrepancia comprobada:** estados/capacidad; aceptación operativa pendiente | README:59, capacidad.service, validador estado, casos pendientes | Interpretaciones incompatibles al operar | P1 | Acordar estados y ejecutar jornada/finanzas/concurrencia | Resultado esperado firmado por empresa; reglas y documentación coherentes |
| R10 | GYG | **Pendiente condicionado:** OAuth/ruta instalada/aceptación proveedor | Gmail service/worker; flag local false; mocks | Sin importar eventos o exponer tokens al aprovisionar | P1 si día uno | Canal aprobado, secretos fuera del paquete y ensayo autorizado | Alta/cambio/cancelación/reinicio/cuota/duplicados aceptados, sin secretos en logs |
| R11 | FareHarbor | **Pendiente condicionado:** configuración/receptor/timeout/contrato real | cliente, webhook loopback, tests mocks | Entregas ausentes, requests detenidas o receptor mal protegido | P1 si día uno | Acordar receptor y límites; probar con proveedor solo tras autorización | Entrega segura y conciliación de eventos, fallos/reintentos/idempotencia aceptados |
| R12 | Windows | **Comprobado:** Windows 10; cobertura de soporte no verificada | Metadatos OS y ciclo de vida Microsoft | Operación en plataforma sin mantenimiento acreditado | P1 | Elegir equipo mantenido o acreditar cobertura aplicable | Plataforma/licencia/actualizaciones y recursos aceptados en prueba |
| R13 | Caídas | **Parcial:** salud no verifica DB y no hay recuperación visible completa | server.js, database.js, main.js | App abierta sin servicio útil; diagnóstico lento | P1 | Ensayar caídas, definir tiempos y recuperación para operador | No corrupción/duplicados, mensaje comprensible y restauración comprobable |
| R14 | Distribución | **Comprobado:** artefacto histórico sin firma, varios 1.0.0 | package.json, firma/hash consultados | Confundir builds y avisos de confianza | P1 | Artefacto trazable y política de distribución/firma | Empresa acepta canal y avisos reales; checksum/commit/versionado y rollback definidos |
| R15 | Acceso abusivo | **No identificado en código:** límite de intentos de login | auth.routes/middleware, dependencias | Ataques locales repetidos; API no expuesta por defecto a Internet | P2 | Definir amenaza y endurecimiento proporcionado | Política y ensayos de abuso sin denegar servicio a operadores |
| R16 | Soporte y privacidad | **Parcial/no verificado:** bitácora de negocio, sin operación de logs/alertas/retención acreditada | Servicios y consola del proceso | Incidencias sin detectar o datos personales en evidencia operativa | P2 | Logs redactados, retención, custodia de PDF, manual y soporte | Diagnóstico útil sin secretos, responsables y procedimiento practicados |
| R17 | Dependencias | **No verificado:** seguridad del árbol actual | Lock/versiones, sin análisis de vulnerabilidades en esta fase | Vulnerabilidades o fin de soporte no detectados | P1 | Revisar avisos oficiales y árbol antes de fijar release, sin instalar cambios a ciegas | Riesgos relevantes evaluados/cerrados y versiones de artefacto registradas |
| R18 | Evolución | **No implementado:** autoactualizador, captura offline, API directa GYG | Empaquetado y fuentes actuales | Expectativas de funciones que hoy no existen | P3 | Mantener fuera del alcance inicial salvo decisión contraria | Manual de operación declara alcance y actualización manual aceptada |

## 12. Bloqueadores, dependencias y decisiones pendientes

Bloquean el uso real: R01/R02 y los P1 de configuración/rol, recuperación, datos iniciales/acceso, reglas/aceptación, plataforma y distribución. No se sustituye el cierre de un P1 con una prueba unitaria. R10/R11 dependen del alcance que acepte la empresa. WhatsApp debe seguir fuera del alcance; su catálogo no se elimina.

Dependencias técnicas: proteger secretos antes de aprovisionar/configurar → establecer cuenta/destino y contrato de configuración → construir y calificar el instalador → aceptación empresarial con datos sintéticos → respaldo restaurado y autorización de inicialización → corte y operación. La empresa debe asignar responsables, laboratorio/equipo, canal de proveedores, RPO/RTO, alcance inicial y criterio de aceptación.

Pueden posponerse el autoactualizador, captura offline, integración directa API GYG, MFA si el análisis de acceso lo permite y mejoras de telemetría avanzada. No pueden posponerse la recuperación básica, custodia de credenciales, respaldo comprobado ni los controles ACCESS-SCOPE existentes.

## 13. Plan propuesto RELEASE-02 a RELEASE-05

**Orden recomendado: RELEASE-03 → RELEASE-02 → RELEASE-04 → RELEASE-05.** Se cambia el orden de referencia por dos dependencias comprobadas: la ACL actual expone configuración sensible y el instalador necesita un contrato seguro de cuenta/destino/configuración para poder calificarse. Se pueden preparar fixtures/documentación de RELEASE-02 mientras tanto, pero no se inicia ninguna fase aquí.

### RELEASE-03 — Seguridad, PostgreSQL, credenciales y respaldos

- **Objetivo:** cerrar R01/R03/R04/R05/R07/R08 y definir la base segura de operación.
- **Actividades:** revisar custodia y ACL, sustitución controlada de secretos, cuenta mínima por ambiente y migrador separado, comprobación de identidad/configuración efectiva del backend, procedimiento de primer Administrador/recuperación, manifiesto de esquema y política de respaldo/restauración. Revisar dependencias y plataforma soportada antes de congelar versión.
- **Componentes:** configuración privada externa, `backend/config/database.js`, `electron/main.js`, documentación de despliegue y SQL de privilegios/bootstrap que se prepare y revise; no alterar lanzadores protegidos ni ACCESS-SCOPE por defecto.
- **Dependencias:** responsables/cuentas/destino autorizados, respaldo previo si hay intervención en PG, laboratorio independiente y alcance inicial de integraciones.
- **Riesgos:** perder acceso al rotar secretos, otorgar permisos excesivos o insuficientes, apuntar al ambiente equivocado, invalidar sesiones. Separar cada ambiente y prever reversión.
- **Pruebas:** ACL con otra cuenta Windows, denegación de permisos/acceso ajeno, flujo completo con rol mínimo, colisión de backend/entorno heredado, bootstrap y restauración aislada con configuración/roles.
- **Aceptación:** cero uso runtime de superusuario, secretos protegidos, destino inequívoco, acceso recuperable y restauración repetible con RPO/RTO acordados; ningún permiso funcional ampliado.
- **Autorizaciones:** nueva fase; cambios de credenciales/ACL explícitamente delimitados; creación/grants de rol PG y cualquier escritura, backup/restore o modificación de aplicación requieren alcance aprobado. No implica limpiar datos ni activar proveedores.

### RELEASE-02 — Instalador y pruebas controladas Windows

- **Objetivo:** producir y calificar un artefacto actual identificable, cerrar R02/R12/R14 y verificar R13.
- **Actividades:** preparar VM/equipo limpio, Windows autorizado y snapshots; construir desde commit definido, revisar payload sin secretos, política de versión/firma, instalar, reiniciar, actualizar, revertir y desinstalar/reinstalar conservando datos/configuración según lo acordado.
- **Componentes:** `package.json`, `package-lock.json`, Electron/preload, paquete y manuales `ACCESS-SCOPE-05A*`/`05B-preparacion` como lista inicial, fixture exclusivamente sintético.
- **Dependencias:** contrato de configuración/roles de RELEASE-03, plataforma mantenida, laboratorio y versión anterior calificada para probar actualización.
- **Riesgos:** ejecutar un build antiguo, contaminación del host/base principal, pérdida de config, avisos de Windows y procesos huérfanos. Laboratorio independiente y evidencia por hash/commit.
- **Pruebas:** M01–M35, instalación sin Node de desarrollo, backend/puerto, DB ausente/caída, dos usuarios Windows, guardado PDF, impresión, reinicio, actualización y rollback/desinstalación.
- **Aceptación:** artefacto trazable; casos ejecutados con evidencia y sin bloqueadores; excepciones ajenas al alcance justificadas y aprobadas; datos/config/PG preservados conforme al contrato. Firma según política decidida y avisos documentados.
- **Autorizaciones:** generar/ejecutar instalador, instalar software/habilitar virtualización o crear VM y usar licencia; imprimir y escribir solo al destino de laboratorio. Ninguna intervención productiva implícita.

### RELEASE-04 — Operación y aceptación de la empresa

- **Objetivo:** comprobar que los flujos implementados sirven a la operación real y cerrar R09 y las integraciones incluidas.
- **Actividades:** jornada sintética representativa y capacitación; validar estados, importes, turnos, grupos 1/2, límites 12/24, vehículo/guía/operador, edición/cancelación, búsquedas, Daily, impresión y bitácora; incidentes, respaldo y contingencia manual.
- **Componentes:** módulos existentes, instalador calificado, catálogos ficticios representativos, matriz de roles y manual operativo.
- **Dependencias:** RELEASE-03/02 aceptados, personas designadas y decisión explícita del alcance GYG/FH. Si se incluyen, autorización separada del proveedor/cuenta/receptor y datos de prueba.
- **Riesgos:** modificar reglas para acomodar un caso sin decisión, confundir mocks con proveedor o mezclar datos reales/prueba. Registrar expectativa y evidencia por caso.
- **Pruebas:** Administrador, Consulta all, selected con/sin plataformas, cambio de permiso en sesión/PDF; dos sesiones concurrentes; finanzas y capacidad en PostgreSQL aislado; PDF/impresión física; fallos y conciliación. Proveedor solo cuando se autorice.
- **Aceptación:** aprobación de responsables de la empresa, cero P0/P1 del alcance elegido, manual y contingencia comprendidos; diseño corporativo aprobado conservado.
- **Autorizaciones:** participación de empresa, equipo/impresora de prueba y cuentas/proveedores si aplica; no autoriza limpiar principal.

### RELEASE-05 — Estado inicial, instalación y puesta en marcha

- **Objetivo:** inicializar datos y cuentas aprobados, instalar la versión calificada y realizar un corte reversible.
- **Actividades:** inventario final, respaldo nuevo con restauración demostrada, autorización específica de limpieza o nuevo destino, inicialización conforme a sección 9, primer Administrador y catálogos, verificación de permisos/identidad, acta GO y acompañamiento de primera jornada.
- **Componentes:** base/destino aprobado, procedimiento revisado de inicialización, configuración restringida, artefacto calificado, runbooks y respaldo.
- **Dependencias:** RELEASE-02/03/04 aceptados, ventana sin actividad, responsables y reversión disponibles; alcance de proveedores cerrado.
- **Riesgos:** pérdida irreversible de prueba, FK/secuencias inválidas, acceso bloqueado, reimportación de eventos viejos y confundir el destino. Ensayo previo e identificación antes de cada acción.
- **Pruebas:** integridad, cuentas/plataformas/catálogos, contadores iniciales acordados, acceso de perfiles, persistencia y backup, controles de impresión, recuperación y conciliación inicial. No dejar reservas sintéticas mezcladas con operación real.
- **Aceptación:** autorización de datos específica, respaldo restaurable, cero P0/P1, firma de aceptación y registro de versión/configuración no sensible; soporte y contingencia disponibles.
- **Autorizaciones:** expresas para limpieza o creación de BD, migraciones si fueran necesarias, alta de usuarios y configuración, instalación definitiva y activación individual de proveedores. Ninguna se deduce de RELEASE-01.

## 14. Dictamen y siguiente actividad

1. **Listo para continuar preparación:** código actual con regresión aislada satisfactoria, identidad corporativa aprobada, módulos centrales y controles ACCESS-SCOPE implementados, motor PDF y evidencia visual existente.
2. **Necesita validación:** flujos completos persistentes/concurrentes, catálogos y finanzas con aceptación de empresa, instalador/reinicios/actualización/desinstalación, impresora y proveedores incluidos en el alcance inicial.
3. **Bloquea lanzamiento:** secretos locales insuficientemente protegidos, ausencia de instalación actual aceptada y de preparación operativa/recuperación/datos iniciales cerrada.
4. **Antes de datos reales:** cuenta mínima, ambiente inequívoco, credenciales seguras, respaldo/restauración, acceso inicial y suplencia, plataforma/distribución trazables y UAT.
5. **Posponible:** autoactualizador, offline, API directa GYG y mejoras avanzadas fuera del alcance acordado; WhatsApp Cloud API permanece retirado.
6. **Decisiones empresariales:** equipo/laboratorio, custodios y usuarios, proveedores día uno, catálogos/reglas, RPO/RTO, retención, impresión, canal de distribución y soporte.
7. **Siguiente trabajo prioritario:** autorizar y delimitar **RELEASE-03**, comenzando por custodia/ACL de configuración y separación de cuenta/ambiente; después calificar el instalador en RELEASE-02.

**NO-GO para producción en el estado auditado.** Hay condiciones claras para seguir trabajando en laboratorio; no hay autorización de lanzamiento, limpieza o activación de integraciones. Se espera autorización de la siguiente fase.

## 15. Confirmación de restricciones y entrega

Se creó este informe y evidencia local de auditoría/pruebas. La comparación SHA-256 posterior a la ejecución confirmó los **343 archivos previamente rastreados sin cambios**; la comprobación final se conserva en `verification.json`. No se modificó código, diseño, PostgreSQL, reservaciones, ACCESS-SCOPE, catálogos, credenciales, ACL ni lanzadores protegidos.

No hubo conexiones a PostgreSQL ni llamadas reales a proveedores, sincronización, migraciones, limpieza, nuevos roles/bases, instaladores generados/ejecutados, instalación de software, commit, push, fetch ni modificación de historial. Git se consultó solo en lectura. La revisión de nombres rastreados no encontró `.env` privados, respaldos, DPAPI, ejecutables, `secrets/`, `node_modules/` o laboratorio entre los archivos versionados; `.env.example` seguro es la excepción prevista. Esta comprobación de rutas no sustituye una auditoría nueva de contenido/historial de secretos ni la revisión de payload de un futuro instalador.

**Archivo entregable:** `docs/RELEASE-01.md`. Evidencias de prueba/ACL permanecen en `.access-scope-lab/release-01/`, ignoradas por Git; no deben publicarse como datos de producción.
