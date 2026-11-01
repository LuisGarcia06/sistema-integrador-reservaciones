# Fase 2C.2B.1 — revisiones administradas por PostgreSQL

Fecha: 2026-10-26. Implementación exclusiva de laboratorio, sin promoción productiva.

Se incorporó el perfil **`revision-schema-lab`**, con esquema real **019** y propósito obligatorio **`schema-tests-only`**. Agrega revisiones a tres tablas de una base sintética recién creada. El perfil no puede montar Express ni iniciar el servidor independiente. Todavía no resuelve la sobrescritura de formularios: las precondiciones API corresponden a la siguiente fase.

1. **Archivos y alcance del cambio.** Se conservaron los 685 archivos presentes al comenzar, incluidos cambios locales y archivos sin seguimiento. La comparación SHA-256 identifica exactamente cinco archivos existentes modificados; no se eliminó ninguno. `database/schema.sql`, servicios de negocio, frontend, Electron, integraciones, configuración principal e instalador conservan sus bytes iniciales. El esquema base ya tenía cambios anteriores a esta tarea; se conservaron.

| Archivo existente modificado | Justificación |
|---|---|
| `backend/config/database.js` | Seleccionar el puerto privado validado también para el nuevo perfil; principal conserva 5432. |
| `backend/config/operationalTransactions.js` | Reconocer el perfil 019 aislado y conservar el candado transaccional de Fase 2C.1. |
| `backend/standalone.js` | Rechazar el perfil de esquema antes de crear servidor, conectar PostgreSQL o cargar aplicación. |
| `backend/server.js` | Rechazar también el montaje directo de Express desde una configuración 019. No cambia endpoints. |
| `scripts/standaloneDev.cjs` | Extensión explícita del aprovisionador para el perfil nuevo; comportamiento anterior por defecto, credenciales administrativas efímeras y limpieza del entorno al terminar. |

| Archivo nuevo | Función |
|---|---|
| `backend/config/revisionLabPolicy.js` | Contratos, ACL, integridad, identidad, verificación y renovación de generación con PostgreSQL apagado. |
| `backend/config/revisionSchemaContract.js` | Definición exacta del SQL, función, triggers, columnas y permisos autorizados. |
| `backend/config/revisionSchema.js` | Inspección estricta del catálogo y privilegios efectivos; dependencias 018 conservadas. |
| `database/migrations/019_revisiones_registros_lab.sql` | Migración identificada, transaccional y exclusiva del laboratorio. |
| `scripts/revisionFixtures.cjs` | Destino verificado, migración y datos sintéticos iniciales. |
| `scripts/revisionSchemaCases.cjs` | Casos reales de PostgreSQL, servicios, permisos, corrupción del esquema y concurrencia. |
| `scripts/revisionSchemaLab.cjs` | Ejecución, comprobaciones obligatorias, reinicio y cierre del laboratorio. |
| `scripts/RevisionSchemaLab.ps1` | Entrada PowerShell, directorio nuevo privado y entorno limpio. |
| `backend/__tests__/revisionSchemaLab.test.js` | Pruebas sin PostgreSQL sobre contratos, verificador y bloqueo de API. |
| `docs/LOCAL-FASE-2C2B1.md` | Este informe y procedimientos. |
| `docs/local-fase-2c2b1-verification.json` | Resultados, selección de suites, evidencia y comprobaciones de cierre. |

2. **Migración y contrato del laboratorio.** La migración añade `revision BIGINT NOT NULL DEFAULT 1` y un `CHECK (revision > 0)` validado en `reservaciones`, `operaciones_tour` y `transportes_operacion`. No crea tablas. La migración en disco debe coincidir exactamente, normalizando únicamente CRLF, con el contrato incluido en el código verificado. No se ejecuta al iniciar una modalidad operativa.

El aprovisionador exige un directorio vacío nuevo `%LOCALAPPDATA%\ctsk-standalone-<12hex>`, protegido con ACL para el usuario actual, SYSTEM y Administradores. Crea un clúster PostgreSQL 18.3, puerto nuevo permitido, escucha `127.0.0.1`, base nueva `ctsk_standalone_<12hex>_test`, propietario NOLOGIN y rol limitado. Antes de crear o migrar tablas comprueba puerto, base, usuario, directorio y la identidad efectiva del clúster; también comprueba que solo existan las bases iniciales. No admite un respaldo o URL de base como entrada.

El manifiesto tiene versión 2, entorno `revision-schema-lab`, propósito `schema-tests-only`, UUID `dataGeneration` y las identidades privadas existentes. La configuración privada exige `DB_SCHEMA_VERSION=019`, credenciales aleatorias nuevas, JWT sintético, integraciones deshabilitadas y puerto loopback coincidente. No se simula 017 para pasar sus validaciones. Las políticas antiguas rechazan este manifiesto. El perfil no genera `service.key`, no tiene modo Start ni opción Electron, y no monta HTTP/HTTPS.

Se insertan filas sintéticas antes de agregar las columnas para probar que reciben revisión 1. Dentro de la misma transacción de preparación, antes de crear los triggers, una segunda fila de cada tabla recibe `9007199254740993` para simular un historial largo. Luego se instalan todas las protecciones y se valida con el rol limitado. No se deshabilitan triggers ni se conceden excepciones al rol de ejecución para preparar esa prueba.

3. **Definición y funcionamiento de los triggers.** La función `public.ctsk_guard_revision_019()` pertenece al propietario NOLOGIN, usa PL/pgSQL, `SECURITY INVOKER` y `search_path=pg_catalog`. Su definición completa está en la migración y en `revisionSchemaContract.js`. Cada tabla tiene `ctsk_revision_guard_019`, `BEFORE INSERT OR UPDATE FOR EACH ROW`, habilitado `ALWAYS`, sin condiciones ni lista de columnas.

En INSERT exige revisión 1. En UPDATE rechaza un valor de revisión diferente del anterior con SQLSTATE `22023`. Compara `to_jsonb(NEW) - 'revision'` y `to_jsonb(OLD) - 'revision'`; si hay un cambio persistido, asigna `OLD.revision + 1`, y si ambos valores son iguales conserva la revisión. Un timestamp modificado cuenta como cambio real. El incremento pertenece a la misma transacción: rollback y fallo de bitácora revierten datos y revisión juntos. No se registra bitácora adicional desde el trigger. Un desbordamiento BIGINT abortaría la escritura, sin reciclar el contador.

Los servicios existentes y los aplicadores manuales quedan cubiertos por sus UPDATE normales, sin modificar sus archivos. El contador es por fila: cambiar pasajeros o una asignación no incrementa automáticamente las revisiones de todas las filas relacionadas. Esta fase no crea revisiones de contexto ni de vehículos.

4. **Permisos efectivos.** Se retiran INSERT y UPDATE por tabla al rol de ejecución en las tres tablas. Se conceden por lista explícita de columnas previas, excluyendo `revision` y la clave primaria. SELECT permite consultar la revisión; USAGE de secuencias permite las altas normales. También se retira DELETE en esas tablas para impedir borrar y recrear una identidad con contador inicial. Las API existentes no necesitan DELETE físico; esta reducción existe solo en el perfil nuevo.

El rol no tiene propiedad, DDL, membresía administrativa, TRIGGER, TRUNCATE ni permiso para cambiar `session_replication_role`. Se comprobaron rechazos de INSERT/UPDATE explícitos de revisión, incluso intentar asignar el mismo valor, cero, NULL, un incremento o una disminución. Las escrituras ordinarias del propietario también obedecen el trigger. Un superusuario puede modificar DDL por definición; no se distribuye su contraseña ni se utiliza para ejecutar servicios. Las mutaciones administrativas negativas se hacen únicamente dentro de transacciones de prueba sobre el clúster nuevo, se revierten y después se verifica nuevamente el esquema.

5. **Verificación y generación de datos.** Se conservan las comprobaciones previas de proceso local, identidad efectiva, clúster autorizado, rol limitado y esquema base. El verificador nuevo exige tres columnas BIGINT, default 1, NOT NULL, checks positivos exactos y validados, triggers ALWAYS completos, función con cuerpo/propietario/lenguaje/configuración exactos y permisos efectivos por tabla y columna. Rechaza triggers adicionales, UPDATE OF, WHEN, reglas de reescritura, RLS y concesiones amplias que permitan eludir los permisos de columna. Conserva además las dependencias de publicación y sincronización 018. Si falla una comprobación, se aborta; no hay migración automática ni fallback.

`dataGeneration` es un UUID v4 aleatorio persistido en el manifiesto privado, protegido por las mismas ACL. No deriva del identificador del clúster ni publica sus datos privados. Conserva su valor al reiniciar PostgreSQL. Se puede renovar solo con el laboratorio apagado, tras verificar manifiesto, código, configuración offline, puerto, ACL e identidad del clúster; se reemplaza el manifiesto mediante un archivo temporal del mismo directorio. No cambia datos, credenciales ni configuración de PostgreSQL. Una reconstrucción nueva ya genera otro UUID. Una futura restauración deberá incluir una renovación obligatoria antes de habilitar la API; esa integración con el proceso de restauración no se implementa aquí. En la siguiente fase el UUID podrá formar parte del ETag junto con recurso, identificador y revisión decimal.

6. **Pruebas ejecutadas.** Los conteos corresponden a la ejecución final de cada grupo, sin sumar reejecuciones ni contar cada aserción como prueba independiente.

| Grupo | Resultado final | Evidencia |
|---|---|---|
| 18 suites Jest aisladas | 561 aprobadas, 0 fallidas | Selección completa y configuración en el JSON adjunto. Bloquean PostgreSQL y red. |
| Nuevo perfil PostgreSQL 019 | 44 comprobaciones aprobadas, 0 fallidas | `ctsk-standalone-49aac025097f/revision-verification.json` |
| Concurrencia bajo 019 | 13 escenarios aprobados | Incluidos como grupo separado en la misma evidencia. |
| Perfil operativo anterior 017/018 | 13 escenarios aprobados | `ctsk-standalone-6f6ed99a4966/operational-verification.json` |
| independent-dev, Electron y PostgreSQL reales | 6 comprobaciones aprobadas | `ctsk-standalone-80ed33aadb77/verification.json` |
| https-lab, Electron y PostgreSQL reales | 13 comprobaciones aprobadas | `ctsk-standalone-3039540c9506/https-verification.json` |
| Componentes lan-lab | Aprobados sin listener LAN ni PostgreSQL | `ctsk-standalone-0ff9e54de2b0/lan-components-verification.json` |

Esas rutas de evidencia están bajo `%LOCALAPPDATA%`. El JSON de este informe conserva copias sin secretos ni identificadores privados del clúster. Se verificaron inserción inicial, incrementos sucesivos, no-op SQL y de los tres servicios, rollback, fallo de bitácora, BIGINT exacto como string decimal, ataques de permisos, triggers ausentes/deshabilitados/alterados, función ausente/alterada, esquema incompleto, dependencias 018 y renovación de generación. Los 13 escenarios conservan ausencia de sobrecupos y cambios parciales, candado asesor antes de leer dependencias, límites de capacidad, mínimo de pasajeros, aprobación manual y auditoría. En eventos sintéticos GYG/FH también se comprobó el incremento exacto y la ausencia de incrementos por aplicar nuevamente un evento ya aplicado.

La modalidad heredada se verificó con suites de arranque, políticas y procesos simulados; no se abrió la instalación real. HTTPS comprobó TLS, identidad, roles, Web Locks, Centro de Avisos, Daily PDF local, reinicio y continuidad del backend al cerrar Electron. Estas comprobaciones usaron el perfil anterior y no habilitaron la API del nuevo esquema.

No ejecutadas: conexión física entre dos equipos, validación en la red de la empresa, arranque contra la base principal, despliegue/instaladores, restauración completa con el futuro contrato ETag y funciones de interfaz o precondiciones API. No se ejecutó `npm test` global. El único intento de TRUNCATE nuevo forma parte del ensayo de privilegios de un clúster recién creado y verificado: fue rechazado por el rol limitado.

Para repetir el laboratorio desde PowerShell en la raíz del repositorio:

```powershell
.\scripts\RevisionSchemaLab.ps1 -Mode Verify
```

Siempre crea un clúster nuevo, imprime su directorio y lo detiene al terminar, tanto en éxito como en error controlado. Si se interrumpe forzosamente, detener exclusivamente ese directorio:

```powershell
.\scripts\RevisionSchemaLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Para probar la renovación con ese laboratorio ya apagado:

```powershell
.\scripts\RevisionSchemaLab.ps1 -Mode RenewGeneration -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

El comando exige código y configuración coincidentes con su creación. No relabelar el perfil ni alterar hashes para reutilizarlo como servidor. No ejecutar el SQL manualmente contra una conexión existente.

Para repetir solo las suites aisladas seleccionadas:

```powershell
$revisionEvidence = Get-Content -LiteralPath .\docs\local-fase-2c2b1-verification.json -Raw | ConvertFrom-Json
$revisionSuites = @($revisionEvidence.automated.suites)
node .\node_modules\jest\bin\jest.js --config backend/__tests__/standalone.jest.config.cjs --runInBand --runTestsByPath @revisionSuites
```

7. **Aislamiento y cierre.** No se abrió conexión a `sian_kaan_reservaciones`, se leyeron credenciales productivas ni se aplicaron migraciones existentes. No se alteraron procesos reales de integraciones, tareas, servicios Windows, ngrok, firewall, router, certificados existentes ni almacenes globales de confianza. Las pruebas de aplicación manual usaron funciones existentes y eventos sintéticos con salidas de red bloqueadas; no ejecutaron sincronización o receptores reales.

Se comprobaron pasivamente los once directorios exclusivos de esta fase: diez clústeres nuevos y un laboratorio de componentes sin base. Los diez quedaron sin `postmaster.pid`, los veinte puertos registrados quedaron sin listeners y no quedaron procesos Node/Electron/PostgreSQL identificables con esos directorios. Las carpetas y evidencias se conservaron apagadas. No se consultó producción para comparar sus datos; la confirmación se basa en los destinos nuevos y verificados y en las acciones realizadas.

8. **Problemas encontrados y límites.** Hubo dos rechazos iniciales por contar las restricciones NOT NULL de PostgreSQL 18 junto con los CHECK en `pg_constraint`. Se corrigió la consulta para seleccionar CHECK explícitamente; NOT NULL continúa verificándose por separado. Un ensayo intermedio fue invalidado porque una variable local ocultaba el callback de pruebas: se corrigió el nombre y se añadieron aserciones que impiden informar éxito si faltan los escenarios obligatorios. Otro ensayo falló por esperar denegación de permisos cuando PostgreSQL rechazaba primero una expresión inválida de columna GENERATED ALWAYS; se corrigió únicamente el ensayo. El historial y los directorios apagados figuran en el JSON. La ejecución final no tiene fallos pendientes.

El laboratorio requiere Windows con PostgreSQL 18.3 instalado en la ubicación ya utilizada por los laboratorios anteriores y las dependencias presentes del repositorio. No se agregó ninguna dependencia. No se garantiza rendimiento a escala productiva con estas pruebas. Las modalidades anteriores conservan su contrato; las revisiones todavía no protegen sus formularios frente a información obsoleta. La renovación del UUID exige mantenimiento exclusivo: una futura operación de restauración deberá coordinar ese paso antes de aceptar clientes.

9. **Reversión.** No hace falta ejecutar una migración inversa sobre una base existente. Detener solo el laboratorio identificado y conservar su evidencia; después, si se decide descartarlo, retirar únicamente su clúster desechable completo tras verificar la ruta. No ejecutar DROP COLUMN, DROP DATABASE ni cambios de permisos contra otra base.

Para revertir el código, revisar y retirar solo los bloques de esta etapa en los cinco archivos enumerados y los once archivos nuevos. En `database.js`, restaurar la selección del puerto basada solo en `standalone-development`; en `operationalTransactions.js`, retirar únicamente el reconocimiento de 019; en las dos entradas, retirar únicamente las guardias del perfil; en el aprovisionador, retirar sus ramas y callback 019 conservando todas las funciones previas. La evidencia SHA-256 identifica el alcance frente al estado inicial. No usar `git restore`, `reset` o `clean` sobre archivos completos: contienen trabajo previo sin consolidar.

10. **Recomendaciones para Fase 2C.2B.2.** Revisar estos resultados antes de habilitar cualquier API 019. Definir ETag fuerte y opaco que incluya generación, tipo/identificador y revisión como string decimal; no convertir BIGINT a Number. Exigir y validar If-Match dentro de la misma transacción, después del candado y antes de escribir o auditar. Acordar 428 sin precondición, 412 ante revisión obsoleta y errores de negocio diferenciados. Inventariar todas las escrituras y aplicaciones manuales antes de promover el perfil.

Debe resolverse también el contexto relacionado: cambios de vehículo/capacidad, pasajeros o membresía pueden afectar una operación sin modificar su fila. No basta comprobar solo su revisión. Mantener las revalidaciones y el candado actuales y definir las precondiciones de dependencias sin agregar restricciones comerciales. Preparar pruebas de dos sesiones, cancelaciones, eventos externos y ausencia de bitácora adicional al rechazar conflictos. Mantener el bloqueo operativo del perfil hasta cubrir el contrato completo y su compatibilidad; interfaz de conflictos, borradores e idempotencia siguen pendientes de etapas separadas. La conexión física entre dos equipos continuará pendiente hasta disponer de una red verdaderamente aislada.
