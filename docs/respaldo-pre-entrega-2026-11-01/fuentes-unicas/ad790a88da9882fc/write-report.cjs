'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n),'utf8').replace(/^\uFEFF/,''));
const v=read('verification.json'),j=read('jest-final.json'),s=read('source-verification.json'),i=read('inventory.json'),c=read('closure.json');
assert.ok(v.completed&&v.stopped&&v.secretScanPassed&&j.success&&c.closed);
assert.ok(s.changes.every(x=>x.backup));
assert.deepEqual(v.backup.state,v.restoration.verifiedState,'La lectura de aplicación restaurada debe conservar el estado respaldado');
const checks=x=>Array.isArray(x)?x.length:x;
const sql=Object.entries(v.backup.state.rows).map(([table,r])=>`| ${table} | ${r.count} | ${r.sha256} |`).join('\n');
const changed=s.changes.map(x=>`- \`${x.file}\``).join('\n'),created=s.created.map(x=>`- \`${x.file}\``).join('\n');
const regressions=i.reports.map(r=>'| ['+r.file+']('+r.file+') | '+r.checks+' | Aprobado |').join('\n');
const body=`# Fase 2E.2 — Informe de preparación y recuperación

Fecha de cierre: ${new Date().toISOString()}. Resultado: **fase completada en entornos sintéticos locales; instalación empresarial pendiente**.

## 1. Evaluación de preparación empresarial

Se preparó y comprobó la separación servidor/cliente, instalación limpia y recuperación real. El sistema conserva Electron, HTML/CSS/JavaScript, Express y PostgreSQL, una lógica comercial y los 22 escritores autorizados. Se revisaron AGENTS.md, consolidación 2E.1, entradas originales, pool central, contratos 020–023, JWT/bootstrap, PDF e inventario de empaquetado. Faltan instalación física, protección LAN, distribución y aceptación empresarial. No está declarado listo para producción.

## 2. Arquitectura propuesta

Servidor: PostgreSQL18.3 central, backend Express y mantenimiento/respaldo privado. Cliente: Electron original conectado por REST al backend identificado, sin base comercial propia, sincronización bidireccional ni conexión SQL. El ensayo utiliza procesos/configuraciones distintos sobre127.0.0.1; no acredita conectividad entre dos computadoras.

## 3. Dependencias de laboratorio identificadas

Supervisores IPC, manifiestos sintéticos, pruebas A/B, fixtures, puertos aleatorios, clústeres desechables y control de fallos son herramientas de ensayo. El nuevo primer arranque utiliza bootstrap legítimo y singleton vivo; ninguna prueba de otro clúster acredita la instalación. Instrumentación de fallos sólo en supervisor privado/probe y nunca como endpoint público. Su sustitución empresarial está descrita en [CONTRATO-PREPRODUCCION.md](CONTRATO-PREPRODUCCION.md).

## 4. Configuración segura

Perfil explícito y cerrado \`preproduction023-local\`, raíces nuevas con marcador/ACL, identidad de clúster, huella de código, esquema023 y rol limitado antes de escuchar. Archivo privado de servidor separado del descriptor público firmado del cliente. Identidad remota por desafío/nonce firmado y fresco; cambio de instancia o desconexión limpia sesión. Los argumentos no deshabilitan verificaciones. Por diferencia observada de6ms entre procesos Windows se prueba margen máximo de1s de adelanto; caducidad de30s, firma e identidad conservadas. La configuración empresarial sigue sin activación.

## 5. Ensayo local servidor/cliente

${v.checks.length} grupos de comprobación del coordinador; regresión comercial integrada de ${checks(v.business.checks)} grupos. ${v.electronRuns.length} ejecuciones de Electron original: primer acceso, recorrido completo, reinicio, caída de PostgreSQL y recuperación restaurada. Cliente sin SQL, secretos de servidor ni módulo pg cargado; renderer aislado sin Node. La aplicación conserva sus páginas y formato Daily.

## 6. Instalación limpia y primer acceso

Esquema023 y permisos verificados; sólo roles/catálogos técnicos previos al bootstrap. Credencial sintética explícita y aleatoria en memoria, sin cuenta/contraseña predeterminada ni archivo de usuario fixture. Singleton único del primer Administrador. Primer login desde Electron antes de cualquier login HTTP directo; segundo Usuario creado en formulario original. Reinicios y reconexión comprobados.

## 7. Respaldo

\`pg_dump18.3\` oficial, custom, snapshot exportado de transacción repetible de sólo lectura y ventana sin escritores. Archivo nuevo privado: \`${v.backup.directory}\\database.dump\`. SHA256: \`${v.backup.sha256}\`. Firma y autoridad de origen fijada separadamente, cantidades/huellas de todas las tablas y secuencias, contrato023 y procedencia. Contraseña por entorno privado, nunca argumentos/logs. Los eventos de herramientas guardan versión, salida y huella del diagnóstico. Procedimiento en [RESPALDO-RESTAURACION.md](RESPALDO-RESTAURACION.md).

## 8. Restauración verificada

Otro clúster nuevo, base vacía nueva, \`pg_restore --single-transaction --exit-on-error --no-owner\`, rol de mantenimiento separado. Verificados todas las filas/secuencias, restricciones, catálogo023 y permisos de runtime. Restauración: clúster \`${v.restoration.cluster}\`, base \`${v.restoration.database}\`. La restauración reconstruye transaccionalmente nueve CHECK cuyo árbol PostgreSQL18.3 reescribe al importar, usando únicamente SQL original con SHA aprobado y pares de huellas conocidos; exige igualdad exacta posterior. Migraciones y verificadores intactos. Backend iniciado, login autorizado, lectura Reservaciones/Daily y PDF real desde Electron original. El estado final después de esas lecturas coincide exactamente con el snapshot respaldado. Incluye usuarios/roles, plataformas asignadas, versiones, singleton, ledger, relaciones, catálogos, reservas, transportes, operaciones, observaciones y bitácora.

## 9. Sesiones y secretos tras restaurar

Generación de datos y singleton original conservados. Constancia externa firmada liga respaldo/procedencia al clúster y base destino, instalación, época y huella de clave de comandos. Instalación, época de autenticación, JWT, clave de identidad y precondiciones nuevas; descriptor público cliente nuevo. Se revocó un JWT en origen después de respaldar y se comprobó401 al presentarlo en la aplicación restaurada, aunque la copia conserva la versión de credenciales anterior. La clave de comandos se conserva por custodia privada separada para mantener comandos durables. El dump no reemplaza la custodia de secretos.

## 10. Fallos y recuperación

Backend terminado/reiniciado, PostgreSQL detenido con backend y Electron activos, cliente desconectado, respuesta perdida tras COMMIT, recuperación GET con misma intención, sesiones y respuestas tardías, configuración incorrecta, respaldo corrupto/destino no vacío y privilegios runtime insuficientes. Restauración parcial real que termina con código cero es rechazada al comparar datos; archivo inválido produce error real de pg_restore y cero tablas en destino nuevo. Sin reintentos automáticos de escrituras inciertas, duplicados ni reparaciones automáticas.

## 11. Cupo de 24 PAX

Probados alta exactamente24, rechazo25, cambio PAX/tour/fecha/turno, edición sin doble conteo, canceladas excluidas, sin transporte incluidas y dos altas concurrentes bajo transacción/candado. Históricos con sobrecupo y turnoNULL se reportan sin modificar ni inferir turno. PAX incluye niños; grupo/transporte máximo12 y capacidad real del vehículo, mínimos y otras reglas vigentes conservados. Diferencia comercial ya autorizada en2E.1: antes el cupo se limitaba al asignar; ahora se exige también desde alta/edición. Esta fase vuelve a verificarla y sólo habilita su mismo servicio para el nuevo perfil.

## 12. Aceptación empresarial

Matriz preparada en [DATOS-Y-ACEPTACION.md](DATOS-Y-ACEPTACION.md), con resultados automatizados separados de revisión manual de Community Tours. Login/roles, reservas/cancelaciones/búsquedas, operaciones, transportes, Daily/PDF/impresión, historial/bitácora, Usuarios/Configuración, Avisos, revocación, desconexión y recuperación incluidos. Todos los casos en equipos reales siguen pendientes de ejecución y aprobación del personal.

## 13. Conexión física futura

Definir servidor, dirección/nombre estable, puerto HTTPS, certificados/confianza verificables, cuentas Windows separadas, firewall específico, PostgreSQL accesible sólo desde servidor, inicio/detención y recuperación, almacenamiento y respaldo externo. No asumir seguridad de red privada. No se tocaron LAN, router, firewall, certificados ni servicios Windows. Empaquetado actual incluye backend: debe prepararse después un cliente independiente mediante lista de archivos revisada; ningún instalador definitivo fue generado.

## 14. Regresiones ejecutadas y omitidas

Jest: **${j.numPassedTests}/${j.numTotalTests}**, **${j.numPassedTestSuites}/${j.numTotalTestSuites}** suites. Contratos021–023 en tres clústeres independientes, después de revisar sus efectos secundarios:

| Informe | Grupos | Resultado |
| --- | ---: | --- |
${regressions}

Los corredores021/022 conservan credenciales;023 sólo cambia credenciales sintéticas autorizadas. No se ejecutan utilidades que lean .env/base empresarial, respaldo productivo, integraciones reales, instaladores ni limpieza. Ensayos preliminares fallidos se conservan en attempt-*; se corrigieron contrato de reloj, cierre de mantenimiento, transición de clúster y aserciones del corredor; no se relajaron migraciones ni reglas de negocio.

## 15. Archivos creados y modificados

Línea base técnica de ${s.prior} archivos, incluida la utilidad preproductionEvidence.cjs creada al inicio de esta fase; ${s.unchanged} conservan su huella y ${s.changes.length} se modificaron, todos con copia original cuyo SHA coincide con línea base. Migraciones018–023, .env y evidencias2E.1 conservadas. No reset/clean/restauración masiva. Inventario reproducible en source-verification.json.

Modificados:

${changed}

Creados en código:

${created}
- scripts/preproductionEvidence.cjs (creado antes de tomar la línea base).

Documentación/evidencias: este informe, contrato, procedimiento de respaldo, matriz/datos, verification.json, Jest, regresiones copiadas, inventario/cierre, hashes, originales selectivos y artefactos PDF/PNG. Los archivos adapt-*.cjs conservan cómo se hicieron las adaptaciones; no son utilidades de despliegue.

## 16. Aislamiento

${i.laboratories.length} directorios de clúster de esta fase inventariados, incluidos destinos preliminares no provisionados; ${i.clients.length} directorios cliente registrados; puertos en inventory.json. Sólo clústeres nuevos marcados, nombres sintéticos, identidad y rutas verificadas, red loopback y barrera de conexiones de cada fase. Al aprovisionar destino se usa el guard propio de standaloneDev antes del guard de ambos clústeres del coordinador. No acceso a sian_kaan_reservaciones, datos reales ni APIs externas. Secret scan aprobado. Los directorios privados/dumps se conservan con ACL; no se entregan secretos en el informe.

## 17. Cierre

closure.json comprobó **cero procesos propios, cero listeners en los puertos registrados y cero postmaster.pid**. Ningún proceso ajeno fue detenido. Incluye el cierre verificado de un intento interrumpido anterior en attempt-8-closure.json. Clústeres y evidencia se preservan detenidos, sin borrado de datos.

## 18. Pendientes y riesgos

Faltan custodia/cifrado/retención/copia externa, responsables y RPO/RTO aprobados; paquete cliente/servidor, actualización/reversión, HTTPS y confianza, dos equipos reales y aceptación del personal. Un backup antiguo recupera datos anteriores al incidente: validar usuarios y decisiones comerciales antes de reabrir, siempre con nueva época. Propuesta de inicialización limpia sin limpiar la empresa: inventariar, clasificar, respaldar, restaurar de prueba y autorizar registros explícitos antes de cualquier limpieza futura. Integraciones FareHarbor/GetYourGuide y WhatsApp siguen pendientes de documentación/acceso/autorización.

## 19. Reversión selectiva

Con todos los procesos de esta fase detenidos, comparar cada archivo con SHA posterior en source-verification.json; si existe un cambio posterior, detenerse para conservarlo. Sólo reponer los ${s.changes.length} originales desde originals/ después de verificar su SHA inicial y revisar el diff. Deshabilitar el modo explícito basta para volver al camino previo sin tocar datos. Los ${s.created.length+1} archivos nuevos pueden retirarse únicamente tras revisar sus referencias y conservar evidencias. No aplicar reversión masiva, no tocar .env ni migraciones, no borrar clústeres/respaldos ni revertir trabajo previo.

## 20. Siguiente etapa propuesta

Preparar un piloto de instalación revisado con personal: aprobar datos/cuentas definitivos, protección LAN y custodia; separar paquetes sin secretos/fixtures; instalar en dos equipos sólo con autorización posterior; ejecutar matriz, restauración cronometrada y revisión de PDF/impresión física autorizada. Resolver incidencias y obtener aceptación antes de cualquier activación productiva.

## Anexo: cantidades e integridad del respaldo recuperado

| Tabla | Filas | SHA256 de filas normalizadas |
| --- | ---: | --- |
${sql}

Secuencias en verification.json; conjunto completo de restricciones y metadatos públicos firmados en backup-metadata.json. PDFs y capturas en artifacts/source/ y artifacts/restored/; revisión del PDF restaurado en pdf-verification.json.
`;
fs.writeFileSync(path.join(__dirname,'INFORME.md'),body.replaceAll('PostgreSQL18.3','PostgreSQL 18.3').replaceAll('esquema023','esquema 023').replaceAll('código cero','código cero').replaceAll('de6ms','de 6 ms').replaceAll('de1s','de 1 s').replaceAll('de30s','de 30 s').replaceAll('exactamente24','exactamente 24').replaceAll('rechazo25','rechazo 25').replaceAll('máximo12','máximo 12').replaceAll('Esquema023','Esquema 023').replaceAll('sobre127','sobre 127').replaceAll('contrato023','contrato 023').replaceAll('catálogo023','catálogo 023').replaceAll('comprobó401','comprobó 401').replaceAll('turnoNULL','turno NULL').replaceAll('en2E.1','en 2E.1').replaceAll('Contratos021','Contratos 021').replaceAll('corredores021','corredores 021').replaceAll(';023','; 023').replaceAll('Migraciones018','Migraciones 018').replaceAll('evidencias2E.1','evidencias 2E.1').replaceAll('pg_dump18.3','pg_dump 18.3'));
console.log(JSON.stringify({report:'INFORME.md',checks:v.checks.length,tests:j.numPassedTests,restoredTables:Object.keys(v.backup.state.rows).length,closed:c.closed}));
