# Fase 2C.3B — idempotencia durable con transacción única estricta

Fecha local: 2026-10-27, America/Cancun. Proyecto: `A:\sistema-integrador-reservaciones`.

**Implementado y validado únicamente en laboratorio. No desplegado en producción.** La decisión aplicada es transacción única estricta: no hay admisión durable previa, cola de trabajo ni procesamiento en segundo plano. Las pantallas principales y el frontend experimental anterior no se migraron a este protocolo.

1. **Arquitectura implementada.**

Se agregó `command-api-lab`, con esquema 020 y protocolo `ctsk-command-api-v1`. La entrada nueva es `backend/commandApi.js`; reutiliza los controladores y servicios existentes a través de la API de laboratorio, sin montar frontend, receptores ni sincronizadores. El arranque verifica manifiesto, ACL, configuración, claves, código, identidad real, rol PostgreSQL, esquema base, 018, 019 y 020 antes de abrir el listener loopback.

Cada escritura autenticada valida clave, generación y protocolo; calcula la huella de la intención y abre una transacción. El BEGIN conserva el candado operativo de Fase 2C.1. Dentro del límite se releen usuario/rol y se busca el comando propio. Una coincidencia terminal autorizada devuelve el recibo sin volver a calcular precondiciones ni invocar al escritor. Una clave conocida con otra huella produce 409.

Para un comando nuevo se crea un savepoint interno, se consultan y verifican ETag/contexto, se comprueba acceso y se ejecuta el servicio. Las modificaciones, bitácora y INSERT final del comando usan el mismo `pg.Client` y un solo COMMIT exterior. Los BEGIN/COMMIT de servicios siguen convirtiéndose en savepoints. La respuesta se envía después del COMMIT.

Los rechazos conocidos 4xx, excepto autenticación/permisos y fallos de bloqueo, pueden registrarse como `rechazado` después de revertir el trabajo al savepoint. Los errores técnicos revierten la transacción completa. Un fallo de INSERT de comando o un fallo posterior a ese INSERT antes de COMMIT también revierte negocio y auditoría. No se persisten resultados confirmados de transacciones fallidas.

El registro de comandos queda fuera del contexto operativo global, que sigue usando exclusivamente la lista original de tablas de negocio. Por tanto, registrar un recibo no invalida por sí mismo las fotos de precondiciones de otras ediciones.

2. **Archivos modificados y nuevos.**

Se registraron hashes iniciales de 731 archivos. Solo cinco preexistentes cambiaron; 726 conservaron sus bytes y no se eliminó ninguno. Se conservaron archivos sin seguimiento y cambios locales anteriores. No se usaron operaciones destructivas de Git.

| Archivo preexistente modificado | Cambio |
|---|---|
| `backend/config/operationalTransactions.js` | Admite exclusivamente el perfil nuevo con esquema 020 y conserva las restricciones anteriores. |
| `backend/config/revisionApiTransactions.js` | Instala el adaptador en el perfil nuevo; agrega intento con savepoint, registro final acotado, captura de IDs de auditoría y lectura de recuperación READ ONLY. |
| `backend/revisionApiApp.js` | Selección explícita del nuevo contrato, despacho al servicio de comandos y endpoint de recuperación. El contrato anterior conserva sus ramas. |
| `scripts/standaloneDev.cjs` | Aprovisiona el perfil nuevo únicamente en directorio/clúster vacíos, aplica 020 y genera una clave separada de comandos. |
| `scripts/revisionFixtures.cjs` | Permite validar la identidad del perfil nuevo antes de instalar 019 en ese clúster nuevo. |

| Archivo nuevo de implementación/pruebas | Responsabilidad |
|---|---|
| `backend/commandApi.js` | Entrada Node independiente, verificación previa y listener 127.0.0.1. |
| `backend/config/commandApiPolicy.js` | Manifiesto v4, entorno, propósito, claves e identidad del perfil 020. |
| `backend/config/commandSchema.js` | Verificador exacto de columnas, restricciones, índices, trigger, función, permisos, generación y configuración de durabilidad. |
| `backend/config/commandSchemaContract.js` | Digest fijo del SQL 020 revisado. |
| `backend/models/comandos.model.js` | Acceso parametrizado al registro de comandos. |
| `backend/security/commandIntent.js` | Clave UUIDv4, generación/protocolo, HMAC canónico y comparación. |
| `backend/services/comandos.service.js` | Reconocimiento, autorización vigente, ejecución atómica, recibos y recuperación. |
| `database/migrations/020_comandos_idempotentes_lab.sql` | Tabla, permisos y guardia de generación/inmutabilidad. |
| `scripts/CommandApiLab.ps1` | Directorio nuevo privado y entorno de ejecución limpio. |
| `scripts/commandApiLab.cjs` | Aprovisionamiento, barrera de red, procesos de ensayo, reinicio y cierre. |
| `scripts/commandFixtures.cjs` | Aplicación de 020 solo en destino nuevo identificado y anclaje de generación. |
| `scripts/commandApiCases.cjs` | Ensayos HTTP/PostgreSQL reales y matriz de 25 escritores. |
| `scripts/commandApiServerProbe.cjs` | Fallos sintéticos y observación SQL de PID/transacción; no se carga en la entrada normal. |
| `backend/__tests__/commandApi.test.js` | Huella, ámbito, cabeceras y recibos mínimos. |
| `backend/__tests__/commandApiTransactions.test.js` | Cliente compartido, límites, rollback, auditoría y lectura protegida. |
| `backend/__tests__/commandApiPolicy.test.js` | Perfiles, esquema requerido y rechazo de destinos inseguros antes de conectar. |

También se agregaron este informe, `docs/local-fase-2c3b-before.json`, `docs/local-fase-2c3b-verification.json` y la carpeta `docs/local-fase-2c3b/` con resultado Jest, evidencia de cierre y copias iniciales de los archivos candidatos a cambios. Existe una copia de `database.js` entre esas copias preventivas, pero el archivo de trabajo no cambió.

No cambiaron `database/schema.sql`, 019, `backend/config/database.js`, autenticación, permisos comerciales, servicios de integración, Electron, frontend, package.json ni dependencias. La conexión sigue centralizada en `pg` mediante `database.js`.

3. **Migración de laboratorio.**

020 se aplica únicamente por el aprovisionador de un clúster nuevo, después de comprobar directorio vacío, identidad PostgreSQL y esquema precedente. El SQL se compara con un digest fijo incluido en el código. No se ejecutan migraciones durante el arranque del servidor ni contra destinos arbitrarios.

El manifiesto nuevo tiene versión 4, entorno `command-api-lab`, propósito `single-transaction-commands-lab`, protocolo propio, generación UUID y digests separados de `preconditions.key` y `commands.key`. La configuración exige 020, PostgreSQL 18.3, base sintética `ctsk_standalone_<12hex>_test`, rol limitado y sincronización deshabilitada.

El verificador base anterior conserva su lista exacta de tablas. Solo la política nueva valida primero la lista exacta base más `comandos_idempotentes` y después comprueba por separado los contratos base/019/020. No se convirtió la validación anterior en una aceptación de tablas arbitrarias. Los lectores de manifiestos anteriores rechazan el perfil nuevo; `schema-tests-only` permanece restringido.

4. **Tabla, estructura y permisos.**

`public.comandos_idempotentes` contiene generación UUID, usuario, clave UUID, versión, método, ruta, recurso, ID de recurso, huella HMAC de 64 caracteres, estado terminal, HTTP status, resultado JSONB mínimo, alcance/referencias JSONB, IDs de bitácora y fecha de registro TIMESTAMPTZ.

La PK es `(generacion_datos,id_usuario,clave)`. Método y ruta no están en esa PK: reutilizar una clave conocida para otra acción debe rechazarse. Hay un índice adicional por usuario/fecha y una FK al usuario. Los IDs de recursos de negocio se conservan como referencias en el recibo; no se agregaron columnas a reservaciones, operaciones, transportes ni bitácora.

Solo se admiten estados finales `confirmado` con HTTP 200 y `rechazado` con HTTP 4xx. No existe una fila pendiente preconfirmada. El resultado tiene límite de 16 KiB y el alcance de 8 KiB. La huella incluye versión, generación, actor, método, ruta/query canónicos, cuerpo decodificado y ambas precondiciones originales completas. La canonicalización existente ordena propiedades y conserva arrays/tipos; no se anuncia como implementación de RFC 8785. Las revisiones BIGINT siguen como cadenas.

No se guarda el cuerpo, JWT, contraseña, clave privada ni secreto de integración. Para usuarios/password solo se conserva la huella HMAC y un recibo de referencias, sin copiar valores sensibles. Las claves privadas son aleatorias, diferentes entre sí y permanecen bajo las ACL del laboratorio.

Runtime tiene SELECT y únicamente INSERT por columnas explícitas; no tiene UPDATE, DELETE, TRUNCATE, propiedad, REFERENCES ni TRIGGER sobre la tabla. El trigger ALWAYS rechaza modificaciones/eliminaciones y exige que la generación insertada coincida con el comentario de tabla establecido por el aprovisionador. Se verifican también grants PUBLIC de tabla/columnas y función, cuerpo exacto de la función y permisos efectivos. El arranque exige fsync, full_page_writes y synchronous_commit activados.

Conservación: no hay TTL, purga automática ni liberación de claves durante la generación activa. Los recibos son mínimos y append-only. Retirar un laboratorio exige retirar toda su generación; otro laboratorio obtiene generación y claves nuevas. No existe una modalidad de restauración que reutilice silenciosamente esta generación. Un administrador PostgreSQL con autoridad para alterar esquema/guardias sigue siendo una autoridad externa al protocolo; el mecanismo no promete conservar historia frente a una reconstrucción manual que falsee esa identidad.

5. **Cobertura de rutas.**

Se ejecutaron y repitieron correctamente las 25 rutas del registro existente. En cada una se comprobó además rechazo sin clave (400) y sin precondiciones (428), sin cambios en negocio ni registro de comandos para esas solicitudes incompletas.

| Recurso | Escritores cubiertos |
|---|---|
| Reservaciones | POST raíz; PATCH id, id/cancelar, id/transporte. |
| Operaciones y transportes | POST raíz y PATCH id en cada recurso. |
| Vehículos, guías, operadores y tours | POST raíz y PATCH id en cada recurso. |
| Usuarios | POST raíz; PATCH id e id/password. |
| Países y plataformas | POST raíz de cada recurso. |
| Daily | PUT observaciones por fecha. |
| Eventos externos | PATCH id/revision, PATCH id/archivo y POST id/aplicar. |

No quedan rutas de esta matriz sin el envoltorio de idempotencia en el perfil nuevo. La comparación de rutas montadas sigue impidiendo agregar escritores no revisados. Login y consulta de precondiciones son excepciones del protocolo de comandos de negocio. Integraciones, webhooks y WhatsApp siguen bloqueados.

La cobertura backend no habilita las 11 acciones UI bloqueadas de la fase anterior. Los ensayos externos reales de esta fase usan cancelaciones sintéticas GYG/FH, aprobación y archivo. Las demás variantes de aplicación atraviesan la misma ruta protegida y conservan sus suites aisladas, pero no se ensayaron todas sus combinaciones HTTP con idempotencia.

6. **Contrato HTTP y recuperación.**

Las escrituras del perfil nuevo requieren las cabeceras siguientes además del JWT:

```http
X-CTSK-Protocol: ctsk-command-api-v1
X-CTSK-Data-Generation: <UUID de generación>
Idempotency-Key: <UUIDv4 minúscula>
If-Match: <ETag original completo>
If-Operational-Match: <contexto original completo>
```

`POST /api/precondiciones` conserva su función y agrega `generacion` en este perfil. Las respuestas del perfil también identifican generación y protocolo mediante cabeceras. La clave se liga al usuario del backend, no a un usuario recibido en el cuerpo, JWT concreto, versión de sesión o nonce HTTPS.

| Resultado | Respuesta |
|---|---|
| Escritura confirmada | 200 con `comando`, `resultado` mínimo e `ids_bitacora`; después de COMMIT. |
| Replay autorizado de una escritura confirmada | Mismo status/cuerpo; `Idempotency-Replayed: true`; no invoca el escritor ni reevalúa su foto contra el estado actual. |
| Clave conocida con otra huella | 409 `CLAVE_IDEMPOTENCIA_REUTILIZADA`. Incluye cambiar las precondiciones conservando esa clave. |
| Clave/cabeceras inválidas o protocolo incompatible | 400; no se crea comando. |
| Generación incompatible | 409 `GENERACION_INCOMPATIBLE`; no se crea comando. |
| Precondición ausente | 428; no se crea comando. |
| ETag inválido, revisión o contexto obsoletos | Conservan 400/412/409; pueden dejar un rechazo durable sin efectos de negocio. |
| Fallo técnico | 5xx y transacción revertida o resultado que debe reconciliarse; no se afirma éxito ni rechazo durable sin evidencia. |

Los recibos terminales incluyen `Location: /api/comandos/<clave>`. El endpoint nuevo es GET autenticado de esa ruta, con las cabeceras de generación/protocolo y sin necesidad de reenviar cuerpo ni precondiciones. Solo consulta comandos propios de un Administrador activo y reevalúa acceso a plataformas y referencias actuales. No abre acceso a comandos ajenos por ser Administrador. Una cuenta degradada/inactiva pierde acceso; los cambios de permisos no quedan congelados en el recibo.

Un comando accesible devuelve 200 con estado terminal e `http_status_original`, incluso si el resultado original fue un rechazo 412. Un comando ausente o no disponible para ese usuario devuelve 404 con `estado: desconocido`, `concluyente: false`. Una denegación de permisos devuelve 403/404 sin contenido histórico. Un fallo de consulta no se transforma en prueba de rollback.

No se publica un estado pendiente basándose en temporizadores, memoria local o ausencia de fila. En el ensayo dos escritores estaban comprobablemente esperando y GET devolvió desconocido: no había admisión previa visible. La recuperación usa una transacción READ ONLY con snapshot REPEATABLE READ y no espera el candado global de escritura. Un COMMIT posterior a su snapshot puede requerir otra consulta explícita para verse.

Los duplicados de escritura esperan el candado operativo; al obtenerlo consultan el registro y devuelven el resultado confirmado. La espera conserva el límite de 2 s. Si se agota, retorna el conflicto de bloqueo existente y debe consultarse el resultado; no queda una fila que afirme que el comando falló. No se agregó espera persistente, takeover, ejecución diferida ni reenvío automático.

7. **Pruebas realizadas.**

| Grupo final | Resultado |
|---|---|
| Jest aislado, guardias de red/PostgreSQL | 25 suites, 690 pruebas aprobadas, 0 fallidas. |
| Perfil 020 con HTTP/PostgreSQL reales | 22 comprobaciones aprobadas; matriz de 25 escritores completa. |
| Regresión revision-api-lab 019 | 28 comprobaciones aprobadas, incluidas las 25 rutas previas. |
| Regresión independent-dev con Electron/PostgreSQL reales | 6 comprobaciones aprobadas. |

El caso simultáneo mantiene el candado desde una conexión PostgreSQL independiente hasta observar dos escritores HTTP esperando en `pg_locks`. Después libera la barrera y comprueba dos respuestas iguales, exactamente una marcada replay, una reservación, un comando y una entrada de auditoría.

El probe, solo de pruebas, observa con SQL `pg_current_xact_id()` y `pg_backend_pid()` al ejecutar negocio, auditoría y registro final. En el ensayo final los tres puntos mostraron transacción principal `792` y PID `47948`. Los números no son identidades productivas ni deben reutilizarse como claves. Las pruebas aisladas verifican además que el SQL de INSERT de comando se ejecuta sobre el mismo cliente y que solo hay un COMMIT exterior.

Se probaron huella diferente con igual clave, cambio de precondiciones con igual clave, edición posterior a un comando ya confirmado, cancelación, transporte, no-op, BIGINT, rechazo durable, respuesta descartada después de COMMIT, espera agotada, fallos de auditoría y antes/después del INSERT de comando, permisos revocados, recuperación ajena, secretos ausentes en tabla y permisos de PostgreSQL. GYG/FH sintéticos conservaron una sola cancelación/auditoría y sus referencias de reservación.

Se reinició el servidor mediante la entrada normal sin los fallos del probe; conservó generación, claves, resultado durable y replay sin nueva auditoría. No se instalaron nuevas dependencias ni se ejecutó npm test global. Las pruebas no tocaron bases existentes.

Para repetir:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\CommandApiLab.ps1 -Mode Verify
```

Verify siempre crea otro directorio/clúster vacío privado y lo detiene al finalizar. No acepta un destino existente. No es una modalidad de instalación empresarial.

8. **Escenarios pendientes y problemas encontrados.**

El primer ensayo intentó configurar alcance selected en un Administrador y recibió correctamente 400. Se corrigió únicamente el caso para degradar a Consulta con alcance explícito, manteniendo las reglas existentes. Una comprobación adicional comparaba xmin entre filas de subtransacciones; xmin puede identificar savepoints distintos. Se sustituyó por observación de transacción principal/PID, sin relajar la atomicidad. Los ensayos finales no tienen fallos.

No se ensayaron dos computadoras físicas, rendimiento de gran volumen, reinicio Windows/pérdida eléctrica, failover, recuperación de ventana destruida ni todas las variantes de eventos externos. No se volvió a ejecutar el harness HTTPS completo ni la interfaz de conflictos real en esta fase; sus suites aisladas anteriores están incluidas. No se depende de Connection: close ni de botones para deduplicar: las repeticiones HTTP explícitas contra el backend devuelven recibos.

Con transacción estricta, un intento sin resultado confirmado no conserva una huella durable: no puede detectarse una reutilización de clave cuyo único antecedente se perdió al revertir. El cliente debe conservar inmutable la asociación clave/sobre y nunca reciclarla para otra intención. Ausencia de fila sigue significando desconocido, no autorización para generar otra clave y guardar de nuevo automáticamente.

Los recibos no son representaciones actuales ni ETag para nuevas ediciones. Si desaparece una referencia o ya no puede autorizarse su lectura, se restringe la recuperación. La conservación append-only crece con los comandos y necesita una política productiva futura; no se agregó limpieza ni se prometió idempotencia frente a cambios administrativos fuera del protocolo.

9. **Aislamiento de producción.**

Se usaron seis directorios nuevos: cuatro iteraciones del perfil 020 y dos regresiones. Sus seis archivos PID quedaron ausentes, sus 12 puertos sin listeners y no quedaron procesos Node/Electron/PostgreSQL asociados. La comprobación está en `docs/local-fase-2c3b/closure.json`.

No se abrió conexión a `sian_kaan_reservaciones`, ni se modificaron bases previas. No se aplicó 020 fuera de los clústeres nuevos. No se leyeron credenciales productivas ni se modificaron FareHarbor/GetYourGuide reales, ngrok, tareas, certificados, TLS, firewall, router, LAN, instaladores o servicios Windows. Esta afirmación se basa en los destinos y acciones del laboratorio; no se consultó producción para comparar sus datos.

Las claves y credenciales sintéticas privadas permanecen en los directorios protegidos, fuera del informe. Las entradas anteriores conservan su contrato y rechazo de perfiles/esquemas incompatibles. Los manifiestos siguen ligados al hash de código: cambiar fuentes no autoriza a editar sus hashes ni reutilizar configuraciones antiguas sin su procedimiento autorizado.

10. **Procedimiento de reversión.**

Todos los ensayos ya terminaron apagados. Si un Verify fuese interrumpido, identificar y cerrar únicamente sus procesos Node por la ruta de ese manifiesto y después detener el PostgreSQL propio:

```powershell
.\scripts\CommandApiLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Stop no termina procesos Node ajenos; valida directorio/manifiesto/código y el clúster propio. No alterar digests para eludir un rechazo. No borrar ni mover directorios calculados sin comprobar su ruta absoluta y propietario.

Para revertir código, retirar únicamente los bloques de esta fase de los cinco archivos modificados y los archivos nuevos de implementación enumerados, conservando las evidencias. Las copias iniciales de `docs/local-fase-2c3b/before/` incluyen los cambios anteriores del usuario y pueden compararse con los hashes finales. Solo deben restaurarse completas si el archivo actual todavía coincide con ese hash final; si hubo trabajo posterior, retirar el parche selectivamente. No restaurar database.js: no cambió. No usar reset, clean ni checkout masivo.

No es necesario ni está autorizado ejecutar DROP TABLE, migración inversa o cambios sobre otra base. La reversión de datos consiste en retirar el laboratorio completo y su generación cuando se decida hacerlo, después de verificar que está detenido y preservando la evidencia necesaria.

11. **Recomendaciones para el frontend.**

Integrar primero en el frontend de laboratorio mediante un perfil explícito nuevo. Generar una UUIDv4 por confirmación humana, conservar clave, generación, método/ruta, cuerpo y precondiciones originales como un sobre inmutable y enviarlo una sola vez desde la aplicación. No utilizar nonce HTTPS, versión de sesión o ETag como identificador de comando.

Ante respuesta perdida, mantener el formulario y consultar GET de recuperación con la misma identidad/generación. Un resultado confirmado permite mostrar el recibo y después consultar el registro actual con autorización; un rechazo durable conserva el borrador para revisión. Un resultado desconocido exige una decisión humana informada y no habilita reenvíos automáticos ni una clave nueva silenciosa.

Después de un conflicto y de revisar una foto nueva, una nueva intención debe tener otra clave y confirmación. Distinguir 409 de clave reutilizada, 409 de contexto y conflicto de bloqueo: no ofrecer una fusión o rebase automático para los tres. Mantener el tratamiento seguro de cambios de sesión/permisos.

La recuperación después de cerrar/destruir la ventana necesita conservar una referencia al comando de forma segura; no equivale a recuperar el borrador. La persistencia cifrada de borradores, búsqueda autorizada de comandos propios, purga productiva, reintentos y recuperación durable de trabajo pendiente siguen pendientes de diseño/autorización. No se modificaron las pantallas principales ni se habilitó este perfil en la empresa.
