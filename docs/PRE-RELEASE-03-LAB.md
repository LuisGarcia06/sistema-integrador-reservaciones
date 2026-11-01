# PRE-RELEASE-03-LAB — Validación real de 017 en PostgreSQL aislado

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`. HEAD conservado: `23d9ea21c04070aba3a49fd212d6a3106276c3a2`.  
**Conclusión:** **APROBADO PARA PREPARAR DESPLIEGUE.**

## 1. Resultado y alcance

Se creó un clúster PostgreSQL **18.3 independiente**, utilizando únicamente binarios ya instalados. La migración 017 se aplicó y repitió correctamente sobre un fixture sintético anterior a 017. **Los 18 casos obligatorios pasaron, sin fallos funcionales.** Siete comprobaciones adicionales de protecciones también pasaron, antes de abrir conexiones.

No fue necesario corregir SQL ni código funcional. Se completó la cobertura del verificador y se corrigieron dos incidencias del aprovisionamiento Windows, descritas en sección 6. No se instalaron programas ni dependencias.

La aceptación corresponde al componente de archivo y a este ensayo aislado. No certifica el esquema completo de la aplicación, una restauración productiva, la recepción auténtica de proveedores, el instalador ni una aceptación integral de operaciones.

**Aprobar el laboratorio no autoriza ejecutar 017 en la base principal ni en DEV.** No se continuó con PRE-RELEASE-04.

## 2. Revisión previa y aislamiento

Se leyeron `AGENTS.md`, `docs/PRE-RELEASE-01.md`, `docs/PRE-RELEASE-02.md`, `docs/PRE-RELEASE-03.md`, la migración 017 y el script preparado. No se encontró Docker en PATH ni en su ubicación habitual. `postgres.exe --version` confirmó 18.3; se eligió un clúster nuevo con esos binarios, sin reutilizar servidores o directorios de otras pruebas.

| Identidad comprobada | Valor |
|---|---|
| Binarios existentes | `C:\Program Files\PostgreSQL\18\bin` |
| Servidor | `127.0.0.1` exclusivamente |
| Puerto propio | **55473**; no se usó 5432 |
| Nombre del clúster | `pre_release_03_lab20261017` |
| Identificador de sistema PostgreSQL | `7697702573746832088` |
| Directorio de datos | `A:\sistema-integrador-reservaciones\.access-scope-lab\pre-release-03-lab20261017-pg18\data` |
| PID verificado | 44732 |
| Base efectiva | `pre_release_03_disposable_lab20261017` |
| Rol del script de pruebas | `pr03_fixture_test` |
| Cuenta propia de aprovisionamiento | `pr03_lab_owner`, creada por initdb en este clúster nuevo |
| Inicio del servidor | 13:17:28, America/Cancun |
| Comprobación persistente | 13:19:48–13:19:50, America/Cancun |

Antes de ejecutar se comprobó por consulta la ruta de datos, nombre de clúster, identificador de sistema, versión, dirección, puerto, base y usuario. El PID/ruta/puerto de `postmaster.pid` coincidieron. Las únicas bases del clúster son la desechable y las tres predeterminadas de initdb: `postgres`, `template0` y `template1`. No existen allí las bases principal o DEV. Las sesiones observadas antes/después pertenecían exclusivamente a la base desechable; durante el aprovisionamiento se usó también la base `postgres` **de este clúster nuevo**.

El inventario previo confirmó cero tablas en `public` y cero tablas de usuario en otros esquemas. La configuración efectiva procede exclusivamente del `postgresql.conf` nuevo; no se modificaron archivos, puertos, roles, permisos ni servicios de instancias existentes. No se registró un servicio Windows ni un arranque automático.

El rol de pruebas tiene LOGIN y CONNECT en la base desechable, USAGE/CREATE en `public` y propiedad de los objetos que crea el fixture. No es propietario de la base, superusuario, creador de bases/roles, replicador ni BYPASSRLS; no hereda privilegios ni pertenece a otros roles. No tiene CONNECT en `postgres` ni `template1`. `template0` no admite conexiones (`datallowconn=false`); la única base conectable con permiso efectivo del rol es la desechable.

Las contraseñas se generaron aleatoriamente para el laboratorio. Se guardan cifradas mediante DPAPI para el usuario Windows actual, en el directorio ignorado por Git, con ACL restringida al usuario y SYSTEM. El archivo transitorio requerido por initdb se retiró al terminar esa etapa. No se utilizaron credenciales de la aplicación ni se mostraron contraseñas/URLs con secretos en comandos, informes o evidencia.

## 3. Ejecución y protecciones conservadas

El verificador sigue exigiendo conjuntamente:

- `--execute-disposable`.
- `PRERELEASE03_DISPOSABLE_DATABASE_URL`, sin respaldo a `.env`.
- `PRERELEASE03_CONFIRM=SOLO_BASE_DESECHABLE_PRE_RELEASE_03`.
- Nombre desechable validado contra `current_database()` y esquema `public` vacío.

El controlador de laboratorio comprobó primero la identidad y pasó la URL únicamente en el entorno del proceso hijo, sin imprimirla. El proceso ejecutó el script preparado con el argumento obligatorio. Las variables del pool predeterminado del producto se sustituyeron por un host imposible y credenciales ficticias; todos los servicios recibieron explícitamente el pool del laboratorio. `APP_CONFIG_PATH=NUL` impidió cargar `.env`. GYG quedó deshabilitado y no se arrancaron API, workers ni Electron.

Una barrera adicional interceptó sockets antes de conectarlos y permitió únicamente **127.0.0.1:55473**. La barrera HTTP/fetch existente bloqueó proveedores externos. Se verificó que otro host y otro puerto se rechazan antes de abrir sockets. Las otras cinco pruebas negativas rechazaron falta de argumento, falta de URL, nombre inválido, falta de frase y protocolo inválido, antes de crear el pool.

Solo se ejecutaron el fixture `backend/__tests__/fixtures/eventosIntegracion.pre017.sql`, la migración 017 y operaciones sintéticas de comprobación. No se cargaron `database/schema.sql`, seeds ni migraciones anteriores.

SHA-256 de **017**, idéntico al preparado en PRE-RELEASE-03:

```text
5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817
```

El proceso terminó con código **0** y marcador `PRE_RELEASE_03_DISPOSABLE_OK`. El estado final se comprobó de nuevo mediante SELECT, sin repetir el fixture sobre una base poblada.

## 4. Los 18 casos ejecutados

Todos los casos siguientes están registrados individualmente como `passed` en [casos.json](pre-release-03-lab/casos.json). No son pruebas simuladas del driver PostgreSQL.

| # | Caso | Resultado observado |
|---|---|---|
| 1 | Esquema anterior | La guardia real rechazó el fixture sin 017. |
| 2 | Aplicación 017 | DDL y COMMIT correctos; guardia posterior aceptó el esquema. |
| 3 | Repetición controlada | Segunda ejecución completa correcta; índice y restricciones no se duplicaron. |
| 4 | Columnas | `archived_at` TIMESTAMP, `archived_by` INTEGER y `archive_reason` TEXT, admiten NULL; índice parcial presente y válido. |
| 5 | FK | Responsable inexistente y borrado del responsable referenciado rechazados con SQLSTATE **23503**. Ninguna fila se borró. |
| 6 | CHECK | Rechazados motivo nulo/vacío/blanco/501 caracteres, auditoría incompleta, archivo marcado aplicado y revisión descartada: **23514**. Motivo de 500 aceptado dentro de transacción revertida. |
| 7 | Aprobado/no aplicado | Servicio real archivó evento sintético con usuario 7001, motivo y fecha del servidor. |
| 8 | Aprobación original | Comparación íntegra de campos ajenos al archivo: revisión, nota, fecha y revisor 7002 conservados, además de identidad y snapshot. |
| 9 | Vínculo e identidad | Evento adicional vinculado a reserva 8001: proveedor, booking, hilo, identidad externa, snapshot y fila de vínculo iguales tras archivar. |
| 10 | Historial | Listado `archived=true` devolvió evento aprobado con ID y total correctos. |
| 11 | Pendientes activos | Archivo excluido; snapshot antiguo no reapareció. Un snapshot distinto posterior sí apareció pendiente. |
| 12 | Aplicación posterior | Seis caminos reales de aplicación GYG/FH, alta/modificación/cancelación, devolvieron `evento_archivado` antes de operar reservas. |
| 13 | Archivo de aplicado | Servicio devolvió `ya_aplicado`; auditoría de archivo siguió nula. |
| 14 | Doble archivo | Segundo intento devolvió `ya_archivado`; comparación íntegra confirmó primera auditoría intacta. |
| 15 | Concurrencia real | Una transacción mantuvo FOR UPDATE; archivo esperó. Se observó `wait_event_type='Lock'`; tras COMMIT del estado aplicado, archivo releyó y devolvió `ya_aplicado`. |
| 16 | Deduplicación | Reentrega idéntica conservó ID y archivo; snapshot distinto se insertó con identidad propia. |
| 17 | Reserva testigo | Reserva sintética 8001 continuó exactamente `{id_reservacion:8001, estado:'Pendiente'}`. |
| 18 | Ausencia de cambios ajenos | Exactamente cuatro tablas del fixture y ningún otro esquema de usuario; columnas/restricciones de las otras tres tablas y filas de usuarios, vínculo y reserva sin cambios. |

El catálogo final confirmó ambas restricciones `convalidated=true` y el índice parcial `indisvalid=true`, predicado `archived_at IS NOT NULL`.

**Límite del caso 15:** el ganador de la carrera es una aplicación **sintética mediante UPDATE SQL**, no un alta completa de reservación mediante proveedor. Bloqueos, espera, COMMIT y servicio de archivo son reales. Por separado, el caso 12 usa los seis aplicadores reales contra archivos ya confirmados. No se presenta como ejecutada una carrera entre dos flujos de negocio completos ni una entrega externa; la orden inversa conserva además cobertura simulada de PRE-RELEASE-03. Este ensayo valida el escenario persistente previsto por el script preparado.

El caso 18 se refiere a tablas de usuario del laboratorio: el DDL y la preparación actualizan necesariamente catálogos internos de PostgreSQL. No se afirmaron comparaciones sobre datos de otras instancias: no se abrieron conexiones a ellas.

Estado conservado: 10 eventos sintéticos —8 archivados, uno aplicado sintéticamente y un snapshot anterior sin archivo—, dos usuarios ficticios, una reserva testigo y un vínculo. Ningún ID de evento del laboratorio es 124 o 126.

## 5. Cobertura añadida antes de ejecutar

El script original no creaba un vínculo para demostrar su conservación (caso 9), ni comparaba inventario/estructura y otras filas del fixture (caso 18). Verificaba solo el estado de aprobación, sin revisión completa con nota, fecha y revisor.

Se documentaron esas brechas antes de ejecutar y se ampliaron únicamente las comprobaciones: vínculo sintético, comparación íntegra de campos originales, inventario/columnas/restricciones, filas testigo, motivos límite, resultados por caso y evidencia sin secretos. Se conservaron las defensas de destino y base vacía. No se modificaron ni desactivaron controles para obtener un resultado favorable.

No quedan casos obligatorios sin ejecutar dentro del alcance de componente descrito; los límites de integración completa se indican en sección 4.

## 6. Incidencias y correcciones del laboratorio

Se registraron las causas antes de modificar el controlador local de aprovisionamiento. No hubo fallos de migración, FK/CHECK o servicios que exigieran correcciones de producto.

1. **Protección de credenciales:** Windows PowerShell heredó `PSModulePath` incompatible y no pudo cargar `Microsoft.PowerShell.Security`. Un ensayo con texto ficticio reprodujo el fallo y otro sin esa variable heredada funcionó. Solo se había creado un directorio vacío con ACL restringida; no se había ejecutado initdb, escrito credenciales ni iniciado PostgreSQL. Se corrigió el entorno del subproceso, sin cambiar configuración Windows. El directorio vacío original `...\.access-scope-lab\pre-release-03-lab20261017` se conservó y se aprovisionó en otro directorio nuevo terminado en `-pg18`.
2. **Espera de arranque Windows:** `Start-Process -Wait` esperó al árbol que incluía al servidor persistente. initdb y arranque habían concluido, pero aún no se había creado rol/base. Log y `postmaster.pid` identificaron el servidor propio 44732. Se documentó el problema, se detuvo únicamente el PowerShell lanzador bloqueado 31896, hijo del Node 46984, y se corrigió a `$p.WaitForExit()` sobre pg_ctl. Se completó el clúster tras comprobar ruta, puerto, nombre, rol bootstrap y las tres bases predeterminadas. No se detuvo ni destruyó el servidor ni se tocaron otros procesos PostgreSQL.

No fue necesario repetir el ensayo funcional: su primera ejecución completa pasó. La repetición de 017 formó parte de esa ejecución. Después solo se hicieron inspecciones de lectura y verificaciones negativas sin conexiones.

## 7. Archivos y evidencia

| Archivo | Cambio de esta fase |
|---|---|
| `scripts/verificarArchivoEventosDesechable.cjs` | Verificador existente ampliado con casos/evidencia; protecciones originales conservadas. |
| `scripts/preRelease03Lab.cjs` — nuevo | Aprovisiona solo el laboratorio de ruta/puerto fijos, protege credenciales con DPAPI, verifica identidad, ejecuta con rol limitado y permite inspección de lectura. No destruye entornos. |
| `scripts/preRelease03LabNetworkGuard.cjs` — nuevo | Restringe sockets al destino autorizado y conserva barrera HTTP/fetch. |
| `docs/PRE-RELEASE-03-LAB.md` — nuevo | Este informe. |
| `docs/pre-release-03-lab/` — nuevo | Evidencia JSON sintética sin secretos. |

Evidencia:

- [Identidad previa y esquema vacío](pre-release-03-lab/aislamiento-antes.json).
- [18 casos persistentes](pre-release-03-lab/casos.json).
- [Salida y código de ejecución](pre-release-03-lab/ejecucion.json).
- [Identidad, permisos, catálogo y filas finales](pre-release-03-lab/aislamiento-despues.json).
- [Siete protecciones negativas](pre-release-03-lab/protecciones.json).
- [Huellas de fuentes y evidencia](pre-release-03-lab/huellas.json).

Los tres scripts superaron `node --check`; `git diff --check` no encontró errores de espacios. No se reejecutó la regresión simulada de 419 pruebas de PRE-RELEASE-03 porque no cambió código funcional. Esa evidencia histórica permanece separada de los 18 casos PostgreSQL y no se suma como ejecución nueva.

El SQL 017, fixture, backend/frontend, permisos ACCESS-SCOPE, UI aprobada de vehículos y documentos/capturas previos permanecen sin cambios de esta fase. Los comentarios históricos “no ejecutada” en PRE-RELEASE-03/SQL describen aquella fase: este informe acredita ejecución **únicamente en laboratorio**.

## 8. Conservación y límites operativos

El servidor queda **en ejecución** solo en loopback, con datos, log, manifiesto y credenciales DPAPI conservados en el directorio ignorado. `pg_ctl status` confirmó PID 44732. No se limpió, eliminó ni recreó la base; no hay destrucción automática. El entorno no se inicia automáticamente tras reiniciar Windows.

Para revisar identidad/estado mediante SELECT desde este mismo usuario Windows:

```powershell
node scripts/preRelease03Lab.cjs --verify
```

`--prepare` rechaza directorio existente y `--execute` exige base vacía antes de invocar el fixture. No deben usarse para repetir sobre este laboratorio poblado. Un nuevo ensayo que necesite recreación requerirá destino aislado explícito, preservando esta evidencia.

No se conectó al clúster principal ni a DEV durante esta fase. No se consultaron/modificaron eventos reales 124/126 ni usuarios reales. No hubo sincronizaciones GYG/FareHarbor, WhatsApp, cancelaciones, cambios de credenciales reales, servicios existentes, instalador, commit, push o cambio de rama. No se abrió Electron contra bases reales ni se construyó un ejecutable.

## 9. Decisión siguiente

**APROBADO PARA PREPARAR DESPLIEGUE.** La siguiente autorización deberá identificar destino, respaldo restaurable, ventana, responsable y procedimiento compatible antes de intervenir otra base. Este resultado no elimina pendientes de aceptación visual de archivo, puesta en marcha real de integraciones, recuperación y distribución que correspondan.

**No se autoriza ni se ejecuta la migración principal. No se continúa automáticamente con PRE-RELEASE-04. Se esperan instrucciones del usuario.**
