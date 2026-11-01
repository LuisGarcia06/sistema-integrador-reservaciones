'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=__dirname,read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8').replace(/^\uFEFF/,''));
const v=read('verification.json'),j=read('jest-final.json'),s=read('source-verification.json'),c=read('closure.json'),packages=read('package-cleanliness-audit-verified.json'),gate=read('package-gate-execution.json');
assert.ok(v.completed&&v.initial.clean&&!v.afterAcceptance.clean&&v.postgresStopped&&v.secretScanPassed&&c.closed&&j.success&&s.changes.every(x=>x.backedUp&&x.after)&&packages.every(p=>!p.enterpriseEligible&&p.priorPreserved)&&gate.observedExitCode===2);
const technical=new Set(['public.roles','public.paises','public.plataformas','public.integracion_sync_estado']);
const rows=Object.entries(v.initial.state.counts).map(([table,count])=>'| '+table+' | '+count+' | '+(technical.has(table)?'Contenido técnico revisado':'Debe estar vacía')+' |').join('\n');
const text=`# Certificación técnica del ensayo de instalación limpia — requisito2E.6

Fecha de emisión: ${new Date().toISOString()}. **T0 limpio comprobado en laboratorio. Certificación/entrega empresarial NO aprobadas.** No se ha aprovisionado empresa ni se declaran listos los paquetes actuales.

El requisito queda incorporado en [FASE-2E6-REQUISITOS.md](../FASE-2E6-REQUISITOS.md) y en el [procedimiento de instalación empresarial limpia](../INSTALACION-EMPRESARIAL-LIMPIA.md). Este documento acredita un ensayo, no autoriza reetiquetar sus constancias como instalación empresarial.

## 1. Identidad y estructura comprobadas

Clúster nuevo ${v.initial.cluster}, base nueva ${v.initial.database}, únicamente127.0.0.1. Directorio privado: ${v.clusters[0].directory.replaceAll('\\','/')}. PostgreSQL18.3, esquema base/018 y contratos019–025 vigentes para laboratorio; bootstrap vacío, relaciones/restricciones/permisos y extensiones verificados antes de T0. Migraciones, seeds y contratos anteriores sin modificación. Para empresa sigue faltando aprobación del contrato definitivo; no se inventa esa autorización.

La nueva opción cleanInstallation sólo se admite junto con empty-bootstrap-lab y directorio nuevo vacío. Reutiliza seeds.sql existente fijado por SHA256 ${require('../../backend/config/cleanInstallationContract').seedSha256}; no ejecuta la inserción anterior de descripciones de roles sintéticos ni crea cuentas de prueba iniciales. Los otros modos mantienen su camino previo.

## 2. Inventario y conteos T0

Comprobación: ${v.initial.checkedAt}. Son conteos **anteriores al bootstrap y a los datos de aceptación**. Cero usuarios, reservas y filas comerciales. La comprobación cuenta registros y revisa contenido técnico; no se limita a buscar palabras como ficticio/SYN.

| Tabla | Filas T0 | Regla |
| --- | ---: | --- |
${rows}

Excepciones técnicas cerradas: roles Administrador/Consulta sin cuentas; país No especificado; plataformas Externa/FareHarbor/GetYourGuide/WhatsApp Business; cuatro controles iniciales de publicación/automation024. Sus valores exactos están en verification.json, initial.state. Tabla/esquema extra, catálogo alterado o cualquier fila comercial producen rechazo.

## 3. Integraciones inicialmente apagadas

Los4controles se generan **de nuevo por las migraciones**, sin restaurar/copiar filas de otro laboratorio. Publicación y automatización false, sin first_activation_at, confirmed_through, responsables/autorización, ejecución, pending_window, errores/backoff/recovery, cursor externo, eventos o vínculos. Los contratos actuales requieren last_history_id NOT NULL:0(publicación) y not-applicable-024(automation024) son sentinelas técnicos existentes, no un HistoryID de proveedor ni un cursor recuperado. Se identifican como tales; no se afirma que la tabla esté vacía. Su representación empresarial definitiva requiere revisión/aprobación propia.

Sólo en esta base recién creada, antes de usuarios y datos, initializeTechnicalState establece los indicadores de publicación en false. Rechaza una base con datos/cursor/historia y no limpia registros. La repetición sin cambios no escribe. No se leyeron credenciales de proveedores ni se consultaron APIs reales.

## 4. Primer acceso y altas posteriores — T1 separado

Después de certificar T0 se creó un Administrador mediante bootstrap legítimo con contraseña aleatoria de aceptación capturada en memoria y almacenada como hash; ninguna cuenta/contraseña predeterminada ni test-user.json. Primer login desde Electron original ${v.firstAccess.electron}, renderer aislado y sin pg, antes del loginHTTP del coordinador.

La API original aceptó4catálogos y1reservación con validaciones/comandos/auditoría normales. Todos esos valores son datos de aceptación T1, exclusivamente de la base de ensayo: no son semillas ni datos reales de Community Tours. No se usaron datos reales. Se preservaron las filas y no se exportó un dump.

El verificador volvió a ejecutarse y devolvió clean:false (${v.afterAcceptance.issues.join(', ')}). Por tanto, **la base de ensayo actualmente poblada no es una plantilla distribuible**, aunque su estado inicial T0 haya sido limpio. No se borra T1 para simular limpieza. El bootstrap de empresa deberá crear su propio primer Administrador, y los catálogos/clientes reales se cargarán sólo con autorización independiente.

## 5. Verificación de paquetes

Inspección sólo en lectura, sin extracción/ejecución:

${packages.map(p=>'- '+path.basename(p.archive)+': '+p.files+' archivos, '+p.findings.length+' hallazgos; NO apto para entrega empresarial. SHA256 '+p.sha256+'.').join('\n')}

Cliente: contrato synthetic-client023-only. Servidor: perfil/contratos de ensayo y fuentes de laboratorio/instrumentación requeridas por su huella023. No se promueven estos ZIP a producción. El auditor devolvió código2 y bloqueó entrega; el resultado existe en package-gate-execution.json. No se generaron ZIP empresariales nuevos ni se alteraron los anteriores.

El entregable futuro deberá tener manifiesto/cierre de dependencias y firma empresariales aprobados, sin dumps, fixtures, datos de ensayo, pruebas/drivers/probes, reportes/capturas, secretos, tokens o configuración privada. Las evidencias quedan en docs/local-fase-2e6-clean y fuera del paquete. La auditoría actual no inventa un formato de aprobación empresarial inexistente.

## 6. Resultados automáticos y aislamiento

${j.numPassedTests}/${j.numTotalTests} pruebas Jest, ${j.numPassedTestSuites} suites aprobadas, incluyendo negativos por cada tabla comercial, cursores/actividad y catálogos no autorizados. Corredor real PostgreSQL/HTTP/Electron: ${v.checks.length} grupos aprobados. Bootstrap/esquema/privilegios antes de T0, verificador inicial, rechazos de contaminación, primer acceso, altas T1 y rechazo de plantilla poblada.

No conexiones a sian_kaan_reservaciones ni sian_kaan_reservaciones_dev, ni limpieza/modificación de bases existentes, integración real, LAN/firewall/certificados, servicios/tareas empresariales o impresión física. Sólo clúster/cliente nuevos con ACL y puertos propios. Los secretos del ensayo no aparecen en los reportes/logs públicos. La certificación no acredita conectividad empresarial ni datos reales.

## 7. Preservación y cierre

closure.json: cero procesos propios, listeners propios y postmaster.pid. Clúster y datos T1 se conservan detenidos; ningún laboratorio anterior fue eliminado ni respaldo modificado. Hashes de ZIP anteriores coinciden con sus inventarios2E.5. Evidencias previas intactas.

${s.prior} archivos previos inventariados. Modificado con respaldo selectivoSHA idéntico al original: ${s.changes.map(x=>x.file).join(', ')}. Nuevos:

${s.created.map(x=>'- '+x.file).join('\n')}

Originales en originals/; inventario en source-verification.json y sello final en evidence-hashes.json. Reversión selectiva del único aprovisionador: verificar SHAposterior y reponer sólo su original si no hay cambios posteriores. Conservar los datos/evidencias y no usar reset/clean ni borrados masivos.

## 8. Condiciones para emitir certificación empresarial

Aprobar e implementar contrato/migraciones empresariales definitivos y perfil de arranque sin dependencias de laboratorio; preparar paquetes operativos independientes y auditarlos con autoridad/manifiesto aprobados. Aprovisionar entonces un destino empresarial nuevo autorizado, ejecutar T0, bootstrap propio/primer acceso y aceptación. Carga real independiente con procedencia, dry-run, mapeos revisados, autorización nominal, cupos/referencias y auditoría por backend; nunca completar faltantes con valores inventados.

**La ausencia inicial de datos ficticios en este ensayo no declara lista la instalación empresarial.** Los bloqueos de paquetes y del hitoB siguen vigentes. No se ha ejecutado aprovisionamiento empresarial real.
`;
fs.writeFileSync(path.join(out,'CERTIFICACION.md'),text,{flag:'wx'});console.log(JSON.stringify({certificate:'synthetic-clean-T0-only',tables:Object.keys(v.initial.state.counts).length,jest:j.numPassedTests,packagesBlocked:true,closed:c.closed,enterpriseReady:false}));
