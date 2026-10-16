# GITHUB-01 — Revisión y subida segura del proyecto

Fecha: 16 de octubre de 2026, America/Cancun.

## Resultado

**Publicación bloqueada por un secreto confirmado en el historial.** No se
ejecutaron git add, git commit ni git push. No se generó un commit nuevo.
Los avances existentes y la preparación documental permanecen en el directorio
de trabajo para revisión. No se modificó el índice ni se reescribió historial.

Se identificó un valor histórico de WHATSAPP_VERIFY_TOKEN en .env.example que
coincide exactamente con la variable del .env local actual. Su valor se omite
del informe y de las salidas de diagnóstico. La configuración vigente de
.env.example ya utiliza un marcador de ejemplo, pero eso no elimina versiones
anteriores. No se comprobó su vigencia ante Meta ni se llamó a proveedores.

La coincidencia está en historia que **ya existe en el remoto**. El rango
origin/GYG+FRHB-implementado..HEAD inicialmente contiene cero commits; no se
encontró un commit local adicional que volviera a introducir el secreto.
Se detuvo la publicación por el hallazgo confirmado y la instrucción de revisar
también commits antiguos, sin intentar resolverlo reescribiendo historia.

## Diagnóstico Git

- Proyecto: A:\sistema-integrador-reservaciones.
- Se leyó AGENTS.md antes del diagnóstico.
- origin, tanto fetch como push:
  https://github.com/LuisGarcia06/sistema-integrador-reservaciones.git.
- Rama activa y destino solicitado: GYG+FRHB-implementado.
- HEAD inicial y remoto consultado mediante git ls-remote --heads origin:
  181f05cfee74e5b42180509220770f806c78b99d.
- Referencia local origin/GYG+FRHB-implementado: el mismo hash.
- git rev-list --left-right --count HEAD...origin/GYG+FRHB-implementado: 0 / 0.
- Rama local Sistema-preintegracion: mismo commit y seguimiento de su rama remota.
- Rama local master: 36a4e9b, nueve commits por delante de su referencia local
  origin/master. No se incluye ni se publica esa rama; no se consultó su remoto real.
- Estado inicial: 32 archivos modificados, 66 nuevos, cero archivos en staging.
- No hubo divergencia con el destino en la consulta realizada. Un commit hijo
  de HEAD permitiría avance rápido si el remoto sigue igual; **no se creó ni
  se certificó una actualización final**, porque la publicación quedó bloqueada.
- La lectura remota funcionó. No se probó permiso de escritura ni autenticación
  para push; tampoco se cambiaron remotos, ramas o configuración Git.

## Revisión de seguridad

Se inventariaron 253 rutas candidatas: archivos rastreados y archivos nuevos
no ignorados. Se revisaron .gitignore, .env.example, package.json, README,
cambios existentes y documentación de ACCESS-SCOPE, DEV-DB y PROD-ACCESS.
Se analizaron patrones de claves privadas, tokens de proveedores, JWT literales,
URLs con credenciales y asignaciones de credenciales. Se compararon valores
sensibles locales con contenidos candidatos sin imprimirlos. Los literales
de las pruebas nuevas identificados por el escaneo son datos sintéticos o mocks;
las utilidades operativas leen credenciales externas o generan valores aleatorios.
No se ejecutaron esas utilidades para obtener datos reales.

La inspección histórica recorrió los 104 commits alcanzables desde HEAD y
530 blobs únicos. No encontró rutas históricas .env real, secrets/,
.access-scope-lab/, node_modules/, respaldos .dump/.backup, DPAPI .clixml/.dpapi
ni ejecutables .exe en esa historia. El escaneo de contenido encontró la
coincidencia confirmada siguiente:

| Evidencia | Referencia |
| --- | --- |
| Archivo histórico | .env.example, línea 8 de esa versión |
| Variable | WHATSAPP_VERIFY_TOKEN |
| Blob histórico | aea91d67d66de1171f98830a1f92d59a279a25db |
| Commit que incorporó esa versión | ff8f03bfaf840f22f0035fbae7b895d560734111 |
| Commit que sustituyó esa versión | 095bdf9f2b44aef18b5e6b6ad4bae270d9e8210e |
| Coincidencia local | .env, línea 8; no coincide con .env.test |
| Presencia en destino | Ambos commits son ancestros de origin/GYG+FRHB-implementado |

Se distingue el token de **verificación de webhook** de un access token de la
API: el hallazgo no demuestra por sí solo una filtración de WHATSAPP_ACCESS_TOKEN.
El escaneo por patrones y coincidencias no es una certificación exhaustiva de
ausencia de secretos desconocidos ni una inspección visual de todos los documentos
binarios históricos. La revisión final del commit se interrumpió antes de staging.

git ls-files -ci --exclude-standard no devolvió archivos: ninguna exclusión
actual oculta un archivo ya rastreado. Esto no sanea contenidos históricos.

## Preparación realizada

Solo se editaron en esta tarea:

- .gitignore: extensión de exclusiones de variables de entorno, configuración
  local, respaldos y datos PostgreSQL, DPAPI, claves privadas, tokens locales,
  binarios, instaladores y resultados de pruebas. Se conserva .env.example.
- readme.md: descripción y tecnologías existentes; corrección de la información
  sobre integraciones y Jest; enlaces de avances ACCESS-SCOPE y estado posterior
  documentado por PROD-ACCESS-02B; bloqueo de publicación e higiene Git.
- docs/GITHUB-01.md: diagnóstico, inventario, verificaciones y resultado.

Se conservan todos los cambios previos de Electron, Express, frontend, pg,
integraciones, esquema, migración 016 y pruebas. Las referencias a migraciones y
pruebas reales en informes anteriores son evidencia histórica: GITHUB-01 no abrió
conexiones PostgreSQL, no aplicó migraciones ni verificó esos resultados en vivo.
No se alteraron los lanzadores protegidos ni ninguna funcionalidad del sistema.

## Archivos excluidos de publicación

No se incluyó ningún archivo en un commit. Para una futura publicación, las
siguientes categorías quedan excluidas por reglas verificadas de .gitignore:

- .env, .env.test, otras variantes .env.* y archivos *.env, como config.env.
  Se permite expresamente .env.example con valores vacíos o de ejemplo.
- secrets/ y .access-scope-lab/ completos: configuraciones, evidencia local,
  datos de reservaciones de ensayo/restauración, capturas, PDFs, logs y respaldos.
- node_modules/, dist/ y out/.
- *.dump, *.backup, *.bak, *.sql.gz, *.sql.zip y carpetas locales de respaldos
  y datos PostgreSQL; no se excluyen schema.sql, seeds.sql ni migraciones fuente.
- *.clixml, *.dpapi, *.pfx, *.p12, *.pem, *.key, .pgpass, pgpass.conf,
  credentials*.json, client_secret*.json, token.json, tokens.json, *.local.json
  y .npmrc local.
- *.log, ejecutables/instaladores/paquetes generados y resultados de pruebas.

Las comprobaciones git check-ignore --no-index confirmaron la exclusión de
rutas representativas y la inclusión de .env.example, schema.sql, seeds.sql,
migración 016 y scripts fuente protegidos. No se borraron archivos excluidos.

## Verificaciones locales

**232 pruebas aprobadas en ocho suites**, cero fallos, usando Jest instalado,
selección explícita de archivos y helpers/noPostgres.js. Ese helper sustituye
pg.Pool e impide consultas/conexiones reales. Se fijó APP_CONFIG_PATH=NUL,
host/base/usuario sintéticos y GYG_GMAIL_SYNC_ENABLED=false solo para el proceso
de pruebas. No se modificaron credenciales o variables persistentes.

Suites ejecutadas en backend/__tests__/:

- accessScope.routes.test.js.
- alcanceReservaciones.service.test.js.
- usuariosAlcance.test.js.
- databaseErrors.test.js.
- devDb02.test.js.
- devDb03.test.js.
- prodAccess02b.test.js.
- capacidad.service.test.js.

No se ejecutó api.test.js, ni scripts de migración, respaldo, inicialización,
sincronización, integración real, instalación o pruebas con persistencia.
No se lanzaron Electron ni el backend de la aplicación para estas comprobaciones.

git diff --check terminó sin errores de espacios. La segunda consulta real al
destino confirmó el mismo hash. Se contrastaron nuevamente las 254 rutas
candidatas finales con los valores sensibles de .env/.env.test: cero coincidencias.
Se comprobó mediante SHA-256 que .env, .env.test y cinco lanzadores protegidos
seleccionados conservan exactamente su contenido anterior a la preparación.
El índice continúa vacío y HEAD permanece en el commit inicial.
La comprobación de sintaxis de 72 archivos JavaScript/Python pendientes y el
parser de los seis scripts PowerShell nuevos terminaron sin errores; se leyeron
como código fuente, sin ejecutar sus procedimientos operativos.

## Resolución pendiente antes de retomar

1. Sustituir WHATSAPP_VERIFY_TOKEN por un valor nuevo seguro en los destinos
   correspondientes mediante una tarea expresamente autorizada, sin mostrarlo
   ni guardarlo en Git. Coordinar la configuración del webhook si se utiliza.
   Esta tarea no cambia .env, Meta ni credenciales.
2. Decidir expresamente el tratamiento del historial ya publicado. Si se
   requiere eliminar el valor histórico, preparar un saneamiento coordinado
   con respaldo, colaboradores y referencias afectadas. Reescribirlo exige
   autorización separada y no es compatible con las restricciones actuales.
   Alternativamente, tras invalidar el valor, decidir expresamente conservar
   el historial y documentar la resolución antes de repetir GITHUB-01.
3. Repetir diagnóstico y seguridad, revisar el listado exacto a confirmar,
   generar un commit descriptivo y verificar su árbol y rango saliente.
4. Consultar de nuevo la rama real y exigir avance rápido. Ante divergencia
   o autenticación fallida, detenerse; no hacer merge/rebase automático ni force.
5. Solo tras resolver el bloqueo, publicar exclusivamente en el destino pedido
   y comprobar el hash remoto.

**Commit generado:** ninguno. **Commit publicado:** ninguno.
**Rama remota actualizada por esta tarea:** ninguna.
**Hash remoto observado:** 181f05cfee74e5b42180509220770f806c78b99d.

## Inventario exacto de cambios pendientes

Ninguno está incluido en un commit de GITHUB-01. La lista registra modificaciones
previas y documentación preparada; M significa modificado y ?? significa nuevo.
Los lanzadores enumerados son avances preexistentes conservados sin edición.

Total: 99 archivos pendientes; 32 modificados y 67 nuevos.

```text
 M .gitignore
 M backend/__tests__/eventosIntegracion.routes.test.js
 M backend/config/database.js
 M backend/controllers/auth.controller.js
 M backend/controllers/dashboard.controller.js
 M backend/controllers/plataformas.controller.js
 M backend/controllers/reservaciones.controller.js
 M backend/middleware/auth.middleware.js
 M backend/routes/auth.routes.js
 M backend/services/auth.service.js
 M backend/services/dashboard.service.js
 M backend/services/plataformas.service.js
 M backend/services/reservaciones.service.js
 M backend/services/usuarios.service.js
 M backend/validators/usuarios.validator.js
 M database/schema.sql
 M electron/main.js
 M frontend/css/pages.css
 M frontend/js/api.js
 M frontend/js/auth.js
 M frontend/js/layout.js
 M frontend/js/router.js
 M frontend/pages/bitacora.js
 M frontend/pages/configuracion.js
 M frontend/pages/daily.js
 M frontend/pages/dashboard.js
 M frontend/pages/historial.js
 M frontend/pages/operaciones.js
 M frontend/pages/reservaciones.js
 M frontend/pages/usuarios.js
 M package.json
 M readme.md
?? backend/__tests__/accessScope.routes.test.js
?? backend/__tests__/alcanceReservaciones.service.test.js
?? backend/__tests__/databaseErrors.test.js
?? backend/__tests__/devDb02.test.js
?? backend/__tests__/devDb03.test.js
?? backend/__tests__/frontendScope.test.js
?? backend/__tests__/helpers/frontendScopeHarness.cjs
?? backend/__tests__/helpers/noPostgres.js
?? backend/__tests__/prodAccess02b.test.js
?? backend/__tests__/usuariosAlcance.test.js
?? backend/middleware/alcanceReservaciones.middleware.js
?? backend/services/alcanceReservaciones.service.js
?? backend/utils/alcanceReservaciones.js
?? database/migrations/016_alcance_plataformas_usuarios.sql
?? docs/ACCESS-SCOPE-02.md
?? docs/ACCESS-SCOPE-03A.md
?? docs/ACCESS-SCOPE-03B.md
?? docs/ACCESS-SCOPE-04A.md
?? docs/ACCESS-SCOPE-04B.md
?? docs/ACCESS-SCOPE-05A-aceptacion.md
?? docs/ACCESS-SCOPE-05A.md
?? docs/ACCESS-SCOPE-05B-preparacion.md
?? docs/DEV-DB-02.md
?? docs/DEV-DB-03-FIX.md
?? docs/DEV-DB-03.md
?? docs/GITHUB-01.md
?? docs/PROD-ACCESS-01.md
?? docs/PROD-ACCESS-02A.md
?? docs/PROD-ACCESS-02B.md
?? scripts/CapturarProdAccessCredenciales.ps1
?? scripts/DevDb02.ps1
?? scripts/DevDb03.ps1
?? scripts/PrepararProdAccess02b.ps1
?? scripts/ProdAccess02a.ps1
?? scripts/ProdAccessTest.ps1
?? scripts/accessScopeNetworkGuard.cjs
?? scripts/arrancarDevDb02.cjs
?? scripts/arrancarProdAccessTest.cjs
?? scripts/auditarAccessScopePaquete.cjs
?? scripts/backendDevDb02.cjs
?? scripts/backendProdAccessTest.cjs
?? scripts/devDb02.cjs
?? scripts/devDb03.cjs
?? scripts/extraerAccessScopeInstalador.cjs
?? scripts/identidadesProdAccess.cjs
?? scripts/inicializarDevDb02.cjs
?? scripts/prepararProdAccess02b.cjs
?? scripts/probarElectronDevDb03.cjs
?? scripts/probarGetYourGuideGmail.mjs
?? scripts/probarGetYourGuideParserReal.mjs
?? scripts/probarGmailOAuth.mjs
?? scripts/probarPersistenciaGetYourGuide.mjs
?? scripts/probarPersistenciaGetYourGuide.test.js
?? scripts/probarProdAccess02b.cjs
?? scripts/probarSyncGetYourGuide.mjs
?? scripts/prodAccess02a.cjs
?? scripts/prodAccess02bDb.cjs
?? scripts/prodAccessTest.cjs
?? scripts/revisarAccessScopePdf.py
?? scripts/usuariosDevDb02.cjs
?? scripts/validarAccessScopeElectron.cjs
?? scripts/validarAccessScopeElectronHarness.cjs
?? scripts/validarAccessScopeEmpaquetado.cjs
?? scripts/validarAccessScopeEmpaquetadoDriver.cjs
?? scripts/validarAccessScopePostgres.cjs
?? scripts/validarProdAccessCredenciales.cjs
?? scripts/verificarDevDb02.cjs
```

