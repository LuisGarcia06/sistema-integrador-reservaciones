# PostgreSQL 18.3: excepción limitada y continuación de fase 2

Fecha de revisión: 31 de octubre de 2026, America/Cancun.
Estado: **servicio oficial preferido; integración y construcción detenidas por
garantías nativas pendientes**. Alcance `synthetic-acceptance-only`,
`productionAuthorized=false`. Instalación no aprobada.

## Autorización aplicada

Se conservó la autorización íntegra en
`docs/local-fase-2e7-postgresql-exception/user-authorization.txt`, con su SHA256
en el inventario de esta revisión. Sustituye únicamente la prohibición absoluta
de shells por permiso para dependencias internas documentadas de PostgreSQL
oficial 18.3. El antiguo bloqueo por la mera existencia de ese CMD ya no aplica.

Siguen prohibidos los CMD propios, `.cmd`/`.bat`, `.ps1`, PowerShell codificado,
Bypass y cambios de políticas. La excepción no acredita seguridad del token,
identidad del proceso, ACL, entradas o parada por sí sola. Se conserva intacta la
fase 1, su inventario y el bloqueo de compilación del prototipo en cuarentena.

No se solicitó otra excepción ni se tomó una implícitamente.

## Decisión arquitectónica

Se recomienda **servicio oficial PostgreSQL exclusivo**, con nombre e identidad
propios, sin reutilizar un servicio o clúster existente. La propuesta usa
`pg_ctl runservice` oficial. La cuenta virtual `NT SERVICE\CTSK026-<UUID>` es una
opción de diseño, aún sin registrar ni validar en Windows 11 Home. No se eligió
LocalSystem como alternativa. El registro requeriría un componente privilegiado
de alcance acotado; la aplicación cotidiana no debe ejecutarse como administrador.

En el código revisado, el servicio crea postgres con la implementación oficial
de token restringido; no usa el CMD del arranque normal de pg_ctl para ese paso.
Eso favorece reutilizarlo y evita incorporar nuestro creador de tokens puesto en
cuarentena. No demuestra por sí mismo que todas las llamadas API, jobs y cierres
hayan tenido éxito en una máquina concreta.
[pg_ctl REL_18_3](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/bin/pg_ctl/pg_ctl.c).

Comparación de diseño, **no certificación de implementaciones**:

| Criterio | Servicio oficial exclusivo | Lanzador propio equivalente |
| --- | --- | --- |
| Aislamiento | Clúster nuevo, servicio/cuenta/SID propios, puerto propio y enlace firmado | Debe construir y demostrar las mismas fronteras y propiedad de procesos |
| Privilegios mínimos | Cuenta sin administración, ACL de SCM y lista mínima de privilegios; medir token real | Reimplementar token, DACL, handles y contención; el prototipo no está validado |
| Inicio y cierre | Supervisión SCM más verificación independiente de postgres; nunca inferir cierre únicamente desde SCM | Debe resolver todos los fallos de APIs, disponibilidad, cancelación y huérfanos |
| Identidad del clúster | Marcador firmado + system identifier + ruta/volumen + puerto + imagen/creación/handle del proceso | Misma identidad; PID o postmaster.pid solos son insuficientes |
| Archivos y directorios | Datos privados del servicio; claves HTTPS y del cliente separadas del acceso de PostgreSQL | ACL privadas del usuario y ancestros; equivalente separación de secretos |
| Recuperación | Reconciliar estado real antes de reiniciar; fallos de init/bootstrap requieren revisión | Máquina de estados y recuperación propias, con más código crítico |
| Windows 11 Home | API de servicios es la ruta propuesta; cuenta, permisos y funcionamiento en Home siguen pendientes | API y runtime propios también deben validarse en Home; no hay ventaja demostrada |
| Mantenimiento | Menos lógica de creación de tokens propia; fijar binarios/DLL y revalidar después de actualizar | Más superficie de auditoría y mantenimiento; cuarentena sin resolver |

La configuración de privilegios de un servicio debe ser explícita: SCM conserva
por defecto los asignados al token si no se acotan.
[SERVICE_REQUIRED_PRIVILEGES_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_required_privileges_infow).
Cuenta virtual y contraseña no son equivalentes a permisos suficientes: el SID,
las ACL y el token efectivo se deben comprobar. Se usaría la API de creación de
servicios con cuenta explícita y parámetros separados, no contraseñas por CLI.
[CreateServiceW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-createservicew).

## Dónde interviene CMD

Se fijó `REL_18_3` al commit
`62d6c7d3df6287f1bd83199c1a746e50d31571a0`, consultando el repositorio oficial.
Las cinco fuentes se descargaron como **texto** y se compararon byte a byte con
las del commit inmutable. No se descargaron ejecutables ni se compilaron fuentes.

| Herramienta/ruta | Condición y mecanismo | Tratamiento propuesto |
| --- | --- | --- |
| initdb: pruebas de configuración | Invocación de postgres con `--check` por `system()` | Argumentos cerrados; también está dentro de la excepción |
| initdb: bootstrap/post-bootstrap | Pipes mediante popen; Windows lo remapea a `_popen` | Permiso interno autorizado, sujeto a contexto/token verificados |
| pg_ctl init | Invoca initdb por system | Evitar esa envoltura adicional: proponer initdb directo |
| pg_ctl start/restart ordinario | CMD para redirección | No es la ruta elegida para el servicio; no usar como fallback |
| pg_ctl: directorio solo de configuración | Consulta `postgres -C data_directory` por popen cuando hay configuración sin PG_VERSION legible | Rechazar esa disposición en nuestro clúster; revisar esta rama si falta PG_VERSION |
| pg_ctl runservice: creación de postgres | Proceso restringido oficial directo | Preferida, con inspección real independiente |

Fuentes: [initdb](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/bin/initdb/initdb.c),
[pg_ctl](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/bin/pg_ctl/pg_ctl.c),
[port.h](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/include/port.h),
[system.c](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/port/system.c).
Microsoft documenta que `_popen` inicia un procesador de comandos.
[Referencia CRT](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/popen-wpopen).
No se presume que todas las demás utilidades estén certificadas por esta revisión.

## Bloqueos nuevos y comprobaciones obligatorias

### 1. initdb no garantiza por sí solo abortar ante fallo de reducción del token

En `src/common/restricted_token.c`, `get_restricted_token()` trata el fallo de
`CreateRestrictedProcess` con un registro de error, sin terminar en esa rama.
Regresa al llamador, que continúa la inicialización. Además, la variable heredada
`PG_RESTRICT_EXEC=1` evita la reejecución. Su valor no es atestación de seguridad.
Estos hechos se comprobaron estáticamente; **no se provocó un fallo real**.
[Fuente oficial](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/common/restricted_token.c).

Por tanto, no se puede declarar conservado el token restringido solo porque
initdb sea oficial, termine con cero o se invoque sin heredar PG_RESTRICT_EXEC.
Quitar esa variable evita un bypass ambiental, pero no corrige la rama de fallo.
Una identidad sin administración tampoco prueba automáticamente la restricción.

Falta demostrar un contexto inicial ya restringido y verificado, con supervisión
de todo el árbol y rechazo antes de escribir cuando no se cumpla; o disponer de
una solución oficial con garantía equivalente. No se modificó PostgreSQL para
presentar un binario propio como oficial ni se reactivó el prototipo en cuarentena.
Crear un servicio cuya imagen sea initdb tampoco lo convierte en un servicio
Windows compatible ni resuelve su supervisión. Se detuvo la integración aquí.

El contrato de la fase 1 para postgres tampoco debe aplicarse ciegamente a initdb:
la rutina común usa DISABLE_MAX_PRIVILEGE, mientras pg_ctl tiene su lista de
privilegios que retira. Deshabilitar y retirar privilegios no son pruebas idénticas.
No se cambió el evaluador conservador para hacer aprobar esa diferencia.

### 2. Validar argumentos no acredita el contexto CMD

CMD puede ejecutar AutoRun del registro si no se usa `/d`; el arranque normal de
pg_ctl construye `/C` sin ese modificador. Para los caminos CRT también falta
comprobar el comportamiento del binario/runtime concreto. Se requiere inspección
de HKLM y del hive del principal efectivo, vistas aplicables y permisos que eviten
sustituciones durante la operación. Leer solo HKCU del instalador no basta.
[Documentación CMD](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd).

No se ha observado AutoRun malicioso o presente en la VM: **su ausencia aún no
está verificada**. Tampoco se borrarán sus valores ni se modificará el registro
para conseguir una prueba aprobada. Estado desconocido, acceso denegado o lectura
parcial deben bloquear la operación.

### 3. Estado del servicio no demuestra cierre de todos los procesos

El código de parada tiene una espera limitada y después comunica SERVICE_STOPPED.
Se requiere conservar handles e identidad, comprobar salida real del árbol
propio, liberación del puerto y cierre limpio. En timeout se conserva estado de
revisión y se prohíbe iniciar otra instancia; no se mata por nombre ni se toma
un PID reutilizado como propio.
[Fuente de parada](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/bin/pg_ctl/pg_ctl.c).

Esto no demuestra que el servicio falle siempre ni que no sea utilizable; impide
equiparar su estado o un éxito ordinario con todas nuestras garantías de seguridad.

### 4. Verificación nativa y aceptación pendientes

No se incorporó ningún binario nativo nuevo. Falta un lector/controlador verificado
de identidad, ACL, registro, tokens, servicios y handles, sin PowerShell y sin usar
el prototipo detectado. Servidor, cliente y asistente actuales todavía contienen
las dependencias PowerShell ya documentadas; **no se declaró corregida la fase 3**.

La consulta de solo lectura `VBoxManage list runningvms` terminó con código cero
y lista vacía. No se inició la VM automáticamente, ni se aprovisionó en el anfitrión.
La ausencia de VM activa limita la verificación real; el bloqueo de token anterior
es independiente de esta disponibilidad.

## Preparación segura implementada

Se añadieron únicamente contratos offline y pruebas, sin conectarlos a las rutas
de ejecución del producto:

- `scripts/windows-installers/postgres-service-contract.cjs`: propuestas cerradas
  de argumentos de initdb y servicio, revisión de contexto CMD, enlace de identidad
  y cierre. No importa child_process, no crea directorios, no abre servicios ni bases.
- `scripts/windows-installers/postgres-service-contract.test.cjs`: 57 pruebas
  nuevas de seguridad y regresión, incluyendo los hallazgos de fuente.
- `scripts/windows-installers/postgres-service-evidence.cjs`: conservación,
  procedencia, inventario y SHA256 de esta revisión; no aprovisiona.
- Este informe y `docs/local-fase-2e7-postgresql-exception/`: autorización,
  fuentes, resultados y evidencia nueva. No se modificó ninguna fuente de fase 1,
  producto, candidato anterior o archivo instalado.

El contrato no acepta argumentos libres, cuentas, rutas, contraseñas o shells
proporcionados por el llamador. Propone un directorio nuevo en ProgramData con
UUID generado, separado de perfiles de usuario; las cadenas que llegan a CMD
interno no incorporan nombres de perfil ni caracteres de expansión. Directorio,
binarios, DLL, configuración, archivos internos y ancestros necesitarán comprobar
procedencia y ACL mediante handles antes de su uso. La ruta ASCII propuesta evita
un tipo de interpolación; no demuestra por sí sola que una ruta sea confiable.

El entorno de prueba es una lista cerrada; rechaza PG_RESTRICT_EXEC, PGOPTIONS,
PATH/COMSPEC sustituidos y variables adicionales. No fabrica un comando CMD ni
implementa un escape universal. El archivo técnico `--pwfile` propuesto contendría
solo un secreto técnico efímero en directorio privado, pendiente de validación;
**no es la contraseña del primer Administrador**. Esa seguirá requiriendo captura
interactiva segura, sin argumentos, registros o solicitudes persistentes.

La identidad se compara mediante instalación/servicio/cuenta/SID, directorio,
system identifier, base sintética, puerto, hash y creación/PID del proceso.
La creación/handle debe obtenerse de nuevo en cada sesión, no persistirse como
identidad eterna tras un reinicio. Un lector real deberá autenticar las evidencias
y ligarlas al plan firmado; los JSON sintéticos no prueban esa autenticidad.
Todos los resultados del contrato mantienen `operationallyApproved=false`.

## Pruebas y conservación

**161 aprobadas, 0 fallos, 0 omitidas**: las 104 anteriores y 57 nuevas.
Se ejecutaron con el guard de fase 1, que bloquea procesos y red reales dentro
de las suites. Solo se leen fuentes C como texto; no se ejecuta C, PostgreSQL,
PowerShell de la aplicación, CMD, servicios ni el prototipo. Las ocho etapas
se prueban con simulaciones; no equivalen a instalar setup-03.

```text
node --require ./scripts/windows-native/safe-test-guard.cjs --test --experimental-test-isolation=none --test-reporter=tap scripts/windows-native/probe-contract.test.cjs scripts/windows-native/acl-regression.test.cjs scripts/windows-installers/postgres-service-contract.test.cjs scripts/windows-setup/coordinator.test.cjs scripts/windows-setup/ui.test.cjs scripts/windows-setup/restricted-policy.test.cjs
```

Se verifican otra vez todos los archivos y hashes de la revisión anterior, los
inventarios de candidatos 01–04, setup-01/setup-02 y la evidencia de cuarentena.
La evidencia nueva incluye `verification.json`, `source-provenance.json`,
`preservation.json`, `tests.tap`, `review-inventory.json` y `SHA256SUMS.txt`.
Los inventarios son de esta revisión, **no de instaladores nuevos**.

No se registraron servicios, crearon bases, ejecutaron herramientas PostgreSQL ni
abrieron conexiones SQL. No se tocaron las dos bases protegidas, políticas,
antivirus, confianza global, datos empresariales, Reservaciones, Daily, roles o
integraciones. No hay SHA256 de candidate-05/setup-03 porque no se construyeron.

## Siguiente paso recomendado

Conservar el servicio oficial como arquitectura preferida y resolver primero el
bootstrap bajo una identidad y token verificados, con una vía de revisión nativa
que respete la cuarentena. Debe demostrar fallos de reducción, procesos hijos,
timeouts y cierre abrupto sin escribir bajo un token no aprobado. Después verificar
AutoRun/entorno, ACL reales, identidad del clúster y parada mediante handles en
Windows 11 Home. No basta con ampliar otra vez la excepción de CMD.

Solo entonces integrar los reemplazos de PowerShell en servidor, cliente y
mantenimiento, preparar las ocho etapas de setup-03 y construir candidatos nuevos
con inventarios independientes. La aprobación final requiere T0, bootstrap,
servidor, HTTPS, primer login, cierre y reinicio/persistencia reales en VirtualBox.
