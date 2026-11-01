# Evaluación 18.3 → 18.6 para candidate-05

31 de octubre de 2026 · `synthetic-acceptance-only` · `productionAuthorized=false`.
**Resultado:** compatibilidad preliminar favorable para evaluar 18.6 con opción C;
no equivale a instalación validada, contratos actualizados o autorización para
ejecutar/aprovisionar. N-01 no está aprobada solo por los metadatos.

## Observación manual actualizada

El usuario completó la lectura de propiedades de tres archivos de la VM:

| Archivo | Producto | Versión de producto | Versión de archivo |
| --- | --- | --- | --- |
| initdb.exe | PostgreSQL | 18.6 | 18.0.6.0 |
| postgres.exe | PostgreSQL | 18.6 | 18.0.6.0 |
| pg_ctl.exe | PostgreSQL | 18.6 | 18.0.6.0 |

Coinciden los metadatos de esos tres ejecutables. No fueron ejecutados ni se
modificó PostgreSQL, según el informe del usuario. Se conserva la observación
anterior de un solo archivo como antecedente; la nueva se registra por separado.

La numeración de archivo es coherente con el recurso Windows oficial major, 0,
minor, 0. No acredita procedencia, firma, hash, arquitectura PE o versión de un
servidor activo. Tampoco confirma pg_dump, pg_restore, pg_controldata, DLL o archivos
de share. Las bibliotecas de terceros tienen sus propias versiones: no se exige
que todas sus propiedades digan 18.6.
[Recurso Windows fijado](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/port/win32ver.rc).

## Compatibilidad de versión y datos

18.6 es una versión menor de la misma versión mayor 18. La política PostgreSQL
favorece versiones menores actuales. Las notas de 18.4 y 18.6 cubren los cambios
posteriores a 18.3; 18.5 no llegó a publicarse según las notas 18.6. Incluyen
correcciones de seguridad y no equivalen solo a cambiar un número.
[Política](https://www.postgresql.org/support/versioning/),
[18.4](https://www.postgresql.org/docs/release/18.4/),
[18.6](https://www.postgresql.org/docs/release/18.6/).

La compatibilidad general de actualizaciones menores no sustituye nuestro contrato
exacto. En este trabajo no se propone actualizar, migrar o degradar un clúster
existente: el objetivo sigue siendo uno nuevo, exclusivo y sintético. No se usa
pg_upgrade, dump/restore o cambios de esquema para resolver esta diferencia.

Los contratos actuales rechazan 18.6 y deben actualizarse de forma coordinada en
fuentes nuevas, si se autoriza. Se mantendría versión exacta, no un permiso a
cualquier 18.x.

## Cambios necesarios en fuentes nuevas — no aplicados

| Área/archivo | Cambio requerido para el futuro objetivo 18.6 |
| --- | --- |
| Contrato experimental de versión | Definir una única referencia exacta: producto/CLI 18.6, versión SQL 180006 y metadato Windows 18.0.6.0; separar identidad de binarios/proveedor de estas cadenas |
| `scripts/enterprise026Provision.cjs` | Cambiar comprobación de herramientas y DB_SERVER_VERSION emitida; mantener límites de clúster nuevo, directorios, secreto técnico y token |
| `scripts/windows-installers/server-control.cjs` | Comprobar el conjunto de herramientas 18.6 y su dependencia externa verificada, sin ejecutar nada durante esta evaluación |
| `scripts/windows-setup/coordinator.cjs` | Usar el contrato experimental nuevo en prerrequisitos y pruebas; no conservar envolturas PowerShell incompatibles como solución |
| `backend/config/enterprise026Policy.js` | DB_SERVER_VERSION 18.6; mantenimiento y ejecución deben comprobar server_version_num 180006, además de base, principal SQL, dirección, puerto y system identifier |
| `scripts/windows-installers/postgres-service-contract.cjs` | Ligar el plan a la dependencia externa 18.6/procedencia/inventario; mantener opción C y no convertir coincidencia de versión en aprobación operativa |
| Pruebas experimentales | Aceptación exacta de 18.6 y rechazo de 18.3/18.4/otras o mezcla de herramientas; configuración y SQL coherentes; todos los casos de identidad/token/CMD/fallos siguen obligatorios |
| Textos y empaquetado | Actualizar UI, requisitos y referencias del candidato nuevo; inventarios y hashes nuevos tras cambios y validación |

La forma concreta de centralizar el contrato se resolvería en implementación,
sin modificar el modelo SQL. Cambiar solo una expresión regular dejaría incoherentes
configuración e identidad efectiva. Además debe comprobarse la salida completa de
cada herramienta esperada, sin aceptar texto arbitrario que contenga «18.6».

`backend/config/desktopPostgres.js` y `desktopPolicy.js` conservan comprobaciones
del entorno principal 18.3. No se hace sustitución global: la política experimental
puede reutilizar consultas comunes, pero no debe ampliar las condiciones del
entorno principal ni tocar las bases protegidas.

El cliente Electron no se conecta a PostgreSQL. No requiere un acceso SQL nuevo.
Debe conservar compatibilidad con el backend nuevo, su identidad HTTPS y los
digests/descriptor/inscripción correspondientes al paquete nuevo. Cambiar la
versión de dependencia no autoriza a editar un descriptor firmado existente.

## Comparación real de fuentes oficiales de seguridad y CMD

Se resolvió REL_18_6 a un commit y se descargaron seis archivos como texto desde
esa referencia inmutable, sin compilar ni ejecutar:

- 18.3 revisado: `62d6c7d3df6287f1bd83199c1a746e50d31571a0`.
- 18.6 revisado: `724edf9bde9d356724ad384a2e196edc3c9f80f7`.

| Archivo | Resultado comparado con la evidencia 18.3 |
| --- | --- |
| src/bin/pg_ctl/pg_ctl.c | Idéntico byte a byte |
| src/common/restricted_token.c | Idéntico byte a byte |
| src/port/system.c | Idéntico byte a byte |
| src/bin/initdb/initdb.c | Dos condiciones de validación ICU incorporan un aviso de cadena no terminada; no cambian las rutas de creación de procesos/CMD revisadas |
| src/include/port.h | Añade una declaración de seguridad para extracción de rutas; los remapeos system/popen Windows se conservan |
| src/port/win32ver.rc | Leído para interpretar versiones; no se declara comparado byte a byte con una copia 18.3 no incluida en la evidencia anterior |

Los hashes y diffs quedan en `docs/local-fase-2e7-pg186-review/`. Es una comparación
de esos archivos del upstream, **no una auditoría de todo PostgreSQL**, de sus DLL
o del ejecutable instalado por el distribuidor. Fuentes iguales no prueban que
las compilaciones y dependencias binarias sean iguales.

Fuentes fijadas: [pg_ctl](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/bin/pg_ctl/pg_ctl.c),
[restricted_token](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/common/restricted_token.c),
[initdb](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/bin/initdb/initdb.c),
[port.h](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/include/port.h),
[system.c](https://github.com/postgres/postgres/blob/724edf9bde9d356724ad384a2e196edc3c9f80f7/src/port/system.c).

Consecuencias para seguridad de procesos:

1. Sigue la rama de initdb que registra error y continúa si falla la reejecución
   restringida; PG_RESTRICT_EXEC sigue sin ser una atestación. **18.6 no resuelve
   el bloqueo del primer token por sí sola.**
2. Sigue siendo necesaria la verificación independiente del primer token antes
   de reanudar initdb, cuenta mínima, Job/contención, control de handles y rechazo
   de estados incompletos, conforme a opción C. No se vuelve al depurador completo.
3. El servicio oficial sigue siendo preferido. Sus mecanismos internos no prueban
   por sí solos nuestra contención estricta o cierre completo bajo cualquier fallo;
   se conservan identidad, postcondiciones, manejo de residuales y recuperación.

Dependencias internas CMD que permanecen en el código revisado:

| Ruta | Mecanismo | Uso previsto |
| --- | --- | --- |
| initdb, pruebas de configuración | system con postgres --check | Interno oficial necesario para inicialización; pendiente de extensión de excepción a 18.6 |
| initdb, bootstrap/post-bootstrap | popen y wrapper Windows que llama _popen | Misma limitación de autorización |
| pg_ctl init | system para initdb | No se necesita añadir esa envoltura: preferir initdb directo desde el auxiliar acotado |
| pg_ctl start/restart ordinario | COMSPEC /C para redirección | No es fallback del servicio preferido |
| pg_ctl, directorio solo de configuración | popen para postgres -C data_directory | Rechazar disposición inesperada; no confundirla con el PGDATA exclusivo |
| pg_ctl runservice, creación de postgres | Creación restringida directa | Ruta preferida; no implica que todas las demás ramas estén libres de CMD |

No cambia la necesidad de validar AutoRun del principal efectivo y claves
pertinentes, rutas/ACL, COMSPEC/PATH/cwd/TEMP, entorno no heredado y argumentos
cerrados. No se introduce un shell propio ni se invocan herramientas para observar
esas rutas ahora. La ejecución y árbol concretos siguen pendientes de prueba
manual autorizada; esta igualdad de fuente no es aceptación de runtime.

## Inventarios y dependencia externa

Los paquetes previos no incluyen los binarios PostgreSQL de la VM. Se conservan
y verifican de nuevo sus inventarios y SHA256; una versión externa distinta puede
incumplir requisitos sin alterar los paquetes. Las copias instaladas en la VM no
se han verificado mediante esos hashes en esta revisión.

El candidato nuevo deberá registrar la dependencia oficial concreta: proveedor,
procedencia, ejecutables, arquitectura y cierre de DLL/archivos necesarios, con
hashes y política de actualización. No basta el major del directorio `18`, un
servicio existente, la coincidencia de tres metadatos o descargar el mismo tag.
No se sobrescriben inventarios, candidatos ni asistentes antiguos.

## Autorización exacta que falta

La solicitud actual autoriza **esta evaluación estática**, no una adopción ni
ejecución de 18.6. Para actualizar fuentes experimentales se propone autorizar:

1. PostgreSQL **18.6 exacto** como objetivo del futuro candidate-05/setup-03,
   exclusivamente para el laboratorio Windows 11 y un clúster sintético nuevo.
2. Derivar y actualizar los contratos experimentales de versión, SQL e identidad,
   pruebas, documentación e inventarios del candidato nuevo. Conservar contratos
   del entorno principal, paquetes e instalaciones existentes.
3. Extender a herramientas oficiales **18.6 verificadas** la excepción de CMD,
   limitada a dependencias internas documentadas necesarias. No CMD de Community
   Tours, scripts propios, PowerShell codificado, Bypass o cambios de política.
4. Mantener íntegra la opción C: primer token independiente antes de ejecutar,
   mínimos privilegios, contención, ACL, identidad de clúster, procesos propios,
   parada y postcondiciones. No se autoriza relajación por actualizar versión.

Texto posible para esa decisión, **propuesto y todavía no otorgado**:

> Autorizo PostgreSQL 18.6 como objetivo exacto del futuro candidato experimental
> candidate-05 y setup-03, actualizando únicamente sus fuentes y contratos derivados.
> Extiendo a 18.6 la excepción de CMD interno de las herramientas oficiales
> verificadas, conservando opción C y todas las restricciones. No autorizo modificar
> instalaciones o bases existentes. Las pruebas nativas y cualquier aprovisionamiento
> seguirán siendo gráficos manuales, con procedimiento, permisos y efectos revisados
> antes de ejecutar. No se construirán instaladores hasta superar las puertas de
> seguridad y no se aprobará instalación sin aceptación real.

Esa autorización no debe interpretarse como permiso para empezar initdb, crear
servicios, instalar dependencias, modificar binarios de la VM, usar Guest Control,
RDP/SSH, solicitar contraseñas, restaurar la muestra en cuarentena o cambiar el
antivirus. Cualquier prueba con EXE, incluso solo --version, debe presentarse
primero en el procedimiento gráfico que el usuario revisará y ejecutará.

## Estado final y siguiente paso

Registrar coincidencia de los tres metadatos como avance de inventario visual,
sin aprobar N-01 ni acreditar versión del servidor. Pendientes: otras utilidades,
hashes/procedencia/arquitectura/dependencias, Windows 11 Home/Restricted efectivo,
token, ACL, contexto CMD y aceptación funcional.

Recomiendo aprobar el cambio acotado de objetivo antes de modificar fuentes. Tras
ello, preparar una prueba gráfica de lectura de identidad/procedencia, con alcance
y efectos explícitos, antes de cualquier ejecución PostgreSQL o aprovisionamiento.
No se necesita degradar o reinstalar la copia observada para realizar esta evaluación.

Esta entrega añade solo informe y evidencia de texto. No cambia código o contratos,
no ejecuta tests nuevos de producto, EXE PostgreSQL o componentes nativos, no accede
a la VM ni a bases, no crea instaladores. Las 237 pruebas anteriores siguen siendo
evidencia histórica de sus contratos/modelos anteriores, no certificación de 18.6.
