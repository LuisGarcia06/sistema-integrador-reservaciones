'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=__dirname,root=path.resolve(dir,'../..'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8').replace(/^\uFEFF/,'')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const v=read('verification.json'),j=read('jest-final.json'),s=read('source-verification.json'),i=read('inventory.json'),c=read('closure.json'),pkg=read('package-verification.json'),pdf=read('pdf-verification.json'),archives=read('package-archives.json');
assert.ok(v.completed&&v.postgresStopped&&v.secretScanPassed&&v.failures.length===0&&v.manualMonth.completed&&c.closed&&j.success&&pkg.completed&&!pdf.visualReviewPending);
assert.equal(s.changes.length,0);assert.equal(v.manualMonth.virtualDays.length,30);assert.equal(v.manualMonth.manualRows.length,51);assert.ok(v.manualMonth.electron.some(e=>e.mode==='candidate'&&e.completed));assert.ok(v.connections.every(x=>x.host==='127.0.0.1'));
assert.equal(sha(fs.readFileSync(path.join(root,'database/migrations/024_activacion_integraciones_lab.sql'),'utf8').replace(/\r\n/g,'\n')),require('../../backend/config/integration024Contract').SHA);
for(const r of i.reports)assert.ok(r.completed);assert.ok(i.reports.some(r=>r.checks===28));
for(const x of archives)assert.equal(sha(fs.readFileSync(path.join(dir,x.file))),x.sha256);
const backupFile=path.join(v.backup.directory,'backup.json'),backup=JSON.parse(fs.readFileSync(backupFile)),trusted=JSON.parse(fs.readFileSync(path.join(v.clients[0],'preproduction-client.json'))).body.verificationKey;
assert.equal(backup.body.authority,trusted);assert.ok(crypto.verify(null,Buffer.from(JSON.stringify(backup.body)),trusted,Buffer.from(backup.signature,'base64')));assert.equal(sha(fs.readFileSync(path.join(v.backup.directory,'database.dump'))),backup.body.archiveSha256);assert.equal(backup.body.archiveSha256,v.backup.sha256);fs.copyFileSync(backupFile,path.join(dir,'backup-metadata.json'));
fs.writeFileSync(path.join(dir,'visual-verification.json'),JSON.stringify({reviewed:true,files:['visual/daily-render.png','artifacts/source/original-configuracion.png','artifacts/restored/sync024-inspect.png','artifacts/restored/sync024-avisos.png'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(dir,file)))})),findings:'Daily horizontal legible; Configuración sin corte en período manual, corte/avance y reautorización visibles tras restaurar; GetYourGuide manual y reconciliación visibles. Sólo escritorio del laboratorio; aceptación del personal pendiente.'},null,2));
const manual=v.manualMonth,b=manual.business,full=manual.electron.find(e=>e.mode==='full');
const text=`# Fase 2E.4 — preparación del piloto empresarial

Fecha de cierre: ${new Date().toISOString()}. **Preparación documental y ensayo sintético terminados; instalación y APIs empresariales pendientes.** No está instalado ni listo para producción. Hito A documentado; hito B entrega cliente experimental probado y componentes de servidor con arranque bloqueado; hito C aprobado en laboratorio. El bloqueo del servidor impide confundir componentes revisables con un instalador autorizado.

## 1. Estado de preparación

Se revisaron AGENTS.md y los informes2E.1/2E.2/2E.3, empaquetado, clientes/adaptadores, contratos023/024 y mecanismos de respaldo. Se conservan arquitectura/tecnologías,22 escritores comerciales, permisos, reglas de capacidad y auditoría. Hace falta supervisor empresarial aprobado, HTTPS, custodia, equipos, datos/roles definitivos y aceptación del personal. No se modificó ninguna fuente previa.

## 2. Matriz de capacidades

[CAPACIDADES-Y-PROTOCOLO.md](CAPACIDADES-Y-PROTOCOLO.md) distingue documentación pública, capacidades simuladas y evidencia real pendiente. Se volvió a consultar documentación oficial pública el29-oct-2026; no endpoints con datos de cuenta ni claves reales. Un cliente implementado o un200 simulado no prueba permisos vigentes.

## 3. Protocolo real de sólo lectura

Preparado en el documento anterior, **no ejecutado**. Exige autorización nominal con empresa/entorno/fechas/UUID/presupuesto, custodia privada, GET cerrados, límites, completitud/retención, detalles, creaciónUTC, equivalencias y contraste independiente de recuperación. No permite provocar cancelaciones/cambios, importar ni activar. La revisión documental no fija una fecha empresarial.

## 4. FareHarbor: bloqueos

Pendientes identidad/grants reales, empresa y alcance autorizado, completitud/retención/consistencia, cuotas compartidas, equivalencias y autoridad sobre cambios manuales. El adaptador024 continúa limitado a HTTP127.0.0.1 y credenciales sintéticas. Consulta por creación y conciliación de UUID vinculados tienen funciones distintas. [Referencia oficial](https://demo.fareharbor.com/api/external/v1/api-reference), [centro oficial](https://developer.fareharbor.com/api/external/v1/).

## 5. GetYourGuide: bloqueos

Continúa manual en024. Faltan modalidad empresarial confirmada, homologación y recuperación/origen temporal verificados. El código Gmail no acredita Supplier API. Se documentan opciones manual/conector homologado/receptor continuo para decisión posterior, sin elegir ni desplegar infraestructura. [Supplier API](https://integrator.getyourguide.com/documentation/overview), [modalidades](https://supply.getyourguide.support/hc/en-us/articles/20309311919773-Connecting-Your-Product-to-a-Reservation-System-Inbound-Outbound-Connectors).

## 6. Paquetes experimentales separados

[client-experimental.zip](client-experimental.zip): ${pkg.clientFiles} archivos, ventana/preload/exportador y páginas originales, arranque separado con identidad023; sinpg/backend/secretos/fixtures/controladores de pruebas. Login real desde Electron43.4.1 aprobado mediante instrumento externo al ZIP. Requiere runtimeElectron externo confiable y descriptor público sintético externo para esta prueba; sólo loopback.

[server-components.zip](server-components.zip): ${pkg.serverFiles} archivos, backend/frontend/esquema/migraciones/herramientas y dependencias runtime. **Componentes revisables; no servidor empresarial arrancable.** start.cjs termina78 antes de SQL/red. El supervisor023 actual depende de atestaciones/huellas de laboratorio; omitirlas relajaría contratos. Por ello se documenta el supervisor empresarial como bloqueo explícito y no se incluye un aprovisionador para bases existentes. No se generó NSIS ni se distribuyó a equipos.

## 7. Inventario y dependencias

[package-inventory.json](package-inventory.json) enumera ${pkg.files} archivos con tamaño/procedencia/SHA256 y versiones/licencias runtime. Se copiaron dependencias ya instaladas, sin npm install/postinstall/descargas. Electron43.4.1, Node22.20 y PostgreSQL18.3 son prerrequisitos externos; el cliente no contiene node_modules ni móduloSQL. verify-packages.cjs aprobó${pkg.checks.length} grupos, incluyendo hashes exactos, referencias internas, conservación byte a byte de IPC/PDF/preload y rechazos de identidad/arranque. Inventario no equivale a auditoría de vulnerabilidades. [PAQUETES.md](PAQUETES.md) precisa límites.

## 8. Configuración y secretos

Propuesta: código inmutable separado de configuración privada servidor, descriptor firmado cliente, respaldo de datos y custodia de secretos. Los ZIP no contienen .env, configuraciones reales o sintéticas, dumps, claves privadas ni credenciales. La configuración de laboratorio sólo se creó en directoriosACL nuevos fuera del paquete. No se leyeron credenciales empresariales.

## 9. Identidad y HTTPS/LAN

Se probó localmente firma/nonce/instalación/época/versión/caducidad y rechazo sin descriptor, y login del candidato separado. Se reutiliza invalidación de sesión ante cambio de instancia/desconexión. Preparados requisitos de cadena/SAN/hostname, custodia/renovaciónTLS, origen estable, firewall mínimo y SQL sólo en servidor. HTTPloopback firmado no acreditaTLS/LAN. No cambios en red, firewall, router, certificados ni serviciosWindows. Sin opción para deshabilitar identidad.

## 10. Respaldo y recuperación

[RESPALDOS-Y-PILOTO.md](RESPALDOS-Y-PILOTO.md) propone frecuencia/retención/copia externa cifrada, responsables y custodia separada; son propuestas sin programación ni compromisoRPO/RTO. El ensayo reutilizó pg_dump/pg_restore18.3 oficiales y autoridad de respaldo fijada aparte. Respaldo privado: ${v.backup.directory.replaceAll('\\','/')}/database.dump; SHA256 ${v.backup.sha256}. Metadatos públicos firmados en backup-metadata.json. No se respalda/restaura ninguna base empresarial.

Restauración a clúster nuevo ${v.restoration.cluster}, base nueva ${v.restoration.database}, con verificación exacta de${Object.keys(v.backup.state.rows).length} tablas públicas/privadas, secuencias y restricciones. Se preservan las comprobaciones estrictas y reconstrucción canónica limitada de CHECK ya aprobadas en2E.2; no se cambiaron verificadores ni migraciones. Nueva identidad/época/JWT, generación y custodia de clave durable conservadas; token previo rechazado.

## 11. Ensayo del primer mes manual

Instalación vacía nueva, bootstrap legítimo, primer login Electron antes de HTTP y segundo Administrador por formulario original. Treinta altas por comandos reales sobre30 fechas sintéticas de noviembre2097; no se alteró relojWindows ni se simuló un mes de disponibilidad/carga. Incluye Usuarios,6catálogos/Tours, Reservaciones, Operaciones/Transportes, Daily/PDF, edición/cancelación, historial/Bitácora y Consulta all/selected/vacío. Ambas plataformas024 finalizaron ese período con corte/avanceNULL, deshabilitadas y cero vínculos.

${b.checks.length} grupos comerciales, ${b.httpCalls.length} llamadasHTTP y ${b.transactionProofs.length} pruebas de cliente/PID/transacción; Electron completo ${full.checks.length} grupos y ${full.calls.length} solicitudesAPI, más primer acceso/candidato/reinicio. PDF original real${pdf.bytes}bytes, una página carta horizontal renderizada y revisada; impresión sólo interceptada, cero trabajos físicos. [MATRIZ-ENSAYOS.md](MATRIZ-ENSAYOS.md) relaciona requisitos con evidencia.

Referencia externa del día1 capturada en Observaciones. Limitación explícita: codigo interno se autogenera y no es editable por contrato vigente; no se agregó silenciosamente una captura estructurada de IDexterno. La coincidencia por código histórico del ensayo024 se prepara como fixtureSQL, no se presenta como captura empresarial disponible. No se inventa vínculo automático a partir de notas.

## 12. Activación posterior simulada

Mismo clúster y mismas${manual.manualRows.length} filas manuales previas, todas comparadas íntegramente después de sincronizar. Se conservan las30altas del período, catálogos/relaciones y auditoría. FareHarborHTTP simulado, clavesRAM, creación anterior/exacta/posterior, duplicados manuales y concurrentes, cancelación/modificación, conflictos humanos, errores403/429/500 y respuesta perdida trasCOMMIT. ${v.checks.length} grupos integrales finales; no se suman como26+30 pruebas independientes. GetYourGuide activación409 y corteNULL.

## 13. Corte único confirmado

Ejemplo del conductor: 2026-12-02 00:00America/Cancun = ${v.restoration.cut}. Se rechazan segunda activación y modificación directa del corte; pausa/reanudación/reinicio/restauración no lo cambian. Fecha original y cursor confirmado son independientes. No se fijó ninguna fecha empresarial ni se cambió la lógica024.

## 14. Interrupciones y restauración024

Backend parado durante cinco días virtuales: recupera nuevas reservas y vuelve a consultar UUID vinculados para cambios/cancelaciones. Ventana parcial conserva UUID omitido por nueva lista y no avanza ante pendientes. Cursores y corte sobreviven reinicios; recuperación porGET evita reenvío incierto. Restauración conserva corte/avance ${v.restoration.cursor}, pendientes, recibos, baseline, vínculos, auditoría y todas las filas respaldadas. Worker rechaza REAUTHORIZE_AFTER_RESTORE hasta autorización nueva del Administrador, sin repetir primera activación. Recuperación real del proveedor no acreditada.

## 15. Pruebas Jest, HTTP/PostgreSQL y Electron

Jest: **${j.numPassedTests}/${j.numTotalTests} pruebas, ${j.numPassedTestSuites} suites**. PostgreSQL18.3 real sobre clústeres nuevos y backend023/024 original; ${v.mockCalls.length} GET al proveedor simulado, no API real. Electron original: first/full/restart/activate/inspect; candidato separado: login y ausencia de pg cargado/Node en renderer. Los instrumentos privados son externos a los ZIP. Capturas y PDF en artifacts/; revisión visual en visual-verification.json y pdf-verification.json.

## 16. Regresiones independientes

${i.reports.map(r=>'- '+r.file+': '+r.checks+' grupos, aprobado.').join('\n')}

Revisados efectos secundarios antes de iniciar cada Verify, sin directorios existentes. Se preservan auditoría/idempotencia, JWT023, concurrencia/cupo24,12 por transporte/capacidad real/mínimos y no-op. Fallos de auditoría/ledger/restricción revierten cambios;404 de recuperación sigue no concluyente. No se ejecutaron pruebas productivas/destructivas sobre bases previas.

## 17. Aislamiento y cierre

${i.laboratories.length} directorios de clúster inventariados (incluye destinos preliminares no usados), ${i.clients.length} directorios cliente y${i.ports.length} puertos propios; todos preservados. ${v.connections.length} conexiones observadas del ensayo final, todas127.0.0.1. Barreras de red, nombres/identidades/ACL nuevos, sin conexión a sian_kaan_reservaciones. Escaneo de secretos aprobado. closure.json: cero procesos propios, listeners y postmaster.pid; no se detuvo ningún proceso ajeno.

previous-processes.json encontró tareas anteriores FareHarbor Ready y GetYourGuide Running; no se iniciaron/detuvieron/modificaron ni se verificaron sus credenciales. Desactivación sólo acredita las integraciones del ensayo nuevo. Resolver productores simultáneos antes de cualquier piloto real.

## 18. Archivos preservados y hashes

${s.prior} archivos de línea base, **${s.changes.length} modificaciones/eliminaciones previas**. Fuentes/migraciones/evidencias anteriores intactas; sin reset/clean/limpieza. Nuevos archivos fuera de la carpeta de evidencia:

${s.created.map(x=>'- '+x.file).join('\n')}

Documentación, corredores auxiliares, inventarios, ZIP y evidencias viven en docs/local-fase-2e4. No fueron necesarios respaldos selectivos de originales porque ninguno cambió. Intento1falló por avisos sintéticos ausentes; intento2 por aserción que suponía un únicoTour antes de combinar mes manual. Ambos preservados y cerrados; intento3final aprobó sin cambios al producto. Primer generador se detuvo por detectar una referencia nominal de conductor; el segundo se conserva como preliminar; los ZIP finales excluyen frontend/lab. Reversión: dejar de ejecutar los3corredores nuevos y conservar pruebas/dumps; no revertir fuentes previas ni datos.

## 19. Riesgos y decisiones pendientes

Supervisor empresarial y paquete servidor ejecutable, firma/distribución/actualizaciones, HTTPS y dos equipos, datos/permisos definitivos, custodia/copia externa/RPO/RTO, referencia externa estructurada, equivalencias y autoridad de conciliación, inventario de productores anteriores, permiso realFH y modalidad/continuidadGYG, pruebas de carga/aceptación humana. No instalar componentes ni convertir el contrato sintético en empresarial renombrando manifiestos.

## 20. Plan empresarial sujeto a aprobación

Secuencia detallada en RESPALDOS-Y-PILOTO.md: gobierno y piloto manual → supervisor/paquetes/HTTPS aprobados → instalación autorizada → aceptación del personal y restauración cronometrada → protocolo real de sólo lectura autorizado → activación individual con corte elegido, respaldo y reconciliación → evaluación. GetYourGuide permanece manual si falta recuperación suficiente. Ninguna puerta empresarial fue ejecutada en esta fase; no se activaron FareHarbor/GetYourGuide/WhatsApp ni se instaló producción.
`;
fs.writeFileSync(path.join(dir,'INFORME.md'),text);console.log(JSON.stringify({report:true,checks:v.checks.length,jest:j.numPassedTests,prior:s.prior,unchanged:s.prior,closed:c.closed}));
