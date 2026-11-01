# Fase 2D.6 — Daily original y observaciones por fecha

**Daily original y guardado protegido de observaciones integrados y validados en laboratorio.** La generación de PDF y la invocación segura del botón de impresión también se verifican, sin impresión física ni activación productiva.

Resultado final: **870 pruebas Jest, 16 grupos Daily y todas las regresiones anteriores aprobados**. Los cuatro PDFs finales contienen 13 páginas correctas, sin páginas vacías. Los **10 laboratorios quedaron detenidos**, con **29 puertos sin listeners y ningún proceso asociado**.

Implementación exclusivamente de laboratorio sobre PostgreSQL 020 nuevo/desechable, API de comandos existente, HTTP 127.0.0.1 y Electron real. La entrada principal, instalación existente, servicios y esquema permanecen sin modificar. Los resultados definitivos se consolidan en `local-fase-2d6-verification.json` y `local-fase-2d6/`.

1. **Archivos creados y modificados.**

| Archivo existente | Cambio acotado |
|---|---|
| `frontend/pages/daily.js` | Hooks optativos para montar el control nuevo, consultar observaciones tras cargar la fecha, impedir sustitución de intención incierta, invalidar sesión y bloquear cambio de fecha durante preparación de PDF. Renderizadores, datos, filtros y formato impreso originales conservados. |
| `frontend/js/commandLab.js` | Permite que el PUT exacto de Daily use comparación con GET, sin pedir nuevas precondiciones antes de una decisión humana. |
| `scripts/commandFrontendHost.cjs` | Ámbito explícito `daily-integrado`, assets/rutas cerrados, entrada `/app/` y logos originales JPEG/JPG, sin habilitar escritores de otros módulos. |

Archivos nuevos: `frontend/js/dailyCommands.js`; `frontend/lab/daily.html`, `daily.js`, `daily.css`; `scripts/dailyFrontendPolicy.cjs`, `DailyFrontendLab.ps1`, `dailyFrontendLab.cjs`, `dailyFrontendFixtures.cjs`, `dailyFrontendProbe.cjs`, `dailyFrontendDriver.cjs`, `dailyFrontendPdf.cjs`; `backend/__tests__/dailyFrontend.test.js`. Se agregan este informe, inventario previo, respaldos, verificaciones, registros y evidencias sintéticas en `docs/`.

Se conservan `frontend/index.html`, `electron/main.js`, `electron/preload.js`, servicios comerciales, rutas/controladores/validadores, migraciones, modelos de datos y los módulos/protecciones anteriores. Inventario SHA-256 inicial: 501 archivos de código/configuración; las copias puntuales están en `local-fase-2d6/before/`. No se utiliza reset/clean ni restauración masiva.

Verificación de conservación final: **498 archivos previos idénticos, 3 modificados, 0 eliminados y 12 nuevos** de código/pruebas. Las huellas finales están en el JSON de verificación de esta fase.

2. **Componentes originales integrados.**

Se carga `frontend/pages/daily.js` con sus componentes HTML/JavaScript y CSS comunes originales. Conserva fecha, actividades, turnos, grupos, transportes, vehículos, guías/operadores, pasajeros asignados y pendientes, pickup propio de cada reservación, primera hora del grupo, finanzas, estados, observaciones y totales. La consulta y el formato impreso se comparan contra el respaldo, incluyendo escenarios anteriores con varios transportes y observaciones extensas. Sin adaptador, el HTML de la pantalla continúa idéntico.

El control de observaciones generales es **nuevo, solo de laboratorio** y está rotulado como tal dentro de la página original. No sustituye la pantalla ni sus formularios por un prototipo independiente. No se añaden campos a las tablas ni se redefine el contrato del Daily.

3. **Inventario de lecturas, escrituras e IPC.**

El inventario se preparó antes de cargar la pantalla y está en `local-fase-2d6/INVENTARIO.md`.

| Función | Solicitud/efecto autorizado |
|---|---|
| Login y permisos | POST `/api/auth/login`; GET `/api/auth/sesion`. |
| Daily original | GET `/api/daily/operativo?fecha=YYYY-MM-DD`. |
| Observaciones generales | GET `/api/daily/observaciones?fecha=YYYY-MM-DD`. |
| Foto de edición | POST `/api/precondiciones` para el PUT y fecha exactos. |
| Única escritura de negocio del ámbito | PUT `/api/daily/observaciones?fecha=YYYY-MM-DD` con `{observaciones:string}` y sobre de comando. |
| Recuperación | GET `/api/comandos/:clave`; consulta actual de observaciones por separado. |
| PDF | Preload original → `ipcRenderer.invoke('daily:export-pdf',{fecha})`; validación original en main, GET operativo autorizado, `webContents.printToPDF`, diálogo y revalidación antes de escribir. |
| Impresión | Botón original → assets + verificación de sesión + `window.print()`. Sin IPC adicional. |

Las lecturas de catálogo o de otros módulos no son necesarias para esta entrada y no se autorizan. Los assets exactos incluyen la página original, componentes comunes, CSS y logos originales. Se rechazan parámetros extra, fechas inválidas, rutas codificadas, fragmentos, métodos y assets ajenos.

4. **Estado real de observaciones por fecha.**

La pantalla original no tenía formulario ni consulta de observaciones generales; el backend sí tiene GET/PUT por fecha, validación de texto con trim y UPSERT de `daily_observaciones`. La nueva sección muestra el valor consultado; solo Administrador puede abrir edición. Obtiene foto autorizada antes de habilitar textarea, conserva original, confirma intención y utiliza el modelo compartido `CommandSession`.

`daily_observaciones` no pertenece a las tres tablas con revisión BIGINT de 019. El protocolo existente devuelve `revision=null` y protege mediante ETag firmado de la fila/MVCC o de su ausencia, además del contexto operativo. No se inventa un número de revisión ni se altera el esquema. Los BIGINT de Reservaciones/Operaciones/Transportes siguen manejándose como texto y se revalidan con sus módulos anteriores.

El recibo confirma el comando, pero no reemplaza una consulta actual. Hay acciones separadas para consultar el resultado, consultar observaciones actuales autorizadas y recargar el Daily. Un guardado no cambia automáticamente lo que representan las hojas operativas consultadas.

El servicio Daily tampoco registra bitácora propia: los recibos conservan `ids_bitacora: []`. No se agregan escrituras de auditoría. Queda pendiente definir trazabilidad humana de cambios de observaciones, junto con la ya documentada para Operaciones/Transportes, antes de producción.

5. **Concurrencia, idempotencia y recuperación.**

El PUT queda ligado a fecha, método/ruta, generación original, usuario/sesión, cuerpo confirmado, UUIDv4, ETag/contexto originales y sobre profundamente inmutable. Confirmación cancelada no envía comando ni genera otra foto. Doble gesto/repetición HTTP conserva una sola observación y un comando; otra intención con la misma clave se rechaza.

Dos administradores generan 412 al editar la misma fecha. Cambios de reservación, operación y transporte mientras se conserva la foto producen 409 de contexto. El comparador reutilizado muestra original/propuesta/actual autorizado con texto escapado, conserva la propuesta y consulta actual mediante GET, sin renovación automática de precondiciones. Revisar requiere decisión explícita y una nueva confirmación antes de guardar. Los rechazos durables se recuperan con la clave original.

Una respuesta perdida después de COMMIT se recupera tras reiniciar realmente el API, sin reenviar ni sustituir ETag/sobre. Un 404 de comando es no concluyente: conserva fecha/propuesta/clave y bloquea cierre, cambio de fecha, navegación y otro guardado. El estado es solo en memoria, sin borrador persistente ni offline. La revocación destruye datos/formulario/sobre y una respuesta tardía no los vuelve a mostrar.

La instrumentación privada por IPC comprueba XID/PID de negocio y ledger. Se fuerza un fallo posterior al INSERT del comando tanto para observación nueva como existente, y se comprueba rollback conjunto, checksum de negocio intacto, comando ausente y ningún cambio parcial.

6. **PDF e impresión.**

Se usa el preload original sin modificarlo ni exponer nuevos métodos. `dailyFrontendPdf.cjs` ejecuta las funciones y el manejador originales de `electron/main.js` aislados de su arranque principal; usa HTTP/API reales y reemplaza exclusivamente el diálogo por un destino sintético fijo dentro del directorio privado del ensayo. Valida pertenencia de ventana y firma de fecha/DOM/sesión durante el diálogo. No acepta rutas de archivo desde renderer.

El botón original genera PDF con `printToPDF`, `printBackground` y `preferCSSPageSize`. El adaptador bloquea cambio de consulta durante la preparación y el wrapper del ensayo cancela si cambia fecha/DOM durante el diálogo. La autorización original se verifica antes de generar y antes de guardar. Una revocación durante el diálogo no escribe archivo. El PDF contiene los datos efectivamente consultados; no afirma que sea una instantánea transaccional nueva del negocio al momento de imprimir.

Se conserva logo, encabezados, una hoja por transporte, turno/grupo, datos de pasajeros, totales, canceladas y notas de pasajeros/operador. Las reservaciones sin asignar continúan excluidas con la advertencia original. Las observaciones generales por fecha **no estaban incluidas** en esas hojas; no se incorporan silenciosamente ni se modifica ese formato durante esta fase.

El botón de impresión original se ejecuta con `window.print` interceptado por el harness y se inspecciona el contenido que entregaría. `printToPDF` real verifica además el CSS de impresión. **No se envían trabajos a impresoras físicas ni se usa un destino empresarial/real.** Los PDFs finales son datos sintéticos y se inspeccionan mediante extracción de texto y renderizado a PNG.

7. **Reglas operativas conservadas.**

La lectura es la del `daily.service.js` existente: operaciones/transportes registrados, relación real de cada pasajero, guías y responsables efectivos. PAX incluye niños; no se suman de nuevo. Cancelada se presenta con su etiqueta y no suma PAX activo. Los pendientes se muestran aparte y pueden contribuir al total operativo global según el contrato original; no aparecen en hojas de transporte.

Las pruebas incluyen varios tours, Mañana/Tarde, grupos 1/2, vehículo real de capacidad 3 y dos grupos de 12 con total 24. Daily consulta y no asigna recursos ni verifica de nuevo reglas de escritura. Los máximos/mínimos y movimientos siguen en los servicios existentes de capacidad, Reservaciones, Operaciones y Transportes; las regresiones de esos módulos comprueban sus guardas sin modificar servicios o reglas para aprobar.

8. **Pruebas y resultados.**

| Verificación | Resultado |
|---|---|
| Jest aislado, sin PostgreSQL ni red externa | **32 suites, 870 pruebas aprobadas**, 0 fallidas: 845 anteriores más 25 nuevas. |
| Daily original + control nuevo de observaciones, Electron/HTTP/PostgreSQL 020 | **16 grupos aprobados**, sin fallos finales. |
| Reservaciones | **38 grupos aprobados**: alta, edición, cancelación y transporte. |
| Operaciones | **17 grupos aprobados**: alta, edición y preparación de sugerencias. |
| Transportes | **17 grupos aprobados**: alta y edición originales. |
| Perfiles previos | **16 comprobaciones de comandos, 16 de revisiones y 6 standalone aprobadas**. |
| Atomicidad Daily | **7 pruebas de filas/ledger; 12 observaciones XID/PID coincidentes; 2 rollbacks forzados**, sobre UPSERT nuevo y existente. |
| PDF | **4 PDFs reales, 13 páginas finales, 0 páginas vacías**; fecha/contenido/logo verificados. Las páginas repetidas coinciden en su render PNG. |
| Impresión | Botón/validaciones originales comprobados; **0 trabajos físicos**. |
| Cierre | **10 clústeres detenidos; 29 puertos sin listeners; 0 procesos asociados**. |

Los 16 grupos integrados cubren carga/organización original; dos grupos de12 y total24; foto/confirmación/PUT/doble gesto/idempotencia; dos administradores con 412 y revisión explícita; 409 por reservas/operaciones/transportes; fecha sin observación previa; pérdida de respuesta/reinicio/recuperación y lectura actual separada; desconocido sin reenvío; rollback nuevo y existente; PDF original de dos fechas sin escrituras de negocio; cambio de fecha/DOM durante preparación; impresión segura; Consulta all/selected; revocación con respuesta retenida; revocación durante diálogo PDF; y ámbito cerrado sin escritores ajenos.

La suite nueva compara pantalla/hojas originales, política estricta, bloqueo de fecha ajena y comparación de conflicto sin renovar foto. Los ensayos reales usan sesiones separadas, usuarios y datos sintéticos. Las capturas, PDFs y renders finales `pdf-final-*` se conservan junto a registros y JSON públicos sin credenciales. La verificación textual está en `pdf-verification.json`; la visual y coincidencia de renders, en `pdf-visual-verification.json`.

Se corrigieron dos incidencias del montaje: la expectativa inicial contaba 7 reservaciones donde el fixture tiene 6; el contenedor nuevo de observaciones, aunque vacío en impresión, introducía una página en blanco antes de las hojas con página nombrada. Se corrigió únicamente la expectativa del controlador y la exclusión completa de ese contenedor en el CSS del laboratorio, sin tocar cálculos, servicios, CSS común o formato original. Los PDFs previos a corregir el contenedor se conservan en `initial-pdf/`, claramente separados de los finales. Las capturas esperan dos frames del renderer antes de guardarse para mostrar la pantalla ya pintada.

9. **Compatibilidad anterior.**

Se reejecutan los laboratorios de Reservaciones (38 grupos), Operaciones (17), Transportes (17), comandos, revisión y standalone en clústeres nuevos independientes. Sus políticas, adaptadores específicos y formularios no se modifican. La ampliación del host es un ámbito explícito; los ámbitos previos mantienen sus escritores y assets originales.

10. **Aislamiento.**

Verify exige crear un directorio/clúster nuevo y no permite suministrar uno existente. Reutiliza identidad de manifiesto/clúster, validación del esquema real 020 y entorno limpio. No se lee `.env` principal ni se conecta a `sian_kaan_reservaciones`. No hay migraciones contra bases existentes, integraciones reales, instaladores, tareas Windows, LAN ni cambios de firewall/router/ngrok.

PostgreSQL, API y host usan únicamente 127.0.0.1; el coordinador limita TCP a sus puertos y bloquea red externa/UDP. Electron mantiene sandbox/contextIsolation/webSecurity, sin nodeIntegration ni acceso privilegiado a archivos; el único preload es el original. Deniega permisos, ventanas nuevas y navegación/red externa. El cierre físico de procesos/listeners se verifica en `local-fase-2d6/closure.json`.

11. **Permisos y pendientes/bloqueos.**

Administrador conserva consulta, observaciones y acciones originales de PDF/impresión. Consulta all conserva la consulta y botones originales de salida, sin PUT. Consulta selected continúa sin acceso a Daily, sus observaciones o PDF; no se filtra ni revela parcialmente información operativa de otras plataformas. Se prueban backend, UI, IPC y revocación, sin ampliar roles.

En este ámbito permanecen bloqueados los escritores de Reservaciones, Operaciones, Transportes, Usuarios, catálogos e Integraciones. El PUT sin headers protegidos recibe 428 y las rutas ajenas 405. La entrada principal y los módulos ajenos no se sirven. Permanecen pendientes la trazabilidad propia de estas observaciones/Operaciones/Transportes, las decisiones productivas previas y las pruebas/distribución de producción. No se presenta la impresión física como validada.

12. **Ejecución y reversión.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\DailyFrontendLab.ps1 -Mode Verify
```

Cada Verify crea un laboratorio distinto. Si es necesario detener uno activo, utilizar exclusivamente el directorio explícito y verificado que produjo ese ensayo:

```powershell
.\scripts\DailyFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

La disponibilidad experimental se revierte dejando de iniciar esa entrada. Para retirar código, comparar solo los tres archivos modificados contra los respaldos de esta fase, preservando trabajo posterior, y retirar únicamente sus hooks/ámbito/adaptación. Los archivos nuevos quedan enumerados en el JSON final. No usar reset/clean, restauraciones masivas ni alterar huellas para eludir validaciones. No existe una migración productiva que revertir.

13. **Siguientes módulos.**

Integrar después consulta de Historial/Bitácora y Notificaciones, inventariando permisos, lecturas y cualquier escritor de marcado/estado antes de habilitarlos. Mantener los componentes originales y ámbitos cerrados; probar selected/all, revocación y respuesta tardía. Resolver la auditoría propia pendiente de Operaciones/Transportes/observaciones con autorización explícita y transacciones consistentes. Las integraciones externas y distribución productiva siguen sujetas a las decisiones y accesos originales; no activarlas por completar estos laboratorios.
