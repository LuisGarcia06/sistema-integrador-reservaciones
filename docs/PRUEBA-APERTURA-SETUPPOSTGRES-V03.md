# V-03 — corrección de inicio gráfico de SetupPostgres

`synthetic-acceptance-only`; `productionAuthorized=false`.
Esta entrega es un ejecutor exclusivo de validación; no es candidate-05/setup-03.

## Defecto V-02 confirmado

El SHA256 `b8637b54e75466219f52bdec2b5dfcc92c13c0e94c87d8f54df82bdbcf3121c5`
identifica correctamente el EXE V-02. Su Main sí entra al perfil de validación.
El código de Entry perdió las ramas para cero argumentos, --elevated-request y
la llamada inicial a Permit al retirar la rama SCM mediante un reemplazo demasiado
amplio. Por eso el doble clic llega a la exigencia --request y arroja
VALIDATION_ARGUMENTS antes de abrir la GUI. El UUID cero indica que no se procesó
una operación; no es aceptación de identidad, token, Job ni SCM.

La inspección de metadatos/IL del mismo EXE confirma esas llamadas ausentes.
Además, V-02 tenía subsistema WindowsCui (/target:exe), que explica la consola.
No fue un error de hash ni la distribución accidental del perfil de producción.
El resultado reportado se conserva como fallo de apertura, sin UAC ni suspended.

## Corrección V-03

- Main conserva --service-instance primero, sin volver a poner WMI/archivos antes
  del dispatcher SCM. No se cambia el servicio anterior.
- Un selector C# explícito distingue cero argumentos (GUI), --request, transporte
  --elevated-request y --trial-child. Rechaza argumentos desconocidos o incompletos
  antes de invocar cualquier callback.
- GUI y solicitudes comprueban Permit; el transporte elevado conserva sus controles
  de cuenta/nonce/hash y la autorización dentro de Run. No se retira ninguna barrera.
- Sin argumentos se ejecutan comprobaciones de Windows/VirtualBox y aprobación del
  paquete y luego se abre la ventana. No se solicita UAC, no se crea operación,
  servicio, directorio de sesión o clúster por abrirla.
- /target:winexe evita la consola automática. Se mantienen x64, manifiesto asInvoker
  y STAThread en Main. Los modos de solicitud siguen presentes para stdin heredado
  por los consumidores existentes; este ensayo no certifica su IPC real.
- La interfaz muestra perfil `native-validation-only-v03-graphical-entry`, versión
  03 y únicamente suspended; consentimiento inicialmente sin marcar. El panel
  superior ajusta su altura al contenido para no ocultar el botón.

## Siguiente comprobación manual: solo abrir y cerrar

1. Conservar el ZIP/EXE V-02, captura del error y evidencia V-01. No usar los mismos
   destinos de extracción ni copiar este EXE a la carpeta del servicio original
   `CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1`.
2. Mantener snapshot y red desactivada en Windows11-CommunityTours-Test. Extraer
   CTSK-026-NativeValidation-03.zip dentro del disco invitado, en una carpeta nueva
   del mismo usuario, fuera de carpetas compartidas/red.
3. Calcular SHA256 del ZIP y de SetupPostgres.exe y cotejarlos con el informe V-03
   recibido fuera de la VM y SHA256SUMS.txt/kit-inventory.json. No reutilizar hashes
   V-02. El EXE no tiene firma Authenticode de editor.
4. Abrir SetupPostgres.exe con doble clic normal, sin argumentos y sin “Ejecutar
   como administrador”. Debe aparecer la ventana con **validacion nativa 03 —
   apertura grafica y diagnostico SCM**, el perfil indicado y ambos límites.
   No debe abrirse una consola ni aparecer VALIDATION_ARGUMENTS.
5. Comprobar que solo aparece suspended, el consentimiento está sin marcar y el
   botón es visible. **No marcar consentimiento, no pulsar Ejecutar y no aceptar
   UAC en esta comprobación de apertura.** Si aparece UAC espontáneamente o un
   error, cancelar/detenerse y conservar su texto/captura, sin repetir.
6. Cerrar normalmente la ventana y registrar si abrió y cerró correctamente.
   Ese resultado valida solo apertura/cierre; no aprueba el ensayo SCM o token/Job.

No iniciar/detener/configurar/borrar el servicio V-01; no ejecutar su copia privada.
No se inicializa PostgreSQL ni se modifican instalaciones. Si una protección
bloquea la entrega, conservar la alerta; no restaurar, excluir, cambiar políticas
ni variar el archivo para eludirla.

Después de validar esta apertura se podrá retomar la prueba SCM suspended prevista,
con consentimiento explícito en la interfaz y UUID nuevo, conservando las reglas
V-02 de instancia nueva y evidencia. No hay continuación automática al abrir.

## Verificación de construcción

Se compilan de nuevo las fuentes con /define:NATIVE_VALIDATION_ONLY y /main exacto.
El empaquetado exige fuentes/hash coincidentes y no acepta una instantánea arbitraria
de un EXE previamente compilado. Antes de entregar lee PE/CLI e IL sin cargar ni
invocar el host: comprueba Main/STA, perfil, llamada al selector y callback gráfico,
Permit→Application.Run, transporte UAC restaurado, ausencia de operación automática
al construir la ventana y exclusión del perfil gráfico en la biblioteca normal.

La regresión ejecuta el selector C# real con callbacks en memoria: cero argumentos
solo selecciona GUI; solicitud, UAC y probe tienen rutas distintas; argumentos
inválidos no llaman al contexto ni a otro callback. La ventana real, UAC, SCM,
primer token y Job no se ejecutan en esa regresión. La comprobación real de la GUI
es el procedimiento manual anterior.

Referencias: [opciones de salida de C#](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/output)
para el tipo de ejecutable y [PEReader](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.portableexecutable.pereader?view=net-10.0)
para la lectura de metadatos del binario sin ejecutar su entrada.
