# Reparación SCM de SetupPostgres — V-02

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Entrega: `local-fase-2e7-native-validation-02/CTSK-026-NativeValidation-02.zip`.

## Conclusión del diagnóstico

Los eventos 7000/7009 reportados por el usuario corresponden al servicio
`CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1` y documentan timeout de **30 segundos
para conectar con SCM**. No documentan primer token, Job ni contención; esos tres
resultados permanecen sin validar. El retorno complete=false se conserva como fallo.

Se identificaron dos defectos concretos en el código entregado V-01:

- StartServiceW → Check.That descartaba GetLastError. El win32Error=0 mostrado era
  un valor de transporte por defecto, **no éxito ni causa SCM recuperada**.
- La ruta --service-instance atravesaba validación WMI y lectura/hash/ACL del
  registro antes de ServiceBase.Run. El servicio debía establecer primero su
  conexión con SCM. Un fallo o demora en esas comprobaciones podía impedirla.

La corrección elimina ese trabajo de la ruta anterior al dispatcher y lo conserva
íntegramente en el worker. Esta causa de diseño es comprobable en las fuentes;
**no se ha aislado retrospectivamente la instrucción concreta que se demoró/falló
en la VM**. No se afirma que el SID, una ACL, WMI o el inicio de sesión de la cuenta
hayan sido la causa exacta. Los eventos de Aplicación/XML y el ensayo V-02 permitirán
distinguir un fallo de loader/CLR, de conexión o de una etapa posterior.

Referencias: [StartServiceW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicew)
para conservar el error del retorno falso y consultar progreso por separado;
[StartServiceCtrlDispatcherW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicectrldispatcherw)
para conectar sin inicialización específica previa. La aceptación de StartServiceW
no se convierte en certificación de token o Job.

## Qué se corrigió y revisó

| Archivo | Cambio |
|---|---|
| `scripts/windows-setup-native/SetupPostgres.cs` | Main reconoce --service-instance antes de interfaz, WMI y lectura de solicitudes. |
| `OptionCBootstrap.cs` | ServiceBase se construye solo con el UUID. OnStart solicita plazo y despacha el worker; lectura local, cuenta/imagen, VM y controlador permanecen como barreras. Añade hitos y startupStage. |
| `OptionCScmStart.cs` (nuevo) | Captura inmediata BOOL/GetLastError, estado antes/después, salidas SCM y evidencia de imagen/hash/cuenta/SID/SDDL/privilegios. Separa error primario y errores secundarios. |
| `OptionCServiceRegistration.cs` | StartBound utiliza esa captura, solicita solo START y QUERY_STATUS; no adopta un servicio existente ni reintenta StartService. |
| `OptionCServiceConfig.cs` | Expone SDDL y privilegios consultados; exige la lista mínima del bootstrap. |
| `OptionCElevation.cs` | El transporte conserva diagnósticos nativos, disponibilidad del error y errores secundarios. |
| `OptionCNativeValidation.cs` | V-02 admite solo suspended; conserva el error primario ante fallo de limpieza/restauración de DACL. |
| `scripts/windows-setup/scm-start.test.cjs` (nuevo) | Contratos de captura, orden SCM, barreras y exportación acotada. |
| `export-scm-start-evidence.ps1` (nuevo) | Consulta exacta y exportación en carpeta nueva de archivos/ACL/estado/eventos; no cambia servicios o políticas. |
| `prepare-scm-start-validation.cjs` (nuevo) | Empaqueta la compilación revisada y verifica correspondencia de fuentes/hash. No ejecuta procesos. |

La revisión confirma en fuente/configuración esperada: imagen absoluta privada
entre comillas, argumentos fijos --service-instance UUID, sin stdin en SCM;
OWN_PROCESS; cuenta virtual NT SERVICE\CTSK026-UUID con contraseña NULL; SID
restrictivo; privilegio mínimo; sin recuperación automática; ACL privadas existentes
sin ampliarlas. La conexión normal conserva UAC del mismo SID, y el servicio sigue
verificando al controlador por handle/creación/imagen. **Nada de eso se declara
probado efectivamente en la VM por esta revisión.**

El intento original no se inició, detuvo, borró, parcheó ni reconfiguró. El UUID nuevo
será generado por la interfaz; nombre/directorio existentes siguen siendo rechazo,
sin fallback. No se cambiaron timeout/políticas de Windows, antivirus, cuentas,
derechos de inicio de sesión o instalaciones PostgreSQL.

## Qué se probó realmente aquí

- Compilación offline x64 del perfil exclusivo de validación y del perfil normal
  como biblioteca de revisión, con advertencias como errores.
- **454 pruebas de la selección aislada aprobadas; 0 fallidas/omitidas**, con procesos
  y red reales bloqueados. Son contratos/fixtures/regresión y comprobaciones de
  código, no ensayos SCM/token/Job. Se conserva la misma exclusión de suites
  históricas incompatibles del informe V-01; no se declara toda la suite histórica
  aprobada. Plan y TAP están guardados.
- Parseo PowerShell del recolector, sintaxis Node, PE AMD64/PE32+, entrada CLR del
  EXE y ausencia de entrada en biblioteca, manifiesto asInvoker, inventario/fuentes
  cotejados y **20 entradas ZIP** verificadas por hash sin ejecutar su contenido.
- ZIP y EXE originales V-01 conservan sus hashes; native-approval.json sigue intacto
  con writeOperationsAuthorized=false. F-01/F-02 no se repitieron.
- Se preparó además un arnés C# de callbacks sintéticos para errores 0/2/3/5/193/
  1053/1067/1069 y limpieza. **No se contó como prueba ejecutada**: tras la invocación
  de compilación no estaba disponible su EXE esperado y el lanzamiento no devolvió
  un código de salida. No se repitió su construcción/lanzamiento ni se cambiaron
  protecciones. Se conserva la fuente y estado inconcluso; no conocemos la causa
  de ausencia del archivo. Cero aserciones de ese arnés se atribuyen a esta fase.

No se ejecutó aquí SetupPostgres, SCM, UAC, token/Job, PostgreSQL ni el componente en
cuarentena. No hubo clúster, login, Reservaciones o Daily. La reparación **todavía
requiere validación real en Windows 11**; candidate-05/setup-03 no se construyeron.

EXE V-02 SHA256: `b8637b54e75466219f52bdec2b5dfcc92c13c0e94c87d8f54df82bdbcf3121c5`.
ZIP V-02 SHA256: `aac8e36127c3bb78a688ef6dd57bce421b351139891a0b0fe091b1c6eaff245c`.
Firma Authenticode: NotSigned. Hashes adicionales: SHA256SUMS.txt del kit.

## Tiempo y evidencia original

Se mantienen separadas las dos referencias: 09:59 aproximada America/Cancun y
15:59:09 mostrada por el registro invitado. La diferencia visible es seis horas
aproximadas; **su causa es desconocida**. No se ha recibido/cotejado el XML UTC ni
la zona del invitado. El registro de observación deja constancia de que los datos
proceden del reporte textual del usuario y de capturas que aquí no se inspeccionaron.
El recolector conserva XML/RecordID, hora mostrada y zona del invitado y consulta
ambas ventanas de manera independiente, sin modificar relojes.

## Siguiente paso manual único

Seguir `PRUEBA-SCM-SETUPPOSTGRES-VIRTUALBOX-02.md`: exportar eventos/archivos originales
como datos, guardar snapshot del fallo conservado, extraer V-02 en carpeta nueva,
cotejar hashes y ejecutar **solo suspended una vez**, con UAC del mismo usuario y
UUID nuevo. Devolver resultado, scm-before-start/scm-start-call, hitos del worker,
recibo si existe y eventos SCM/Aplicación. No tocar el servicio original ni ampliar
permisos si falla. No autoriza crear clúster ni continuar a otros casos.

Después de revisar ese resultado se resolverá el bloqueo que efectivamente revele.
Se mantiene la ruta posterior hacia candidate-05/setup-03, clúster sintético nuevo,
identidad SQL/T0, Administrador/descriptores/HTTPS, apertura/login y aceptación de
Reservaciones/Daily. No se certifica ninguna de esas etapas por compilar este kit.
