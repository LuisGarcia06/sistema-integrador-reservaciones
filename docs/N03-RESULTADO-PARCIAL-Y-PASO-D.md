# N-03 — Observaciones locales y siguiente paso mínimo

31 de octubre de 2026. VM informada: `Windows11-CommunityTours-Test`, VirtualBox.
`synthetic-acceptance-only`; `productionAuthorized=false`.

**N-03 continúa parcial. No permite todavía prueba funcional con PostgreSQL,
aprovisionamiento ni construcción de candidate-05/setup-03.**

## Registro y límites de la evidencia

Se registra el texto comunicado por el usuario, que lo presenta como transcripción
de capturas. No se recibieron en este turno imágenes originales identificadas de
N-03; la búsqueda por nombres relacionados en adjuntos no localizó una captura
identificable de esta prueba. No se afirma haber hecho cotejo visual, OCR o lectura
independiente de los archivos. Para cerrar esa comprobación hacen falta las imágenes
originales identificadas o una nueva salida textual íntegra y trazable de la lectura
manual. No se corrigen ni se completan caracteres por inferencia.

Los seis hashes se conservan **tal como fueron escritos, en mayúsculas**, en
[`observations.json`](local-fase-2e7-n03-results/observations.json). Son observaciones
locales no autenticadas; no se incorporan como referencia de proveedor, inscripción,
inventario operativo de confianza o autorización de ejecución.

| Parte | Hecho registrado | Estado |
| --- | --- | --- |
| A: política y LanguageMode | Las salidas exactas no acompañan la comunicación | Pendiente de recuperar del registro local o repetir solo esas lecturas |
| B: instalador | El usuario informó coincidencia con la referencia publicada; no aportó hash calculado completo | Coincidencia reportada; no igualdad verificada por Codex ni autenticación completa |
| C: seis EXE | Tamaño, hash y campos PE transcritos | Observaciones recibidas; cotejo visual pendiente |
| D: vínculo de referencia | Ningún hash local fue comparado con referencia por archivo autenticada | Pendiente |

La referencia citada para B permanece separada del hash local, que sigue **null**:
`227e2bc08091b4c2b8338c7d61b11d057f895711480b006f90bfcfcd2410a58a`.
No se copia ese valor al campo de hash calculado como si se hubiese recibido.

Ruta informada de C: `C:\Program Files\PostgreSQL\18\bin`.

| Archivo | Bytes informados | Machine | OptionalMagic | X64Header |
| --- | ---: | --- | --- | --- |
| initdb.exe | 246784 | 0x8664 | 0x020B | True |
| postgres.exe | 10266624 | 0x8664 | 0x020B | True |
| pg_ctl.exe | 133120 | 0x8664 | 0x020B | True |
| pg_dump.exe | 633344 | 0x8664 | 0x020B | True |
| pg_restore.exe | 379904 | 0x8664 | 0x020B | True |
| pg_controldata.exe | 108032 | 0x8664 | 0x020B | True |

Comprobaciones efectuadas aquí: seis nombres previstos sin duplicados, tamaños
enteros positivos, hashes con 64 caracteres hexadecimales; los tres tamaños de
dump/restore/controldata coinciden con N-02. Eso detecta errores de formato, **no
detecta sustituir un carácter hexadecimal válido por otro**. Los campos comunicados
son coherentes con cabeceras AMD64/PE32+; no constituyen auditoría completa del PE,
DLL, permisos, servicio o ejecución. No se ejecutaron nuevas pruebas de producto.

## Paso mínimo para completar D — propuesta de lectura de referencia

Recomiendo comparar los seis hashes contra entradas del ZIP **exacto**
`postgresql-18.6-5-windows-x64-binaries.zip`, usando un área de análisis fuera de
la VM o una copia de referencia ya disponible y verificada. No hace falta ejecutar
el instalador ni extraer sus archivos sobre la instalación. EDB describe sus ZIP
como archivos instalados por sus instaladores:
[distribución de binarios EDB](https://www.enterprisedb.com/download-postgresql-binaries).

No se ha localizado en las fuentes consultadas un manifiesto autenticado que ya
aporte los seis hashes individuales. Si el proveedor proporciona ese manifiesto por
un canal autenticado, usarlo puede evitar descargar el ZIP; no se contacta a terceros
automáticamente ni se afirma que dicho manifiesto no exista.

Procedimiento mínimo propuesto, **no ejecutado ni autorizado por este informe**:

1. Resolver la referencia a través del canal oficial EDB y registrar nombre exacto,
   URL solicitada/final, fecha y fuente de checksum. No usar un espejo desconocido
   o un archivo solo porque se llame 18.6. Se necesita la revisión **18.6-5**, no
   otra compilación de la misma versión de producto.
2. Si el ZIP no existe ya en un área de referencia autorizada, revisar primero su
   adquisición. Crearía un archivo de aproximadamente 385 MB y tráfico de descarga,
   sin instalar componentes ni cambiar la VM. **No se descarga en esta entrega.**
3. Autenticar el canal de adquisición y el checksum de referencia conforme al
   modelo de confianza del proveedor. La respuesta de `mayankjaiswal-dev`, marcada
   Contributor en el repositorio EDB, publica el hash del ZIP indicado abajo; esa
   etiqueta no acredita por sí sola representación del proveedor. Registrar ese
   límite y confirmar la atribución/canal antes de tratar el ZIP como referencia.
   No basta comparar una descarga con un hash calculado de esa misma descarga.
4. Calcular SHA256 del contenedor **antes de leer sus entradas** y registrar el
   valor completo. Ante diferencia con la referencia autenticada, detenerse.
5. Abrirlo únicamente como archivo ZIP en modo lectura. Enumerar las rutas completas
   de las seis entradas y exigir una entrada inequívoca por archivo; rechazar rutas
   duplicadas/ambiguas, entradas ausentes, errores o límites excedidos. No adivinar
   su prefijo de carpeta ni elegir la primera coincidencia de nombre.
6. Calcular SHA256 sobre los bytes **descomprimidos de cada entrada**, mediante
   streams de lectura con límites y cierre garantizado, sin escribir ni cargar
   EXE/DLL. Registrar ruta de entrada, bytes y hash junto con el hash del ZIP. Una
   API como ZipArchive permite leer entradas sin extraerlas:
   [documentación de Microsoft](https://learn.microsoft.com/en-us/dotnet/api/system.io.compression.ziparchive?view=netframework-4.8.1).
7. Cotejar primero la transcripción local con su evidencia original o nueva lectura
   trazable. Comparar luego bytes y los 64 caracteres contra la entrada de referencia,
   ignorando únicamente mayúsculas/minúsculas. Guardar ambas columnas y resultado
   por archivo; no sustituir silenciosamente el dato local por el de referencia.
8. Solo si coinciden los seis y su cadena de referencia está acreditada, declarar
   «correspondencia de estos seis archivos con la distribución de referencia
   verificada». Una diferencia exige revisar la evidencia; no reemplazar binarios,
   reparar o reinstalar para hacer que coincidan.

Referencia **publicada**, todavía no medida ni autenticada como archivo local:

```text
e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2
```

[Publicación y atribución](https://github.com/EnterpriseDB/edb-installers/issues/746).
El comentario no es un manifiesto firmado ni una comprobación de la VM. No se
requiere una firma individual en cada EXE si existe una cadena de referencia
verificable del proveedor. Tampoco es imprescindible recuperar la URL histórica
de Edge si otra cadena autenticada acredita la correspondencia de archivos;
esa URL seguiría registrada como desconocida, sin inventarla.

Permisos de esta futura lectura: usuario normal con lectura del ZIP; nunca elevación
ni ejecución de PostgreSQL. Efectos: CPU/memoria para descompresión y lectura; solo
un nuevo registro de evidencia en el área acordada. Si se necesita adquirir el ZIP,
es un efecto adicional que debe revisarse antes. No cambiar Restricted, ACL, servicios,
bases, Windows o antivirus; no transferir referencias a la VM como permiso implícito.
La implementación concreta del lector y sus límites deberá quedar revisada antes
de solicitar su ejecución. No se aporta ni ejecuta un nuevo auxiliar en esta entrega.

Al terminar D, las seis correspondencias no se extenderían a todas las DLL, archivos
`share`, servicio o seguridad de ejecución. Ese alcance adicional seguirá explícito.

## Barreras para una primera prueba funcional aislada

La autorización vigente es **opción C**, con objetivo 18.6 exacto. La autorización
original se conserva en
[`authorization-option-c.txt`](local-fase-2e7-optionc-manual/authorization-option-c.txt),
con el cambio posterior de versión expresamente autorizado por el usuario.
No se vuelve al diseño de depurador completo.

| Barrera actual | Mínimo estrictamente necesario para iniciar la prueba funcional con un clúster nuevo |
| --- | --- |
| Procedencia por archivo pendiente | Referencia autenticada y correspondencia de los ejecutables utilizados. Antes de ejecutar, verificar también las dependencias PostgreSQL/DLL y archivos de inicialización `share` realmente necesarios, con carga desde rutas protegidas. No basta verificar seis EXE y confiar en DLL arbitrarias |
| A y B sin salidas completas | Recuperar el hash realmente calculado del instalador si se utiliza como evidencia, y salida exacta de política efectiva para demostrar Restricted. LanguageMode documenta la capacidad del diagnóstico; **FullLanguage no se añade como requisito del producto** ni se exige relajarlo |
| Primer token y contención no validados nativamente | Cuenta/SID mínimos; crear el primer initdb suspendido; consultar su token independientemente y rechazar grupos administrativos habilitados, privilegios indebidos o información incompleta **antes de reanudarlo**. Contener el intento, incluidos Job cuando corresponda; verificar fallos/timeout/cierre. Código cero de initdb o PG_RESTRICT_EXEC no son sustitutos |
| Directorios, ACL y CMD no acreditados en el contexto efectivo | Crear destinos sintéticos nuevos con ACL privadas; verificar propietario, herencia y rutas relevantes antes de escribir secretos/datos. Comprobar AutoRun del principal efectivo y contexto CMD, COMSPEC/PATH/cwd/TEMP y entorno cerrado. Conservar la excepción solo para dependencias internas oficiales verificadas |
| Servicio y procesos propios sin integración segura validada | Servicio exclusivo bajo cuenta limitada; ligar inscripción a imagen/directorio, system identifier, base, puerto e identidad SQL 180006. Rechazar instancias ajenas; controlar por identidad/handles y verificar parada real, residuales e interrupciones. No matar por nombre ni por ocupar un puerto |
| Flujos heredados incompatibles con Restricted | Sustituir sus dependencias bloqueadas por mecanismos revisados que conserven ACL/identidad/contención, incluidos servidor, Electron, mantenimiento y configuración. No usar PowerShell codificado, Bypass o scripts bloqueados. Los contratos de versión actualizados no arreglan esos flujos |
| Bootstrap y seguridad de aplicación no probados en el conjunto nuevo | Antes de cada etapa, verificar inscripción/inventarios, secretos/certificados sintéticos privados, destino aislado y permisos backend. Captura interactiva segura del primer Administrador, sin contraseña en argumentos/logs/solicitudes; rol técnico SQL limitado; comunicación Electron a backend con identidad HTTPS |
| Procedimiento funcional todavía no autorizado | Definir y revisar pasos, permisos, efectos y abortos para Windows 11 Home x64, clúster nuevo y datos sintéticos; ejecución manual dentro de VirtualBox. No tocar las bases del anfitrión ni crear servicios por inferencia de una prueba de lectura |

La falta del hash calculado completo de B mantiene incompleta **esa evidencia**.
Si la vía elegida utilizase exclusivamente otra distribución exacta autenticada,
con sus archivos comprobados, no habría que convertir el instalador original o
su URL histórica en una dependencia artificial para ejecutarla. Eso no permite
declarar B completa ni modificar la instalación actual sin autorización.

Estos son requisitos de seguridad previos o puertas de cada etapa, **no resultados
que se exijan demostrar antes de poder hacer cualquier prueba nativa**: se pueden
validar primero primitivas de lectura/token/contención bajo procedimientos acotados,
sin crear un clúster. La medición inicial deberá hacerla una vía nativa legítima,
revisada y autorizada; no restaurar ni reconstruir el prototipo para evadir McAfee.
El bloqueo antivirus de un componente no se convierte en permiso para omitir el control.

T0 limpio se comprobará al inicializar el clúster de ensayo autorizado; primer login,
cierre/reinicio y persistencia son resultados de aceptación que la prueba debe producir,
no condiciones que puedan acreditarse mediante metadatos. Se debe tener preparado
el manejo de fallo/recuperación y no borrar o reinicializar automáticamente ante un error.

No son necesarios para esa primera prueba: `DEBUG_PROCESS`, inspección individual
de cada descendiente antes de ejecutar, topología exacta del árbol, hash congelado de
cada DLL de Windows, resistencia al administrador local o recuperar todo el historial
de Edge. La opción C ya autoriza confiar en Windows/PostgreSQL oficiales, con contexto,
contención y postcondiciones; no autoriza ignorar procesos residuales.

Un instalador terminado o pulir las ocho pantallas no demuestra estas garantías.
Las pruebas de primitivas pueden preceder a esos entregables. Cualquier propuesta
de una primera prueba funcional usando un directorio/paquete verificado en vez del
asistente final deberá presentarse y autorizarse como procedimiento concreto; **no
se introduce esa vía ahora** ni se elimina la entrega gráfica acordada.

El alcance corporativo/productivo, pruebas con datos reales y certificación para
otras máquinas quedan fuera. Las pruebas de perfiles especiales, interrupción,
recuperación y persistencia siguen en el plan de aceptación; su orden puede ser
incremental, sin aprobar instalación hasta completarlo. Las 285 pruebas previas
son evidencia de contratos/simulaciones, no pruebas nativas de estas barreras.

## Entrega de esta revisión

Solo documentos y registros nuevos. Comprobaciones de formato/consistencia e
integridad de evidencia anterior; ninguna ejecución PostgreSQL, acceso a VM,
descarga de binarios, provisión, cambio de política, ACL, bases, servicios o
protecciones. No se construyen instaladores ni se modifica código de aplicación.
