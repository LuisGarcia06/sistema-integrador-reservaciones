# PROD-ACCESS-02A — Restauración y ensayo de migración 016

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.

Fecha: **15 de octubre de 2026**, America/Cancun (UTC−05:00). Ejecución final terminada a las 20:51:49.

**Ensayo completado: 55 verificaciones aprobadas, cero fallos en la ejecución final.** Se restauró realmente el respaldo, se aplicó exclusivamente 016 en una copia aislada y se comprobó una segunda restauración que recuperó el estado anterior. No se modificaron principal ni desarrollo. La migración sobre principal continúa pendiente de autorización específica.

Se respetó la decisión de conservar los datos de prueba. No se realizó limpieza; FINAL-DB-01 permanece como fase independiente.

## 1. Identidad y aislamiento del laboratorio

Se revisaron AGENTS.md, PROD-ACCESS-01, el SQL exacto de 016, herramientas PostgreSQL instaladas y el validador de laboratorio anterior. No se reutilizaron sus bases ni se ejecutaron sus escenarios de escritura.

| Propiedad de la ejecución final | Valor |
| --- | --- |
| Raíz privada | A:\sistema-integrador-reservaciones\.access-scope-lab\prod-access-02a-3796700abeee |
| Directorio PostgreSQL | data, dentro de esa raíz |
| Dirección / puerto | 127.0.0.1:61778 |
| Versión | PostgreSQL 18.3 |
| Identificador físico del clúster | 7697077338846675424 |
| Cuenta PostgreSQL exclusiva | prod_access_lab |
| Base restaurada y migrada | prod_access_02a_3796700abeee_restore |
| Base de recuperación pre-016 | prod_access_02a_3796700abeee_recovery |
| Esquema | public |
| Inicialización | UTF8, locale Spanish_Mexico.1252 |
| Clúster protegido, distinto | 7632825987452064788, puerto 5432 |
| Estado final | Detenido; directorio, bases y evidencias conservados |

Se eligió un puerto libre y se inició un clúster nuevo mediante initdb/pg_ctl, sin registrar servicios ni instalar software. Antes de crear/restaurar bases o ejecutar 016 se comprobaron la base, usuario, dirección, puerto, esquema, versión, directorio real e identificador físico. Se rechazaron puerto 5432 y la identidad del clúster existente.

Las dos bases del ensayo se crearon nuevas desde template0, con ausencia previa y vacío verificados. La primera conserva el resultado post-016; la segunda conserva la recuperación anterior. No se utilizó ninguna base preexistente como destino.

El servidor solo escuchó en loopback y usó SCRAM-SHA-256 con una clave aleatoria independiente de 32 bytes. prod_access_lab es una cuenta de mantenimiento del clúster nuevo; no fue creada en el clúster principal ni configurada para la aplicación.

La raíz privada limita acceso al usuario Windows actual y SYSTEM; data y archivos generados heredan esos permisos. Se verificaron también ACL del directorio de datos, PG_VERSION, copia del respaldo y archivo de credenciales. La clave quedó cifrada mediante DPAPI en lab.credentials.clixml, recuperable por este usuario en este equipo. initdb recibió un archivo temporal dentro de la carpeta privada, retirado inmediatamente después; no quedan contraseñas en texto plano en los archivos conservados. No se mostraron claves ni hashes de contraseña.

El backend ajeno de desarrollo en 127.0.0.1:3000, PID 22108, y PostgreSQL existente en 5432, PID 6720, permanecieron activos. No se iniciaron Electron, Express, webhooks, workers ni conexiones a proveedores.

## 2. Respaldo utilizado y protección

Original: `A:\Respaldos_PostgreSQL\sian_kaan_reservaciones.backup`.

Copia de trabajo: `source-working.backup`, dentro de la raíz privada del laboratorio final.

| Comprobación | Resultado |
| --- | --- |
| Tamaño | 120.691 bytes |
| Formato | PGDMP, CUSTOM |
| Herramientas | initdb, pg_ctl, pg_restore y psql 18.3 |
| Catálogo del respaldo | 17 tablas y 17 entradas TABLE DATA |
| Copia | Creada sin sobrescribir destinos; mismo SHA-256 |
| ACL de la copia | Solo usuario Windows actual y SYSTEM, sin herencia amplia |
| Original después del ensayo | Hash y fecha de modificación iguales; sin cambios de permisos |

SHA-256 comprobado antes de copiar, después de copiar y antes de cada restauración:

`ae04d64ffb9155794ffb9e1a60ec657c3b044121dad74070ecf5c2de3047389f`

La copia tiene sus ACL restringidas explícitamente, además de la carpeta privada. No se sobrescribió ni eliminó el original. Sus permisos amplios señalados en PROD-ACCESS-01 no se cambiaron: la protección aplicada en esta fase corresponde a las copias de laboratorio.

No se tomaron los recuentos de principal como contenido supuesto del archivo: las cifras de este informe proceden de restaurar esa copia exacta. Que coincidan con los recuentos históricos del diagnóstico no demuestra igualdad actual de cada campo de principal.

## 3. Resultado de restauración real

pg_restore 18.3 terminó con código cero, utilizando host/puerto/usuario/base explícitos y las opciones --exit-on-error --single-transaction --no-owner --no-acl. No se usaron --clean, --create ni restauraciones sobre bases existentes.

La propiedad se resolvió asignando los objetos restaurados a prod_access_lab y omitiendo las ACL originales, exclusivamente en el laboratorio. Se conservaron los roles funcionales y usuarios contenidos en tablas. Esta prueba valida esquema/datos y recuperación lógica; no reproduce los roles globales ni los permisos exactos del clúster principal. No se crearon roles adicionales allí.

Se verificaron tablas contra el listado del respaldo, columnas, claves y restricciones: 17 PK, 16 FK, 14 CHECK y 12 UNIQUE, validados. Se comprobaron las 16 FK mediante consultas de referencias: cero huérfanos. Las 17 secuencias de identidad quedaron con estado compatible con sus IDs existentes; se leyeron last_value/is_called y parámetros, sin avanzar secuencias para comprobarlas.

La lectura de todos los campos de todas las filas para obtener firmas terminó sin errores. No hubo señales de corrupción en la restauración, validación de restricciones o lectura lógica. Esto no pretende certificar el hardware ni reemplazar una política completa de respaldo.

## 4. Tablas y registros restaurados

| Tabla | Registros procedentes del respaldo |
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

Las relaciones de usuarios/roles, reservaciones/catálogos/transporte, operaciones, integraciones y bitácora se restauraron y validaron. No se extrajeron nombres de personas, correos, teléfonos, contraseñas ni hashes de contraseña. Antes de 016 no existían usuarios.alcance_plataformas ni usuario_plataformas_visibles.

## 5. Ensayo de migración 016

Archivo ejecutado: database/migrations/016_alcance_plataformas_usuarios.sql.

SHA-256 verificado de nuevo inmediatamente antes de ejecutar:

`41bc5fb45c636040ba229eec2f2113431dbb33599b625222a5a0dc39b4b260f3`

Se ejecutó **una sola vez**, en prod_access_02a_3796700abeee_restore, tras revalidar identidad física y lógica. El archivo conserva su BEGIN/COMMIT original. No se ejecutaron schema.sql, seeds.sql ni otras migraciones.

Resultado confirmado:

- 18 tablas, 18 PK, 18 FK y 15 CHECK; restricciones validadas.
- usuarios.alcance_plataformas VARCHAR(20) NOT NULL, default selected y CHECK all/selected.
- Los dos usuarios preexistentes recibieron all.
- Puente con dos INTEGER NOT NULL, PK (id_usuario,id_plataforma) y FK a usuarios/plataformas; cero filas finales.
- Las restricciones y definiciones anteriores permanecieron iguales.

También se probaron restricciones reales mediante SAVEPOINT y una transacción revertida: modo inválido rechazado con 23514; NULL rechazado con 23502; duplicado de asignación con 23505; ambas FK inválidas con 23503. Un usuario sintético insertado omitiendo alcance recibió selected. Se usó un ID explícito de prueba para no consumir identidad. Al finalizar se revirtieron usuario/asignaciones/actualizaciones de prueba y se comprobó otra vez igualdad de filas y secuencias. No quedó ninguna cuenta nueva de prueba en la copia migrada.

## 6. Conservación de registros y contraseñas

Se obtuvo una firma SHA-256 en PostgreSQL para cada fila, serializando sus columnas originales, y una firma agregada por tabla con orden de PK y recuento. Se compararon antes/después de 016 las **17 tablas y todos los campos anteriores**, no solo cantidades. En usuarios se excluyó únicamente la columna nueva al comparar el estado previo.

Todas las comparaciones resultaron iguales. Esto incluye IDs, roles, nombres/correos, estado y hashes de contraseña de los dos usuarios, así como todos los campos de las 1.144 reservaciones y el contenido de las otras 15 tablas. Los valores y hashes de contraseña nunca salieron a informes; las firmas agregadas se compararon en memoria y solo se guardaron resultados booleanos.

Las 17 secuencias conservaron last_value/is_called y configuración. La comparación se repitió tras revertir las pruebas de restricciones. La única diferencia de datos persistente prevista es el campo nuevo all de los usuarios; la única tabla nueva es el puente vacío.

La segunda restauración desde el mismo archivo recuperó también todas las firmas, definiciones y secuencias anteriores, confirmando la reproducibilidad del contenido del respaldo independientemente de la copia migrada.

## 7. Duraciones medidas

| Operación de la ejecución final | Duración |
| --- | ---: |
| Restauración inicial, pg_restore completo | 0,495 s |
| Migración 016, ejecución y COMMIT | 0,007 s |
| Restauración de recuperación en segunda base nueva | 0,617 s |
| Validador Node, incluyendo inicialización, verificaciones y parada | 41,082 s |

Se configuraron lock_timeout=5 s y statement_timeout=60 s en las conexiones del laboratorio. No hubo errores de timeout ni deadlock. La duración indicada no es una medición continua de cada espera interna ni una garantía para la ventana de principal. Los tiempos dependen de este respaldo pequeño, equipo y carga; RTO/RPO deben incluir coordinación, verificación, configuración y arranque de la aplicación.

## 8. Problemas encontrados y resueltos

El primer intento creó otro clúster independiente, restauró correctamente el archivo en 0,490 s y se detuvo en el verificador, antes de ejecutar 016. El controlador pg devolvía array_agg de identificadores PostgreSQL de tipo name[] como texto, mientras el verificador esperaba un array JavaScript. Se corrigió el inventario para devolver explícitamente text[]. No fue un fallo del respaldo, una FK ni de la migración.

Se conservó ese laboratorio en `.access-scope-lab/prod-access-02a-aee90f90fc9d/`, detenido, con su reporte y copia privada. No se intentó sobreescribirlo ni limpiar sus datos: la ejecución final utilizó el clúster nuevo identificado en sección 1. Los dos puertos de laboratorio, 61738 y 61778, quedaron sin listeners.

Resultado final: 55 verificaciones aprobadas, cero fallos; proceso lanzador con código 0. JavaScript pasó node --check y el lanzador se analizó y ejecutó mediante **Windows PowerShell 5.1.19041.6456**, usando el escritor UTF-8 compatible. No se instalaron herramientas.

La omisión controlada de propietarios/ACL permite restaurar sin crear el rol postgres original en el laboratorio. No acredita la recuperación exacta de permisos productivos. Los permisos amplios del respaldo original siguen siendo un asunto de custodia a resolver con autorización aparte; las copias de trabajo sí están restringidas.

## 9. Recuperación comprobada y procedimiento posterior

La recuperación fue ejecutada realmente, sin deshacer ni eliminar la copia post-016:

1. Se revalidó el clúster aislado y la ausencia de prod_access_02a_3796700abeee_recovery.
2. Se creó esa base nueva y vacía desde template0.
3. Se verificaron identidad, vacío y hash de la copia privada.
4. Se ejecutó otra restauración transaccional completa con pg_restore y parada ante errores.
5. Se confirmó el esquema pre-016: 17 tablas, sin columna alcance ni puente.
6. Se compararon todas las definiciones inventariadas, campos originales, recuentos y secuencias con la línea base de la primera restauración. Coincidieron.
7. Se cerraron conexiones y se detuvo únicamente el clúster creado por esta tarea. Se conservaron ambas bases y archivos.

Si 016 fallara antes de COMMIT en un ensayo futuro: detener, ejecutar ROLLBACK/cerrar conexión y comprobar el catálogo antes de decidir otra acción. Si COMMIT ya ocurrió, ROLLBACK de otra sesión no elimina sus cambios. La recuperación probada consiste en restaurar el respaldo pre-cambio en **otra base nueva autorizada**, verificarla y aprobar por separado cualquier cambio de destino. No borrar columna/puente ni sobrescribir una base como atajo.

Para una recuperación futura de principal: mantener escrituras/clientes cerrados, verificar nuevamente identidad y respaldo actualizado; restaurar solo en el destino nuevo expresamente aprobado, comprobar datos, roles/permisos, secuencias y aplicación compatible. Preservar cualquier estado posterior y acordar reconciliación/pérdida admisible si hubo nuevas escrituras. El cambio de conexión, restauración o despliegue no queda autorizado por este informe.

Las credenciales cifradas del laboratorio permanecen para posteriores inspecciones autorizadas. Si se reinicia, comprobar antes que su puerto siga libre y que directorio/identificador coincidan; no adoptar procesos que ocupen ese puerto. Repetir el lanzador crea un laboratorio nuevo, no reabre ni reutiliza estos destinos. No se eliminaron laboratorios automáticamente.

## 10. Archivos creados

- scripts/ProdAccess02a.ps1: carpeta privada, ACL, credencial DPAPI y envío por stdin; compatible con Windows PowerShell 5.1.
- scripts/prodAccess02a.cjs: identidad, copia/hash, nuevo clúster, restauración, ensayo 016, conservación, recuperación y parada propia.
- docs/PROD-ACCESS-02A.md: este informe.

No se modificó ningún archivo existente de aplicación, configuración o migraciones.

Artefactos privados del laboratorio final, dentro de su raíz excluida de Git/empaquetado: data/, source-working.backup, lab.credentials.clixml, postgres.log, identity.json, restored-inventory.json, report.json, protected-before.json, protected-after.json, protected-files-before.json y cleanup-and-acl.json. Se conservó también el primer intento fallido. Los archivos temporales de contraseña de initdb fueron retirados; los respaldos y datos PostgreSQL no se eliminaron.

Los informes JSON contienen metadatos/recuentos/resultados, sin registros personales ni hashes de contraseñas. Los respaldos y archivos data sí contienen los registros restaurados y hashes almacenados de usuarios: deben permanecer privados. No publicar carpetas de laboratorio, respaldos ni credenciales cifradas.

## 11. Ambas bases existentes intactas

Se inspeccionaron principal y desarrollo antes/después mediante conexiones independientes con default_transaction_read_only=on y transacciones READ ONLY. Solo se consultaron metadatos, ACL, atributos/membresías de roles y recuentos; no se realizaron escrituras sobre ellas.

| Base protegida | Resultado |
| --- | --- |
| sian_kaan_reservaciones | Estructura/roles/ACL y recuentos coinciden; continúa con 17 tablas y sin alcance |
| sian_kaan_reservaciones_dev | Estructura/roles/ACL y recuentos coinciden; conserva ACCESS-SCOPE y sus datos |

Las instantáneas del principio del primer intento y el final del segundo también coincidieron. No se creó/modificó ningún usuario o rol del clúster 5432. Las firmas estructurales/recuentos no son una comparación de cada valor de las bases protegidas; la garantía de no escritura por esta tarea procede de las conexiones de solo lectura y destinos nuevos separados.

Las huellas de .env, schema.sql, 016, configuración central pg, electron/main.js, arranque protegido de desarrollo, configuración independiente y sus dos archivos de credenciales coincidieron. El respaldo original mantuvo su hash/fecha. El proceso de desarrollo y el servidor 5432 no se detuvieron.

No se utilizó Git; no hubo instalaciones, publicación, integraciones, Electron/Express nuevos, DROP, DELETE ni TRUNCATE. No se ejecutaron schema.sql/seeds.sql ni migraciones previas. Las escrituras fueron restauraciones y 016 únicamente en el clúster nuevo, más pruebas reversibles dentro de esa copia.

## 12. Recomendación sobre la migración de principal

El ensayo elimina la incertidumbre sobre **la restauración lógica de este archivo concreto y la conservación de sus registros al aplicar esta versión de 016**. También demuestra recuperación del estado pre-016 en un destino nuevo. No equivale a autorización de migrar principal ni a preparación productiva.

Antes de proponer ejecución en principal:

1. Preparar una cuenta de aplicación limitada para principal y un arranque independiente que valide la identidad real; no usar postgres en Express ni ampliar sian_kaan_dev_app. Su creación/configuración requiere autorización específica.
2. Resolver custodia del respaldo original y de respaldos nuevos. La copia privada resuelve el ensayo, no los permisos del original.
3. Acordar ventana, responsables y exclusión verificable de todos los escritores/clientes antiguos. Coordinar el backend que hoy ocupa 3000 sin detenerlo automáticamente.
4. Generar un respaldo actualizado con escrituras detenidas, conservarlo sin sobrescribir y comprobar su recuperación; el archivo ensayado corresponde a un momento anterior.
5. Revalidar identidad y estructura actual de principal, ausencia de 016/estado parcial y hash SQL. Guardar una línea base protegida y plan de recuperación.
6. Solicitar autorización posterior y específica para ejecutar exclusivamente 016 en principal. Después verificar datos/constraints y realizar humo de aplicación con perfiles all/selected/vacío, revocación, búsquedas, permisos y PDF en alcance aprobado.

**Estado final:** restauración, ensayo 016 y recuperación aprobados en laboratorio; principal y desarrollo intactos. La 016 en principal sigue sin ejecutarse y requiere otra autorización. No se declara el sistema listo para producción ni se inicia FINAL-DB-01.
