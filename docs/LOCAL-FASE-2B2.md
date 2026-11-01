# Fase 2B.2 — componentes de conexión LAN segura en laboratorio

Fecha: 2026-10-26. Alcance implementado: componentes y verificación segura en un equipo. **Conexión física entre dos equipos: pendiente, no ejecutada.**

El equipo disponible tiene un único adaptador Wi-Fi activo, perfil Public, puerta de enlace y DNS. Aunque su IPv4 es privada, no satisface el contrato de aislamiento. No se ha supuesto que esa red sea un laboratorio: no se abrió escucha LAN, no se modificó el firewall ni se instaló virtualización. Las entradas reales de servidor y cliente rechazan este entorno antes de abrir sockets de aplicación o acceder a PostgreSQL.

## 1. Arquitectura implementada

```text
Equipo servidor de laboratorio                  Equipo cliente de laboratorio
backend/lanLab.js (Node independiente)  <HTTPS>   Electron / electron/lanEntry.js
  interfaz IPv4 privada EXACTA                    paquete público independiente
  solo socket del cliente aprobado               sin backend, pg ni workers
  Host exacto + TLS + identidad Ed25519           CA pública + pin TLS + clave Ed25519 pública
  Express: JWT, roles y alcance                   frontend desde /app/, API relativa /api
  integración: recepción/control bloqueados       PDF generado y guardado en el cliente
           |
           +--> pg centralizado, 127.0.0.1:puerto desechable
```

La nueva entrada reutiliza `startStandalone`, la configuración autorizada, ACL, integridad del código, identidad efectiva del clúster, rol limitado y esquema 017 + sondeos de publicación 018 existentes. No acepta la base principal, su identificador de clúster, el puerto PostgreSQL productivo ni secretos heredados del entorno. No se agregaron tablas, columnas, migraciones, ORM o dependencias.

| Modalidad | Entrada / transporte | Situación |
|---|---|---|
| Heredada | Electron sin argumentos nuevos; hijo propio y validación privada existente | Disponible; regresión con dobles, sin arrancar producción |
| independent-dev | `backend/standalone.js`, HTTP 127.0.0.1, contrato HMAC existente | Disponible; ensayo real con otro clúster sintético |
| https-lab | `backend/httpsLab.js`, HTTPS 127.0.0.1, Ed25519 protocolo 1 | Disponible; ensayo real completo |
| lan-lab | `backend/lanLab.js` + paquete público `electron/lanEntry.js`, protocolo 2 | Implementado, condicionado a dos equipos aislados; sin ensayo físico |

El servidor continúa al cerrar Electron. El cliente nunca adquiere un proceso servidor, ni inicia/detiene PostgreSQL. Una pérdida de confianza, conexión o cambio de instancia destruye la ventana operativa, muestra estado local aislado y exige iniciar sesión al recuperar conexión. Solo se repiten consultas de identidad; las escrituras no se reenvían. La pantalla advierte que un guardado interrumpido debe reconciliarse consultando la reservación y bitácora.

## 2. Archivos de esta fase

Modificados respecto al inicio de esta tarea, conservando los cambios anteriores:

| Archivo | Justificación |
|---|---|
| `backend/config/standalonePolicy.js` | Incluir runtime cliente LAN y módulos públicos compartidos en la huella del laboratorio |
| `backend/security/serverIdentity.js` | Reexportar contrato compartido; evitar dependencia del cliente sobre archivos backend |
| `backend/standalone.js` | Parámetros internos de interfaz y autorización, con loopback como valor predeterminado; bloqueo de integraciones insensible a mayúsculas |
| `electron/main.js` | Modo LAN exclusivo, perfil separado incluso al rechazar arranque, confianza HTTPS y conexión sin backend local |
| `electron/httpsBackend.js` | Eliminar imports backend, usar dirección autorizada, comprobar red antes de cada reto y conservar validación TLS completa |
| `electron/connection.html` | Advertencia de escritura incierta, sin reenvío automático |
| `scripts/httpsCertificates.cjs` | SAN opcional privado IP + nombre para certificados nuevos, conservando el perfil loopback |
| `scripts/httpsLab.cjs` | Reutilizar únicamente la semilla sintética ya aislada |
| `scripts/httpsLabVerify.cjs` | Ensayos de escrituras simultáneas y respuesta descartada después de COMMIT |
| `readme.md` | Enlace a este informe |

Nuevos:

- `backend/config/lanLabPolicy.js`: lectura privada y validación de red, certificados, identidad y base aislada.
- `backend/lanLab.js`: entrada HTTPS independiente, filtro de socket y vigilancia de interfaz.
- `electron/lanClientPolicy.js`, `electron/lanEntry.js`: contrato público cerrado, huella independiente y entrada remota exclusiva.
- `shared/lanContract.js`, `shared/serverIdentity.js`, `shared/windowsConfigAcl.js`: contratos públicos, criptografía y revisión ACL; no contienen secretos. La implementación heredada de `backend/config/windowsConfigAcl.js` conserva exactamente sus bytes iniciales.
- `scripts/LanLab.ps1`, `scripts/lanLabTools.cjs`: inventario, preparación nueva, plan de firewall y control del PostgreSQL de laboratorio.
- `scripts/InspectLanNetwork.ps1`: inventario público de solo lectura, utilizable en el cliente sin Node ni archivos servidor.
- `scripts/ImportLanClient.ps1`: copia por lista positiva a una carpeta nueva con ACL del usuario del otro equipo y verificación de huella.
- `scripts/lanClientProbe.cjs`, `scripts/lanServerProbe.cjs`: rechazos comprobados con entradas reales y barreras que impiden red, pg o workers durante el ensayo.
- `scripts/lanWriteChecks.cjs`: escrituras HTTPS sintéticas simultáneas y reconciliación sin reintento.
- `backend/__tests__/lanLab.test.js`: 61 casos adicionales, con pg bloqueado.
- Este informe y `docs/local-fase-2b2-verification.json`.

No se modificaron frontend operativo, esquema, autenticación, permisos, código de integraciones, instalador, tareas ni servicios reales en esta fase.

## 3. Contratos de configuración

### Aprobación de red

`LanLab.ps1 -Mode Prepare` exige un JSON privado, sin BOM, con **exactamente**:

```text
version: 1
networkId: UUID nuevo del laboratorio
topology: dedicated-disconnected-switch | internal-vm-network
isolatedNetworkConfirmed: true
approvedBy: responsable que comprobó físicamente el aislamiento
expiresAt: ISO UTC, futuro, máximo 7 días
server: inventario obtenido en el servidor
client: inventario obtenido EN EL OTRO EQUIPO
```

Cada inventario contiene `machine` (SHA-256 de MachineGuid), `adapter` (GUID), `address`, `prefix`, `category`, `gateways`, `dns`, `activeAdapters`. Se exige IPv4 RFC1918 canónica, host distinto de .0/.255, /24, perfil Private, exactamente un adaptador activo, sin rutas predeterminadas IPv4/IPv6 ni DNS configurado. Deben ser dos identidades de máquina y dos direcciones distintas, en la misma /24. Direcciones loopback, públicas, link-local, IPv6, comodines y formas IPv4 ambiguas se rechazan.

**El inventario no prueba por sí solo el aislamiento físico.** El responsable debe comprobar switch sin uplink, ausencia de bridges/ICS/NAT/rutas hacia la operación y red interna real de las VM, si se utilizan. No se deben fabricar inventarios ni aprobar la red operativa porque use IP privadas. Cambiar NIC, IP, perfil o rutas invalida el arranque; servidor y cliente revisan también durante la ejecución. No es una barrera contra un administrador local malicioso.

### Servidor y cliente

La preparación genera `lan-server/lan-server.json` en una carpeta privada NUEVA `%LOCALAPPDATA%\ctsk-standalone-<12hex>` y exporta un paquete público NUEVO `%LOCALAPPDATA%\ctsk-lan-client-<12hex>`.

Ambos JSON usan el contrato cerrado:

| Campos | Significado |
|---|---|
| `version=1`, `protocol=2`, `environment=https-private-lan-lab` | Perfil explícito, no intercambiable con loopback |
| `serverId` | UUID estable entre reinicios del mismo laboratorio |
| `address`, `port`, `origin` | IP privada exacta, puerto no protegido y `https://IP:puerto`, sin path ni credenciales |
| `name` | Alias estable `nombre.ctsk-lab.test`, incluido en SAN |
| `code` | SHA-256 exacto de la versión servidor autorizada, incluido en el reto firmado |
| `clientCode` | SHA-256 de la lista cerrada de archivos públicos del cliente, independiente de la ruta y disco servidor |
| `caDigest`, `tlsSpki`, `publicKeyDigest` | Hash CA, pin SPKI TLS y hash de la clave Ed25519 pública autorizada |
| `network` | Aprobación e inventarios de los dos equipos |

La URL utiliza la **IP estable** del laboratorio, no depende de DNS ni cambia el archivo hosts. Se valida el SAN de esa IP en cada negociación; el servidor exige además que su certificado incluya el nombre elegido. El alias no se resuelve automáticamente: usar URL por nombre requeriría configurar y probar un DNS exclusivamente del laboratorio en otra revisión del contrato. El puerto se asigna al preparar y permanece fijo en ese laboratorio.

El servidor conserva `manifest.json`, `runtime.env`, PostgreSQL, usuarios sintéticos, CA privada, TLS privada y Ed25519 privada. El cliente recibe únicamente código público allowlisted y `client/client.json`, `ca.pem`, `identity-public.pem`. No se copia recursivamente el repositorio. No se exportan `.env`, `service.key`, configuración PostgreSQL, datos, credenciales de integración o claves privadas. El token JWT del usuario procede del login HTTPS normal, no del paquete.

Se verifica que el nuevo PostgreSQL siga escuchando solo en loopback antes de iniciarlo: configuración sin includes activos ni overrides de `postgresql.auto.conf`, identidad offline del directorio, puerto aislado e identidad del proceso. Después se conservan las verificaciones SQL de identidad, rol y esquema de Fase 1. Parar la base no depende de que la red siga aprobada, para permitir la limpieza tras una desconexión.

## 4. HTTPS y confianza

Cada preparación usa una CA NUEVA de laboratorio de 3 días, hoja de servidor de 2 días con SAN IP + nombre, clave TLS nueva y par Ed25519 nuevo. Utiliza OpenSSL ya incluido con Git; no instala dependencias ni CA globales. Las claves están solo en el servidor y sus carpetas heredan ACL privadas.

Node exige CA explícita, TLS >= 1.2, `rejectUnauthorized=true`, verificación predeterminada de IP/nombre, vigencia/cadena y pin SPKI. Electron limita la confianza a su sesión y compara el certificado presentado por Chromium con la misma hoja validada mediante Node; otro origen o certificado se rechaza. No se utilizan `ignore-certificate-errors`, `no-sandbox`, confianza global o una excepción basada únicamente en el pin. El modo LAN rechaza argumentos inseguros de depuración o desactivación de seguridad y usa conexión directa sin proxy.

El reto firma con Ed25519 una representación canónica con dominio exclusivo LAN: protocolo 2, nonce aleatorio de 256 bits, identidad estable, entorno, huella de versión autorizada, instancia nueva tras reinicio, origen exacto y estado listo. Cliente y servidor rechazan nonce consumido/repetido, firma falsa, entorno/protocolo/versión/origen/identidad distintos. El cliente tiene solo la clave pública; no usa ni recibe el HMAC de Fase 1.

La entrega inicial debe hacerse por un canal físico confiable, comparando `serverId`, `code`, `clientCode`, `caDigest`, `tlsSpki` y `publicKeyDigest` con el servidor. Los hashes dentro de un paquete no autentican por sí solos un paquete obtenido de un atacante. Rotar certificados, claves o código requiere nueva aprobación y distribución; no hay actualización silenciosa de confianza.

Referencias primarias consultadas: [verificación de certificados por sesión Electron](https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc), [verificación de nombre/IP TLS de Node](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert).

## 5. Preparación futura del laboratorio y PowerShell

**Estos pasos físicos no se ejecutaron en esta tarea.** No deben ejecutarse en las computadoras de operación. Usar dos equipos de pruebas Windows 11 Home o dos VM YA disponibles con red interna, sin instalar virtualización ni modificar red real sin aprobación. No requiere Hyper-V ni Windows Pro.

1. Comprobar físicamente el aislamiento y asignar IP estáticas dentro del laboratorio. Ejemplo documental: servidor 192.168.250.10/24, cliente 192.168.250.11/24, sin gateway/DNS. No son direcciones configuradas por esta entrega.
2. Capturar en CADA equipo con el script público de solo lectura. El cliente solo necesita este script para el inventario inicial, no el repositorio ni módulos servidor:

```powershell
powershell.exe -NoProfile -File .\scripts\InspectLanNetwork.ps1
# En el servidor también: .\scripts\LanLab.ps1 -Mode Inspect
```

3. El responsable crea la aprobación con los resultados reales. Guardarla en una carpeta NUEVA privada del usuario (ACL usuario actual, SYSTEM y Administradores, herencia deshabilitada, sin acceso ajeno). No relajar ACL existentes para evitar un rechazo. Ejemplo de construcción, una vez que `$serverInventory` y `$clientInventory` contienen las capturas reales y se ha comprobado la topología:

```powershell
$approval = [ordered]@{
  version=1; networkId=[Guid]::NewGuid().ToString()
  topology='dedicated-disconnected-switch'
  isolatedNetworkConfirmed=$true; approvedBy='RESPONSABLE QUE VERIFICO LA RED'
  expiresAt=[DateTime]::UtcNow.AddDays(1).ToString('o')
  server=$serverInventory; client=$clientInventory
}
# $approvalPath debe estar dentro de la carpeta privada comprobada.
[IO.File]::WriteAllText($approvalPath,($approval|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
```

4. Desde una consola limpia de variables DB/PG/APP/Node/proveedores en el servidor:

```powershell
.\scripts\LanLab.ps1 -Mode Prepare -Topology $approvalPath -Name 'server.ctsk-lab.test'
```

Solo después de validar esa red se crea un clúster NUEVO, esquema exclusivamente sobre base vacía, usuarios y reservaciones sintéticas. La preparación no escucha HTTPS LAN, no toca firewall y deja PostgreSQL DETENIDO. Devuelve rutas servidor/cliente y puertos. No reutilizar carpetas de los ensayos de este informe: sus identidades son fixtures aleatorias deliberadamente no aprobables.

5. Revisar el plan de firewall y la política efectiva antes de habilitar nada:

```powershell
$serverFile = 'RUTA_DEVUELTA\lan-server\lan-server.json'
.\scripts\LanLab.ps1 -Mode FirewallPlan -Server $serverFile
```

El comando es de **solo lectura**. El plan restringe TCP entrante a IP local, puerto, IP del único cliente, interfaz aprobada, perfil Private y EdgeTraversal Block. Falta aplicar y probar físicamente la regla: comprobar que el firewall está habilitado con inbound Block y que NO existen permisos generales para Node, el puerto o la interfaz que anulen esa limitación. No modificar reglas existentes de la empresa. Una regla futura deberá agregar además el ejecutable Node exacto y usar nombre único `CTSK-LAN-LAB-<networkId>`, grupo exclusivo, inventario previo y registro de propiedad.

No se ofrece un Apply que cree reglas sin revisión: el laboratorio de dos equipos todavía no está identificado. Para el ensayo físico se debe revisar una regla `New-NetFirewallRule` con TODOS los atributos del plan más `Program` e `InterfaceAlias`. Registrar esos atributos y la regla creada. La reversión debe localizar solo ese Name/Group, comparar sus filtros con el registro, quitar exclusivamente esa regla y confirmar su ausencia; no usar borrado por programa, puerto o comodines. **Creación, rechazo de un tercer equipo y reversión efectiva de firewall siguen sin ejecutar. No hay reglas de esta tarea que retirar.**

6. Transferir solo la carpeta pública, comparar los hashes por canal confiable y en el cliente importarla con ACL del usuario LOCAL nuevo:

```powershell
powershell.exe -NoProfile -File 'RUTA_PUBLICA\scripts\ImportLanClient.ps1' -Source 'RUTA_PUBLICA'
# Devuelve %LOCALAPPDATA%\ctsk-lan-client-<12hex> del cliente.
```

La importación no instala Electron ni certificados. Usar un runtime Electron de laboratorio autorizado, de la versión validada del proyecto. No copiar el `.env` o `node_modules` completos del servidor al cliente.

7. Iniciar la base de pruebas y el servidor en el servidor, después de revisar el firewall:

```powershell
.\scripts\LanLab.ps1 -Mode StartDatabase -Server $serverFile
node .\backend\lanLab.js --server $serverFile
# Primer plano. Ctrl+C detiene SOLO ese backend; no es un servicio Windows.
```

8. En el cliente, consola sin variables incompatibles y sin flags que desactiven seguridad:

```powershell
$clientRoot = 'RUTA_LOCAL_DEVUELTA_POR_IMPORTACION'
& 'RUTA_ELECTRON_AUTORIZADO\electron.exe' "$clientRoot\electron\lanEntry.js" "--ctsk-client=$clientRoot\client\client.json"
```

No usar `electron/main.js` sin modo ni `npm start` para arrancar el cliente remoto. La entrada pública fuerza LAN. Sus perfiles y sesión no reclaman los de la modalidad heredada. Los usuarios y contraseñas sintéticos se consultan solo en el servidor y se introducen mediante login; `test-user.json` no forma parte de la distribución.

9. Terminar: cerrar Electron, Ctrl+C en el backend y después:

```powershell
.\scripts\LanLab.ps1 -Mode StopDatabase -Server $serverFile
```

Comprobar ausencia del `data/postmaster.pid` de ESE directorio, ausencia de listeners en los dos puertos registrados y salida de los procesos propios. No terminar procesos por nombre ni tocar servicios PostgreSQL de Windows. Detener los laboratorios antes de editar código, porque las huellas cambian y los manifiestos antiguos se rechazan.

## 6. Pruebas y evidencias

### Aprobadas

| Ensayo | Resultado y alcance |
|---|---|
| Jest seleccionado con `noPostgres` + barrera de red | **352/352**, 11 suites: los 291 anteriores y 61 adicionales LAN |
| Componentes con Node y Electron reales | Certificado NUEVO con SAN privado/nombre; exportación e importación con huella idéntica; servidor y cliente reales rechazan red no aprobada antes de sockets/pg/backend cliente |
| HTTPS real 127.0.0.1 + clúster nuevo | **13 grupos de comprobaciones**, cero fallas finales: confianza TLS, identidad/replay, JWT/roles/alcance, Centro, Web Locks, PDF mediante IPC real, reinicio y backend independiente |
| Dos sesiones HTTPS simultáneas, mismo host | PATCH de campos distintos conserva ambos; base y bitácora consistentes |
| Respuesta descartada tras COMMIT | Una sola escritura, reconciliación GET y exactamente una entrada de bitácora; ningún reenvío |
| independent-dev real, otro clúster nuevo | Login, API, Electron real, cierre y backend superviviente; puertos liberados |
| Sintaxis | Node `--check`, parser PowerShell de los tres scripts nuevos, `git diff --check` |

Se probó rechazo de CA desconocida, vencimiento y SAN incorrecto con TLS/Electron reales en loopback; firmas, protocolo, versión, nonce e identidades incorrectas con criptografía real y pruebas aisladas. La política LAN rechaza direcciones ajenas, Host falso, X-Forwarded-For, integraciones con mayúsculas o escapes y rutas ambiguas con sockets simulados, sin abrir esas interfaces.

Evidencia final fuera del repositorio, sin credenciales en estos informes:

- Componentes: `C:\Users\luisg\AppData\Local\ctsk-standalone-7258172ac3ce\lan-components-verification.json`.
- HTTPS: `C:\Users\luisg\AppData\Local\ctsk-standalone-531b4bb0f664\https-verification.json`, `completed=true`, `failures=[]`, `postgresStopped=true`. PDF sintético en `client\daily-synthetic.pdf` de ese directorio.
- HTTP: `C:\Users\luisg\AppData\Local\ctsk-standalone-8f13de408f0e\verification.json`, `completed=true`, `postgresStopped=true`.
- Resumen portable: `docs/local-fase-2b2-verification.json`.

Reproducir solo ensayos seguros en ESTE equipo:

```powershell
.\scripts\LanLab.ps1 -Mode VerifyComponents   # sin PostgreSQL y sin escucha LAN
.\scripts\HttpsLab.ps1 -Mode Verify          # clúster nuevo + HTTPS loopback, parada finally
.\scripts\StandaloneDev.ps1 -Mode Verify    # otro clúster nuevo + HTTP loopback, parada finally
```

Jest se ejecutó con `backend/__tests__/standalone.jest.config.cjs`, `--runInBand --runTestsByPath` y estas suites: `lanLab`, `httpsLab`, `standalone`, `release03aStartup`, `release03aPolicy`, `release03aProcesses`, `printBranding`, `notificaciones.electron`, `centroAvisos`, `centroAvisosTiming`, `accessScope.routes` (todas bajo `backend/__tests__/*.test.js`). **No usar `npm test` global** ni `api.test.js` sobre bases existentes.

### Fallas encontradas y corregidas

Una aserción de Error TLS entre contextos Jest y un mock ACL incompleto fallaron inicialmente; se corrigieron las pruebas, sin relajar TLS/ACL. El primer ensayo extendido HTTPS falló porque el nuevo verificador pedía `id_reservacion` como filtro de `/api/bitacora`, que la API existente no admite. Se corrigió el verificador para consultar la ruta real y filtrar la evidencia sintética en memoria; no se cambió el frontend ni la API para aprobar la prueba. El intento fallido quedó registrado y su clúster detenido. La ejecución final tiene cero fallas.

### No ejecutadas

Conexión HTTPS entre equipos independientes; arranque LAN positivo en una interfaz real aprobada; uso remoto del paquete público con login/roles/alcance, Centro, Web Locks y Daily PDF; desconexión física y reconexión entre equipos; certificado o firma falsos desde otro host; firewall efectivo/tercer equipo/reversión; escrituras simultáneas desde DOS máquinas y particiones antes/después del COMMIT. Tampoco se inició producción ni se generaron instaladores. Las pruebas de loopback, fixtures y dobles **no se presentan como aprobación de esos casos físicos**.

## 7. Riesgos y bloqueos

- **Bloqueo actual:** faltan dos equipos y una red físicamente aislada comprobada, más aprobación vigente de sus inventarios. La implementación rechaza el equipo disponible.
- IP y perfil Private no prueban aislamiento físico. Los inventarios requieren responsabilidad humana, red sin uplink/bridge/ICS y ninguna interfaz operativa adicional. Las comprobaciones periódicas detectan cambios después del siguiente ciclo; el firewall sigue siendo necesario.
- El único cliente de red autorizado se identifica por IP de socket y luego por login JWT; no hay autenticación de dispositivo por mTLS. Un equipo que suplante esa IP en una red comprometida necesita considerarse en el diseño empresarial. No habilitar con una regla amplia para hacer pasar ensayos.
- El perfil LAN admite solo el equipo cliente declarado. Ejecutar además una consola Electron en el servidor contra esa misma entrada requiere revisar expresamente la lista de pares y el rol local; no se añadió otra IP a la autorización silenciosamente.
- `navigator.locks` coordina ventanas del mismo origen/perfil, **no equipos diferentes**. Integridad y autorización residen en PostgreSQL/backend. Probar comportamiento del Centro con varias sesiones y avisos compartidos.
- Los PATCH usan transacción y bloqueo de fila existentes. Campos distintos se conservaron en ensayo simultáneo; una edición obsoleta del MISMO campo puede reemplazar una edición más reciente. No se agregaron versiones de fila ni claves de idempotencia sin autorización. Se requiere definir y probar conflicto visible/optimismo antes de uso empresarial.
- Una desconexión no permite inferir rollback. No hay cola de escrituras offline ni reintento automático. Reconciliar reservación y bitácora. La prueba de respuesta descartada cubre COMMIT confirmado internamente, no todos los puntos posibles de una partición física.
- Certificados de dos días y aprobación de máximo siete días son solo de laboratorio. Custodia de CA, renovación, revocación, reloj correcto, recuperación y distribución empresarial siguen pendientes. Cambiar huellas exige distribución autorizada.
- El instalador permanece intacto. Los nuevos archivos compartidos y la lista pública deberán revisarse en un trabajo posterior de empaquetado; no distribuir esta carpeta como instalador productivo.

## 8. Producción y conservación del trabajo previo

Durante esta fase no se accedió a `sian_kaan_reservaciones`, al clúster principal ni a datos/credenciales reales. No se ejecutó TRUNCATE. El esquema se creó únicamente en bases recién creadas y vacías de clústeres nuevos verificados. No se modificaron procesos, tareas, tokens, certificados, configuración o dominio ngrok de FareHarbor/GetYourGuide; tampoco router, firewall, red operativa, almacenes CA o servicios Windows.

Los cuatro clústeres PostgreSQL creados durante esta tarea (incluido el intento fallido) quedaron detenidos: `712b7c63a36a`, `9fdd7cdb6308`, `531b4bb0f664`, `8f13de408f0e`. Los ensayos de componentes no iniciaron PostgreSQL. No se eliminaron las carpetas privadas con evidencias. Se comprobaron los ocho puertos de esos cuatro manifiestos: **cero listeners activos**. No se terminaron procesos ajenos.

Comparación SHA-256 con el inicio: **650 archivos anteriores idénticos, 10 modificados por esta fase, ninguno perdido**. Esto incluye conservación íntegra de los cambios previos de esquema, frontend e integraciones. Los nuevos archivos de esta fase se enumeran arriba; no se usaron reset, clean, checkout para descartar trabajo ni modificaciones a Git destructivas.

## 9. Reversión

Reversión operativa actual: cerrar cualquier cliente de laboratorio y detener únicamente su backend/DB por los procedimientos anteriores. Aquí no se abrió LAN ni se creó firewall, por lo que no hay regla, CA global, servicio o migración productiva que revertir. Para volver a modalidades previas usar las entradas normales sin `lanEntry.js` ni `--ctsk-mode=lan-lab`; los laboratorios antiguos requieren preparación nueva cuando la huella de fuentes cambia.

Si en la prueba física posterior se crea una regla, registrar antes su Name/Group/filtros/programa/interfaz y revertir únicamente esa identidad; comprobar ausencia de la regla y listeners después. Esa reversión física permanece pendiente.

Para retirar código, revisar y revertir solo los 10 archivos modificados y los nuevos de ESTE informe, manteniendo los cambios anteriores. No usar `git reset`, `git clean` ni restaurar archivos completos al HEAD: el punto inicial tenía trabajo local importante sin commit. No borrar carpetas por patrones; conservar evidencias y retirar únicamente rutas verificadas y procesos propios tras revisión.

## 10. Requisitos antes de pruebas empresariales

1. Proveer y aprobar los dos equipos/red aislados; ejecutar todos los ensayos físicos pendientes y registrar evidencia desde ambos lados.
2. Revisar, aplicar y revertir firewall exclusivo de laboratorio, comprobar tercer host rechazado y PostgreSQL inaccesible desde el cliente.
3. Validar el paquete público en Windows 11 Home del otro equipo con runtime autorizado, confianza entregada físicamente, PDF/impresión y recuperación real.
4. Definir tratamiento de conflictos del mismo campo, resultados inciertos y posible idempotencia sin alterar esquema o reglas silenciosamente.
5. Decidir consola local del servidor, identidad de dispositivos, custodia/rotación de confianza, respaldo/recuperación y reloj.
6. Revisar de forma separada operación diaria, integraciones y recuperación de eventos externos, arranque Windows, distribución e instalador por roles. Esta entrega no cambia esos mecanismos.
7. Solo después de esa revisión y una autorización nueva, planificar pruebas empresariales con separación de datos y reversión. No instalar ni desplegar sobre las computadoras de la empresa con los artefactos de este laboratorio.
