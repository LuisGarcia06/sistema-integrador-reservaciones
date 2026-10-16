# GITHUB-03 — Publicación final de avances en GitHub

Fecha: 16 de octubre de 2026, America/Cancun.

## Alcance y estado inicial

Publicación de los avances existentes del Sistema Integrador de Reservaciones
de Community Tours Sian Ka’an desde A:\sistema-integrador-reservaciones.
Se leyeron AGENTS.md y los informes GITHUB-01/GITHUB-02. Se conserva Electron,
HTML/CSS/JavaScript, Express y PostgreSQL con pg, así como la arquitectura por capas.
Esta fase no modifica funcionalidades ni ejecuta migraciones.

Rama activa y destino: GYG+FRHB-implementado. origin para fetch y push:
https://github.com/LuisGarcia06/sistema-integrador-reservaciones.git.
HEAD y hash remoto real inicial:
181f05cfee74e5b42180509220770f806c78b99d. Sin commits locales adicionales,
con 39 archivos modificados, 70 nuevos y staging vacío: 109 cambios pendientes.
Las otras ramas locales se conservaron sin publicación.

## Cierre del bloqueo de WhatsApp

**Por declaración expresa del usuario**, la aplicación de WhatsApp en Meta for
Developers fue eliminada y WhatsApp Cloud API se retiró del alcance del proyecto.
Codex no verificó esa eliminación directamente en Meta. El usuario autorizó
continuar con el historial existente y detenerse solo ante evidencia concreta
de otra aplicación, webhook o servicio activo que aún dependiera del token.

Comprobaciones locales:

- backend/config/whatsapp.js conserva habilitado=false en una configuración
  inmutable; las variables heredadas no habilitan la integración.
- El servidor no monta las rutas de WhatsApp. Los controladores rechazan GET/POST
  incluso al montar manualmente el router conservado. Los envíos rechazan con
  WHATSAPP_DISABLED antes de llamar a Meta; el procesamiento no registra mensajes.
- WHATSAPP_VERIFY_TOKEN sigue vacío en .env, como quedó en GITHUB-02. No se
  modificaron .env, .env.test, credenciales ni variables persistentes en GITHUB-03.
- La inspección inicial inventarió 339 procesos y no encontró procesos
  node/electron del proyecto ni conexiones suyas. Tampoco encontró los túneles
  ngrok/cloudflared/frpc ni patrones revisados de localtunnel/SSH inverso.
  netsh interface portproxy show all no devolvió redirecciones.
- No apareció evidencia concreta de otro webhook activo dependiente del token.
  Esta observación local no equivale a inventariar todos los servicios remotos.

El token histórico permanece en el blob
aea91d67d66de1171f98830a1f92d59a279a25db de .env.example, ya publicado antes de
esta tarea. No se reproduce su valor ni se reescribe el historial. La continuidad
se fundamenta en la declaración del usuario y la deshabilitación del código,
no en una supuesta comprobación directa de la cuenta de Meta.

## Auditoría final de seguridad

Se revisaron tanto archivos modificados como nuevos. Antes de crear este informe
había 257 rutas rastreadas o candidatas no ignoradas y 109 cambios pendientes.
Se comprobó el contenido, no solo las reglas de .gitignore, contrastando en memoria
valores sensibles de .env/.env.test y secretos JSON locales, además del token
histórico. No se imprimieron valores de credenciales.

Resultado: cero coincidencias nuevas de secretos conocidos, claves privadas,
tokens de proveedores, JWT literales o URLs con credenciales en los archivos
candidatos. Las asignaciones literales señaladas se clasificaron como datos
sintéticos de pruebas, generación aleatoria o etiquetas de interfaz. No se
encontraron archivos binarios nuevos o modificados ni exportaciones de clientes.
Los datos de reservas presentes en las pruebas nuevas son sintéticos.

Se volvió a recorrer la historia existente: 104 commits y 530 blobs únicos.
Solo apareció el hallazgo histórico de WhatsApp ya reconocido; no aparecieron
otros secretos conocidos ni rutas prohibidas. El análisis por patrones y
coincidencias no certifica ausencia de cualquier secreto desconocido, ni sustituye
la revisión de documentos binarios históricos que ya estaban en el remoto.

git ls-files -ci --exclude-standard no devolvió archivos rastreados ahora ignorados.
La comprobación se repite sobre el contenido exacto del índice antes del commit.
El inventario al final de este informe identifica todos los archivos que entran.

La comprobación exacta del índice abarcó 258 rutas, con 110 archivos cambiados:
cero hallazgos de secretos o rutas privadas. git diff --cached --check señaló
únicamente líneas vacías al final de 13 archivos previos, entre ellos lanzadores
protegidos. Se conservaron sus bytes y no se alteraron funcionalidades para
corregir formato. El resto de la comprobación pasó usando la excepción temporal
core.whitespace=-blank-at-eof, sin modificar la configuración persistente de Git.

## Archivos incluidos y excluidos

Se incluyen los avances previos de ACCESS-SCOPE en autenticación, permisos,
servicios, frontend, pruebas y documentación; las mejoras de Electron/Express;
el esquema y la migración SQL 016 como código fuente; los scripts operativos y
validadores seguros; la deshabilitación de WhatsApp de GITHUB-02; las exclusiones
de .gitignore, README y los tres informes GITHUB.

Los scripts de mantenimiento se publican como código fuente, sin ejecutarlos.
La inclusión de schema.sql/migraciones no aplica cambios sobre ninguna base.
Se conserva el código de GetYourGuide y FareHarbor sin ediciones en esta fase.

Se excluyen y permanecen en el equipo:

- .env, .env.test y configuraciones privadas *.env/.env.*; se permite únicamente
  .env.example con campos vacíos o marcadores seguros.
- secrets/ y .access-scope-lab/, incluidas evidencias y artefactos locales.
- Respaldos .dump/.backup/.bak, datos PostgreSQL y archivos de restauración.
- Credenciales DPAPI .clixml/.dpapi, claves privadas y tokens JSON locales.
- node_modules/, dist/, out/, ejecutables, instaladores, logs y resultados de pruebas.

No se borró ningún archivo privado. .gitignore se conservó como quedó revisado
en las fases anteriores. El detalle y las exclusiones se comprobaron además en
los nombres rastreados y el contenido del staging.

## Verificaciones automatizadas

**690 pruebas aprobadas en 33 suites; cero fallos, cero pendientes.**
Se ejecutaron todas las suites backend excepto backend/__tests__/api.test.js,
más scripts/probarPersistenciaGetYourGuide.test.js, con Jest instalado,
--runInBand, --no-cache, --runTestsByPath y helpers/noPostgres.js.
El entorno del proceso se construyó sin credenciales heredadas, con configuración
sintética, APP_CONFIG_PATH=NUL y GYG_GMAIL_SYNC_ENABLED=false.

Cobertura verificada: ACCESS-SCOPE, autenticación/permisos, validación de reservas,
capacidad 12/24, servicios y rutas con DB simulada, WhatsApp deshabilitado y
regresiones aisladas de integraciones con HTTP simulado. frontendScope.test.js
ejecutó Electron oculto con API simulada, puerto efímero y perfil temporal propio;
no inició la aplicación contra PostgreSQL ni proveedores reales.

api.test.js quedó excluida porque requiere persistencia y puede modificar datos.
No se ejecutaron inicializadores, migraciones, restauraciones, sincronizadores,
instaladores ni pruebas contra proveedores. No se accedió a PostgreSQL.
No se instalaron dependencias ni se modificaron credenciales.

## Publicación y trazabilidad

**Publicación de avances exitosa y comprobada contra el remoto.**

| Dato | Resultado |
| --- | --- |
| Commit de avances | b6f820fdcc40971ee78427f8d0168358676169d9 |
| Mensaje | feat: integrate ACCESS-SCOPE and reservation system improvements |
| Padre y remoto anterior | 181f05cfee74e5b42180509220770f806c78b99d |
| Árbol confirmado | 2ebb407caef4b02323084236eed2d993c4e6190c |
| Archivos confirmados | 110; el árbol coincide con el índice auditado |
| Destino exclusivo | origin/GYG+FRHB-implementado |
| Hash remoto tras subir avances | b6f820fdcc40971ee78427f8d0168358676169d9 |
| Verificación | git ls-remote devolvió el mismo hash que el commit local |

[Commit de avances publicado](https://github.com/LuisGarcia06/sistema-integrador-reservaciones/commit/b6f820fdcc40971ee78427f8d0168358676169d9).
[Rama de destino](https://github.com/LuisGarcia06/sistema-integrador-reservaciones/tree/GYG%2BFRHB-implementado).

Antes de confirmar se revisaron el diff y los nombres exactos del índice, su
contenido con el escáner y las observaciones de formato descritas arriba. Antes
del push se consultó de nuevo el hash remoto y se comprobó que era ancestro
del commit. Se publicó solo HEAD:refs/heads/GYG+FRHB-implementado, sin force
y con push.followTags=false para no incluir etiquetas adicionales.

Este resultado se conserva en un segundo commit exclusivamente documental,
sin modificar ni reemplazar el commit de avances. El identificador de ese cierre
es el del commit que contiene esta versión del informe y puede consultarse con:

```bash
git log -1 --format=%H -- docs/GITHUB-03.md
```

El cierre se somete de nuevo a auditoría de contenido, avance rápido y comparación
del hash remoto con HEAD. No se reescribió el historial, no se eliminaron ramas
ni se efectuaron merge/rebase automáticos. No hubo fallos de autenticación.

## Límites y pendientes de producción

Esta publicación de código no certifica despliegue productivo, aceptación humana,
instalación/actualización/desinstalación real ni activación de integraciones.
Se conservan los pendientes de ACCESS-SCOPE y PROD-ACCESS de sus fases respectivas,
incluidos cuenta apropiada de ejecución, aceptación y distribución productiva.
Los informes históricos no se reinterpretan como verificaciones actuales de DB.
El token histórico sigue visible en commits anteriores por decisión del usuario.

## Inventario exacto para el commit de avances

110 archivos: 39 modificados y 71 nuevos.

```text
.env.example
.gitignore
backend/__tests__/eventosIntegracion.routes.test.js
backend/__tests__/whatsapp.controller.test.js
backend/__tests__/whatsappMessage.service.test.js
backend/config/database.js
backend/controllers/auth.controller.js
backend/controllers/dashboard.controller.js
backend/controllers/plataformas.controller.js
backend/controllers/reservaciones.controller.js
backend/controllers/whatsapp.controller.js
backend/middleware/auth.middleware.js
backend/routes/auth.routes.js
backend/server.js
backend/services/auth.service.js
backend/services/dashboard.service.js
backend/services/plataformas.service.js
backend/services/reservaciones.service.js
backend/services/usuarios.service.js
backend/services/whatsappMessage.service.js
backend/services/whatsappWebhook.service.js
backend/validators/usuarios.validator.js
database/schema.sql
electron/main.js
frontend/css/pages.css
frontend/js/api.js
frontend/js/auth.js
frontend/js/layout.js
frontend/js/router.js
frontend/pages/bitacora.js
frontend/pages/configuracion.js
frontend/pages/daily.js
frontend/pages/dashboard.js
frontend/pages/historial.js
frontend/pages/operaciones.js
frontend/pages/reservaciones.js
frontend/pages/usuarios.js
package.json
readme.md
backend/__tests__/accessScope.routes.test.js
backend/__tests__/alcanceReservaciones.service.test.js
backend/__tests__/databaseErrors.test.js
backend/__tests__/devDb02.test.js
backend/__tests__/devDb03.test.js
backend/__tests__/frontendScope.test.js
backend/__tests__/helpers/frontendScopeHarness.cjs
backend/__tests__/helpers/noPostgres.js
backend/__tests__/prodAccess02b.test.js
backend/__tests__/usuariosAlcance.test.js
backend/__tests__/whatsappDisabled.test.js
backend/config/whatsapp.js
backend/middleware/alcanceReservaciones.middleware.js
backend/services/alcanceReservaciones.service.js
backend/utils/alcanceReservaciones.js
database/migrations/016_alcance_plataformas_usuarios.sql
docs/ACCESS-SCOPE-02.md
docs/ACCESS-SCOPE-03A.md
docs/ACCESS-SCOPE-03B.md
docs/ACCESS-SCOPE-04A.md
docs/ACCESS-SCOPE-04B.md
docs/ACCESS-SCOPE-05A-aceptacion.md
docs/ACCESS-SCOPE-05A.md
docs/ACCESS-SCOPE-05B-preparacion.md
docs/DEV-DB-02.md
docs/DEV-DB-03-FIX.md
docs/DEV-DB-03.md
docs/GITHUB-01.md
docs/GITHUB-02.md
docs/GITHUB-03.md
docs/PROD-ACCESS-01.md
docs/PROD-ACCESS-02A.md
docs/PROD-ACCESS-02B.md
scripts/CapturarProdAccessCredenciales.ps1
scripts/DevDb02.ps1
scripts/DevDb03.ps1
scripts/PrepararProdAccess02b.ps1
scripts/ProdAccess02a.ps1
scripts/ProdAccessTest.ps1
scripts/accessScopeNetworkGuard.cjs
scripts/arrancarDevDb02.cjs
scripts/arrancarProdAccessTest.cjs
scripts/auditarAccessScopePaquete.cjs
scripts/backendDevDb02.cjs
scripts/backendProdAccessTest.cjs
scripts/devDb02.cjs
scripts/devDb03.cjs
scripts/extraerAccessScopeInstalador.cjs
scripts/identidadesProdAccess.cjs
scripts/inicializarDevDb02.cjs
scripts/prepararProdAccess02b.cjs
scripts/probarElectronDevDb03.cjs
scripts/probarGetYourGuideGmail.mjs
scripts/probarGetYourGuideParserReal.mjs
scripts/probarGmailOAuth.mjs
scripts/probarPersistenciaGetYourGuide.mjs
scripts/probarPersistenciaGetYourGuide.test.js
scripts/probarProdAccess02b.cjs
scripts/probarSyncGetYourGuide.mjs
scripts/prodAccess02a.cjs
scripts/prodAccess02bDb.cjs
scripts/prodAccessTest.cjs
scripts/revisarAccessScopePdf.py
scripts/usuariosDevDb02.cjs
scripts/validarAccessScopeElectron.cjs
scripts/validarAccessScopeElectronHarness.cjs
scripts/validarAccessScopeEmpaquetado.cjs
scripts/validarAccessScopeEmpaquetadoDriver.cjs
scripts/validarAccessScopePostgres.cjs
scripts/validarProdAccessCredenciales.cjs
scripts/verificarDevDb02.cjs
```
