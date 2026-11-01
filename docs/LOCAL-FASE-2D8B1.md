# Fase 2D.8B.1 - Esquema de auditoria 021 aislado

Estado: COMPLETADO EN LABORATORIO. Fecha: 27 de octubre de 2026.

Se implemento y probo exclusivamente la persistencia PostgreSQL. No se implementaron escritores de servicios, formularios, visualizacion nueva de Bitacora ni un servidor para 021. No hay activacion productiva.

## 1. Alcance y preservacion

Se revisaron AGENTS.md, el diseno 2D.8A de esta conversacion, el esquema base, las migraciones 018/019/020, sus verificadores y el aprovisionador existente.

La comparacion SHA-256 conserva **511 de 511 archivos preexistentes**, sin modificaciones ni eliminaciones. Se agregaron ocho archivos de codigo/pruebas. `database/schema.sql`, migraciones previas, servicios, controladores, middleware, frontend, Electron, configuracion principal y perfiles anteriores permanecen intactos. Evidencia: `local-fase-2d8b1-before.json` y `local-fase-2d8b1/source-verification.json`.

## 2. Archivos nuevos

| Archivo | Funcion |
| --- | --- |
| `database/migrations/021_auditoria_recursos_lab.sql` | DDL de extension, validadores, FK, indices y protecciones |
| `backend/config/auditSchemaContract.js` | Identidad 021 y digests fijos revisados |
| `backend/config/auditSchema.js` | Inventario de catalogo y verificacion exacta |
| `backend/config/auditSchemaPolicy.js` | Perfil exclusivo de esquema, configuracion, identidad y huella propia |
| `scripts/AuditSchemaLab.ps1` | Directorio nuevo privado, entorno limpio y ejecucion sin ventana |
| `scripts/auditSchemaLab.cjs` | Aprovisionamiento 020 nuevo, aplicacion 021 y cierre garantizado |
| `scripts/auditSchemaCases.cjs` | Casos PostgreSQL reales exclusivamente sinteticos |
| `backend/__tests__/auditSchemaLab.test.js` | 57 pruebas aisladas de contrato, permisos y perfiles |

Se agregan este informe, inventarios y evidencias en `docs/local-fase-2d8b1/`. No hay archivos preexistentes modificados por esta fase.

## 3. Estructura real final

Se conservan los seis campos historicos: `id_bitacora` INTEGER IDENTITY ALWAYS PK, `id_usuario` INTEGER NOT NULL FK, `id_reservacion` INTEGER nullable FK, `accion` VARCHAR(255) NOT NULL, `descripcion` TEXT nullable y `fecha` TIMESTAMP WITHOUT TIME ZONE NOT NULL.

Se agregan 12 columnas, sin valores predeterminados ni backfill:

| Columna | Tipo |
| --- | --- |
| `version_auditoria` | SMALLINT |
| `origen` | VARCHAR(20) |
| `instante` | TIMESTAMP WITH TIME ZONE |
| `usuario_nombre_snapshot` | TEXT |
| `id_operacion_tour` | INTEGER |
| `id_transporte_operacion` | INTEGER |
| `id_daily_observacion` | INTEGER |
| `valores_anteriores` | JSONB |
| `valores_nuevos` | JSONB |
| `motivo` | TEXT |
| `comando_generacion` | UUID |
| `comando_clave` | UUID |

Fisicamente admiten NULL para mantener compatibilidad. El CHECK exige completitud en formato 2. En formato historico, version y todas las columnas nuevas deben ser NULL.

Los eventos de formato 2 requieren origen HUMANO, nombre y descripcion con contenido, instante, generacion/clave, ausencia de referencia a reservacion y exactamente una referencia a Operacion, Transporte o Daily. Las tres referencias tienen FK reales, sin cascadas. Se conservan las FK anteriores a usuarios y reservaciones.

Acciones admitidas para formato 2: CREAR y MODIFICAR. CREAR requiere valores anteriores SQL NULL; MODIFICAR requiere instantaneas validas distintas y motivo. Los campos nuevos no restringen retrospectivamente las acciones historicas.

## 4. Instantaneas y motivo

Cada instantanea es un objeto completo con exactamente estas claves:

| Recurso | Claves permitidas y obligatorias |
| --- | --- |
| Operaciones | fecha, id_tour, turno, numero_grupo, hora_inicio, id_guia, estado |
| Transportes | id_operacion_tour, id_vehiculo, id_operador, observaciones_operador, estado |
| Daily | fecha, observaciones |

Se validan tipos JSON: IDs numericos enteros positivos dentro de INTEGER; referencias opcionales admiten JSON null; fecha ISO real; hora HH:MM:SS entre 00:00:00 y 23:59:59; turno explicito; grupo 1/2; estado textual no blanco de hasta 30 caracteres; observaciones de operador texto/null y Daily texto, incluido vacio.

Se rechazan claves adicionales, arrays, escalares, JSON null como instantanea, fechas imposibles y objetos anidados donde corresponde un escalar. No se acepta un cuerpo de solicitud completo ni claves como password, jwt o token. No hay snapshots de usuarios, autenticacion o integraciones.

El motivo es obligatorio en MODIFICAR y opcional en CREAR; si existe, contiene entre 1 y 500 caracteres Unicode y contenido no blanco. Se probo el limite con 500 emojis. La funcion `ctsk_texto_presente_021` cubre los espacios de ECMAScript trim, incluidos NBSP, BOM y espacios Unicode, sin depender del locale C de PostgreSQL.

El esquema no puede detectar secretos escritos voluntariamente dentro de un texto libre permitido. Los escritores posteriores deberan limitar el contenido a la informacion funcional necesaria, sin copiar solicitudes ni autenticacion.

## 5. Integridad diferida con 020

El ledger 020 conserva columnas, PK compuesta, checks, indices, funcion de guardia, trigger ALWAYS y privilegios exactos. No se reescribio ni altero esa tabla.

La FK `(comando_generacion,id_usuario,comando_clave)` referencia `(generacion_datos,id_usuario,clave)` y es DEFERRABLE INITIALLY DEFERRED. Usa MATCH SIMPLE para admitir las entradas historicas con usuario pero sin comando.

El constraint trigger `ctsk_audit_command_021`, tambien diferido y ALWAYS, comprueba al confirmar:

1. Existencia de la misma generacion, usuario y clave.
2. Estado confirmado y HTTP 200.
3. Recurso e identificador correctos; Daily usa la fecha real de su fila.
4. Metodo y ruta correspondientes a recurso/accion.
5. `ids_bitacora` exactamente igual al arreglo de un elemento con el ID nuevo.
6. Coherencia de la fecha de las instantaneas Daily con su recurso.

El indice unico parcial impide dos auditorias de formato 2 para la misma generacion/usuario/clave. No limita la multiplicidad de auditorias historicas de comandos anteriores. No convierte el ledger en auditoria funcional.

La secuencia negocio -> auditoria -> ledger -> COMMIT se ejecuto realmente con runtime en las altas de los tres recursos y en modificaciones de los tres. Se registran seis pruebas de `xmin` coincidente entre las filas escritas, dentro de estas transacciones SQL sinteticas sin savepoints. Esto no sustituye la verificacion de servicios reales ni implica que los xmin deban coincidir entre subtransacciones futuras.

## 6. Privilegios e inmutabilidad

El propietario de objetos es `ctsk_standalone_owner` NOLOGIN; el runtime es `ctsk_standalone_runtime`, sin membresia/atributos peligrosos ni propiedad de base, esquema u objetos.

En bitacora el runtime tiene SELECT y permisos INSERT por columna; no puede proporcionar el ID identity. No tiene UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ni propiedad para DDL. PUBLIC carece de permisos en tabla/columnas y de EXECUTE sobre las cuatro funciones 021. El runtime puede ejecutar las funciones necesarias; todas son SECURITY INVOKER con search_path fijado a pg_catalog.

Triggers ALWAYS rechazan UPDATE/DELETE y TRUNCATE. Se comprobo tanto el rechazo por privilegios runtime como el rechazo por trigger usando owner. Un propietario/superusuario sigue siendo capaz de cambiar DDL expresamente; por eso no es el usuario de ejecucion y el verificador detecta protecciones alteradas.

Se mantuvo la lectura historica y se ejecuto un INSERT con las cinco columnas originales del escritor historico, sin nuevos metadatos. Los roles funcionales y el GET administrativo original no se modificaron.

## 7. Perfil y aislamiento

Perfil nuevo: `audit-schema-lab`; proposito `audit-schema-tests-only`; esquema 021; manifiesto version 5. No es un perfil de servidor.

El wrapper crea un directorio nuevo privado en LOCALAPPDATA y elimina el entorno heredado de configuracion. El aprovisionador existente inicia un cluster PostgreSQL 18.3 nuevo y comprueba identidad antes de usar su base de mantenimiento postgres recien creada. Crea una base sintetica vacia, aplica el esquema base con 018, despues 019 y 020, y verifica el contrato 020 original antes de aplicar 021.

La extension se ejecuta por owner en una transaccion tras comprobar base, puerto, cluster y digest SQL. Solo se sustituyen manifiesto y runtime.env recien creados en ese directorio por los del perfil 021. Los lectores anteriores rechazan el nuevo manifiesto. No se adapto ningun perfil existente para aceptar 021.

La huella propia incluye codigo base, DDL anterior y nuevo, aprovisionador, fixtures, wrapper y casos de esquema. Los digests de migracion y catalogo estan fijados en fuente; el verificador NO aprende ni acepta automaticamente el esquema presente al ejecutarse.

El inventario cubre columnas y privilegios efectivos, todas las restricciones, indices, triggers no internos, definiciones y ACL de funciones 021, ACL de tabla/columnas, propietario, reglas y RLS. Ademas se reutilizan los verificadores 019/020 exactos y la comprobacion de rol/identidad. El contrato esta fijado para PostgreSQL 18.3.

Las trazas de conexiones de las ejecuciones 021 contienen exclusivamente su propio 127.0.0.1:puerto. Se probo el bloqueo previo a sockets de 5432, fetch externo y UDP. No se leyeron .env, credenciales reales ni respaldos; no hubo conexiones a una base existente. No se iniciaron HTTP, Electron, LAN, integraciones o servicios Windows.

## 8. Pruebas y resultados finales

| Verificacion | Resultado |
| --- | --- |
| PostgreSQL real 021, version final | 94 comprobaciones aprobadas |
| Rechazos/rollback con conteos y huellas antes/despues | 68 evidencias |
| Negocio/auditoria/ledger en transacciones de exito | 6 pruebas |
| Jest con bloqueo de PostgreSQL real | 975 pruebas, 34 suites, cero fallos |
| Pruebas anteriores dentro de Jest | 918 conservadas |
| Nuevas pruebas de contrato 021 | 57 |
| Regresion real del perfil original revision-schema-lab | 44 comprobaciones y 13 operativas aprobadas |
| Archivos fuente previos | 511 identicos; 0 modificados; 0 eliminados |

Se cubren las 23 categorias solicitadas: migracion desde 020; preservacion e INSERT historico; FK de los tres recursos; referencias ausentes/multiples; acciones/origen; claves y tipos JSON; motivos; usuario; comando valido, ausente, rechazado o con usuario/generacion/clave/recurso/ID/metodo/ruta/recibo incorrectos; rollback; permisos; esquema alterado; perfiles anteriores y aislamiento.

Las pruebas de manipulacion incluyen deshabilitar trigger, eliminar CHECK o indice, ampliar privilegios, grants PUBLIC, agregar columna y sustituir una funcion. Cada cambio se revierte y el contrato original vuelve a pasar. La inspeccion de estas manipulaciones se realiza en la misma transaccion owner cambiando a rol runtime, para observar el DDL no confirmado con sus permisos efectivos.

Evidencias principales:

- `postgres-verification.json`: resultado final, conexiones, 94 checks, seis pruebas XID y 68 rollbacks.
- `postgres-final-unicode.log`: ejecucion final completa.
- `catalog-unicode-reviewed.json`: catalogo real final revisado, incluyendo funciones y ACL.
- `jest-final.json` y `jest-final.log`: 975/34.
- `revision-schema-regression.json` y su log: regresion 019 real.
- `source-verification.json`: preservacion del trabajo local.
- `labs.json` y `closure.json`: todos los destinos creados y su cierre.

Se conservan logs intermedios: dos ejecuciones destinadas a revisar catalogos terminaron con AUDIT_SCHEMA_INVALID mientras su digest aun no estaba fijado. Es el rechazo esperado del verificador estricto durante el desarrollo; no se habilito un modo de autoaceptacion. Otras ejecuciones intermedias aprobadas preceden al caso Unicode y a la matriz final ampliada. No se presentan como la version final.

## 9. Evidencias de rollback

Cada rechazo registra etapa, SQLSTATE, conteos de auditoria/ledger y huellas de las filas completas de Operaciones, Transportes y Daily antes y despues. Las huellas incluyen campos y revisiones/timestamps de esas tablas.

Los fallos diferidos ocurren en COMMIT, despues de ejecutar SQL de negocio y auditoria; los conteos y huellas finales coinciden con los iniciales. Hay casos propios de Transporte y Daily, ademas de Operaciones. Un fallo inmediato del ledger despues del INSERT de auditoria tambien revierte el conjunto.

Los errores esperados incluyen 23503 (FK/comando ausente), 23514 (formato/coherencia), 23505 (intencion duplicada) y 42501 (privilegios/inmutabilidad/generacion de ledger). No se ocultan como exitos ni se relajan las comprobaciones 020.

## 10. Cierre

Se crearon seis laboratorios en total, incluyendo revisiones de catalogo y la regresion 019. Todos terminaron detenidos; sus archivos postmaster.pid estan ausentes. La comprobacion del sistema operativo no encontro listeners en sus 12 puertos ni procesos PostgreSQL asociados. No hubo servidor HTTP 021.

Los directorios se conservan como evidencia privada; no se borraron ni se reutilizaron clusters.

## 11. Limites y reversion selectiva

El esquema valida forma, referencias, unicidad y coherencia del recibo; no puede acreditar por si solo la verdad del texto del motivo, el origen autenticado de una peticion HTTP ni que una instantanea anterior represente el estado previo real. Eso debe implementarse y probarse en los escritores de 2D.8B.2 dentro de su transaccion.

La compatibilidad historica es deliberada: no se obliga a los escritores anteriores a producir formato 2. Por ello 021 no significa que los servicios actuales ya esten auditados. No se modificaron ETag, candado transaccional, recuperacion de comandos, motivos de Reservaciones o formatos PDF.

El indice de una auditoria por intencion se limita al nuevo formato y a las rutas actuales de un recurso por comando. Si posteriormente se autoriza un comando que modifica varios recursos nuevos, su contrato debera revisarse antes de ampliar esa regla.

Para revertir esta fase, conservar evidencias y retirar exclusivamente los ocho archivos nuevos enumerados, despues de comprobar que ninguna fase posterior los use. No restaurar archivos preexistentes. No ejecutar DOWN destructivo sobre datos con auditorias; para volver a 020 usar otro cluster sintetico nuevo con los scripts originales. No utilizar reset, clean ni restauraciones masivas.

Para reproducir, ejecutar desde la raiz `powershell.exe -NoProfile -NonInteractive -File scripts/AuditSchemaLab.ps1 -Mode Verify`; Verify siempre crea un directorio y cluster nuevos y los detiene al finalizar. Nunca pasar un destino existente a Verify.

## 12. Recomendacion para 2D.8B.2

Revisar estos resultados antes de autorizar la siguiente fase. Implementar entonces los escritores humanos sobre un laboratorio de escritura 021 expresamente aprobado, separado del perfil actual de solo esquema. Conservar la arquitectura command-api-lab, el candado comun y la captura de ids_bitacora; obtener actor, instante y snapshots en backend; comprobar cambios efectivos y motivo; insertar negocio, auditoria y ledger dentro de la misma transaccion. Mantener replay sin efectos, rollback por fallo de auditoria y autorizacion actual en escritura y recuperacion.

Probar servicios reales, dos administradores, perdida de respuesta tras COMMIT, revocacion y no-op. La aprobacion de esta fase no autoriza aun escritores, interfaz ni despliegue.
