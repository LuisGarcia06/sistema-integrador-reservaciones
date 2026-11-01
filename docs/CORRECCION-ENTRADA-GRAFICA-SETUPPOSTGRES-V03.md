# Corrección de entrada gráfica de SetupPostgres — V-03

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Entrega: `local-fase-2e7-native-validation-03/CTSK-026-NativeValidation-03.zip`.

## Causa exacta y comprobación de V-02

El usuario verificó el EXE SHA256
`b8637b54e75466219f52bdec2b5dfcc92c13c0e94c87d8f54df82bdbcf3121c5` y lo abrió sin
argumentos ni elevación. Recibió VALIDATION_ARGUMENTS/InvalidOperationException,
hresult -2146233079, complete=false, UUID cero y Win32 no disponible. No hubo
selección de suspended, UAC ni repetición. Se conserva como fallo de apertura;
no valida SCM, primer token, Job o contención.

La inspección de **metadatos e IL del propio binario V-02** confirma:

- Punto de entrada `CommunityTours.Setup026.SetupPostgres.Main`, con STAThread.
- Main despacha --service-instance primero y luego llama NativeValidation.Entry:
  sí corresponde al perfil exclusivo de validación, no al perfil de producción.
- Entry no contiene la ruta a Application.Run, no llama Permit y no atiende
  --elevated-request. Solo contempla el probe y --request antes de la excepción.
- Su subsistema era WindowsCui, coherente con /target:exe: explica la consola.

La regresión fue introducida al retirar la antigua rama de servicio mediante un
reemplazo demasiado amplio, que también borró las ramas contiguas de elevación,
autorización inicial y GUI. Las pruebas anteriores no ejecutaban la selección
real de modos y no detectaron esta pérdida. Un hash correcto no corregía esa
lógica; la entrega reproducía exactamente el defecto del código empaquetado.

## Corrección limitada y archivos

**Modificado:** `scripts/windows-setup-native/OptionCNativeValidation.cs`.
Restaura la GUI sin argumentos y Permit, el lector de solicitudes con Permit y el
transporte --elevated-request. Usa un selector explícito; conserva controles de
Windows/VirtualBox, cuenta, nonce/hash y autorización. El panel ajusta su altura
para mostrar el nuevo identificador de perfil sin ocultar los controles.

**Nuevos:**

- `scripts/windows-setup-native/OptionCValidationEntry.cs`: selector C# puro y
  determinista para GUI, solicitud, UAC y probe; rechazo de argumentos inválidos.
- `scripts/windows-setup/test-validation-entry.ps1`: compila y ejecuta únicamente
  ese selector, con callbacks en memoria, sin cargar el host.
- `scripts/windows-setup/inspect-validation-entry.ps1`: lee PE/CLI e IL sin
  Assembly.Load ni ejecución del EXE; resuelve entrada, atributos y llamadas.
- `scripts/windows-setup/build-validation-entry.cjs`: compila desde fuentes con
  perfiles explícitos, verifica rutas del binario y hashes, y empaqueta solo si
  pasan los gates. No utiliza una instantánea arbitraria de un EXE anterior.
- `scripts/windows-setup/validation-entry.test.cjs`: regresiones del selector y
  rechazo de V-02 por el gate, incluso si se etiqueta ficticiamente como GUI;
  rechazo ante pérdida de callback, STA, Permit o dispatcher SCM.
- `docs/PRUEBA-APERTURA-SETUPPOSTGRES-V03.md`: comprobación manual limitada.

**Inspeccionados y sin cambios en esta fase:** SetupPostgres.cs (Main),
OptionCBootstrap.cs, OptionCServiceConfig.cs y OptionCServiceRegistration.cs.
El resto de fuentes nativas existentes coincide con la entrega V-02. No se cambia
el modelo de datos, backend, frontend, arquitectura o tecnologías de la aplicación.

## Construcción y verificaciones reales

- Construcción offline desde 13 fuentes C# como **winexe x64** con
  NATIVE_VALIDATION_ONLY, Main explícito, manifiesto asInvoker y advertencias como
  errores. El perfil normal también compila como biblioteca de revisión.
- **12 comprobaciones del selector C# real compilado y ejecutado**, con callbacks
  simulados: cero argumentos selecciona solo GUI después del contexto; solicitud,
  UAC y probe seleccionan su callback; ocho entradas inválidas no ejecutan callbacks.
  No se ejecutó la ventana real ni APIs de servicio/elevación/token/Job.
- **461 pruebas de la selección aislada aprobadas, 0 fallidas/omitidas**, con
  procesos y red bloqueados. Se conserva la misma exclusión histórica de suites
  incompatibles de V-02; no se declara toda la suite histórica aprobada.
- Inspección del EXE V-03: PE AMD64, subsistema WindowsGui, Main/STA, dispatcher SCM
  temprano, llamada al selector, callback OpenGraphical, Permit → Application.Run,
  creación de ValidationWindow y transporte Elevation.Elevated restaurado.
  La construcción de la ventana no invoca servicio o elevación automáticamente.
- Biblioteca normal: sin entrada ejecutable ni tipos NativeValidation/ValidationEntry.
  Fuentes y binarios/metadata coinciden por hash. **20 entradas ZIP** cotejadas por
  hash, sin extraer ni ejecutar programas.
- ZIP/EXE originales V-01 y V-02 siguen coincidiendo con sus referencias.
  native-approval.json conserva su hash y writeOperationsAuthorized=false.
  El servicio original no se consultó/inició/detuvo/configuró/borró en esta fase.

La corrección y el perfil se comprueban con código compilado y con llamadas del
binario, no solo buscando literales. **La GUI real de V-03 sigue pendiente de abrir
en Windows11-CommunityTours-Test.** No se ejecutó SetupPostgres en el anfitrión,
SCM, UAC, PostgreSQL o el componente en cuarentena. No hubo clúster, aceptación
de token/Job/contención, login, Reservaciones ni Daily. No se relajaron protecciones.

Referencias técnicas: [opciones de salida C#](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/output)
y [PEReader](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.portableexecutable.pereader?view=net-10.0).
La inspección usa el lector sobre bytes de las entregas conocidas, sin cargar ni
invocar el ensamblado objetivo.

## Hashes de entrega

EXE V-03 SHA256: `6668fac607d0234a7bfe033497973ae638dd51426c54de3b537a1c759236a7d5`.
ZIP V-03 SHA256: `b128e6620c117e6042970fbe1cb3751e446713c426276732c86b7e1a59642653`.
Firma Authenticode: NotSigned. El ZIP incluye SHA256SUMS.txt e inventario.

## Siguiente paso manual

Conservar V-02 y el fallo V-01, extraer V-03 en carpeta nueva de la misma VM,
cotejar hashes y abrir normalmente con doble clic sin argumentos. Debe aparecer
la ventana versión 03, perfil native-validation-only-v03-graphical-entry, alcance
cerrado, solo suspended, consentimiento sin marcar y botón visible, sin consola
ni VALIDATION_ARGUMENTS. **Para esta comprobación, solo abrir y cerrar:** no marcar
consentimiento, pulsar Ejecutar ni aceptar UAC. Registrar resultado/captura sin
repetir si falla.

Después de comprobar la GUI se podrá retomar el ensayo SCM acotado con UUID nuevo.
No se toca CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1. Candidate-05/setup-03 y la
aceptación funcional de Community Tours siguen pendientes; no se habilitan por
abrir la interfaz ni por superar las pruebas de selección de modo.
