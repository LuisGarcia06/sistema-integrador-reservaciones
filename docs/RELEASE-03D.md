# RELEASE-03D — Diseño de copia protegida para Electron

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an. Original: `A:\sistema-integrador-reservaciones`. Rama `GYG+FRHB-implementado`, HEAD conservado `23d9ea21c04070aba3a49fd212d6a3106276c3a2`. Análisis de 18/10/2026, America/Cancun.

**DISEÑO LISTO CON OBSERVACIONES.** La ubicación candidata presenta ancestros compatibles con el criterio conservador del verificador. Su aprobación definitiva requiere crear y validar posteriormente directorios nuevos privados y un archivo de configuración propio. **No se creó la copia ni se autorizó el primer arranque.**

## 1. Alcance y antecedentes

Se revisaron AGENTS.md, RELEASE-03A/B/C, PRE-RELEASE-03-PROD/RESTORE/04/05 y los componentes de arranque, permisos Windows, configuración, backend, frontend, recursos, package.json/package-lock y dependencias instaladas. Se conservaron todos los cambios anteriores.

Se hicieron lecturas de fuentes y metadatos/ACL del sistema de archivos, resolución estática del grafo de dependencias y SHA-256 de archivos públicos seleccionados. No se importó Electron, servidor, clientes de proveedores o pool PostgreSQL; no se ejecutó npm, instalador, sincronizador o herramienta de base de datos. Las únicas escrituras son documentos, inventariador estático y evidencia pública dentro del repositorio.

RELEASE-03C confirmó principal por IPv4 en 5432 y el clúster histórico, sin 017 y sin runtime limitado. Es **evidencia anterior**: RELEASE-03D no conecta nuevamente a principal, DEV ni laboratorios y no certifica un estado PostgreSQL posterior.

## 2. Por qué no ejecutar desde A:

RELEASE-03C encontró permisos heredados de lectura/escritura ajena en `.env` y su contenedor; `A:\` permite Modify a Authenticated Users. `windowsConfigAcl.js` verifica también derechos de eliminación/sustitución desde ancestros, no solo lectura del archivo. Proteger únicamente `.env` no resuelve esa cadena.

El original permanece para desarrollo, con su `.env`, Git, laboratorios y permisos actuales. No se cambiarán ACL de A: como consecuencia de este diseño. Una copia aprobada separa la ejecución de las modificaciones posteriores de A:, pero **no vuelve confiables automáticamente las fuentes que se reciben de esa unidad**.

## 3. Ubicación recomendada y ACL observadas

Candidata preferida, todavía sin crear:

```text
C:\Users\luisg\AppData\Local\CommunityTours\secure-runtime
```

Corresponde a `%LOCALAPPDATA%\CommunityTours\secure-runtime` bajo la cuenta Windows actual. `CommunityTours` y `secure-runtime` no existían en el inventario. Alternativa también inexistente: `%LOCALAPPDATA%\CommunityToursRuntime`, con los mismos ancestros existentes.

| Ancestro existente | Propietario | Lectura de permisos y resultado |
|---|---|---|
| LocalAppData | Usuario Windows actual | FullControl del usuario; otro SID tiene lectura/ejecución, sin derechos incompatibles de sustitución. |
| AppData | Usuario Windows actual | Igual criterio; el usuario tiene FullControl. |
| Perfil `C:\Users\luisg` | SYSTEM | Usuario actual con FullControl; sin ALLOW ajeno incompatible. |
| `C:\Users` | SYSTEM | Lectura/ejecución pública; reglas de escritura amplias solo InheritOnly, no aplicables al ancestro mismo. |
| `C:\` | TrustedInstaller | Lectura/ejecución y creación de subcarpetas por Authenticated Users; no derechos ajenos de sustitución del ancestro según la máscara del verificador. |

No se encontraron reparse points en estas cadenas. Los propietarios están entre los SIDs confiables del verificador. Las reglas ajenas efectivas sobre los ancestros no intersectan su máscara **852032** de sustitución/DACL/propietario; las reglas InheritOnly se evalúan como en el código vigente. No se modificaron propietarios ni reglas para obtener ese resultado.

**Evaluación favorable, condicionada:** al crear posteriormente `CommunityTours`, la raíz privada y sus hijos, bloquear herencia **solo en esos directorios nuevos** y conceder únicamente usuario actual/SYSTEM. Dejar que hereden sin restricción permitiría lectura del otro SID presente en LocalAppData, incompatible con secretos privados. Validar después el archivo y toda su cadena con `windowsConfigAcl.checkAcl()` real. Hoy no existe ese archivo: no se afirma que una `.env` futura ya haya pasado el verificador.

NTFS en C:, aproximadamente **32.727.973.888 bytes libres —30,48 GiB—** en la lectura. FullControl actual sobre LocalAppData permite prever creación; no se efectuó una sonda de escritura, por lo que antivirus, cuota o denegación posterior siguen siendo posibles. Repetir espacio, ACL y enlaces antes de crear. La propuesta exige al menos **3 × tamaño del payload + 1 GiB** libre, unos 2,59 GB para el candidato actual, además de revisar crecimiento de perfiles y versiones retenidas.

Si la ruta cambia, existe previamente con ACL no privadas o no satisface el verificador: detenerse y evaluar la alternativa, sin reparar automáticamente carpetas existentes. La protección se limita a otras identidades no autorizadas: usuario propietario, SYSTEM o administrador que controle el equipo pueden modificar código/secretos. No acredita seguridad integral del equipo empresarial.

## 4. Estructura propuesta

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\
  admin\
    approved-manifests\     manifiestos aprobados, sin secretos
    update-records\         resultados de copias, sin tokens/credenciales
    UpdateSecureRuntime.ps1 herramienta revisada, custodiada fuera de A:
  releases\
    r-<UTC>-<hash12>\
      package.json
      package-lock.json
      electron\
      backend\
      frontend\
      node_modules\
      .env                  preparación privada independiente posterior
```

No hay junction, symlink, carpeta `current` redirigida ni sincronización automática con A:. La selección consiste en entrar explícitamente a la versión aprobada. Cada actualización crea otro ID; no reemplaza carpetas activas, no elimina versiones anteriores y no modifica PostgreSQL. Un cambio de carpeta **no exige una migración adicional**; 017 continúa siendo un requisito independiente.

El inventariador no copia `.env`. La preparación posterior de configuración se realiza por separado, con autorización de custodia: la nueva versión empieza sin `.env` y no puede usarse para abrir principal hasta completarla. El archivo de una versión anterior no se sobrescribe. Reutilizar valores aprobados de una configuración protegida anterior requiere intervención privada explícita; nunca copiar automáticamente `.env` de A:.

## 5. Inventario preciso del candidato

`docs/release-03d/manifest-candidato.json` enumera **cada ruta relativa, longitud y SHA-256**; está marcado `CANDIDATE_NOT_APPROVED`, sin referencia de aprobación. No es una copia ni un paquete autorizado.

| Conjunto | Archivos |
|---|---:|
| Backend completo sin pruebas/fixtures | 106 |
| Electron: main, preload y ownedBackend | 3 |
| Frontend y recursos corporativos | 27 |
| package.json y package-lock.json | 2 |
| Dependencias y shims locales de Electron | 3.167 |
| **Total** | **3.305** |

Tamaño total: **506.316.063 bytes, aproximadamente 483 MiB**. Aplicación: 1.774.251 bytes. Se seleccionaron **137 paquetes instalados**, cierre transitivo de las ocho dependencias declaradas de aplicación más Electron y sus dependencias/peers instalados, resolviendo sus ubicaciones reales contra lockfile v3. Se contrastaron versiones de package.json instalados con las entradas del lock.

El lock contiene 674 entradas de paquetes; no es necesario copiar todo el entorno de desarrollo. La copia mínima propuesta no incluye Jest, supertest o electron-builder salvo que apareciesen en el cierre requerido —no ocurre con las herramientas principales actuales—. **No es una instalación de desarrollo completa**: conserva el package.json/lock original como trazabilidad, pero solo se habilita el uso operacional de `desktop`, no test/build/install desde esa copia.

Elementos necesarios:

- Backend: configuración, guardias, middleware, validadores, rutas, controladores, servicios, constantes e integraciones existentes. Conservar módulos de integración no habilita recepción; hay imports compartidos y funciones de aplicación/archivo.
- Frontend: HTML, CSS, JavaScript, páginas, logo `frontend/assets/branding/community-tours-sian-kaan-logo.jpg`, etiquetas de transportes, archivo, notificaciones y controles ACCESS-SCOPE reales. No se replica una pantalla ni se incorpora el simulador.
- Electron completo: `node_modules/electron`, `path.txt=electron.exe`, `dist` con ejecutable, DLL, locales/recursos y licencias; `node_modules/.bin/electron`, `.cmd` y `.ps1` existentes. No copiar solo electron.exe.
- Paquetes completos seleccionados y sus datos/licencias. No se podan arbitrariamente archivos internos de proveedores npm por extensión o por apariencia de ejemplo; el manifiesto registra lo incluido. Las pruebas/fixtures de la aplicación sí se excluyen expresamente.

SHA-256 del **manifiesto candidato de esta lectura**, antes de cualquier aprobación:

```text
dd35108bb2cf0afa9ae5660a68dc626075ba4e347b0df14c0593ca4faddaa17b
```

Cambiar estado/referencia de aprobación cambia ese hash: la aprobación posterior debe custodiar el **nuevo hash exacto**, no reutilizar el anterior por costumbre. No se incluyen secretos, hashes de configuración, filas PostgreSQL o credenciales en los manifiestos.

## 6. Exclusiones

No copiar `.git`, `.env`/`.env.*` originales, `config.env`, `.npmrc` del usuario/proyecto, `secrets`, DPAPI, respaldos, dumps, `.access-scope-lab`, laboratorios, bases, logs, evidencia privada, perfiles Electron, caches, dist de instaladores, referencias de diseño, documentos, migraciones/schema/seeds ni herramientas administrativas del proyecto.

Excluir pruebas y fixtures de aplicación: `backend/__tests__`, `backend/integrations/getyourguide/__tests__` y `__fixtures__`; no incluir los controles de PRE-RELEASE-05. Ninguno se borra del original. El inventario encontró **cero nombres sospechosos de .env/.npmrc/DPAPI/dump/log en los paquetes seleccionados**; esto no equivale a una auditoría completa de contenido o vulnerabilidades de proveedores npm.

No son necesarios los lanzadores históricos DEV/ProdAccessTest, backup/restauración o preview dentro de la copia operativa. Las referencias condicionales a `scripts/devDb02.cjs` y `scripts/prodAccessTest.cjs` en main solo pertenecen a modos explícitos antiguos: no activar sus flags/variables. No se habilitan esos modos desde la nueva copia; una invocación incompatible debe detenerse, sin buscar sus archivos en A:.

## 7. Dependencias, herramientas y rutas

Lectura local: Node **22.20.0 x64**, npm **10.9.3**, Electron **43.4.1**. Node/npm localizados bajo `C:\Program Files\nodejs`. Electron declara Node >=22.12.0 para su CLI; npm declara ^18.17.0 o >=20.5.0. No se ejecutaron binarios de Electron o instaladores para obtener estas versiones.

Se propone inicialmente copia offline de los archivos instalados **solo si sus hashes/procedencia y plataforma han sido aprobados**. Reutilizar dependencias instaladas en A: no acredita su autenticidad. El integrity del lock corresponde al artefacto distribuido, no es una certificación de cada archivo instalado ni del binario descargado de Electron.

Se encontraron binarios nativos distribuidos por `@electron-internal/extract-zip`, incluida variante win32-x64, además de variantes de otras plataformas. Se conservan como parte del paquete; no se recompilan. `pg-native` y el peer opcional `encoding` no están instalados y se registran como opcionales ausentes, igual que en el origen. pg y bcryptjs de aplicación mantienen sus implementaciones JavaScript.

No parece necesaria una reconstrucción para trasladar este árbol en el mismo Windows/x64 y versiones acreditadas; falta probarlo después en una fase autorizada. Otro sistema/arquitectura, archivo ausente o dependencia nativa incompatible requiere preparación específica. Si la procedencia no es aceptable, autorizar instalación/obtención verificada en un área de preparación nueva: **no ejecutar npm ci/install/rebuild o descargas dentro de una versión activa**. Cambiar dependencias exige manifiesto y revisión nuevos.

`npm ci --omit=dev` por sí solo no prepara esta modalidad: Electron está en devDependencies. Una instalación nueva con scripts también puede descargar Electron. No se ejecutó ningún npm install/ci ni descarga en RELEASE-03D.

Rutas examinadas:

| Componente | Resolución desde la copia |
|---|---|
| `electron/main.js:getRuntimeRoot()` | Raíz relativa a su propio __dirname; .env del nuevo directorio de versión. No busca el .env de A:. |
| ownedBackend / desktopChild | Hijo y backend de esa misma raíz, código/configuración contrastados por IPC, nonce, PID y huellas. |
| Backend estático | `backend/../frontend`; recursos de la misma versión. |
| Pool normal | Configuración privada inicializada; 127.0.0.1:5432 literal. Sin fallback al .env original. |
| Daily/PDF | HTML/recursos locales y motor Chromium/Electron; salida elegida por el usuario. No requiere copiar PDFs históricos o instalar otro motor. |
| Gmail | Defaults de secretos relativos a process.cwd(); worker normal no se inicia, no se copian secrets y red está restringida. El cwd futuro debe ser la versión protegida. |
| Perfil Electron normal | userData del usuario Windows, fuera del repositorio; no se copia el perfil de A: ni el de laboratorios. No se ha agregado perfil independiente por versión. |

No se hallaron referencias literales a A: o C: en las fuentes funcionales que obliguen a volver al proyecto original. Las rutas históricas protegidas son relativas y quedan sin activar. La comprobación es estática; el ensayo futuro debe comprobar apertura de archivos y resolución efectiva de módulos desde la copia, sin activar proveedores ni usar principal prematuramente.

**Observación importante del CLI instalado:** `node_modules/electron/index.js` admite ELECTRON_OVERRIDE_DIST_PATH y puede ejecutar install.js/descarga si falta path.txt o el ejecutable. Esto ocurre antes de las guardias de la aplicación. El preflight futuro debe rechazar cualquier override ELECTRON_ heredado y verificar de antemano CLI, path.txt, ejecutable y dist completos por manifiesto; no invocar require('electron') como prueba de inventario. La política actual no se modificó para ocultar este comportamiento.

El perfil normal puede coincidir entre ejecuciones de distintas carpetas bajo la misma cuenta Windows/app. No ejecutar simultáneamente original/copia ni copiar caches/tokens para simular independencia. Si se requiere un perfil completamente separado, autorizar y probar un cambio de arranque específico; no asumir que un flag Chromium cambia por sí solo el contrato Electron. Los vistos de avisos pertenecen al perfil/usuario/ambiente y no se migran mediante la copia de código.

## 8. Integridad del origen y manifiestos aprobados

Las mejoras locales sin commit están en los bytes de este candidato. **No usar git clone/archive/checkout de HEAD como procedimiento de publicación**: omitiría archivos nuevos y modificaciones de BRANDING, ACCESS-SCOPE, vehículos, archivo, avisos, arranque y correcciones 03B. No hay commit/push en esta fase.

La publicación futura requiere:

1. Revisar el conjunto exacto de fuentes y dependencias; contrastar cambios con evidencia anterior, sin asumir que un archivo de A: es confiable solo porque posee un nombre conocido.
2. Generar manifiesto candidato completo, revisar archivos inesperados/cambios y aprobar un snapshot preciso, con referencia y hash custodiados fuera de A: —administración protegida y registro independiente del responsable—.
3. Custodiar también el script de copia y su hash fuera de A:. No ejecutarlo desde A: basándose únicamente en un manifiesto igualmente editable en A:.
4. En la copia, leer cada archivo origen con el mismo handle que impide escritura/borrado durante hash y transferencia; confrontar longitud/SHA contra la aprobación y crear destino exclusivamente nuevo.
5. Recalcular hashes y conjunto completo del destino, incluidos electron/main.js, package.json, lock, CLI, .bin y node_modules. La huella IPC existente cubre backend/frontend, **no sustituye el manifiesto completo de dependencias y ejecutables**.
6. No actualizar por timer, hook de Git, sincronización de carpeta, robocopy /MIR o copia recursiva indiscriminada. Nada se publica automáticamente desde desarrollo.

Un SHA demuestra correspondencia de bytes, no revisión de seguridad, firma del fabricante o legitimidad del origen. Si se sospecha modificación de A:, detener la aprobación y reconstruir/comparar contra artefactos confiables en una fase autorizada. A: seguirá siendo modificable para desarrollo; la copia publicada no debe consumir después módulos, archivos o herramientas de esa unidad.

## 9. Preparación inicial propuesta — no ejecutada

Requiere autorización para una carpeta nueva y su ACL, usando la cuenta Windows aprobada. Verificar primero que CommunityTours y secure-runtime siguen ausentes y que sus ancestros no cambiaron. Si alguno existe, detenerse y revisar; no cambiar su ACL por inferencia.

Fragmento PowerShell propuesto para crear **solo carpetas nuevas**, una vez autorizada esa preparación:

```powershell
$srdParent = Join-Path $env:LOCALAPPDATA 'CommunityTours'
$srdBase = Join-Path $srdParent 'secure-runtime'
$srdUser = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function New-SrdPrivateDirectory([string]$srdPath) {
    if (Test-Path -LiteralPath $srdPath) { throw 'DESTINO_EXISTENTE_NO_MODIFICAR' }
    [void][IO.Directory]::CreateDirectory($srdPath)
    $srdAcl = New-Object Security.AccessControl.DirectorySecurity
    $srdAcl.SetAccessRuleProtection($true,$false)
    $srdAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier($srdUser)))
    foreach ($srdSid in @($srdUser,'S-1-5-18')) {
        $srdIdentity = New-Object Security.Principal.SecurityIdentifier($srdSid)
        $srdAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($srdIdentity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    Set-Acl -LiteralPath $srdPath -AclObject $srdAcl
}
if ((Test-Path -LiteralPath $srdParent) -or (Test-Path -LiteralPath $srdBase)) { throw 'REVISAR_RUTA_EXISTENTE' }
New-SrdPrivateDirectory $srdParent
New-SrdPrivateDirectory $srdBase
foreach ($srdRelative in @('admin','admin\approved-manifests','admin\update-records','releases')) {
    New-SrdPrivateDirectory (Join-Path $srdBase $srdRelative)
}
```

Este fragmento no sustituye la validación previa de ancestros ni la inspección posterior de ACL/owner/reparse. Si la creación falla a mitad, conservar lo creado e inventariarlo antes de otra intervención; no borrarlo ni reaplicar ACL a carpetas existentes automáticamente. No se ejecutó el fragmento.

## 10. Script de copia/actualización propuesto

Entrega para revisión: `docs/release-03d/UpdateSecureRuntime.proposed.ps1`. Tiene un **throw incondicional antes de cualquier operación**: no está habilitado. Contiene el diseño concreto del flujo posterior; requiere otra fase de implementación/ensayo y revisión antes de preparar una versión operativa, sin retirar automáticamente esa guardia.

Diseño del script:

- Solo un manifiesto APPROVED con hash explícito, referencia de aprobación y custodia en admin/approved-manifests; candidato actual rechazado.
- Origen fijo A:, destino privado bajo releases y un ID nuevo; validación de contención, rutas relativas, duplicados sin diferencia de mayúsculas, enlaces, extensiones privadas y conjunto permitido.
- Verificación de carpetas privadas/ancestros y espacio; no copia ACL, propietario, herencia o Alternate Data Streams desde A:. La transferencia es de bytes a archivos nuevos que heredan del destino privado.
- Comprobación de Electron y procesos del proyecto cerrados y 3000 sin listener antes/después. Es conservadora y puede rechazar otro electron.exe; el usuario identifica/cierra su aplicación por separado. Nunca termina procesos ni consulta su HTTP.
- Hash, lectura y copia mediante el mismo handle origen, FileShare.Read; destino CreateNew, no sobrescrituras. Verificación final del conjunto completo, hashes y ACL; fallo conserva versión incompleta, sin activarla.
- No lee/copia .env, no ejecuta npm/Electron/PG, no cambia un puntero activo o accesos directos, no borra nada y no altera versiones previas.

Durante la ventana no debe abrirse Electron. Versiones nuevas sin configuración evitan una activación útil prematura, pero comprobar procesos no constituye un bloqueo que todos los lanzadores estén obligados a respetar. Definir custodia/ventana y ensayar esta concurrencia antes de habilitar la herramienta.

Invocación propuesta **de la futura herramienta operativa ya revisada y custodiada**, no del borrador inhabilitado:

```powershell
$srdBase = Join-Path $env:LOCALAPPDATA 'CommunityTours\secure-runtime'
$srdManifest = Read-Host 'Ruta del manifiesto aprobado bajo admin\approved-manifests'
$srdApprovedHash = Read-Host 'SHA-256 aprobado por el responsable'
$srdVersion = Read-Host 'ID nuevo: r-AAAAMMDDTHHMMSSZ-hash12'
& (Join-Path $srdBase 'admin\UpdateSecureRuntime.ps1') -ApprovedManifest $srdManifest -ApprovedManifestSha256 $srdApprovedHash -ReleaseId $srdVersion
```

**Esa herramienta operativa no existe todavía.** El comando describe su contrato futuro, no una orden para ejecutar ahora ni una promesa de copia ya probada. No se incluyen comandos npm install/ci, robocopy /MIR, Remove-Item o movimientos recursivos.

## 11. Actualizaciones y recuperación

Cada modificación futura requiere una nueva selección/revisión y manifiesto. Si cambia source, lock o dependencias, generar candidato nuevo y aprobarlo; no usar hashes anteriores para admitir cambios distintos. No editar una release aprobada para hacer coincidir un hash.

Antes de actualizar: comprobar procesos/perfil cerrados, conservar manifiesto/configuración de la versión vigente y seleccionar otro ID. Después: validar contenido exacto y ACL de todos los archivos, ausencia de módulos/resolución hacia A:, revisión de .env independiente y pruebas autorizadas. Archivos inesperados en el destino invalidan la release, no se borran automáticamente para hacerla pasar.

El copiador deja intacta la configuración previa. Para la nueva versión el custodio prepara un .env propio por separado —o autoriza transferir los valores vigentes desde una configuración protegida—; no copiar secretos del repositorio ni restaurar una contraseña/JWT obsoletos. Registrar solo compatibilidad y aprobación, sin valores/hashes de secretos.

Si algo falla, la versión anterior permanece disponible y la incompleta no se activa. Recuperación de código: seleccionar manualmente una versión anterior **compatible con el esquema/datos actuales**, validar su configuración vigente y solicitar autorización de arranque. No implica rollback de PG, restauración de dump, eliminación de 017 o modificación de eventos.

No volver a código prearchivo después de archivar eventos: puede ignorar metadatos y permitir aplicaciones indebidas. Rotación de credenciales o cambios de esquema pueden impedir reutilizar la configuración antigua; resolverlo con el custodio, sin deshacer seguridad para abrir la interfaz. Ninguna política de retención/eliminación automática está incluida.

## 12. Configuración y primer arranque futuros

El original conserva su .env exacto. En `<release>\.env`, preparar posteriormente un archivo nuevo y privado con el contrato de RELEASE-03A:

| Campo | Valor requerido o custodia |
|---|---|
| APP_ENVIRONMENT | principal |
| DB_HOST | **localhost**, literal exigido por validateConfig; el pool conecta a **127.0.0.1** explícito |
| DB_PORT / DB_NAME | 5432 / sian_kaan_reservaciones |
| DB_CLUSTER_ID | 7632825987452064788 |
| DB_SERVER_VERSION / DB_SCHEMA_VERSION | 18.3 / 017 |
| DB_USER / DB_PASSWORD | Runtime limitado aprobado y secreto propio; nunca postgres ni secretos del laboratorio |
| JWT_SECRET | Custodia aprobada, mínimo vigente; conservación/rotación mediante autorización |
| GYG_GMAIL_SYNC_ENABLED | false |
| Opcionales | Conservar JWT_EXPIRES_IN e INTEGRATION_DASHBOARD_CUTOFF_AT autorizados, sin publicarlos |

**No escribir DB_HOST=127.0.0.1 en el archivo sin cambiar contrato:** actualmente sería CONFIG_INVALID, aunque la conexión efectiva correcta sí sea IPv4. No cambiar el validador para admitir la nueva carpeta: su ruta se deriva del __dirname de la copia y no exige A:.

El lector actual necesita secretos legibles del archivo; ACL no es cifrado DPAPI. Si se exige no persistirlos en texto, hace falta autorizar un diseño/cambio de custodia del lector, no copiar los archivos DPAPI del laboratorio o afirmar que ya hay soporte. No se creó .env nuevo ni se leyó/copió el .env original durante RELEASE-03D.

Antes del comando habitual, verificar por hash y ACL el Node/npm confiables, CLI/dist y código de la copia; consola sin DB/PG/APP/JWT/proveedores/Node/proxy heredados, **sin overrides ELECTRON_**, NODE_PATH/NODE_OPTIONS o configuración npm que redirija script-shell/prefix. No basta la allowlist del hijo: el CLI Node/Electron se ejecuta antes. Revisar PATH para que las herramientas del sistema no se resuelvan en A:, npm global/user config y PSModulePath compatible, sin cambios globales de Windows. Si no puede acreditarse ese entorno, detener y preparar un lanzador de consola limpia revisado en otra autorización.

Propuesta de comando final, **solo en etapa F de RELEASE-03C y tras todos sus requisitos**:

```powershell
$srdVersion = Read-Host 'ID de release aprobado, configurado y validado'
if ($srdVersion -notmatch '^r-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$') { throw 'ID_INVALIDO' }
Set-Location -LiteralPath (Join-Path $env:LOCALAPPDATA ('CommunityTours\secure-runtime\releases\'+$srdVersion))
npm run desktop
```

Ese comando se ejecutará **desde la copia**, no desde A:. Continúan backend **127.0.0.1:3000**, PG **127.0.0.1:5432**, reserva exclusiva de socket, proceso propio, nonce/PID/huellas y guardias de rol/esquema. No hay permisos automáticos ni recepción real de proveedores por cambiar la carpeta.

## 13. Dependencias pendientes y autorizaciones

Mantener independientes las etapas de RELEASE-03C:

1. Respaldo final actualizado, custodia y recuperación/integridad aceptadas.
2. Decisión sobre consumidores y TEMP/PUBLIC; nueva cuenta runtime separada de migrador, permisos puntuales incluido UPDATE(id_plataforma) para FOR KEY SHARE.
3. Custodia/ACL de configuración nueva en la ruta elegida; resolver política de JWT y secretos. La copia evita intervenir A:, no implementa por sí sola esta etapa.
4. Autorización exclusiva de 017 y verificaciones de todas las filas originales, usuarios, operaciones, vehículos, vínculos y secuencias; nunca limpiar datos ni tocar 124/126 como prueba.
5. Validación de runtime/esquema y aceptación de las mejoras con componentes reales en ensayos autorizados; primer `npm run desktop` después, por autorización F.

Antes de esos pasos: aprobar ubicación/cuenta Windows; aprobar procedencia y snapshot de fuentes/dependencias; autorizar crear únicamente la estructura nueva privada; implementar/ensayar la herramienta propuesta y preflight en datos aislados; revisar copia/hash/ACL/resolución sin iniciar principal. PostgreSQL no necesita otra migración por esta arquitectura de carpetas. Instalador, otros equipos Windows, firma, despliegue y activación GYG/FareHarbor siguen siendo validaciones separadas; WhatsApp permanece deshabilitado.

## 14. Verificaciones y conclusión

Realizado: inventario estático de aplicación/dependencias con SHA-256, contraste de versiones/lock, lectura de ACL/owners/reparse/espacio y revisión de rutas. Verificación de sintaxis del inventariador y del borrador PowerShell **sin ejecutarlo**. Las pruebas funcionales PostgreSQL/Electron de 03B son antecedentes; no se repitieron ni se atribuyen a esta fase. Falta ensayar una copia/versionado/recuperación reales y el acceso efectivo sobre el archivo futuro: necesitan autorización.

Entregables: este informe, `scripts/inspectRelease03d.cjs`, `docs/release-03d/{ubicaciones,manifest-candidato,inventario-resumen,verificacion}.json` y `UpdateSecureRuntime.proposed.ps1`. El inventariador solo se usó con `--design-only`; no es una herramienta de despliegue.

**No se creó ni activó secure-runtime, no se modificaron ACL existentes, perfiles, .env original, secretos, servicios, puertos, dependencias, instalador o fuentes funcionales. No hubo conexiones a PostgreSQL principal/DEV/laboratorios, migraciones, cambios de roles/contraseñas, escrituras sobre reservas/eventos, proveedores, npm install/ci, commit o push.** No se ejecutó ningún comando de copia o primer arranque contenido en este informe.

**DISEÑO LISTO CON OBSERVACIONES.** Puede revisarse y autorizarse una preparación posterior acotada de carpetas nuevas y ensayo de la herramienta; todavía no autoriza copia operativa definitiva, configuración de secretos o ejecución contra principal. Se esperan instrucciones del usuario.
