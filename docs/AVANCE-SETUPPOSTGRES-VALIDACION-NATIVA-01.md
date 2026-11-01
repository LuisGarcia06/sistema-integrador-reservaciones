# Avance V-01 — ejecutable controlado de SetupPostgres

Fecha: 2026-11-01 (America/Cancun).
Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.

Se entregó `local-fase-2e7-native-validation-01/CTSK-026-NativeValidation-01.zip`.
No es candidate-05, setup-03 ni una instalación aprobada. F-01/F-02 no se repitieron.

## Cambios

- `scripts/windows-setup-native/SetupPostgres.cs`: entrada STA y selección de perfil
  de compilación. El EXE de ensayo excluye los métodos de aprovisionamiento del host.
- `OptionCContract.cs`: protocolo cerrado exclusivo del ensayo al compilar ese
  perfil; el protocolo de producción conserva sus restricciones.
- `OptionCBootstrap.cs`: SCM comparte identidad/vida del controlador y selecciona
  el worker de ensayo; el trabajo de inicialización queda excluido de ese EXE.
- `OptionCNativePrimitives.cs`: ruta fija a su propia copia para el ensayo, con el
  mismo CreateProcessAsUser, suspensión, lista de handles, Job atómico, lectura de
  token y Dispose. Conserva Win32 al fallar reducción o Medium. El perfil normal
  conserva las comprobaciones de PostgreSQL/CMD; no incorpora hooks del ensayo.
- `OptionCServiceConfig.cs` / `OptionCServiceRegistration.cs`: deshabilitación del
  servicio nuevo solo después de verificar identidad y parada, con postlectura de
  configuración. No se adopta, elimina o modifica un servicio ajeno.
- Nuevo `OptionCNativeValidation.cs`: interfaz de consentimiento/caso, diez casos,
  verificación de constancias, procesos de prueba limitados y evidencia de muerte.
- Nuevos `prepare-native-validation.cjs`, `native-validation.test.cjs` y
  `observe-native-validation.ps1`: compilación/empaquetado reproducible, regresión
  de límites y observación independiente de solo lectura.
- Procedimiento: `PRUEBA-NATIVA-OPCION-C-VIRTUALBOX-01.md`. Fuentes previas y hashes
  de cambios están en `local-fase-2e7-native-validation-01/before` y
  `changed-sources.json`. El listado completo está en `verification.json`.

No se editaron esquema, backend funcional, frontend, permisos de usuarios,
credenciales, `.env`, aprobaciones de producción o instalaciones existentes.

## Verificado realmente en el anfitrión

1. Compilación offline de once fuentes C# como EXE x64 de ensayo y biblioteca del
   perfil normal, con advertencias como errores. Ninguno se cargó o ejecutó.
2. Lectura binaria de PE AMD64/PE32+, entrada CLR no cero del EXE, biblioteca sin
   entrada, manifiesto asInvoker y presencia/ausencia de literales del perfil.
   Firma Authenticode del EXE: **NotSigned**.
3. **446 pruebas aprobadas, cero fallidas/omitidas en la selección segura**:
   contratos, regresión, fixtures y comprobaciones de código. Procesos/red reales
   bloqueados por safe-test-guard. No son 446 ensayos de Windows.
4. La selección inicial amplia tuvo 18 fallos: 14 intentos históricos de ejecutar
   procesos bloqueados por el guard, 2 imports de wrappers históricos y 2 errores
   en el preprocesador del nuevo test. Estos últimos se corrigieron. Las tres
   suites históricas incompatibles se excluyeron de la selección segura, sin
   debilitar el guard ni modificar sus fuentes. Quedan ambos TAP y test-plan.json;
   no se declara aprobada la suite amplia completa.
5. Sintaxis Node y parseo PowerShell del observador. Inventario/fuentes cotejados;
   18 entradas ZIP verificadas contra archivos locales sin extraer/ejecutar EXE.
6. 21 registros históricos cotejados por SHA256, incluidos kits F-01/F-02 y
   entregas anteriores; todos coinciden. native-approval.json permanece intacto,
   con writeOperationsAuthorized=false y validaciones generales cerradas.

EXE SHA256: `f9f3ea35371bfe9784eafd01112eef3d3b0595eb833212e3c2248fa7906716f6`.
ZIP SHA256: `00c6a61aad13f83f57ab93624972a8feb626d61f4d9ab614851c1067d1102a40`.

No hubo ejecución real del host, SCM, UAC, reducción de token, Job, DPAPI,
PostgreSQL, T0, Community Tours, login, Reservaciones o Daily. No se usó el
componente en cuarentena ni se cambiaron protecciones. La validación de identidad,
Job y fallos en Windows 11 **sigue pendiente**, ahora con un EXE entregable.

## Siguiente paso manual

En Windows11-CommunityTours-Test: snapshot antes-V01-sin-cluster → extraer ZIP
nuevo dentro del invitado → cotejar hashes → abrir SetupPostgres.exe normalmente
→ caso suspended → consentimiento acotado/UAC con el mismo usuario → conservar
result.json y constancia del servicio. Ante fallo temprano/1314/acceso denegado,
detener la secuencia y revisar evidencia. El procedimiento especifica los negativos,
Job con descendientes, cancelación y tres pruebas de muerte, incluida observación
externa y salida por snapshot, sin matar procesos por nombre.

Después de revisar V-01 quedan referencias autenticadas PostgreSQL EXE/DLL y
validación del perfil real (incluido CMD/token de initdb y control del servicio
oficial). Ese resultado permitirá avanzar a candidate-05/setup-03 y, en una etapa
posterior autorizada, clúster sintético nuevo, identidad SQL/T0, Administrador,
descriptores/HTTPS, apertura/login y prueba de Reservaciones/Daily/persistencia.
V-01 no sustituye esas aceptaciones ni inicia esa cadena automáticamente.
