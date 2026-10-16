# ACCESS-SCOPE-05A - Instalador Windows y aceptación en preproducción

## Resultado

**64 verificaciones automatizadas aprobadas, 0 fallos**, ejecutando el binario
extraído del instalador final con Electron, Express y PostgreSQL reales.
**617 pruebas de regresión aprobadas en 28 suites**, incluidas dos nuevas de
manejo seguro de errores del pool PostgreSQL.

**No se realizó instalación, actualización ni desinstalación real.** El usuario
confirmó que no existe VM desechable ni equipo de preproducción disponible.
Esas pruebas están BLOQUEADAS y no se sustituyen por la ejecución del binario.
La aceptación humana está PENDIENTE. El instalador no se declara apto para producción.

## 1. Entorno y separación

Laboratorio final:

| Propiedad | Valor comprobado |
| --- | --- |
| Host PostgreSQL | 127.0.0.1 |
| Puerto PostgreSQL | 53043 |
| Base | access_scope_05a_09ee03d10487_test |
| Usuario | access_scope_lab |
| PostgreSQL | 18.3 |
| Esquema | public, con ACCESS-SCOPE incluido en schema.sql |
| System identifier | 7696684799843614984 |
| Directorio de datos | A:/sistema-integrador-reservaciones/.access-scope-lab/05a-09ee03d10487/data |
| HTTP local | 127.0.0.1:3000 |
| Electron / Chromium | 43.4.1 / 150.0.7871.224 |
| Windows observado por el build | 10.0.19045, x64 |

Se creó otro cluster mediante initdb ya instalado. Antes de escribir se
comprobaron base, usuario, dirección, puerto y directorio, y se registró la
identidad física. La instancia solo escuchó en loopback. Datos: cinco usuarios,
cinco plataformas, dieciséis tours, un país, cuarenta y dos reservas iniciales,
una operación y un transporte, todos sintéticos. Las nuevas pruebas agregaron
solo registros sintéticos de laboratorio. No se copiaron datos personales reales.

Se usó el esquema completo, que ya contiene 016. No se volvió a ejecutar la
migración. Se comprobó la tabla puente. La identidad del destino se volvió a
verificar al reiniciar PostgreSQL durante la prueba de recuperación.

El perfil de Electron se fijó dentro del laboratorio ANTES de ejecutar el
entrypoint, mediante el depurador local. El backend cargó el config.env sintético
de ese perfil. Se retiraron del entorno heredado las variables de DB, PostgreSQL,
JWT y proveedores para comprobar el uso real de config.env. No recibió secretos
productivos. No se invocaron APIs reales de FareHarbor, GetYourGuide, Meta o
WhatsApp; el worker GetYourGuide estuvo deshabilitado. Se bloqueó la red externa
del renderer durante la batería funcional.

La conexión de la empresa, localhost:5432/sian_kaan_reservaciones, solo recibió
SELECT con default_transaction_read_only=on. Esquema y conteos coincidieron antes
y después. Una comprobación final confirmó que la columna y tabla puente 016
siguen ausentes. No se modificó .env ni se ejecutaron migraciones sobre la empresa.
La comparación de conteos no es un checksum de cada valor real: la protección
procede de las conexiones verificadas y del modo explícito de solo lectura.

## 2. Instalador generado

| Campo | Artefacto final |
| --- | --- |
| Nombre | Sistema-Integrador-Reservaciones-1.0.0-x64.exe |
| Versión | 1.0.0, sin cambiar la versión del proyecto |
| Arquitectura | Windows x64; x86/ARM64 no están configuradas ni certificadas |
| Generación UTC | 2026-10-15T00:26:48.188Z |
| Tamaño | 106439091 bytes |
| SHA-256 | 596b86a5760fa7dbea4c386f0f130ded4c1a10da54bac2da97fc06999e9497f0 |
| Herramienta | electron-builder 26.15.3 |
| Tipo | NSIS asistido, por usuario |
| Firma Authenticode | NotSigned |
| Publicación | Ninguna; build final con --publish never |

Ubicación:
`A:/sistema-integrador-reservaciones/.access-scope-lab/05a-build-7703bfb9a1eb/Sistema-Integrador-Reservaciones-1.0.0-x64.exe`.

Se conservó el instalador anterior en dist. Los builds de prueba se generaron en
salidas nuevas dentro del laboratorio. El primer intento trató de descargar
Electron y falló por restricción de red. Se utilizó electronDist apuntando a la
distribución 43.4.1 ya instalada, con la misma herramienta/procedimiento existente.
El build final terminó con código 0. No se instaló otra herramienta.

El log menciona signtool, pero eso no certifica firma. Get-AuthenticodeSignature
comprobó NotSigned. Windows puede mostrar advertencias de editor desconocido y
SmartScreen; no se desactivó ni eludió ningún control. Firma, reputación y política
de distribución deben resolverse antes de liberar el instalador.

## 3. Contenido y arranque empaquetado

ASAR habilitado. Electron/main y preload se cargan desde app.asar. Backend,
frontend y dependencias productivas están disponibles en app.asar.unpacked.
Express se inicia con el mismo ejecutable Electron y ELECTRON_RUN_AS_NODE=1,
backend/server.js como argumento y windowsHide=true. El frontend consulta HTTP;
no se introdujo acceso PostgreSQL desde renderer.

La aplicación empaquetada requiere config.env en app.getPath('userData'), con
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD y JWT_SECRET. No crea configuración
productiva automáticamente. Se comprobaron los errores de archivo ausente e
incompleto antes de iniciar el backend. En una instalación normal el perfil
pertenece al usuario Windows; aquí se redirigió exclusivamente al laboratorio.

No hay servicio Windows ni actualizador automático configurado. NSIS admite
reemplazo de una instalación con el mismo appId, pero ese ciclo NO se ejecutó.
La plantilla actual conserva userData por defecto al desinstalar, salvo opciones
explícitas de borrado; esto es revisión de diseño, no resultado de desinstalación.

Se extrajo el payload del NSIS con 7-Zip ya disponible, sin ejecutar su instalador.
Su app.asar coincide con el build:
`31afe69a024bcb2cf9b47b7a027b415075c5a168d7f2b13176a081297844de68`.
Se auditó el payload extraído: **3383 archivos comprobados, 0 incidencias**.
No se encontraron .env/config.env, respaldos, bases, pruebas ni fixtures de
prueba. Tampoco coincidencias con los valores sensibles configurados comparados
en memoria; no se imprimieron esos valores. Esto no es una certificación universal
de ausencia de cualquier secreto desconocido.

La auditoría inicial detectó pruebas de pg-protocol y fixtures GetYourGuide.
Se añadieron exclusiones específicas de pruebas/fixtures, config.env, logs,
respaldos, secrets y laboratorios en package.json. No se cambiaron herramienta,
target, arquitectura, versión ni esquema.

Logs del build, informes, config sintética, respaldos, perfiles, PDF y PNG se
conservaron bajo .access-scope-lab, excluido de distribución. Las sesiones/JWT del
frontend siguen siendo de memoria. No existe una ruta persistente de logs de
aplicación configurada por el producto: el validador capturó stdout/stderr en archivos
del laboratorio. Electron maneja sus caches en userData y la ruta de PDF se elige
mediante el diálogo; en las pruebas se dirigió únicamente al laboratorio.

## 4. Ejecución real y límites de instalación

Se ejecutó el EXE extraído del instalador final, sin cargar electron . ni un
servidor de desarrollo. El debugger confirmó app.isPackaged=true, process.execPath,
resourcesPath y el perfil temporal. El cwd fue una carpeta vacía del laboratorio.
El backend arrancó desde los recursos del payload y usó sus dependencias.
El entrypoint y ASAR no fueron alterados para las pruebas.

Se reutilizó la batería 04B mediante instrumentación del proceso real con Node
Inspector local. Se mantuvieron sandbox=true, contextIsolation=true,
nodeIntegration=false y webSecurity=true. Se automatizaron destinos de diálogos
nativos y se interceptó la salida física window.print; printToPDF y el IPC del
producto fueron reales. El harness utiliza archivos de fixture y control propios;
la aplicación y su backend funcionan desde los recursos empaquetados, no desde
fuentes del directorio de desarrollo.

La reapertura del EXE exigió nuevo login y conservó en PostgreSQL usuarios,
modos all/selected y asignaciones creadas por la interfaz. Se verificó también
recuperación después de reiniciar la DB y reabrir la aplicación.

No se comprobaron: wizard NSIS instalado, accesos normales de Windows, registro,
actualización sobre instalación anterior, desinstalación, permisos de instalación,
limpieza real por NSIS ni interacción humana con diálogos. La ausencia visual de
consolas en un inicio desde acceso Windows sigue pendiente; el código y la ejecución
automatizada usan windowsHide. No se certifica compatibilidad de un binario anterior
con selected ni con el esquema nuevo.

## 5. Autenticación, Dashboard y Reservaciones

Los cuatro perfiles iniciaron sesión mediante formulario real del binario:
Administrador, Consulta all, selected GetYourGuide/FareHarbor y selected vacío.
Se comprobó GET /api/auth/sesion y el perfil mostrado. Consulta all mantuvo lectura
previa; no pudo escribir ni administrar permisos. Selected vio solo Dashboard y
Reservaciones. Navegación interna y APIs excluidas se bloquearon según rol/alcance.

Dashboard selected coincidió con API: 28 reservas vigentes / 56 PAX, resumen
parcial, recientes autorizadas y ausencia de planificación global. Sin plataformas:
conteos y PAX cero. Se probaron búsquedas por nombre/código/fecha, filtro de plataforma,
filtros combinados, paginación 25 + 5 con total 30, vacíos, detalle autorizado y
404 idéntico para ID oculto/inexistente. La reserva autorizada de 2020 siguió accesible.

Se comparó DOM de Electron real con respuestas HTTP/SQL. La captura de Dashboard
en ventana oculta resultó vacía y no se usa como evidencia visual de esa pantalla.
La revisión humana de la presentación de todas las vistas sigue pendiente.

## 6. Administración, revocación y sesiones

Desde Usuarios real se crearon Consulta all y selected; se reemplazaron/retiraron
plataformas, se cambió all-selected-all y Administrador-Consulta con elección
explícita. SQL verificó persistencia, incluida la reapertura. IDs inválidas fueron
rechazadas sin cambios parciales. Consulta no pudo administrar sus permisos.

Dos Administradores concurrentes obtuvieron 409/200 al intentar desactivar al otro,
con uno activo restante. Ediciones simultáneas de alcance no mezclaron asignaciones.
Las dos ventanas tuvieron sesiones/JWT independientes dentro del ejecutable real.
No se presenta esto como prueba de dos instalaciones Windows diferentes.

Revocación: siguiente solicitud con el mismo JWT rechazó la lectura; foco/acción
retiraron detalle, datos y métricas anteriores. La periodicidad conservó 30 segundos;
detección en 28,767 segundos de espera dentro de ese ciclo. Se comprobaron búsqueda
pendiente mediante bloqueo SQL, descarte después de logout, cambio de usuario/rol,
desactivación y error real de tabla sin fallback de acceso completo.

## 7. IPC, impresión y PDF

Se verificaron protección de reserva oculta, rechazo de Daily/PDF selected,
verificación desde el proceso principal, renovación antes de imprimir, llamada
IPC directa selected y revocación mientras Daily/diálogo PDF estaban abiertos.
Administrador conservó impresión y exportación autorizadas. No hubo envíos físicos.

PDF reales: reservacion-selected.pdf y daily-admin.pdf, ambos de una página.
Se extrajo el texto, se renderizaron todas sus páginas y se revisaron ambas imágenes
completas: contenido legible, sin recortes/superposiciones ni información excluida.
El código autorizado fue VISIBLE-2, con cliente y nota sintéticos. Los PDF/PNG están
en .access-scope-lab/05a-09ee03d10487. La selección humana del destino y los drivers
de impresoras físicas no forman parte de esta aprobación automática.

## 8. Defecto real y recuperación PostgreSQL

La primera prueba de desconexión física del cluster produjo un error no manejado
del pool pg en un cliente inactivo; Express terminó con código 1 y Node volcó el
objeto de cliente sintético en el log. Los permisos fallaron de forma segura,
pero el cierre y ese registro eran defectos relevantes para recuperación.

Corrección mínima en backend/config/database.js: manejar el evento error del pool,
registrando solo una etiqueta fija y código del error, sin objeto de cliente,
credenciales ni detalle. Las consultas siguen fallando normalmente; no se otorgan
permisos por fallback. El helper noPostgres ahora simula EventEmitter y se añadieron
dos pruebas que detectan evento no manejado y volcados sensibles.

El instalador se reconstruyó después de esta corrección. En la ejecución final,
Express permaneció activo al detener realmente PostgreSQL, la sesión se limpió,
el pool reconectó al restaurar la misma instancia y el login volvió a funcionar
sin reiniciar Express. La reapertura posterior también funcionó.

Errores corregidos del validador: normalización de rutas Windows en ASAR, extracción
NSIS con payload directo, cierre/timeout de Inspector y espera para consultar
BrowserWindow tras inicialización. Un intento necesitó detener manualmente su
validador y cluster identificados por PID/ruta exactos. Todos los intentos previos
se conservan; sus fallos no se presentan como aprobados. La ejecución final tiene
64 aprobadas / 0 fallos.

## 9. Regresiones y evidencia

617 pruebas en 28 suites aisladas, sin PostgreSQL real mediante noPostgres.
api.test.js se excluyó porque usa persistencia; la validación real fue el nuevo E2E.
Incluye integraciones simuladas, reservas, cancelaciones, Dashboard, Daily,
operaciones, capacidad, bitácora y sesiones. La batería del EXE cubre también IPC
e impresión. En el EXE se crearon/editaron/
cancelaron reservas con tres entradas de bitácora; asignación concurrente aplicó
12 PAX por grupo, dos grupos completaron 24 y se rechazaron grupo 3/vehículo 13.

64 comprobaciones del EXE: 56 escenarios funcionales, 7 de arranque/reapertura/
recuperación y una inspección automática PDF. La auditoría de 3383 archivos y
revisión visual PDF son evidencias adicionales. No se marcaron pruebas manuales
como aprobadas.

Evidencia final:

- .access-scope-lab/05a-build-7703bfb9a1eb: NSIS, payload extraído, manifest de archivos,
  verificación SHA, metadata, configuración efectiva y blockmap sin publicar.
- .access-scope-lab/05a-09ee03d10487: report.json, packaged-report.json,
  packaged-extra.json, identidades runtime, logs, fixtures/config sintéticos,
  respaldos before-e2e.dump/after-e2e.dump, PDF, textos e imágenes.

## 10. Limpieza

Sesiones cerradas; EXE, backend y PostgreSQL de pruebas detenidos.
report.json: processes_stopped=true, cluster_stopped=true. No queda postmaster.pid.
Consulta Win32_Process por ruta exacta del artefacto: cero procesos restantes.
Los puertos del Inspector pertenecieron a procesos ya cerrados; no se dejaron
servicios de prueba. No se borraron automáticamente evidencias ni datos.
No se ejecutó Git, instalador, migración de empresa ni publicación.

## 11. Matriz y aceptación pendiente

[Matriz de 35 casos para ejecución humana](ACCESS-SCOPE-05A-aceptacion.md), con
caso, perfil, acción, esperado, observado, estado y evidencia. Todos pendientes;
instalación/actualización/desinstalación bloqueadas por ausencia del entorno.
Campos para responsable, VM, fecha, hash y versión anterior están disponibles.
Se debe completar con ejecución real y evidencia, sin copiar estados automáticos.

## 12. Archivos y reproducción

Creados:

- scripts/auditarAccessScopePaquete.cjs
- scripts/extraerAccessScopeInstalador.cjs
- scripts/validarAccessScopeEmpaquetado.cjs
- scripts/validarAccessScopeEmpaquetadoDriver.cjs
- backend/__tests__/databaseErrors.test.js
- docs/ACCESS-SCOPE-05A.md
- docs/ACCESS-SCOPE-05A-aceptacion.md

Modificados:

- package.json: exclusiones de distribución; versión y targets conservados.
- backend/config/database.js: error de clientes inactivos del pool.
- backend/__tests__/helpers/noPostgres.js: EventEmitter para suites aisladas.
- scripts/revisarAccessScopePdf.py: acepta también directorios 05a del laboratorio.
- README.md: estado/enlaces de 05A.

No se modificaron package-lock.json, Electron, frontend, schema.sql, migraciones
ni .env en esta fase. La corrección 04B de Electron/impresión se conservó y probó
con el paquete final.

Reproducción en este host para payload, NO instalación:

```powershell
$taskBuildDirectory = '.access-scope-lab/05a-build-' + [guid]::NewGuid().ToString('N').Substring(0,12)
Set-Content -LiteralPath .access-scope-lab/05a-build-path.txt -Value $taskBuildDirectory
npm run dist:win -- --publish never --config.directories.output=$taskBuildDirectory --config.electronDist=node_modules/electron/dist
# Continuar solo cuando el build anterior haya terminado con codigo 0.
node scripts/extraerAccessScopeInstalador.cjs $taskBuildDirectory
node scripts/auditarAccessScopePaquete.cjs "$taskBuildDirectory/installer-extracted" "$taskBuildDirectory/package-audit.json"
node scripts/validarAccessScopeEmpaquetado.cjs

$taskUnitTestPaths = @(rg --files backend -g '*.test.js' | Where-Object { $_ -notlike '*api.test.js' })
node ./node_modules/jest/bin/jest.js --runInBand --setupFiles=./backend/__tests__/helpers/noPostgres.js --runTestsByPath @taskUnitTestPaths
```

El validador crea un cluster nuevo cada vez, verifica destino y exige puerto 3000
libre. No reutilizar una salida de build activa ni un perfil Windows productivo.
Requiere Node con WebSocket/getBuiltinModule, binarios PostgreSQL 18 existentes,
Electron/dependencias del proyecto y Python con pypdf/pypdfium2. ACCESS_SCOPE_PG_BIN,
ACCESS_SCOPE_PYTHON y ACCESS_SCOPE_7ZA permiten indicar herramientas ya instaladas.
El arranque de PostgreSQL/Electron requiere un contexto Windows que permita crear
sus procesos, como se documentó en 04A. No modifica configuraciones globales.

## 13. Riesgos que impiden liberar

Instalación/actualización/desinstalación y aceptación humana indispensables siguen
pendientes. No existe firma digital del editor. No se certifica convivencia con
versiones antiguas ni su respeto de selected. Falta validar el destino real de
configuración y ausencia de consolas al iniciar desde el acceso Windows instalado.
La aplicación comparte puerto 3000 y reutiliza un backend con la salud esperada;
la prueba aseguró puerto libre y no certifica convivencia con otro backend/destino.
Esas condiciones deben resolverse o restringirse en el entorno de despliegue.

La migración 016 continúa pendiente en la empresa; login/lecturas que la requieren
no están habilitados allí. No asumir preparación productiva por el éxito del payload.
Credenciales, backups y política de conservación de userData/config de producción
requieren aceptación del responsable, sin usar valores de prueba para producción.

## 14. Recomendación ACCESS-SCOPE-05B

Preparar VM Windows desechable/autorizada, sin instalación productiva con el mismo
appId y sin backend ajeno en 3000. Verificar hash/firma/política Windows, instalar
el NSIS por su flujo normal y completar la matriz. Probar actualización desde una
copia identificada por versión/hash, reinicios, configuración, sesiones simultáneas,
PDF con diálogo nativo y desinstalación/conservación de datos. No ampliar selected
hasta asegurar que todos los binarios usados respetan el alcance.

Después de esa aceptación, definir destino, responsables, ventana, respaldo con
restauración ensayada, registro de migración y recuperación. Una base nueva con
schema.sql no requiere repetir 016. Aplicarla a la base existente y cambiar una
conexión productiva necesita autorización independiente. Esta fase no realizó
ninguno de esos cambios.
