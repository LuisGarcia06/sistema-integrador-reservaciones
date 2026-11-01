# Fase 2D.5 — Administración original de Transportes

**Fase completada en laboratorio: alta y edición originales de Transportes validadas.** Se verificaron 845 pruebas Jest, 17 grupos de Transportes, 38 de Reservaciones y 17 de Operaciones, sin fallos finales. Se comprobaron 28 evidencias con XID/PID coincidentes y dos rollbacks forzados. Los nueve laboratorios de esta fase quedaron detenidos; sus 26 puertos no tienen listeners ni procesos asociados.

Implementación exclusivamente de laboratorio, sobre PostgreSQL 020 nuevo y desechable, HTTP loopback y Electron real. La entrada principal y la instalación existente no se activan ni se migran. Los resultados finales se acompañan en `local-fase-2d5-verification.json` y en la carpeta `local-fase-2d5/`.

1. **Archivos creados y modificados.**

Tres archivos existentes reciben cambios puntuales:

| Archivo | Cambio |
|---|---|
| `frontend/pages/operaciones.js` | Conecta el formulario original de transporte con el adaptador optativo; conserva render, campos, selectores, normalización, validación y cálculo diferencial. Protege cierre, cambio de grupo/fecha y revocación. Bloquea las demás acciones dentro del nuevo ámbito. |
| `frontend/js/commandLab.js` | Agrega `CreateTransportSession` mediante la clase compartida de altas; permite comparación de edición de transportes con GET autorizado. Las altas siguen requiriendo opt-in explícito; el constructor ordinario no autoriza POST de raíz. |
| `scripts/commandFrontendHost.cjs` | Agrega ámbito cerrado `transportes-integrados`, evidencia del hash del cuerpo de precondiciones y coordinación optativa del reinicio del API de ensayo. Los ámbitos previos conservan sus políticas. |

Archivos nuevos:

| Archivo | Función |
|---|---|
| `frontend/js/transportCommands.js` | Adaptador del formulario existente: confirmación, bloqueo del sobre, comparador, recibo, consulta y revisión explícita. |
| `frontend/lab/transportes.html` | Carga login, módulo original Operaciones y componentes compartidos; no contiene un formulario alternativo. |
| `frontend/lab/transportes.js` | Enrutamiento mínimo hacia la página original y reacción a permisos. |
| `frontend/lab/transportes.css` | Presentación acotada de recibo y comparador dentro del panel original. |
| `scripts/transportFrontendPolicy.cjs` | Lista exacta de métodos, rutas y assets disponibles. |
| `scripts/TransportFrontendLab.ps1` | Crea siempre un directorio nuevo con ACL privada, entorno limpio y procesos ocultos. |
| `scripts/transportFrontendLab.cjs` | Reutiliza el aprovisionamiento y verifica identidad, esquema y aislamiento; gestiona procesos, pruebas, pruebas transaccionales y cierre. |
| `scripts/transportFrontendFixtures.cjs` | Usuarios y relaciones sintéticos sobre el clúster nuevo, reutilizando fixtures anteriores. |
| `scripts/transportFrontendProbe.cjs` | Observación privada por IPC del XID/PID y fallo después del INSERT del ledger; inicia la API protegida normal. |
| `scripts/transportFrontendDriver.cjs` | Ejercita los controles originales con Electron real y sesiones separadas. |
| `backend/__tests__/transportFrontend.test.js` | 33 pruebas nuevas de conservación del formulario, validaciones, política y modelo de comandos. |

También se generan informe, inventario previo, copias puntuales, huellas, registros JSON y capturas bajo `docs/`. No se modifican servicios, controladores, rutas, permisos de negocio, esquemas, migraciones, `frontend/index.html`, `electron/main.js`, `transportesUi.js`, adaptadores de Reservaciones u Operaciones ni sus políticas.

2. **Formularios originales integrados.**

Se reutiliza `renderTransporteForm` de Operaciones, sin segunda definición de campos. El alta conserva operación/grupo como contexto fijo elegido al abrir el panel, operador opcional, estado y observaciones en textarea. Conserva la nota original que difiere la selección de vehículo hasta tener al menos 2 PAX activos. La edición conserva vehículo, operador, estado y observaciones, incluidas selecciones históricas inactivas y nulos. Las pruebas comparan el HTML original completo contra el respaldo anterior a esta fase.

Antes de editar se consulta una foto autorizada. Si el transporte ya pertenece a otra operación, no se abre con el grupo incorrecto. Si esa relación cambia después, el conflicto conserva la propuesta y exige abrir el grupo correspondiente antes de seguir editando. No se añade un selector de movimiento entre operaciones que el formulario original no tenía.

3. **Cobertura POST y PATCH.**

POST `/api/transportes`: validación original → confirmación humana → cuerpo completo congelado → POST `/api/precondiciones` con exactamente ese cuerpo → comprobación de protocolo, generación, ETag y contexto → UUIDv4 → sobre inmutable → envío protegido → recibo confirmado y lectura autorizada del recurso creado. El cuerpo original completo tiene cuatro campos: `id_operacion_tour`, `id_operador`, `estado`, `observaciones_operador`. El servidor conserva su valor predeterminado `id_vehiculo=null`. No se obtiene una foto vacía de creación.

PATCH `/api/transportes/:id`: foto autorizada antes de renderizar, validadores originales y `getChangedTransportePayload` diferencial, confirmación explícita y sobre con ETag/contexto originales. El formulario permanece abierto ante recibo o error y permite consultar el resultado original. El recibo no sustituye el ETag de una futura edición.

Crear un transporte requiere una operación ya existente. El inventario de todas las solicitudes está en `local-fase-2d5/INVENTARIO.md`. Tanto alta como edición emiten una sola escritura de negocio, seguida de lecturas; no requieren un encadenamiento de escrituras del frontend ni crean relaciones automáticamente.

4. **Validaciones y relaciones conservadas.**

| Regla | Implementación existente y verificación |
|---|---|
| Un transporte por operación | FK y unicidad existentes. Dos altas distintas para la misma operación dejan uno solo; la segunda conserva rechazo durable. |
| Operación, fecha, tour, turno, grupo | El formulario conserva el contexto del grupo seleccionado. Los movimientos por API siguen pasando por `validarCambioOperacion` y `validarReservacionesCompatiblesOperacion` en `transportes.service.js`. No se añade esa acción al formulario. |
| Elección humana de operador/vehículo | Selectores originales y PATCH diferencial. Alta con operador explícito, sin vehículo ni pasajeros automáticos. |
| Capacidad real | Asignar vehículo de capacidad 3 a transporte con 4 PAX se rechaza y no modifica datos. |
| Máximo 12 | Transporte histórico sintético con 13 PAX rechaza asignación de vehículo de capacidad 12; grupo con 12 se acepta. El catálogo también limita la capacidad de vehículos a 12. |
| Mínimo 2 con vehículo | Transporte con 1 PAX rechaza la asignación; el alta mantiene vehículo pendiente. `validarCapacidadTransporte` y `validarMinimoTransporteConVehiculo` conservan las reglas al asignar, mover, reducir o cancelar pasajeros. |
| Máximo 24 por tour/fecha/turno | Editar vehículo no añade pasajeros: se comprueban dos grupos de 12 y total 24 intacto. Los incrementos/asignaciones se validan en `reservaciones.service.js` y los movimientos de operación en `transportes.service.js`, mediante `validarMaximoTourTurno`. Las pruebas existentes de capacidad verifican 24 aceptado/25 rechazado; se reejecuta también la regresión integrada de Reservaciones. |
| Cancelación y otros estados | El contrato existente excluye exactamente `Cancelada` del cómputo activo. Una reserva cancelada de 10 PAX junto a una activa de 1 sigue sin cumplir mínimo 2. No se redefine qué estados cuentan. El campo estado de transporte conserva el contrato de texto no vacío, máximo 30 caracteres. |
| PAX incluye niños | Transporte con `pax=3,ninos=1` acepta vehículo de capacidad 3: no suma los niños de nuevo. |
| Asignación/movimientos de reservaciones | No son creación del transporte. El ámbito permite consultar el panel original de pasajeros, pero bloquea asignar/mover/quitar, incluso mediante eventos forzados. Los cuatro flujos protegidos de Reservaciones se revalidan por separado. |

No se alteran reglas, cálculos, estado ni escrituras del Daily. La lectura `/api/daily/operativo` solo abastece la presentación original de operaciones y pasajeros.

5. **Concurrencia optimista.**

Se conservan las revisiones BIGINT como texto. El ensayo incrementa exactamente `9007199254740993`, sin conversión a Number. Dos administradores, cambio directo de operador y cambio directo de vehículo producen 412. Cambios en capacidad del catálogo, datos del operador, reservación vinculada y operación relacionada producen 409 de contexto.

El comparador compartido presenta original, propuesta y actual autorizado con texto escapado. La propuesta y los selectores no se sobrescriben. La lectura de comparación es GET; no renueva precondiciones antes de una decisión humana. Revisar exige decisión explícita, una nueva foto para edición y otra confirmación al guardar. Un rechazo de alta conserva el formulario y solo obtiene nuevas precondiciones al confirmar otra vez el cuerpo completo. Negocio, revisión, contexto, clave reutilizada y bloqueo se presentan por separado.

6. **Idempotencia y recuperación.**

Se utiliza exclusivamente `ctsk-command-api-v1`. La intención retiene generación, usuario/sesión, UUIDv4, método, ruta, JSON del cuerpo, ETag y contexto, congelados profundamente. Doble gesto y repetición HTTP con la misma clave no duplican filas ni revisiones; otra intención con esa clave se rechaza.

Tras pérdida de respuesta después de COMMIT se conserva el formulario y se bloquea otro guardado. La recuperación consulta únicamente GET `/api/comandos/:clave`. Los casos de alta y edición reinician realmente el API sobre el mismo PostgreSQL sintético y recuperan el recibo sin reenviar el comando. El host de ensayo pausa y drena solicitudes durante ese reinicio planificado, y las deja continuar después: evita mezclar el caso con una revocación por consulta de sesión fallida; no sintetiza recibos ni repite escrituras.

Un 404 de comando es no concluyente. No autoriza reenvío, cambio de clave, nueva foto, cierre, cambio de grupo/fecha ni navegación que destruya la intención. El sobre solo reside en memoria; no hay borradores persistentes ni sincronización offline. La revocación invalida formulario y sobre; una respuesta tardía no vuelve a mostrar información.

7. **Pruebas realizadas y resultados.**

Los resultados definitivos y las incidencias de montaje se consolidan en `local-fase-2d5-verification.json`; los registros finales son `jest-final.log/json`, `integrated-final.log`, `operations-final.log` y `reservations-final.log`. Las pruebas usan usuarios/datos sintéticos y controles reales de los formularios, sin sustituir el API de negocio.

| Verificación final | Resultado |
|---|---|
| Jest con PostgreSQL y red externa bloqueados | **31 suites, 845 pruebas aprobadas**, 0 fallidas; las 812 anteriores más 33 nuevas. |
| Transportes: Electron + HTTP + PostgreSQL 020 real | **17 grupos aprobados**, 0 fallos; alta y edición verificadas por separado. |
| Regresión integrada Reservaciones | **38 grupos aprobados**, 0 fallos; creación, edición, cancelación y transporte. |
| Regresión integrada Operaciones | **17 grupos aprobados**, 0 fallos; creación, edición y sugerencias originales. |
| Evidencia integrada de Transportes | **15 pruebas de filas/ledger**, **28 observaciones XID/PID coincidentes**, **2 rollbacks forzados**. |
| Conservación frente al inventario inicial | **490 archivos previos: 487 idénticos, 3 modificados, 0 eliminados**; 11 archivos nuevos de código/pruebas. |
| Cierre físico de los ensayos | **9 clústeres detenidos; 26 puertos sin listeners; 0 procesos asociados**. |

Los 17 grupos cubren: edición y validadores originales/BIGINT; dos administradores y 412; cambios directos de vehículo y dependencias con 409; alta original y duplicación; cuerpo POST alterado; revisión explícita de alta rechazada; competencia de altas y rechazo durable recuperable; capacidades/canceladas/niños/total 24; consulta del panel de pasajeros con movimientos bloqueados; pérdida de respuesta y recuperación de alta y edición tras reinicio; clave reutilizada; desconocidos de alta y edición; bloqueo real; rollback de ambas acciones; Consulta all/selected; revocación; cierre de rutas/escritores y aislamiento de Electron.

Las capturas verificadas visualmente incluyen `transporte-creado.png`, `transporte-editado.png`, `transporte-conflicto-412.png`, `transporte-contexto-409.png`, `alta-transporte-recuperada.png`, `edicion-transporte-recuperada.png` y los dos casos desconocidos. Muestran el panel original, sus tablas y el comparador/recibo compartidos.

Incidencias previas del montaje, conservadas en registros: un fixture de vehículo con capacidad 16 fue rechazado por el CHECK existente y se corrigió a 12; una asignación JavaScript de prueba intentaba devolver una función no serializable a Electron y se corrigió para devolver un valor simple; se coordinaron las consultas durante el reinicio planificado del API; un reinicio detectó cambios de código realizados mientras ese ensayo estaba abierto y se rechazó correctamente con `CONFIG_CHANGED`. Se repitió todo sobre clústeres nuevos con código ya cerrado. Ninguna incidencia requirió relajar validadores, triggers, huellas, permisos o servicios comerciales. Los ensayos fallidos también quedaron detenidos.

8. **Transacciones y ausencia de duplicados.**

El observador privado captura `pg_current_xact_id()` y `pg_backend_pid()` durante el trabajo de negocio y después del INSERT del comando. El harness exige coincidencia de ambos para cada evidencia. Se inyecta una excepción posterior al INSERT del ledger para alta y edición: checksum completo de tablas de negocio intacto, comando ausente y ningún transporte nuevo parcial. Bitácora conserva su conteo anterior.

La repetición HTTP deja un transporte y un comando para la misma intención; los hashes del cuerpo coinciden. La competencia con otra clave no evade la unicidad. Las pruebas consultan las filas reales y el ledger por el identificador de la intención. El JSON integrado contiene `proofs`, `transactions` y `calls`, sin credenciales.

9. **Compatibilidad con Reservaciones y Operaciones.**

Se ejecutan de nuevo los 38 grupos integrados de Reservaciones —alta, edición, cancelación y transporte— y los 17 de Operaciones —alta, edición y preparación de sugerencias— sobre bases nuevas independientes. Sus adaptadores, formularios específicos y políticas permanecen sin modificaciones. Se conserva la entrada de Operaciones de 2D.4 con escritores de transporte bloqueados; el nuevo ámbito es explícito y separado.

10. **Aislamiento.**

El wrapper rechaza un directorio suministrado para Verify y crea uno nuevo bajo LOCALAPPDATA. Reutiliza validaciones de manifiesto, identidad del clúster, configuración y esquema real 020. No lee el `.env` principal ni usa credenciales reales. Los fixtures se ejecutan únicamente después de aprovisionar/verificar la base nueva.

API, host y PostgreSQL se enlazan exclusivamente en 127.0.0.1. El harness limita TCP a sus tres puertos y bloquea UDP/fetch externo. Electron usa sandbox, contextIsolation, webSecurity, sin nodeIntegration ni preload privilegiado; deniega permisos, ventanas nuevas, navegación externa y solicitudes de otro origen. El host tiene CSP y lista exacta de rutas/assets. No se abren puertos LAN ni se cambian firewall, router, ngrok, certificados, tareas o servicios Windows. No se genera instalador ni se prueba LAN física de dos computadoras. El cierre se comprueba además mediante procesos y listeners reales en `local-fase-2d5/closure.json`.

11. **Escritores que permanecen bloqueados.**

En este ámbito solo se habilitan POST `/api/transportes` y PATCH `/api/transportes/:id` con sobre protegido. Login y precondiciones no son escritores de negocio. Permanecen bloqueados Operaciones, Reservaciones, asignación de pasajeros, Usuarios, catálogos, Integraciones y Daily. Falta de headers de comando devuelve 428; rutas ajenas devuelven 405. La entrada principal y assets de páginas ajenas no se sirven. Consulta all puede leer; Consulta selected no accede a las páginas/rutas operativas según la política existente. El backend valida rol, alcance y revocación, incluidos recibos.

12. **Auditoría y trazabilidad.**

Transportes, como Operaciones, carece de bitácora propia en sus servicios actuales. No se agregan escrituras de auditoría ni se presentan IDs ficticios: sus recibos tienen `ids_bitacora: []`. Un cambio de reservación sintética efectuado por el coordinador para provocar un conflicto sí produce la bitácora existente de Reservaciones; por eso los ensayos posteriores comparan con el conteo previo y no asumen tabla vacía.

Antes de producción quedan pendientes la trazabilidad humana de alta de transporte, cambio de vehículo/operador, observaciones, estado y relación de operación; además de creación/edición de Operaciones. Requerirán un alcance autorizado independiente que conserve atomicidad con las escrituras. El ledger de comandos demuestra resultado e idempotencia y no reemplaza ese historial.

13. **Ejecución y reversión.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\TransportFrontendLab.ps1 -Mode Verify
```

Verify siempre crea un clúster distinto. Para detener un ensayo de esta entrada que siga activo, usar únicamente su directorio explícito y validado:

```powershell
.\scripts\TransportFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

No se cambian huellas ni manifiestos para eludir comprobaciones. Como no se activó la entrada principal, dejar de iniciar el laboratorio revierte su disponibilidad. Para retirar código de esta fase, revisar los tres diffs contra `local-fase-2d5/before/` y retirar exclusivamente sus cambios tras comprobar que no haya trabajo posterior. Los once archivos nuevos y esta evidencia son identificables en el inventario de verificación. No usar reset/clean, no restaurar masivamente el repositorio y no tocar bases existentes. No hay una migración de reversión que aplicar a producción.

14. **Recomendaciones para Daily.**

Inventariar primero las lecturas, observaciones por fecha, exportación PDF e impresión del módulo original. Separar lectura/presentación del único escritor que corresponda, conservar sus controles y validar el contrato de precondiciones/idempotencia de observaciones. Verificar permisos all/selected, concurrencia por fecha, cambios de operaciones/transportes/reservas mientras la pantalla está abierta, recibo perdido y rollback sin alterar reglas de capacidad. Mantener exportación e impresión como acciones humanas y probar qué datos fueron efectivamente consultados para cada salida. Resolver la trazabilidad pendiente de Operaciones/Transportes antes de habilitar un entorno productivo.
