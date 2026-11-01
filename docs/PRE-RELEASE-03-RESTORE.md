# PRE-RELEASE-03-RESTORE — Restauración y ensayo de 017

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`. HEAD conservado: `23d9ea21c04070aba3a49fd212d6a3106276c3a2`; cambios PRE-RELEASE anteriores conservados.  
**Conclusión:** **RESTAURACIÓN Y MIGRACIÓN APROBADAS EN LABORATORIO.**

Se restauró el respaldo autorizado en un clúster PostgreSQL 18.3 nuevo. Antes de migrar se comprobó el contenido de las 18 tablas, estructura y secuencias contra el respaldo. Después se ejecutó exclusivamente 017 sobre esa copia, se probaron archivo y notificaciones mediante servicios/rutas reales y se volvió a comprobar toda la información original.

**No hubo conexiones a principal, DEV ni laboratorios anteriores. No se utilizó `.env`, no se abrió Electron normal y no se modificó ningún servidor existente.** El laboratorio final permanece conservado, privado y **detenido**.

## 1. Identidad y aislamiento del laboratorio aprobado

| Elemento | Resultado |
|---|---|
| PostgreSQL y herramientas | **18.3**, binarios existentes en `C:\Program Files\PostgreSQL\18\bin` |
| Dirección y puerto | **127.0.0.1:57593**, exclusivamente loopback |
| Base restaurada | **pre_release_03_restore_c2389470589e** |
| Identificador de sistema | **7697790721838933676** |
| Nombre del clúster | `pre_release_03_restore_c2389470589e` |
| Cuenta de aprovisionamiento | `pr03_restore_owner`, propia del clúster nuevo |
| Cuenta de restauración/ensayo | `pr03_restore_app`, propia y sin superusuario |
| Estado al finalizar | Servidor detenido; cero listeners en su puerto; directorio conservado |

Directorio privado:

```text
A:\sistema-integrador-reservaciones\.access-scope-lab\pre-release-03-restore\run-20261017T235926123Z-d232357f
```

Directorio de datos: `data` dentro de esa carpeta. El identificador es distinto del principal **7632825987452064788**, del laboratorio anterior **7697702573746832088**, de PROD-ACCESS-02B **7697092329288606316** y de los intentos de preparación de esta fase.

Antes de restaurar se verificaron por consulta base, usuario, dirección/puerto, `data_directory`, versión e identificador, además de `postmaster.pid`. El clúster recién inicializado contenía solo `postgres/template0/template1`; después se creó una base nueva y se comprobó vacía. Nunca existieron allí bases llamadas `sian_kaan_reservaciones` o `sian_kaan_reservaciones_dev`.

El puerto se eligió libre mediante el sistema operativo, excluyendo 5432, 55473 y puertos históricos conocidos. No se registró servicio Windows ni inicio automático. PostgreSQL escuchó solo en 127.0.0.1, con SCRAM y sin socket Unix.

La definición original se leyó del respaldo con `pg_restore --create --schema-only --file=-`, sin ejecutar ese SQL. La base nueva se creó explícitamente con **UTF8, proveedor libc y LC_COLLATE/LC_CTYPE `Spanish_Mexico.1252`**, coincidiendo con esa definición. El clúster de mantenimiento se inicializó en locale C; la base de restauración utiliza la colación original indicada, no ese default. En esta instalación Windows las columnas de versión de colación devuelven NULL; no se certifica una versión numérica de colación ausente.

El rol de ensayo es propietario de esta base y sus tablas para restaurar/migrar; no tiene superusuario, CREATEDB, CREATEROLE, replicación, BYPASSRLS ni INHERIT. Su CONNECT efectivo se limita a esta base. **No acredita todavía un rol runtime mínimo de producción**, porque conserva facultades de propietario/DDL en la copia.

## 2. Respaldo utilizado

Directorio original, utilizado únicamente en lectura:

```text
A:\sistema-integrador-reservaciones\.access-scope-lab\pre-release-03-main-backup\run-20261017T212123838Z-9d91b157
```

Archivo:

```text
sian_kaan_reservaciones_2026-10-17T21-21-24-484Z_d403e067.backup
```

**124.403 bytes**, formato custom PostgreSQL, cabecera PGDMP. SHA-256 verificado antes y después:

```text
99ea69f746333879c77ce0f434181f372d12f582acf0d51641b7544d0aae660e
```

El índice se leyó con pg_restore 18.3: **122 entradas**, 18 TABLE/DATA, 17 SEQUENCE/SEQUENCE SET, restricciones e índices esperados. Inventario y manifiesto coinciden con PRE-RELEASE-03-PROD. No se sobrescribió, modificó ni copió fuera del equipo el respaldo original.

## 3. Opciones y resultado de restauración

Se utilizó `pg_restore` con destino explícito al host/puerto/base/rol nuevos y:

```text
--exit-on-error --single-transaction --no-owner --no-acl
```

**En la restauración conectada a PostgreSQL no se utilizaron `--create`, `--clean`, DROP DATABASE ni sustitución de bases existentes.** `--create` se utilizó únicamente al decodificar metadatos a texto, sin destino PostgreSQL. La información de creación del archivo no se ejecutó sobre el servidor habitual: se restauró dentro de la base de laboratorio previamente creada y vacía.

| Medida | Ejecución final |
|---|---:|
| Código de salida pg_restore | **0** |
| Errores/advertencias | **0** |
| Duración de pg_restore | **0,546 s** |
| Duración del ensayo completo, incluyendo aprovisionamiento y cierre | Aproximadamente **12,3 s** |

La ejecución final comenzó `2026-10-17T23:59:26.375Z` y terminó `23:59:38.656Z` —18:59:26 a 18:59:38 de Cancún—. Estas mediciones locales sobre un respaldo pequeño no fijan RTO/RPO ni garantizan tiempos futuros.

`--no-owner --no-acl` permitió restaurar bajo el propietario del laboratorio sin crear los roles globales originales. **Se validaron esquema y datos; no se reprodujeron íntegramente propietarios, grants, membresías o seguridad del servidor principal.** No se copiaron contraseñas de roles PostgreSQL, servicio, pg_hba, configuración, JWT ni OAuth. Los hashes de autenticación de la tabla `usuarios` sí forman parte de los datos restaurados y se conservaron sin mostrarlos.

## 4. Comparación de tablas y contenido

Conteos antes de 017, idénticos al punto respaldado:

| Tabla | Filas originales verificadas |
|---|---:|
| reservaciones | **1.150** |
| operaciones_tour | **10** |
| transportes_operacion | **10** |
| usuarios | **4** |
| eventos_integracion | **136** |
| reservas_integracion_link | **8** |
| tours | **14** |
| vehiculos | **2** |
| roles | **2** |
| bitacora | 65 |
| daily_observaciones | 0 |
| equivalencias_tours_externos | 1 |
| guias | 1 |
| integracion_sync_estado | 1 |
| operadores | 1 |
| paises | 3 |
| plataformas | 5 |
| usuario_plataformas_visibles | 2 |

Se decodificaron los COPY del respaldo sin ejecutar su SQL y se compararon con un `pg_dump --data-only` de la copia restaurada. Las huellas SHA-256 de **todas las filas completas**, ordenadas por sus huellas para no depender del orden físico, coincidieron en las 18 tablas; también coincidieron encabezados/orden de columnas y estados de secuencias. Las filas se procesaron en memoria y no se publicaron.

Además se registraron las PK originales y firmas por tabla, usando las columnas originales. Esas mismas filas/columnas se compararon después de 017 y al terminar las pruebas funcionales. **Las 18 firmas y sus conteos siguieron iguales.** Esto verifica IDs originales, importes, estados, usuarios, hashes de autenticación, operaciones, vínculos y contenido original, sin exponer sus valores.

Los conteos corresponden al respaldo; no se consultó un eventual estado posterior de principal.

## 5. Claves, relaciones, índices y secuencias

Antes de 017: **18 PK, 18 FK, 12 UNIQUE, 15 CHECK y 34 índices**, con restricciones validadas e índices válidos/preparados. Las 18 FK se comprobaron mediante consultas de huérfanos: **cero** en todas. Se conservaron tipos, nullabilidad, defaults e identidades.

Se verificaron las **17 secuencias**, sus valores `last_value/is_called`, incremento y el próximo valor calculado. Todas coincidieron con el respaldo antes de pruebas; el siguiente valor era seguro frente al máximo de la columna correspondiente. No se invocó `nextval` para verificarlo.

**017 no cambió ninguna secuencia.** Los fixtures posteriores avanzaron únicamente las secuencias necesarias para sus nuevas filas en la copia: usuarios, reservaciones, eventos y vínculos. Las 17 siguen con próximos IDs seguros. No se renumeraron ni alteraron identificadores originales. El rol y las filas de la tabla `roles` tampoco cambiaron.

Después de 017 hay **19 FK, 16 CHECK y 35 índices**, conservando las PK/UNIQUE y añadiendo únicamente los objetos de archivo. La comprobación final de todas las FK siguió sin huérfanos.

## 6. Migración 017 aplicada solo a la copia

SHA-256 exacto del archivo aprobado:

```text
5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817
```

Se confirmó que la copia no tenía campos/restricciones de 017 y que la guardia real rechazaba ese esquema. Solo entonces se ejecutó el archivo, **una vez en el laboratorio final**, respetando su BEGIN/COMMIT. No se ejecutaron schema.sql, seeds ni migraciones históricas.

Duración de 017: aproximadamente **0,006 s**. Se verificaron:

- `archived_at TIMESTAMP`, `archived_by INTEGER` y `archive_reason TEXT`, admitiendo NULL.
- FK `fk_eventos_integracion_archived_by` a `usuarios`, validada.
- CHECK `chk_eventos_integracion_archivo`, validado, con auditoría completa y restricciones de motivo/estados.
- Índice parcial válido `idx_eventos_integracion_archived_at`, por `archived_at DESC, id_evento_integracion DESC`, predicado `archived_at IS NOT NULL`.
- Todas las columnas, restricciones y datos originales conservados; las **136 filas originales** comenzaron y terminaron con sus tres campos de archivo en NULL.

La guardia `verificarEsquemaArchivoEventos()` aceptó el esquema completo. Para ensayar su protección se retiró provisionalmente el CHECK nuevo **dentro de una transacción que se revirtió**: rechazó el esquema incompleto y volvió a aceptar tras ROLLBACK. No quedó ninguna alteración adicional.

## 7. Archivo funcional: escrituras sintéticas delimitadas

Se crearon exclusivamente en la copia aprobada:

- **Tres usuarios ficticios**, IDs 100/101/102, para Administrador, Consulta all y Consulta selected; contraseñas aleatorias propias y JWT de laboratorio.
- **Una reservación ficticia**, ID 1800, fecha 2099, pickup/turno explícitos y sin transporte; no se editó ninguna de las 1.150 originales.
- **Once eventos ficticios**, IDs **137–147**, con identidades externas `restore-synthetic-*` sin proveedores conectados.
- Un vínculo externo ficticio a la reservación 1800 y una asignación de plataforma al usuario selected ficticio.

Se utilizaron catálogos/roles existentes solo como referencias, sin modificarlos. Quedan conservados los fixtures: siete eventos archivados, dos pendientes, uno marcado aplicado sintéticamente y uno descartado. La marca de aplicado sirve únicamente para comprobar su exclusión del resumen; no representa una reserva recibida o aplicada desde un proveedor.

Resultados con los servicios reales:

| Caso | Resultado |
|---|---|
| Motivo válido | Archivo confirmado con motivo, responsable ficticio y fecha del servidor correctos. |
| Revisión | Se conservaron estado, nota, revisor y fecha de aprobación. |
| Pendientes | Evento archivado excluido del listado operacional y del resumen. |
| Historial/detalle | Evento y responsable consultables mediante los servicios existentes. |
| Vínculo | Identidad externa y vínculo a la reserva ficticia intactos. |
| Archivo duplicado | `ya_archivado`; auditoría inicial íntegra. |
| Aplicación posterior | Los **seis aplicadores reales** GYG/FH —alta/modificación/cancelación— devolvieron `evento_archivado` antes de operar reservaciones. |
| Conservación | Firmas de todos los registros originales idénticas tras las pruebas. |

**No se archivaron ni modificaron los eventos originales 124/126**, tampoco en la copia. Permanecen dentro de las 136 filas originales verificadas y sin archivo.

El estado final contiene 1.151 reservaciones, siete usuarios, 147 eventos, nueve vínculos y tres asignaciones de plataforma **solo en este laboratorio**, por las inserciones ficticias descritas. No se presenta ese estado como inventario nuevo de principal.

## 8. Notificaciones con PostgreSQL real aislado

Se montó exclusivamente el router real `eventosIntegracion.routes.js` en una instancia Express mínima de laboratorio, con puerto HTTP efímero en loopback. No se cargó `backend/server.js`, Electron, workers, Gmail, webhook ni clientes de proveedores.

El pool central se sustituyó explícitamente por un adaptador al nuevo clúster. Para las solicitudes se utilizó un **pool READ ONLY**, confirmado en PostgreSQL. Se emitieron JWT propios para usuarios sintéticos; se ejecutaron el middleware JWT, consulta de usuario activo y resolución ACCESS-SCOPE reales. No es una prueba del formulario de login ni de recepción externa.

| Solicitud | Resultado |
|---|---:|
| Administrador ficticio, GET resumen | **200**, `no-store` |
| Consulta all ficticio, GET resumen | **200**, mismos conteos autorizados |
| Consulta selected ficticio, GET/HEAD | **403**, sin ejecutar consulta del resumen |
| Sin sesión | **401** |

Sobre las 136 filas restauradas, antes de fixtures: **123 pendientes**, 121 accionables y dos altas FH transcurridas que requieren archivo. Después de fixtures: **125 pendientes**, 122 accionables y tres que requieren archivo; cero horarios indeterminados. El aumento corresponde exactamente a dos eventos sintéticos elegibles, incluido uno FH vencido. Archivados, aplicados y descartados quedaron excluidos.

**Esos conteos pertenecen a la copia y al entorno aislado sin cutoff configurado.** No se leyó `.env` ni se asumió que representen el Dashboard principal con otra configuración.

Se efectuaron 14 lecturas correctas autorizadas, de ellas 12 para medición: media **6,15 ms**, percentil 95 **11,47 ms**, incluyendo HTTP, autenticación y alcance en este equipo. Es una comprobación básica local, sin concurrencia ni garantía de rendimiento productivo.

Se registró solo SQL de lectura y se compararon firmas de **todas** las filas —incluidos fixtures— y estados de secuencias antes/después: iguales. No hubo escrituras por las notificaciones. La clasificación/consulta no envió ni recibió solicitudes de proveedores.

## 9. Seguridad y custodia

Todo el clúster, logs, manifiesto y credenciales están bajo la carpeta nueva ignorada por Git. Las ACL permiten únicamente la cuenta Windows actual y SYSTEM. Se verificaron **1.397 archivos/directorios, sin ACL inesperadas**. Las credenciales del clúster son propias, protegidas con **DPAPI**; el archivo transitorio de initdb se retiró. No se imprimieron contraseñas, URLs con secretos, filas personales o hashes de autenticación.

El entorno de los hijos se construyó con allowlist de Windows. Una barrera Node permitió únicamente el puerto PostgreSQL nuevo y el HTTP efímero de la prueba; se comprobaron rechazos de 5432 y 55473 **antes de abrir sockets**. Se bloquearon `dotenv`, el pool predeterminado sin inyección, clientes Google y arranque normal. Las herramientas nativas recibieron dirección/puerto/base/usuario explícitos y únicamente la credencial del laboratorio en su entorno.

No se creó una conexión a principal o DEV para “comprobar que seguían iguales”: estaban fuera del alcance de conexiones autorizado. La evidencia de conservación corresponde al respaldo y a sus filas restauradas; esta fase no intervino esos servidores. Tampoco se consultó ni modificó el laboratorio persistente de PRE-RELEASE-03-LAB.

No se borró el laboratorio. El servidor final quedó detenido mediante su propio pg_ctl, tras verificar ruta/PID/puerto; cero listeners y sin `postmaster.pid`. Los intentos previos también permanecen conservados y detenidos. No se terminaron servidores ajenos ni se modificaron servicios Windows existentes.

## 10. Incidencias del verificador y alcance de la aprobación

Se realizaron dos correcciones **del verificador de laboratorio** y un ajuste de aprovisionamiento, sin modificar producto, ACCESS-SCOPE, SQL 017 ni datos para acomodar un resultado:

1. **Representación de CHECK.** La primera restauración terminó con salida 0, pero la comparación textual se detuvo antes de migrar. PostgreSQL reexpresó el CHECK de alcance como casts individuales dentro del ARRAY, frente al cast del ARRAY completo. La inspección posterior fue exclusivamente de lectura y confirmó los mismos valores `all/selected`, columna VARCHAR(20) y restricción validada. Se amplió la normalización estrecha de expresiones equivalentes que ya se utilizaba para otros CHECK. Una prueba negativa confirma que cambiar un valor permitido sigue detectándose. No se alteró la restricción restaurada.
2. **Fecha sin zona horaria.** En el segundo intento, restauración íntegra y 017 pasaron. Una aserción sobre la fecha de archivo asumía que el parser JavaScript interpretaba UTC, aunque el tipo es TIMESTAMP sin zona y el proceso usa zona local. Se corrigió la comprobación para comparar `archived_at` con el reloj de PostgreSQL. No se cambió el tipo, SQL ni servicio de archivo.
3. **Colación original.** El tercer intento pasó sus pruebas funcionales, pero utilizó el default C del clúster. La revisión adicional de la definición de creación almacenada en el respaldo identificó `Spanish_Mexico.1252`. Se ajustó exclusivamente la creación de la base nueva para conservar encoding/proveedor/colación y se repitió el ensayo completo en otro destino. No se alteró la colación de ninguna base existente.

Para la validación definitiva se creó **otro clúster nuevo** y se repitió todo desde el respaldo original: terminó correctamente. Los intentos iniciales no se presentan como ensayos completos aprobados:

| Intento conservado | Puerto | Identificador de clúster | Estado |
|---|---:|---|---|
| `run-20261017T235233169Z-7a85cf7a` | 57479 | 7697788951308892140 | Detenido antes de 017 por comparación; inspección posterior de lectura. |
| `run-20261017T235417877Z-a5909f26` | 57512 | 7697789398560128504 | Restauración/017 correctas; prueba detenida por aserción de fecha. |
| `run-20261017T235452522Z-48a09225` | 57533 | 7697789546630300360 | Pruebas funcionales correctas con locale C; sustituido como evidencia definitiva. |
| **`run-20261017T235926123Z-d232357f`** | **57593** | **7697790721838933676** | **Ensayo definitivo con colación original, aprobado y detenido.** |

La aprobación acredita la restauración lógica de **este respaldo**, el efecto de 017 y los servicios probados sobre esa copia. No acredita recuperación integral de roles/configuración/servicio, arranque normal, instalador, concurrencia completa, recepción de proveedores ni aceptación operativa de la empresa.

## 11. Evidencia y archivos

**12 grupos de comprobaciones persistentes aprobados** en el ensayo final, además de **cinco pruebas unitarias de seguridad/verificación**, sin conexión a PostgreSQL. No se suman reintentos como casos nuevos.

Nuevos:

- `scripts/RestorePreRelease03Lab.ps1`: carpeta nueva privada y entorno acotado.
- `scripts/preRelease03Restore.cjs`: aprovisionamiento, identidad, restauración, comparaciones y cierre propio. `--new-lab` siempre crea un destino nuevo; `--inspect-lab` solo inspecciona metadatos de un laboratorio propio detenido, sin migrar.
- `scripts/preRelease03RestoreSafety.cjs`: barreras, huellas de COPY, metadatos, firmas de filas originales, FK y secuencias. Reutiliza el validador de TOC de PRE-RELEASE-03-PROD sin ejecutar su respaldo ni cargar credenciales.
- `scripts/preRelease03RestoreCases.cjs`: 017, fixtures delimitados, servicios reales, ruta HTTP y verificación de lectura/permisos.
- `backend/__tests__/preRelease03RestoreSafety.test.js`, este informe y evidencia nueva.

Evidencia pública sin filas personales:

- [Resultado definitivo](pre-release-03-restore/resultado.json): identidad, tiempos, 12 grupos, firmas agregadas, fixtures y notificaciones.
- [Aislamiento antes de restaurar](pre-release-03-restore/aislamiento.json): base nueva/vacía y rol propio.
- [Verificación de cierre, ACL e integridad](pre-release-03-restore/verificacion.json).
- [Cinco pruebas de seguridad](pre-release-03-restore/jest-seguridad.json).
- `inspeccion.json`, `intento-02.json`, `fallo.json` e `intento-03-locale-c.json`: incidencias/ensayos históricos previos; **no sustituyen el resultado definitivo**.

Inventario detallado, listas de PK originales, credenciales DPAPI y demás artefactos permanecen privados junto al clúster. El respaldo original conserva su hash. Los hashes de fuentes de PRE-RELEASE-03-PROD verificados permanecen iguales, incluidos Electron, conexión, guardia y 017. No hubo cambios funcionales del producto, instalación de dependencias, commit o push.

## 12. Recuperación ante una futura intervención fallida

Este ensayo demuestra que se puede reconstruir esquema/datos del punto respaldado en un clúster limpio compatible, bajo un propietario de laboratorio. Antes de usarlo para recuperación principal se necesita:

1. Un respaldo final autorizado y reciente, con hash/custodia y recuperación de roles/ACL/configuración definida y ensayada.
2. Identificar los cambios posteriores al respaldo. Restaurarlo perdería esos cambios si no se reconcilian; no asumir que el punto de 1.150 reservas sigue siendo actual.
3. Ventana sin clientes/proveedores y código/destino inequívocos. Ante error antes del COMMIT de 017, ROLLBACK y verificación; ante fallo posterior, mantener actividad detenida y diagnosticar.
4. Preferir corrección compatible revisada o recuperación primero en un clúster nuevo. No ejecutar restauración sobre principal, DROP o cambio de destino sin autorización específica.
5. Comparar toda la información e integridad antes de aceptar un corte. Conservar auditoría de archivos y escrituras nuevas para conciliación.

**Volver a un backend anterior no es una reversión segura después de archivar eventos:** puede ignorar metadatos de archivo, revivir pendientes o permitir aplicaciones indebidas. No borrar las columnas de 017 para forzar un arranque ni restaurar automáticamente un dump pre-017 sobre datos posteriores.

## 13. Siguiente procedimiento recomendado y restricciones

Revisar este resultado y coordinar **RELEASE-03A**: configuración protegida, separación de roles de ejecución/migración, entorno sin precedencias silenciosas y comprobación privada de identidad del backend. Debe rechazarse un servicio ajeno/DEV/laboratorio en 3000, incluso si responde con el mismo texto de salud. Verificar base/clúster/esquema/código por el proceso propio antes de abrir la interfaz, con errores claros sin secretos.

Después, solo mediante nueva autorización: respaldo final si corresponde, ventana acordada y ejecución exclusivamente de 017 sobre principal, verificaciones de conservación/permisos y aceptación de los tres perfiles. La activación de proveedores es otra autorización. El objetivo sigue siendo habilitar **`npm run desktop` con seguridad**, pero este ensayo no ejecuta ni autoriza ese paso.

**No se modificó PostgreSQL principal o DEV ni se conectaron a ellas los scripts de prueba. No se alteró el laboratorio anterior, credenciales reales, instalador o ACCESS-SCOPE. No se limpiaron datos ni se eliminaron reservaciones/usuarios; no se archivaron 124/126. Gmail/GYG/FareHarbor/WhatsApp permanecieron fuera del ensayo. Sin commit ni push.**

**RESTAURACIÓN Y MIGRACIÓN APROBADAS EN LABORATORIO.** No continuar automáticamente con RELEASE-03A, migración principal o `npm run desktop`; se esperan instrucciones del usuario.
