# F-01 realizada y siguiente validación del instalador

Alcance permanente: `synthetic-acceptance-only`, `productionAuthorized=false`.
Este registro actualiza el estado posterior al informe
`AVANCE-026-OPCION-C-IMPLEMENTACION.md`, sin alterar su evidencia histórica.

## F-01: satisfactoria dentro de su alcance

El usuario comunicó ejecución manual en `Windows11-CommunityTours-Test`:
abrió `Revision-Configuracion-026.exe`, confirmó VM y ejecutó solo la primera etapa.
La interfaz abrió y devolvió:

> Identidad de VM y ACL leídas sin PowerShell. Carpeta del cliente: missing.
> Descriptor: missing. Autoridad: missing. La carpeta corresponde a la etapa 2;
> los archivos firmados a la etapa 6, después de T0 y bootstrap. No se generó
> configuración. Pendientes primer token, contención y servicio exclusivo.

Se registra **lectura manual realizada satisfactoriamente**. La evidencia es el
reporte del usuario, no observación independiente de Codex; no incluye SHA256
medido dentro del invitado ni resultados de casos ACL adversarios. No se pide
repetir F-01. Se conserva el kit original y su hash.

No hubo etapas posteriores, PostgreSQL ejecutado, configuración creada ni cambios
de servicios/políticas según el reporte. F-01 no autoriza escrituras ni valida
token, Job, servicio, instalación integral o funcionamiento de módulos.
`F01-user-observation.json` conserva el texto y estos límites. El registro de
aprobación añade el resultado manual de lectura; la aprobación general para
escrituras permanece cerrada. Ahora `native-gate.cjs` y el control PostgreSQL
exigen también `writeOperationsAuthorized=true`: un resultado positivo de lectura
o modificar solamente el indicador de validación del lector no abre esa barrera.

## Código avanzado en esta entrega

- **Creador real de directorios:** `SetupPrivateDirectories.cs` admite una raíz
  de validación nueva `ctsk-f02-<UUID>` y tres hijos dentro de ella, usando la misma
  creación atómica con DACL privada que el camino real. Rechaza raíz existente,
  rutas fuera de alcance, cambios de SID/UUID y errores de lectura. El modo real
  de tres destinos de instalación se conserva. Manifiesto propio `asInvoker`.
- **Validación gráfica F-02:** usa ese creador y el lector de F-01, sin cambiar el
  kit F-01 o paquetes instalados. Postvalida ACL con el lector independiente,
  comprueba herencia mediante cuatro marcadores, ejecuta el caso negativo de
  destino existente y compara contenidos/ACL antes de emitir constancia. Exige
  consentimiento separado, permite un intento y conserva evidencia parcial.
- **Primer token/contención:** `OptionCNativePrimitives.cs` implementa las
  primitivas nativas, sin entrada ejecutable: SID de servicio/session 0, token
  restringido, integridad Medium, grupos identificados por SID y privilegios
  acotados. Crea únicamente initdb en ruta fija y argumentos cerrados; comprueba
  hash de imagen, versión y archivo bloqueado contra escritura durante el intento.
  Lista explícita de tres handles de entrada/logs. Solicita Job en la propia
  creación suspendida, comprueba pertenencia, imagen del proceso por handle y
  abre **independientemente el token del hijo** antes de permitir reanudarlo.
  Espera raíz y Job vacío; fallo/timeout termina solo ese intento y comprueba
  limpieza. No incluye DEBUG_PROCESS ni habilita privilegios o políticas.
- **Contexto interno CMD:** el código construye entorno cerrado, sin herencia
  del entorno de usuario: COMSPEC/System32/PGDATA/TEMP/locale fijados. Rechaza
  AutoRun presente en HKLM/HKCU en ambas vistas y perfil del SID de servicio no
  cargado. No lanza CMD propio; PostgreSQL conserva su excepción interna limitada.
- **Identidad del servicio:** `OptionCServiceConfig.cs` implementa consulta SCM
  por handle de un nombre derivado exclusivamente del UUID. Contrasta cuenta
  virtual/SID, imagen y argumentos oficiales, directorio, SID restrictivo,
  privilegios requeridos, ACL del objeto servicio y acciones de recuperación sin
  comandos externos. Rechaza estados ambiguos. Es consulta de configuración:
  **no equivale a registro, arranque, parada o recuperación ya implementados**.

La asociación inicial al Job usa el atributo documentado
[`PROC_THREAD_ATTRIBUTE_JOB_LIST`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute),
para evitar depender exclusivamente de una asignación posterior a la creación.
La consulta del token sigue siendo previa a reanudar. La compatibilidad efectiva
de estas llamadas y los privilegios de creación bajo la cuenta mínima requieren
prueba real; no se añade un fallback ni se concede un privilegio para ocultar un fallo.

Estos módulos son fuentes de implementación del instalador, no una restauración
o recompilación del prototipo en cuarentena. No contienen su código ni un modo de
eludir antivirus. Solo se compiló una biblioteca de revisión sin entrada de
programa para comprobar tipos/sintaxis; no fue cargada o ejecutada, no está aprobada
y **no se incluye en F-02**. El host operativo `SetupPostgres.exe` sigue pendiente.

## Qué está comprobado y qué no

- **409 pruebas automatizadas aprobadas, 0 fallidas, 0 omitidas**: contratos,
  regresión, firmas e integración simulada. El guard prohíbe procesos y red reales.
  Los casos F-02 cubren consentimiento, cambio de identidad, fallo parcial,
  postlectura rechazada, modificación durante el rechazo negativo, reintentos e IPC.
- Compilación offline x64 del creador de directorios y de la biblioteca nativa:
  correcta, con advertencias tratadas como errores. Esto no prueba comportamiento
  Windows de token, handles, Job, registro o SCM.
- ZIP F-02: 92 archivos, 177,670,124 bytes; inventario completo, sintaxis JavaScript,
  cabeceras AMD64 de sus cuatro ejecutables y prueba CRC/estructura del ZIP correctos.
  No contiene PostgreSQL ni auxiliares de token/Job/SCM.
- Los **19 registros** de artefactos anteriores y el ZIP F-01 coinciden con sus
  hashes conservados. No se reconstruyeron candidates o setup previos.
- No se controló la VM, no se ejecutaron aplicaciones/nativos experimentales en el
  anfitrión y no se modificaron bases, políticas o antivirus. Solo se ejecutaron
  pruebas Node aisladas, compilador offline y herramienta de archivo para el kit.

## Entrega F-02 para revisión previa

**Estado actual: pendiente de revisión por decisión expresa del usuario.** No se
ejecuta ni se habilita. La autorización solicitada no fue concedida; no se vuelve
a solicitar mientras se mantenga ese estado.

Procedimiento: `PRUEBA-F02-DIRECTORIOS-PRIVADOS.md`.
Kit: `local-fase-2e7-f01-and-native-progress/CTSK-026-DirectoryValidation-01.zip`.
SHA256 del ZIP:

```text
b8fe10b9da159b8873d5e4b226fa8f5c496de1e514b78b5b9236a635a2b048a8
```

Es un hash local de entrega, no una firma del proveedor. El detalle está en
`F02-delivery.json`. Su preparación **no significa que se haya ejecutado ni
autorizado F-02**. La prueba manual necesita revisión/consentimiento propios,
porque realiza cuatro directorios y cinco archivos nuevos. Usuario normal, sin
elevación, contraseñas, comandos, PostgreSQL, cuentas o servicios. Ante bloqueo
de una protección, cancelar; no cambiar políticas, restaurar ni excluir archivos.

## Lo que falta para instalación funcional

1. Ejecutar F-02 manualmente solo tras revisar/autorizar el procedimiento; cotejar
   la constancia y resolver cualquier fallo sin reintentos automáticos. No ocupa
   rutas finales ni habilita escrituras generales del instalador.
2. Integrar el host SCM de la cuenta exclusiva y los directorios de servicio con
   ACL para SID del servicio y actor. Faltan registro/transición al servicio
   oficial, inicio/parada por identidad y handles, y pruebas de recuperación. La
   consulta SCM recién escrita no sustituye esas operaciones.
3. Conectar las primitivas de token/Job al host, cerrar serialización de evidencia,
   logs, limpieza, errores internos de reducción y postcondiciones del clúster.
   Validar nativamente antes de init real: token correcto y rechazos sin reanudar,
   pertenencia inicial al Job, timeout/muerte del host y ausencia de huérfanos.
   La cuenta mínima puede devolver falta de privilegio al crear el proceso: debe
   rechazarse y revisarse, sin usar cuenta administradora o cambiar políticas.
4. Mantener cerrados init/restore y construcción de instaladores hasta comprobar
   los controles anteriores y las referencias oficiales/dependencias necesarias.
   N-04 sigue en pausa: no se hizo nueva investigación general ni se repitieron
   N-02/N-03/N-04.
5. Después: PG18.6 propio/T0 → bootstrap interactivo → descriptores firmados →
   servidor/HTTPS/identidad → Electron → login, Reservaciones y Daily sintéticos →
   cierre/reinicio/persistencia. Nada de esto se presenta como realizado todavía.

La instalación aún no está aprobada. No se generaron candidate-05 o setup-03.
