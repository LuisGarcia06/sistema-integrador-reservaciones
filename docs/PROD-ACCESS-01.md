# PROD-ACCESS-01 — Diagnóstico y preparación de migración 016

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.

Diagnóstico del **15 de octubre de 2026**, America/Cancun (UTC−05:00). Última comprobación PostgreSQL: 19:58:41. Fase exclusivamente de diagnóstico y planificación.

**La 016 está pendiente. Su SQL es compatible con las estructuras observadas, pero la base todavía NO está lista para autorizar la actualización:** faltan restauración ensayada, custodia restringida del respaldo, cuenta de aplicación apropiada, arranque protegido para principal y ventana acordada. No se ejecutó ninguna de esas acciones.

Por decisión expresa del usuario, se conservan los datos actuales como datos de prueba durante el desarrollo. La limpieza corresponde a **FINAL-DB-01**, futura e independiente: conservar estructura, migraciones, permisos necesarios, catálogos técnicos indispensables y un Administrador inicial seguro. Aquí no se realizó limpieza.

## 1. Revisión e identidad

Se revisaron AGENTS.md; ACCESS-SCOPE-02, 03A, 03B, 04A, 04B, 05A, su matriz y 05B.1 (ACCESS-SCOPE-05B-preparacion.md); DEV-DB-02, 03 y 03-FIX; migraciones, schema.sql; configuración pg, servicios de alcance/usuarios y arranques normal/protegido. No se encontraron informes independientes ACCESS-SCOPE-01 ni DEV-DB-01 en los archivos del repositorio consultados. DEV-DB-02 conserva referencias al diagnóstico inicial. No se inventa contenido de informes ausentes.

| Propiedad comprobada | Resultado |
| --- | --- |
| Base real | sian_kaan_reservaciones |
| Host solicitado / servidor | localhost / ::1/128 |
| Puerto | 5432 |
| PostgreSQL | 18.3 |
| Esquema activo | public |
| search_path | "$user", public |
| Identificador del clúster | 7632825987452064788 |
| Usuario de diagnóstico / propietario | postgres / postgres |
| Codificación | UTF8 |
| Collation / ctype | Spanish_Mexico.1252 |
| Tamaño orientativo | 10.122.943 bytes |
| Modo de consultas | default_transaction_read_only=on y REPEATABLE READ READ ONLY |

Se fijaron explícitamente host, puerto y base y se comprobó la identidad real antes del inventario. Se limitaron tiempos de consulta/bloqueo. No se importó Express ni se inició Electron, workers o integraciones. Las conexiones terminaron con ROLLBACK y cierre del cliente.

## 2. Estructura y registros actuales

Existen **17 tablas public, 17 PK, 16 FK, 14 CHECK y 12 restricciones UNIQUE**, todas las restricciones consultadas validadas. Los NOT NULL se inventariaron aparte. No se encontraron triggers de usuario en public ni triggers de evento.

| Tabla | Registros |
| --- | ---: |
| bitacora | 55 |
| daily_observaciones | 0 |
| equivalencias_tours_externos | 1 |
| eventos_integracion | 136 |
| guias | 1 |
| integracion_sync_estado | 1 |
| operaciones_tour | 9 |
| operadores | 1 |
| paises | 3 |
| plataformas | 5 |
| reservaciones | 1.144 |
| reservas_integracion_link | 2 |
| roles | 2 |
| tours | 14 |
| transportes_operacion | 9 |
| usuarios | 2 |
| vehiculos | 2 |

Solo se obtuvieron recuentos y catálogos técnicos; no se extrajeron nombres de clientes/usuarios, correos, teléfonos, contraseñas ni hashes de contraseñas.

Columnas de usuarios: id_usuario INTEGER IDENTITY ALWAYS, id_rol INTEGER, nombre VARCHAR(100), correo VARCHAR(100), password VARCHAR(255), estado BOOLEAN. Todas NOT NULL. id_usuario es PK, correo tiene UNIQUE e id_rol referencia roles(id_rol). plataformas.id_plataforma es INTEGER y PK. Son referencias aptas para las dos FK nuevas. Existen índices únicos normalizados de nombres de países y plataformas.

Roles funcionales: Administrador y Consulta, cada uno con un usuario activo. No se modificaron cuentas.

| Plataforma existente | ID actual | Reservaciones |
| --- | ---: | ---: |
| FareHarbor | 1 | 36 |
| GetYourGuide | 2 | 517 |
| WhatsApp Business | 3 | 143 |
| Externa | 4 | 448 |
| Booking Directo | 20 | 0 |

Booking Directo ya existía; no se añadió ni retiró. No fijar estos IDs en código: resolver el catálogo del destino.

Las 16 FK enlazan: usuarios→roles; operaciones_tour→tours/guias; transportes_operacion→operaciones_tour/vehiculos/operadores; reservaciones→tours/paises/plataformas/transportes_operacion; eventos_integracion→usuarios por applied_by y reviewed_by; reservas_integracion_link→reservaciones; equivalencias_tours_externos→tours; bitacora→usuarios/reservaciones. Cada tabla dispone de su PK de identidad. Los recuentos específicos de usuarios sin rol y reservaciones sin plataforma fueron cero.

Los 14 CHECK comprueban: vehículo de capacidad 1–12; turno y grupo 1–2 en operaciones; turno histórico nullable y textos no vacíos de idioma/motivo de cancelación en reservaciones; estados de revisión/aplicación de eventos; turno y cinco campos no vacíos de equivalencias. La 016 no altera estas reglas. Los límites agregados 12/24 PAX siguen en el backend existente.

**016 pendiente:** no existe usuarios.alcance_plataformas, no existe usuario_plataformas_visibles ni se encontraron sus nombres de objetos/restricciones en conflicto. La comparación estática de tablas/columnas con schema.sql mostró únicamente esas adiciones faltantes; no prueba igualdad completa de tipos, índices o defaults.

No se detectó tabla de historial de migraciones por nombre en los esquemas de usuario ni runner en aplicación/package.json. Existen los SQL 001–016, pero eso no acredita cuándo se aplicaron. Están las columnas de recuperación de 015 y tablas de integración previas. El estado de 016 se determina por sus efectos ausentes, sin inventar historial.

## 3. Compatibilidad de la migración

Archivo: database/migrations/016_alcance_plataformas_usuarios.sql.

SHA-256: `41bc5fb45c636040ba229eec2f2113431dbb33599b625222a5a0dc39b4b260f3`.

| Operación | Efecto esperado, aún no ejecutado |
| --- | --- |
| BEGIN | Una transacción para todo el cambio |
| ADD COLUMN alcance_plataformas VARCHAR(20) NOT NULL DEFAULT 'all' | Los dos usuarios existentes reciben all sin eliminar filas |
| CHECK chk_usuarios_alcance_plataformas | Solo all o selected |
| SET DEFAULT 'selected' | Nuevas inserciones que omitan columna parten de selected; no cambia el all anterior |
| CREATE TABLE usuario_plataformas_visibles | Puente inicialmente vacío, dos INTEGER NOT NULL |
| PK compuesta | Unicidad de (id_usuario, id_plataforma) |
| Dos FK | Usuarios y plataformas; sin cascadas |
| COMMIT | Confirma conjuntamente columna, default, restricciones y puente |

Conserva usuarios, IDs, hashes de contraseña, roles, estado y reservaciones; también los demás registros. No contiene UPDATE/DELETE de columnas anteriores ni cambios de contraseña. Sí cambia la estructura de usuarios y añade el valor observable all a sus filas: no describirla como ausencia total de cambios.

El cambio de default afecta operaciones posteriores. PostgreSQL puede representar el default constante inicial mediante metadatos; ello no elimina el bloqueo ni la validación de restricciones. [PostgreSQL 18: ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).

Administrador conserva acceso completo por rol; Consulta all conserva lectura general; selected ve solo asignaciones y, si están vacías, cero reservas. El default SQL no sustituye las validaciones explícitas de la API al crear usuarios.

No se detectaron colisiones ni incompatibilidad estructural evidente para 016. **No es idempotente:** repetirla provoca conflicto de columna/tabla. schema.sql ya incluye ACCESS-SCOPE y es para instalaciones nuevas: nunca cargarlo ni ejecutar seeds.sql en esta principal para actualizarla.

04A documenta migración/rollback reales en un clúster sintético y conservación de usuarios/password hashes/reservas. Es evidencia histórica, no ensayo del respaldo actual ni autorización sobre principal. Aquí no se repitió.

## 4. Riesgos

| Riesgo | Tratamiento futuro |
| --- | --- |
| Bloqueos ALTER/FK | Ventana sin escritores/clientes; revisar transacciones; lock_timeout y statement_timeout acordados |
| Cuentas existentes quedan all | Preservación intencional; restricción posterior solo por decisión administrativa |
| SQL sin public cualificado | Fijar/verificar search_path=public en la conexión de ejecución |
| Repetición/estado parcial | Revalidar ausencia de columna, puente y restricciones; ejecutar una vez |
| Backend exige 016 | Login/sesión/lecturas fallan sin esquema; no abrir principal antes de migrar |
| Binarios anteriores | Pueden ignorar selected; impedir convivencia/relanzamiento |
| Cuenta habitual postgres | Separar mantenimiento de ejecución de aplicación con cuenta limitada |
| Respaldo no restaurado | No autorizar cambio hasta demostrar recuperación y duración |
| ACL amplias del respaldo | Custodia/copia restringida autorizada antes del ensayo |
| Puerto 3000 ocupado | Coordinar cierre; no adoptar ni terminar el proceso ajeno |
| Sin tracking/mantenimiento automático | Registro externo y coordinación verificable de todos los escritores |

ALTER TABLE puede requerir ACCESS EXCLUSIVE sobre usuarios y las FK bloqueos sobre sus referencias. Una transacción larga puede impedir el cambio aun con pocos usuarios; no se promete duración. [PostgreSQL 18: bloqueos](https://www.postgresql.org/docs/18/sql-altertable.html).

En pg_stat_activity no se observaron otras sesiones de principal/desarrollo ni bloqueos externos sobre usuarios/plataformas en esas instantáneas. **Es puntual y no demuestra ausencia de procesos/escritores futuros.** Existe un backend de desarrollo en 3000. Repetir inventario y confirmación humana durante la ventana.

## 5. Respaldo localizado

Ruta: `A:\Respaldos_PostgreSQL\sian_kaan_reservaciones.backup`.

| Verificación | Resultado |
| --- | --- |
| Tamaño | 120.691 bytes |
| Cabecera / formato | PGDMP / CUSTOM, dump 1.16-0, gzip |
| Creación declarada en archivo | 14/10/2026 21:10:23; cabecera sin zona, coherente con America/Cancun |
| Creación del archivo UTC | 15/10/2026 02:10:23.564Z |
| Última escritura America/Cancun | 14/10/2026 21:10:38 |
| Última escritura UTC | 15/10/2026 02:10:38.563Z |
| Base declarada | sian_kaan_reservaciones |
| Generado desde / mediante | PostgreSQL 18.3 / pg_dump 18.3 |
| Herramienta de inspección | pg_restore 18.3 instalado en PostgreSQL 18 |
| pg_restore --list | Código 0, reconocido |
| Catálogo | 121 entradas declaradas; 17 tablas y 17 entradas TABLE DATA visibles |
| Puente ACCESS-SCOPE en listado | Ausente |
| Archivo tras inspección | Misma fecha/tamaño/hash; no sobrescrito ni restaurado |

SHA-256 de referencia:

`ae04d64ffb9155794ffb9e1a60ec657c3b044121dad74070ecf5c2de3047389f`

El hash identifica los bytes actuales; no hay aquí un manifiesto previo de confianza que pruebe autenticidad. No se extrajeron datos ni SQL del archivo. El listado no determina las columnas internas de usuarios: su estado actual se comprobó en la base.

**pg_restore --list solo lee el catálogo. No sustituye una restauración real ni prueba todos los bloques de datos.** [PostgreSQL 18: pg_restore --list](https://www.postgresql.org/docs/18/app-pgrestore.html).

ACL heredadas observadas: Administradores/SYSTEM con FullControl; Authenticated Users con Modify; Usuarios con ReadAndExecute. El respaldo no está restringido exclusivamente al responsable y SYSTEM. No se cambiaron ACL: se debe autorizar custodia restringida y copia protegida, conservando original/hash.

No se puede afirmar que contenga exactamente los registros actuales, porque no se restauró ni cotejó su contenido. Hará falta un respaldo nuevo tras detener escrituras, sin sobrescribir este. pg_dump de una base no incluye roles globales: preparar inventario protegido y estrategia de recuperación de cuentas/privilegios. [PostgreSQL 18: alcance de pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).

## 6. Restauración de prueba: requisitos y procedimiento

**Propuesta pendiente de autorización; no ejecutada.** Aprobar responsable, host/clúster, directorio, puerto libre distinto, base nueva, cuenta de mantenimiento del laboratorio, copia/custodia y criterios de aceptación. Preferir otro clúster aislado; una base distinta en el mismo clúster ofrece menor separación. No usar principal, desarrollo ni una base _test existente como destino.

1. Registrar ruta/hash del respaldo aprobado y proteger la copia de trabajo. Mantener confidencialidad aunque los datos se declaren ficticios; no logs de datos/claves ni APIs externas.
2. Verificar binarios 18.3 ya instalados, espacio suficiente, UTF8 y disponibilidad de Spanish_Mexico.1252. Si se elige otro SO, resolver locale antes de crear destino.
3. Confirmar mediante conexión real host, puerto, clúster y usuario del laboratorio; abortar ante cualquier destino protegido. Crear solo la base nueva autorizada, vacía desde template0. No cargar schema.sql antes de restaurar.
4. Acordar propietarios/ACL: para ensayo funcional aislado se pueden aprobar --no-owner y --no-acl con permisos locales. Eso no valida la recuperación exacta de ACL originales, que debe contemplarse aparte.
5. Restaurar con pg_restore 18, conexión explícita a esa base y --exit-on-error --single-transaction; sin --create, --clean ni jobs paralelos. Usar credenciales protegidas, sin claves en URI/argumentos. La transacción permite abortar el contenido restaurado, pero no la creación previa de la base/copia. [PostgreSQL 18: opciones de pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
6. Comprobar salida, tablas/restricciones, identidades/secuencias, roles funcionales, permisos y recuentos. No ejecutar nextval para solo verificar secuencias. No declarar igualdad con la base viva de otra fecha: registrar el punto temporal del respaldo.
7. Autorizar por separado el ensayo de 016 en esa restauración. Comparar todos los campos anteriores sin revelarlos, existentes all, nuevos selected, puente vacío y PK/FK/CHECK. Medir duración, bloqueo y recuperación.
8. Humo solo con integraciones bloqueadas, credencial/JWT del laboratorio y casos aprobados. Conservar evidencia; eliminar el laboratorio exige autorización. Acordar RTO/RPO según tiempos reales.

Un ensayo en copia no autoriza modificar configuración/permisos de bases actuales. No se instaló ni preparó un laboratorio durante este diagnóstico.

## 7. Plan futuro de migración controlada

**Todos los pasos requieren las autorizaciones correspondientes; ninguno se ejecutó.**

1. Inventariar todos los Electron, Express, tareas, importadores, webhooks y clientes antiguos; confirmar con el responsable que pueden interrumpirse. Registrar versiones/hashes y proteger copia de configuración.
2. Acordar ventana, ejecutor/aceptador, RTO/RPO, punto de retorno e incidencias. Exigir recuperación ensayada, custodia y cuenta limitada preparadas; si faltan, no iniciar.
3. Suspender entradas/escrituras; cerrar clientes y detener solo servicios/procesos inventariados por su responsable. Impedir reinicio automático y verificar conexiones/transacciones/listeners. Si no se puede excluir concurrencia, cancelar sin migrar.
4. Generar pg_dump custom 18.3 actualizado con nombre fechado inexistente, destino/usuario explícitos y clave protegida. No sobrescribir el archivo actual. Verificar salida/hash/listado y restaurarlo en el destino aislado aprobado; mantener escrituras detenidas para que sea el punto anterior al cambio. Si excede la ventana, reprogramar.
5. Revalidar en la misma conexión de ejecución identidad principal, versión/clúster, public, estado anterior, PK de usuarios/plataformas, ausencia de colisiones, privilegios y SHA exacto de 016. Guardar una línea base de conservación protegida.
6. Ejecutar exclusivamente 016 una vez con psql 18, -X, ON_ERROR_STOP=1 y host/puerto/base explícitos; fijar search_path=public. El SQL ya tiene BEGIN/COMMIT: no añadir otra envoltura --single-transaction ni fragmentarlo. Establecer tiempos máximos según ensayo y detener ante errores. Mantenimiento autorizado no habilita usar esa cuenta en Express.
7. Confirmar salida/COMMIT y verificar 18 tablas, 18 PK, 18 FK y 15 CHECK; VARCHAR(20) NOT NULL con default selected y CHECK all/selected; puente PK/FK válido y vacío. Justo después y antes de otros cambios, ambos usuarios anteriores deben tener all.
8. Comparar la línea base mediante verificador protegido que solo emita agregados: mismos IDs, roles, estado, correos/nombres y hashes de contraseña; mismas reservaciones y campos anteriores de todas las tablas. Los recuentos solos no prueban igualdad. Actualizar la referencia de dos usuarios/1.144 reservas si cambió antes de la ventana.
9. Configurar una cuenta limitada autorizada para principal, secreto/JWT propios y configuración separada; no reutilizar sian_kaan_dev_app. Verificar permisos efectivos, FOR KEY SHARE y operaciones administrativas aprobadas de prueba.
10. Arrancar solo backend/Electron compatibles desde fuentes mediante el lanzador aprobado; acceso general aún cerrado. Comprobar identidad del pool, salud, login/sesión y ausencia de integraciones. No adoptar backend ajeno ni abrir ventana ante fallo.
11. Ejecutar sección 10, incluida creación administrativa de Consulta selected sintético, edición/revocación. Registrar nuevas filas de prueba y política posterior; no borrar auditoría automáticamente.
12. Impedir clientes antiguos que ignoren selected. Registrar decisión del responsable y reabrir solo tras aceptación. Conservar respaldos/evidencia y no limpiar datos: FINAL-DB-01 sigue independiente.

## 8. Recuperación y ROLLBACK

| Situación | Respuesta propuesta |
| --- | --- |
| Error antes de COMMIT de 016 | Detener y revertir/cerrar transacción; comprobar en conexión nueva que columna/puente/default no persistieron. Si sigue abierta, ROLLBACK explícito. No iniciar aplicación nueva |
| Conexión perdida o COMMIT incierto | Revisar catálogo, distinguir estado anterior/completo/inconsistente. No repetir a ciegas |
| 016 confirmada, humo falla | Mantener mantenimiento. ROLLBACK de otra sesión no la revierte: corregir flujo compatible o aprobar recuperación nueva |
| Retorno al estado anterior confirmado | Restaurar pre-cambio en base nueva aprobada, validar y cambiar conexión solo tras autorización. No sobrescribir/eliminar principal |
| Escrituras posteriores | Preservar estado, identificar diferencias y acordar reconciliación/pérdida admisible antes de restaurar |
| Fallo de aplicación/configuración | Recuperar combinación compatible con esquema y ACCESS-SCOPE; un binario que ignore selected no es retorno seguro |

No existe migración inversa validada. No borrar columna/puente como atajo. Copias de respaldo, archivos de configuración, despliegue, cambios de roles y creación previa de base no se revierten con el ROLLBACK de 016. Las escrituras posteriores ya confirmadas requieren su propio procedimiento de recuperación.

## 9. Estrategia de conexión y arranque para principal

backend/config/database.js utiliza pg y dotenv. APP_CONFIG_PATH selecciona archivo alternativo, pero dotenv no sustituye por defecto variables heredadas: pueden prevalecer las del proceso. En fuentes sin selector se carga .env; el paquete espera config.env en userData. No se imprimieron secretos.

.env apunta a principal con postgres, que es superusuario, CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Los dos LOGIN PostgreSQL observados son postgres y sian_kaan_dev_app, sin membresías. La cuenta de desarrollo conserva cero relaciones de aplicación accesibles por permisos de tabla/columna en principal. No ampliarla para resolver este arranque.

El arranque normal de Electron comprueba GET / y texto genérico y puede reutilizar un backend existente: eso no acredita su DB, rol o esquema. backend/server.js inicia el worker GetYourGuide al ejecutarse como main si la variable habilitadora es true. El valor leído de .env no lo habilita, pero no es una barrera contra variables heredadas, llamadas manuales u otras integraciones.

**Puerto observado:** 127.0.0.1:3000, PID 22108, electron.exe con backendDevDb02.cjs; iniciado 15/10/2026 18:08:50 America/Cancun. Es ajeno a esta tarea y se conservó. No se consultó su API ni se dedujo su conexión PostgreSQL del texto de salud. Impide un arranque principal simultáneo en ese puerto.

DEV-DB-03 impone base/clúster/rol de desarrollo, entorno saneado, puerto libre, backend propio e IPC/nonce. **Conservarlo intacto: no relajar ni cambiar sus constantes para apuntarlo a principal.**

Propuesta de implementación para una fase autorizada:

- Lanzador separado de principal, desde fuentes, configuración propia protegida y cuenta limitada distinta de postgres y sian_kaan_dev_app; recuperación DPAPI u otro mecanismo aprobado. No modificar .env ni usar npm run desktop para eludir controles.
- Entorno construido con lista permitida; descartar DB/PG/JWT/proveedores/NODE_OPTIONS heredadas. No aceptar destinos/roles libres que salten la identidad aprobada.
- Mantener pool central. Antes de escuchar HTTP validar current_database/current_user, dirección/puerto, clúster, public, ACCESS-SCOPE, restricciones y privilegios efectivos. Rechazar superusuarios, membresías privilegiadas y discrepancias.
- Exigir 3000 libre, crear solo backend propio y confirmar identidad mediante IPC privado/nonce. Ante salida/fallo, abortar sin ventana. No publicar metadatos sensibles por endpoints.
- En humo, sin worker, rutas de integración bloqueadas y salida a proveedores bloqueada. Importar server.js sin ejecutar main, como en desarrollo, conserva las capas. Habilitar proveedores después requiere autorización independiente.
- Mantener sandbox/contextIsolation/nodeIntegration, perfil separado y cierre solo de procesos propios. Validar en PowerShell 5.1 real y conservar el envío UTF-8 compatible de DEV-DB-03-FIX.

La matriz DEV-DB-03 es antecedente de análisis, no un GRANT autorizado para principal. Analizar permisos mínimos propios, incluido UPDATE de columna necesario para FOR KEY SHARE si se justifica, y consistencia de bitácora/asignaciones. No se creó ningún rol ni se concedieron permisos aquí.

## 10. Casos posteriores, todos pendientes

Aquí no se ejecutó login ni prueba que escriba. Ensayar primero en restauración y después, con autorización, en principal. Resolver IDs/métricas del destino: las seis reservas de desarrollo no representan las 1.144 actuales de principal.

| Caso | Resultado requerido |
| --- | --- |
| Administrador existente | Login y GET /api/auth/sesion válidos, módulos administrativos y todas las plataformas |
| Consulta existente all | Login/lecturas generales conservados, escrituras prohibidas |
| Crear Consulta selected | Administrador crea cuenta sintética con modo explícito y catálogo real; password protegido; solo Dashboard/Reservaciones |
| Selected vacío | Login, cero reservas/conteos/PAX; nunca acceso all por omisión |
| Modificar plataformas | Modo/puente atómicos; IDs inválidos, duplicados o inexistentes rechazados; fallo revierte todo |
| Revocar con sesión abierta | Mismo JWT pierde lectura revocada; refresh limpia datos, filtros, detalles e impresión |
| Buscar/filtrar/paginar | Alcance antes de total/LIMIT/OFFSET/resumen; límites admitidos; históricos solo de plataformas visibles |
| Dashboard | all conserva contenido; selected solo PAX/conteos/recientes visibles, sin datos operativos globales; vacío, ceros |
| Acceso directo por ID | Visible 200, oculto 404 indistinguible de inexistente, incluso con query/headers manipulados |
| Módulos excluidos | Selected recibe 403 en Daily/Operaciones/Transportes/eventos/Usuarios/Bitácora según política; navegación bloqueada, catálogos necesarios únicamente |
| Permisos por rol | Consulta no crea/modifica/cancela reservas ni administra usuarios, también por API directa |
| Imprimir/PDF | Daily solo autorizado; selected denegado por UI/API/IPC; revalidar permisos antes de exportar y limpiar tras revocación/logout |
| Rol/estado/sesión | Cambios y desactivación reconocidos; proteger propia cuenta/último Administrador; logout/fallo de renovación limpian token/DOM/caches |
| Conservar registros | Igualdad de campos previos, hashes de contraseña/roles y datos sin revelarlos; distinguir nuevo campo all y nuevas filas sintéticas |
| Regresión operativa | Grupos 1/2, turnos explícitos, 12/24 PAX, transporte único, pickup propio y cancelación/bitácora consistentes |
| Errores de DB/permisos | Mensajes genéricos sin secretos/fallback all; guardia fallida impide abrir Electron |
| Cierre/reinicio | Solo procesos propios, sin huérfanos ni adopción de backend; revalidación de identidad |

Impresión física, diálogos y aceptación humana deberán registrarse realmente cuando se autoricen. No se consideran aprobados por antecedentes automáticos. La matriz 05A conserva sus pendientes de instalación/actualización/desinstalación; esta preparación no los resuelve ni publica instalador.

## 11. Problemas y bloqueos

1. Respaldo reconocido pero no restaurado ni cotejado; recuperación completa, RTO/RPO y responsables pendientes.
2. ACL del respaldo con lectura amplia/modificación por usuarios autenticados: resolver custodia sin alterar aquí el original.
3. No hay cuenta limitada autorizada para aplicación principal; la habitual es postgres. No reutilizar/ampliar sian_kaan_dev_app.
4. Falta lanzador protegido para principal; el normal reutiliza backend sin validar su base real.
5. Puerto 3000 ocupado por desarrollo; coordinar su cierre con el responsable.
6. Ventana y exclusión de escritores/clientes antiguos pendientes; una instantánea sin sesiones no las garantiza.
7. Sin tracking automático ni migración inversa validada: registro externo y ensayo de recuperación necesarios.
8. Informes ACCESS-SCOPE-01/DEV-DB-01 no localizados en repositorio; se usó documentación disponible y diagnóstico actual.

No se detectó conflicto concreto de los nombres/tipos de referencias necesarios para 016. Compatibilidad técnica no elimina estos bloqueos de seguridad/recuperación.

## 12. Acciones que requieren autorización expresa posterior

- Preparar custodia/ACL o copia protegida del respaldo, sin sobrescribir ni eliminar el actual.
- Crear/iniciar entorno y base de restauración nuevos identificados; restaurar y ensayar 016/pruebas de escritura allí.
- Generar respaldo actualizado de principal dentro de la ventana y probar su restauración.
- Detener servicios/procesos del responsable y coordinar mantenimiento/cierre de acceso.
- Ejecutar 016 sobre principal una vez, tras aceptar requisitos y recuperación.
- Crear/configurar cuenta limitada y permisos de principal; implementar lanzador/configuración independiente y activar Express/Electron hacia ese destino.
- Crear/modificar cuentas/asignaciones sintéticas en principal y ejecutar humo de escritura/impresión aprobado.
- Cambiar destino para recuperación, desplegar/distribuir o habilitar integraciones.
- FINAL-DB-01: limpieza controlada futura y Administrador inicial, con alcance propio aprobado.

Este documento no concede esas autorizaciones ni prevé ejecutarlas por silencio del usuario.

## 13. Ausencia de modificaciones y evidencias

**No se modificó PostgreSQL, ni principal ni desarrollo.** Solo se abrieron conexiones de diagnóstico a principal, default_transaction_read_only=on y transacciones READ ONLY. Se ejecutaron SELECT de metadatos/catálogos/recuentos, BEGIN de solo lectura y ROLLBACK. No se seleccionaron contraseñas/datos personales ni se consultó el contenido de desarrollo.

La comprobación final confirmó recuentos, columnas y ACL de relaciones/base iguales; columna/puente 016 siguen ausentes. No es checksum de todos los valores: la garantía de no escritura procede de solo lectura y de no iniciar componentes capaces de escribir.

SHA-256 antes/después coincide para .env, schema.sql, 016, backend/config/database.js, electron/main.js, lanzadores de desarrollo, configuración independiente y ambos archivos cifrados. El respaldo conservó hash/fecha. No se detuvieron procesos ajenos; se dejó el listener de desarrollo intacto.

No se ejecutaron migraciones, schema.sql, seeds.sql, restauraciones, creación de bases, cambios de roles/ACL, escrituras ni pruebas destructivas. No se utilizó Git, no se instalaron dependencias, no se inició Electron/Express, no se llamaron proveedores ni se publicó nada. Solo se consultó documentación pública PostgreSQL para sustentar el análisis.

Entregable creado: **docs/PROD-ACCESS-01.md**. No se modificó código de aplicación ni configuración. Evidencias y auxiliar de solo lectura bajo la carpeta local ya excluida `.access-scope-lab/prod-access-01/`: database.json, compatibility.json, backup.json, host.json, final-readonly.json, protected-before.json, protected-after.json y diagnose.cjs. No contienen claves ni hashes de contraseña. El auxiliar no ejecuta migraciones y se detiene si la identidad difiere.

**Resultado:** diagnóstico y plan preparados. Restauración, migración y cambios de arranque esperan requisitos y autorización expresa. No se declara la base lista para actualizar ni el sistema listo para producción.
