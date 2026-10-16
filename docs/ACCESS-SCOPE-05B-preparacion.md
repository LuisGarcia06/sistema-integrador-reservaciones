# ACCESS-SCOPE-05B.1 — Preparación del entorno de preproducción

Diagnóstico: **14 de octubre de 2026**, America/Cancun (UTC−05:00).
Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.

**Preparación documental terminada. El laboratorio todavía no existe ni está autorizado.**
No se crearon ni iniciaron VM, ejecutaron instaladores/aplicación, instalaron
herramientas, modificaron Windows, BIOS, servicios, registro o red. No se utilizó
Git ni se abrió ninguna conexión PostgreSQL, incluida sian_kaan_reservaciones.
Los procedimientos siguientes son propuestas para ejecución posterior autorizada.
El instalador **no se declara apto para producción**; aceptación humana pendiente.

Se revisaron AGENTS.md, ambos documentos 05A, README, package.json, Electron,
configuración PostgreSQL, rutas/permisos, esquema, migración 016, validadores y
plantillas NSIS. Las 64 verificaciones automáticas y 617 regresiones son evidencia
histórica de 05A; no se repitieron aquí.

## 1. Diagnóstico del equipo

Consultas de solo lectura: registro de versión Windows, Get-CimInstance
(ComputerSystem/OperatingSystem/Processor/LogicalDisk), Get-PSDrive, Get-Command,
Get-Service, Get-ExecutionPolicy, comprobación de ubicaciones usuales de
hipervisores y Get-WindowsOptionalFeature. No se inventarió información personal.

| Dato | Resultado observado | Interpretación |
| --- | --- | --- |
| Windows | Windows 10 Home Single Language; CoreSingleLanguage; 22H2; build 19045.6466 | Edición Home |
| Arquitectura | SO y proceso de 64 bits | Compatible con payload x64 |
| Equipo/CPU | Acer Nitro AN515-55; Intel i5-10300H; 4 núcleos/8 procesadores lógicos | Proponer 2 vCPU |
| RAM visible | 21.297.680.384 bytes, aproximadamente 19,83 GiB | Total suficiente para VM pequeña |
| RAM libre | 7.121.620 KiB, aproximadamente 6,79 GiB | Captura puntual; no asignar 6–8 GiB ahora |
| A: | NTFS; 1.000.186.310.656 bytes; 360.147.734.528 libres (335,41 GiB) | Destino condicional del disco VM |
| C: | NTFS; 510.905.020.416 bytes; 31.086.239.744 libres (28,95 GiB) | No reservar aquí disco VM de 100 GiB |
| VirtualizationFirmwareEnabled | true | CPU informa virtualización habilitada |
| SLAT / VMMonitorModeExtensions | true / true | Extensiones reportadas por WMI |
| DEP disponible | true | Protección de ejecución disponible |
| HypervisorPresent | false | No se detectó hipervisor activo |
| Hyper-V | Get-VM ausente; vmms/vmcompute no encontrados; HvHost detenido/Manual | No se identificó Hyper-V operativo |
| Sandbox | WindowsSandbox.exe ausente | No disponible |
| Otros | VBoxManage, vmrun, docker ausentes de PATH; ejecutables VBox/VMware ausentes en ubicaciones usuales | No se identificó otro hipervisor disponible; no es inventario exhaustivo |
| Permisos | Token no administrador; PowerShell FullLanguage | Instalar controladores requerirá responsable con elevación |
| Política scripts | LocalMachine RemoteSigned; otras cuatro áreas Undefined | No se modificó |
| Características opcionales | Consulta falló: «La operación solicitada requiere elevación» | Estados individuales no confirmados; no se intentó elevar UAC |

Las consultas CIM fuera del token restringido pudieron leer hardware; **no
otorgaron token administrador**. No hubo rechazo del revisor automático. No se
certificaron AppLocker/WDAC, Secure Boot/TPM del host, licencia, ESU, controladores,
rendimiento del disco ni arranque real de hipervisor. Virtualización anunciada por
CPU **no equivale a una VM funcional comprobada**. Recursos no reservados.

Hyper-V y Sandbox no están soportados en Windows Home.
[Requisitos Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements),
[instalación Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v?pivots=windows),
[ediciones Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/).
El soporte general de Windows 10 terminó el 14/10/2025; ESU no comprobado aquí.
TI debe resolver soporte del host o seleccionar uno mantenido; no se propone
actualizar este equipo automáticamente.
[Microsoft: fin de soporte](https://www.microsoft.com/en-us/windows/end-of-support).

## 2. Opciones de virtualización viables

| Opción | Requisitos pendientes | Ventajas | Limitaciones actuales |
| --- | --- | --- | --- |
| VM completa VirtualBox local | Autorizar instalación/controladores, soporte del host, imagen/licencia Windows, recursos y políticas | Estado persistente, snapshots, ramas para actualización y recuperación | Hardware anuncia requisitos básicos, pero hipervisor ausente y arranque no probado |
| Hyper-V en host Windows 11 Pro/Enterprise | Conseguir host compatible y autorización de hipervisor/VM | Checkpoints y separación del equipo operativo | Edición actual Home no permite esta opción soportada; no cambiar edición aquí |
| VM administrada por TI | Identificar host, acceso de consola, red aislada y snapshots autorizados | Evita intervenir este equipo | Usuario confirmó que no existe entorno desechable disponible actualmente |
| Equipo físico dedicado | Equipo vacío autorizado, imagen recuperable, licencia y respaldo completo | Prueba drivers e instalación nativa | Restauración más costosa; no usar equipo operativo |
| Sandbox en otro host compatible | Edición/característica aprobadas | Prueba puntual de apertura/instalación | Cierre elimina estado; no sustituye VM persistente para snapshots y versiones |
| Payload extraído 05A | Evidencia existente | Pruebas funcionales ya realizadas | No cubre wizard, registro, accesos, actualización o desinstalación |

Oracle documenta Windows 10 x86_64 como host; VirtualBox ofrece snapshots.
Compatibilidad declarada no certifica funcionamiento en este equipo.
[Hosts VirtualBox](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html),
[conceptos y snapshots](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/Introduction.html).
Sandbox elimina estado al cerrarse, aunque algunos reinicios internos conservan
datos. [Microsoft Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/).

## 3. Entorno recomendado

**VM Windows x64 completa y persistente.** Para este host, VirtualBox es la
alternativa local razonable, condicionada a autorización e instalación por TI,
soporte de Windows y prueba real de arranque. Si TI ofrece Windows 11 Pro/Enterprise
mantenido con Hyper-V, preferir ese host para evitar intervenir el Home actual.
Ninguna alternativa está implementada.

Diseño propuesto:

- VM ACCESS-SCOPE-05B-LAB, propietario y ubicación física identificados.
- Invitado Windows 11 x64 vigente, imagen/licencia aprobadas. Validar CPU
  compatible, UEFI, Secure Boot y TPM virtual 2.0 según hipervisor; no eludir
  requisitos. Una rama Windows 10 para reproducir destino requiere soporte y
  autorización específicos.
- Una VM encendida; dos cuentas Windows sintéticas para sesiones independientes
  mediante cambio de usuario. La aplicación tiene bloqueo de instancia por perfil;
  no mezclar dos versiones activas ni compartir el mismo backend con otra DB.
- Aplicación NSIS por usuario y Express empaquetado dentro del invitado.
  PostgreSQL 18.x aprobado, preferentemente 18.3 para reproducir 05A, en cluster
  nuevo del invitado; no usar motor ni directorios PostgreSQL del host.
- PG 127.0.0.1:55432; DB access_scope_05b_lab_test; directorio
  C:/AccessScopeLab/pgdata. HTTP conserva 127.0.0.1:3000. Ambos puertos libres.
- NIC virtual desconectada durante aceptación: sin puente, NAT, VPN, reenvíos ni
  conexión a red empresarial. Loopback funciona sin NIC. TI prepara descargas,
  activación/actualizaciones del SO antes de snapshot base por procedimiento
  autorizado, sin cuentas ni servicios empresariales productivos.
- Sin portapapeles, drag-and-drop, USB/impresoras ni carpetas compartidas generales.
  Transferir medios/hashes por ISO aprobada; exportar evidencia por medio dedicado
  autorizado antes de revertir. Nunca montar carpetas de empresa.
- Secretos/JWT exclusivos de laboratorio; integraciones sin tokens,
  GYG_GMAIL_SYNC_ENABLED=false, sin webhooks publicados ni APIs reales.
- Snapshots con aplicación/PG cerrados y Windows apagado: S0 SO/herramientas;
  S1 cluster/esquema/fixtures sin aplicación; S2 aplicación instalada;
  S-ANTERIOR solo si existe candidato adecuado.

Windows 11 en VM exige ≥4 GB RAM, ≥64 GB disco, ≥2 procesadores virtuales y
configuración de seguridad compatible. Los 100 GiB propuestos agregan margen.
[Requisitos Windows 11](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements).
VirtualBox ofrece TPM virtual y recuperación de snapshots; restaurar revierte
también archivos del disco, así que copiar evidencia antes.
[Configuración y recuperación VM](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html).

## 4. Requisitos de almacenamiento y recursos

| Recurso | Propuesta | Condición para arranque autorizado |
| --- | --- | --- |
| CPU | 2 vCPU | Una VM; preservar capacidad del host |
| RAM | 4 GiB iniciales; 6 GiB preferidos | Con 6,79 GiB libres, 4 dejan margen inicial. Para 6 exigir ≥10 GiB libres y monitorizar presión real |
| Disco invitado | 100 GiB dinámicos en A: | SO, herramientas, aplicación, PG y evidencias |
| Presupuesto A: | 200 GiB | 100 base + 60 cambios de snapshots + 20 medios/backups + 20 margen, estimados |
| Reserva fuera del presupuesto | ≥50 GiB libres | Medir antes de cada ciclo y consolidación |
| C: | Solo instalación del hipervisor si TI la autoriza | Revisar cache/temporales; no alojar aquí disco VM |
| Pantalla | 1366×768; comprobar mínimo de ventana 1024×640 | Capturas/diálogos legibles |
| Evidencia | Carpeta por ejecución/caso/fecha y SHA-256 | Separada de snapshots; sin contraseñas/JWT |

Snapshots pueden crecer más de 60 GiB: presupuesto no es máximo garantizado.
Controlar crecimiento, detener expansión al exceder margen y no crear clones
ilimitados. Los 335 GiB libres de A: permiten estudiar esta reserva, no certifican
que esté aprobada. No se reservaron recursos ni se cerraron aplicaciones del usuario.

## 5. Procedimiento de preparación (futuro; no ejecutado)

### 5.1 Crear o restaurar laboratorio autorizado

1. Completar sección 9: host, responsable, hipervisor, ISO/licencia, rutas y hashes.
   Si falta aprobación, mantener pendiente.
2. TI instala hipervisor/controladores aprobados si procede; registra reinicios,
   conserva controles Windows y no cambia edición/BIOS como atajo.
3. En administrador de hipervisor crear VM identificada, disco normal de 100 GiB
   en A: autorizado, 2 vCPU, RAM según sección 4 y firmware compatible. Verificar
   recursos/aislamiento antes del primer arranque.
4. Preparar invitado por imagen aprobada, PostgreSQL y utilidades de fixtures
   (Node si se utiliza). Desconectar NIC y deshabilitar compartición antes de cargar
   app/datos. Conservar Defender y SmartScreen.
5. Crear cuentas Windows sintéticas; comprobar ausencia de instalación con el
   appId y servicios/backend ajenos. Apagar y tomar S0. Para restaurar, seleccionar
   S0 por ID registrado; verificar nombre/discos/NIC antes de iniciar.

### 5.2 PostgreSQL aislado

Solo dentro del invitado y con binarios aprobados. Generar contraseña aleatoria,
usar autenticación SCRAM y archivo temporal con ACL limitada para initdb. No
poner secretos en argumentos/logs. Ejemplo para fase autorizada, **no ejecutar en
el host**; carpeta y pwfile deben prepararse previamente:

~~~powershell
$labPgBin = 'C:\Program Files\PostgreSQL\18\bin'
$labPgData = 'C:\AccessScopeLab\pgdata'
& "$labPgBin\initdb.exe" -D $labPgData -U access_scope_lab --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=C:\AccessScopeLab\initdb-password.tmp
# Verificar exit code 0 y retirar solo el pwfile identificado.
& "$labPgBin\pg_ctl.exe" -D $labPgData -l C:\AccessScopeLab\postgres.log -o '-p 55432 -h 127.0.0.1' -w start
& "$labPgBin\createdb.exe" -h 127.0.0.1 -p 55432 -U access_scope_lab -W access_scope_05b_lab_test
& "$labPgBin\psql.exe" -X -h 127.0.0.1 -p 55432 -U access_scope_lab -W -d access_scope_05b_lab_test
~~~

Comprobar éxito después de cada comando; ante error detener y diagnosticar. No
usar DSN, PGSERVICE ni .env empresarial. Antes de escribir y tras recuperación:

~~~sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), current_schema();
SHOW data_directory;
SHOW listen_addresses;
SELECT system_identifier FROM pg_control_system();
SELECT version();
~~~

Exigir DB exacta, loopback, puerto 55432, usuario laboratorio, directorio del disco
invitado e identidad de cluster registrada, diferente al histórico de 05A
7696684799843614984. La cuenta administrativa del cluster de laboratorio puede
leer directorio/control. Registrar también usuario/privilegios de ejecución;
preferir uno de menor privilegio. Si cualquier dato difiere, detener antes de
escribir. Nunca cambiar permisos empresariales.

Para base nueva cargar schema.sql identificado por hash mediante psql con destino
explícito, -X -v ON_ERROR_STOP=1 -1 -f y ruta absoluta. Schema completo ya contiene
016: **no aplicar migración 016 después**. Para ensayar migración, otra rama con
esquema anterior verificado y datos exclusivamente sintéticos; comprobar rollback.

### 5.3 Fixtures, configuración y snapshot S1

Preparar en 05B.2 un fixture local revisado por SHA-256 o respaldo sintético
aprobado cuya restauración se ensaye. Contrato de datos reproducible de 05A:

- Roles Administrador/Consulta; A Administrador, A2 auxiliar, B Consulta all,
  C Consulta selected con GetYourGuide/FareHarbor y D selected vacío. Cuatro
  perfiles funcionales; A2 permite revocar sin eliminar al último Administrador.
- Cinco plataformas: GetYourGuide, FareHarbor, WhatsApp Business, Externa,
  Booking Directo; 16 tours, un país, una operación y un transporte. IDs retornados
  por DB, nunca IDs universales.
- 42 reservas: 30 de plataformas de C, 12 ajenas, una autorizada histórica de 2020,
  una cancelada, códigos VISIBLE-/OCULTA-, 2 PAX visibles/10 ajenos, turno Mañana
  explícito. Usar fechas adicionales para capacidad y Tarde.
- Hash bcrypt para contraseñas sintéticas; ningún password plano en usuarios.
- Manifest con fechas/IDs/códigos/estados/PAX y hash de fixture. Calcular por SQL
  local el oráculo de conteos activos, métricas, listados y bitácora. No copiar
  reservas, cuentas o seeds empresariales.

Las inserciones parametrizadas de scripts/validarAccessScopeEmpaquetado.cjs son
referencia de fixtures. **No ejecutar ese validador como preparador**: además
abre companySnapshot contra conexión de empresa y usa depurador/perfil redirigido.
Los validadores previos no constituyen instalación humana. En 05B.2 separar y
revisar el fixture para que solo abra la DB invitada; esta fase no crea scripts
de escritura ni cuentas/base.

En M05, con puerto 3000 libre, abrir sin config para registrar el error y la ruta
normal real de app.getPath('userData')/config.env. Esa ruta no fue certificada
por instalación en 05A. Después preparar allí:

~~~dotenv
DB_HOST=127.0.0.1
DB_PORT=55432
DB_NAME=access_scope_05b_lab_test
DB_USER=<usuario-exclusivo-del-cluster-lab>
DB_PASSWORD=<secreto-aleatorio-lab>
JWT_SECRET=<secreto-aleatorio-lab-distinto>
GYG_GMAIL_SYNC_ENABLED=false
~~~

Plantilla no ejecutable hasta sustituir marcadores dentro del invitado; proteger
ACL. No copiar .env empresarial. dotenv no sobrescribe variables heredadas:
cuentas limpias, sin DB_*, PG*, JWT_*, APP_CONFIG_PATH ni tokens de proveedores
ajenos. El flag efectivo es **GYG_GMAIL_SYNC_ENABLED**; no confundirlo con
GETYOURGUIDE_GMAIL_SYNC_ENABLED. Sin integración externa ni credenciales reales.

Tras verificar configuración/fixtures, detener PG ordenadamente, cerrar app,
apagar Windows y tomar S1. Guardar backup custom sintético con hash/restauración
comprobada independiente de snapshot.

## 6. Plan de instalación y actualización

### 6.1 Artefacto 05A revisado de solo lectura en 05B.1

| Campo | Resultado |
| --- | --- |
| Instalador | A:/sistema-integrador-reservaciones/.access-scope-lab/05a-build-7703bfb9a1eb/Sistema-Integrador-Reservaciones-1.0.0-x64.exe |
| Versión / tamaño | 1.0.0 / 106439091 bytes |
| Última escritura | 2026-10-15T00:26:48.188Z UTC = 14/10/2026 19:26:48.188 America/Cancun |
| SHA-256 recalculado | 596b86a5760fa7dbea4c386f0f130ded4c1a10da54bac2da97fc06999e9497f0 |
| ASAR extraído SHA-256 | 31afe69a024bcb2cf9b47b7a027b415075c5a168d7f2b13176a081297844de68; coincide con 05A |
| Arquitectura PE | NSIS externo 0x14c (x86); Electron interno 0x8664 (AMD64/x64); firmas PE válidas |
| Firma instalador | Authenticode NotSigned; sin certificado de editor |
| Auditoría repetida | 3383 archivos; 0 incidencias; sin archivo de salida ni procesos app/backend/PG |
| Recursos | ASAR: main/preload/package; unpacked: backend/frontend/node_modules |
| Runtime histórico 05A | Electron 43.4.1, Chromium 150.0.7871.224, Node 24.18.1; no ejecutado aquí |
| Dependencias efectivas leídas | Express 5.2.1, pg 8.23.0, bcryptjs 3.0.3, dotenv 17.4.2, jsonwebtoken 9.0.3, googleapis 105.0.0, @google-cloud/local-auth 2.1.0 |
| PostgreSQL | Servidor externo al instalador; no incluye cluster/schema/migrador automático |
| NSIS previsto | Asistido, por usuario, sin selección de directorio; appId com.communitytours.reservaciones |

NSIS x86 envuelve correctamente payload x64; no ofrece app de 32 bits ni certifica
ARM64. Auditoría existente revisó ASAR/unpacked para .env/config, DB/backups/logs,
pruebas/fixtures y coincidencias de valores sensibles configurados ≥8 bytes.
Solo leyó configuración local en memoria sin imprimir valores ni conectar a DB.
Exclusiones de distribución conservadas. No certifica secretos desconocidos o
cortos, vulnerabilidades ni todos los binarios nativos. Hash demuestra identidad
respecto a 05A, no autenticidad del editor.

Express escucha 127.0.0.1:3000 y sirve /app + /api. Arranca desde recursos mediante
Electron con ELECTRON_RUN_AS_NODE y windowsHide; no hay servicio Windows ni
actualizador automático. Config se valida al iniciar backend propio.
**ensureBackend reutiliza cualquier backend en 3000 con el texto de salud esperado,
sin verificar su DB**: exigir VM exclusiva y puerto libre; si hay listener,
identificarlo y detener preparación, sin matar procesos ajenos. GET / no basta
para comprobar destino. Solo se detiene el backend propio al cerrar Electron.

Sin firma pueden aparecer editor desconocido, advertencias o bloqueo según
política Windows. Registrar comportamiento; no desactivar controles, retirar
marca de origen ni cambiar políticas. Si bloquea, mantener pendiente con motivo
y requerir artefacto firmado o procedimiento aprobado que conserve controles.
Una firma tampoco garantiza reputación inmediata. La VM sin red no certifica
la consulta en línea de reputación ni el comportamiento de distribución con red;
registrar esa limitación y planificar su validación posterior por TI.
[Microsoft: reputación de aplicaciones](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

### 6.2 Secuencia futura

1. Restaurar S1; iniciar PG, comprobar identidad/puertos/NIC y hash.
2. Transferir NSIS aprobado; volver a calcular SHA dentro de VM, registrar firma
   y controles Windows. Instalar por wizard normal en cuenta de prueba y guardar
   ruta/registro/accesos/versiones reales, M01–M06.
3. Abrir desde acceso Windows; registrar error sin config y luego configurar solo
   DB invitada. Confirmar backend por ruta/PID/usuario y destino. Sin depurador ni
   electron . ni backend de desarrollo.
4. Apagar app/PG/Windows para S2. Ejecutar matriz M07–M30 con cuatro perfiles,
   A2 y oráculo del manifest. Restaurar fixtures entre bloques que alteran C.
5. Reiniciar app y comprobar login/persistencia. Detener solo cluster PG invitado
   identificado para fallo/reconexión; no servicios del host.
6. Ensayar actualización solo si cumple 6.3; de lo contrario M31 pendiente.
7. Desinstalar solo app invitada desde Windows; revisar recursos, accesos,
   registro, procesos, listeners y residuos (M32–M34). NSIS conserva userData por
   diseño salvo borrado explícito; no usar --delete-app-data ni afirmar resultado
   por plantilla. PG independiente no se borra al desinstalar app.
8. Exportar evidencia/defectos, cerrar procesos, apagar y restaurar S1/S0 según
   siguiente ciclo. Verificar NIC, instalación/DB/hash correspondiente. M35 exige
   persona responsable; no borrar evidencia ni carpetas del host.

### 6.3 Condición de versión anterior adecuada

Candidato **sin calificar**: dist/Sistema-Integrador-Reservaciones-1.0.0-x64.exe,
104384199 bytes, última escritura UTC 2026-09-12T22:51:08.789Z,
SHA-256 a5fd9ef8dfe45a352c03c1d5c32ea96f47e0f7ad141f9b18d612ffd4db620eac.
Comparte etiqueta 1.0.0, pero otro hash. No se instaló ni certificó compatibilidad.

TI deberá identificar origen, versión efectiva, appId, recursos, esquema,
config y permisos soportados. Sin candidato aprobado/reproducible, M31 pendiente;
no cambiar versión ni reconstruir un «anterior» con código nuevo como sustituto.

Rama aislada: restaurar base anterior verificada o S1 compatible, instalar
candidato, fixtures sintéticos y comprobar funcionamiento inicial. Guardar
backup/hash/oráculo y S-ANTERIOR apagado. Cerrar todas las sesiones/Express,
aplicar 016 solo si esquema anterior no la contiene y después instalar NSIS nuevo
con mismo appId. Arrancar exclusivamente nueva versión; comparar recursos/config,
cuentas/alcance/datos antes y después. Restaurar S-ANTERIOR para comprobar
recuperación. Un antiguo que ignora selected solo sirve en esa rama desconectada,
nunca puede atender usuarios restringidos o convivir con el nuevo backend.

## 7. Plan de validación de los 35 casos manuales

[Matriz ampliada](ACCESS-SCOPE-05A-aceptacion.md): M01–M35 conservados; cada caso
tiene objetivo, perfil, pasos, esperado, evidencia, criterio, estado y observado.
**35 PENDIENTES, 0 aprobados**. Motivos de bloqueo separados del estado.

| Orden | Casos | Evidencia |
| --- | --- | --- |
| Preparación/instalación | M01–M06 | VM/cluster/hash, wizard, configuración/rutas, PID/listeners |
| Perfiles/filtrado | M07–M15 | Oráculo, UI y respuestas HTTP locales sin JWT |
| Administración/revocación | M16–M22 | A/A2 y C independientes, tiempos, IDs, respuestas y limpieza DOM |
| Impresión/PDF | M23–M26 | Vista previa sin salida física, PDF/texto/imágenes y diálogo nativo |
| Regresión/recuperación | M27–M30 | SQL sintético, bitácora, capacidades, fallos/reinicio |
| Ciclo instalador | M31–M34 | Anterior calificado, snapshot/backup, update/uninstall/residuos |
| Decisión humana | M35 | Evidencia exportada, defectos, responsables y firma |

Restaurar fixture o documentar cambios antes de cada bloque; administración altera
C. Fechas/IDs provienen de manifest. No aprobar por código, DOM simulado, unitarias
o informe 05A. Repetir dependientes tras corrección.

API: cliente HTTP dentro de VM, endpoints existentes /api/auth/login,
/api/auth/sesion, /api/dashboard/resumen, /api/reservaciones?page=1&limit=25,
/api/reservaciones/:id, /api/usuarios, /api/daily/operativo, /api/operaciones,
/api/transportes, /api/bitacora, /api/eventos-integracion. Historial/Pendientes:
rutas UI y las API reales que consumen; no inventar /api/historial.
C/D: 403 en GET de módulos excluidos; detalle oculto e inexistente 404; sin token
401. No exportar Authorization. Resultados concretos se comparan con cada caso.

Registrar caso/fecha/responsable/VM/hash/observado/evidencia y decisión real.
Mientras no se ejecute, mantener PENDIENTE con motivo; después se admite
APROBADO/FALLIDO/BLOQUEADO. M35 no autoriza producción.

## 8. Riesgos y bloqueos

| Riesgo | Condición para resolver |
| --- | --- |
| Laboratorio ausente | Usuario confirmó ausencia; obtener autorización antes de crear/arrancar |
| Home / hipervisor ausente | VirtualBox autorizado o conseguir otro host; no hacks de Hyper-V |
| Soporte Windows 10 | ESU no verificado; TI define host mantenido |
| Recursos variables | Volver a medir, snapshots acotados, no ubicar disco VM en C: |
| Privilegios/políticas | Token no admin; estados opcionales sin confirmar; no relajar seguridad |
| NSIS sin firma | Hash no acredita editor; resolver firma/reputación/distribución |
| Puerto 3000 | No verifica DB del backend preexistente; listener libre e identidad obligatorios |
| Config/env heredado | Nueva cuenta/config lab, sin secretos ni .env empresarial |
| Anterior no calificado | Exigir evaluación y recuperación segura para M31 |
| Instalación/aceptación pendiente | Wizard/registro/accesos/diálogos/update/residuos necesitan prueba real |
| Reversión de snapshots | Exportar evidencia antes; snapshot no sustituye backup restaurable |
| Esquema/binario parciales | Nuevo exige 016; antiguo puede ignorar selected; parada completa y sin convivencia |

## 9. Requisitos de autorización

05B.1 autoriza diagnóstico/documentación, no instalaciones ni VM. Para 05B.2,
aprobación explícita deberá identificar:

- Host/propietario, hipervisor, permiso de instalación/controladores, elevación y
  posibles reinicios. BIOS/edición/red del host requieren aprobación aparte si
  fueran necesarios; no se incluyen implícitamente.
- Nombre/rutas/presupuesto de VM y permisos de creación, arranque, snapshots,
  restauración y eventual eliminación, con discos exactos identificados.
- Imagen/licencia Windows, PostgreSQL/herramientas permitidas y cuentas sintéticas.
- Red de preparación y medios de transferencia; aceptación sin empresa/proveedores.
- Instalación/actualización/desinstalación solo invitadas, artefactos por hash,
  configuración, responsable humano y anterior adecuado si existe.
- Conservación de evidencias y custodia de secretos/config de laboratorio.

Autorización de laboratorio no autoriza producción. Backup real, restauración
con datos reales, mantenimiento, migración 016 y distribución necesitan aprobación
separada con destinos y recuperación. No hay pregunta pendiente aquí: se entrega
propuesta concreta; ausencia de respuesta no concede autorización.

## 10. Plan preliminar de respaldo y despliegue (sin ejecutar)

### 10.1 Entrada, backup e integridad

Solo tras aceptación 05B.2 y decisión del responsable sobre datos reales,
distribución/firma y pruebas operativas. Inventariar todos los clientes y backend
que usan DB; registrar versión/hash actual, config protegida, versión PG,
migraciones previas, tamaño/esquema/roles, responsables, ventana y RTO/RPO.

Ensayar ciclo completo con datos sintéticos. Un ensayo posterior de backup real
requiere autorización y destino separado seguro/restringido; no llevar datos de
empresa implícitamente al laboratorio sintético.

Proponer pg_dump custom compatible con servidor, destino/usuario explícitos y
secretos protegidos fuera de argumentos. Incluir esquema/datos/secuencias y
documentar roles/privilegios/config necesarios en copia restringida. Comprobar
código/salida: archivo no vacío no prueba integridad.

Calcular SHA-256 y pg_restore --list, registrar herramienta/versión; restaurar
realmente con --exit-on-error en DB **nueva** autorizada/compatible. Verificar
constraints, secuencias, roles/cuentas, conteos/checksums acordados y humo sin
integraciones. Guardar tiempos reales/RTO/RPO. Hash/listado no sustituye restaurar.
No usar --clean contra destino ambiguo.

### 10.2 Orden y bloqueo durante ventana

1. Responsable cierra ventana; detener nuevas escrituras, importadores,
   sincronización/webhooks y trabajos relacionados.
2. Cerrar **todas** las sesiones Electron/navegadores; detener todos los Express
   antiguos/nuevos o servicios asociados. Verificar PIDs/listeners y conexiones
   de aplicación; impedir relanzamiento por procedimiento/control aprobado TI.
   No hay modo mantenimiento implementado que garantice esto: si no se puede
   impedir acceso, **no migrar**.
3. Con escrituras detenidas, verificar identidad real autorizada DB/cluster y
   schema anterior. Tomar backup final restaurable y copia protegida de
   config/binarios. Preservar acceso bloqueado durante todo el cambio.
4. Ejecutar **una vez** database/migrations/016_alcance_plataformas_usuarios.sql
   con psql -X -v ON_ERROR_STOP=1 -f y destino aprobado explícito. Contiene
   BEGIN/COMMIT: no fragmentar ni omitir errores. Hash revisado:
   41bc5fb45c636040ba229eec2f2113431dbb33599b625222a5a0dc39b4b260f3.
   Si 016 ya existe o hay estado parcial, detener/diagnosticar; no repetir
   ciegamente ni cargar schema.sql sobre DB existente.
5. Verificar commit, columna NOT NULL/CHECK, default selected, puente PK/FK,
   backfill all existente y conservación de IDs/roles/password hashes/datos.
   Guardar logs sin secretos. Asignar plataformas después según decisión explícita
   del administrador, sin restricción masiva por inferencia.
6. **Solo después de 016 confirmada**, actualizar todos los backend/Electron
   autorizados al artefacto verificado. Backend está incluido en Electron; detener
   y reemplazar cualquier proceso externo inventariado en la misma ventana.
   No arrancar nuevo contra schema anterior ni dejar antiguo atendiendo selected.
7. Arranque controlado del backend nuevo y cliente de humo. Verificar
   hash/versión/recursos, PG, puerto/config; GET / no valida esquema/permisos.
   Mantener acceso general bloqueado.
8. Humo acordado: login/sesión, Dashboard/listado/detalle, cuatro perfiles,
   selected vacío, oculto 404, módulo 403, revocación, administración/último admin,
   persistencia y PDF autorizado. Escritura de prueba real exige caso y reversión
   aprobados; no inventar reservas de empresa ni borrar bitácora.
9. Confirmar que todos los clientes respetan alcance y retirar versiones antiguas
   del circuito. Responsable reabre acceso/entradas gradualmente solo tras humo
   sin defectos bloqueantes y con evidencia.

### 10.3 Recuperación

Fallo dentro de transacción: comprobar rollback, guardar error y mantener parada.
No arrancar backend nuevo con schema parcial. Recuperar par anterior verificado
solo si esquema quedó anterior y acceso/política siguen compatibles.

Si 016 confirmó pero falló actualización/humo, mantener downtime; corregir o
reinstalar compatible en ventana. **No arrancar antiguo que ignore selected**.
No hay migración inversa validada; no borrar columna/puente manualmente como atajo.

Si responsable ordena restaurar, mantener entradas/apps detenidas, preservar
estado fallido y restaurar backup pre-cambio en DB nueva identificada. Verificar
integridad y recuperar conjuntamente binarios/config/política compatibles.
El responsable decide cambio de destino y pérdida admisible. Si hubo escrituras
nuevas, conservar estado posterior y acordar reconciliación antes de restaurar;
no descartarlas automáticamente. Snapshot de lab no recupera PostgreSQL
empresarial. Reabrir exclusivamente tras nuevo humo y autorización.

## 11. Acciones pendientes para ACCESS-SCOPE-05B.2

1. Resolver host/hipervisor/soporte/imagen/licencia; autorizar alcance de sección 9,
   recursos y responsable humano.
2. Crear/restaurar VM autorizada, comprobar aislamiento y preparar S0/S1,
   backup sintético restaurado y fixtures locales por hash, sin companySnapshot.
3. Calificar anterior o mantener M31 pendiente; documentar transición/recuperación.
4. Instalar NSIS actual por flujo Windows, comprobar config/userData/rutas/backend
   propios, conservando controles.
5. Ejecutar 35 casos por persona responsable, exportar evidencia, registrar
   defectos y emitir decisión de aceptación del laboratorio.
6. Posteriormente presentar propuesta separada de despliegue real, respaldo
   restaurable, ventana, firma/distribución y recuperación para autorización.

Archivos de esta fase: creado docs/ACCESS-SCOPE-05B-preparacion.md y ampliado
docs/ACCESS-SCOPE-05A-aceptacion.md. Sin cambios en código, dependencias,
configuración, esquema/migraciones ni datos. Verificaciones documentales no son
aceptación humana.

Verificación documental 05B.1: 11 secciones numeradas; M01–M35 únicos, con los
ocho campos exigidos y observado «No ejecutado»; 35 estados PENDIENTE, cero
aprobados; UTF-8, bloques de código balanceados y enlaces locales presentes.
