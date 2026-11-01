'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=__dirname,root=path.resolve(dir,'../..'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8').replace(/^\uFEFF/,'')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const v=read('verification.json'),j=read('jest-verified.json'),s=read('source-verification.json'),i=read('inventory.json'),closure=read('closure.json'),pkg=read('package-verification.json'),archives=read('package-archives.json'),pdf=read('pdf-verification.json');
assert.ok(v.completed&&v.pilot025.completed&&v.manualMonth.completed&&v.postgresStopped&&v.secretScanPassed&&v.failures.length===0&&closure.closed&&j.success&&pkg.completed&&pdf.reviewed);
assert.ok(s.changes.every(x=>x.after&&x.backedUp));assert.ok(!s.changes.some(x=>/database\/migrations|docs\//.test(x.file)));assert.ok(v.connections.every(c=>c.host==='127.0.0.1'));
const C=require('../../backend/config/manualReferences025Contract');assert.equal(sha(fs.readFileSync(path.join(root,C.FILE),'utf8').replace(/\r\n/g,'\n')),C.SHA);
const successful=i.reports.filter(x=>x.completed);for(const count of [44,73,33,28])assert.ok(successful.some(x=>x.checks===count));
for(const row of archives)assert.equal(sha(fs.readFileSync(path.join(dir,row.file))),row.sha256);
const bundle=JSON.parse(fs.readFileSync(path.join(v.backup.directory,'backup.json'))),authority=JSON.parse(fs.readFileSync(path.join(v.clients[0],'preproduction-client.json'))).body.verificationKey;
assert.equal(bundle.body.authority,authority);assert.ok(crypto.verify(null,Buffer.from(JSON.stringify(bundle.body)),authority,Buffer.from(bundle.signature,'base64')));assert.equal(sha(fs.readFileSync(path.join(v.backup.directory,'database.dump'))),bundle.body.archiveSha256);assert.ok(bundle.body.state.rows['ctsk_refs025.manual_refs'].count>0);fs.writeFileSync(path.join(dir,'backup-metadata.json'),JSON.stringify(bundle,null,2));
const inventory=read('package-inventory.json');for(const row of inventory.files)assert.equal(sha(fs.readFileSync(path.join(dir,'packages',row.side,row.file))),row.sha256);
assert.equal(sha(fs.readFileSync(path.join(dir,'packages/server/candidate-inventory.json'))),v.pilot025.enrollment.packageInventorySha256);
const full=v.manualMonth.electron.find(x=>x.mode==='full'),business=v.manualMonth.business;
const report=`# Fase 2E.5 — cierre de brechas del piloto manual

Fecha: ${new Date().toISOString()}. **A implementado y verificado en laboratorio; C inventariado sin intervención; D ensayado. B dispone de supervisor/candidatos funcionales de ensayo, pero la puerta de instalación empresarial sigue incompleta y bloqueada.** No se desplegó producción ni se autoriza instalar en dos equipos.

## 1. Referencias externas

[REFERENCIAS.md](REFERENCIAS.md) detalla la propuesta025. Tabla privada ctsk_refs025.manual_refs, sin columnas nuevas en Reservaciones ni cambios018–024. Código interno autogenerado intacto; plataforma comercial no se confunde con Vendedor/SOLD BY. Declaración opcional de proveedor/valor/tipo, reserva/plataforma/actor/fecha y estado declared. No se escribe reservas_integracion_link desde captura manual.

Migración exclusivamente sintética: SHA256 ${C.SHA}. Catálogo025 fijado independientemente: ${C.CATALOG_SHA}; verifica exactamente23 restriccionesPG18 (incluye NOT NULL), columnas, FK, índices únicos, propietario, triggers ALWAYS, función y privilegios mínimos. No se aplicó a bases previas o empresariales.

## 2. Formulario original adaptado

El mismo modal de Reservaciones incorpora referencia, proveedor, tipo y motivo de corrección. No existe un segundo formulario. Conserva campos comerciales, PAX/niños, código interno de sólo lectura y confirmación de intención. Consulta mantiene lectura/alcance. Electron candidato capturó y corrigió una referencia sintética mediante ese formulario; captura revisada en artifacts/focused/reference025-form.png. El cuadro previo capturado durante el ensayo integral se conserva sin acreditarlo como evidencia visual.

## 3. Duplicados y conciliación

FH/GYG declarados, misma referencia/proveedor409, otra plataforma permitida, vacío sin asociación, UUID inválido/plataforma incompatible rechazados, corrección con motivo e historia, no-op sin auditoría y replay único. Referencia no presente en catálogo simulado se conserva como declaración, no existencia verificada. No se consultan APIs reales para validarla.

Conflicto con vínculo confirmado se rechaza. Importación posterior al corte con UUID/código declarado manualmente devuelve MANUAL_REFERENCE_REQUIRES_REVIEW: no crea otra reserva/vínculo ni fusiona. Compara también versiones retiradas y coincidencias ambiguas de mayúsculas. Resolución definitiva humana/confirmación de vínculo queda pendiente de procedimiento y evidencia del proveedor; no se añade un botón de autoverificación.

## 4. Contrato seguro de arranque

[ARRANQUE-Y-LIMITES.md](ARRANQUE-Y-LIMITES.md) describe inscripciónEd25519 externa nueva, responsable/expiración, paquete/inventarioSHA, código/configuración, clúster/base, bootstrap, instalación, generación/época. Verifica ACL y todos los archivos, roles/esquema/bootstrap vivos y modo manual antes de escuchar. Mantiene una conexión de mantenimiento separada y un candado de supervisor; el backend usa únicamente su pool runtime limitado. Segundo supervisor rechazado.

${v.pilot025.checks.length} grupos de candidato aprobados, con ocho negativos de inscripción y primer login real antes del HTTP del coordinador. No se reutilizó una prueba de otro clúster como permiso empresarial. El scope enterprise se rechaza; todavía hace falta implementar/aprobar el perfil y las migraciones definitivas de instalación empresarial. No se relajaron contratos023/024 ni se retiró el bloqueo del paquete2E.4.

## 5. Paquete servidor

[server-candidate-lab.zip](server-candidate-lab.zip), ${pkg.serverFiles} archivos; arranca en laboratorio sólo con inscripción propia/configuración privada externas. Supervisor normal ejecuta backend/preproductionApi.js, sin probes. Incluye fuentes de compatibilidad requeridas por la huella023 (también frontend/lab y conductores anteriores), sin ejecutarlas para el arranque normal. Inventario exacto en package-inventory.json; autoridad/secretos/manifiestos reales o sintéticos no se incluyen. PostgreSQL18.3 y Node22.20 son externos; no se instalaron servicios. **No puede arrancar una instalación empresarial real con este perfil.**

## 6. Paquete cliente

[client-experimental.zip](client-experimental.zip), ${pkg.clientFiles} archivos; ventana, preload, autorizaciónIPC/PDF y páginas originales. Sin backend, pg/node_modules, secretos, SQL directo, fixtures ni drivers. Harness de UI externo al ZIP. Descriptor público externo y firma/nonce/época/código/frescura obligatorios; sin descriptor se cierra. Electron43.4.1 se suministra externamente por canal confiable. Integraciones reales deshabilitadas por defecto y adaptador024 restringido al simulador.

## 7. HTTPS y LAN

Ensayo127.0.0.1 HTTP con identidad firmada, no pruebaTLS/LAN/dos equipos. Pendientes nombre/origen estables, SAN/hostname/cadenaTLS, custodia/renovación, cuentasWindows, PostgreSQL sólo servidor, firewall mínimo y confianza/descriptores aprobados. No flags para omitir identidad, esquema, permisos o JWT; no se modificaron red/certificados/firewall/router.

## 8. Respaldos y mantenimiento

Reutilizados pg_dump/pg_restore18.3 y verificaciones2E.2–2E.4, ampliando comparación a refs025, secuencia y restricciones. Respaldo privado: ${v.backup.directory.replaceAll('\\','/')}/database.dump; SHA256 ${v.backup.sha256}. Firma verificada con autoridad fijada aparte. backup-metadata.json sólo metadatos públicos. Restauración a clúster/base nuevos vacíos, igualdad íntegra antes de reautorizar, identidad/época/JWT nuevos y clave durable bajo custodia separada.

Propuesta sin programar: copia diaria/pre-cambio,14diarias/8semanales/12mensuales, copia externa cifrada, responsables nominales y prueba mensual de recuperación; RPO/RTO deben aprobarse y medirse. Secretos reales requerirán custodia cifrada autorizada; los archivos privados del ensayo contienen sólo secretos sintéticos. No respaldos/restauraciones empresariales ni tareasWindows nuevas. Detención propia conserva atomicidad y recuperaciónGET de comandos inciertos; no toca productores anteriores.

## 9. Inventario no destructivo anterior

[PRODUCTOR-UNICO.md](PRODUCTOR-UNICO.md) y legacy-inventory.json registran FareHarbor Ready y GetYourGuide Running, ejecutables/rutas/triggers y hashes de lanzadores coincidentes con repositorio. Modos y capacidades se describen desde fuentes; estado no acredita sincronización. Las configuraciones referenciadas continuous.json/postgresConfigPath/OAuth no se abrieron. Endpoints/permisos/base efectivos quedan pendientes de autorización separada. Inventario de procesos final excluye al propio inspector. Ninguna tarea iniciada/detenida/deshabilitada/eliminada, ni consultasSQL empresariales.

## 10. Política de productor único

Propuesta por instalación+plataforma con concesión/fencing común a todos los importadores. Primero aclarar productores antiguos, permisos, eventos y transición nominal; sus candados diferentes no garantizan exclusión entre productos. Captura manual declara; sincronización autorizada confirma; conciliación reúne evidencia sin importar ambiguos. No activar024 real con productores sin aclarar. GetYourGuide sigue manual mientras falten continuidad/homologación/recuperación aprobadas. No se implementó infraestructura pública.

## 11. Piloto manual

Nuevo clúster, bootstrap sin cuenta predeterminada, primer login global desde cliente candidato y después Usuarios/catálogos por aplicación original. El primer acceso global está en pilot025.firstElectron; el recorrido mensual se autentica después y no se presenta como otro bootstrap. ${business.checks.length} grupos comerciales, ${business.httpCalls.length} HTTP;30altas en fechas virtuales de servicio, no30días de disponibilidad/carga. Reservaciones, ediciones/cancelación, cupo24/12/capacidad real/mínimos, Operaciones/Transportes, Daily/PDF, Historial/Bitácora, Consulta all/selected/vacío y Avisos. Corte/cursorNULL, automation_enabled=false y cero vínculos al terminar el período manual.

## 12. Primera activación simulada

Misma base y${v.manualMonth.manualRows.length} filas manuales comparadas íntegramente tras importar/reconciliar. FareHarborHTTP simulado: anterior al corte excluida, exacta/posterior, concurrencia, vínculo confirmado, declaración humana, modificaciones/cancelaciones y conflictos humanos. Corte único ejemplo ${v.restoration.cut}, cursor ${v.restoration.cursor}; reinicio/pausa/reanudación/restauración no cambian la primera fecha. Backend apagado cinco días virtuales y ventana parcial con UUID omitido recuperados; sin nuevo corte ni duplicados. GYG409/corteNULL/manual. Ninguna fecha empresarial fijada.

## 13. Jest, Electron y PostgreSQL

**${j.numPassedTests}/${j.numTotalTests} pruebas Jest, ${j.numPassedTestSuites} suites**, guard de red/noPostgres y dobles revisados; evidencia definitiva jest-verified.json/log. ${v.checks.length} grupos integrales finales, separados de los${v.pilot025.checks.length} del candidato y${business.checks.length} comerciales. Electron original completo: ${full.checks.length} grupos y${full.calls.length} solicitudesAPI, más candidato/reinicio/activación/restaurado. PostgreSQL real; proveedor simulado. PDF original${pdf.bytes}bytes, una página horizontal renderizada/revisada; cero impresiones físicas.

La restauración verificó${Object.keys(v.backup.state.rows).length} tablas entre public/ctsk_sync024/ctsk_refs025, secuencias y restricciones;${v.backup.state.rows['ctsk_refs025.manual_refs'].count} versiones de referencias. ViejoJWT rechazado y worker exige REAUTHORIZE_AFTER_RESTORE antes de habilitar, conservando corte, cursor, pendientes, baseline, recibos y vínculos.

## 14. Regresiones y compatibilidad

${successful.map(r=>'- '+r.file+': '+r.checks+' grupos aprobados.').join('\n')}

023primero agotó tiempo en arranqueC y la repetición aprobó A+C; ambos preservados. Corredores revisados antes de ejecutar y siempre clústeres nuevos. No npm test indiscriminado ni utilidades productivas. Antiguos perfiles no consultan025 sin su manifiesto explícito; migraciones018–024/schema.sql sin cambios. Auditoría/idempotencia/ETag/contexto/revocación vigentes; trazas instrumentales sólo para comandos de ese tramo, sin atribuir pruebas privadas a operaciones anteriores del candidato normal.

## 15. Archivos modificados y nuevos

Modificados con respaldo selectivo idéntico a línea base:

${s.changes.map(x=>'- '+x.file).join('\n')}

Fuentes nuevas:

${s.created.map(x=>'- '+x.file).join('\n')}

Documentos, generadores/inspección de paquetes, reportes, ZIP y artefactos en docs/local-fase-2e5. No se reorganizó el proyecto ni se añadió ORM/framework.

## 16. SHA256 y preservación

${s.prior} archivos previos inventariados;${s.changes.length} modificados, todos respaldados, sin eliminaciones. package-inventory.json y package-archives.json verifican todos los${pkg.files} archivos y cada entrada ZIP. Índice evidence-hashes.json excluye su propia huella. Evidencias2E.1–2E.4 y trabajo local conservados. No reset/clean/restauraciones masivas.

Intentos preliminares preservados: catálogoPG18/NOT NULL; diagnóstico de segundo supervisor; espera de botónUI; trazas previas no instrumentadas; plazo del conductor agotado; backoff simulado2s que vencía al iniciar otro worker; concesión30s agotada al preparar una lectura de prueba; caso heredado que ahora declara la referencia mediante025 sin cambiar el código interno. Final usa Retry-After15s sólo en mock; no cambia política real, concesión30s ni caducidad de atestaciones30s. La espera global del conductor nuevo se amplió a180s para completar comprobaciones de paquete/ACL, sin modificar los plazos de los verificadores existentes. Los intentos de empaquetado anteriores también se conservan y no son los ZIP entregados. Una repetición enfocada sobre el mismo paquete verificó8grupos de candidato y corrigió sólo la captura externa (pintado/GPU del instrumento). Su reporte inicial indicó stopped:false; visual-postgres-closure.json registra la detención posterior explícita, sin sobrescribirlo, y el cierre conjunto confirma cero procesos.

## 17. Cierre

closure.json: cero procesos propios, listeners en puertos propios y postmaster.pid. ${i.laboratories.length} directorios de clúster,${i.clients.length} clientes y${i.ports.length} puertos inventariados, incluidos intentos/destinos no usados. Clústeres y dumps preservados detenidos; ningún proceso ajeno detenido. ${v.connections.length} conexiones observadas del ensayo final, todasloopback; barreras propias y nombres/identidades sintéticos. Escaneo de secretos aprobado. No se afirma que las tareas empresariales anteriores estén apagadas.

## 18. Limitaciones pendientes

HitoB empresarial incompleto: contratos023/024/025 y bootstrap aún exigen laboratorio; no existe permiso para reetiquetarlos como empresariales. Falta perfil definitivo aprobado e implementado, migraciones definitivas, autoridad/custodia cifrada, HTTPS, firma/distribución/actualizaciones, equipos y aceptación. También procedimiento humano de confirmación de referencias ambiguas y metadatos efectivos de productores antiguos. APIs reales/permisos y continuidadGYG no verificados.

## 19. Reversión selectiva

Detener sólo procesos propios. Comparar SHAposterior con source-verification.json antes de reponer cualquiera de los8 originales; si cambió posteriormente, detener la reversión para preservar trabajo. Reponer sólo originales con SHAinicial verificado; no reset/clean. Desactivar perfil025 basta para no usar la extensión. No borrar esquema/historia/ref/bitácora ni revertir un dump sobre datos posteriores; mantener código lector para recuperación. Conservar ZIP/informes/laboratorios. No tocar migraciones anteriores, configuración real o tareas existentes.

## 20. Requisitos para dos equipos

Aprobar e implementar contrato empresarial definitivo (Bpendiente), revisar migraciones y roles/runtime/mantenimiento, responsables/datos/cuentas, custodia y autoridad de instalación, paquetes firmados, HTTPS/LAN/firewall, respaldo externo y restauración cronometrada. Autorizar explícitamente equipos y ventana; personal debe ejecutar matriz25 con criterios de aceptación. Resolver productor único antes de futuras APIs; elegir corte por plataforma sólo entonces. Esta fase no instala en equipos, abreLAN, activaWhatsApp/APIs ni declara listo para producción.
`;
fs.writeFileSync(path.join(dir,'INFORME.md'),report);console.log(JSON.stringify({report:true,integral:v.checks.length,candidate:v.pilot025.checks.length,jest:j.numPassedTests,enterpriseGate:'incomplete-blocked',closed:closure.closed}));
