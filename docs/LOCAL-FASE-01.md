# Fase 1 — Backend independiente de desarrollo

Fecha: 26 de octubre de 2026. Alcance: Node/Express independiente, exclusivamente loopback y datos sintéticos. No habilita LAN, producción, servicios Windows ni instaladores.

## Arquitectura y compatibilidad

```text
Modalidad heredada (sin argumentos nuevos)
Electron -> ownedBackend -> desktopChild -> PostgreSQL local autorizado
Cerrar Electron detiene exclusivamente su backend propio.

Modalidad nueva (solo fuentes y laboratorio)
PowerShell -> Node backend/standalone.js -> PostgreSQL desechable local
Electron --ctsk-mode=independent-dev -> HTTP 127.0.0.1:<puerto de laboratorio>
Cerrar Electron retira su vigilancia; Node y PostgreSQL continúan.
```

`backend/server.js` sigue siendo la aplicación Express compartida y conserva sus rutas, autenticación y permisos. No se habilitó su ejecución directa. `npm start` conserva su comportamiento anterior; utilizar la entrada nueva explícita indicada abajo.

El backend independiente tiene un proceso propio, no un proceso hijo de Electron. En esta fase se ejecuta en primer plano en una consola PowerShell separada; no se instala como servicio Windows ni se promete supervivencia al cierre de esa consola o al apagado de Windows.

El perfil de Electron independiente se establece antes de pedir el bloqueo de instancia y vive dentro del laboratorio. No reclama el perfil habitual. La conexión utiliza el preload, aislamiento, sandbox, restricciones de navegación/red y validación de emisor IPC existentes. Daily PDF utiliza el puerto del backend verificado.

## Verificaciones conservadas y aislamiento

- Configuración explícita; sin fallback al `.env` del repositorio, `APP_CONFIG_PATH` ni configuración principal.
- Reutiliza `desktopPolicy.readConfig`, sus verificaciones ACL, claves permitidas, secretos, TTL y versión/esquema.
- Manifiesto privado bajo `%LOCALAPPDATA%\ctsk-standalone-<12 hex>`. Fija directorio nuevo, base, puertos, clúster, huella de código y digest de configuración.
- Base obligatoria `ctsk_standalone_<12 hex>_test`; rol de ejecución `ctsk_standalone_runtime`; host obligatorio `127.0.0.1`. El nombre principal y su identidad de clúster están rechazados.
- Puertos 3000, 3443, 5432 y los puertos protegidos de laboratorios históricos están rechazados. El puerto HTTP y el de PostgreSQL deben ser distintos.
- Antes de conectar: comprobar ACL, ruta real del directorio, archivo PID, puerto, host y proceso del clúster nuevo. La preparación obtiene primero su identidad offline con `pg_controldata`.
- Antes de abrir sockets PostgreSQL: barrera de red que solo admite el puerto PostgreSQL del manifiesto en loopback. No permite conexiones a proveedores ni a 5432.
- Reutiliza `verifyPostgresWithIdentity`: transacción READ ONLY, base/usuario/dirección/puerto/versión, identidad de clúster, rol sin privilegios elevados ni propiedad y verificación completa de esquema heredada. Añade comprobación de las columnas de publicación 018 que usa la API actual.
- Solo monta Express después de verificar todo y releer configuración e integridad. Durante el arranque devuelve 503. Un puerto ocupado se rechaza sin consultar ni terminar al ocupante y antes de conectar a PostgreSQL.
- El pool sigue centralizado en `backend/config/database.js`. Solo el perfil `standalone-development` usa el puerto aislado; la modalidad habitual conserva 5432.
- En el laboratorio se bloquean las rutas de receptores y controles de integraciones. No se inicia sincronización Gmail ni FareHarbor y no se consultan sus archivos privados.

Electron comprueba un reto aleatorio firmado con HMAC-SHA256 mediante una clave privada exclusiva del laboratorio. La prueba vincula PID, entorno, código, manifiesto, configuración, base, clúster y puerto. Una respuesta HTTP 200 o la salud habitual no autorizan la conexión. El secreto no viaja por HTTP, argumentos, entorno o logs. El cliente revalida periódicamente y se cierra si pierde la identidad del servidor; no tiene handle ni endpoint de terminación del backend.

El endpoint nuevo `/api/local-service/challenge` sirve solo para identificar el proceso local. No autentica al usuario ni sustituye JWT, roles o alcances en la API. El servidor exige el Host exacto `127.0.0.1:<puerto>`.

## Preparar un laboratorio nuevo

Requisitos: Windows, dependencias del repositorio ya instaladas y binarios PostgreSQL **18.3** en `C:\Program Files\PostgreSQL\18\bin`. No ejecutar `npm install`, migraciones o scripts históricos como parte de este procedimiento.

Desde una PowerShell normal, en la raíz del repositorio:

```powershell
Set-Location 'A:\sistema-integrador-reservaciones'
.\scripts\StandaloneDev.ps1 -Mode Prepare
```

El preparador crea únicamente una carpeta nueva privada, verifica sus ACL antes de iniciar PostgreSQL, inicializa un clúster vacío con autenticación SCRAM y genera credenciales sintéticas nuevas. No cambia credenciales existentes. Después de comprobar identidad efectiva y ausencia de bases ajenas, crea su base aislada y aplica allí `database/schema.sql`; no utiliza respaldos ni datos principales. Crea dos usuarios sintéticos, Administrador y Consulta.

Imprime una línea `MANIFEST C:\...\manifest.json`. Conservar esa ruta. El clúster de laboratorio queda iniciado, sin registrar servicio ni tarea. Los archivos `runtime.env`, `service.key` y `test-user.json` son privados y no deben copiarse a Git. Nunca utilizar credenciales productivas en este perfil.

## Iniciar y detener durante las pruebas

En una consola PowerShell nueva sin variables DB/PG/APP/Node/proveedor heredadas:

```powershell
Set-Location 'A:\sistema-integrador-reservaciones'
$manifest = 'C:\RUTA-IMPRESA-POR-PREPARE\manifest.json'
node .\backend\standalone.js --manifest $manifest
# Alternativa: npm run backend:independent -- --manifest $manifest
```

Esperar `STANDALONE_READY`. La salida contiene únicamente entorno, host, puerto y PID. No acepta host LAN, destino principal ni opciones para omitir verificaciones. Si hay variables incompatibles, usar una consola limpia; no sobrescribir configuraciones existentes para forzar el arranque.

Desde otra consola:

```powershell
Set-Location 'A:\sistema-integrador-reservaciones'
$manifest = 'C:\RUTA-IMPRESA-POR-PREPARE\manifest.json'
npm run desktop -- --ctsk-mode=independent-dev "--ctsk-manifest=$manifest"
```

Cerrar esa ventana Electron: el backend debe continuar en su consola. Para detener el backend, pulsar **Ctrl+C en su propia consola**; cierra listener y pool. No usar terminación por nombre de proceso ni cerrar PostgreSQL principal. El cierre permite terminar solicitudes en curso y tiene un límite de ocho segundos antes de forzar la salida del proceso del backend.

Después de detener el backend, detener únicamente el clúster del laboratorio:

```powershell
.\scripts\StandaloneDev.ps1 -Mode Stop -Manifest $manifest
```

`Stop` verifica el manifiesto, la configuración y la identidad local del proceso antes de ejecutar `pg_ctl -D <directorio nuevo>`. No elimina carpetas ni datos. Si el código cambió desde Prepare, la huella impide reutilizar el manifiesto: detener el laboratorio antes de editar y preparar uno nuevo para el siguiente ensayo. No editar hashes para saltarse un rechazo.

## Verificación automatizada

Sin PostgreSQL real, suites explícitas y sin TRUNCATE:

```powershell
node node_modules/jest/bin/jest.js --config backend/__tests__/standalone.jest.config.cjs --runInBand --runTestsByPath backend/__tests__/standalone.test.js backend/__tests__/release03aStartup.test.js backend/__tests__/release03aPolicy.test.js backend/__tests__/release03aProcesses.test.js backend/__tests__/printBranding.test.js
```

La configuración bloquea `pg` real y restringe red de pruebas. No ejecutar `npm test` global ni `api.test.js` como sustituto.

Ensayo real, siempre con un clúster nuevo y datos sintéticos:

```powershell
.\scripts\StandaloneDev.ps1 -Mode Verify
```

El ensayo valida configuración, identidad, rol y esquema reales; arranca la entrada Node; comprueba API sin sesión y con login sintético; importa el `electron/main.js` real dentro del driver Electron; comprueba sandbox, login y lectura de API; cierra normalmente la ventana Electron y espera que termine ese proceso; vuelve a consultar la API autenticada para demostrar que el backend sigue vivo. Finalmente termina únicamente el proceso Node creado por el ensayo, comprueba liberación del puerto y detiene su clúster. La terminación Node del harness es una terminación explícita de su hijo; el cierre ordenado de listener/pool se comprueba además en las pruebas unitarias.

La evidencia sin secretos queda en `verification.json` dentro del laboratorio. No se utiliza ni se ejecuta TRUNCATE en estos ensayos.

## Resultados y límites

- Cinco suites seleccionadas: **155 pruebas aprobadas**, incluyendo política aislada, rechazos antes de PostgreSQL, errores de identidad/rol/esquema, configuración alterada, exclusión de integraciones, HMAC/replay, caída o reemplazo del servidor, arranque heredado y PDF.
- Ensayo real PostgreSQL/Electron: backend disponible antes de abrir Electron, login sintético, cierre normal del Electron real y API autenticada disponible después. Puerto liberado al terminar el backend. Clúster desechable detenido al finalizar.
- La suite adicional existente `notificaciones.electron.test.js` falla por solicitudes `/api/eventos-integracion/centro` que su API ficticia no contempla. Ese harness carga el frontend directamente; no usa el main modificado. El frontend y ese harness ya tenían cambios locales anteriores y no se modificaron en esta fase. El fallo se informa y no se oculta ni se corrige ampliando el alcance.
- El primer ensayo rechazó las ACL de TEMP porque ese ancestro permite modificación a otras identidades. Se mantuvo la protección, no se abrió conexión PostgreSQL en esos intentos y se detuvieron los dos clústeres vacíos nuevos tras verificar rutas, PID, comando e identidad offline. El preparador usa ahora una carpeta nueva bajo LOCALAPPDATA y comprueba ACL antes de iniciar PostgreSQL; no cambió permisos de carpetas existentes.
- La modalidad heredada queda disponible y sus pruebas pasan. No se abrió Electron contra principal ni se verificó producción, conforme al alcance.

Evidencia del ensayo final: `C:\Users\luisg\AppData\Local\ctsk-standalone-b7b6f1707462\verification.json`. Registra `completed=true` y `postgresStopped=true`, base sintética `ctsk_standalone_963f2b95f326_test`, PostgreSQL en 55609 y API en 55610. Son puertos de ese ensayo ya detenido, no configuración para producción. Un nuevo Prepare genera otros destinos.

Comparación SHA-256 contra el comienzo: 633 archivos existentes permanecen idénticos, ninguno falta y solo cambiaron los cuatro archivos previstos enumerados abajo. Los diez archivos nuevos pertenecen a esta fase. Los cuatro clústeres creados durante los intentos/ensayos tienen su archivo `postmaster.pid` retirado tras la parada; no quedó ningún laboratorio iniciado por esta tarea.

No se alteraron base principal, integraciones reales, certificados, ngrok, credenciales existentes, tareas programadas o firewall. El código no habilita LAN. Los cambios locales ajenos se conservaron.

## Archivos y reversión

Modificados:

- `electron/main.js`: opción explícita de cliente independiente, perfil separado, origen/puerto verificados y vigilancia sin propiedad del servidor.
- `backend/config/database.js`: puerto del perfil de desarrollo aislado; comportamiento principal conservado.
- `package.json`: comando adicional `backend:independent`.
- `README.md`: referencia a este procedimiento.

Nuevos:

- `backend/standalone.js`: ciclo de vida independiente y composición segura de la API.
- `backend/config/standalonePolicy.js`: contrato aislado, verificaciones y prueba de identidad local.
- `electron/independentBackend.js`: conexión autenticada al proceso autorizado y vigilancia.
- `scripts/StandaloneDev.ps1`, `scripts/standaloneDev.cjs`: preparación, prueba y parada del clúster nuevo.
- `scripts/standaloneElectronCheck.cjs`, `scripts/standaloneElectronDriver.cjs`: prueba del main real sin acceso a principal.
- `backend/__tests__/standalone.test.js`, `standalone.jest.config.cjs`: verificaciones aisladas.
- Este informe.

Reversión operativa: cerrar el Electron de desarrollo, detener Node con Ctrl+C y detener su clúster con el manifiesto original antes de cambiar código. Abrir después la modalidad habitual **sin** `--ctsk-mode=independent-dev` ni `--ctsk-manifest`. No hay migración productiva que revertir, tarea que desinstalar o credencial existente que restaurar. Si se decide retirar el código, revertir solo los cambios enumerados tras revisión; no usar reset/clean ni descartar cambios anteriores.

## Antes de Fase 2

Revisar y aprobar este contrato, resolver la regresión preexistente de avisos y aceptar el ensayo local. Después diseñar origen HTTPS/LAN, confianza del servidor, direccionamiento estable y firewall limitado. La supervivencia al cierre de PowerShell y el arranque de Windows requieren un supervisor posterior. Las estrategias de recuperación nocturna de FareHarbor/GetYourGuide, instalación final y despliegue productivo siguen pendientes de decisiones separadas. No ampliar escucha a LAN ni sustituir configuración principal con este perfil de desarrollo.
