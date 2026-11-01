# Contratos experimentales PostgreSQL 18.6 — cambio autorizado

31 de octubre de 2026. `synthetic-acceptance-only`; `productionAuthorized=false`.

Se adopta **18.6 exacto** como objetivo de fuentes futuras de candidate-05 y setup-03
por autorización expresa del usuario. No se ha actualizado ni ejecutado PostgreSQL,
creado servicios, accedido a la VM o a bases, ni construido paquetes. La evaluación
anterior se conserva como antecedente; su solicitud de autorización queda satisfecha
solo para contratos experimentales y la excepción interna de CMD de 18.6 verificada.

## Cambios verificables

| Fuentes | Cambio |
| --- | --- |
| `shared/postgresExperimentalContract.js` | Referencia pura, congelada: 18.6, SQL `180006`, metadato Windows `18.0.6.0` y seis herramientas permitidas. Sin ejecución, entorno configurable ni aprobación operativa |
| `backend/config/enterprise026Policy.js` | Configuración exige 18.6; runtime y mantenimiento exigen la cadena SQL `180006`. Conserva otras comprobaciones de base, usuario, red, puerto, clúster, roles, inscripción y permisos |
| `scripts/enterprise026Provision.cjs` | Emite configuración 18.6; acepta solo nombres de herramienta cerrados y salida completa correspondiente a cada una, sin tolerar texto adicional o una coincidencia parcial |
| `scripts/windows-installers/server-control.cjs` | Preflight exige las seis herramientas de la misma versión exacta |
| `scripts/windows-installers/postgres-service-contract.cjs` | Plan offline liga explícitamente versión PostgreSQL y SQL. Alterar esos campos invalida el plan canónico; sigue `operationallyApproved=false` |
| `scripts/windows-setup/coordinator.cjs`, alias local y UI | Prerrequisito y texto apuntan a 18.6 exacto; se conserva el orden que rechaza antes de crear estado privado |
| Fuentes de futuros inventarios: `prepare-path-candidate.cjs`, `build.cjs`, `build-helper.cjs` | Copias futuras incluyen contrato común y política SQL actualizada; requisito textual 18.6. La derivación actual exige candidato nuevo >=05. No se ejecutó ninguna construcción |
| Pruebas `pg186-contract.test.cjs`, `coordinator.test.cjs`, `restricted-policy.test.cjs` | Fixtures 18.6, versiones ambiguas/incorrectas, mezcla de herramientas, SQL incorrecto y preservación de otras barreras. Adaptación explícita de imports simulados |

Salida aceptada: `<herramienta> (PostgreSQL) 18.6`, con terminación ausente, LF o CRLF
única. No se aceptan 18.3, 18.60, sufijos de proveedor no revisados, otra herramienta,
texto de error mezclado o tipos de datos ambiguos. La comprobación de salida **no
autentica el archivo**; su procedencia e integridad son comprobaciones independientes.

`backend/config/desktopPolicy.js` y `desktopPostgres.js` permanecen intactos en 18.3.
No se cambia el modelo SQL, lógica funcional, Reservaciones, Daily, roles ni
integraciones. El cliente sigue comunicándose con el backend y no con PostgreSQL.
No se editan archivos instalados protegidos por inventarios ni descriptores firmados.

## Pruebas y preservación

**285 pruebas aprobadas; 0 fallos, 0 omitidas.** La ejecución completa se conserva
en `local-fase-2e7-pg186-contracts/tests-safe.tap`. Incluye las 237 pruebas anteriores
y 48 nuevas. Se vuelve a ejecutar la suite tras el último ajuste del contrato.
El comando reproducible está en `local-fase-2e7-pg186-contracts/test-command.txt`.

Todas se ejecutan en Node con `safe-test-guard.cjs`, sin aislamiento por procesos:
el guard bloquea lanzamiento de procesos, conexiones/listeners y workers reales.
SQL, procesos, PowerShell, servicio y red de los escenarios de integración son
simulados. Los tests del diseño previo de depuración se conservan como regresión
histórica; no convierten ese diseño en requisito de opción C ni acreditan runtime.
Las pruebas Restricted también documentan bloqueos históricos de candidate-04;
no declaran corregidas sus dependencias ejecutables.

Antes de editar se guardaron copias completas y hashes de 13 fuentes en
`local-fase-2e7-pg186-contracts/before/` y `baseline.json`. El informe nuevo registra
los deltas autorizados y comprueba otra vez hashes/inventarios de candidatos 01..04,
asistentes 01..02 y evidencia histórica de cuarentena. Sus paquetes se conservan.
Los inventarios históricos que apuntan a fuentes de trabajo ahora modificadas
siguen siendo evidencia de aquella revisión; no se reescriben para hacerlos coincidir.
El nuevo `SHA256SUMS.txt` cubre esta evidencia y las fuentes actuales correspondientes.
No es un inventario de binarios PostgreSQL instalados ni un inventario de candidate-05.

## Seguridad y bloqueos que no resuelve cambiar la versión

La excepción autorizada comprende solo dependencias internas oficiales de PostgreSQL
18.6 **verificado**. La comparación estática anterior, conservada en
`local-fase-2e7-pg186-review/`, encontró las rutas de `pg_ctl`, `restricted_token` y
wrapper `system` idénticas a 18.3; no demuestra el binario de la VM. `initdb` conserva
el caso de fallo de reducción que no se puede evaluar por su código de salida.
Las fuentes fijadas y límites de la comparación están en
[la evaluación previa](EVALUACION-POSTGRESQL-18_6-CANDIDATE05.md).

Se mantiene opción C: servicio exclusivo, cuenta mínima, primer token verificado
independientemente antes de reanudar `initdb`, Job/contención, handles, ACL privadas,
identidad del clúster y de procesos propios, parada segura y postcondiciones.
La supervisión completa por `DEBUG_PROCESS` no se implementa. Ninguno de esos
controles se sustituye por una versión coincidente o un `spawn` simplificado.

Los flujos ejecutables heredados de provisión, coordinador y control aún necesitan
integración segura de opción C y compatibilidad Restricted; **no están habilitados
para uso nativo por esta entrega**. Su actualización de versión no los hace aptos
para iniciar un clúster. Sus referencias de release histórico no se renombran
artificialmente como paquetes 05/03 listos. No se usa PowerShell codificado ni
Bypass como solución, ni se modifica ninguna política.

Pendientes antes de integrar/construir:

1. Procedencia/integridad binaria real 18.6, seis herramientas, PE x64 y cierre de
   DLL/archivos necesarios. Los tres metadatos reportados no bastan.
2. Vía nativa legítima validada para primer token y contención, incluidos fallos
   negativos y cierre; sin ejecutar/restaurar/reconstruir el prototipo en cuarentena.
3. Lectura verificable de ACL y AutoRun en el contexto del principal efectivo,
   rutas, entorno y dependencias internas CMD. Rechazo de lectura parcial o ambigua.
4. Eliminar dependencias incompatibles de los flujos nuevos con Restricted,
   conservar seguridad y probar perfiles con espacios, acentos y caracteres especiales.
5. Aceptación real manual en Windows 11 Home: T0 limpio, bootstrap seguro, servicio,
   HTTPS, primer login, cierre y reinicio. Sigue sin aprobarse instalación.

La vía de revisión de McAfee ya documentada sigue siendo
[revisión sin restauración](MCAFEE-REVISION-SIN-RESTAURACION-2026-10-31.md).
No se ha tocado el componente en cuarentena ni generado un sustituto ejecutable.

## Siguiente prueba preparada

[N-02, lectura gráfica de procedencia](PRUEBA-NATIVA-02-PROCEDENCIA-POSTGRESQL-18_6.md)
es el siguiente procedimiento a revisar y realizar manualmente por el usuario.
Explica ventanas, permisos normales, efectos y resultados esperados. No ejecuta
PostgreSQL ni calcula hashes. Registra procedencia parcial cuando no existe
evidencia suficiente, sin convertir metadatos o firmas en una aprobación completa.

No se presupone que la prueba se haya realizado ni se autoriza después de ella
aprovisionamiento. La plantilla de requisitos de dependencia futura en la evidencia
usa campos pendientes y `enrollmentReady=false`, sin hashes inventados.
