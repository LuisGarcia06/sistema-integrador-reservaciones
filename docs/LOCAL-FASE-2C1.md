# Fase 2C.1 — protección transaccional operativa en laboratorio

Fecha: 2026-10-26. Implementación y validación exclusivamente con PostgreSQL desechable, datos sintéticos y loopback. No se implementaron revisiones de registros, claves de idempotencia ni recuperación de borradores.

## Resultado y alcance de activación

Se reprodujeron tres problemas con los servicios anteriores: asignación incompatible por membresía leída antes de completar bloqueos; interbloqueo entre asignación, transporte y vehículo; y `25P02` después de una colisión `23505` de código. Las correcciones eliminaron esos resultados en los escenarios protegidos ejecutados.

**Las nuevas protecciones se activan solo cuando la configuración privada inicializada corresponde a `standalone-development` y a una base `ctsk_standalone_<12hex>_test`, usuario limitado, puerto no protegido y clúster distinto del principal.** No se activan por variables de entorno o argumentos nuevos. Se conservan las verificaciones existentes de manifiesto, ACL, integridad, proceso PostgreSQL, identidad efectiva, rol y esquema.

El contrato principal, las entradas protegidas anteriores y sus procesos reales conservan su comportamiento. Esta fase NO habilita estas correcciones en producción. Su promoción requerirá revisión y autorización posteriores. `independent-dev`, `https-lab` y el futuro servidor `lan-lab` usan la configuración privada aislada y comparten la protección nueva. No se abrió LAN.

## 1. Inventario de escritores

| Escritor | Ruta transaccional identificada | Tratamiento en laboratorio |
|---|---|---|
| Alta de reservación | `crearReservacionEnTransaccion` / `crearReservacionConDb` | Candado al BEGIN; INSERT sin abortar por código repetido; bitácora en mismo cliente |
| PATCH de reservación | `actualizarReservacionParcial` y helper `ConDb` | Candado antes de leer reservación/dependencias; bloqueos y validaciones existentes conservados |
| Cancelación | `cancelarReservacion` y helper `ConDb` | Igual; conserva mínimo de pasajeros, motivo y no-op de cancelación previa |
| Asignar/quitar transporte | `asignarTransporteReservacion` | Candado previo a descubrir origen/destino; comprobaciones de capacidad y compatibilidad actuales |
| Alta de operación | `crearOperacion` | Nueva transacción corta que incluye INSERT y lectura final |
| PATCH de operación | `actualizarOperacionParcial` | Candado previo; relectura de membresía después de tomar bloqueos |
| Alta de transporte | `crearTransporte` | Nueva transacción corta que incluye INSERT y lectura final |
| PATCH de transporte | `actualizarTransporteParcial` | BEGIN protegido antes del transporte, operaciones y vehículo |
| Capacidad de vehículo | `actualizarVehiculoParcial` | BEGIN protegido antes de leer vehículo y transportes afectados |
| Aplicaciones manuales GYG/FH | Nuevas reservas, modificaciones y cancelaciones que usan el pool central y helpers de reservaciones | Su BEGIN queda protegido antes de bloquear eventos o reservaciones; archivos de integraciones sin cambios |

El INSERT de un vehículo nuevo continúa sin dependencias asignadas y con el CHECK existente de capacidad. No se alteraron catálogos, reglas comerciales o escritores de captura. En los cinco servicios auditados, las modificaciones SQL de las tablas operativas están concentradas en los servicios enumerados. Las aplicaciones manuales reutilizan esos helpers dentro de su transacción exterior.

## 2. Riesgos reproducidos y no reproducidos

Evidencia anterior completa: `C:\Users\luisg\AppData\Local\ctsk-standalone-0d24490bcb81\operational-verification.json`, `mode=Baseline`, `completed=true`, `postgresStopped=true`.

| Caso con servicios anteriores | Observación real |
|---|---|
| Cambiar fecha de operación vacía mientras se asigna su primera reservación | Se pausó la operación después de leer membresía vacía; la asignación confirmó; al continuar, la operación cambió de fecha y quedó una reservación incompatible. Reproducido |
| Ciclo entre recursos | Tres conexiones: transporte retiene su fila, vehículo retiene la suya y asignación obtiene parte de transportes. Se comprobaron esperas mediante `pg_blocking_pids`; PostgreSQL devolvió `40P01`. Reproducido |
| Colisión de código de reservación | El RNG del proceso de prueba generó un código ya existente. El servicio capturó `23505` y el siguiente INSERT devolvió `25P02`. Reproducido |
| Dos reservas por el último lugar | La protección existente impidió el segundo ingreso; no se reprodujo sobrecupo en ese orden |
| Cancelación contra cambio de PAX | La protección existente impidió dejar el vehículo con menos de dos pasajeros activos |
| Dos asignaciones de una misma reservación | Ambas se serializaron; la segunda prevaleció. No apareció incompatibilidad, pero sigue existiendo pérdida de intención del formulario antiguo |

Los escenarios utilizan clientes PostgreSQL distintos y barreras colocadas antes/después de consultas concretas. Las esperas se comprueban con los PID reales; no se deduce concurrencia únicamente de `Promise.all` ni de un retraso fijo. El ciclo de interbloqueo requiere tres transacciones, sin necesitar tres computadoras.

La incompatibilidad del primer ensayo se reparó únicamente en su fixture sintético para poder comprobar los demás casos. No hubo reparación de datos reales. El modo `Baseline` expresa las expectativas de las fuentes anteriores: **no desactiva protecciones** y no debe usarse con las fuentes finales para simular código antiguo.

## 3. Protocolo implementado

Nuevo módulo: `backend/config/operationalTransactions.js`.

1. El pool central instala un decorador de cliente mediante el evento `connect`, antes de entregarlo al servicio, solo para la configuración privada desechable.
2. Cada `BEGIN` normal de ese pool inicia la transacción, fija aislamiento `READ COMMITTED` para el laboratorio y `SET LOCAL lock_timeout='2000ms'`.
3. Antes de devolver el resultado del BEGIN, adquiere `pg_advisory_xact_lock(1129599827,201)`, el mismo candado para todas las transacciones de escritura del laboratorio.
4. Solo entonces se consultan dependencias y se toman los bloqueos de filas ya existentes, conservando el orden ascendente de IDs donde estaba definido.
5. En cambios de grupo operativo se vuelve a leer la membresía bajo los bloqueos; se validan compatibilidad, sumas y reglas actuales antes de escribir.
6. Datos y bitácora permanecen en el mismo `pg.Client`. COMMIT o ROLLBACK liberan el candado automáticamente.

No se impuso un orden nuevo por familia de tablas. El **primer bloqueo común** impide que dos participantes compitan entre sí reteniendo recursos en órdenes diferentes. Se conservan los bloqueos de filas y las restricciones existentes como defensa adicional.

El candado es transaccional, no de sesión. Un rollback a un savepoint no lo libera cuando fue adquirido antes del savepoint; el fin de la transacción exterior sí. No hay renovación, sesión permanente ni transacción abierta mientras el usuario edita. Las nuevas altas de operación/transporte contienen solo INSERT y consulta final.

Por cobertura de los aplicadores manuales sin editar integraciones, en laboratorio se protegen TODOS los BEGIN de escritura explícitos del pool, incluidos otros servicios que usen ese patrón. Las lecturas autocommit y `BEGIN READ ONLY` de verificación no toman ese candado. Es una serialización deliberadamente amplia para esta fase; medir latencia antes de cualquier promoción u optimización.

El decorador conserva consultas con promesas, callbacks y objetos de configuración. También encola los comandos callback para que no adelanten al candado. Si falla BEGIN, revierte y rechaza comandos ya pendientes hasta un ROLLBACK explícito del llamador: evita que un UPDATE pendiente termine ejecutándose en autocommit. No acepta lotes ambiguos de BEGIN.

Los errores conocidos `55P03`/`40P01` del laboratorio se marcan como conflicto 409, con mensaje de consultar el estado antes de guardar otra vez. No se repite la solicitud. El controlador de aplicación manual maneja también ese resultado del BEGIN. Los errores de red siguen siendo potencialmente inciertos; esta fase no introduce idempotencia.

La coordinación requiere que los escritores utilicen el pool y una transacción protegida. SQL directo de otros programas no participa. En el laboratorio solo se usó SQL directo para preparación sintética, observación y provocación deliberada de contención.

## 4. Colisiones de código

Solo en el laboratorio, el INSERT usa:

```sql
ON CONFLICT ON CONSTRAINT reservaciones_codigo_key DO NOTHING
```

Cuando no devuelve fila, se genera el siguiente código dentro de la misma transacción todavía válida. Se mantiene el límite de cinco candidatos. Una colisión no crea bitácora; una creación aceptada genera exactamente una entrada. Si los cinco candidatos colisionan, se revierte la transacción completa sin nuevas reservaciones ni bitácoras.

No se agregó retry de HTTP, de comandos operativos o de errores de conexión. El reintento acotado se refiere exclusivamente a elegir un código aún no insertado. Otras restricciones únicas conservan sus errores. La rama heredada conserva su SQL anterior hasta una futura promoción autorizada.

## 5. Archivos de esta fase

Modificados respecto al inicio, conservando cambios previos:

- `backend/config/database.js`: instalación condicional del decorador del pool.
- `backend/services/reservaciones.service.js`: INSERT seguro ante colisión, activado solo en laboratorio.
- `backend/services/operaciones.service.js`: alta transaccional aislada y relectura de membresía bajo bloqueo.
- `backend/services/transportes.service.js`: alta transaccional aislada.
- `backend/utils/dbErrors.js`: respuesta de conflicto exclusivamente para errores marcados de laboratorio.
- `backend/controllers/eventosIntegracion.controller.js`: respuesta de contención del laboratorio para aplicaciones manuales, sin tocar los adaptadores de proveedor.
- `readme.md`: referencia a este informe.

Nuevos:

- `backend/config/operationalTransactions.js`: activación, candado transaccional, cola pg y creación atómica.
- `backend/__tests__/operationalTransactions.test.js`: 24 pruebas aisladas del contrato nuevo.
- `scripts/OperationalLab.ps1`: carpeta nueva con ACL privada y proceso con entorno limpio.
- `scripts/operationalLab.cjs`: provisión nueva, comprobaciones de aislamiento, ejecución y cierre.
- `scripts/operationalCases.cjs`: escenarios con servicios reales, conexiones independientes, barreras y observación PostgreSQL.
- `scripts/operationalAdditionalCases.cjs`: rollback, timeouts, savepoints, capacidad de vehículo y aplicaciones manuales sintéticas.
- Este informe y `docs/local-fase-2c1-verification.json`.

`capacidad.service.js` y `vehiculos.service.js` se revisaron y conservaron íntegros: no requieren otra implementación de reglas; su transacción de modificación participa a través del pool central. Permanecen íntegros los archivos de FareHarbor/GetYourGuide, esquema, roles, frontend y Electron.

## 6. Resultados finales

| Verificación | Resultado |
|---|---|
| Jest con pg bloqueado y barrera de red | **498/498**, 17 suites, cero fallas finales. Incluye 352 casos anteriores, 24 del módulo nuevo y pruebas existentes adicionales de capacidad/aplicación manual |
| Servicios reales y PostgreSQL nuevo | **13 escenarios aprobados**, con cinco invariantes finales en cero: incompatibilidades, sobrecapacidad de transporte/vehículo, operación >12, contexto >24 y vehículo con menos de dos pasajeros activos |
| HTTPS loopback, Node/Electron/PostgreSQL reales | **13 grupos aprobados**, login/roles/alcance, certificados y firma, Centro/Web Locks, Daily PDF, reinicio y backend superviviente al cierre de Electron |
| independent-dev HTTP loopback real | Aprobado: autenticación, Electron, backend independiente y liberación del puerto |
| Componentes lan-lab | Paquete público y confianza aprobados; entradas reales rechazan la red no aislada antes de escucha/conexión/PG. Sin conexión LAN positiva |
| Modalidad heredada | Regresión aislada aprobada; configuración principal no activa la protección nueva. No se inició producción |
| Sintaxis | Node `--check`, parser PowerShell y `git diff --check` aprobados |

Los 13 escenarios operativos finales cubren:

1. Cambio de fecha de operación frente a primera asignación: se serializa y la asignación incompatible se rechaza.
2. Misma reserva con dos destinos: serialización y auditorías coherentes; última intención puede prevalecer.
3. Último lugar con grupo en 11 PAX y otro en 12: un ingreso alcanza 12/24, el otro se rechaza sin auditoría parcial.
4. Cancelación frente a reducción de PAX: conserva mínimo del vehículo y revierte el cambio inválido.
5. Transporte/vehículo/asignación: esperan en el candado común sin reproducir el ciclo anterior.
6. Una colisión seguida de código libre: una sola creación auditada.
7. Vehículo de tres plazas: no supera su capacidad aunque el máximo general sea 12.
8. Fallo inyectado antes de INSERT de bitácora: revierte el UPDATE anterior.
9. Fallo inyectado en lectura final de alta de operación/transporte: revierte sus INSERT.
10. Contención de dos segundos, ausencia de retry, rechazo de UPDATE callback encolado tras BEGIN fallido, reutilización limpia del pool, liberación en commit/rollback y conservación a través de savepoint.
11. Aplicador manual real GYG con evento sintético aprobado: espera antes de consultar evento, cancela y audita una vez; repetición no vuelve a cancelar.
12. Aplicador manual real FH: rechazo sin aprobación y con huella falsa; espera antes de bloquear evento; aplicación válida y una sola auditoría.
13. Cinco colisiones seguidas: límite respetado y rollback limpio.

Son 13 escenarios, no 13 aserciones individuales. No deben sumarse como si fueran casos Jest. La prueba de fallo de lectura final verifica las nuevas transacciones; no se presenta como reproducción histórica independiente del código anterior.

Evidencia final:

- Antes: `C:\Users\luisg\AppData\Local\ctsk-standalone-0d24490bcb81\operational-verification.json`.
- Después: `C:\Users\luisg\AppData\Local\ctsk-standalone-268f776470fe\operational-verification.json`.
- HTTPS: `C:\Users\luisg\AppData\Local\ctsk-standalone-726bcaf0b7ed\https-verification.json`; PDF sintético en `client\daily-synthetic.pdf`.
- HTTP: `C:\Users\luisg\AppData\Local\ctsk-standalone-d098f7061de1\verification.json`.
- Componentes LAN: `C:\Users\luisg\AppData\Local\ctsk-standalone-c0dfb97ee9fe\lan-components-verification.json`.
- Resumen portable: `docs/local-fase-2c1-verification.json`.

Para repetir el laboratorio desde una consola PowerShell limpia, en la raíz del repositorio:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\OperationalLab.ps1 -Mode Verify
```

Siempre genera otro directorio/clúster nuevo; no acepta una base existente. La conexión se permite solo después de comprobar directorio nuevo, ACL, binarios 18.3, puerto y clúster fuera de los protegidos, identidad y esquema. La barrera de salida admite únicamente 127.0.0.1 y ese puerto PostgreSQL. No ejecuta receptor, sincronizador, túnel o escucha HTTP/LAN durante los escenarios operativos. Finally cierra clientes/pool y detiene ese clúster por su directorio exacto.

Regresiones reales adicionales:

```powershell
.\scripts\HttpsLab.ps1 -Mode Verify
.\scripts\StandaloneDev.ps1 -Mode Verify
.\scripts\LanLab.ps1 -Mode VerifyComponents
```

La ejecución Jest usa `backend/__tests__/standalone.jest.config.cjs`, `--runInBand --runTestsByPath`, y solo las suites: `operationalTransactions`, `lanLab`, `httpsLab`, `standalone`, `release03aStartup`, `release03aPolicy`, `release03aProcesses`, `printBranding`, `notificaciones.electron`, `centroAvisos`, `centroAvisosTiming`, `accessScope.routes`, `capacidad.service`, `getyourguideReservationApplication.service`, `fareharborApplication.service`, `fareharborModificationApplication.service`, `fareharborCancellationApplication.service` (bajo `backend/__tests__/*.test.js`). No se ejecutó `npm test` global, `api.test.js` ni suites con TRUNCATE.

## 7. Problemas encontrados y límites pendientes

El primer ensayo completó sus casos pero su cierre rechazó las variables JWT/proveedor que el propio inicializador privado había agregado al proceso. Se detuvo manualmente SOLO ese clúster mediante el wrapper existente y su manifiesto. El harness ahora restablece su entorno de lanzamiento al cerrar, después de terminar las conexiones. La reproducción posterior completa quedó registrada.

Un mock de prueba no manejaba el objeto de consulta pg; se corrigió el mock. Una prueba adicional detectó que el adaptador nuevo debía invalidar comandos encolados tras un BEGIN fallido. Se corrigió el adaptador, se ajustaron dos pruebas para exigir ROLLBACK explícito y se volvió a ejecutar tanto el caso con PostgreSQL real como las 17 suites. No se relajaron controles ni se modificó el frontend para aprobar pruebas. El resultado final es cero fallas.

Pendientes dentro/fuera de alcance:

- **Ediciones obsoletas:** dos solicitudes válidas sobre la misma reserva todavía pueden ejecutarse una tras otra y prevalecer la última. No hay revisión del formulario en esta fase.
- **Resultados inciertos:** no hay claves de comandos ni recuperación de borradores; no repetir automáticamente una escritura tras perder respuesta.
- **Dos equipos físicos:** no se probó LAN positiva, firewall, desconexión física ni rendimiento real entre máquinas. Las conexiones PostgreSQL independientes de estos ensayos están en el mismo equipo aislado por clúster y loopback.
- **Cobertura cooperativa:** un escritor SQL fuera del pool protegido puede competir sin tomar el candado. No se promete ausencia universal de interbloqueos para programas ajenos.
- **Rendimiento:** el candado es global por base para las transacciones del laboratorio; no optimizarlo por grupo sin otra prueba de corrección. Los dos segundos de contención son una política de laboratorio, pendiente de revisión empresarial.
- **Fuentes/manifiestos:** cambiar código invalida las huellas anteriores; preparar un laboratorio nuevo y detener los procesos antes de editar. No recalcular a mano hashes de un manifiesto antiguo para evitar controles.

## 8. Conservación de reglas y producción

No se modificaron restricciones de 12/24 PAX, menor capacidad real de vehículo, mínimo de dos pasajeros cuando corresponde, compatibilidad fecha/tour/turno, roles, permisos, bitácora o aprobación manual. El alta de reservaciones sigue sin ampliar el límite de organización operativa a todas las reservas no asignadas.

No se accedió a `sian_kaan_reservaciones`, no se leyó `.env` productivo y no se usaron credenciales/datos reales. No hubo migración o cambio de esquema productivo, columnas de revisión o tablas de comandos. El esquema existente se creó exclusivamente en bases nuevas y vacías mediante el provisionador ya autorizado.

No se modificaron archivos, tareas, procesos, tokens, certificados ni configuraciones reales de FareHarbor/GetYourGuide/ngrok; tampoco firewall, router, red operativa, servicios Windows o instaladores. Los ensayos de aplicaciones manuales son llamadas a servicios locales con registros sintéticos, sin ejecutar capturas ni realizar solicitudes a proveedores.

Se verificó el cierre de los diez clústeres creados en todos los intentos de esta tarea: `1bb839b41228`, `0d24490bcb81`, `ec2e0972f305`, `130277226b2e`, `123720d83522`, `3c8223d9869d`, `6d9ebb1a87f4`, `268f776470fe`, `726bcaf0b7ed`, `d098f7061de1`. Ninguno conserva `postmaster.pid`. Se comprobaron sus veinte puertos registrados: **cero listeners activos**. Los dos ensayos de componentes LAN no iniciaron PostgreSQL. Las carpetas privadas se conservaron como evidencia.

Comparación contra el inicio: 677 archivos anteriores; **670 íntegros, siete modificados por esta fase, ninguno perdido**. Integraciones, esquema y cambios locales previos ajenos permanecen intactos. No se usaron operaciones destructivas de Git.

## 9. Reversión

Los verificadores detienen sus clústeres en finally. Para esta ejecución no queda un servicio nuevo en marcha, regla de firewall, CA global, migración productiva o tarea Windows que retirar. La modalidad principal no activa el cambio de laboratorio.

Para retirar la implementación, revisar solo los siete archivos modificados y los nuevos listados en este informe, conservando el trabajo previo. No usar reset/clean ni restaurar archivos completos al HEAD: existían modificaciones locales sin commit. No se requieren cambios de esquema ni recuperación de producción.

Si se interrumpe externamente un laboratorio antes de su cierre, usar su ruta exacta y el wrapper de Fase 1, sin editar fuentes previamente:

```powershell
.\scripts\StandaloneDev.ps1 -Mode Stop -Manifest 'RUTA_PRIVADA_DEL_ENSAYO\manifest.json'
```

Después comprobar ausencia de PID y del listener de ese manifiesto. No detener PostgreSQL por nombre de proceso ni por servicio. Las evidencias pueden conservarse; no borrar directorios por patrones. Volver a probar una versión anterior requiere otra base sintética nueva y su contrato de integridad autorizado.

## 10. Recomendaciones para Fase 2C.2

1. Revisar esta implementación y aceptar el protocolo común antes de su promoción fuera del laboratorio.
2. Diseñar y autorizar las revisiones de registro/precondiciones para evitar última escritura sobre formularios obsoletos; no confundir la serialización actual con control optimista.
3. Aprobar aparte cambios de esquema, tratamiento de conflictos y UI que conserve el borrador. No añadirlos como extensión silenciosa de 2C.1.
4. Diseñar el registro durable de comandos y política de reintentos en una etapa explícita; mantener por ahora la prohibición de reenvío automático.
5. Mantener revisión/aplicación humana y huellas existentes de eventos externos, con regresiones de cambios locales contra aplicación manual.
6. Disponer de dos equipos/red realmente aislados antes de ensayos físicos, carga, interrupción y reversión de firewall. No instalar ni desplegar en computadoras de la empresa con estos artefactos.
