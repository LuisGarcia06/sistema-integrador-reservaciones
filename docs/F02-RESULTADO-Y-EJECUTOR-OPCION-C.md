# F-02 satisfactoria e integración del ejecutor de opción C

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
**Avance de fuentes, no instalación aprobada ni aceptación nativa del ejecutor.**

## F-02 registrada

El usuario comunicó ejecución manual en `Windows11-CommunityTours-Test`:

- Consulta inicial: `F02_READY_NO_WRITES`.
- Consentimiento limitado a F-02 y un solo clic de creación.
- Resultado: `F02_PRIVATE_DIRECTORIES_AND_NEGATIVE_VERIFIED`.
- La interfaz informó `F02-result.json` y ausencia de aprovisionamiento de
  Community Tours/PostgreSQL. El usuario dispone de una captura.

Se registra **satisfactoria dentro del alcance de validación de directorios**,
según el reporte manual. No se ha recibido/cotejado la captura ni la constancia;
esa corroboración sigue pendiente y no requiere repetir la prueba. La observación
queda en `local-fase-2e7-native-executor-progress/F02-user-observation.json`.
Actualiza el estado que antes figuraba pendiente de revisión en el informe anterior.

No se convierte en autorización general de escritura, prueba del SID del servicio,
primer token, Job, T0, firmas de descriptores o funcionamiento de módulos.
Los indicadores generales de habilitación permanecen cerrados. No se repiten
F-01/F-02 ni se retoma N-04.

## Código implementado

| Componente | Cambio concreto |
|---|---|
| `SetupPostgres.cs` | Host con protocolo JSON cerrado, entrada SCM, inicialización y control de una instancia derivada de UUID. Rechaza cambios de actor, VM, paquete, clúster, directorio o dependencias. Distingue una prueba suspendida sin reanudación de inicialización real. |
| `OptionCServiceRegistration.cs` y `OptionCServiceConfig.cs` | Creación exclusiva de un servicio nuevo, inicialmente deshabilitado, con cuenta virtual `NT SERVICE\CTSK026-<UUID>` sin contraseña, SID restrictivo y únicamente `SeChangeNotifyPrivilege`. Nunca adopta un nombre existente. Misma identidad al cambiar la imagen temporal de inicialización por `pg_ctl.exe runservice` oficial. ACL de servicio acotada: el operador recibe inicio/parada únicamente después de la transición; no recibe cambio de configuración. |
| `OptionCBootstrap.cs` | `ServiceBase` ejecuta el intento bajo esa cuenta, comprueba el token del propio host, usa las primitivas de primer token/Job y produce constancia durable. El modo de validación no reanuda initdb ni crea su catálogo. La inicialización real verifica también `pg_controldata`, salida, stderr y estado limpio. No acepta éxito por código cero solamente. |
| `OptionCNativePrimitives.cs` | Lectura independiente del token hijo por handle; grupos por SID, elevación, SID restrictivos, privilegios y Medium antes de `ResumeThread`. Job asociado en la propia creación; handles heredados limitados a tres. Cancelación y timeout limpian solo el intento propio. CMD interno usa entorno cerrado, perfil del servicio comprobado, AutoRun ausente y ACL verificadas de claves/ancestros y `System32\cmd.exe`; no cambia el registro. |
| `OptionCControllerLifetime.cs` | Identificación por PID, creación e imagen; observación de vida del llamador y controlador. El servicio recibe acceso temporal de consulta limitada/sincronización al proceso controlador, sin acceso a su token o memoria. Cancela el intento si muere el controlador; se restaura su DACL. Esto requiere prueba real de muerte/cancelación. |
| `OptionCElevation.cs` | Transporte UAC para **inicialización/prueba de token**, con metadatos privados, hash, nonce y mismo SID Windows. Rechaza otra cuenta/perfil. No eleva Express/Electron ni admite credenciales en el transporte por archivo. Usa API `ShellExecuteEx` sobre el EXE absoluto; no ejecuta intérpretes CMD/PowerShell. |
| `OptionCStorage.cs`, `OptionCContract.cs` | Directorios privados en ProgramData con ACL desde su creación, archivos protegidos, rutas cerradas y rechazo de reparse/propietario/permisos ambiguos. Referencias autenticadas, seis herramientas exactas 18.6, PE AMD64/PE32+, hashes retenidos mediante handles de lectura y cobertura de todas las DLL en `bin`/`lib`. Una lista de solo seis EXE no permite omitir DLL locales. |
| `OptionCRuntime.cs` | Vincula SCM, proceso `pg_ctl`, postmaster, SID/token, árbol, PID privado, puerto loopback y clúster. La parada solicita SCM y comprueba salida de handles, procesos propios ausentes, puerto liberado, PID retirado, estado de control limpio y salida cero del servicio/postmaster. No mata PostgreSQL por nombre. Una solicitud de parada no se presenta como parada verificada. |
| `shared/optionCPostgres.js` | Consumidor del protocolo real; rechaza evidencia incompleta, SID restrictivos ausentes, elevación ambigua, prueba sin reanudación usada como aprovisionamiento, respuestas fuera de nonce y secretos inesperados. Conserva códigos nativos conocidos y Win32 sin volcar stdout/stderr o secretos. |
| Aprovisionamiento, política, mantenimiento, supervisor y bootstrap Node existentes | Camino conectado a inicialización/servicio nativos, inscripción firmada, identidad SQL **180006 antes de DDL**, esquema/T0 existentes y emisión posterior existente. El wrapper directo de initdb queda inutilizable. Contraseñas técnicas generadas se guardan con DPAPI y referencias en JSON; se resuelven en memoria después de verificar inscripción. `persist()` rechaza configuración con contraseña resuelta. La contraseña humana del primer Administrador sigue en la captura TTY enmascarada existente. |

El servidor permanece oficial; el host propio es transitorio durante inicialización,
no un reemplazo residente de PostgreSQL. El servicio se configura en inicio manual
para esta aceptación; el asistente puede iniciarlo de nuevo. El autoinicio de Express
al iniciar sesión Windows no queda implementado por este cambio.

La fuente configura logs privados del clúster, sin registrar sentencias/parámetros
sensibles, y recuperación SCM: dos reinicios espaciados y después ninguna acción,
sin reboot ni comando externo. La última acción se deja explícitamente en `NONE`
porque [SCM repite la última acción configurada](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_failure_actionsw).
La creación de la [cuenta virtual usa el nombre del servicio y contraseña NULL](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-createservicea).
El [SID restrictivo de servicio](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-scmr/ea1a9acd-4bb2-473f-ae5b-55969c5960fc)
se comprueba además del token externo de initdb; no se confunden esas garantías.

## Verificaciones realizadas

- **435 pruebas aprobadas, cero fallidas/omitidas**, con procesos y red reales
  bloqueados por `safe-test-guard.cjs`. Se añadieron contratos negativos e integración
  simulada del aprovisionamiento con firma e inscripción reales de fixtures,
  Native/ACL/TLS/SQL simulados; la aplicación del esquema se sustituye en ese test.
  No se presenta ese test como T0 real ni validación nativa.
- La prueba simulada verifica referencias DPAPI persistidas, ausencia de contraseñas
  SQL en archivos generados, resolución en memoria y rechazo SQL 18.3 antes de DDL.
  También se prueba rechazo de evidencia parcial, token sin SID restrictivos o
  elevación, respuesta de credencial cruzada, parada sin postcondiciones y error
  1314 ligado al nonce sin salida cruda sensible.
- Diez módulos C# compilan offline como biblioteca x64 con advertencias tratadas
  como errores. La biblioteca **no se cargó/ejecutó**, tiene entrada CLR cero y no
  es un EXE de validación ni instalador. Se añadió manifiesto para el futuro host.
- Se conserva la regresión histórica del wrapper directo en una copia previa;
  no se usa para declarar probado el camino nativo nuevo.
- Se recalculan hashes/inventarios anteriores y de los kits ya entregados, sin
  ejecutar sus programas. La evidencia nueva queda en `tests.tap`, `baseline.json`,
  `preserved.json` y `verification.json` de la carpeta de esta fase.

No hubo llamadas reales a SCM, UAC, DPAPI, PostgreSQL o auxiliares experimentales.
No se modificaron bases del anfitrión, políticas o protecciones. No se construyeron
candidate-05/setup-03 ni se tocó el prototipo en cuarentena. Tampoco se generaron
descriptores reales, usuarios funcionales o datos de Reservaciones/Daily.

## Barreras reales pendientes

1. **Constancia F-02:** cotejo pendiente si se utiliza para ampliar una aprobación;
   se mantiene su resultado manual satisfactorio y no se solicita repetirla.
2. **Referencias de distribución:** antes de mapear/ejecutar PostgreSQL, el ejecutor
   exige inventario autenticado de archivos y DLL. La evidencia parcial existente
   no se promueve a autenticación. No se produjo ese inventario ni se investigó
   nuevamente PostgreSQL/N-04 durante esta implementación.
3. **Validación nativa del mismo ejecutor:** aún no se ha probado en Windows 11 Home
   crear el servicio/cuenta, UAC con el mismo SID, perfil del servicio, reducción,
   `CreateProcessAsUser`, Job inicial, lectura independiente, fallo previo a resume,
   cancelación/muerte del llamador/controlador, limpieza y no supervivencia de hijos.
   `token-check` es una ruta de fuente para esa prueba acotada; no está autorizada,
   empaquetada o ejecutada. No hay `SetupPostgres.exe` operativo entregado.
4. **Privilegios durante operación normal:** consulta de procesos/tokens y parada
   deben probarse con el usuario normal. Acceso denegado falla cerrado; no se usa
   un PID solo ni se agrega SeDebug, se cambia una política o se degrada un control.
   La inicialización dispone de transporte UAC; no se añadió elevación automática
   de consultas/paradas cotidianas para ocultar una falta de permisos.
5. **Recuperación y datos:** configuración, logs y postcondiciones están en fuente;
   falta probarlas. La inspección de cabecera de control del runtime no es una
   certificación integral de CRC/salud del clúster. Un PID residual, recuperación
   incompleta o apagado ambiguo requieren revisión; no se borra el PID, adopta un
   clúster existente, reintenta initdb o fabrica un T0.
6. **Aceptación de aplicación completa:** después de los controles nativos:
   inicialización real → identidad SQL/T0 → primer Administrador → autoridad y
   descriptor firmados → servidor/HTTPS → cliente → login, Reservaciones y Daily
   sintéticos → cierre/reinicio/persistencia. Ninguna de esas aceptaciones está
   declarada realizada por la compilación o los tests simulados.

El siguiente ensayo será uno del ejecutor real, con alcance, permisos, efectos,
hash y procedimiento previamente revisados y ejecución gráfica manual en la VM.
No se solicita ejecutar esta biblioteca ni hacer aprovisionamiento ahora. Si una
protección bloquea el componente, corresponde revisión legítima del archivo/código;
no restauración, exclusión, variación para eludir detección o reconstrucción del
prototipo de McAfee.
