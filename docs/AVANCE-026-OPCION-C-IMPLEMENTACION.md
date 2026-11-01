# Instalación 026 — avance de implementación

Alcance: `synthetic-acceptance-only`, `productionAuthorized=false`.
**La instalación todavía no está completada.** Este informe describe fuentes del
futuro candidate-05; no son cambios aplicados al Windows 11 invitado ni a los
paquetes anteriores. N-04 permanece en pausa.

## Cambios concretos

| Ruta | Implementación realizada | Límite actual |
|---|---|---|
| `scripts/windows-setup/coordinator.cjs`, `readiness.cjs`, `native-gate.cjs` | El asistente utiliza el lector nativo para obtener identidad y postvalidar ACL. Distingue lectura satisfactoria de validación nativa registrada. Antes de cada escritura comprueba aprobación, evidencia e integridad. | F-01 no se ha ejecutado. La aprobación permanece en `false`; no se habilitan escrituras. |
| `scripts/windows-setup-native/SetupPrivateDirectories.cs`, `native-directories.cjs` | Crea únicamente tres destinos nuevos: sesión, servidor y cliente. `CreateDirectoryW` recibe desde la creación una DACL protegida para SID actual, SYSTEM y Administradores; comprueba identidad VirtualBox, ancestros, propietario, rutas y ausencia previa. El lector independiente debe confirmar las tres ACL antes de publicar estado. | Compilado offline para x64; nunca ejecutado. Falta validación nativa con procedimiento revisado. Si hay creación parcial, conserva evidencia y no limpia ni reintenta. |
| `shared/enterprise026Acl.js`, `backend/config/enterprise026Acl.js`, políticas del servidor/cliente y consumidores enterprise026 | Sustituyen la consulta PowerShell por ejecución directa del lector verificado, JSON por stdin, entorno filtrado, plazo y respuesta estricta. Mantienen lectura de inventarios y comprobaciones existentes de firmas, rutas y autoridad. | Requieren copia validada del lector en el futuro inventario del paquete. No se parchean las instalaciones candidate-04. |
| `scripts/windows-setup/operations.cjs`, `console-stage.cjs`, mantenimiento | Conectan las etapas a las herramientas Node existentes, sin `.ps1`. Conservan T0, bootstrap y emisión firmada de `authority026.json` / `client026.json`, con postvalidación real del cliente. Captura del Administrador en consola propia mediante `CONIN$` / `CONOUT$`, TTY, sin eco, con cancelación; nunca contraseña en argumentos, solicitudes o registros. | Código integrado y pruebas simuladas. La consola y la captura deben comprobarse en Windows 11 antes de crear el Administrador. Las etapas posteriores al aprovisionamiento no han ocurrido realmente. |
| `shared/optionCPostgres.js`, `scripts/enterprise026Provision.cjs`, `server-control.cjs`, política enterprise026 | Eliminan el fallback de control por PowerShell. Exigen capacidad nativa validada, servicio exclusivo, SID/cuenta/imagen/argumentos/directorio/puerto ligados a instalación y clúster. Rechazan evidencia incompleta de token/Job y una mera salida cero. La inscripción liga evidencia y referencias mediante hashes dentro de la constancia autorizada. La comprobación de mantenimiento exige PID y clúster del servicio; no usa solo `kill(pid,0)`. Un fallo al cerrar Express ya no omite intentar parar el servicio iniciado por ese control. | **Interfaz y validadores, no implementación nativa de PostgreSQL.** No existe `SetupPostgres.exe` operativo. `provision()` y mantenimiento init/restore mantienen prohibición incondicional. |
| Preparadores y constructores futuros | Exigen bundle nativo aprobado antes de crear salida; incluyen las dependencias nuevas en inventarios. El futuro helper deja de distribuir sus scripts PowerShell y `windowsProcess.js`; los paquetes futuros dejan de ofrecer los lanzadores `.ps1` como vía necesaria. Referencia de fuentes del helper fijada a candidate-05. | No se ejecutaron constructores. No existe candidate-05 ni setup-03 nuevo. El autoinicio opcional del backend no queda implementado por retirar el lanzador antiguo. |

La cuenta virtual `NT SERVICE\CTSK026-<installationId>` y el directorio fijo
`C:\ProgramData\CommunityTours\Acceptance026\<installationId>\data` están
expresados en el contrato experimental. No se han creado ni comprobado. Resolver
su SID, token, acceso, transición al servicio oficial y recuperación sigue siendo
trabajo nativo pendiente; no se consideran garantías por aparecer en un JSON.

El auxiliar de directorios es una operación acotada de instalación, independiente
del prototipo en cuarentena. No incluye depuración, reducción de tokens, creación
de procesos PostgreSQL ni servicios. No se restauró, ejecutó o reconstruyó el
prototipo de McAfee.

## Verificación realizada

- **397 pruebas aprobadas, 0 fallidas, 0 omitidas**, con
  `scripts/windows-native/safe-test-guard.cjs`: ejecución real de procesos y red
  prohibida. Incluye contratos, regresión, integración simulada, firmas reales de
  fixtures y casos negativos. No equivale a 397 pruebas nativas.
- Casos nuevos: lector no aprobado, hash alterado, creador sin aprobación,
  destino existente, respuesta incompleta, postvalidación de directorios fallida,
  error al abrir consola, ausencia de referencias, grupo administrativo habilitado
  u omitido, token/SID/integridad/privilegios incorrectos, orden antes de reanudar,
  Job no vacío, CMD sin verificar, SQL distinto de `180006`, servicio/directorio
  ajeno, sustitución de evidencia, fallo de supervisor/cierre, captura sin TTY y
  cancelación de contraseña. Son fixtures reproducibles; no hechos observados en VM.
- Las regresiones históricas están identificadas como tales. Las del preflight
  anterior se conservan contra su copia previa; se añadieron pruebas del control
  actual para evitar presentarlas como validación de la ruta nueva.
- Compilación offline del creador de directorios completada; no se ejecutó el EXE
  en Windows 10 ni en Windows 11. SHA256:
  `55284ed9773e436a3ef308a1bac31c00bf7a82e91bbb45216c5dfbd1659c9dfa`.
- Recalculados y cotejados **19 registros** de paquetes/inventarios anteriores y
  evidencia histórica: coinciden con la referencia conservada.
- Evidencia: `local-fase-2e7-optionc-implementation/tests.tap`, `preserved.json`,
  `baseline.json` y `verification.json`. Se conserva también la primera ejecución
  de pruebas, anterior a adaptar el arnés histórico al control nuevo.

No se ejecutaron PostgreSQL, Electron o auxiliares nativos. No se crearon bases,
cuentas, servicios o configuración de Community Tours en la VM. No se cambiaron
políticas, antivirus, ACL instaladas ni bases del anfitrión. No hay prueba real
de login, Reservaciones o Daily en esta fase.

## Bloqueos precisos y ruta única siguiente

1. **F-01, lectura real pendiente.** Usar exclusivamente el kit ya entregado
   `local-fase-2e7-enrollment-fix/CTSK-026-FlowReview-01.zip`, con el procedimiento
   `PRUEBA-FLUJO-026-IDENTIDAD-ACL.md`. Esos archivos permanecen intactos. Permisos
   normales, sin UAC ni contraseña. Extraer en destino nuevo, abrir
   `Revision-Configuracion-026.exe`, marcar VM y pulsar Continuar solo en la primera
   etapa. Devolver texto/código o captura. No se ejecuta PostgreSQL ni se crean
   descriptores; Electron sí crea su caché de interfaz. Cancelar ante bloqueo de
   protección. Lectura esperada: identidad/ACL aceptadas y carpeta, descriptor y
   autoridad ausentes. Un resultado parcial correcto no aprueba la instalación.
2. **Directorio nativo pendiente de prueba.** Solo después de revisar F-01 se
   podrá preparar la prueba de creación de los tres destinos nuevos, con permisos
   normales y postlectura independiente. No se entrega instrucción de ejecutar
   ahora el EXE interno ni se habilita una aprobación ficticia. Esta prueba no
   debe contener certificados, contraseñas, PostgreSQL ni modificación de destinos
   existentes. El kit F-01 no se modifica para agregar escrituras.
3. **Ejecutor nativo de opción C sin implementar.** Faltan creación/obtención de
   identidad mínima, primer `initdb` suspendido, lectura independiente de su token
   antes de `ResumeThread`, asignación y limpieza del Job/handles ante error o
   timeout, y operaciones SCM del servicio oficial con ACL y recuperación. La
   futura prueba que lo desbloquee debe demostrar rechazos sin reanudar ante SID,
   grupo, privilegio o Job incorrecto, y ausencia de hijos supervivientes. Crear
   cuenta/servicio o ejecutar PostgreSQL requiere procedimiento específico revisado
   y ejecución manual en la VM; no queda autorizado por este informe.
4. **Postcondiciones reales pendientes.** Antes de init deben quedar verificadas
   las dependencias oficiales exactas y el contexto interno CMD: AutoRun de los
   contextos pertinentes, COMSPEC, rutas, entorno y permisos. No se retoman N-02,
   N-03 o N-04 ahora ni se promueve evidencia parcial a autenticada. Después:
   clúster propio/T0 → bootstrap interactivo → emisión y postvalidación de ambos
   JSON → servicio/HTTPS/identidad → abrir Electron → login → Reservaciones y Daily
   con datos sintéticos → cierre y reinicio, conservando persistencia.

**F-01 por sí sola no desbloquea initdb, un instalador ni la prueba funcional
completa.** El avance de fuentes no sustituye el componente nativo pendiente ni
su aceptación real. No se autoriza construir candidate-05/setup-03 todavía.
