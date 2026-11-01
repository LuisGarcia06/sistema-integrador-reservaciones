# Diagnóstico para segunda opinión: instalación experimental 026

Este informe reúne evidencia del repositorio, resultados históricos y hechos
aportados por el usuario. No certifica una instalación ni un ejecutable seguro.
Se solicita una revisión técnica independiente antes de continuar el desarrollo.

## 1. Objetivo y entorno

Community Tours Sian Ka'an, Fase 2E.7. Stack obligatorio: Electron, HTML/CSS/JS,
Node.js/Express y PostgreSQL con `pg`. El frontend solo accede al backend.

Entorno de aceptación: VirtualBox 7.2, Windows 11 Home x64, unos 6 GB de RAM,
dos CPU virtuales, Guest Additions, PostgreSQL 18.3 instalado y una instantánea
previa. Electron declarado en el candidato: 43.4.1. Anfitrión de desarrollo:
Windows 10, con McAfee Antivirus proporcionado por TELMEX.

Se pretende instalar y completar la configuración mediante un asistente gráfico,
sin comandos manuales, manteniendo la política PowerShell efectiva Restricted,
`synthetic-acceptance-only` y `productionAuthorized=false`.

## 2. Tres problemas distintos

### A. Cierre inicial de Electron en candidate-03

El usuario instaló servidor y cliente con `/LABONLY`, verificó SHA256 y vio que
Electron aparecía unos segundos y desaparecía sin ventana. No había generado
autoridad, certificados ni descriptores; tampoco había ejecutado init/bootstrap
ni arrancado el servidor.

El código empaquetado exige descriptores y autoridad externos. Su rechazo puede
registrar `CLIENT026_REJECTED` y terminar el proceso. Esta es una explicación
compatible con lo observado y respaldada por la ruta de código. No hay un log
capturado en aquella VM que demuestre cuál fue exactamente el primer rechazo.
No se demuestra un fallo de VirtualBox, GPU o Electron 43.4.1.

El evento svchost.exe_CaptureService/combase.dll no se ha vinculado causalmente.
El modo `/LABONLY` permite el instalador experimental; no realiza por sí solo
la configuración y no autoriza producción.

### B. POLICY_BLOCKED en 026-setup-02

Confirmado por el usuario en Windows 11: todas las políticas por ámbito figuran
Undefined y la efectiva es Restricted. La GUI abre, pero falla la etapa 1.

En `scripts/windows-setup/coordinator.cjs`, `dispatch('verify')` llama a
`runScript()` para ejecutar primero:

```text
powershell.exe -NoProfile -NonInteractive -File
  <servidor instalado>\Verify-Payload.ps1 -Side server
```

Después verificaría el cliente. `runScript()` convierte determinados errores
de seguridad/carga de scripts en `POLICY_BLOCKED`.

El orden de ejecución y Restricted explican el primer bloqueo; no se dispone de
una traza completa nueva del proceso de la VM. El clasificador también reconoce
`UnauthorizedAccess`, por lo que el código genérico no distingue por sí solo
todas las causas posibles. Microsoft documenta que Restricted no permite scripts;
firmarlos no los habilita bajo esa política.

`context()` usa previamente PowerShell codificado para metadata/SID y ACL.
No se debe afirmar que Restricted impida cualquier comando PowerShell. Sin
embargo, el usuario prohibió expresamente ese mecanismo en la solución nueva.

### C. Cuarentena del prototipo para candidate-05

Se compiló un prototipo .NET x64 con P/Invoke Win32:
`ctsk-native-security-probe.exe`. No era el asistente terminado ni un componente
de producción. El intento registrado no consiguió iniciarlo: devolvió ENOENT.
No existe informe del hijo ni prueba de token real.

Después el usuario aportó capturas que confirman cuarentena por McAfee:

```text
Detección: ti!511A7812AAF5
Fecha/hora mostradas: 30/10/2026 22:36 (zona horaria no indicada)
SHA256 registrado inmediatamente después de compilar:
511a7812aaf5b8c6a672ead70375812e83d7feb46e8029824f7b6bb4d6fec196
```

La cuarentena explica la ausencia del archivo. El motivo técnico exacto de la
detección no es conocido. No se ha confirmado infección ni falso positivo.
El uso de API de tokens/procesos y la falta de firma son hipótesis, no razones
confirmadas por McAfee. No se infiere el algoritmo antivirus a partir del nombre.

No se restauró ni se añadieron exclusiones. El usuario indicó haber completado
una consulta a McAfee; no consta aquí número de caso, confirmación ni respuesta.
No se ha enviado una muestra desde las herramientas de desarrollo.

## 3. Candidate-04: qué corrigió y qué no

Se había confirmado un defecto de argumentos en `control()` de
`scripts/enterprise026Provision.cjs`: `Start-Process -ArgumentList` concatenaba
argumentos y perdía los límites de rutas con espacios.

Se construyeron `2e7-candidate-04` y `026-setup-02`, conservando candidate-03.
La corrección usa un lanzador .NET con `UseShellExecute=false`, delimitación
compatible con el análisis de argumentos CRT y JSON UTF-8 por stdin. Para pg_ctl,
PGDATA se transmite exclusivamente al entorno del hijo, con directorio de trabajo
privado y log relativo fijo. Se corrigió también la entrada UTF-8 del verificador
ACL. Se preservaron controles de marcador, clúster, PID y puerto.

Límite importante: el adaptador .NET se invoca mediante PowerShell codificado y
pg_ctl usa CMD internamente en su arranque normal. La expresión histórica
«lanzamiento sin shell» solo describía la llamada directa al ejecutable desde
ProcessStartInfo; no toda la cadena. Candidate-04 no cumple el requisito posterior
de ausencia total de PowerShell/CMD.

## 4. Auditoría de las ocho etapas actuales

Todas pasan por `context()`, con dependencia de PowerShell para metadata y ACL.

| Etapa | Dependencia adicional en setup-02/candidate-04 |
|---|---|
| 1. Verificar | Verify-Payload.ps1 de servidor y cliente |
| 2. Carpetas privadas | private-directories.ps1 y comprobaciones ACL |
| 3. Confianza sintética | Node/OpenSSL generan material; ACL usa PowerShell |
| 4. Init/T0 | Maintain-Server.ps1; mantenimiento y procesos internos |
| 5. Primer Administrador | console-stage.ps1, Maintain-Server.ps1 y control de clúster |
| 6. Descriptores | Maintain-Server.ps1 y validaciones ACL internas |
| 7. Servidor | Start-Server.ps1, console-stage.ps1 y procesos internos |
| 8. Electron | Inicio directo, pero el cliente verifica ACL con PowerShell al leer y supervisar descriptores |

Las herramientas Node `maintenance.cjs`, `server-control.cjs` y `payload.cjs`
permiten evitar las envolturas ps1. Sin embargo, las llamadas internas de servidor
y cliente a `windowsConfigAcl.js` y `windowsProcess.js` permanecen.
Un asistente externo por sí solo no elimina esas dependencias. Editar archivos
instalados invalidaría inventarios; no se admite suplantación ni monkey patching.

## 5. Alcance autorizado de candidate-05 y estado real

El usuario autorizó un candidato nuevo de servidor y cliente, más `026-setup-03`,
preservando las entregas anteriores. El componente propuesto debe consultar SO,
VirtualBox, SID y permisos; verificar propietarios, DACL, herencia, permisos
efectivos y ancestros; rechazar rutas inseguras/reparse points; crear directorios
privados; y lanzar procesos/consolas sin PowerShell ni shells intermedios.

Debe conservar firmas, integridad, aislamiento, identidad del clúster y protección
frente a parar instancias ajenas. El bootstrap debe usar una consola interactiva
real, sin contraseñas en argumentos o logs.

Solo se implementó el prototipo previo de token y su evaluador. No están terminados
el componente nativo de producción, la integración ni las ocho etapas nuevas.
No se han generado los instaladores `2e7-candidate-05` ni el portable `026-setup-03`.
No se deben confundir con carpetas candidate-05 de fases antiguas del repositorio.

## 6. Por qué no basta con iniciar postgres.exe directamente

El código oficial REL_18_3 de pg_ctl reduce privilegios y deshabilita para usos
permisivos los SID Administradores y Power Users. Trata la DACL del token, inicia
el proceso suspendido y administra handles y job objects. Un spawn sencillo no
demuestra equivalencia. También deben mantenerse disponibilidad, identidad y
parada segura.

El prototipo solo intenta crear una copia de sí mismo con token restringido y
describir sus propiedades. No acepta un ejecutable externo ni implementa init
PostgreSQL. No certifica handles, jobs, logs, parada ni recuperación del servidor.
El usuario exigió detener la construcción si no podía probarse esa equivalencia;
esa puerta sigue sin superarse.

## 7. Defectos adicionales encontrados en la revisión del prototipo

`SecurityProbe.cs`, función `Describe()`, emite los grupos en `groups`, indexados
por SID. `probe-contract.cjs`, función `assess()`, espera campos opcionales
`adminGroup` y `powerUsersGroup`. No hay un adaptador validado entre ambos.

Se reprodujo con JavaScript puro: una entrada sintética que usa el formato del
productor, tiene `hasRestrictions:true`, privilegios permitidos y Administradores
habilitado (`groups['S-1-5-32-544']=4`) devuelve `verified:true`.
El evaluador sigue indicando `fullPostgresEquivalence:false`, pero su validación
de grupos es insuficiente. Esto es un defecto confirmado del contrato de prueba,
no evidencia de un token real inseguro ni explicación de la alerta antivirus.

Además, por lectura del código, ante fallo después de crear el hijo o timeout,
`finally` cierra handles sin garantizar terminación del hijo propio. La recuperación
del prototipo tampoco está preparada para certificar un lanzador de producción.

No se corrigieron ni recompilaron esos componentes en esta revisión. Las pruebas
anteriores no justifican declarar demostrada la seguridad nativa.

## 8. Alternativa: servicio PostgreSQL exclusivo de la VM

Hallazgo confirmado en el código oficial REL_18_3: el arranque normal de pg_ctl
forma una orden COMSPEC /C; su modo servicio, en cambio, llama a
`CreateRestrictedProcess(pgwin32_CommandLine(false), ..., true)` para iniciar
postgres directamente. PostgreSQL conservaría su propia implementación de
restricción del proceso, evitando reimplementarla en nuestro auxiliar.

Propuesta todavía no implementada: servicio exclusivo del laboratorio, identidad
de privilegios mínimos, clúster nuevo, puerto propio, directorios privados y
gestión mediante API de servicios con identidad/configuración verificadas.
No usar la instancia PostgreSQL ya existente como atajo ni elegir LocalSystem
por defecto. El auxiliar de ACL/identidad/rutas seguiría siendo necesario.

Registrar un servicio requiere permisos de administración y cambia el modelo
previo por usuario. Quedan por diseñar cuenta de servicio, ACL, logs, derechos,
recuperación y compatibilidad con los marcadores originales. No se ha aprobado
ni aplicado ese cambio estructural.

Nuevo límite confirmado en fuentes: initdb usa popen; `port.h` lo mapea a
`pgwin32_popen`, cuyo código Windows llama a `_popen`. Microsoft documenta que
esa función ejecuta un procesador de comandos. Por tanto, el servicio no elimina
la dependencia de intérprete durante la inicialización oficial.
Falta observar el árbol de procesos del binario concreto de la VM.

Restricted de PowerShell y ausencia total de shells son requisitos diferentes.
No es correcto presentar el uso interno de CMD por PostgreSQL como un cambio de
ExecutionPolicy, pero el usuario lo ha prohibido expresamente. No se autoriza
una excepción implícita. Mantener cero shells puede exigir cambios adicionales
en las herramientas PostgreSQL, con su propia justificación y mantenimiento;
no debe prometerse una solución mínima solo con el servicio.

## 9. Pruebas realizadas y límites

- Candidate-04: regresión histórica de 1138 pruebas en 41 suites, sin fallos;
  65 pruebas de asistente/rutas y un auditor adicional aprobados.
- Hubo pruebas aisladas de argumentos con espacios, acentos y caracteres
  especiales. No prueban las ACL nativas ni la instalación final en Windows 11.
- Investigación Restricted/native05: 18 pruebas aisladas aprobadas: diez de
  caracterización Restricted y ocho del evaluador/prototipo. Usan interceptación
  de procesos, fixtures y comprobaciones estáticas. No prueban Restricted real
  con la solución nueva ni un token hijo real.
- La nueva demostración sintética del desacuerdo de formato confirma un hueco
  que esas pruebas no cubrían. Su evidencia se conserva en JSON.
- No se repitió la regresión completa para candidate-05 porque no existe una
  implementación de producción integrada. No se aprovisionó PostgreSQL en el
  anfitrión ni se ejecutaron allí los instaladores experimentales.
- Los últimos controles documentados de hashes e inventarios conservan las
  entregas anteriores; no se afirma una nueva auditoría binaria en esta consulta.
- Siguen pendientes ocho etapas reales, T0, bootstrap, primer login, cierre y
  reinicio dentro de Windows 11. La instalación no está aprobada.

## 10. Recuperación de la etapa 1 y restricciones

Si solo se pulsó Verificar, esa ruta no crea el estado privado ni ejecuta init o
bootstrap. Puede cerrarse normalmente; no corresponde borrar claves, editar
state.json ni limpiar bases. Si existiera trabajo previo de otras etapas, hay que
inspeccionarlo y conservarlo, sin resetear ni repetir operaciones ambiguas.

Restricciones obligatorias para cualquier recomendación:

- No tocar `sian_kaan_reservaciones` ni `sian_kaan_reservaciones_dev` del anfitrión;
  no migrar ni eliminar datos existentes.
- No instalar candidatos ni aprovisionar clústeres reales en Windows 10.
- No Bypass, Set-ExecutionPolicy, PowerShell codificado como alternativa, exclusiones
  antivirus, restauraciones para ejecutar sin revisión ni desactivación de controles.
- No claves históricas, credenciales empresariales o certificados de producción;
  no instalar certificados en el almacén global de confianza.
- Material criptográfico nuevo para laboratorio, vigencia máxima de siete días;
  claves privadas fuera de argumentos, logs e informes.
- Mantener synthetic-acceptance-only y productionAuthorized=false.
- No alterar esquema, roles, reservaciones, Daily ni integraciones.
- No generar datos ficticios salvo lo necesario para el Administrador de ensayo.
- No descargar dependencias al configurar en la VM.
- No sobrescribir candidatos anteriores ni editar manualmente lo instalado.
- No declarar aprobación por terminar el instalador, pasar tests o recibir una
  valoración antivirus favorable. La aceptación final requiere prueba real.

## 11. Archivos relevantes y evidencia

Rutas relativas a `A:\sistema-integrador-reservaciones`:

- `scripts/enterprise026Provision.cjs`: control del clúster.
- `backend/config/windowsConfigAcl.js`, `shared/windowsConfigAcl.js` y copia
  empaquetada del cliente `electron/windowsConfigAcl.js`: seguridad de archivos.
- `shared/windowsProcess.js`: adaptador de procesos de candidate-04.
- `scripts/windows-installers/`: payload, mantenimiento, control y ps1.
- `scripts/windows-setup/coordinator.cjs`: context, runScript, dispatch,
  launchConsole, execute e identity.
- `scripts/windows-setup/state.cjs`, `policy.cjs`, `integrity.cjs`,
  `crypto-material.cjs`, `console-stage.ps1`, `private-directories.ps1`.
- `scripts/windows-native/SecurityProbe.cs`: Describe, Launch, GrantUserTokenDacl.
- `scripts/windows-native/probe-contract.cjs`, `probe-contract.test.cjs`,
  `build-probe.cjs`.
- `docs/local-fase-2e7-native05/`: tests.tap, probe-build.json, probe-result.json,
  verification.json, quarantine-confirmation.json y
  probe-contract-shape-gap.json.
- `docs/ASISTENTE-026-RESTRICTED-BLOQUEO.md`,
  `docs/FASE-2E7-CANDIDATE05-NATIVO-BLOQUEO.md`,
  `docs/FASE-2E7-CANDIDATE05-ALTERNATIVAS.md`.

Nota sobre evidencia histórica: verification.json conserva el estado inicial
`removalCause: unconfirmed`; la captura y quarantine-confirmation.json posteriores
confirman la cuarentena. No se deben interpretar como hechos contemporáneos
contradictorios. Los nombres candidate-05 de otras fases no prueban esta entrega.

## 12. Preguntas para la segunda opinión

Solicito diagnóstico y comparación de alternativas, sin ejecutar ni construir:

1. ¿El análisis distingue correctamente configuración faltante, Restricted y
   cuarentena, sin atribuirlos injustificadamente a VirtualBox o a malware?
2. ¿Qué arquitectura mínima cumple todos los controles sin PowerShell y sin
   shells intermedios, incluyendo initdb y otros procesos hijos de PostgreSQL?
3. ¿Es preferible el servicio oficial exclusivo o un lanzador nativo propio?
   Detallar cambios de privilegios, propietario, aislamiento y mantenimiento.
4. Si cero shells obliga a modificar PostgreSQL, identificar el alcance real y
   separar esa exigencia de funcionar con Restricted sin cambiar políticas.
   No asumir permiso para relajar ninguna de las dos restricciones.
5. ¿Qué faltaría para probar equivalencia de token, ACL, handles, jobs, logs,
   consola interactiva, identidad del proceso, parada y recuperación?
6. ¿Cómo corregir el contrato groups/assess y gestionar fallos sin hijos huérfanos?
7. ¿Qué puede avanzar mediante revisión y pruebas aisladas mientras el prototipo
   sigue en cuarentena, sin recompilarlo para sortear la detección?
8. Proponer una matriz reproducible de aceptación en Windows 11 Home: nombres
   VMUser, VM User, VM Usuario Prueba, acentos y caracteres especiales; rechazo
   de rutas redirigidas, ACL inseguras, descriptores alterados y clústeres ajenos;
   T0 limpio, bootstrap único, primer login, cierre y reinicio.

Si faltan fuentes concretas, pedirlas antes de afirmar que una solución es segura.
No interpretar este informe como una auditoría completa de código ni como una
autorización para enviar archivos privados a terceros.

## 13. Referencias oficiales verificadas

- [Políticas PowerShell](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).
- [pg_ctl REL_18_3](https://github.com/postgres/postgres/blob/REL_18_3/src/bin/pg_ctl/pg_ctl.c).
- [initdb REL_18_3](https://github.com/postgres/postgres/blob/REL_18_3/src/bin/initdb/initdb.c).
- [Mapeo Windows de popen](https://github.com/postgres/postgres/blob/REL_18_3/src/include/port.h).
- [Implementación pgwin32_popen](https://github.com/postgres/postgres/blob/REL_18_3/src/port/system.c).
- [Microsoft: _popen](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/popen-wpopen).
- [Microsoft: tokens restringidos](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens).
- [McAfee: revisión de detecciones](https://www.mcafee.com/en-us/consumer-support/dispute-detection-allowlisting.html).
