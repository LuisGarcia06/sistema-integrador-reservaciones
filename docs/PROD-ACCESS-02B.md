# PROD-ACCESS-02B — Migración 016 y pruebas locales en principal

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.

La migración 016 se confirmó en principal tras verificar un respaldo actualizado, su restauración y su ensayo en un clúster independiente. Todos los campos originales coincidieron. La validación integrada terminó con 18 comprobaciones aprobadas y cero fallos; se conservaron las 1.144 reservaciones y se añadieron únicamente dos usuarios ficticios de Consulta. El uso de postgres por Express está autorizado temporalmente solo para estas pruebas locales; no se aprueba para producción.

## 1. Autorización y mantenimiento

El usuario autorizó respaldo, restauración aislada, exclusivamente 016 y pruebas con usuarios ficticios. Autorizó temporalmente postgres en un lanzador específico sin crear roles nuevos. Confirmó que mantendría cerrados clientes, pgAdmin y sincronizadores. No había Electron/Express ni puerto 3000 ocupado al iniciar; se revisaron también las conexiones PostgreSQL antes del respaldo y del COMMIT. No se terminaron procesos ajenos.

## 2. Identidad de principal

Base: sian_kaan_reservaciones. Host localhost, puerto 5432, dirección ::1, esquema public, PostgreSQL 18.3, usuario postgres. Clúster: 7632825987452064788. La identidad se comprobó mediante conexión efectiva y de nuevo dentro del proceso psql que ejecutó el archivo.

## 3. Respaldo actualizado

Archivo privado: `A:\sistema-integrador-reservaciones\.access-scope-lab\prod-access-02b\run-c05d6b369815\sian_kaan_reservaciones_2026-10-16T02-49-19-584Z.backup`.

Formato Custom, 120691 bytes. Código pg_dump 0; cabecera PGDMP y catálogo con 17 TABLE DATA verificados. No se sobrescribió ningún respaldo previo. ACL de archivo/carpeta solo para usuario Windows actual y SYSTEM. SHA-256:

`d6d8108136a3a90e9d55988c5cf9a2ccb10d2f266cc664cb5275fd617a56ea7a`

## 4. Restauración, ensayo y recuperación

Clúster independiente 7697092329288606316, 127.0.0.1:62415, directorio `A:/sistema-integrador-reservaciones/.access-scope-lab/prod-access-02b/run-c05d6b369815/data`. Cuenta de mantenimiento exclusiva prod_access_02b_lab, credencial independiente cifrada con DPAPI. Laboratorio detenido y conservado.

Bases nuevas: `prod_access_02b_c05d6b369815_rehearsal` y `prod_access_02b_c05d6b369815_recovery`. Se verificaron ausencia, vacío e identidad antes de restaurar. pg_restore utilizó --exit-on-error --single-transaction --no-owner --no-acl, sin --clean ni bases existentes. Propietarios/ACL se resolvieron solo dentro del laboratorio; no equivalen a recuperar permisos globales del clúster principal.

La copia restaurada coincidió con la línea base del punto respaldado en todas las filas/campos y secuencias. Se comprobaron las 16 FK sin huérfanos, se ensayó 016 y se conservó todo el contenido anterior. La segunda restauración recuperó el esquema pre-016 y las mismas firmas/secuencias.

## 5. Migración 016 y conservación

Archivo: database/migrations/016_alcance_plataformas_usuarios.sql. SHA-256:

`41bc5fb45c636040ba229eec2f2113431dbb33599b625222a5a0dc39b4b260f3`

Se ejecutó una sola vez sobre principal con psql 18.3, -X, ON_ERROR_STOP=1, destino explícito y guardia SQL de identidad/ausencia de clientes. Se respetó su BEGIN/COMMIT. No se ejecutaron schema.sql, seeds.sql, migraciones anteriores ni limpieza. Se fijaron search_path=public, lock_timeout=5s y statement_timeout=60s.

Resultado inmediato: 18 tablas, 18 PK, 18 FK y 15 CHECK; todas validadas. usuarios.alcance_plataformas VARCHAR(20) NOT NULL, default selected, CHECK all/selected. Los dos usuarios existentes recibieron all. Puente con PK compuesta y ambas FK, inicialmente vacío.

Se compararon SHA-256 de todas las columnas originales de todas las filas, ordenadas por PK, y recuentos. Coincidieron las 17 tablas, incluidas las 1.144 reservaciones, usuarios, roles, estados y hashes de contraseña. Las secuencias tampoco cambiaron por 016. No se mostraron valores ni hashes de contraseña.

## 6. Duraciones y verificaciones

| Operación | Segundos |
| --- | ---: |
| backup | 0.328 |
| restore | 0.542 |
| rehearsal_migration | 0.427 |
| recovery_restore | 0.433 |
| main_migration | 0.251 |

Migración: 34 comprobaciones aprobadas y 0 fallos en ejecución final. Pruebas aisladas: 193 aprobadas en 8 suites, con noPostgres y sin api.test.js destructivo. Incluyen autorización y capacidad 12/24, sin modificar reservas. Los tiempos no garantizan una ventana productiva.

## 7. Arranque protegido de pruebas

Comando verificado desde Windows PowerShell 5.1.19041.6456, sin depurador:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\ProdAccessTest.ps1 -Modo Electron
```

Configuración exclusiva `.access-scope-lab/prod-access-02b/config.env`, JWT propio y perfil Electron separado. No guarda DB_PASSWORD: lee la credencial ya existente en .env solo en memoria, sin mostrarla ni duplicarla. Descarta variables heredadas DB/PG/JWT/proveedores/NODE_OPTIONS.

El pool central se valida antes de HTTP: principal exacta, postgres, loopback:5432, clúster aprobado, public y ACCESS-SCOPE. Puerto 3000 libre, backend propio con nonce/identidad por IPC privado y cierre propio. No reutiliza salud de otro backend ni publica metadatos sensibles. Rechaza modo empaquetado o mezcla con DEV-DB-03.

Se conservan sandbox, contextIsolation, webSecurity y ausencia de nodeIntegration. Worker no iniciado, rutas de integración 503 y salida de backend/renderer bloqueada salvo PostgreSQL local y HTTP de la aplicación según el proceso. El arranque seguro de desarrollo y su rechazo de postgres no se modificaron.

Arranque normal comprobado: ventana propia visible, salud 200 y cierre normal. El uso de superusuario sigue siendo un riesgo aceptado temporalmente por el usuario; la excepción está limitada a este flujo/destino, no es un bypass general ni aprobación productiva.

## 8. Pruebas de acceso y usuarios ficticios

Completado desde Windows PowerShell 5.1 con Electron real, Express propio y PostgreSQL principal. Las dos cuentas originales se verificaron sin restablecer sus claves; las credenciales de aplicación permanecen cifradas mediante DPAPI. El ensayo integrado final aprobó 18 comprobaciones y terminó con código 0.

| Perfil | Alcance | Reservaciones visibles | Resultado |
| --- | --- | ---: | --- |
| Administrador existente | all | 1.144 | Login, Dashboard, Usuarios y acceso completo correctos |
| Consulta existente | all | 1.144 | Login y lectura correctos; crear/modificar/cancelar denegados |
| Consulta ficticia ID 98 | selected: GetYourGuide y FareHarbor | 553 | Solo Dashboard y Reservaciones; filtros y detalles limitados |
| Consulta ficticia ID 99 | selected sin plataformas | 0 | Lista y conteos vacíos; nunca recibe acceso completo por omisión |

Los únicos usuarios añadidos, mediante POST normal de Administración con la sesión del Administrador existente, son:

- ID 98: consulta.selected.prod02b@example.test; plataformas ID 2 (GetYourGuide) e ID 1 (FareHarbor).
- ID 99: consulta.empty.prod02b@example.test; ninguna plataforma.

Se conservarán identificados para FINAL-DB-01; esta fase no los elimina. No se crearon roles PostgreSQL en el clúster principal. Sus claves aleatorias se guardan únicamente en el archivo DPAPI privado y se consultan en una ventana local con el comando de sección 12; no se incluyen aquí.

Comprobaciones integradas:

- Login mediante el formulario real, sesión, menú y cierre de sesión de los cuatro perfiles; retirada del token y del contenido anterior.
- Conteos completos y por plataforma; catálogo de filtros limitado; código, paginación de 25 filas sin solapamiento, validación de límite, detalle visible 200 y oculto/inexistente 404.
- Rutas de módulos excluidos 403; crear, modificar y cancelar denegados para Consulta. No se ejecutó ninguna cancelación ni edición de reservaciones.
- Revocación de FareHarbor del usuario ficticio ID 98 por PATCH administrativo normal mientras tenía abierto un detalle de esa plataforma. El detalle pasó a 404 con la sesión existente, la renovación retiró el diálogo y el filtro, y la restauración de las dos plataformas devolvió la visibilidad original. Solo se cambiaron las asignaciones del usuario ficticio.
- Dashboard contrastado con consultas de solo lectura en las nueve fechas con reservaciones vigentes: siete contienen reservaciones fuera del alcance y dos contienen reservaciones visibles. Coincidieron conteos y PAX; las filas recientes pertenecían únicamente a plataformas asignadas y no se expusieron alertas/salidas globales. Selected vacío devolvió cero. En la fecha 2027-02-07, Administrador/Consulta all/Consulta selected obtuvieron 1 reservación vigente y 2 PAX; Consulta vacía obtuvo 0/0.
- Historial y consulta de canceladas mediante lecturas; PDF Daily real de 70.000 bytes con cabecera %PDF a un archivo privado. Se comprobó la autorización de impresión interceptando window.print, sin enviar trabajo a impresora física. Consulta selected recibió denegación IPC de PDF.
- Identidad del backend propio, sandbox/contextIsolation/webSecurity, ausencia de nodeIntegration y bloqueo de rutas de integración. No se hicieron llamadas a proveedores.
- Firmas de todas las columnas anteriores de las 17 tablas coincidentes al excluir únicamente los dos usuarios nuevos autorizados. Usuarios originales, contraseñas, roles, estados, reservaciones, bitácora, catálogos y operaciones se conservaron. Desarrollo y archivos protegidos coincidieron con sus líneas base.

Las pruebas de capacidad 12/24 son aisladas, dentro de las 193 pruebas aprobadas; no se crearon reservas para ensayar límites en la principal. La secuencia de usuarios avanzó por las dos altas autorizadas; no se afirma que permaneciera igual después de estas altas.

Evidencia privada: electron-tests.json, synthetic-users.json y current-state.json en la carpeta de esta fase. El backend y Electron propios se cerraron; el puerto 3000 quedó libre y ambos laboratorios PostgreSQL detenidos.

## 9. Problemas encontrados

El primer ensayo se detuvo antes de migrar principal por comparación textual de cinco CHECK. pg_dump/pg_restore representa conversiones ARRAY varchar→text de forma distinta pero equivalente. Se diagnosticó el cambio, se normalizaron solo esas dos representaciones en cinco restricciones conocidas y se probó que cambios de valores/FK/validación siguen siendo rechazados. No se modificó ninguna restricción ni el SQL de migración. El primer laboratorio/respaldo se conservaron.

La captura por formulario falló al heredar PSModulePath con módulos de otra edición de PowerShell. Se reprodujo el error FormatXmlUpdateException de Microsoft.PowerShell.Security en un proceso Windows PowerShell 5.1 iniciado con Start-Process; la importación por la ruta absoluta de $PSHOME resolvió el conflicto sin instalar ni cambiar módulos del equipo. El botón ahora termina el diálogo y la comprobación y serialización se realizan fuera de su evento. Las dos claves se verifican en una sesión PostgreSQL de solo lectura, con identidad fija y comparación bcrypt, antes de guardarlas mediante DPAPI. Se comprueba además que el archivo cifrado se puede recuperar. Un estado sin claves distingue espera, rechazo de contraseña, cancelación y guardado. La autoprueba del formulario completo, bajo el mismo entorno heredado y con datos ficticios, terminó con código 0 y recuperación cifrada correcta. Las identidades reales solo se muestran en la ventana local. La captura definitiva guardó y recuperó ambas claves correctamente y los dos inicios de sesión reales fueron satisfactorios. No se cambiaron claves originales.

## 10. Recuperación

Antes de COMMIT, detener/revertir y verificar el catálogo. Después de COMMIT no existe ROLLBACK retroactivo: restaurar el respaldo pre-cambio en una base nueva expresamente autorizada, comparar firmas, esquema, roles/permisos y secuencias y aprobar un cambio de conexión compatible. La recuperación de este respaldo ya fue demostrada en el laboratorio. No borrar columna/puente ni sobrescribir principal.

Si hubo nuevas escrituras, preservarlas y acordar reconciliación antes de cambiar a una restauración. Este trabajo no ordena restaurar principal ni perder cambios posteriores. El archivo migration-attempt.json evita confundir un COMMIT incierto con permiso para repetir 016; nunca repetirla a ciegas.

## 11. Archivos y límites

Creados: scripts/prodAccess02bDb.cjs, prepararProdAccess02b.cjs, PrepararProdAccess02b.ps1, prodAccessTest.cjs, backendProdAccessTest.cjs, arrancarProdAccessTest.cjs, ProdAccessTest.ps1, probarProdAccess02b.cjs, CapturarProdAccessCredenciales.ps1, identidadesProdAccess.cjs, validarProdAccessCredenciales.cjs; backend/__tests__/prodAccess02b.test.js; este informe.

Modificado: electron/main.js, únicamente el modo optativo de pruebas principal y su perfil/arranque/red. No se modificaron .env, conexión pg central, modelos, migraciones, dependencias ni scripts de desarrollo. Los respaldos, configuraciones, credenciales, firmas e informes privados permanecen en la carpeta de laboratorio ya excluida de Git/empaquetado. Los informes no contienen contraseñas; los respaldos/data sí contienen registros y hashes almacenados y deben quedar privados.

## 12. Estado de desarrollo, pendientes y pasos manuales

Desarrollo coincidió antes/después de la migración mediante firmas de todos sus campos y metadatos/roles/ACL. .env y archivos de desarrollo conservaron sus hashes. No se creó ningún rol PostgreSQL en el clúster 5432.

No se utilizó Git, no se instalaron dependencias, no se activaron integraciones ni se publicó una actualización. No se limpiaron reservaciones ni se ejecutó FINAL-DB-01. No se declara preparado para producción.

Estado final: ACCESS-SCOPE implementado y validado en principal, cuatro usuarios en total (dos existentes y dos ficticios nuevos), 1.144 reservaciones conservadas. No hay comprobaciones de esta fase pendientes. Continúan pendientes las decisiones de distribución productiva, limpieza FINAL-DB-01 y sustitución del superusuario temporal por una cuenta PostgreSQL de privilegios mínimos; ninguna de ellas se ejecutó en esta fase.

Para iniciar desde Windows PowerShell 5.1:

~~~powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\ProdAccessTest.ps1 -Modo Electron
~~~

Para consultar únicamente las claves de los dos usuarios ficticios en una ventana local:

~~~powershell
.\scripts\ProdAccessTest.ps1 -Modo MostrarClavesPrueba
~~~

Pasos manuales:

1. Iniciar con el comando protegido y entrar con el Administrador existente. Revisar Dashboard, Reservaciones y Usuarios; la lista sin filtros debe tener 1.144 reservaciones.
2. Cerrar sesión y entrar con Consulta existente: lectura de todas las plataformas, sin acciones de creación, edición o cancelación.
3. Cerrar sesión y entrar con consulta.selected.prod02b@example.test usando su clave de la ventana local: solo Dashboard y Reservaciones, filtros FareHarbor/GetYourGuide, total 553 sin filtros adicionales.
4. Entrar con consulta.empty.prod02b@example.test: ninguna plataforma, cero reservaciones y conteos vacíos.
5. Para revisar conteos vigentes visibles usar 2027-02-07; para comprobar ocultamiento de otras fechas, el ensayo automatizado ya contrastó las nueve fechas vigentes. La fecha predeterminada puede no tener reservas vigentes.
6. Para revisar revocación, modificar exclusivamente las plataformas del usuario ficticio ID 98 desde otra sesión administrativa; refrescar la sesión Consulta y comprobar retirada de filtros/detalles. Restaurar GetYourGuide y FareHarbor al terminar.
7. Cerrar Electron normalmente; se cierra su backend propio. No usar el arranque general ni npm run desktop para esta prueba.

El ensayo se puede repetir mediante .\scripts\ProdAccessTest.ps1 -Modo Probar con los clientes cerrados. Reutiliza solo los usuarios ficticios registrados en el manifiesto y sus credenciales DPAPI, sin volver a ejecutar 016. Los comandos de preparación de la migración no deben repetirse sobre principal ya migrada.
