# F-02 — Creación privada y rechazo de destino existente

Procedimiento para **revisar antes de autorizar y ejecutar** manualmente en
`Windows11-CommunityTours-Test`. Preparar el kit no autoriza sus escrituras.
F-01 quedó satisfactoria dentro de su alcance de lectura y no se repite.

`synthetic-acceptance-only`; `productionAuthorized=false`.
Este ensayo utiliza el creador real de directorios del instalador. No es
candidate-05, setup-03, aprovisionamiento PostgreSQL ni instalación funcional.

## Qué ejecuta y qué permisos requiere

`Validacion-Directorios-026.exe` abre la interfaz Electron existente. Node invoca
directamente el lector validado por F-01 y el creador `SetupPrivateDirectories.exe`
mediante JSON por stdin, sin shell ni PowerShell. Cuenta normal, **sin elevación,
contraseñas o comandos manuales**. No incluye las nuevas primitivas de tokens/Job
o SCM; no ejecuta PostgreSQL ni el prototipo en cuarentena.

La primera acción consulta solamente inventario, identidad de la VM, ACL de los
dos auxiliares y ausencia del destino F-02. Es una precondición de este ensayo;
no vuelve a ejecutar el procedimiento F-01 ni consulta la procedencia PostgreSQL.

La segunda acción requiere una casilla separada de consentimiento en la interfaz
y una autorización previa de este procedimiento. Se permite un solo intento por
sesión. Crea **cuatro directorios nuevos**, con DACL privada desde su creación:

```text
%LOCALAPPDATA%\ctsk-f02-<UUID-de-esta-sesión>\
    ctsk-setup026-2e7-candidate-05\
    ctsk-server026-<mismo-UUID>\
    ctsk-client026-2e7-candidate-05\
```

Estos tres hijos están dentro de la raíz F-02. No son las rutas finales de
instalación. No consumen ni sobrescriben directorios reales de candidate-04/05.
Los únicos principales con permisos nuevos son SID actual, SYSTEM y
Administradores; no se otorgan permisos a otros usuarios ni al servicio futuro.

Después, el lector independiente verifica privacidad e identidad. Se escriben
cuatro archivos `f02-inheritance-check.txt`, uno en cada directorio, con una línea
sintética sin datos de empresa; se comprueban sus ACL heredadas. A continuación se
invoca el creador con el mismo destino: debe devolver `DIRECTORY_EXISTS`, sin
crear ni cambiar archivos. Se comparan contenidos y se releen ACL. Finalmente se
escribe `F02-result.json` en la raíz con resultados, UUID/SID y hashes. Total
esperado: cuatro directorios y cinco archivos de prueba.

Extraer el ZIP también crea sus archivos de programa en la carpeta elegida.
Electron puede crear cachés en TEMP bajo `ctsk-f02-ui-<UUID>`. Windows/antivirus
pueden registrar la ejecución. No se modifican directorios existentes, ACL ajenas,
servicios, cuentas, políticas, PostgreSQL, bases, certificados ni descriptores.

## Pasos, únicamente después de revisar y autorizar

1. Confirmar VM e instantánea; cerrar la revisión F-01. Mantener las protecciones.
2. Extraer `CTSK-026-DirectoryValidation-01.zip` completo en una carpeta nueva de
   Descargas. No sobrescribir otra extracción. Contrastar el SHA256 de la entrega.
3. Abrir `Validacion-Directorios-026.exe` sin administrador. Ante bloqueo de
   SmartScreen, Defender o McAfee, cancelar y devolver el mensaje; no eludirlo.
4. Pulsar **Consultar destino, sin crear carpetas**. Esperar
   `F02_READY_NO_WRITES` y una ruta nueva `ctsk-f02-<UUID>`.
5. Solo con esta prueba previamente autorizada, marcar la casilla que permite
   exclusivamente F-02 y pulsar **Crear y verificar directorios F-02** una vez.
6. Esperar el resultado; puede requerir varios minutos. Éxito esperado:
   `F02_PRIVATE_DIRECTORIES_AND_NEGATIVE_VERIFIED`, junto a la ruta de la constancia.
7. Devolver el código visible y, si es posible, el contenido de `F02-result.json`.
   Contiene identificadores Windows/VM y rutas locales; no incluye contraseñas.
   Se puede ocultar el nombre del perfil al compartir una captura.
8. Cerrar la ventana. Conservar los archivos de evidencia, sin borrar, cambiar ACL
   o repetir la creación después de un error. No continuar con PostgreSQL.

## Qué permite concluir

Éxito confirma el camino nativo real de creación privada, lectura independiente,
herencia de archivos y rechazo de destino existente **en este ensayo**. No prueba
todavía la preparación de ACL para una cuenta de servicio, los casos de reparse
malicioso/ACL adversaria, primer token, Job, SCM, recuperación, T0, bootstrap,
emisión de descriptores, login o módulos. No habilita automáticamente escrituras
del instalador ni aprueba construir candidate-05/setup-03.

`F02_*_REVIEW`, `DIRECTORY_EXISTS` en la consulta inicial, timeout o rechazo ACL
exigen revisar la evidencia; pueden existir directorios parciales. No se limpian,
reintentan ni se promueve el intento a éxito automáticamente.
