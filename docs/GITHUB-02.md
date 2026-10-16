# GITHUB-02 — Finalizar preparación y publicación

Fecha: 16 de octubre de 2026, America/Cancun.

## Resultado

**Preparación local completada; publicación bloqueada por verificación externa
pendiente.** No se ejecutaron git add, git commit ni git push. No hay commit nuevo
ni rama remota actualizada por esta tarea. Se conserva el historial Git existente.

El usuario confirmó que WhatsApp Cloud API no se utilizará y pidió conservar su
código deshabilitado. Ante la pregunta de si alguna vez hubo una URL pública
configurada en Meta u otra copia desplegada, respondió **«No lo sé»**.
No se dispone de una URL de callback identificada ni de acceso administrativo
verificado a Meta que permita descartar otro webhook activo con el valor histórico.
La ausencia de una suscripción comercial reportada no verifica esa configuración.
Por la condición explícita del punto 5 de GITHUB-02, no se autoriza inferir su
inutilización global a partir de las comprobaciones locales y no se publica.

## Código deshabilitado, conservado

- backend/config/whatsapp.js: configuración inmutable habilitado=false. No lee
  variables de entorno que permitan reactivar la integración.
- backend/server.js: no importa ni monta las rutas de WhatsApp. La ruta anterior
  /api/webhooks/whatsapp responde 404 al ejecutar este servidor sin envoltorios.
- backend/controllers/whatsapp.controller.js: GET de verificación y POST de
  recepción devuelven 404 antes de comparar tokens o delegar procesamiento,
  incluso si alguien monta el router conservado por separado.
- backend/services/whatsappMessage.service.js: cualquier invocación de envío
  rechaza con WHATSAPP_DISABLED (503) antes de validar credenciales o llamar a fetch.
  Esto cubre también el script de envío existente, que importa este servicio.
- backend/services/whatsappWebhook.service.js: el procesamiento directo retorna
  una lista vacía sin registrar mensajes. La normalización pura permanece disponible.
- backend/routes/whatsapp.routes.js y scripts/probarWhatsappMensajeTexto.js:
  conservados sin modificaciones. No existe un worker WhatsApp en los puntos
  de entrada revisados.

No se cambiaron GetYourGuide, FareHarbor, el modelo de datos, PostgreSQL,
reservaciones ni ACCESS-SCOPE. No se modificaron los lanzadores protegidos.

## Resolución local de WHATSAPP_VERIFY_TOKEN

Se vació únicamente la asignación WHATSAPP_VERIFY_TOKEN en .env. Antes de escribir
se comprobó que existiera exactamente una asignación y que, normalizando solo
ese campo, todos los demás bytes coincidieran. Se preservaron las otras variables,
credenciales, codificación y saltos de línea. No se generó ni mostró otro secreto.
El valor histórico ya no aparece en .env.

La comprobación de las variables persistentes de usuario y sistema Windows no
encontró WHATSAPP_VERIFY_TOKEN. Tampoco estaba definido en el proceso de la tarea.
No se modificaron el registro de Windows ni otras variables persistentes.
.env.test quedó intacto; sus valores sintéticos no pueden habilitar el producto.
.env.example ahora documenta la deshabilitación y deja vacío el campo del token.
Ambos .env reales permanecen ignorados, sin staging.

Un primer intento de comprobación falló antes de escribir; se corrigió y se
completó la operación con verificación exacta de todos los demás bytes. No se
hicieron respaldos de credenciales dentro de archivos candidatos a publicación.

## Procesos, exposición y llamadas a Meta

En la inspección inicial había una aplicación Electron del proyecto abierta:
el backend PID 35824 provenía de backendProdAccessTest.cjs y escuchaba solamente
en 127.0.0.1:3000. GET y POST locales a /api/webhooks/whatsapp, sin tokens y con
payload vacío, devolvieron 503 por el bloqueo previo del lanzador protegido.
No se enviaron valores secretos en las peticiones. Ese lanzador filtra el entorno,
bloquea rutas de integraciones y la red de proveedores; no fue modificado.

La última inspección, contrastada mediante comparación exacta de nombres de
procesos, inventarió 339 procesos: no encontró procesos node/electron de este
proyecto, conexiones de esos procesos ni túneles ngrok/cloudflared/frpc o los
patrones revisados de localtunnel/SSH inverso. netsh interface portproxy show all
no devolvió redirecciones. La consulta de servicios no identificó ngrok/cloudflared.
La tarea no terminó procesos ajenos, no reinició la aplicación ni abrió PostgreSQL.

Se distinguió la aplicación personal WhatsApp de Windows y sus WebView de esta
integración; no se modificó ni cerró. La inspección del host no demuestra que no
existan despliegues remotos, proxies externos o callbacks en Meta. Los resultados
de procesos y conexiones son observaciones puntuales, no monitoreo continuo.
Las pruebas de envío usaron fetch simulado y comprobaron cero llamadas.
No se hicieron peticiones reales a Meta ni se activaron integraciones externas.

## Pruebas automatizadas seguras

**248 pruebas aprobadas en 12 suites, cero fallos.** Se utilizó Jest instalado,
--runInBand, --no-cache, selección explícita con --runTestsByPath y
backend/__tests__/helpers/noPostgres.js, que sustituye pg.Pool y bloquea conexiones
y consultas reales. El proceso usó APP_CONFIG_PATH=NUL, configuración sintética
de DB y GYG_GMAIL_SYNC_ENABLED=false, sin persistir esas variables.

Suites ejecutadas en backend/__tests__/:

- whatsappDisabled.test.js (nueva): variables heredadas no habilitan WhatsApp;
  controlador rechaza token coincidente; router montado directamente y servidor
  real devuelven 404; envío directo no llama a fetch; procesamiento no registra datos.
- whatsapp.controller.test.js y whatsappMessage.service.test.js: mantienen la
  cobertura del código conservado con habilitación simulada exclusivamente en Jest.
- whatsappWebhook.service.test.js: normalización pura con datos sintéticos.
- accessScope.routes.test.js, alcanceReservaciones.service.test.js,
  usuariosAlcance.test.js, databaseErrors.test.js, devDb02.test.js,
  devDb03.test.js, prodAccess02b.test.js y capacidad.service.test.js.

No se ejecutó api.test.js ni scripts de persistencia, migración, restauración,
respaldo, instalación o sincronización. Las peticiones de Supertest usan servidores
efímeros de las pruebas, no el backend abierto por el usuario.

## Revisión de candidatos y archivos privados

Se conservaron las exclusiones de .gitignore revisadas en GITHUB-01. No fue
necesario ampliarlas en GITHUB-02. Se verificaron con git check-ignore las rutas
.env, .env.test, config.env, secrets/, .access-scope-lab/, node_modules/, dist/,
respaldos .backup/.dump y DPAPI .clixml: todas excluidas. .env.example, el esquema
y la migración SQL fuente siguen permitidos.

La revisión de 256 rutas candidatas antes de crear este informe no encontró rutas
prohibidas ni coincidencias de contenido con los valores sensibles locales,
secretos JSON bajo secrets/ o el token histórico. Se revisaron patrones de claves
privadas, JWT, tokens de proveedores y URLs con credenciales sin imprimir valores.
git ls-files -ci --exclude-standard no devolvió archivos rastreados ahora ignorados.
No hay binarios/documentos privados nuevos entre los cambios; se conservan los
documentos históricos ya rastreados. El análisis de patrones no certifica ausencia
de secretos desconocidos en cualquier documento histórico.

La línea base privada de integridad verificó **97 archivos protegidos**, incluidos
scripts, integraciones GetYourGuide/FareHarbor, SQL y archivos de ACCESS-SCOPE:
cero cambios inesperados. .env se trató por separado por su modificación autorizada.
No se volvieron a ejecutar operaciones de los informes anteriores.
La comprobación final incluyó este informe: 257 rutas candidatas, 109 archivos
pendientes, cero coincidencias con secretos de .env/.env.test o el token histórico,
inventario coincidente con git status e índice vacío. git diff --check terminó
sin errores de espacios. Ningún archivo privado se preparó en staging.

El historial sigue en los mismos 104 commits y el mismo HEAD de GITHUB-01; sus
530 blobs fueron revisados en esa fase. El token permanece en el blob histórico
aea91d67d66de1171f98830a1f92d59a279a25db de .env.example, que ya está en GitHub.
GITHUB-02 no lo elimina de commits ni certifica su invalidación en copias remotas.
La revisión final del árbol de un commit nuevo y su rango saliente no se ejecutó,
porque la condición externa de publicación sigue pendiente.

## Rama y publicación

origin fetch/push:
https://github.com/LuisGarcia06/sistema-integrador-reservaciones.git.

Rama activa y destino: GYG+FRHB-implementado.
HEAD y rama remota real, consultada dos veces mediante git ls-remote --heads:
181f05cfee74e5b42180509220770f806c78b99d. Relación 0/0 con la referencia de seguimiento.
No se detectó divergencia. Un commit hijo podría avanzar el remoto si su hash
no cambia, pero no se creó ese commit ni se certificó un fast-forward final.
El permiso de escritura/autenticación para push no se probó.

**Commit generado/publicado: ninguno. Rama actualizada: ninguna.**
[Rama existente, sin actualizar por esta tarea](https://github.com/LuisGarcia06/sistema-integrador-reservaciones/tree/GYG%2BFRHB-implementado).

No hubo force, merge/rebase, eliminación de ramas, reinicialización ni cambios
de configuración Git. El índice permanece vacío y todos los avances quedan locales.

## Qué falta antes de publicar

Verificar en la administración de Meta la configuración de callback y las
suscripciones WhatsApp asociadas, e identificar o descartar otras copias
desplegadas que puedan aceptar el valor histórico. Si existe algún callback,
deshabilitarlo o retirar el token anterior mediante una acción autorizada y
comprobar que deja de aceptarlo. No introducir ese valor en chats, informes o Git.

Con esa evidencia, repetir el escaneo del árbol final, verificar de nuevo el hash
real remoto, preparar el commit y publicar solo si la actualización es avance
rápido. Si aparecen divergencias o autenticación fallida, detenerse y solicitar
instrucciones. No se propone reescribir el historial como parte de esta tarea.

## Archivos editados exclusivamente en GITHUB-02

- .env (local ignorado): únicamente vaciar WHATSAPP_VERIFY_TOKEN.
- .env.example.
- backend/config/whatsapp.js (nuevo).
- backend/server.js.
- backend/controllers/whatsapp.controller.js.
- backend/services/whatsappMessage.service.js.
- backend/services/whatsappWebhook.service.js.
- backend/__tests__/whatsapp.controller.test.js.
- backend/__tests__/whatsappMessage.service.test.js.
- backend/__tests__/whatsappDisabled.test.js (nuevo).
- readme.md.
- docs/GITHUB-02.md (nuevo).

La evidencia de diagnóstico queda en .access-scope-lab/github-02/, ignorada.
El resto de los cambios pendientes corresponde a GITHUB-01 o avances anteriores.

## Inventario exacto pendiente (ningún archivo confirmado)

Total: 109 archivos; 39 modificados y 70 nuevos.

```text
 M .env.example
 M .gitignore
 M backend/__tests__/eventosIntegracion.routes.test.js
 M backend/__tests__/whatsapp.controller.test.js
 M backend/__tests__/whatsappMessage.service.test.js
 M backend/config/database.js
 M backend/controllers/auth.controller.js
 M backend/controllers/dashboard.controller.js
 M backend/controllers/plataformas.controller.js
 M backend/controllers/reservaciones.controller.js
 M backend/controllers/whatsapp.controller.js
 M backend/middleware/auth.middleware.js
 M backend/routes/auth.routes.js
 M backend/server.js
 M backend/services/auth.service.js
 M backend/services/dashboard.service.js
 M backend/services/plataformas.service.js
 M backend/services/reservaciones.service.js
 M backend/services/usuarios.service.js
 M backend/services/whatsappMessage.service.js
 M backend/services/whatsappWebhook.service.js
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
?? backend/__tests__/whatsappDisabled.test.js
?? backend/config/whatsapp.js
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
?? docs/GITHUB-02.md
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

