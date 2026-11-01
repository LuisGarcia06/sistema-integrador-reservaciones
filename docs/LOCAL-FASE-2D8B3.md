# Fase 2D.8B.3 — Auditoría desde formularios originales hasta Bitácora

Estado: COMPLETADA EN LABORATORIO. Fecha: 28 de octubre de 2026.

Se integraron Operaciones, Transportes y observaciones generales del Daily con la auditoría transaccional 021. La pantalla original de Bitácora consulta y presenta registros históricos y estructurados. La activación es explícita y exclusiva del laboratorio; la aplicación principal y producción no fueron iniciadas.

## Resultados

| Verificación | Resultado final | Evidencia en `docs/local-fase-2d8b3/` |
| --- | --- | --- |
| Jest aislado | 1,053 aprobadas; 36 suites; cero fallos | `jest-final.json`, `jest-final.log` |
| Electron + HTTP + PostgreSQL 021 integrados | 16 grupos aprobados; 366 solicitudes | `integrated-verification.json`, `audit-ui-checks.json` |
| Auditorías del recorrido integrado | 13; 13 pruebas de mismo cliente/PID/transacción | `integrated-verification.json` |
| Comandos del recorrido integrado | 17, incluidos rechazos y solicitud sin efecto | `integrated-verification.json` |
| Fallos reales de auditoría desde UI | Operaciones, Transportes y Daily: rollback completo | `integrated-verification.json`, `audit-frontend-api.log` |
| Regresión API 021 anterior | 44 grupos; 161 solicitudes; 17 auditorías; siete rollbacks | `api-regression.json` |
| Regresión protocolo 020 anterior | 22 grupos; cobertura de sus 25 escritores protegidos | `commands-regression.json` |
| Verificador original de esquema 021 | 94 comprobaciones | `schema-regression.json` |
| Reservaciones original, Electron/HTTP/PostgreSQL | 38 grupos | `reservation-regression.json` |
| Operaciones original 020 | 17 grupos | `operation-regression.json` |
| Transportes original 020 | 17 grupos | `transport-regression.json` |
| Daily original 020 | 16 grupos | `daily-regression.json` |
| PDF e impresión | PDF real; cuatro hojas originales; impresión interceptada; cero trabajos físicos | `daily-export-1.pdf`, `audit-ui-checks.json` |
| Cierre | 13 clústeres detenidos; 35 puertos registrados sin listeners; cero procesos asociados | `labs.json`, `closure.json` |

Las cifras de distintas ejecuciones no se suman como escenarios únicos. El ensayo integrado final utilizó el clúster `ctsk-standalone-f03ac405d591`; sus 13 auditorías son distintas de las 17 del ensayo de regresión API.

## Inspección, alcance y preservación

Se revisaron AGENTS.md, los informes 2D.8B.1/2D.8B.2 y los contratos, controles y laboratorios anteriores de formularios y consultas. El diseño 2D.8A figura como antecedente en 2D.8B.1; no se encontró un informe independiente de esa fase entre los documentos versionados disponibles. Se usó el esquema 021 existente como contrato verificable.

Se inspeccionaron los formularios originales, adaptadores de comandos, panel de recibos, comparador, controladores, validadores, consulta/escritor de Bitácora, políticas de perfiles y aprovisionador. El inventario de solicitudes quedó materializado en las listas cerradas de `backend/config/auditFrontendPolicy.js` y `scripts/auditFrontendPolicy.cjs`.

Los cambios locales previos y archivos sin seguimiento se conservaron. `before/` contiene las versiones anteriores de los archivos seleccionados, con sus cambios locales ya existentes. `git-status-before.txt` registra el estado inicial. El inventario `source-baseline.json` se tomó durante la implementación, tras introducir los primeros archivos de esta fase; no se presenta como una fotografía completa anterior a toda edición. `baseline.json` y los respaldos selectivos sí preceden a las modificaciones de sus archivos originales.

`source-verification.json` compara el inventario de 542 archivos y acredita que las diferencias pertenecen a los archivos declarados. Sus 15 archivos protegidos siguen idénticos, incluidos `frontend/index.html`, `backend/server.js`, `electron/main.js`, `database/schema.sql`, migraciones 018–021 y políticas/verificadores de esquema y comandos. Los cambios que esos archivos ya tenían al comenzar siguen presentes.

No se ejecutaron reset, clean, restauraciones masivas, commits, instaladores ni despliegues.

## Archivos modificados

| Archivo | Cambio de esta fase |
| --- | --- |
| `backend/auditApi.js` | Opción interna explícita para componer la interfaz experimental |
| `backend/revisionApiApp.js` | Montajes de lectura optativos, política HTTP nueva y existencia Daily en la foto autorizada |
| `backend/services/bitacora.service.js` | Proyección estructurada condicionada a auditoría 021; consulta histórica conservada |
| `frontend/js/commandLab.js` | Protocolo optativo 021, validación del motivo y existencia Daily explícita |
| `frontend/js/revisionConflict.js` | Motivo conservado fuera del comparador de diferencias comerciales |
| `frontend/js/operationCommands.js` | Convivencia optativa con Transportes; bloqueo del textarea de motivo junto al comando |
| `frontend/js/transportCommands.js` | Convivencia optativa con Operaciones; movimientos de reservas siguen bloqueados |
| `frontend/js/dailyCommands.js` | Motivo, obligatoriedad según existencia/cambio y conservación al revisar |
| `frontend/pages/operaciones.js` | Campos en los formularios originales de operaciones y transportes; cuerpos diferenciales; exclusión de ediciones simultáneas |
| `frontend/pages/bitacora.js` | Recursos, snapshots, motivo, nombre histórico y descarte de respuestas de sesiones anteriores |
| `scripts/commandFrontendHost.cjs` | Ámbito optativo 021 con política/protocolo propios, PDF y retención privada de lecturas |
| `backend/__tests__/consultationFrontend.test.js` | Retirar la expectativa de identidad textual de Bitácora, cuya ampliación fue autorizada |

La comparación histórica de Bitácora se reemplazó por pruebas semánticas en la suite nueva: HTML de la pantalla anterior y filas históricas conservados, además de pruebas específicas del formato estructurado. No se relajó ningún verificador de perfil, esquema, huella o manifiesto.

## Archivos nuevos de implementación y pruebas

| Archivo | Función |
| --- | --- |
| `backend/config/auditFrontendPolicy.js` | Lista cerrada de lecturas para esta integración |
| `backend/auditFrontendApi.js` | Entrada HTTP experimental explícita |
| `frontend/js/auditUi.js` | Campo y validación compartidos del motivo; selección optativa del protocolo |
| `frontend/lab/auditoria.html` | Entrada experimental que carga las páginas originales |
| `frontend/lab/auditoria.js` | Navegación limitada a Operaciones, Daily y Bitácora; invalidación de sesión |
| `scripts/auditFrontendPolicy.cjs` | Assets exactos y política HTTP del host de ensayo |
| `scripts/auditFrontendProbe.cjs` | Instrumentación SQL y fallos privados por IPC, exclusiva del corredor |
| `scripts/auditFrontendDriver.cjs` | Escenarios Electron reales sobre los formularios originales |
| `scripts/auditFrontendLab.cjs` | PostgreSQL nuevo, fixtures sintéticos, verificación, coordinación y cierre |
| `scripts/AuditFrontendLab.ps1` | Directorio privado nuevo, entorno limpio y ejecución sin ventana |
| `backend/__tests__/auditFrontend.test.js` | Pruebas de contrato, validación Unicode, existencia y presentación compatible |

Se agregan este informe y los respaldos, informes JSON, logs, capturas y PDF de evidencia. `reversion-manifest.json` enumera los 12 archivos modificados y 11 nuevos de implementación/pruebas con SHA-256.

## Formularios y motivo

Los formularios pertenecen a las páginas originales. No se crearon versiones alternativas de captura.

Operaciones conserva fecha, tour, turno explícito, grupo, primera hora, guía, estado y Preparar sugerencia. Transportes conserva la operación seleccionada, operador, vehículo cuando corresponde en el formulario original, estado y observaciones del operador. El alta original de transporte sigue sin asignar vehículo o pasajeros automáticamente.

El campo **Motivo del cambio** se muestra únicamente cuando la entrada experimental carga `auditUi.js`. Es opcional en altas y obligatorio para cambios efectivos. Se cuentan puntos de código Unicode, hasta 500; se rechazan blancos y tipos incorrectos. El textarea evita el límite UTF-16 de `maxlength`, que impediría capturar 500 emojis. El backend existente vuelve a validar y normaliza el motivo al registrarlo.

El motivo no participa en las diferencias comerciales. Si el formulario de operación/transporte no tiene diferencias efectivas, informa que no hay cambios y no envía una escritura adicional. El backend conserva su comportamiento sin efecto para solicitudes idénticas o con motivo solamente. El motivo completo sí forma parte del cuerpo confirmado, la foto de creación, el sobre inmutable y la huella HMAC de idempotencia. No se agrega ninguna columna comercial ni se reutilizan las observaciones del operador como motivo.

Daily conserva su control de observaciones de 2D.6. Su GET puede devolver texto vacío tanto con fila como sin ella. La foto autorizada experimental añade `existe`, obtenido de la fila real dentro de la misma transacción que construye ETag/contexto. El cliente exige que sea booleano; una foto 021 sin esa información es incompatible. La creación de una fila vacía produce CREAR; guardar de nuevo el texto idéntico produce recibo sin IDs de Bitácora y conserva la fila/timestamp; modificar el texto exige motivo.

El motivo nunca se incorpora al Daily operativo, PDF o impresión. `frontend/pages/daily.js`, el formato original, sus estilos y el IPC/preload de Electron no requirieron modificaciones.

## Protocolo, concurrencia, idempotencia y recuperación

Perfil: `audit-api-lab`. Esquema: `021`. Protocolo: `ctsk-audit-api-v1`. Los manifiestos siguen usando el contrato estricto de 2D.8B.2 y sus verificadores originales.

La adaptación compartida es optativa: sin `auditUi.js`, `commandLab` sigue usando `ctsk-command-api-v1`. La entrada principal no carga la nueva adaptación. La entrada `auditApi.js` anterior conserva sus rutas cerradas por defecto, incluida la denegación de GET Bitácora; `auditFrontendApi.js` activa explícitamente la ampliación de lecturas.

Las altas validan y solicitan confirmación antes de obtener precondiciones para el cuerpo completo confirmado y antes de generar UUIDv4. La foto valida método/ruta/protocolo/generación/ETag/contexto. Las ediciones conservan su foto original autorizada. El comando congela generación, clave, método, ruta, cuerpo, motivo, ETag y contexto.

La contienda de dos administradores produjo un éxito y un rechazo 412. Un cambio en otro recurso produjo 409 de contexto. Los controles conservan la propuesta y el motivo. El comparador presenta original, propuesta y actual autorizado; muestra el motivo conservado por separado. Solo la decisión humana de revisar obtiene nuevas precondiciones, y el siguiente envío exige otra confirmación y UUID. No hay sobrescritura automática.

Los duplicados HTTP conservan un comando y una auditoría. Alterar el motivo con la misma clave devuelve `CLAVE_IDEMPOTENCIA_REUTILIZADA`. No se introdujo reenvío automático.

Se truncó la respuesta después de COMMIT en los tres formularios. Cada caso recuperó el recibo original mediante GET `/api/comandos/:clave`, incluso tras reiniciar el backend, manteniendo una sola escritura y la foto/sobre iniciales. El recibo no se convierte en precondición; la consulta actual del recurso sigue siendo una acción separada.

Un corte antes del envío dejó resultado desconocido: no se creó comando ni auditoría y la interfaz mantuvo propuesta/motivo/clave, bloqueando otro guardado, cierre o navegación. Los fallos SQL de auditoría desde UI también permanecieron desconocidos en recuperación; ese resultado no se presenta como prueba de rollback al usuario.

## Bitácora y permisos

La consulta mantiene su orden `fecha DESC, id_bitacora DESC` y filtros `fecha_desde`/`fecha_hasta`, con SQL parametrizado. En 021 proyecta versión, referencia del recurso, instante, snapshots, motivo y nombre histórico. Fuera de ese perfil utiliza las columnas históricas existentes.

Reservaciones conserva código, identificador, usuario, fecha/hora, acción y descripción. Los registros estructurados muestran Operación o Transporte con su ID, o Daily con fecha operativa, además de anterior/nuevo y motivo. Los snapshots pueden desplegarse en la misma celda. El nombre usa `usuario_nombre_snapshot` cuando está disponible y recurre al usuario actual para registros históricos que no lo poseen. Los textos libres y JSON se escapan antes de insertarse como HTML.

El registro histórico de prueba fue sembrado explícitamente antes de aplicar 021 en el clúster nuevo. Se verificó que conserva su ID y reservación al consultar después. Esto prueba compatibilidad sintética; no se migraron ni inventaron auditorías para datos reales. No se muestra el ledger como otra Bitácora ni se añadió un escritor independiente de auditoría.

| Identidad | GET Bitácora | Cinco escritores | Recuperación de escritura |
| --- | --- | --- | --- |
| Administrador autorizado | Permitido | Protegidos por confirmación/precondiciones/comando | Solo según autorización vigente y actor original |
| Consulta all | 403 | 403 | Denegada |
| Consulta selected | 403 | 403 | Denegada |
| Consulta sin plataformas | 403 | 403 | Denegada |

Las rutas originales mantienen autenticación y autorización backend. La suite integrada retuvo una respuesta de Bitácora ya autorizada, cerró sesión o degradó al usuario sintético y después liberó la respuesta: no reaparecieron filas. La página comprueba versión de sesión, permiso, ruta y solicitud vigente; al invalidarse la sesión vacía los datos. La regresión API también verifica revocación durante la espera del candado y recuperación denegada tras el cambio de permisos.

## Atomicidad y aislamiento

Los escritores siguen siendo los servicios reales de 2D.8B.2. No se modificaron en esta fase. El probe registra cliente, PID y `pg_current_xact_id()` durante negocio, auditoría y ledger. Las 13 auditorías confirmadas de UI comparten esos tres elementos dentro de la transacción exterior; el informe incluye sus claves e IDs.

Se inyectó un error SQL real al insertar auditoría en cada recurso desde su formulario. Los SHA-256 de todas las tablas funcionales, Bitácora y comandos fueron idénticos antes/después. No persistieron cambio comercial, revisión, timestamp, auditoría o comando. La regresión API agregó sus siete puntos de fallo ya existentes, incluidos fallos de ledger y restricciones diferidas. Las inyecciones solo se reciben por IPC privado en scripts de laboratorio; no existe endpoint HTTP de fallos.

Cada ejecución creó un directorio privado y clúster PostgreSQL 18.3 nuevo, identidad propia, base sintética y claves distintas. El aprovisionador comprobó que el clúster era nuevo antes de crear la base y aplicar migraciones. No se conectó a `sian_kaan_reservaciones`, no se leyó `.env` y no se usaron credenciales reales. La conexión backend sigue centralizada en `backend/config/database.js`.

HTTP/API/UI y PostgreSQL escucharon exclusivamente en 127.0.0.1. El corredor registra destinos loopback propios; el backend restringe red al PostgreSQL de su manifiesto y Electron limita las solicitudes a su origen. El host tiene assets exactos, rechaza parámetros extra/duplicados y no sirve `frontend/index.html`.

Los únicos escritores son POST/PATCH de Operaciones y Transportes y PUT de observaciones Daily por fecha. Las lecturas adicionales son sesión, catálogos requeridos, listas/detalles/sugerencias operativas por fecha, transportes por operación, Daily, recuperación y Bitácora. Reservaciones, Usuarios, Catálogos e Integraciones no pueden escribirse en este perfil. No se cambiaron roles ni reglas de capacidad: 12 por grupo/transporte y 24 por tour/turno; PAX incluye niños.

No se modificaron servicios/tareas Windows, firewall, router, puertos LAN, certificados, ngrok o integraciones reales. Los 13 clústeres —incluidos los intentos fallidos de desarrollo— quedaron detenidos. `closure.json` registra 35 puertos sin listeners y cero procesos asociados.

## Cobertura de los 37 puntos solicitados

| Puntos | Comprobación y evidencia |
| --- | --- |
| 1–3 | Alta/edición Operaciones, motivo y sugerencia: recorrido integrado y regresión Operaciones |
| 4–5 | Alta/edición Transportes y motivo separado: recorrido integrado y regresión Transportes |
| 6–8 | Daily ausente/existente/modificado/sin efecto: recorrido integrado; no-ops de los tres recursos en API 021 |
| 9 | Formularios originales: DOM real y regresiones de identidad HTML fuera de la adaptación |
| 10–12 | Motivos ausentes/blancos/tipos inválidos/largos, Unicode500/HTML y huella: Jest, UI y API 021 |
| 13–15 | Dos administradores, 412/409, propuesta/motivo conservados y revisión humana: UI y API |
| 16–20 | UUID indebido, duplicación, respuesta perdida después de COMMIT, recuperación y desconocido bloqueante: UI y API |
| 21–22 | Capacidad rechazada sin auditoría de éxito; error SQL de auditoría con rollback: UI y API |
| 23–29 | Historia Reservaciones, tres recursos, snapshots, nombre histórico, filtros y orden: Bitácora original con HTTP/PostgreSQL y Jest |
| 30–31 | Consulta all/selected/sin plataformas y respuestas tardías tras logout/revocación: UI; revalidación backend en API |
| 32–33 | Escritores/lecturas/assets cerrados, destinos propios y clústeres nuevos: políticas, trazas y cierre |
| 34–35 | Perfil 020: 22 grupos; esquema 021: 94 comprobaciones; API 021 anterior: 44 grupos |
| 36 | Regresiones Electron/HTTP/PostgreSQL de Reservaciones/Operaciones/Transportes/Daily: 38/17/17/16 grupos |
| 37 | PDF real, cuatro hojas, impresión interceptada y ausencia de motivos en impresión: UI final y regresión Daily |

## Ejecución y límites

Desde la raíz, ejecutar:

```powershell
powershell.exe -NoProfile -NonInteractive -File scripts/AuditFrontendLab.ps1 -Mode Verify
```

Verify siempre crea un directorio privado nuevo y cierra sus procesos al finalizar. No admite una base existente como destino de migración. Requiere los binarios de PostgreSQL 18.3 y Electron del entorno de laboratorio. El arranque normal experimental, si se necesita para una inspección autorizada, es `backend/auditFrontendApi.js --manifest <manifiesto privado verificado>`; nunca `backend/server.js` ni la entrada Electron principal.

No quedan escenarios obligatorios bloqueados en la ejecución final. Los intentos 1 y 2 detectaron una guarda de red del corredor que encadenaba la restricción de aprovisionamiento y bloqueaba su propio proxy; el primer error también motivó registrar errores del observador durante el cierre. El intento 3 omitía el estado requerido en la captura sintética de alta de transporte. El intento 4 enviaba la prueba de permisos sin sobre, por lo que el proxy devolvía 428 antes de llegar a la autorización; se corrigió el ensayo para usar sobre completo y obtener 403 real. Los intentos 5 y final aprobaron. Las capturas finales esperan el pintado de Electron; los intentos previos no se presentan como evidencia visual final.

El entorno aislado del ejecutor no pudo iniciar; las operaciones de shell se ejecutaron con la escalación revisada por la herramienta. Eso no cambió los destinos ni las restricciones de los laboratorios.

La prueba no constituye aceptación productiva, prueba LAN entre equipos ni validación de datos reales. Los borradores continúan solo en memoria. No se inició la siguiente fase.

## Reversión selectiva y siguiente fase

1. Detener exclusivamente cualquier laboratorio propio que siga activo y conservar sus evidencias. La entrega actual ya acredita el cierre.
2. Consultar `reversion-manifest.json`. Verificar que el SHA actual de cada archivo modificado coincide con `currentSha256`. Si hay diferencias posteriores, detener la restauración de ese archivo y realizar una revisión selectiva.
3. Restaurar únicamente los 12 archivos declarados desde sus rutas `before/`. Esos respaldos incluyen los cambios locales anteriores a esta tarea. No restaurar archivos ajenos ni usar reset/clean.
4. Retirar los 11 archivos nuevos solo después de comprobar sus SHA y que ninguna fase posterior dependa de ellos. Conservar informes y respaldos para trazabilidad.
5. No ejecutar DOWN, borrar auditorías ni adaptar una base existente a otro perfil. Para volver a 020, crear otro clúster sintético nuevo con su entrada y contrato originales.

Para Usuarios y Catálogos, se recomienda autorizar una fase separada que defina por recurso los snapshots permitidos, cambios efectivos, motivo obligatorio, permisos y vínculo transaccional con comando/auditoría, conservando las pruebas de contraseña y alcance. Esta recomendación no habilita esos escritores en el perfil actual ni inicia su implementación.
