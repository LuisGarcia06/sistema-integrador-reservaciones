# Fase 2D.8B.2 - Auditoria transaccional de servicios backend

Estado: COMPLETADO EN LABORATORIO. Fecha: 27 de octubre de 2026.

Los servicios reales de Operaciones, Transportes y observaciones Daily generan auditoria estructurada 021 y la confirman con el cambio de negocio y el comando durable. La ejecucion final utilizo HTTP y PostgreSQL reales, en un cluster sintetico nuevo. No se modificaron interfaces ni se inicio 2D.8B.3. No hay activacion productiva.

## 1. Resultado comprobado

| Verificacion | Resultado |
| --- | --- |
| Grupos HTTP/PostgreSQL finales | 44 aprobados |
| Solicitudes HTTP registradas | 161, incluida una respuesta perdida intencionadamente |
| Auditorias funcionales persistidas | 17 |
| Comandos confirmados | 22; cinco sin cambio con ids_bitacora vacio |
| Rechazos funcionales durables | 23, sin auditoria de exito |
| Pruebas de mismo cliente/PID/transaccion principal/savepoints | 17, una por auditoria confirmada |
| Fallos tecnicos con rollback verificado | 7 |
| Jest aislado | 1.010 pruebas en 35 suites; cero fallos |
| Regresion HTTP/PostgreSQL del perfil 020 original | 22 grupos aprobados |
| Regresion audit-schema-lab original | 94 comprobaciones aprobadas |
| Laboratorios creados en esta fase | 4; todos detenidos |
| Cierre del sistema operativo | 8 puertos sin listeners; cero procesos asociados |

La primera ejecucion API aprobo 41 grupos. La final amplio las pruebas de savepoints, cambio de tour y fallos de Transportes/Daily; sus evidencias estan separadas y no se suman los resultados de ambas como casos distintos.

## 2. Archivos modificados

Se registro una base de 519 archivos y se conservaron 506 identicos. Los siguientes 13 archivos tienen cambios deliberados; no hubo eliminaciones:

| Archivo | Cambio |
| --- | --- |
| backend/config/operationalTransactions.js | Reconocer exclusivamente audit-api-lab con esquema 021; mantener candado comun |
| backend/config/revisionApiTransactions.js | Perfil nuevo, contexto autenticado ligado al cliente y ciclo de vida transaccional |
| backend/revisionApiApp.js | Componer el perfil nuevo con rutas/lecturas cerradas; mantener ramas anteriores |
| backend/services/comandos.service.js | Contrato/protocolo inyectables y establecimiento del actor validado dentro del intento |
| backend/services/bitacora.service.js | Escritor estructurado nuevo, snapshot cerrado y motivo; escritor/consulta historicos conservados |
| backend/services/operaciones.service.js | Auditoria de alta y edicion efectivas |
| backend/services/transportes.service.js | Auditoria de alta y edicion efectivas |
| backend/services/daily.service.js | Existencia real, no-op sin timestamp nuevo y auditoria de alta/edicion |
| backend/controllers/operaciones.controller.js | Separar motivo y distinguir fallo tecnico de auditoria |
| backend/controllers/transportes.controller.js | Mismo tratamiento para Transportes |
| backend/controllers/daily.controller.js | Mismo tratamiento para observaciones generales |
| backend/validators/operaciones.validator.js | Opcion interna para motivo solo como solicitud sin efecto; default historico intacto |
| backend/validators/transportes.validator.js | Misma opcion, sin aceptar nuevas columnas comerciales |

## 3. Archivos nuevos

| Archivo | Funcion |
| --- | --- |
| backend/auditApi.js | Entrada HTTP aislada que verifica el contrato antes de escuchar |
| backend/config/auditApiPolicy.js | Manifiesto, esquema, identidad, claves, huella, protocolo y rutas cerradas |
| backend/validators/auditoria.validator.js | Politica de motivo y separacion de metadatos del payload comercial |
| backend/__tests__/auditApi.test.js | 35 pruebas aisladas del perfil, rutas, motivos y contexto transaccional |
| scripts/AuditApiLab.ps1 | Directorio privado nuevo, entorno limpio y ejecucion sin ventana |
| scripts/auditApiLab.cjs | Aprovisionamiento, pruebas, arranques negativos, reinicio y cierre |
| scripts/auditApiCases.cjs | Pruebas HTTP/PostgreSQL de servicios reales |
| scripts/auditApiServerProbe.cjs | Instrumentacion privada IPC para fallos y pruebas de cliente/transaccion |

Se agregan este informe y evidencias en docs/local-fase-2d8b2/. Se guardaron respaldos selectivos de los 13 archivos anteriores y hashes antes/despues.

Permanecen intactos backend/server.js, Electron, frontend completo, Reservaciones, integraciones, database/schema.sql, migraciones 018/019/020/021, verificadores 019/020/021 y el perfil audit-schema-lab. Tampoco se modifico backend/config/database.js: la conexion sigue centralizada alli y usa la seleccion explicita del perfil operativo verificado.

## 4. Nuevo contrato de laboratorio

Perfil: audit-api-lab. Esquema: 021. Manifiesto: version 6. Proposito: transactional-audit-writers-lab. Protocolo HTTP: ctsk-audit-api-v1.

La entrada requiere manifiesto privado, configuracion coherente, dos claves distintas, hashes correctos, proceso PostgreSQL del directorio nuevo, identidad de base/cluster/usuario/puerto y rol seguro. Comprueba la estructura exacta 019, ledger 020 y catalogo 021 antes de crear el listener HTTP. Solo escucha en 127.0.0.1.

Las cinco escrituras habilitadas son:

- POST /api/operaciones
- PATCH /api/operaciones/:id
- POST /api/transportes
- PATCH /api/transportes/:id
- PUT /api/daily/observaciones?fecha=YYYY-MM-DD

Se admiten POST login, GET/HEAD sesion, POST precondiciones para esas cinco rutas, GET/HEAD recuperacion de comandos y detalles de Operaciones/Transportes y observaciones Daily necesarios para obtener fotos y revalidar alcance. No hay listados generales ni visualizacion de Bitacora en este perfil.

Reservaciones, Usuarios, Catalogos, Integraciones y POST Bitacora estan bloqueados. Tampoco se habilitan receptores, frontend o workers. Las rutas no normalizadas, parametros extra/duplicados y fechas imposibles se rechazan. No existe endpoint de auditoria ni controles HTTP de inyeccion de fallos.

Los lectores anteriores rechazan el manifiesto nuevo. La adicion explicita audit-api-lab/021 a la infraestructura transaccional no permite que command-api-lab acepte 021 ni que audit-schema-lab arranque HTTP. Sus validadores y entradas no se alteraron.

## 5. Contexto autenticado y escritor estructurado

El ejecutor relee usuario activo, rol, alcance y nombre dentro del candado y del intento protegido. Despues de verificar las precondiciones, establece un contexto interno con ID/nombre del actor, generacion del manifiesto, clave validada, recurso y motivo original.

auditContext exige el mismo cliente facade de la transaccion vigente, con PID real, escrituras autorizadas y contexto autenticado. Rechaza otro cliente, un objeto parecido, una lectura o un cliente que escapo de una transaccion terminada. El contexto y actor estan congelados.

registrarAuditoriaEstructurada exige ese cliente explicitamente, comprueba el recurso y utiliza el identificador devuelto por PostgreSQL. Proyecta exclusivamente las columnas 021 desde las filas leidas/persistidas por los servicios. Fecha/hora e instante se generan con CURRENT_TIMESTAMP; el nombre se toma de la lectura autorizada, no del cuerpo del cliente.

El INSERT conserva el patron INSERT INTO bitacora ... RETURNING id_bitacora, que alimenta la captura existente de IDs. No usa el pool predeterminado ni confirma por separado.

El escritor historico crearEntradaBitacora y consultarBitacora mantienen su logica. La consulta estructurada para la pantalla queda fuera de esta fase.

## 6. Motivo y snapshots

El cuerpo original incluye motivo y participa completo en la huella HMAC de idempotencia. Antes de validar el negocio, el controlador separa motivo exclusivamente en el perfil nuevo. No se agrega a los arrays de columnas actualizables ni se almacena como observacion comercial.

El motivo, si se proporciona, debe ser string con contenido tras trim y hasta 500 caracteres Unicode. En modificaciones efectivas es obligatorio; en creaciones es opcional. No se generan textos automaticos en nombre del usuario. Se aceptaron 500 emojis y se rechazaron valores no textuales, NULL, vacios, espacios Unicode y exceso de longitud.

Misma clave con otro motivo produce CLAVE_IDEMPOTENCIA_REUTILIZADA. El motivo normalizado se guarda en auditoria; la intencion original permanece ligada al cuerpo original y sus precondiciones.

Snapshots permitidos:

| Recurso | Columnas |
| --- | --- |
| Operaciones | fecha, id_tour, turno, numero_grupo, hora_inicio, id_guia, estado |
| Transportes | id_operacion_tour, id_vehiculo, id_operador, observaciones_operador, estado |
| Daily | fecha, observaciones |

El esquema 021 vuelve a validar tipos, claves, accion, origen, motivo y referencias. Se compararon snapshots con las filas reales antes y despues del guardado. Los campos actor, instante, origen, nombre, snapshots o comando enviados por el cliente son rechazados por los validadores comerciales.

No se registran cuerpos completos, JWT, passwords o credenciales. Los textos libres funcionales siguen siendo responsabilidad de quien los captura; no existe un detector automatico de secretos dentro de ellos.

## 7. Cobertura real por servicio

| Servicio | Creacion | Edicion | Solicitud sin efecto |
| --- | --- | --- | --- |
| Operaciones | POST real, datos persistidos, CREAR y replay | Fecha, tour, turno, grupo, guia, hora y estado; una entrada por guardado | Hora normalizada identica y motivo solo: revision/filas intactas, IDs vacios |
| Transportes | POST real sin vehiculo inicial, CREAR y replay | Operacion, vehiculo, operador, estado y observaciones; incluye NULL al retirar notas | Relacion identica y motivo solo: sin UPDATE, revision ni auditoria |
| Daily | Fila ausente con texto vacio crea fila y CREAR | Texto nuevo y limpieza a vacio con motivo, anterior/nuevo reales | Texto normalizado identico conserva fila y ultima_actualizacion |

Preparar sugerencia sigue usando el POST normal de Operaciones; no se anadio otra auditoria ni un evento artificial de sugerencia.

La edicion de Operaciones toma la fila actual despues de los bloqueos existentes. Transportes conserva capacidad, minimo de pasajeros, unicidad del grupo y compatibilidad de reservaciones. Se probaron tanto rechazo de vehiculo sin minimo como asignacion valida con pasajeros suficientes. El cambio de operacion utiliza la accion backend ya existente; no se agrego una interfaz ni movimiento automatico.

Daily consulta existencia real con FOR UPDATE dentro del candado comun. Solo ejecuta el UPSERT original cuando corresponde. El motivo solo no sustituye el campo obligatorio observaciones de ese contrato.

Los cambios de estos servicios se activan exclusivamente en audit-api-lab. Los perfiles anteriores conservan su comportamiento, incluido el guardado Daily anterior.

## 8. Atomicidad, recibos y fallos

La transaccion exterior conserva BEGIN, candado transaccional existente, autorizacion actual, precondiciones/contexto, intento con savepoint, servicios reales, auditoria, ledger, restricciones diferidas y COMMIT antes de responder.

Los BEGIN/COMMIT internos de los servicios son savepoints y no liberan la transaccion exterior. El probe privado observa las consultas reales del pg.Client, su identidad de objeto, PID y pg_current_xact_id. Las 17 auditorias confirmadas tienen negocio, auditoria y ledger en ese mismo cliente/PID/transaccion principal y evidencia de savepoint interno y liberacion del intento. No se comparan xmin de subtransacciones.

El replay se resuelve antes de invocar al escritor, con autorizacion vigente y huella identica. Se probaron dos HTTP simultaneos de una intencion, recibo confirmado repetido, respuesta perdida despues del COMMIT y recuperacion despues de reiniciar el backend.

Los recibos confirmados sin cambios conservan ids_bitacora: []; no se inventa un ID ni se presenta la confirmacion de la solicitud como una modificacion material.

Se ejecutaron siete fallos privados:

1. Error PostgreSQL al intentar insertar auditoria de Operaciones.
2. Fallo despues de insertar auditoria y antes del ledger.
3. Error PostgreSQL del ledger.
4. Fallo despues de insertar ledger y antes de COMMIT.
5. Recibo alterado exclusivamente por el probe para disparar la restriccion diferida al COMMIT.
6. Fallo de auditoria en el servicio real de Transportes.
7. Fallo diferido en el guardado real de Daily.

En cada caso se comparo SHA-256 de todas las tablas funcionales, Bitacora y ledger antes/despues. No persistieron cambios, revision, timestamp, auditoria ni comando. La respuesta fue 500 y la recuperacion quedo desconocida, no un rechazo funcional inventado. Los fallos de auditoria se distinguen de errores comerciales para que un error FK/SQL de auditoria no sea convertido en un rechazo durable 400.

El probe solo se instala en scripts/auditApiServerProbe.cjs y recibe instrucciones por IPC del corredor. La entrada backend/auditApi.js no importa ese archivo. No se modificaron los triggers ni las migraciones para permitir fallos.

## 9. Autorizacion y concurrencia

Dos administradores compitieron con la misma foto: un exito, un 412 y una auditoria. Un cambio en otro recurso produjo 409 de contexto sin auditoria falsa; se recupero y repitio el rechazo durable sin nuevos efectos.

Consulta all y Consulta selected no pudieron ejecutar ninguna de las cinco escrituras ni recuperar recibos. selected mantuvo la restriccion de lectura operativa. Otro Administrador no obtuvo comandos de un actor distinto.

Se mantuvo una peticion esperando el candado mientras el coordinador privado desactivaba o degradaba al usuario dentro de la transaccion que retenia el candado. Al liberarlo, la respuesta tardia fue 403, sin negocio, auditoria ni ledger; la recuperacion del recibo anterior tambien fue denegada. Esto acredita revalidacion despues de esperar, no revocacion retroactiva de un COMMIT ya autorizado.

El nombre historico de una auditoria anterior se conservo al renombrar despues al usuario ficticio. La preparacion de usuarios, catalogos y cambios de permisos para pruebas fue SQL privado del aprovisionador, nunca endpoints habilitados del perfil.

## 10. Arranque, aislamiento y regresiones

Se comprobo con procesos reales que el servidor rechaza antes de escuchar: un trigger 021 deshabilitado, codigo incompatible, configuracion de esquema incorrecta y clave privada alterada. El entrypoint commandApi.js anterior tambien rechazo el manifiesto nuevo. Se restauro cada alteracion privada y se verifico nuevamente el contrato exacto.

Cada laboratorio uso un directorio privado nuevo, cluster PostgreSQL 18.3 nuevo, base sintetica, datos ficticios y generacion propia. El aprovisionador verifico el cluster nuevo y su base de mantenimiento postgres antes de crear la base sintetica, aplico las migraciones en orden y no abrio conexiones a bases existentes.

Las 165 conexiones registradas del coordinador final apuntan exclusivamente a su propio 127.0.0.1:puerto PostgreSQL/HTTP. El proceso backend restringe conexiones salientes al PostgreSQL de su manifiesto; bloquea fetch externo y UDP. No se leyeron .env ni secretos reales. No hubo LAN, servicios Windows, tareas, firewall, certificados, ngrok o instalacion.

Jest ejecuto las 975 pruebas anteriores y 35 nuevas con PostgreSQL real bloqueado. El perfil original 020 aprobo 22 grupos HTTP/PostgreSQL, incluidos escritores historicos de Reservaciones, idempotencia, fallos y recuperacion. audit-schema-lab aprobo sus 94 comprobaciones de esquema y sigue sin HTTP. El frontend completo, formato PDF e impresion permanecen byte a byte iguales a la base de esta fase; no se afirma una integracion nueva de interfaz.

Los cuatro laboratorios quedaron detenidos. closure.json verifica archivos postmaster.pid ausentes, ningun listener en sus ocho puertos y ningun proceso PostgreSQL/backend asociado por PID o directorio.

## 11. Evidencias

- api-final.log y api-verification.json: 44 grupos, filas auditadas, recibos, 161 llamadas, 17 pruebas principales y siete rollbacks.
- api-server-final.log: salida del proceso de pruebas; los errores tecnicos esperados corresponden a la inyeccion privada.
- commands-regression.log y commands-verification.json: perfil 020 original.
- schema-regression.log y schema-verification.json: perfil de esquema 021 original.
- jest-final.log y jest-final.json: 1.010 pruebas/35 suites.
- source-verification.json y local-fase-2d8b2-before.json: cambios y preservacion de los 519 archivos previos.
- labs.json y closure.json: destinos propios y cierre.
- before/ y reversion-manifest.json: respaldos selectivos y SHA de versiones anteriores/actuales.

No se copian runtime.env, claves privadas, credenciales de prueba o JWT a las evidencias del repositorio.

## 12. Limites y reversion selectiva

Este resultado valida servicios backend reales dentro del laboratorio. Los formularios originales todavia no capturan el motivo nuevo y la pantalla Bitacora no muestra el formato ampliado. Eso corresponde a 2D.8B.3. No hay API productiva ni despliegue autorizado.

Las instantaneas son de las columnas funcionales permitidas, no de filas completas con datos innecesarios. El esquema no demuestra por si mismo que el texto del motivo sea veraz; el escritor acredita que procede del campo humano validado y conserva exactamente su texto normalizado.

La recuperacion desconocida no autoriza reenvio automatico ni permite inferir rollback. Los recibos recuperados tampoco sustituyen una consulta actual del recurso. La vigencia de una interfaz tras cambio de sesion no se prueba en esta fase sin frontend.

Para reproducir ejecutar desde la raiz: powershell.exe -NoProfile -NonInteractive -File scripts/AuditApiLab.ps1 -Mode Verify. Verify siempre crea un directorio y cluster nuevos y cierra sus procesos al terminar; no acepta directorio existente como destino de migracion.

Para revertir, detener primero cualquier laboratorio propio y conservar evidencias. Comparar los SHA actuales con reversion-manifest.json; restaurar exclusivamente los 13 archivos enumerados desde before/ solo si no hay cambios posteriores. Retirar los ocho archivos nuevos solo si no existen dependencias de fases posteriores. No utilizar git reset, git clean ni restauraciones masivas. No ejecutar DOWN destructivo ni borrar auditorias; volver a un perfil anterior creando otro cluster sintetico nuevo con su contrato original.

## 13. Siguiente fase

Revisar estos resultados antes de autorizar 2D.8B.3. La siguiente tarea puede incorporar el campo motivo en los formularios originales, conservarlo en conflictos/incertidumbre y presentar los recursos/valores/motivos nuevos en Bitacora con los permisos existentes. Debe mantener los recibos y reglas probadas aqui, sin introducir llamadas separadas de auditoria desde frontend ni activar produccion.
