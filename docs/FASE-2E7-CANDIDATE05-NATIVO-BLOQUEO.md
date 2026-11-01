# Candidate-05: diseño nativo y bloqueo de verificación

Estado: desarrollo detenido en la prueba previa del token restringido.
No se construyeron candidate-05 ni 026-setup-03. No hay aprobación de instalación.

## Resultado observado

Se implementó y compiló un prototipo Windows x64, `SecurityProbe.cs`, mediante
el compilador Microsoft .NET Framework disponible. El compilador terminó sin
errores y se leyó el ejecutable para registrar su SHA256 inmediatamente después.
Antes de su ejecución, el archivo dejó de estar presente. El intento devolvió
`spawnSync ... ENOENT`; no se obtuvo un informe del proceso hijo.

El prototipo solo puede lanzar una copia de sí mismo para inspeccionar su token.
No acepta un ejecutable externo, no inicia PostgreSQL, no crea clústeres y no
contiene una ruta de aprovisionamiento. Su fuente se conserva para revisión.

SHA256 registrado al compilar (histórico; el binario ya no está disponible):
`511a7812aaf5b8c6a672ead70375812e83d7feb46e8029824f7b6bb4d6fec196`.

Actualización aportada por el usuario: una captura del historial de análisis en
tiempo real muestra la ruta exacta del ejecutable con estado **En cuarentena**
y fecha/hora visible **30/10/2026 22:36** (zona horaria no mostrada). Esto confirma
que una protección puso el archivo en cuarentena y explica su ausencia. La captura
no identifica la marca; posteriormente el usuario confirmó que corresponde a
**McAfee**. Esa atribución procede de la confirmación del usuario.
Tampoco demuestra un falso positivo ni que la ejecución del prototipo sea segura.
La captura original está conservada en `local-fase-2e7-native05/quarantine-user-evidence.png`.

Antes de recibir esa captura se consultaron eventos Defender/Application sin
obtener un registro del archivo. Se conservan los resultados iniciales como
evidencia histórica, junto con `quarantine-confirmation.json` para la actualización.
No se restauró, renombró ni recompiló para evitar la protección; no se añadieron
exclusiones ni se cambiaron políticas.

## Motivo de la detención

El usuario exige demostrar equivalencia antes de sustituir pg_ctl por una
alternativa nativa. Compilar código no demuestra que el hijo use realmente un
token restringido. La ejecución del prototipo no llegó a verificarse: no existe
evidencia de privilegios/grupos del hijo y tampoco de arranque/parada PostgreSQL.
Por esa condición explícita se detuvo la construcción antes de crear instaladores.
Este es un bloqueo del entorno de verificación; no prueba que la arquitectura
nativa sea imposible. La cuarentena por McAfee ya está confirmada; sigue pendiente
la evaluación de la detección.

## Investigación y diseño

Se revisó el código oficial fijado a PostgreSQL 18.3, no solo la rama de desarrollo.
En Windows, pg_ctl arranca el servidor a través de CMD para redirección de handles.
CreateRestrictedProcess elimina Administradores y Power Users del uso permisivo,
retira privilegios excepto SeLockMemoryPrivilege y SeChangeNotifyPrivilege,
ajusta la DACL del objeto token y crea el hijo suspendido antes de reanudarlo.
También contiene tratamiento de handles y job objects. Un Process.Start sin
esas garantías no constituye una sustitución equivalente.
[Fuente PostgreSQL 18.3](https://github.com/postgres/postgres/blob/REL_18_3/src/bin/pg_ctl/pg_ctl.c).

El prototipo implementa únicamente la prueba inicial de token: usa
CreateRestrictedToken, los dos SID de grupo, eliminación de privilegios con las
dos excepciones originales, DACL del token y CreateProcessAsUserW del propio
ejecutable. No implementa ni certifica todavía los job objects, handles/logs,
vida completa del servidor, espera de disponibilidad ni parada PostgreSQL.
Incluso una prueba de token aprobada no certificaría esas partes restantes.

El componente de producción propuesto sería un ejecutable x64 compilado,
inventariado e independiente de PowerShell. Las llamadas P/Invoke accederían
directamente a las API Windows. La GUI seguiría siendo Electron/HTML/CSS/JS.
No se sustituyen Node/Express/PostgreSQL ni se cambia el esquema de datos.

### Contratos que debe implementar antes del empaquetado

1. **Identidad y Restricted:** obtener versión real de Windows, SID/grupos y
   metadata VirtualBox mediante API Windows/WMI, sin intérprete. Leer la política
   efectiva aplicable por ámbitos sin escribir registro ni variables. Comprobar
   la política en la VM; no inferir aceptación por un modelo simulado.
2. **ACL y directorios:** conservar los SID y máscaras existentes, inspeccionar
   propietario, herencia, DACL y derechos efectivos; rechazar DACL nula, UNC y
   reparse points inseguros. Crear el descriptor privado en el momento de crear
   la carpeta, antes de escribir claves. No usar fs.chmod como sustituto de DACL.
3. **Procesos:** parámetros UTF-16 delimitados, ejecutables/rutas fijados,
   entorno/cwd controlados, handles heredados solo cuando corresponda y consola
   nativa nueva para bootstrap. Sin cmd.exe, PowerShell, scripts ps1 ni secretos
   en argumentos o registros.
4. **PostgreSQL:** arranque directo exclusivamente después de probar reducción
   del token y equivalencia de handles, restricciones, espera e interrupciones.
   Conservar marcador, clúster, puerto, PID y añadir comprobación de identidad del
   proceso y su creación para rechazar reutilización de PID. No terminar procesos
   ajenos ni añadir una vía de lanzamiento simplificada como fallback.
5. **Cliente y servidor:** integrar el verificador nativo en ambas copias de ACL,
   conservando firmas, inventarios y rechazo de descriptores. Mantenimiento,
   bootstrap y T0 deben reutilizar su lógica Node y sus comprobaciones actuales.
6. **Asistente:** sustituir metadata, permisos, envolturas de mantenimiento y
   consola por Node y el componente nativo. Mantener las ocho etapas y el bloqueo
   de init/bootstrap ambiguos. No migrar ni desbloquear estados manualmente.

Las bibliotecas, compilador y runtime del componente deberán quedar inventariados;
su disponibilidad y políticas de ejecución de binarios se comprobarán en Windows 11.
No se cambiará ninguna política para facilitar la prueba.

## Archivos creados

- `scripts/windows-native/SecurityProbe.cs`: prototipo limitado de token; no es
  el componente de producción ni un sustituto operativo de pg_ctl.
- `scripts/windows-native/build-probe.cjs`: compilación aislada y hashes.
- `scripts/windows-native/probe-contract.cjs`: evaluación conservadora de evidencia;
  no convierte salida cero sin informe ni ENOENT en un resultado aprobado.
- `scripts/windows-native/probe-contract.test.cjs`: ocho pruebas aisladas nuevas.
- Este documento y `docs/local-fase-2e7-native05/`: evidencia reproducible.

No se modificaron fuentes existentes de producción, candidatos previos ni bases.

## Pruebas y evidencias

Actualización de revisión para consulta: se identificó una discrepancia entre
`Describe()` (salida `groups` indexada por SID) y `assess()` (espera campos
`adminGroup` / `powerUsersGroup`, opcionales). Una entrada sintética con el formato
del productor y Administradores habilitado devuelve `verified:true`, aunque
`fullPostgresEquivalence:false`. Evidencia nueva:
`local-fase-2e7-native05/probe-contract-shape-gap.json`.
No se ejecutó el binario ni se observó ese estado en un token real. Las 18 pruebas
históricas no cubrían este caso y no demuestran equivalencia nativa. No se corrige
el prototipo ni se reanuda su construcción mediante esta actualización documental.

Se ejecutaron 18 pruebas, cero fallos:

- Ocho pruebas nuevas de contratos, fallos, privilegios/grupos no permitidos y
  comprobaciones estáticas del prototipo. Algunas usan evidencia hipotética para
  probar el evaluador; no son evidencia de ejecución de un hijo restringido real.
- Diez pruebas previas del bloqueo Restricted, con procesos interceptados. No
  ejecutan PowerShell ni shells; caracterizan el fallo del asistente anterior.

Registro: `local-fase-2e7-native05/tests.tap`.
Compilación e intento: `probe-build.json` y `probe-result.json` en esa carpeta.
Resumen de conservación: `verification.json`.

Se verificaron otra vez hashes e inventarios de candidate-03, candidate-04 y
026-setup-02: permanecen intactos. No se ejecutaron instaladores, aprovisionamiento
real, bootstrap, consultas PostgreSQL ni las ocho etapas en el anfitrión.

No se repitió la regresión completa de aplicación: no hay cambios de producción
integrados y la puerta de equivalencia nativa está bloqueada. No se atribuyen a
esta tarea los resultados de regresión de entregas anteriores.

## Para continuar de forma segura

La captura del usuario confirma la cuarentena y su respuesta identifica McAfee.
Para continuar hay que revisar la detección con el responsable de seguridad
o McAfee, manteniendo la protección. No se enviarán archivos a servicios
externos sin autorización específica. No se sorteará cambiando nombre, ubicación
o compilación, ni se interpretará la ausencia de amenazas pendientes como una
validación del ejecutable.

Se verificó el canal oficial de [revisión de detecciones de McAfee](https://www.mcafee.com/en-us/consumer-support/dispute-detection-allowlisting.html).
Permite a usuarios y proveedores solicitar análisis. Se preparó el borrador
`local-fase-2e7-native05/mcafee-review-draft.txt`, sin claves ni datos empresariales.
No se envió la solicitud ni se subieron archivos. Como el binario permanece en
cuarentena, el primer contacto debe pedir el procedimiento de entrega para revisión
sin restaurarlo ni añadir exclusiones; no se presupone que el formulario acepte
una muestra que no está disponible como archivo ordinario.

Después debe probarse el hijo restringido y cubrir ACL reales, Unicode/espacios,
política Restricted efectiva, ausencia de intérpretes, consolas TTY, inicio/parada,
fallos y recuperación con procesos de prueba inocuos. Solo al superar esa puerta
corresponde integrar y construir candidate-05/setup-03. La aceptación final sigue
requiriendo instalación, T0, bootstrap, servidor, primer login y reinicio reales
en Windows 11 dentro de VirtualBox.
