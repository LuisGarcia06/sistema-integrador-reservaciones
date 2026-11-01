# Fase 2E.7 — candidatos Windows separados

Fecha de revisión: 30 de octubre de 2026, America/Cancun.

**Solo ensayo sintético. Instalación empresarial bloqueada.** La entrega recomendada es `2e7-candidate-03`, en `dist/windows-2e7/2e7-candidate-03`. No se ha ejecutado ninguno de los instaladores, desinstaladores o procedimientos de mantenimiento. No se han registrado tareas, servicios, certificados Windows ni reglas de firewall. No se han utilizado bases ni contraseñas empresariales.

## 1. Servidor y cliente

Servidor: instalador NSIS independiente, backend Express de candidate-08 sin cambios, runtime Node.js 22.20.0 AMD64 con su licencia, dependencias cerradas y herramientas locales de preflight, inicialización, bootstrap, descriptor público, respaldo y restauración. El arranque verifica inventario exterior, inscripción 026, PostgreSQL, bootstrap y estado de integraciones. No crea ni migra bases al arrancar.

Cliente: instalador independiente con **runtime Electron 43.4.1 AMD64 completo**, aplicación candidate-08 intacta, Chromium, DLL, recursos, locales y avisos legales. Se retira únicamente `resources/default_app.asar`, el ejemplo de Electron. La aplicación está en `runtime/resources/app`; no requiere Electron, Node.js o npm preinstalados. No contiene backend, PostgreSQL, módulos npm del servidor, SQL, claves, CA de ensayo, contraseñas, dumps ni fixtures. El menú Inicio y el escritorio reciben accesos directos al runtime con rutas de descriptor y autoridad externos; no hay dirección de servidor predeterminada confiable.

La distribución manual de Electron en `resources/app` sigue su [documentación oficial de empaquetado](https://github.com/electron/electron/blob/main/docs/tutorial/application-distribution.md). El bootstrap NSIS es PE x86 Unicode y ejecuta en Windows x64; los runtimes y DLL de aplicación son AMD64. El instalador exige Windows build >= 22000 y Windows x64: no se presenta como un ejecutable PE AMD64 nativo.

## 2. Evidencias y archivos

- `docs/local-fase-2e7/2e7-candidate-03-build-report.json`: procedencia, dependencias, tamaños, SHA256 e inventarios de ambos candidatos.
- `docs/local-fase-2e7/2e7-candidate-03-audit.json`: cotejo de bytes extraídos de NSIS, runtimes, contratos SQL y componentes auxiliares.
- `dist/windows-2e7/2e7-candidate-03/SHA256SUMS.txt`: hashes de los instaladores sin firma.
- `server/distribution-inventory.json` y `client/distribution-inventory.json`: SHA256 por archivo, incluidos runtime, herramientas y licencias.
- `app/release-inventory.json` del servidor y `runtime/resources/app/release-inventory.json` del cliente: inventarios 026 originales, conservados exactamente.
- `docs/local-fase-2e7/jest-maintenance.json`: regresión final, con barreras de red y PostgreSQL.
- `docs/local-fase-2e7/windows-verification.json`: SO, versiones, firmas y estado observado de procesos/puertos.

Los binarios y carpetas de `dist` están ignorados por Git. No son una publicación ni una subida a terceros. Los documentos de evidencia no contienen configuraciones privadas. Las licencias y paquetes conservados pertenecen al producto o a sus dependencias, no a laboratorios.

Candidate-01 se conserva **descartado**: NSIS informó comillas incorrectas en la cadena de desinstalación. Candidate-02 corrigió ese problema y pasó extracción e inventarios; precede a las herramientas nuevas de mantenimiento. Candidate-03 es el candidato completo para la siguiente prueba. No borrar los intentos anteriores ni confundir sus hashes.

## 3. PostgreSQL como prerrequisito separado

**Decisión de esta fase:** PostgreSQL 18.3 x64 se proporciona por separado. El instalador de la aplicación no lo descarga, instala, registra, actualiza ni modifica. Las herramientas oficiales deben estar en `C:\Program Files\PostgreSQL\18\bin`; otra ubicación o versión se rechaza. No usa el servicio existente, el puerto 5432, la base principal ni la de desarrollo.

Ventajas: separa permisos y responsabilidades, evita alterar instalaciones existentes, reduce el instalador y permite inventariar por separado la distribución PostgreSQL. Riesgos y coste: exige preparar y verificar el prerrequisito, sus DLL y extensiones; la ruta y 18.3 están fijadas por 026; un cambio de versión exige revisión y regresión del contrato. No se garantiza que un instalador PostgreSQL interactivo omita un clúster/servicio: no ejecutarlo en el equipo principal.

En la VM nueva, el responsable debe obtener una distribución Windows autorizada con los binarios oficiales 18.3, verificar origen, arquitectura, firma/hash y licencias, y preparar esa ruta sin reutilizar datos previos. Si se emplea el instalador EDB, revisar explícitamente sus opciones y los componentes/servicios que crea; cualquier servicio del prerrequisito debe quedar separado del clúster privado 026. La aplicación solo usa `initdb` para un destino nuevo con nombre aleatorio y SCRAM. No administra otros servicios PostgreSQL. La preparación exacta del prerrequisito en una VM sigue pendiente.

PostgreSQL usa la [PostgreSQL License](https://www.postgresql.org/about/licence/). Los [instaladores Windows enlazados por PostgreSQL](https://www.postgresql.org/download/windows/) son distribuidos por EDB; deben revisarse sus términos y los de sus componentes, sin suponer que todos tienen la misma licencia. No se redistribuye ese instalador en los candidatos.

## 4. Compilación y auditoría reproducibles

Herramientas usadas: Windows x64, Node 22.20.0, Electron 43.4.1 existente y NSIS 3.0.4.1 de la caché local de electron-builder. No se usa la configuración general `dist:win`, que mezcla backend y cliente. No se instalan dependencias nuevas de la aplicación. La licencia de Node se obtuvo del [tag oficial v22.20.0](https://raw.githubusercontent.com/nodejs/node/v22.20.0/LICENSE), con hash en el informe.

Desde la raíz del repositorio, para un **identificador aún inexistente**:

```powershell
node scripts/windows-installers/build.cjs 2e7-candidate-04
node scripts/windows-installers/audit.cjs 2e7-candidate-04
node scripts/windows-installers/regression.cjs jest-next-review
```

No repetir esos identificadores si ya existen: los scripts rechazan sobrescrituras. La carpeta padre `dist/windows-2e7` debe existir. El extractor de auditoría se obtiene del [proyecto oficial 7-Zip](https://www.7-zip.org/download.html), versión 26.05, extrayendo su archivo con el 7za local **sin ejecutar el instalador de 7-Zip**; su ubicación y hash constan en el informe. No se incluye en el producto.

La reproducibilidad aquí significa entradas y contenido verificables, no igualdad binaria de compilaciones con fechas o identificadores distintos. NSIS recibe UTF-8 explícito y las advertencias del compilador bloquean la generación válida. Su [referencia de scripting](https://nsis.sourceforge.io/Docs/Chapter4.html) describe las operaciones utilizadas.

## 5. Instalación nueva: únicamente VM Windows 11 x64

1. Crear una VM nueva, con snapshot inicial, cuenta Windows nominativa, volumen NTFS y sin acceso a redes/bases empresariales. Mantener deshabilitados integraciones y cualquier acceso a proveedores.
2. Registrar SO, arquitectura, identificadores de equipo y responsables. Preparar PostgreSQL separado según el punto 3.
3. Llevar únicamente los candidatos revisados, sus hashes y las entradas privadas autorizadas por canales separados. Verificar `Get-FileHash -Algorithm SHA256` contra una copia confiable de `SHA256SUMS.txt` antes de ejecutarlos.
4. En esa VM, iniciar cada `.exe` con `/LABONLY`. Esa opción es una declaración explícita del operador, **no detecta ni certifica aislamiento**. No utilizarla en el equipo principal ni en Community Tours. Sin ella se rechaza la instalación. `/S` no omite las guardas.
5. El destino fijo por usuario es `%LOCALAPPDATA%\CommunityTours\Candidates026\2e7-candidate-03\server` o `client`. Se rechaza un destino con archivos; no existe actualización en el sitio. `/D=` no cambia la ruta utilizada por la sección de copia.
6. Se copian archivos y crean accesos/registro HKCU; no se arrancan procesos, aprovisionan bases, importan CA, registran tareas ni crean reglas de red. El desinstalador se guarda fuera del payload, en `%LOCALAPPDATA%\CommunityTours\CandidateUninstall026\2e7-candidate-03\<lado>`.
7. Ejecutar `Verify-Payload.ps1 -Side server` y `-Side client` desde sus carpetas respectivas. Comprobar permisos de programa y ancestros: sin escritura de terceros, rutas UNC o reparse points. Esta comprobación local de hashes no sustituye firma y canal confiable del verificador.

Los scripts de PowerShell deben cumplir la política Windows de la VM. No cambiar la política ni usar `ExecutionPolicy Bypass` para instalar el producto. Una política que exige firma de scripts es un bloqueo adicional hasta firmarlos.

## 6. Configuración privada y entradas autorizadas

La autoridad 026 actual solo admite `scope=synthetic-acceptance-only`, `productionAuthorized=false`, Ed25519 y vigencia máxima de siete días. El contrato sigue restringido a HTTPS `127.0.0.1` y PostgreSQL loopback. **No sirve para conectar dos equipos por LAN.** Ninguna opción del instalador modifica esos límites.

El responsable entrega fuera del programa una autoridad sintética nueva, su clave de inscripción en custodia, certificado TLS con SAN IP 127.0.0.1, clave correspondiente y CA. No se reutiliza la autoridad ni los certificados de 2E.6. No se incorporan al `.exe`. No generar una autoridad declarando autorización empresarial: esta versión la rechaza.

Crear cada directorio privado como hijo directo nuevo de LOCALAPPDATA. Primero crear vacío, luego proteger ACL para SID del usuario actual, SYSTEM y Administradores, sin herencia ajena, y solo después escribir archivos. Los comprobadores 026 verifican archivo, propietario y ancestros. Un ejemplo de preparación **solo en la VM**:

```powershell
$privatePath = Join-Path $env:LOCALAPPDATA ('ctsk-setup026-' + [Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $privatePath) { throw 'NEW_DIRECTORY_REQUIRED' }
[void][IO.Directory]::CreateDirectory($privatePath)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner([Security.Principal.SecurityIdentifier]::new($sid))
foreach ($trusted in @($sid,'S-1-5-18','S-1-5-32-544')) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.SecurityIdentifier]::new($trusted),
        'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $privatePath -AclObject $acl
```

Repetir con nombres nuevos para entradas/solicitudes y destino de servidor; el **destino de servidor permanece vacío**. Para el cliente usar exactamente `ctsk-client026-2e7-candidate-03`, también vacío y privado, por las rutas del acceso directo. Evitar perfil Windows/rutas con espacios en el primer ensayo; la envoltura heredada de `pg_ctl` debe probarse específicamente con espacios antes de aceptar esa condición. No se declara verificada.

Las solicitudes son JSON privado externo, con rutas absolutas canónicas y exactamente los campos indicados; no contienen contraseñas. La herramienta rechaza parámetros como host, nombre de base, puerto o password. No ejecutar estos comandos en el equipo principal:

```powershell
# Desde el servidor instalado, con una solicitud local ya revisada:
.\Maintain-Server.ps1 -IsolatedLab -Request 'RUTA_ABSOLUTA_DE_SOLICITUD_PRIVADA'
```

| Acción `action` | Campos además de `action` y `scope` |
|---|---|
| `init` | `directory`, `authority`, `authorityKey`, `certificate`, `tlsKey` |
| `bootstrap` | `server`, `authority`, `authorityKey` |
| `client` | `server`, `authority`, `authorityKey`, `clientRoot`, `directory`, `ca` |
| `backup` | `server`, `authority`, `directory` |
| `restore` | Los de `init`, más `sourceServer`, `sourceAuthority`, `bundleDirectory` |

`scope` siempre vale `synthetic-acceptance-only`. `authority` es el archivo externo de confianza; `authorityKey` es la clave Ed25519 de inscripción; `server` es `server026.json`; `clientRoot` es el directorio instalado `client`, no `resources/app`; `directory` identifica un destino privado nuevo; `ca` es el PEM público protegido. Tras `init`, usar el archivo `authority026.json` creado en el directorio del servidor para las solicitudes siguientes. No poner solicitudes en el directorio que debe estar vacío.

## 7. Inicialización y primer acceso

1. Revisar y ejecutar una solicitud `init`: valida autoridad y par TLS, invoca el aprovisionador 026 original, crea un clúster **nuevo**, base `ctsk_install_<aleatorio>`, credenciales nuevas y esquema fijado por hashes. No acepta una base existente.
2. Antes de usuarios, inspecciona T0 y escribe `t0-installation026.json` en el directorio privado. Exige 23 tablas, cero filas comerciales/cuentas y contenido técnico exacto. Detiene únicamente el clúster que creó. Conservar el recibo real que produzca la VM; **todavía no existe certificación T0 2E.7 observada**.
3. Ejecutar `bootstrap` en terminal local interactiva. La clave técnica se lee del mantenimiento privado, con ACL e identidad comprobadas. Captura nombre/correo y contraseña nueva con confirmación sin eco, sin defaults ni contraseña en argumentos. Revalida esquema y serializa la creación única. Escribe constancia firmada antes de reinscribir `state=initialized` con el origen bootstrap efectivamente observado.
4. Si hay error después de COMMIT, conservar estado y constancia; inspeccionar singleton/recibo con las herramientas 026 y reinscribir bajo revisión. No repetir a ciegas, borrar usuarios, vaciar base ni intentar «reparación» automática.
5. Preparar el directorio privado del cliente y ejecutar `client`: comprueba ambos paquetes, CA/hoja, firma y descriptor. Su contenido liga instalación, generación, época, inventario, CA y pin SPKI. No crea clientes ni credenciales funcionales en la base.
6. Ejecutar `Start-Server.ps1 -ServerConfig <server026.json> -Authority <authority026.json> -CheckOnly`; luego sin `-CheckOnly`. Mantener la consola mientras se ensaya. El supervisor y backend revalidan identidad, permisos, esquemas, administrador e integraciones apagadas.
7. Abrir el acceso directo del cliente y realizar login mediante backend. Comprobar módulos, permisos, cambios, Daily, exportación PDF e impresión. Estos ensayos interactivos nuevos están pendientes; el smoke actual solo demuestra que el runtime Electron empaquetado ejecuta la aplicación y rechaza la ausencia de descriptor.
8. Cerrar cliente y usar Ctrl+C en la consola del servidor. Solo se cierra el backend propio; PostgreSQL se detiene únicamente si esta envoltura lo inició y su identidad/marcador siguen válidos. Un clúster ya iniciado se deja en manos de su responsable. Un cierre forzado del SO requiere revisión y prueba posterior; no se promete limpieza tras corte eléctrico.

## 8. Arranque automático preparado

`Prepare-Autostart.ps1 -ServerConfig <archivo> -Authority <archivo> -OutputXml <archivo nuevo>` ejecuta preflight y produce XML revisable. No contiene contraseñas, usa SID actual, `InteractiveToken`, privilegio mínimo, una instancia, sin corte temporal y sin terminación forzada. Es arranque **al iniciar sesión** de esa cuenta, no servicio disponible antes del login.

No se ha registrado ni probado una tarea. Solo dentro de la VM, después de revisar identidad, ACL y ruta estable, un responsable podrá importar ese XML y comprobar inicio, reinicio, cierre y expiración/revocación de autoridad. La ejecución desatendida empresarial necesita diseño de cuenta/custodia y una versión aprobada del contrato; no se presume resuelta mediante una cuenta SYSTEM.

## 9. Respaldo, recuperación y reversión

`backup` exige plan inicializado/restaurado, identidad real y snapshot consistente. Usa las herramientas oficiales 18.3 y deja dump + metadatos firmados en un **subdirectorio nuevo** del directorio privado del servidor. No distribuye ese contenido. Preservar además de los respaldos la custodia de claves y la configuración autorizada; el dump solo no reemplaza la clave durable ni la confianza del origen. Política de cifrado, retención, copia fuera del equipo y responsables pendientes.

`restore` primero verifica inscripción del origen y metadatos/hash/firma del respaldo, identidad del origen y digest de clave durable. Usa destino privado nuevo y `restoreOnly=true`; nunca vacía ni sobrescribe una base. El contrato compara filas/secuencias y reconstruye las nueve restricciones conocidas del roundtrip. Conserva clave durable y origen bootstrap; emite instalación, época y JWT nuevos y recibo de restauración. Revalida inicialización/integraciones. Se debe generar un descriptor cliente nuevo; las sesiones anteriores deben rechazarse. Actualmente exige el mismo código 026 inscrito; no es un mecanismo de migración entre versiones arbitrarias.

Reversión selectiva de código: conservar la carpeta previa y su inventario. Detener solo el supervisor propio; comprobar que el catálogo y formato actuales son compatibles con el código anterior; aprobar reinscripción para la ruta/hash seleccionados y reemitir descriptor. No editar `manifest.root`/`code` ni firmas manualmente. Si falta un verificador compatible o una herramienta revisada de reinscripción, **detener la reversión**. No existe cambio automático de versión ni herramienta genérica de reinscripción entre releases en esta entrega. No restaurar una copia antigua sobre la base actual para «volver el código». Si hace falta recuperar datos, restaurar en destino nuevo y conciliar por separado los movimientos posteriores antes de un cambio explícito. Preservar auditoría, referencias 025 y estado 024.

## 10. Actualización y desinstalación

Actualización preparada como procedimiento, sin migración automática: respaldo comprobado; detener procesos propios; instalar otro identificador en ruta nueva; comparar contratos SQL y privilegios; revisar compatibilidad y emitir nueva inscripción/descriptor para la ruta aprobada; ejecutar aceptación; conservar carpeta previa y respaldos. El código actual no permite apuntar una instalación nueva a una base empresarial o reusar otra base pasando argumentos. Cualquier mecanismo futuro para trasladar una inscripción existente requiere revisión explícita. La conservación de datos está definida; el ensayo completo de actualización aún está pendiente y es bloqueo de distribución definitiva.

La desinstalación de candidatos retira solamente accesos directos y registro HKCU. **Conserva también los archivos del programa**, además de configuración, bases y respaldos. Es una retirada conservadora y parcial, no una eliminación completa de la aplicación. No hace borrado recursivo, no detiene procesos ni desregistra tareas importadas manualmente. Antes de desinstalar: cerrar procesos propios y retirar por separado cualquier tarea de la VM. El retiro posterior de código debe comprobar directorio, inventario y ausencia de datos/secretos, con autorización específica; los datos empresariales nunca se borran como consecuencia de quitar el programa. La misma versión no se puede reinstalar sobre los archivos conservados. Estos comportamientos deben ensayarse en VM.

## 11. HTTPS y firma

Se mantienen CA explícita, validez/SAN, pin SPKI, misma hoja en OpenSSL/Chromium y desafío fresco firmado; nunca se usa `rejectUnauthorized=false`, una CA global de laboratorio o flags de bypass. Los certificados sintéticos se generan y quedan exclusivamente en la VM, fuera de los instaladores.

No se proporcionó un certificado de firma empresarial autorizado. Los `.exe` son **UNSIGNED**; la firma válida del Node original identifica a OpenJS, no a Community Tours. El Electron local se observa sin firma Authenticode. Los hashes demuestran integridad respecto de una referencia confiable, no autoría empresarial. Faltan SDK/SignTool, certificado/custodia, editor aprobado y TSA HTTPS autorizada.

Proceso preparado para una futura entrega aprobada: conservar los candidatos sin modificar; trabajar sobre copia nueva; firmar herramientas/verificador y ejecutables internos que corresponda antes de sellar inventarios; regenerar inventario exterior; compilar NSIS con firma del desinstalador y luego firmar instalador; verificar cadena, EKU de firma de código, editor, timestamp y revocación; recalcular SHA256 final y entregar por canal confiable. Actualizar pruebas e inventarios después de cualquier firma. No firmar `release-inventory.json` editándolo ni introducir una autoridad sintética como aprobación empresarial.

Comandos de referencia para el responsable, con valores reales aprobados y sin PFX/contraseña en código o argumentos:

```text
signtool sign /sha1 <HUELLA_CERTIFICADO_APROBADO> /fd SHA256 /tr <TSA_HTTPS_APROBADA> /td SHA256 <COPIA_DEL_INSTALADOR>
signtool verify /pa /all /v <COPIA_DEL_INSTALADOR>
```

No se ejecutaron esos comandos. Tener firma tampoco desbloquea por sí solo la autoridad de producción que el código 026 actual rechaza.

## 12. Matriz de instalación limpia

| Caso exigido | Estado de esta fase |
|---|---|
| 1. Instalación nueva Windows 11 | Pendiente VM; compilación/extracción no equivalen a instalación |
| 2. Directorios y permisos | Inventarios auditados; ACL efectiva del equipo destino pendiente |
| 3. Base nueva | Aprovisionador original y envoltura preparados; no ejecutados |
| 4. T0 cero datos comerciales | Generación/verificación preparada; nueva certificación pendiente |
| 5. Catálogos técnicos | Contratos históricos conservados; inspección real pendiente |
| 6. Integraciones apagadas | Guardas conservadas; observación de nueva base pendiente |
| 7. Primer Administrador | Captura/servicio/reinscripción preparados; ensayo local pendiente |
| 8. Acceso desde Electron | Runtime extraído ejecutado y rechazo sin descriptor comprobado; login pendiente |
| 9. Usuarios/catálogos T1 | Pendiente; exclusivamente VM, nunca dentro del instalador |
| 10. Reservaciones/referencias 025 | Jest pasa; nueva prueba real pendiente |
| 11. 24 PAX/12 por grupo | Regresión Jest pasa; nueva prueba real pendiente |
| 12. Operaciones/Transportes | Regresión Jest pasa; nueva prueba real pendiente |
| 13. Daily/PDF/impresión | Código original intacto; PDF/impresora con instalador pendientes |
| 14. Reinicio servidor | Envoltura preparada; tarea y reinicio de VM pendientes |
| 15. Persistencia | Pendiente con instalación/reinicio nuevos |
| 16. Respaldo/restauración | Herramientas originales y envolturas preparadas; ejecución nueva pendiente |
| 17. Incompatible | Guardas y rechazo sin configuración auditados; rechazo de instalación real pendiente |
| 18. Cierre seguro | Código preparado; Ctrl+C, arranque interrumpido y reinicio forzado pendientes VM |

También pendientes: espacios/no ASCII en perfil Windows; disco lleno y copia interrumpida; dos instalaciones simultáneas; reparación/reinstalación; accesos directos con rutas reales; actualización, reversión y retirada conservadora; importación de tarea; reinicio del SO; dos equipos/LAN tras contrato nuevo aprobado. No se declara atomicidad ni recuperación automática de una copia NSIS interrumpida: conservar su estado y revisar antes de reintentar.

## 13. Pruebas ejecutadas y límites

Las regresiones seleccionadas usan la configuración standalone con `noPostgres` y guardia de red, sin descubrir copias históricas recursivamente. Los resultados finales están en `jest-maintenance.json`; no se ejecutan suites que exigen configuración privada heredada.

La auditoría abre los instaladores como archivos, extrae sus componentes, compara todos los hashes contra el inventario, clasifica auxiliares NSIS, comprueba inventarios 026 intactos, máquina AMD64 y los nueve contratos SQL. Ejecuta Node `--version` y Electron **extraído** sin descriptor, y comprueba rechazo del preflight servidor sin configuración. No abre una base ni un listener. Esto prueba carga del runtime, no primer acceso ni aceptación funcional.

Las 1,121 pruebas/40 suites, 15 grupos PostgreSQL/HTTPS/Electron y T0 de 2E.6 son **antecedentes históricos**, disponibles en `docs/local-fase-2e6-enterprise/INFORME.md`, `CERTIFICACION-LIMPIA.md` y `attempt-10/verification.json`. No se atribuyen como pruebas de instalación 2E.7. No se repitió PostgreSQL vivo porque no hay un entorno Windows 11 aislado disponible. Las herramientas oficiales se comprobaron únicamente con `--version`.

## 14. Información empresarial y carga inicial independiente

Completar y aprobar con Community Tours antes de cualquier instalación real:

- Equipos servidor/cliente, SO, almacenamiento, cuentas Windows, responsables y ventana de instalación.
- Usuarios nominativos, correos y roles/alcances autorizados, sin contraseñas en la planilla.
- Tours, turnos explícitos, horarios y aprobación de cupos 12/grupo y 24/tour-fecha-turno.
- Guías, operadores, vehículos y capacidades; países/plataformas realmente usados.
- Reservaciones futuras existentes, fuente, correspondencias, referencias externas, saldos y duplicados.
- Responsable de respaldos, destinos, retención, cifrado, custodia y ensayo de recuperación.
- Red/nombres de servidor, HTTPS, autoridad/custodia/rotación/revocación y canal de distribución firmado.
- Aceptación de Daily/PDF/impresión y módulos/roles, fecha de inicio de operaciones y plan de reversión.

`docs/local-fase-2e7/carga-inicial-pendiente.template.json` es un sobre de recepción separado, con listas vacías y estado pendiente. No forma parte de los instaladores ni cambia el modelo SQL. Recibir el cuestionario, validar contra los validadores existentes, proponer correspondencias y detectar duplicados/24 PAX; presentar un plan de importación por API, con responsable y autorización nominal; respaldar y ensayar en destino aislado antes de una carga real. **No hay importador automático ni datos inventados.** La estrategia final sigue pendiente de Community Tours. No activar FH/GYG/WhatsApp como consecuencia de importar catálogos.

## 15. Condiciones para autorización empresarial

Faltan VM y aceptación de los 18 casos, actualización/desinstalación/reversión comprobadas, aprobación nominal del contrato de producción y su implementación versionada, autoridad empresarial, certificados HTTPS/red para dos equipos, firma de toda la cadena de distribución, revisión de prerrequisitos y licencias, política de respaldo/custodia, respuestas del cuestionario y aprobación funcional/operativa. La presente fase entrega candidatos verificables y procedimientos; **no declara instaladores definitivos ni autoriza despliegue real**.
