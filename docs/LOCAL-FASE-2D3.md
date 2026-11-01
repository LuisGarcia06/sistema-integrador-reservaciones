# Fase 2D.3 — Creación protegida desde Nueva reservación

Implementación local completada y validada el 27 de octubre de 2026. Disponible exclusivamente en el laboratorio integrado; no se activó en producción ni en `frontend/index.html`. No se modificaron el backend de aplicación, el esquema 020 ni sus migraciones.

1. **Archivos modificados y creados.**

Se registraron hashes de **854 archivos** antes de editar. Solo cambiaron nueve archivos relacionados; los otros **845 conservaron exactamente su contenido** y no se eliminó ninguno. Los archivos sin seguimiento y el trabajo de las fases anteriores se conservaron. Hay copias iniciales de los nueve archivos en `docs/local-fase-2d3/before/` y hashes iniciales/finales en `docs/local-fase-2d3-before.json` y `docs/local-fase-2d3-verification.json`.

| Archivo modificado | Cambio |
| --- | --- |
| `frontend/pages/reservaciones.js` | Habilita Nueva reservación solo con el adaptador; conserva el renderizador y validadores originales; entrega su cuerpo completo al modelo protegido. |
| `frontend/js/reservationCommands.js` | Coordina el alta con el mismo modal, confirmación, recibo, recuperación, revisión de rechazo y limpieza de sesión. |
| `frontend/js/commandLab.js` | Modelo específico `CreateReservationSession`: confirmación, foto ligada al cuerpo completo, sobre inmutable y referencia autorizada del registro creado. Reutiliza el envío, recibo y recuperación compartidos y el ciclo de identidad existente. |
| `frontend/lab/reservaciones.html` | Actualiza el aviso del alcance; no define otro formulario. |
| `scripts/reservationFrontendPolicy.cjs` | Único escritor adicional: POST exacto `/api/reservaciones`. |
| `scripts/commandFrontendHost.cjs` | Registra huellas y nombres de campos de las precondiciones de creación, sin cuerpos libres ni JWT; mantiene la política predeterminada anterior. |
| `scripts/reservationFrontendLab.cjs` | Extiende el mismo corredor integrado con fixtures de alta, observación de filas/comandos/auditoría y sondas privadas. |
| `scripts/reservationFrontendDriver.cjs` | Conserva los 25 grupos anteriores y ejecuta las comprobaciones del alta original. |
| `backend/__tests__/reservationFrontend.test.js` | Ajusta la expectativa de la única ruta POST ahora autorizada; conserva las comprobaciones de rutas exactas y formulario heredado. |

| Archivo creado | Función |
| --- | --- |
| `scripts/reservationCreationFixtures.cjs` | Agrega un administrador sintético de altas durante el aprovisionamiento del clúster nuevo. |
| `scripts/reservationCreationProbe.cjs` | Arranca la API normal con sus verificaciones completas; instala únicamente sondas temporales de colisión y fallo de auditoría, controladas por IPC del corredor. |
| `scripts/reservationCreationCases.cjs` | Opera el formulario original en Electron y comprueba creación, cuerpos, duplicación, conflictos, recuperación y permisos. |
| `backend/__tests__/reservationCreation.test.js` | Pruebas aisladas del modelo, cuerpo confirmado, precondiciones, cabeceras, recibos, recuperación y restricciones. |

También se crearon este informe, inventario previo, registros, JSON de evidencia, respaldos y capturas sintéticas dentro de `docs/local-fase-2d3/`.

2. **Integración del formulario original.**

Nueva reservación sigue utilizando `renderReservacionDialog(FORM_CREATE)`, sus generadores, catálogos, selectores, `buildPayload` y validaciones existentes. No se creó otro formulario ni se cambió el diseño o CSS original. El adaptador agrega los paneles de resultado y revisión al mismo `#reservaciones-form`.

Abrir el alta solo captura la identidad y muestra ese formulario: no consulta precondiciones con `datos:{}`. El usuario captura, revisa y valida; después confirma explícitamente crear. Cancelar esa confirmación no consulta precondiciones, no genera UUID y no crea un comando.

El constructor ordinario de CommandSession y la lista experimental anterior mantienen su restricción de altas. Solo el modelo específico y el host integrado habilitan esta creación concreta.

3. **Campos, validaciones y reglas conservados.**

Se conservan los **21 controles originales** de creación: fecha, turno, tour, país, plataforma, nombre, teléfono, habitación, idioma, notificado, PAX, niños, pickup, hora, método de pago, vendedor, precio total, depósito, saldo, tipo de cambio y observaciones. Se mantienen tipos, límites, catálogos, estado inicial y normalización originales. PAX ya incluye niños; la prueba crea PAX=2 con un niño sin añadirlo nuevamente.

Se comprobaron diez validaciones del formulario por fecha, turno, tour, país, plataforma, nombre, PAX, niños y pickup/hora ausentes o inválidos, sin generar precondiciones o escrituras. Se verificaron importes decimales, notificado booleano y contenido de los demás campos. La regresión aislada conserva las validaciones y el HTML heredados. No se impusieron reglas comerciales nuevas.

**Código real de reservación.** El alta original no tiene un campo editable de código. El backend rechaza `codigo` e `id_reservacion` suministrados por el cliente. Genera `RSV-YYYYMMDD-XXXXXXXXXX`, usando la fecha actual del generador y diez dígitos hexadecimales aleatorios; conserva el índice único y hasta cinco intentos internos ante colisión. El frontend no genera, predice o sustituye ese código.

Por eso la prueba de dos administradores con el mismo código se realizó forzando dos valores iguales del generador dentro del proceso de laboratorio, no agregando un campo prohibido al formulario. La segunda alta encontró la colisión y el generador original produjo otro código en su intento siguiente, dentro de la misma petición y transacción. La evidencia registra dos valores forzados y tres invocaciones del generador, con una fila y auditoría por alta. No se introdujo un reintento de POST ni una clave nueva para resolverla.

4. **Obtención de precondiciones para POST.**

La secuencia es: validación original, confirmación humana, cuerpo definitivo congelado, POST de precondiciones con ese cuerpo, validación de respuesta, UUIDv4 y POST protegido con el mismo cuerpo.

```text
POST /api/precondiciones
{ metodo: "POST", ruta: "/api/reservaciones", datos: <cuerpo completo confirmado> }

POST /api/reservaciones
<exactamente el mismo cuerpo confirmado>
```

El modelo valida protocolo, generación UUIDv4, método, ruta, ETag/contexto no vacíos y dentro del límite del contrato, revisión null y marcador de creación de reservaciones. El servidor liga el sujeto de creación al HMAC del cuerpo completo. No se usa una foto de cuerpo vacío ni una foto de registro existente para autorizar datos diferentes.

Después de obtener la foto no se modifica automáticamente el cuerpo. Los campos permanecen bloqueados durante la preparación y envío. La guardia exige que método, ruta, JSON y cabeceras coincidan con el sobre confirmado. Las pruebas aisladas y la traza real comprueban esa correspondencia; todo POST confirmado por el servidor tiene una huella de cuerpo coincidente con una consulta de creación.

Una alteración deliberada del cuerpo en transporte fue rechazada con **400 PRECONDICION_INVALIDA durable**, sin crear fila o auditoría. Ese es el contrato existente: cambia el sujeto de la creación, no la revisión de una fila. No se modificó el backend para convertirlo en 412.

Si falla obtener o validar precondiciones, no hay UUID o POST de creación; el formulario queda editable para volver a validar y confirmar. El mensaje distingue ese caso de una operación ya enviada e incierta.

5. **Idempotencia y recuperación de altas.**

Se usa `ctsk-command-api-v1`. El sobre conserva generación, UUIDv4, POST, ruta exacta, cuerpo definitivo, ETag y contexto originales, con congelación profunda. La clave se genera después de validar la foto. Un doble gesto no envía dos veces desde el formulario. Una repetición HTTP idéntica devuelve el recibo original; la misma clave con otro cuerpo se rechaza con 409 de clave reutilizada.

El recibo confirmado presenta el identificador creado. Consultar información actual hace un GET separado del identificador autorizado contenido en sus referencias y muestra el código asignado y el estado actual, sin convertir esa respuesta ni el recibo en la próxima precondición. Las referencias de creación inválidas no se aceptan como éxito.

Ante pérdida de respuesta después de COMMIT se conserva el formulario y el sobre, se bloquean Guardar y su sustitución mediante Nueva, y se consulta GET `/api/comandos/:clave` con la generación original. Se verificó recuperación después de reiniciar la API. No se repite el POST ni se genera otra clave automáticamente. Un desconocido sigue no concluyente.

Un rechazo durable conserva el formulario y ofrece Revisar esta alta. Esa decisión requiere confirmación, deja los mismos datos disponibles y no consulta otra foto. El siguiente guardado debe pasar otra vez por validación, confirmación y precondiciones ligadas al nuevo cuerpo. No hay un supuesto registro «actual» que sobrescriba un alta rechazada.

Cerrar la ventana o perder la sesión destruye la referencia local; no demuestra que una creación enviada se haya cancelado. La recuperación persistente sigue pendiente. Las revocaciones de permisos continúan invalidando formularios, sobres y recibos anteriores.

6. **Pruebas ejecutadas y resultados.**

| Verificación final | Resultado |
| --- | --- |
| Jest aislado, con guardias PostgreSQL/red | **29 suites y 781 pruebas aprobadas**, 0 fallidas: 755 anteriores y 26 nuevas. |
| Electron real + formulario original + API protegida + PostgreSQL 020 nuevo | **38 grupos aprobados**: 25 anteriores y 13 de creación. |
| Regresión del frontend de comandos anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Regresión del frontend de revisiones anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Perfil independiente anterior y Electron principal contra su propio backend sintético | **6 comprobaciones aprobadas**, sin activar 020 en ese perfil. |

Los trece grupos nuevos cubren alta original/campos/validaciones/confirmación/doble gesto/recibo, clave reutilizada con otro cuerpo, duplicación HTTP, fallo previo de precondiciones, cuerpo alterado y revisión, contexto cambiado, FK inválida, intenciones distintas, colisión del generador, respuesta perdida con reinicio, desconocido sin reenvío, fallo de bitácora y permisos/plataformas.

La sonda de FK manipula deliberadamente el selector para comprobar el backend; no amplía los catálogos autorizados del producto. La sonda de cuerpo altera bytes después de la guardia para comprobar el enlace criptográfico del servidor. El cambio de contexto se introduce después de obtener la foto y antes del POST mediante el corredor sintético. Las demás acciones se operan por los controles originales en Electron.

La prueba de bitácora lanza una excepción **después** de insertar la entrada dentro de la transacción del alta. Se comprueba rollback de reservación, bitácora y comando, y coincidencia de la huella de todas las tablas de negocio. La UI conserva incertidumbre y la recuperación devuelve desconocido, sin reenvío.

Hubo dos iteraciones previas incompletas del ensayo: una sonda intentaba devolver una función por IPC de Electron y otra esperaba 412 en lugar del 400 que define la vinculación al cuerpo. Se corrigieron las sondas/expectativas; no se omitieron controles ni se alteró el contrato backend. Se corrigieron asimismo los dobles de autenticación y la tabla de casos de las pruebas aisladas. La ejecución final y sus regresiones pasaron completas.

No se ejecutó npm test global. Ejecución integrada reproducible, siempre sobre otro clúster nuevo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\ReservationFrontendLab.ps1 -Mode Verify
```

7. **Evidencia de ausencia de duplicados.**

`docs/local-fase-2d3/integrated-verification.json` contiene **14 observaciones de creación**: clave, nombre sintético de búsqueda, filas/códigos, comando, auditorías y actor, número de envíos, huellas del cuerpo y correspondencia con precondiciones. La traza registra campos y huella de `datos`, sin JWT, contraseñas ni cuerpos libres.

El alta válida y su repetición mantienen **una reservación, un comando y una auditoría**. La duplicación controlada del transporte hace dos HTTP y un efecto. La respuesta perdida después de COMMIT conserva una fila/comando/auditoría y un único POST upstream después de recuperar y reiniciar la API. El desconocido anterior al envío upstream no crea filas, comando o auditoría, y la aplicación no utiliza esa observación del corredor para afirmar rollback al usuario.

Los rechazos por cuerpo o contexto alterado y FK inválida no dejan reservación o auditoría parcial; pueden conservar su comando rechazado durable. Las huellas de negocio antes/después coinciden, excluyendo únicamente el registro de comandos para permitir ese recibo. El fallo técnico de bitácora revierte también el comando. La prueba está registrada en `actionProofs` y en los asserts del corredor.

Dos confirmaciones humanas distintas con claves distintas y datos de cliente iguales crean dos reservaciones con códigos diferentes. Se prueba expresamente esa distinción: la idempotencia no es una regla de deduplicación de clientes.

8. **Compatibilidad con las tres acciones de 2D.2.**

Se repitieron sus **25 grupos** de edición, cancelación y transporte: formularios originales, revisiones BIGINT, 412, 409, mínimos/capacidad, 24 PAX, concurrencia, duplicación, recuperación, desconocido, alcance y revocación. Continúan aprobados. El flujo de foto previa de PATCH sigue aceptando cambios posteriores del formulario conforme al contrato existente; el alta tiene su ruta específica de confirmación y foto ligada al cuerpo.

Los perfiles anteriores conservan sus políticas de rutas y esquema, y sus regresiones reales pasaron. El constructor ordinario y la lista de catorce formularios experimentales no habilitan POST de reservaciones; el host anterior lo sigue rechazando. La aplicación principal conserva el flujo heredado al no cargar el adaptador. No se editaron manifiestos o huellas para reutilizar configuraciones incompatibles.

9. **Aislamiento confirmado.**

El [inventario previo](local-fase-2d3/INVENTARIO.md) documenta la nueva solicitud y las sondas antes de cargar el alta. Se extendió únicamente el harness integrado existente. Cada Verify crea directorio privado con ACL, clúster PostgreSQL nuevo/desechable, usuarios/datos sintéticos, generación propia y esquema 020 verificado. La API inicia por su función normal con todas las verificaciones de identidad, esquema, código, permisos y protocolo.

El proceso de sonda requiere IPC y solo envuelve temporalmente el generador y auditoría para los dos fallos solicitados. No tiene endpoints de control, no modifica tablas/triggers/esquema ni fuentes backend, y no lo invocan las entradas principales u otros laboratorios. Los modos se activan explícitamente por IPC del corredor y se destruyen con su proceso.

Frontend/API/PostgreSQL usan exclusivamente 127.0.0.1. Host/Origin, CSP, assets, método/ruta/parámetros, cinco cabeceras y guardia de comando mantienen las restricciones. Electron conserva sandbox, contextIsolation, webSecurity y nodeIntegration desactivado, sin preload privilegiado y sin navegación, permisos, ventanas o tráfico fuera de su origen. No se entregan secretos PostgreSQL al renderer.

No se accedió a `sian_kaan_reservaciones`, no se usaron datos/credenciales reales ni se migraron bases existentes. No se modificaron integraciones FareHarbor/GetYourGuide, receptores, sincronizadores, ngrok, certificados, tareas Windows, firewall, router, LAN, servicios o instaladores.

Se crearon seis clústeres: tres iteraciones integradas y tres regresiones. Todos están detenidos; los **17 puertos registrados están sin listeners y no quedan procesos asociados**, según `closure.json`. Los archivos privados con secretos permanecen en sus directorios propios y no se copiaron a la evidencia.

10. **Limitaciones y funcionalidades bloqueadas.**

Solo se amplió POST `/api/reservaciones`. El host integrado conserva los tres PATCH anteriores y bloquea los demás escritores: otras altas, edición de Operaciones/Daily/transportes/catálogos/usuarios, contraseñas e integraciones. La impresión continúa fuera del alcance.

El modelo vigente permite configurar plataformas seleccionadas para Consulta, que no puede crear ni en plataformas visibles ni ocultas. No se inventó un rol de Administrador restringido. La prueba de revocación degrada un administrador después de COMMIT y antes de recibir la respuesta: el alta ya confirmada existe, pero su formulario/recibo se eliminan y el nuevo alcance oculta el registro; recuperar el comando se deniega.

No se implementaron borradores persistentes, recuperación después de destruir la ventana, offline ni distribución. No se puede ingresar manualmente un código de alta porque lo prohíbe el comportamiento original. La validación física futura con dos equipos sigue pendiente; estas pruebas locales no la sustituyen. Producción permanece sin activar.

11. **Procedimiento de reversión.**

Los ensayos terminaron detenidos. Si un Verify futuro se interrumpe, identificar y cerrar únicamente sus procesos y detener su directorio validado:

```powershell
.\scripts\ReservationFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Se conserva la validación de manifiesto/código; no alterar hashes para eludirla. No reutilizar el manifiesto tras modificar sus fuentes ni ejecutar Stop sobre instalaciones ajenas.

Para revertir fuentes, retirar selectivamente este parche de los nueve archivos y los cuatro archivos de implementación/pruebas nuevos, conservando la evidencia. Las copias iniciales contienen 2D.2 y los cambios locales previos. Restaurarlas completas solo si el archivo actual coincide con su hash final registrado; si hay trabajo posterior, retirar selectivamente este parche. Revertir juntos el modelo específico, adaptador, ganchos y política del host para mantener el cierre del alta. No usar reset/clean o restauraciones masivas. No se requiere operación inversa sobre una base existente.

12. **Recomendaciones para Operaciones y Daily.**

Integrar un formulario original por fase, con inventario de sus lecturas/efectos laterales y lista cerrada de escritores. Mantener la distinción entre alta ligada al cuerpo completo y edición de un recurso con foto previa. Reutilizar el sobre, confirmación, recibos y recuperación; no reutilizar un ETag de creación o recibo como revisión de otro recurso.

En Operaciones, conservar fecha/tour/turno/grupo, capacidad y relaciones de guía/vehículo/operador; tratar por separado las altas y cambios de grupos/transporte. Probar cambios de contexto y revocación con sus controles originales antes de ampliar rutas.

Daily debe respetar su contrato existente, incluido PUT de observaciones por fecha; no suponer que comparte el flujo POST de alta. Inventariar también exportación e impresión antes de montarlo. Mantener fuera las integraciones reales y completar aceptación, referencias tras cierre y pruebas físicas antes de plantear activación productiva.
