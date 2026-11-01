# Fase 2C.3C — comandos y recuperación en el frontend de laboratorio

Fecha local: 2026-10-27, America/Cancun. Repositorio: `A:\sistema-integrador-reservaciones`.

**Implementado y validado únicamente en laboratorio. No desplegado en producción.** La página explícita nueva usa `command-api-lab`, esquema real 020 y protocolo `ctsk-command-api-v1`. Conserva 14 formularios y bloquea las 11 rutas sin formularios compatibles. No se modificaron backend, migraciones, pantallas principales ni procesos reales de integración.

1. **Archivos creados y modificados.**

La comparación partió de 761 archivos: solo dos preexistentes cambiaron, 759 conservaron exactamente sus bytes y ninguno fue eliminado. Se preservaron cambios locales anteriores y archivos sin seguimiento. No se ejecutaron reset, clean o restauraciones masivas.

| Archivo modificado | Cambio acotado |
|---|---|
| `frontend/js/api.js` | Opción explícita `responseMetadata` para devolver status y cabeceras de contrato/ETag/replay; conserva la respuesta tradicional si no se solicita. Los errores optativos incluyen los mismos metadatos. |
| `frontend/lab/revisionEditor.js` | Ganchos condicionados a `App.commandLab`: recibo visible, bloqueo de controles, consulta de recuperación, conservación del formulario y cierre seguro de sesión. Sin ese módulo mantiene el flujo anterior. |

| Archivo nuevo | Responsabilidad |
|---|---|
| `frontend/js/commandLab.js` | Adaptador de protocolo, sesión de comando, sobre inmutable, guardia, timeout y recuperación. |
| `frontend/js/commandPanel.js` | Panel de estado, recibo autorizado y consulta separada de datos actuales. |
| `frontend/lab/command.html` | Entrada explícita del frontend 020; no se incorpora a index.html. |
| `frontend/lab/command.css` | Estilo del panel sobre las variables y componentes existentes. |
| `scripts/CommandFrontendLab.ps1` | Directorio nuevo privado, ACL y entorno limpio para Verify/Stop. |
| `scripts/commandFrontendLab.cjs` | Aprovisionamiento, verificación, procesos, reinicio, evidencia y cierre. |
| `scripts/commandFrontendHost.cjs` | Host/proxy loopback con listas cerradas, cabeceras verificadas y fallos de transporte controlados. |
| `scripts/commandFrontendDriver.cjs` | Ensayos DOM con Electron real y sesiones separadas. |
| `backend/__tests__/commandFrontend.test.js` | 16 pruebas aisladas del cliente y sus límites. |

Se agregaron además este informe, `docs/local-fase-2c3c-before.json`, `docs/local-fase-2c3c-verification.json` y `docs/local-fase-2c3c/`: copias iniciales de los dos archivos modificados, resultado Jest, cierre, reportes de ensayos y seis capturas sintéticas. El inventario y hashes están en el JSON consolidado.

No cambiaron `revisionLab.js`, `revisionConflict.js`, autenticación, index.html, páginas principales, Electron del producto, esquema 020 o anteriores, políticas de laboratorio, backend, integraciones, package.json ni dependencias.

2. **Adaptación del cliente HTTP.**

La página nueva carga primero el módulo anterior y luego instala explícitamente el adaptador de comandos. Reutiliza el registro de acciones y el comparador existente. La página anterior no carga ese adaptador; no se cambiaron sus perfiles para aceptar otro contrato.

`apiFetch` mantiene JWT, refresco de sesión, controles contra respuestas de otra sesión, abortos, errores y formato de retorno predeterminado. Solo los consumidores nuevos solicitan `responseMetadata`, que contiene protocolo, generación, replay y ETag; no incluye Authorization ni claves privadas.

Cada escritura nueva envía exactamente:

```http
X-CTSK-Protocol: ctsk-command-api-v1
X-CTSK-Data-Generation: <generación original>
Idempotency-Key: <UUIDv4 de la intención>
If-Match: <ETag original>
If-Operational-Match: <contexto original>
```

La guardia usa un ticket de un solo envío ligado al método, ruta, cuerpo serializado, cinco cabeceras, usuario y versión de sesión. No obtiene precondiciones nuevas al guardar ni permite una escritura heredada sin ticket. El backend continúa siendo la autoridad de permisos e idempotencia.

Las respuestas de fotos y recibos se comprueban contra protocolo y generación. Un recibo también debe coincidir con la clave original y tener estado/status coherentes. Una respuesta incompleta, incongruente, de red o técnica no se convierte en éxito. Las llamadas nuevas tienen timeout de 20 segundos con AbortController. No existe reintento de escritura, refresco con reenvío ni fallback de protocolo.

3. **Sobre de comando.**

Se genera UUIDv4 con `window.crypto.randomUUID()` únicamente después de una confirmación afirmativa. El sobre guarda clave, generación, usuario, versión de sesión, método/ruta, cuerpo confirmado, serialización original, ETag, contexto, protocolo y cabeceras. Se copia y congela profundamente. Rechazar el diálogo no genera clave ni envía escritura.

Permanecen separados la foto `original`, la `proposal`, el `command`, la lectura `current` y el `receipt`. Las revisiones BIGINT se validan como string/null y no se convierten a Number. La versión de sesión solo protege identidad local; no funciona como revisión ni como clave. Tampoco se reutiliza un nonce HTTPS.

Una vez enviado, los controles de edición y guardar quedan congelados. El usuario puede consultar el comando original. Un recibo confirmado permanece visible y permite otra lectura autenticada del recurso actual; esa lectura no reemplaza la foto ni sus precondiciones. El recibo nunca se usa como ETag.

4. **Pantallas y acciones adaptadas.**

| Formulario de laboratorio | Acción protegida |
|---|---|
| Reservación: modificar | PATCH reservaciones/:id. |
| Reservación: cancelar | PATCH reservaciones/:id/cancelar. |
| Reservación: cambiar transporte | PATCH reservaciones/:id/transporte. |
| Operación | PATCH operaciones/:id. |
| Transporte | PATCH transportes/:id. |
| Daily por fecha | PUT daily/observaciones?fecha=... |
| Evento: aprobar/rechazar, archivar, aplicar cancelación | PATCH eventos-integracion/:id/revision, PATCH :id/archivo, POST :id/aplicar. |
| Vehículo, guía, operador, tour y usuario | PATCH :id en cada uno de esos cinco recursos. |

Son 14 rutas. Se conserva la edición parcial de campos ya expuestos por el laboratorio; no se afirma que todos los campos de cada recurso tengan controles. Las diez altas y el cambio de contraseña siguen bloqueados. La aplicación de eventos solo muestra cancelaciones sintéticas GYG/FH; no se habilitan formularios de new_booking/modification. FareHarbor conserva el preview y su huella original; una revisión explícita obtiene foto/preview nuevos antes de otra confirmación.

El host también bloquea las 11 rutas pendientes, controles de sincronización y recursos principales. No monta index.html ni los scripts de páginas del producto.

5. **Recuperación y conflictos.**

“Consultar resultado original” ejecuta GET `/api/comandos/:clave` con la generación/protocolo originales y JWT vigente. No reenvía cuerpo ni ejecuta una escritura.

| Resultado | Conducta del frontend |
|---|---|
| Confirmado | Conserva y muestra recibo validado; puede consultar información actual por separado. Guardar sigue bloqueado. |
| Rechazado durable | Muestra código/status del resultado y conserva la propuesta. Permite revisión explícita de una nueva foto. |
| Desconocido/404 | Advierte que no hay evidencia concluyente y conserva el sobre. No permite preparar otra intención, generar otra clave o abrir otro formulario desde ese estado. |
| Error de recuperación | Conserva la incertidumbre, el formulario y el sobre; no escribe. |
| 403 o sesión/permisos cambiados | No muestra un recibo histórico nuevo. Un 403 elimina recibo/datos actuales; la invalidación de sesión existente destruye edición y panel anteriores. |

Los conflictos durables 412 y 409 de contexto conservan la comparación original/propuesta/actual. “Revisar mis cambios” conserva la propuesta; “Utilizar la información actual” requiere confirmar su descarte. Solo después de esa decisión se obtiene otra foto y se prepara una edición. La clave nueva no aparece hasta confirmar la nueva intención. No hay fusión automática.

`CLAVE_IDEMPOTENCIA_REUTILIZADA` es un estado de conciliación, no un conflicto para hacer rebase. Los códigos de bloqueo 55P03/40P01 también conducen a incertidumbre y consulta, sin presentarse como cambio de contexto. Un replay confirmado se reconoce mediante `Idempotency-Replayed`, sin duplicar la acción.

Mientras un comando siga sin conciliar, descartar o cambiar de formulario no habilita otra intención. Cerrar sesión sigue siendo posible mediante confirmación explícita que advierte pérdida de referencia/borrador y aclara que no cancela el comando. La recuperación solo dura mientras vive la sesión autorizada y el formulario: no se guarda el sobre o borrador en localStorage, archivos o una cola durable.

6. **Pruebas y resultados.**

| Grupo final ejecutado | Resultado |
|---|---|
| Jest aislado, con guardias PostgreSQL/red | 26 suites, 706 pruebas aprobadas, 0 fallidas. |
| Frontend nuevo + Electron + HTTP + PostgreSQL 020 reales | 16 comprobaciones aprobadas; 14 formularios ejercitados. |
| Regresión frontend anterior + Electron + API/PostgreSQL 019 | 16 comprobaciones aprobadas. |
| Regresión independent-dev con Electron/PostgreSQL anteriores | 6 comprobaciones aprobadas. |

Los ensayos usan ventanas con particiones independientes: dos administradores, Consulta y sesiones adicionales para desconocido/bloqueo. Mantienen sandbox, contextIsolation, webSecurity y nodeIntegration desactivado. Los diálogos se responden únicamente en el corredor y se prueba que rechazar confirmación no genera otro comando.

Se validaron guardado/recibo, sobre inmutable, metadatos exactos, repetición de HTTP, clave con intención distinta, respuesta perdida, error de recuperación, reinicio del backend normal, desconocido, rechazo durable, 412/409, candado real, roles, alcances y revocación de permisos mientras llegaba una respuesta ya confirmada. La invalidación durante la lectura de un conflicto también tiene prueba aislada para impedir resucitar una edición destruida.

El truncado es una avería inyectada en el proxy real: espera la respuesta completa de la API, ya posterior a COMMIT, anuncia su Content-Length y corta el cuerpo a la mitad. Chromium recibe una respuesta incompleta y el cliente conserva la intención. Las conexiones HTTP y PostgreSQL son reales; la avería y la duplicación se controlan por IPC del corredor, sin endpoints de fallo accesibles desde la página.

La duplicación de transporte es deliberada en el proxy: envía dos solicitudes HTTP iguales y entrega la segunda respuesta al frontend. No se presenta como reproducción espontánea de todos los mecanismos de reintento de Chromium. La conexión Chromium-host usa keep-alive, comprobado mediante cabecera y puertos de cliente repetidos; el host no fuerza Connection: close. El backend conserva su política anterior y puede abrirse otra conexión hacia él. La idempotencia no depende de compartir un socket.

No se ejecutó npm test global ni suites sobre bases existentes. No se probaron equipos físicos LAN, destrucción de ventana, persistencia del borrador, pérdida eléctrica ni todas las variantes externas. Las 22 comprobaciones API de 2C.3B no se contabilizan como reejecutadas en esta fase: el backend conservó sus bytes y sus suites aisladas sí se incluyeron.

Para repetir desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\CommandFrontendLab.ps1 -Mode Verify
```

Verify crea otro directorio privado y clúster vacíos; usa el aprovisionador existente con 019/020 y lo detiene al terminar. No es una instalación operativa ni una modalidad Electron del producto.

7. **Evidencia de ausencia de duplicados.**

El reporte público registra contadores del proxy y consultas PostgreSQL independientes. No registra JWT, claves privadas, cuerpo de login ni cuerpos de comandos; utiliza huellas de cuerpos sintéticos para comparar envíos.

| Escenario final | Envios a API por clave | Filas de comando | Bitácora del caso |
|---|---:|---:|---:|
| Guardado y replay HTTP explícito | 2 | 1 | 1 |
| Repetición controlada de transporte | 2 | 1 | 1 |
| Respuesta truncada después de COMMIT | 1 | 1 | 1 |
| Consultas del mismo comando tras error y reinicio | Continúa en 1 | 1 | 1 |
| Clave con dos cuerpos distintos | 2; segundo 409 | 1 | 1 |
| Interrupción sintética antes de llegar a API | 0 | 0 | 0 |
| Espera real por candado agotada | 1 | 0 | 0 |
| Cancelaciones sintéticas GYG/FH repetidas | 2 en cada caso | 1 en cada caso | 1 en cada caso |

La aplicación contó un único fetch de escritura para la repetición controlada del transporte. Las consultas de recuperación no aumentaron ese contador. Los casos desconocidos permanecieron bloqueados sin generar otra UUID o envío. El JSON conserva las claves públicas de correlación, huellas y contadores, sin las claves privadas del protocolo.

![Resultado incierto con el formulario conservado](local-fase-2c3c/respuesta-incierta.png)

![Recibo recuperado y lectura actual separada](local-fase-2c3c/recibo-recuperado.png)

8. **Compatibilidad con fases anteriores.**

La página `revision.html`, los módulos `revisionLab.js`/`revisionConflict.js`, los perfiles anteriores y el backend no se modificaron. Los ganchos del editor se activan solo cuando la página nueva carga `commandLab.js`. `apiFetch` sigue devolviendo el cuerpo original a los consumidores heredados. Las regresiones anteriores verificaron sesiones, conflictos, roles, Daily, eventos y Electron reales.

No se reescribió el protocolo `revision-api-lab` ni se relajó `schema-tests-only`; tampoco se convirtió el esquema 020 en uno anterior o se agregaron migraciones. Los manifiestos conservan la vinculación al hash de fuentes: los ensayos generan configuraciones nuevas, nunca editan digests para reutilizar una configuración incompatible.

9. **Aislamiento.**

El host nuevo requiere un plan `command-api-lab` válido y sin cambios. El corredor verifica identidad efectiva de PostgreSQL, manifiesto, esquema 020 y permisos mediante la política existente antes de servir UI. La API arranca por su entrada normal con sus verificaciones completas. El proxy solo reenvía al puerto loopback de ese manifiesto y exige protocolo/generación correctos en la respuesta.

Host/Origin, método, ruta, query y assets tienen listas cerradas; hay CSP, no se habilita CORS y no se reenvían cookies ni cabeceras arbitrarias. Los sockets del corredor se limitan a sus puertos de API/UI/PostgreSQL y Electron bloquea navegación, nuevas ventanas, permisos y peticiones fuera del origen. No se entregan manifiesto, claves privadas o credenciales PostgreSQL al renderer.

No se accedió a `sian_kaan_reservaciones`, no se usaron datos/credenciales productivos ni se modificaron integraciones, ngrok, tareas, firewall, router, certificados, TLS, red empresarial, servicios o instaladores. No se habilitó LAN. Esta confirmación se basa en destinos y acciones verificados; no se consultó producción para comparar datos.

Se crearon cinco directorios/clústeres durante esta fase: tres iteraciones nuevas y dos regresiones. Todos quedaron sin PID PostgreSQL, sus 14 puertos sin listeners y sin procesos asociados. La evidencia está en `docs/local-fase-2c3c/closure.json`.

10. **Problemas y reversión.**

La primera iteración esperaba rechazar PAX=13 en una reservación sin transporte; esa expectativa no correspondía al alcance de la regla existente. Se corrigió el caso usando PAX=0, inválido por el contrato actual, sin alterar reglas de negocio. La verificación de conexión persistente se centró en Chromium-host, donde ocurre la pérdida de respuesta; no se presupone que el backend reutilice su socket. Se protegió además la carrera de invalidación durante una lectura de conflicto para no restaurar el estado de una edición destruida. Los grupos finales pasaron.

Todos los ensayos están detenidos. Si un Verify se interrumpe, identificar y cerrar únicamente su proceso Node/Electron por directorio/corredor, y después detener su clúster propio:

```powershell
.\scripts\CommandFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Stop valida manifiesto/directorio/código y no termina procesos Node ajenos. No cambiar hashes para eludir verificaciones ni borrar rutas calculadas sin comprobar su ruta absoluta y pertenencia al laboratorio.

Para revertir fuentes, retirar los bloques de `responseMetadata` de api.js y los ganchos condicionados al adaptador de revisionEditor.js, junto con los nueve archivos nuevos de implementación/pruebas enumerados. Las copias `docs/local-fase-2c3c/before/` preservan los cambios anteriores. Restaurarlas completas solo si el archivo actual coincide con su hash final; si hubo trabajo posterior, retirar el parche selectivamente. Conservar evidencias y no usar reset/clean o restauración masiva. No requiere DROP TABLE, migración inversa ni operación sobre una base existente.

11. **Recomendación de integración futura.**

Tras revisar esta fase, trasladar el adaptador a un modal principal por vez, conservando la captura de foto antes de editar, confirmación de intención, sobre inmutable y presentación separada de recibo/estado actual. Completar antes los formularios y variantes bloqueados con sus propios controles y previews; no activarlos por el simple hecho de que la ruta backend tenga idempotencia.

Mantener las categorías distintas de clave reutilizada, contexto, bloqueo, rechazo durable y desconocido. No habilitar guardado tras 404 ni sustituir ETag por un recibo. La revocación de permisos debe seguir invalidando datos de la sesión anterior. Antes de una instalación real hacen falta pruebas del transporte autorizado y dos equipos físicos, además de decisiones de conservación/recuperación de referencias y borradores cifrados. No se implementaron persistencia de borradores, recuperación tras destruir la ventana, offline ni reenvíos automáticos.
