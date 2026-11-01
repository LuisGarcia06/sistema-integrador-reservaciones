# FASE 2D.9B.2C — Diseño definitivo propuesto de credenciales, sesiones y bootstrap

Fecha: 28 de octubre de 2026. Estado: **diseño para revisión y aprobación; no implementado**.

La propuesta conserva Electron, HTML/CSS/JavaScript, Node/Express, `pg`, bcrypt costo 12, el motor de comandos y Bitácora 022. Añade una versión durable por Usuario, autenticación vinculada a esa versión y un contrato experimental 023. No requiere tablas de sesiones, refresh tokens, listas de JWT, colas ni servicios nuevos. Para una constancia de instalación atómica y sin actor ficticio propone una única tabla técnica singleton; esa ampliación necesita aprobación expresa.

Esta fase solo inspeccionó archivos y documentación técnica y creó este documento y evidencia documental. **No inició servidores/laboratorios, ejecutó SQL o migraciones, accedió a PostgreSQL, cambió contraseñas/JWT ni modificó código o formularios.** Los resultados de 2D.9B.2B y anteriores son antecedentes, no pruebas ejecutadas nuevamente.

## 1. Inspección y comportamiento que se conserva

Se revisaron `AGENTS.md` y los informes 2D.9A, 2D.9B.1, 2D.9B.2A y 2D.9B.2B. Se mantienen sus conclusiones válidas: dos roles funcionales; Administrador con alcance efectivo all aunque conserve selected almacenado; Consulta con alcance vigente; una auditoría por intención efectiva; no-op sin reemplazar asignaciones; historial incompatible sin reparación automática; 409/412, candado común, savepoints, ledger y recuperación.

| Implementación inspeccionada | Estado actual | Adaptación propuesta, exclusivamente futura |
| --- | --- | --- |
| `backend/validators/usuarios.validator.js` | Alta/reset exige `password.length >= 8`; no cuenta bytes ni rechaza todos los blancos en asignación | Validador de secreto cerrado para asignaciones nuevas; conservar los validadores públicos |
| `backend/services/usuarios.service.js` | bcrypt costo 12; alta y reset con transacción interna; protecciones propia/último Admin; PATCH general auditado solo en laboratorio | Alta/reset auditados; incremento de versión garantizado por PostgreSQL; misma transacción exterior |
| `backend/services/auth.service.js` | Login usa `LOWER(correo)` y LIMIT 1; bcrypt.compare; JWT con ID/rol y TTL predeterminado de 8 horas | Correo no ambiguo, login consistente frente a reset concurrente y token con versión |
| `backend/middleware/auth.middleware.js` | Verifica firma/expiración y relee Usuario/estado/rol; no compara versión de credencial | Exigir contrato JWT nuevo y cotejar versión por petición, también después del candado |
| `frontend/js/auth.js`, `frontend/js/api.js` | Token en memoria; GET sesión cada 30 s/foco; borra datos y aborta solicitudes al perder sesión | Conservar ese mecanismo; 401 revocado termina sesión; no confundir el refresco de permisos con emisión de JWT nuevo |
| `frontend/pages/usuarios.js` | Reset confirma localmente y envía solo `password`; alta no tiene el mismo campo de confirmación | Confirmación local también para alta; motivo/protocolo; sin secreto en comparadores |
| `frontend/js/commandLab.js` | Conserva cuerpo inmutable en memoria y lo descarta con la sesión | Adaptador específico para credenciales que elimine el secreto tras despachar y conserve únicamente una referencia de recuperación |
| `comandos.service.js`, `commandIntent.js` | HMAC del cuerpo/precondiciones; clave por generación/actor; GET de recuperación sin body | Reutilizar; JWT/versión no forman parte de la identidad durable de la intención |
| Auditoría 022 | CREAR Usuario con foto pública; CAMBIAR_PASSWORD con fotos NULL y descripción fija | Usar esos eventos sin agregar secretos ni modificar sus ramas históricas |
| `database/seeds.sql` | Crea roles y catálogos, ningún Usuario | Mantener sin cuentas ni contraseñas predeterminadas |
| Preparadores y fixtures | Crean identidades sintéticas privadas; `CommandApiLab` general contiene reset heredado | No confundirlos con bootstrap; revisar efectos antes de cada regresión y no ejecutar ese corredor general sin autorización |

El contador local `version` del frontend descarta respuestas antiguas; **no es** la versión durable de credenciales propuesta. Logout local elimina el token de ese proceso, pero no invalida una copia válida en otro equipo.

## 2. Política cerrada de contraseñas

### 2.1 Nuevas asignaciones: alta, reset y bootstrap

| Regla | Decisión propuesta |
| --- | --- |
| Tipo | Cadena JSON válida, con Unicode bien formado; rechazar sustitutos UTF-16 aislados y U+0000 |
| Mínimo | Ocho puntos de código Unicode, contados después de comprobar que la cadena está bien formada |
| Máximo | 72 bytes UTF-8, inclusivo; rechazar 73 o más antes de bcrypt |
| Blancos | Rechazar una cadena compuesta exclusivamente por Unicode White_Space o U+FEFF; no eliminar blancos de un secreto válido |
| Transformaciones | Ningún trim, cambio de mayúsculas, normalización NFC/NFKC, sustitución, prehash o truncamiento del secreto |
| Unicode | Permitido. Los puntos de código y los bytes son controles distintos; no contar unidades UTF-16 como caracteres completos |
| Hash | `bcrypt.hash(secreto, 12)` asíncrono, con sal generada por la biblioteca; no cambiar algoritmo/costo en esta etapa |
| Confirmación | Igualdad exacta local de nueva contraseña/confirmación; el campo de confirmación no viaja al backend |
| Restricciones extra | No exigir reglas nuevas de mezcla de símbolos ni rotación periódica sin otra decisión autorizada |

El backend es autoridad. El frontend usa el mismo criterio de caracteres y `TextEncoder` para orientación; Node comprueba los bytes con `Buffer.byteLength(valor, 'utf8')`. No se acorta el valor para hacerlo caber. bcrypt.js documenta el límite de 72 bytes y que la biblioteca no lo rechaza implícitamente. [bcrypt.js](https://github.com/dcodeIO/bcrypt.js), [Buffer.byteLength](https://nodejs.org/api/buffer.html#static-method-bufferbytelengthstring-encoding).

Ejemplos de aceptación a probar: ocho caracteres ASCII, un secreto válido con espacios iniciales/finales conservados, 18 emojis de cuatro bytes (=72 bytes). Ejemplos rechazados: siete puntos de código nuevos, 19 de esos emojis, 73 bytes ASCII y ocho blancos. Dos cadenas visualmente iguales con distinta composición Unicode siguen siendo secretos distintos.

### 2.2 Compatibilidad de login histórico

No se actualizan ni rehashean hashes existentes automáticamente. Un hash bcrypt no permite descubrir si el secreto original superaba 72 bytes o estaba compuesto por blancos.

El login 023 exige cadena bien formada, sin NUL, no exclusivamente blanca y de hasta 72 bytes, sin modificarla. **No reaplica el mínimo nuevo de ocho puntos de código a un hash histórico**: la regla anterior contaba unidades UTF-16 y pudo admitir, por ejemplo, cuatro emojis. Si bcrypt valida un secreto histórico dentro de los límites de entrada de login, se permite autenticar; una asignación posterior deberá cumplir toda la política nueva.

Se rechazan entradas históricas de más de 72 bytes o solo blancos; no se intenta una comparación truncada como alternativa. Esto puede impedir entrar a determinadas cuentas históricas, sin alterar su hash. Su solución es un reset autorizado por otro Administrador; si no existe ninguno accesible, corresponde recuperación administrativa separada, nunca bootstrap sobre una base con Usuarios. Esta consecuencia requiere aprobación antes de aplicar el contrato a datos reales.

No obstante, un hash histórico generado desde más de 72 bytes puede validar también una entrada que coincida con su prefijo efectivo. Limitar la entrada nueva no permite detectar ni eliminar retroactivamente esa equivalencia; solo una reasignación autorizada con la política nueva reemplaza ese legado. No se afirma que los hashes existentes cumplen las condiciones propuestas.

El login admite únicamente `correo` y `password`; los demás cuerpos tienen listas cerradas. No se devuelven valores, longitud, fragmentos o hash del secreto en errores. Las respuestas de autenticación son la única entrega autorizada del JWT al cliente; los tokens y las contraseñas no se registran en logs, Bitácora, recibos, snapshots ni comparadores. El HMAC opaco de intención del ledger se conserva; no es un hash de contraseña expuesto.

## 3. Revocación JWT y concurrencia

### 3.1 Versión durable

Proponer `usuarios.version_credenciales BIGINT NOT NULL DEFAULT 1`, dentro de 1…9223372036854775807. Node trata el valor como decimal textual/BigInt, nunca como Number susceptible de perder precisión. Cada JWT nuevo lleva `cv` como cadena decimal canónica.

| Operación confirmada | Efecto de versión / sesiones |
| --- | --- |
| Alta/primer Administrador | Versión inicial 1; no emitir token del usuario creado desde el alta administrativa |
| Reset propio o por otro Admin | Nuevo hash y versión anterior +1, incluso si se vuelve a elegir el mismo secreto |
| Desactivación | Versión +1; cuenta inactiva; tokens anteriores inválidos |
| Reactivación | Versión +1 otra vez; requiere login nuevo; no resucita tokens anteriores |
| Estado idéntico/no-op | Ningún cambio de versión ni auditoría adicional |
| Nombre/correo/rol/plataformas | Sin incremento por esta política mínima; autoridad y alcance se releen de DB por petición |
| Logout local | Borra estado local; no revoca otras copias del token |

La decisión de no incrementar por rol/plataformas conserva la revalidación ya implementada: degradar impide inmediatamente operaciones de Administrador, sin confiar en el rol del JWT; una promoción legítima puede dar acceso a sesiones aún válidas. Si se desea revocar todas las sesiones también en esos cambios, deberá aprobarse explícitamente esa política adicional, no introducirla silenciosamente.

### 3.2 Token y validación

Contrato nuevo propuesto: firma HS256, clave privada de configuración, TTL fijo de 8 horas como base actual, `iss='ctsk-lab-023'`, `aud='ctsk-desktop-023'`, `sub` ID decimal de Usuario, `cv`, `dg` generación del manifiesto, `token_use='access'`, `iat` y `exp`. No incluir rol/plataformas como autoridad ni secreto de credencial. Una futura consolidación tendrá identidad de despliegue propia, sin aceptar automáticamente tokens de laboratorio.

`jwt.verify` debe fijar algoritmo, issuer y audience y comprobar expiración; después se validan formas/rangos de claims, generación, tipo de token y versión contra PostgreSQL. La biblioteca permite configurar esas comprobaciones; decodificar un token no verifica su autenticidad. [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).

Token sin `cv`, mal formado, de otro contrato/generación o con versión distinta: 401. Usuario inexistente/inactivo: no autenticar. No asignar `cv=1` a un token antiguo por omisión, ni aceptar dos esquemas de token como transición implícita. Errores técnicos de DB son errores controlados y acceso denegado, nunca autenticación desde caché.

Cada petición autenticada lee Usuario, versión, estado y rol vigentes. Cada comando vuelve a cotejar **también cv** después de esperar el candado común y antes de escribir, hacer replay o recuperar. Revalidar solo estado/rol, como hoy, sería insuficiente ante un reset concurrente.

El límite es el COMMIT que incrementa la versión: un comando que adquirió el candado y confirmó antes pertenece al estado anterior; uno que espera detrás debe rechazar el token revocado. Una lectura ya autorizada puede terminar antes de que la aplicación detecte la revocación; no se promete retirar bytes ya enviados. Las respuestas tardías se descartan con los mecanismos locales existentes.

Para login final, ejecución, replay y recuperación del contrato nuevo, usar **READ COMMITTED**, adquirir el candado y hacer la lectura de autorización en una sentencia posterior. `readCommand` hoy usa REPEATABLE READ: no trasladar esa secuencia sin adaptación a la puerta de revocación, porque una foto fijada antes de esperar podría seguir viendo la versión vieja. GET de recuperación 023 necesita una rama breve con candado y timeout acotado; los perfiles anteriores conservan su aislamiento. Las lecturas ordinarias mantienen su autorización al inicio y el límite de respuestas en curso descrito arriba.

### 3.3 Login consistente

Leer por clave de correo inequívoca el hash y versión en backend; ejecutar bcrypt.compare fuera del candado común. Antes de emitir el token, iniciar una transacción breve, tomar el mismo candado y releer versión, estado, correo y permisos. Si la versión cambió durante la comparación, no firmar con la versión nueva usando una comprobación del hash viejo: terminar el intento y pedir login otra vez. Firmar desde la lectura consistente y responder después de cerrar la transacción. Un reset posterior puede invalidar inmediatamente ese token; eso es revocación correcta, no razón para reintentar con el secreto guardado.

Propuesta adicional: POST Usuarios y PATCH password requieren autenticación reciente, `iat` de hasta cinco minutos, comprobada otra vez tras el candado. Se obtiene repitiendo el login existente; GET sesión no renueva `iat`. Recuperar recibos requiere autenticación vigente, sin ese límite de cinco minutos. Este requisito de reautenticación requiere aprobación.

## 4. Contrato 023 propuesto: sin crear la migración

Se necesita una migración posterior a 022. Nombre orientativo: `023_seguridad_credenciales_lab.sql`; **el archivo no existe como resultado de esta fase**. No se modifican 018–022 ni sus verificadores.

### 4.1 Columna, trigger e incremento

Un BEFORE INSERT/UPDATE de Usuario, ALWAYS, SECURITY INVOKER y `search_path` controlado aplica estas reglas:

1. INSERT recibe versión inicial 1 por default; no habilitar un valor inicial arbitrario.
2. UPDATE no admite asignar una versión distinta de OLD directamente.
3. Si hash o estado cambian materialmente, calcula NEW.version = OLD.version +1; en otros cambios conserva OLD.version.
4. Ante overflow, rechaza la operación completa; nunca reinicia o envuelve el contador.
5. El hash nuevo se asigna en el mismo UPDATE; rollback revierte hash, versión y estado conjuntamente.

El backend no hace un UPDATE separado del contador. El trigger modifica NEW; no necesita una función SECURITY DEFINER ni una tabla de sesiones. PostgreSQL permite modificar la fila devuelta por un BEFORE trigger. [Funciones de trigger](https://www.postgresql.org/docs/18/plpgsql-trigger.html).

Retirar grants INSERT/UPDATE de tabla completos en Usuarios y conceder solo las columnas de negocio autorizadas, excluyendo `version_credenciales` e identidad. Conservar SELECT requerido y revisar todo grant heredado/PUBLIC: quitar un grant de columna no restringe un grant de tabla que siga vigente. El runtime no posee esquema/objetos, no altera triggers ni usa `session_replication_role`. El propietario con DDL sigue siendo una identidad de confianza. [Privilegios PostgreSQL](https://www.postgresql.org/docs/18/ddl-priv.html).

### 4.2 Correo inequívoco

Actualmente UNIQUE es sensible a representación y login usa LOWER + LIMIT 1, mientras el validador transforma con trim/toLowerCase. No se debe elegir arbitrariamente una cuenta si importaciones históricas produjeron equivalencias.

Para el laboratorio 023, fijar una clave SQL de correo con recorte del conjunto de blancos Unicode acordado y `lower` con collation **C**, que es el locale del preparador actual. La misma expresión/función pura se usa para búsqueda, escritura normalizada e índice UNIQUE funcional. El backend nuevo delega esa canonicalización a esa única regla en vez de mezclar lowercase de JavaScript con otra regla en PostgreSQL. Conservar validación de formato y límite comercial de 100 caracteres.

Esta regla no pretende realizar casefold Unicode completo: caracteres no plegados por C siguen distinguiéndose. Antes de la migración, un preflight de solo lectura agrupa por la clave futura y compara también equivalencias de la regla histórica JavaScript. Si hay colisiones o diferencias de identidad ambiguas, bloquear la instalación de ese contrato y presentar IDs/correos públicos para revisión; no fusionar, borrar ni cambiar correos automáticamente. Login rechaza múltiples candidatos, nunca usa LIMIT 1 como solución. Un despliegue con otra collation necesita una decisión explícita y un contrato verificado, no una suposición de compatibilidad.

### 4.3 Constancia técnica de instalación

Proponer `inicializacion_sistema`, singleton e inmutable, con: clave fija 1, UUID de inicialización, `id_usuario_inicial` FK al Usuario creado, instante del servidor, generación de datos, identidad de clúster, versión inicial de esquema, huella de herramienta y principal SQL de sesión. El Usuario es **resultado**, no actor autenticado. No guarda credenciales, cuerpos, tokens ni un catálogo de sesiones.

La tabla resuelve una necesidad concreta: con las restricciones 022 no existe un actor humano previo para auditar al primer Administrador, y un archivo externo no puede confirmarse atómicamente con PostgreSQL. Se propone este singleton en vez de relajar `bitacora.id_usuario`, inventar un actor o crear una segunda Bitácora general. Requiere aprobación de la ampliación de modelo.

Solo el aprovisionador local autorizado puede insertarlo; runtime sin INSERT/UPDATE/DELETE/TRUNCATE ni elevación. No hay endpoint. Triggers de inmutabilidad y ACL verificadas. Las etapas A/B pueden crear su estructura vacía para evitar otra migración; no deben simular que un fixture fue una instalación real.

### 4.4 Verificador y reversión

Crear un lector 023 propio con manifiesto/protocolo/claves diferenciados y digests fijos revisados para columna, CHECK/default, funciones, triggers ALWAYS, índice/collation, singleton/FK e inmutabilidad, grants efectivos y ausencia de permisos indirectos. Debe verificar también 019/020 y el contrato completo de Bitácora 022, sin adaptar sus lectores originales a 023.

La tabla pública adicional hace que los verificadores anteriores con lista cerrada de tablas rechacen la estructura nueva; además sus manifiestos rechazan la nueva versión. El lector 023 debe componer de forma explícita la extensión y los contratos heredados, no fingir que un catálogo 023 es idéntico a 022. Probar ambos rechazos antes de escuchar HTTP.

No hay DOWN automático sobre una instalación que haya emitido tokens. Retirar el contador o volver a un backend que acepte tokens antiguos podría revivir sesiones. En laboratorio, revertir código con hashes y usar otro clúster nuevo. Para una restauración real futura: mantenimiento, identidad/generación nuevas o rotación autorizada de firma, rechazo de todos los tokens previos y validación de versiones/constancia antes de reabrir; no restaurar contador hacia atrás conservando tokens válidos.

## 5. Alta auditada de Usuarios

Futura lista cerrada del body: `nombre`, `correo`, `password`, `id_rol`, `estado`, `alcance_plataformas`, `platform_ids`, `motivo` opcional. Rechazar confirmación, IDs, snapshots, cv, actor y fechas. Solo Administrador activo con versión vigente y autenticación reciente.

Validar rol existente **y soportado** (Administrador o Consulta), correo inequívoco, estado booleano y plataformas reales ordenadas/sin duplicados. Nueva cuenta Administrador se crea con modo almacenado all y array vacío; Consulta exige alcance final explícito, selected puede estar vacío. No reparar usuarios históricos al dar de alta otra cuenta.

Tras confirmación humana, solicitar precondiciones del alta ligadas al cuerpo; calcular HMAC sin persistir el secreto. Dentro del mismo límite exterior: revalidar actor/cv, comprobar precondiciones, insertar hash bcrypt y versión default 1, asignaciones necesarias, releer foto pública de seis campos, insertar CREAR 022 y ledger con su ID real; restricciones diferidas y COMMIT único antes de responder. FK/duplicado comercial producen rechazo durable sin alta parcial; fallos técnicos revierten Usuario, asignaciones, auditoría y comando.

No emitir una sesión del Usuario recién creado al Administrador creador. La respuesta contiene referencias y recibo, nunca hash, secreto, longitud o nueva contraseña. Replay reconocido devuelve el mismo recibo y no crea otra cuenta. La creación no sustituye al bootstrap y sigue prohibida hasta la fase autorizada.

## 6. Reset auditado de contraseña

Futuro PATCH `/api/usuarios/:id/password`: body exacto `password` y `motivo` obligatorio, conforme a la política. No aceptar rol, estado, plataformas, confirmación, actor, cv o snapshots. Permitir reset de una cuenta existente inactiva sin activarla, conservando el comportamiento comercial; un actor inactivo no puede realizarlo.

La foto de precondición devuelve solo datos públicos de identificación del objetivo y un ETag opaco calculado por servidor con su versión/estado; nunca revela hash, longitud, fragmento, password anterior ni cv del objetivo. Reutilizar contexto y confirmar el secreto una vez; no copiarlo al comparador general de conflictos.

Dentro de BEGIN/candado: revalidar identidad/estado/rol/cv/autenticación reciente, verificar ETag/contexto, bloquear objetivo, validar motivo/secreto, asignar bcrypt costo 12; el trigger incrementa la versión. Insertar `CAMBIAR_PASSWORD` 022 con actor/objetivo/instante/motivo/clave, ambos snapshots **NULL SQL**, descripción exacta `Cambio de contraseña`; registrar ledger y confirmar restricciones/COMMIT.

Volver a asignar el mismo texto mediante una intención nueva es un reset real: sal nueva, revocación y un evento. No consultar si coincide con el password anterior para decidir no-op ni comunicar esa igualdad. Una intención ya confirmada repetida con la misma clave no cambia hash/versión otra vez.

Dos Administradores sobre la misma foto se serializan: el primero confirma; el segundo recibe 412 por versión de objetivo obsoleta (o 409 si cambió otro contexto), sin segundo reset. Una nueva decisión humana requiere foto y UUID nuevos. El último Administrador activo puede cambiar su propia contraseña: no se cambia rol ni estado y no se pierde la única cuenta activa.

En cambio propio, la autorización aceptada al entrar en la transacción sigue siendo válida para confirmar esa misma operación. No volver a rechazar dentro de ella el token porque el propio UPDATE ya incrementó cv; eso desharía el reset previsto. Después del COMMIT todas las sesiones anteriores de esa cuenta, incluida la emisora y ambos equipos, quedan inválidas. No entregar un JWT nuevo dentro del recibo: exigir login explícito.

## 7. Resultado desconocido y recuperación segura

Conservar PK del ledger `(generacion_datos, id_usuario, clave)` y HMAC de intención. No ligar propiedad del recibo a un JWT concreto o a la versión antigua: el actor sigue siendo el mismo ID tras autenticarse otra vez. Sí exigir token actual, cuenta activa y rol Administrador al consultar. Otro actor recibe 404; una cuenta degradada/inactiva no obtiene el recibo mediante un privilegio histórico.

Al despachar una operación de credenciales, descartar el secreto de DOM, propuesta, comparador, ticket y cuerpo retenido por la aplicación tan pronto como el envío haya sido entregado al transporte; no prometer borrado criptográfico de copias internas de JavaScript. No guardar secreto en localStorage, archivos, argumentos, logs o drafts. La capa fetch lo necesita transitoriamente; evitar conservar una copia para replay.

Conservar **solo en RAM** una referencia de recuperación `{generacion, actorId, clave, tipo}` sin body, HMAC, ETag ni secreto. Debe sobrevivir a la limpieza ordinaria de sesión por un reset propio, en una rama específica que no conserve propuestas. Después de login como el mismo actor y generación, ofrecer GET `/api/comandos/:clave`; si cambia de actor, ocultarla/eliminarla. Cerrar la aplicación pierde esa referencia: se puede consultar una clave que el operador haya conservado, sin persistencia automática de borradores.

| Situación | Conducta |
| --- | --- |
| COMMIT confirmado pero respuesta perdida | Reautenticar si corresponde y recuperar el recibo; no reenviar contraseña |
| Token revocado antes de recuperar | Login nuevo; GET con mismo actor/clave y autorización actual |
| 404 desconocido/no concluyente | No afirmar rollback, no reintentar ni generar UUID automáticamente; inspección y decisión humana |
| Rechazo durable | Mostrar código/motivo público permitido; secreto ya descartado; una nueva intención requiere nueva captura/confirmación |
| Cambio propio exitoso con 401 concurrente o respuesta tardía | Limpiar sesión y secreto; conservar únicamente la referencia segura para después del login |
| Clave repetida con otro secreto/motivo | 409 de intención incompatible, sin revelar comparación del secreto |

El backend puede reconocer un replay explícito idéntico de API y devolver el recibo sin escribir; la interfaz de credenciales no necesita reenviar el body para recuperarlo y no debe hacerlo automáticamente. Los comandos ya confirmados y auditorías no se borran al revocar sesiones. Un reset del objetivo tampoco autoriza a ese objetivo a consultar el recibo de otro Administrador.

## 8. Bootstrap local del primer Administrador

Procedimiento futuro de instalación limpia, distinto del alta HTTP y de recuperación administrativa:

1. Herramienta local explícita, sin servidor HTTP de inicialización. Preflight de manifiesto/ACL/código, base, puerto, dirección loopback, system_identifier, generación, esquema 023 y roles SQL exactos. Rechazar destino no autorizado antes de escribir.
2. Autenticarse como aprovisionador local autorizado; en el laboratorio actual el propietario `ctsk_standalone_owner` es NOLOGIN y el aprovisionador puede asumirlo mediante SET LOCAL ROLE. El runtime nunca recibe esa capacidad. No dar por supuesto que un usuario Windows equivale a ese rol SQL.
3. La autenticación SQL utiliza un canal local previamente autorizado o un prompt protegido cuando sea necesario; nunca contraseña en argv, scripts, env exportado ni archivo de texto. El laboratorio de instalación debe pasar sus credenciales privadas por un canal de memoria controlado, no copiar el patrón `--pwfile` de initdb para capturar el secreto del Administrador de aplicación.
4. Verificar usuarios vacíos y constancia ausente antes de pedir el secreto. Comprobar que existe exactamente un rol funcional Administrador y que el esquema/seeds autorizados están listos; no crear roles faltantes silenciosamente.
5. Mostrar UUID técnico de intento no secreto. Pedir nombre/correo y contraseña dos veces con entrada sin eco, sin historial ni clipboard automático; validar política y confirmar localmente. bcrypt fuera del candado para no bloquear mientras se escribe o calcula.
6. BEGIN, asumir propietario autorizado, tomar candado común y `LOCK TABLE usuarios IN SHARE ROW EXCLUSIVE MODE`; releer en READ COMMITTED que **no existe ningún Usuario** y que la constancia sigue ausente. El bloqueo de tabla protege también frente a un INSERT que no use el candado cooperativo.
7. Insertar un Administrador activo, correo inequívoco, modo all, sin asignaciones y versión 1; insertar singleton técnico con UUID, ID resultado, instante/identidad/generación/esquema, principal SQL y huella revisada de herramienta. COMMIT único.
8. Mostrar solo constancia/IDs/resultado no secreto. El primer login es posterior, con la contraseña capturada por su titular; no emitir un JWT ni fabricar un evento HUMANO atribuido al Usuario recién creado.

Dos inicializadores se serializan y el segundo rechaza al encontrar Usuario/constancia. Fallo antes de COMMIT revierte ambos. Si se pierde la salida después del COMMIT, un modo local de consulta de constancia compara UUID e identidad; no vuelve a crear ni a resetear la cuenta. El archivo de salida es opcional y no sustituye a la constancia atómica.

Usuarios existentes, aunque todos estén inactivos o no quede un Administrador accesible, **bloquean bootstrap**. Usuario sin constancia en una base importada tampoco se convierte en instalación limpia. Recuperación de acceso requiere otro procedimiento aprobado con trazabilidad propia; no reutilizar este inicializador para conceder privilegios. No se diseña ni ejecuta aquí un bypass de recuperación.

## 9. Matriz de pruebas de seguridad para la implementación

Las siguientes son pruebas **planificadas**, no ejecutadas en esta fase. Hacerlas con HTTP/PostgreSQL reales en clústeres nuevos y separar sus resultados de Jest.

| Grupo | Casos y resultado exigido |
| --- | --- |
| Política nueva | 7/8 puntos de código; 71/72/73 bytes; Unicode multibyte; 18/19 emojis de cuatro bytes; blancos Unicode; NUL/sustituto aislado rechazados |
| Secreto exacto | Espacios extremos y composición Unicode no se cambian; confirmación diferente no se envía; no truncamiento/prefijo aceptado |
| Históricos | Menos de 8 puntos de código pero hash válido admitido en login dentro de límites; >72/blancos bloqueados sin cambiar hash; error genérico |
| Cuerpos | Metadatos, confirmación, cv, actor, snapshots, rol/estado en reset y campos extra de login rechazados |
| JWT | Firma/algoritmo/issuer/audience/tipo/generación; exp/iat; sub/cv mal formados; cv >2^53 tratado exactamente; token antiguo sin cv rechazado |
| Versión | Default 1; incremento por password/desactivar/reactivar; no-op no incrementa; actualización manual de versión denegada; overflow no envuelve |
| Dos equipos | Dos JWT de la misma cuenta funcionan; un reset invalida ambos; nueva autenticación funciona con cv nueva |
| Estado | Token anterior a desactivación no recupera validez tras reactivar; no se reactiva durante reset de cuenta inactiva |
| Login concurrente | Reset entre bcrypt.compare y firma: no emitir token nuevo desde el hash viejo; reset después de firma puede invalidar el token |
| Candado | Usuario/rol/cv revocados mientras espera: ninguna escritura/ledger nuevo; autenticación reciente vuelve a comprobarse |
| Foto de recuperación | GET esperando un reset usa una lectura posterior al candado en READ COMMITTED y rechaza cv vieja; una foto previa REPEATABLE READ no se reutiliza |
| Roles/alcance | Consulta no crea/resetea; Admin selected conserva alcance efectivo all sin cambiar filas; degradación bloquea recuperar recibos |
| Último Admin | Reset propio permitido y cuenta activa conservada; autodesactivación/autodegradación siguen prohibidas |
| Alta | Dos roles soportados, unicidad de correo, selected vacío, plataformas inexistentes, una foto pública/una auditoría/una cuenta |
| Correos | Duplicados por clave normalizada, diferencias de reglas históricas/Unicode, múltiples candidatos; rechazo sin fusión/normalización de historia |
| Reset | Un evento metadatos, fotos SQL NULL, descripción fija; ninguna longitud/hash/fragmento en salida; secreto igual con nueva intención revoca igualmente |
| Concurrencia de reset | Dos Admin/misma foto: un cambio y 412/409; una intención duplicada: una auditoría/un incremento |
| Idempotencia | Mismo UUID con otro motivo o secreto: 409; replay confirmado no repite bcrypt/UPDATE/incremento |
| Atomicidad | Fallos en hash/escritura/asignaciones/auditoría/ledger/deferred: rollback de filas y versión; técnicos no se afirman como rechazo durable |
| Datos secretos | Escaneo en memoria con secretos/hash/JWT reales del ensayo en logs, errores, recibos, Bitácora, comparadores, DOM y tickets descartados |
| Respuesta perdida | Tras COMMIT de alta/reset, recuperación GET sin body; no reenvío automático; 404 sigue no concluyente |
| Cambio propio | El incremento no invalida la transacción que lo produjo; otras peticiones 401; login nuevo y recuperación como mismo actor |
| Cambio de sesión | Ticket seguro sobrevive solo sin body; actor distinto no lo usa; sesión tardía no reintroduce secreto/recibo; cierre pierde RAM |
| 023 estricto | Columna/default/CHECK, trigger/funciones/ACL/PUBLIC, índice/collation, singleton inmutable, propietario/runtime y manipulación negativa |
| Compatibilidad | 020/021/022 rechazan manifiesto/estructura 023; perfiles antiguos intactos en clústeres propios; históricos y formatos 2/3 preservados |
| Historial incompatible | all con asignaciones: detener edición afectada sin reparar ni fabricar snapshots; reset solo metadatos no normaliza plataformas |
| Bootstrap limpio | Sin usuarios; secretos solo en prompt/memoria; rol/base/clúster incorrectos; dos procesos; fallo antes/después de INSERT; salida perdida |
| Bootstrap bloqueado | Existe cualquier Usuario, constancia previa o historia inconsistente: no inicializar/resetear; cero actor HUMANO ficticio |
| Aislamiento | Identidades/puertos loopback nuevos; cero conexiones a base principal; cierre de procesos/puertos, sin credenciales en evidencia |

## 10. Compatibilidad 020–022 y límites de la propuesta

No cambiar su SQL, protocolos ni lectores para que acepten 023. El perfil nuevo reutiliza la arquitectura del motor, los savepoints, la PK/guardias del ledger y la auditoría 022; la columna de versión no se añade a las fotos públicas ni a CAMBIAR_PASSWORD. Su ETag de credenciales es opaco y específico, sin usar hash de contraseña como dato de comparación.

La nueva autenticación se activa solo en la entrada 023: cambiar globalmente el middleware sin una rama explícita rompería perfiles anteriores. Una vez consolidada y autorizada la aplicación, todas las rutas de esa única entrada deberán validar el contrato nuevo; no dejar un puerto alternativo sobre la misma base que acepte JWT anteriores.

La compatibilidad es de comportamiento y preservación de datos, no identidad de estructura: el índice/columna/singleton/grants requieren el lector 023. Las claves/generaciones y tokens de perfiles anteriores no se transportan a la base nueva. No se reutilizan fixtures con cuentas predeterminadas como instalación real.

## 11. Riesgos y decisiones que requieren aprobación

Se propone aprobar el conjunto siguiente como una política coherente antes de implementarlo:

1. Ocho **puntos de código** para asignaciones nuevas, 72 bytes UTF-8, rechazo de blancos/NUL/Unicode mal formado y login histórico acotado, con posible bloqueo de secretos históricos incompatibles. No se han inspeccionado contraseñas reales para determinar cuántas cuentas resultarían afectadas.
2. Contrato JWT nuevo, rechazo inmediato de tokens anteriores y versión por password/estado, con rol/plataformas revalidados sin incremento. TTL 8 horas y autenticación reciente de cinco minutos para alta/reset.
3. Migración 023 de laboratorio: columna/guardia/grants por columna, clave única de correo y su regla de collation C, más singleton de inicialización. No cambiar la collation productiva por deducción.
4. Procedimiento local de autenticación del instalador y permisos SQL exactos. El runtime no obtiene privilegios de instalación; un propietario malicioso o un host comprometido siguen fuera de la protección que puede ofrecer ese mismo propietario de DB.
5. Referencia de recuperación mínima en RAM entre cierre de sesión y login, sin borradores persistentes ni secreto. La pérdida de la aplicación puede exigir conservar/conocer la clave por medios externos seguros.
6. Recuperación administrativa de una base ya poblada, especialmente si todos los Admin tienen secretos históricos rechazados. Es una decisión pendiente antes de producción; no suplirla con bootstrap ni una cuenta oculta.

La propuesta no afirma una revocación por dispositivo individual, logout remoto selectivo, MFA ni recuperación por correo/WhatsApp. No se incorporan esas infraestructuras. El contexto de comandos sigue siendo conservador; un cambio de credenciales puede invalidar precondiciones pendientes y exigir decisión humana.

## 12. Plan mínimo e instrucción para la siguiente fase

Dos entregas de implementación, con hitos internos y una consolidación posterior, evitan una fase por cada componente:

| Entrega | Contenido y dependencias | Condición de cierre |
| --- | --- | --- |
| Primera: A + B | A: 023, política/versión/login/middleware/revalidación/verificador. Después B: POST Usuario y PATCH password auditados en perfil nuevo. Estructura singleton preparada, sin bootstrap ejecutado | HTTP/PostgreSQL reales, rollback, revocación de dos sesiones, reset propio y recuperación; ningún secreto en salidas |
| Segunda: C + D | D: herramienta local y ensayo de instalación limpia; C: adaptar Usuarios/Configuración y Bitácora originales sobre backend aprobado. D depende de A, no necesita esperar una interfaz nueva; puede validarse primero en esta entrega | Primer Admin real del ensayo, luego login/altas/reset/catálogos desde formularios, PDF/regresiones pertinentes y cierre seguro |
| Prioridad posterior | Consolidar módulos en una sola entrada/aplicación con el contrato de seguridad aprobado, retirar entradas alternativas sobre la misma base y realizar aceptación | Sin activar producción o distribución hasta autorizar sus datos/pruebas/instalación |

No dividir A y B en múltiples entregas si la dependencia puede verificarse en orden dentro del mismo laboratorio. No ejecutar B mientras la comprobación de versión de A esté incompleta. C y D pueden compartir una entrega porque ambos usan ese backend estable; no se necesitan más tablas/migraciones para la constancia si se aprobó su estructura en 023.

**Instrucción lista para una solicitud posterior, después de revisar y aprobar este diseño; no ejecutada ahora:**

> Implementar exclusivamente en laboratorio la primera entrega A+B de `docs/LOCAL-FASE-2D9B2C.md`: migración 023 propuesta, versión durable y guardia de credenciales, índice/normalización de correo y estructura técnica singleton; política bcrypt12/Unicode/72 bytes, JWT versionado y revalidación tras candado; POST Usuarios y PATCH password auditados con motor 020 y Bitácora 022, incluidos cambio propio y recuperación después de login nuevo. Crear perfil/manifiesto/protocolo 023 propios en clúster nuevo y loopback. Conservar 018–022 y perfiles anteriores, fuentes locales y no-op/roles/plataformas existentes. Permitir cuentas iniciales solo mediante fixtures privados. Autorizar en ese laboratorio únicamente los resets sintéticos necesarios para las pruebas expresamente enumeradas, nunca bases o credenciales existentes. No ejecutar CommandApiLab completo ni regresiones no revisadas. Probar HTTP/PostgreSQL, versiones exactas, concurrencia, secretos, rollback, cuentas inactivas/reactivadas y respuesta perdida. No iniciar formularios, bootstrap, entrada principal ni producción. Presentar resultados nuevos, evidencias, limitaciones y reversión selectiva antes de la siguiente entrega.

Este documento no constituye aprobación automática de esa implementación. La única reversión de esta fase documental consiste en retirar sus archivos nuevos si sus hashes coinciden y se decide hacerlo; no hay fuentes previas que restaurar ni base que revertir. La evidencia de conservación está en `docs/local-fase-2d9b2c/`.
