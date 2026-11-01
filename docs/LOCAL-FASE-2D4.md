# Fase 2D.4 — Operaciones originales protegidas

**Alta de Operaciones: integrada y validada en laboratorio. Edición de Operaciones: integrada y validada en laboratorio.** Se validó también la variante original Preparar sugerencia. La administración de transportes permanece bloqueada en esta entrada. No se activó producción.

1. **Archivos y preservación del trabajo anterior.**

Se registraron hashes de **894 archivos** antes de editar. Cambiaron solo tres archivos existentes; los otros **891 conservaron exactamente su contenido**, sin eliminaciones. Se preservaron los archivos sin seguimiento y cambios anteriores. Las copias iniciales están en `docs/local-fase-2d4/before/`; los hashes iniciales/finales están en `docs/local-fase-2d4-before.json` y `docs/local-fase-2d4-verification.json`.

| Archivo modificado | Cambio de esta fase |
| --- | --- |
| `frontend/pages/operaciones.js` | Ganchos optativos para abrir con foto, guardar mediante comando, mantener recibo/comparador, invalidar sesión y bloquear transporte en el perfil nuevo. Renderizadores y validadores originales conservados. |
| `frontend/js/commandLab.js` | Reutiliza el modelo de alta vinculada al cuerpo también para Operaciones, con ruta/recurso explícitos; permite comparación GET de su edición. Conserva la restricción del constructor ordinario y perfiles anteriores. |
| `scripts/commandFrontendHost.cjs` | Ámbito explícito `operaciones-integradas` con política propia cerrada; reutiliza transporte, controles y fallos del proxy existente. |

| Archivo creado | Responsabilidad |
| --- | --- |
| `frontend/js/operationCommands.js` | Adaptador del modal original: identidad, confirmación, bloqueo del formulario, comparador, recibo y recuperación compartidos. |
| `frontend/lab/operaciones.html` | Entrada explícita que carga login/layout y página original; no define formularios alternativos. |
| `frontend/lab/operaciones.js` | Monta únicamente Operaciones/login, conserva permisos y evita sustituir una intención mediante navegación fuera de alcance. |
| `frontend/lab/operaciones.css` | Estilos locales de aviso y paneles, sin cambiar los CSS originales. |
| `scripts/operationFrontendPolicy.cjs` | Lista exacta de métodos/rutas/assets de esta entrada. |
| `scripts/OperationFrontendLab.ps1` | Directorio nuevo, ACL privada y entorno limpio, reutilizando el envoltorio existente. |
| `scripts/operationFrontendLab.cjs` | Aprovisionamiento verificado, API, proxy, observador, procesos y cierre del ensayo. |
| `scripts/operationFrontendFixtures.cjs` | Usuarios, operaciones y dependencias sintéticas sobre el clúster recién creado. |
| `scripts/operationFrontendProbe.cjs` | Instrumentación privada de XID/PID y fallo posterior al registro del comando; inicia la API normal sin cambiar sus servicios o esquema. |
| `scripts/operationFrontendDriver.cjs` | Pruebas con Electron real y controles originales. |
| `backend/__tests__/operationFrontend.test.js` | Regresión del HTML/validadores originales, políticas exactas y modelo compartido. |

También se crearon este informe, inventario previo, respaldos, registros, JSON y capturas sintéticas dentro de `docs/local-fase-2d4/`. No se modificaron backend de aplicación, servicios de negocio, esquemas/migraciones, `frontend/index.html`, entrada principal de Electron, `transportesUi.js` ni los módulos de Reservaciones.

El diff contra Git HEAD contiene también cambios de fases anteriores. La comparación de esta fase utiliza los hashes y copias iniciales, no una restauración a HEAD.

2. **Inventario y atomicidad del flujo original.**

El [inventario previo](local-fase-2d4/INVENTARIO.md) identifica solicitudes y efectos antes de cargar la pantalla. Abrir/actualizar Operaciones consulta tours, guías, operaciones preparadas, sugerencias y Daily operativo. El foco vuelve a consultar únicamente si no hay formulario abierto, según la condición original. Cambiar la fecha actualiza el listado sin sustituir la captura del modal.

Se verificó la secuencia de `handleSubmit`: el alta normal y Preparar sugerencia hacen **un solo POST `/api/operaciones`**, seguido por lecturas del listado. No envían un segundo POST de transporte ni asignan reservas. El servicio inserta la operación y consulta su representación mediante el cliente de la transacción existente. La edición utiliza un único PATCH y las validaciones transaccionales originales. El perfil command-api-lab integra ese trabajo y el registro del comando en su COMMIT exterior.

**Bitácora existente:** los servicios actuales de Operaciones no insertan entradas de bitácora. No se añadió una auditoría nueva, no se alteraron servicios y no se presenta una auditoría inexistente como completada. Los recibos de Operaciones llevan `ids_bitacora: []`. La prueba verifica operación/comando atómicos y ausencia de cambios parciales en bitácora; la regresión de Reservaciones vuelve a verificar su auditoría y rollback reales.

3. **Formularios realmente integrados.**

Se conservan `renderDialog`, `buildOperacionPayload`, `getChangedPayload`, generadores de selectores y el listado original de `frontend/pages/operaciones.js`. No se construyó un formulario simplificado o pantalla de demostración.

La edición mantiene siete controles funcionales: fecha, tour, turno, grupo, primera hora de pickup, guía y estado. Nueva operación conserva seis controles y el estado inicial Activa del servidor. Preparar sugerencia mantiene los campos de contexto fijos y la elección explícita de hora/guía del personal. No deriva el turno de la hora ni asigna guías automáticamente.

Se conservaron turnos Mañana/Tarde, grupos 1/2, guía opcional, selecciones inactivas históricas, límites del estado, validaciones y normalización existentes. Las pruebas comparan el HTML completo anterior/actual en edición, alta y sugerencia, incluidas selecciones inactivas, y los errores de fecha/tour/turno/grupo/hora/guía/estado. No se cambiaron reglas comerciales o CSS originales.

4. **Escritores habilitados y bloqueados.**

Solo se habilitan en el host nuevo:

```text
POST  /api/operaciones
PATCH /api/operaciones/:id
```

Las lecturas son GET de sesión, tours, guías, operación por id, comandos propios y estas rutas exactas por fecha:

```text
GET /api/operaciones?fecha=YYYY-MM-DD
GET /api/operaciones/sugeridas?fecha=YYYY-MM-DD
GET /api/daily/operativo?fecha=YYYY-MM-DD
```

Daily operativo se consulta para conservar los indicadores originales; no se monta la pantalla Daily ni se habilitan sus escritores. La política rechaza parámetros adicionales, métodos/sufijos ajenos y assets de otros módulos.

Agregar/Gestionar/Editar transporte y Asignar/Mover/Quitar reservas quedan bloqueados en botones, manejadores, guardia y proxy. No se habilitan POST/PATCH de transportes ni escritores de Reservaciones, usuarios, catálogos, contraseñas o integraciones en esta entrada. Se reutiliza `transportesUi.js` para la presentación original sin modificar sus acciones ya validadas en el laboratorio de Reservaciones, que mantiene su política independiente.

5. **Precondiciones, concurrencia y recuperación.**

Editar obtiene una foto autorizada antes de mostrar los controles y conserva ETag, revisión BIGINT, contexto y generación originales. Se valida el formulario, se confirma la intención y se envía el PATCH diferencial mediante el modelo compartido. Un recibo confirmado permanece visible; la consulta del estado actual es un GET separado y no sustituye el ETag.

Crear valida el formulario original, solicita confirmación, congela el cuerpo completo, pide precondiciones con ese mismo cuerpo y valida método/ruta/recurso/protocolo/generación/ETag/contexto. Después genera la UUIDv4 y envía exactamente ese JSON. No se usa una foto de `datos:{}` para autorizar el alta. El registro creado se consulta por la referencia de Operaciones del recibo.

412 y 409 de contexto conservan los controles/propuesta. El comparador presenta original/propuesto/actual; su consulta GET no renueva precondiciones. Revisar requiere decisión confirmada y una foto nueva, seguida de otra confirmación de guardado. Una creación rechazada vuelve a revisión sin consultar otra foto hasta el siguiente guardado validado y confirmado.

Se distinguen revisión, contexto, clave reutilizada y candado. Respuesta perdida/error técnico conservan el sobre y bloquean otro guardado o sustitución. GET del comando usa su clave/generación originales. Un desconocido sigue no concluyente: no genera otra clave, no reenvía ni demuestra rollback. La referencia vive solo en memoria; destruir la ventana o perder sesión no prueba que la operación haya sido cancelada.

6. **Reglas y dependencias conservadas.**

Fecha/tour/turno/grupo siguen identificando la operación; solo existen grupos 1 y 2. Se mantienen guía, primera hora elegida por el personal, transporte, vehículo, operador y reservas vinculadas. No se cambian ni asignan relaciones automáticamente.

La edición de fecha/tour/turno incompatible con reservas asignadas fue rechazada sin cambios. Se comprobó también el rechazo del grupo fuera del máximo de 12 activos. Ese caso utiliza una anomalía histórica exclusivamente sintética de PAX=13, insertada durante las fixtures para comprobar el rechazo; no representa una asignación permitida por la API. El backend de capacidad permanece intacto. Los límites de 12/24, mínimos, capacidad real del vehículo y PAX incluyendo niños se repitieron además en los 38 grupos de Reservaciones, incluidos 12+12=24 y rechazo del pasajero adicional.

No se modificó la lógica del Daily. La administración de vehículos/conductores/transporte no se habilitó para intentar completar relaciones fuera de alcance.

7. **Pruebas ejecutadas y resultados.**

| Verificación final | Resultado |
| --- | --- |
| Jest aislado con PostgreSQL/red externa bloqueados | **30 suites y 812 pruebas aprobadas**, 0 fallidas: 781 anteriores y 31 nuevas. |
| Operaciones original + Electron real + HTTP + PostgreSQL 020 nuevo | **17 grupos aprobados**, 0 fallos. Alta y edición validadas por separado. |
| Regresión del laboratorio integrado de Reservaciones | **38 grupos aprobados**: creación, edición, cancelación y transporte. |
| Frontend de comandos anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Frontend de revisiones anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Perfil independiente anterior y Electron principal con su backend sintético propio | **6 comprobaciones aprobadas**, sin conectar esa entrada al esquema 020. |

Los diecisiete grupos de Operaciones comprueban:

- Edición válida, controles/validaciones/selectores, foto previa, confirmación cancelable y revisión BIGINT exacta por encima del límite seguro de Number.
- Dos administradores editando la misma fila, 412, comparación segura de texto y revisión explícita.
- 409 de contexto por cambios de reserva y transporte, sin cambios parciales.
- Alta válida desde Nueva operación, cuerpo completo, confirmación antes de foto/UUID, doble gesto y repetición con la misma clave.
- Cuerpo de alta alterado después de la foto: rechazo durable sin fila parcial y revisión sin precondición anticipada.
- Otra clave que compite por la misma identidad operativa: rechazo de unicidad durable, distinto de idempotencia.
- Preparar sugerencia con un solo POST, sin transporte o reservas automáticos.
- Dependencias de fecha/tour/turno y límite 12, con rollback y propuesta conservada.
- Respuesta perdida después de COMMIT para alta y edición; recuperación tras reiniciar API y consulta actual separada, sin repetir escritura.
- Clave reutilizada con contenido diferente, separada del contexto, y conciliación del comando original.
- Edición desconocida sin cierre, sustitución, nueva foto o reenvío.
- Alta desconocida sin duplicar intención o permitir Nueva.
- Candado real distinguido de contexto/revisión, sin reintento automático.
- Fallo técnico después de insertar el registro del comando: rollback del alta y edición, con bitácora intacta.
- Consulta all con lectura sin escribir; Consulta selected sin acceso al módulo/datos según la regla original.
- Revocación antes de guardar y mientras llega una respuesta: eliminación del estado previo, sin resucitar recibos, recuperación histórica denegada.
- Solo escritores autorizados, botones/manejadores ajenos bloqueados, assets restringidos y aislamiento Electron.

No se ejecutó npm test global ni pruebas contra bases existentes. Reproducción segura, siempre en un clúster nuevo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\OperationFrontendLab.ps1 -Mode Verify
```

8. **Evidencia de atomicidad y ausencia de duplicados.**

`integrated-verification.json` contiene las comprobaciones del observador, rutas/huellas de solicitudes y **20 pruebas de transacción**. En todas, negocio y registro del comando tienen **el mismo XID y PID PostgreSQL**. Dos pruebas identifican explícitamente el fallo técnico posterior a insertar el comando; operación y ledger quedaron revertidos y las huellas de negocio antes/después coinciden.

El alta repetida con la misma clave conserva una fila y un comando; el replay no vuelve a crear la operación. La clave con otro contenido devuelve su error propio. Una intención distinta que compite por fecha/tour/turno/grupo deja una sola operación y registra el rechazo durable de la segunda intención.

En la respuesta truncada posterior a COMMIT, la recuperación de alta y edición mantiene **un solo envío upstream por clave**. Los desconocidos anteriores al envío upstream no generan comando o modificación, pero la UI conserva la incertidumbre y no usa el conocimiento del corredor para inferir rollback.

**No se afirma «una bitácora por operación».** Ese escritor no existe en el servicio actual. Se verifican `ids_bitacora: []` y bitácora sin alteraciones parciales, y se conserva el actor autenticado del comando. La modificación sintética de una reserva usada para cambiar contexto sí produce su auditoría original; se compara la bitácora con el estado previo, no con cero.

La instrumentación se limita al proceso de ensayo con IPC privado: inicia la API normal, observa XID/PID y puede lanzar una excepción después del registro del comando. No agrega endpoints de fallos ni modifica servicios, triggers o esquema.

9. **Compatibilidad con Reservaciones y modalidades anteriores.**

La regresión de 38 grupos repitió las cuatro acciones originales de Reservaciones, incluyendo recuperación, colisión de código, cuerpo vinculado y fallo de bitácora. Pasaron con el modelo compartido actualizado. No cambiaron `reservationCommands.js`, la página o política de Reservaciones, sus controles de transporte o su generación de códigos.

Los tres perfiles anteriores conservaron las verificaciones de identidad/esquema y sus superficies cerradas. Los constructores normales y el host experimental anterior no abren altas de Operaciones automáticamente. La entrada principal no carga `operationCommands.js` ni el nuevo arranque; los ganchos son optativos. El HTML y validadores heredados se compararon literalmente con las copias iniciales.

10. **Aislamiento y cierre.**

Todos los ensayos utilizan directorios nuevos con ACL privada, datos/usuarios sintéticos, generación propia y PostgreSQL 020 verificado. Se reutilizan aprovisionamiento y proxy existentes con un ámbito explícito separado, sin permisos generales. Host/Origin, CSP, rutas/métodos/parámetros, assets y cinco cabeceras mantienen listas cerradas.

Frontend/API/PostgreSQL escuchan únicamente en 127.0.0.1. Electron conserva sandbox, contextIsolation, webSecurity y nodeIntegration desactivado, sin preload privilegiado, sin permisos/ventanas/navegación/tráfico fuera de su origen. No se entregan secretos PostgreSQL al renderer.

No se accedió a `sian_kaan_reservaciones`, no se usaron credenciales/datos reales y no se cambiaron esquemas/migraciones/servicios de negocio. No se tocaron integraciones FareHarbor/GetYourGuide, receptores/sincronizadores, ngrok, certificados, tareas, servicios Windows, firewall, router, LAN o instaladores. El ensayo del Electron principal corresponde al perfil independiente anterior con su propia base sintética, nunca al perfil 020.

Se crearon siete clústeres: tres iteraciones de Operaciones y cuatro regresiones. Todos quedaron detenidos; los **20 puertos registrados están sin listeners y no quedan procesos asociados**, según `closure.json`. Solo se copiaron reportes y capturas sintéticos; configuraciones/secretos permanecen en sus directorios privados.

11. **Incidencias y limitaciones.**

La primera iteración pasó once grupos y comprobó el rollback técnico, pero su expectativa exigía bitácora global cero. Ya existía una entrada legítima por la reserva modificada para provocar contexto. Se corrigió la prueba para comparar con el estado anterior, sin cambiar la implementación o reglas. La segunda ejecución pasó quince grupos y la final diecisiete, añadiendo cuerpo de alta alterado y alta desconocida.

No quedan fallos de las verificaciones finales. Alta y edición están validadas; transporte permanece bloqueado. No se añadió una auditoría de negocio específica de Operaciones: definirla sería un alcance funcional separado, no una inferencia a partir de una bitácora de Reservaciones. La recuperación persistente tras destruir la ventana, offline, distribución y validación física con dos equipos siguen pendientes. Las pruebas locales no sustituyen esa validación.

12. **Reversión selectiva y siguiente integración.**

Los ensayos terminaron detenidos. Si una ejecución futura se interrumpe, identificar/cerrar únicamente sus procesos y detener su directorio validado:

```powershell
.\scripts\OperationFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Stop conserva validación de manifiesto/código. No alterar huellas para reutilizar configuraciones incompatibles o detener instalaciones ajenas.

Para revertir fuentes, retirar selectivamente el parche de los tres archivos modificados y los once archivos de implementación/pruebas creados. Las copias iniciales preservan todo el trabajo previo. Restaurarlas completas solo si los archivos actuales coinciden con los hashes finales registrados; ante trabajo posterior, retirar este parche selectivamente. Conservar evidencias y no usar reset/clean o restauraciones masivas. No se requiere migración inversa ni operación sobre una base existente.

La siguiente fase recomendada es la administración original de transportes, separando creación del grupo de la asignación posterior de vehículo y conservando mínimos/capacidad/relaciones. Inventariar cada escritor y validar sus formularios antes de ampliar este ámbito; no basta con desbloquear botones. Mantener intactas las acciones de asignación ya validadas en Reservaciones.

Posteriormente integrar Daily con sus controles y contrato existentes, incluida la escritura de observaciones por fecha. Inventariar exportación e impresión por separado y mantener las integraciones reales fuera del perfil. No activar producción hasta completar aceptación, decisiones sobre referencias tras cierre y pruebas físicas autorizadas.
