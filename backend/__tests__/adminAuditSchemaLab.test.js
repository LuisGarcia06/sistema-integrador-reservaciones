'use strict';
const fs=require('node:fs'),path=require('node:path');
const A=require('../config/adminAuditSchemaPolicy'),S=require('../config/adminAuditSchema'),C=require('../config/adminAuditSchemaContract'),P=require('../config/standalonePolicy');
const root=path.resolve(__dirname,'../..'),reviewed=JSON.parse(fs.readFileSync(path.join(root,'docs/local-fase-2d9b1/catalog-reviewed.json'),'utf8'));
const manifest=()=>({version:7,environment:C.ENVIRONMENT,purpose:C.PURPOSE,schemaVersion:'022',dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,
    directory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456'),dataDirectory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456','data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'a'.repeat(64),configDigest:'b'.repeat(64)});
const config=m=>({APP_ENVIRONMENT:C.ENVIRONMENT,DB_HOST:'localhost',DB_PORT:String(m.pgPort),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:'a'.repeat(64),DB_CLUSTER_ID:m.cluster,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'022'});
test('022 es exclusivamente de esquema y tiene manifiesto propio rechazado por perfiles anteriores',()=>{
    const m=manifest();expect(A.validateManifest(m,root)).toBe(m);expect(A.validateConfig(config(m),m)).toEqual(config(m));
    for(const file of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy','auditSchemaPolicy','auditApiPolicy'])expect(()=>require('../config/'+file).validateManifest(m,root)).toThrow();
    expect(require('../config/operationalTransactions').isOperationalLab(config(m))).toBe(false);expect(()=>require('../config/desktopPolicy').validateConfig(config(m))).toThrow();
});
test.each([{version:5},{environment:'audit-schema-lab'},{schemaVersion:'021'},{purpose:'transactional-audit-writers-lab'},{host:'0.0.0.0'},{pgPort:5432},{httpPort:5432},{database:'sian_kaan_reservaciones'},{cluster:P.PROTECTED_CLUSTER},{runtime:'postgres'},{dataGeneration:'invalid'},{extra:true}])('perfil inseguro %j',change=>expect(()=>A.validateManifest({...manifest(),...change},root)).toThrow());
test.each([{APP_ENVIRONMENT:'audit-api-lab'},{DB_SCHEMA_VERSION:'021'},{DB_HOST:'192.168.1.2'},{DB_PORT:'5432'},{DB_NAME:'sian_kaan_reservaciones'},{DB_USER:'postgres'},{DB_CLUSTER_ID:P.PROTECTED_CLUSTER},{DB_SERVER_VERSION:'18.4'},{DB_PASSWORD:'short'},{JWT_SECRET:'unused'},{GYG_GMAIL_SYNC_ENABLED:'true'}])('config insegura %j',change=>{const m=manifest();expect(()=>A.validateConfig({...config(m),...change},m)).toThrow('ADMIN_AUDIT_LAB_CONFIG');});
test('DDL y catalogo/funciones tienen digests fijos revisados',()=>{
    const sql=fs.readFileSync(path.join(root,C.FILE),'utf8').replace(/\r\n/g,'\n');expect(P.sha(sql)).toBe(C.MIGRATION_SHA);expect(S.digest(reviewed)).toBe(C.CATALOG_SHA);expect(S.digest(reviewed.functions)).toBe(C.FUNCTIONS_SHA);expect(()=>S.validate(reviewed)).not.toThrow();
    expect(sql).not.toMatch(/SECURITY DEFINER|DISABLE TRIGGER|sian_kaan_reservaciones|UPDATE public\.usuarios|CREATE TABLE/i);
});
test('expresion 021 exacta y funciones originales se conservan',()=>{
    const old=fs.readFileSync(path.join(root,'database/migrations/021_auditoria_recursos_lab.sql'),'utf8').replace(/\r\n/g,'\n');const marker='ADD CONSTRAINT chk_bitacora_formato_021 CHECK (';const start=old.indexOf(marker)+marker.length;const expression=old.slice(start,old.indexOf(';',start)).slice(0,-1);
    expect(fs.readFileSync(path.join(root,C.FILE),'utf8')).toContain(expression);
    const previous=JSON.parse(fs.readFileSync(path.join(root,'docs/local-fase-2d8b1/catalog-unicode-reviewed.json'),'utf8'));
    for(const f of previous.functions)expect(reviewed.functions.find(x=>x.name===f.name)).toEqual(f);
    expect(()=>require('../config/auditSchema').validate(reviewed)).toThrow('AUDIT_SCHEMA_INVALID');
});
const mutations=[
    ['columna faltante',r=>r.columns.pop()],['columna adicional',r=>r.columns.push({...r.columns[0],name:'intruso'})],['tipo de FK',r=>r.columns.find(x=>x.name==='id_tour').type='bigint'],
    ['nullability de FK',r=>r.columns.find(x=>x.name==='id_tour').notnull=true],['INSERT identity',r=>r.columns[0].insert=true],['UPDATE permitido',r=>r.columns.at(-1).update=true],['default de version',r=>r.columns.find(x=>x.name==='version_auditoria').default='3'],
    ['constraint faltante',r=>r.constraints.pop()],['FK objetivo falso',r=>r.constraints.find(x=>x.name==='fk_bitacora_usuario_afectado_022').definition='FOREIGN KEY falsa'],['CHECK relajado',r=>r.constraints.find(x=>x.name==='chk_bitacora_formato_022').definition='CHECK (true)'],['CHECK sin validar',r=>r.constraints.find(x=>x.name==='chk_bitacora_formato_022').validated=false],
    ['FK comando no diferida',r=>r.constraints.find(x=>x.name==='fk_bitacora_comando_021').deferred=false],['indice faltante',r=>r.indexes.pop()],['indice invalido',r=>r.indexes[0].valid=false],
    ['trigger admin deshabilitado',r=>r.triggers.find(x=>x.name==='ctsk_admin_audit_command_022').enabled='D'],['trigger 021 no always',r=>r.triggers.find(x=>x.name==='ctsk_audit_command_021').enabled='O'],['trigger no diferido',r=>r.triggers[0].deferred=false],['trigger otra funcion',r=>r.triggers[0].function='otra'],
    ['trigger ledger faltante',r=>r.environment.ledger_triggers.pop()],['trigger inverso deshabilitado',r=>r.environment.ledger_triggers[0].enabled='D'],['guard020 alterada',r=>r.environment.ledger_triggers[1].definition+=' alterado'],
    ['funcion snapshot alterada',r=>r.functions.find(x=>x.name==='ctsk_admin_snapshot_valido_022').definition='RETURN true'],['funcion tercero',r=>r.functions[0].owner='otro'],['EXECUTE PUBLIC',r=>r.functions[0].public=true],['EXECUTE tercero',r=>r.functions[0].acl.push({grantee:'tercero',type:'EXECUTE',grantable:false})],
    ['tabla runtime owner',r=>r.privileges.owner='ctsk_standalone_runtime'],['DELETE permitido',r=>r.privileges.delete=true],['TRUNCATE permitido',r=>r.privileges.truncate=true],['columna PUBLIC',r=>r.privileges.column_acl.push({column:'id_tour',grantee:'PUBLIC',type:'INSERT',grantable:false})],
    ['rol inseguro',r=>r.role.unsafe=true],['CREATE esquema',r=>r.environment.schema_create=true],['CREATE base',r=>r.environment.database_create=true],['TEMP',r=>r.environment.database_temp=true],['replicacion',r=>r.environment.replication_role='replica'],['RLS',r=>r.privileges.rls=true],['rule',r=>r.privileges.rules=true]
];
test.each(mutations)('verificador exacto rechaza %s',(_,change)=>{const row=structuredClone(reviewed);change(row);expect(()=>S.validate(row)).toThrow('ADMIN_AUDIT_SCHEMA_INVALID');});
test('verificador vacio falla cerrado',()=>{expect(()=>S.validate(null)).toThrow('ADMIN_AUDIT_SCHEMA_INVALID');expect(()=>S.validate({})).toThrow('ADMIN_AUDIT_SCHEMA_INVALID');});
test('snapshot de contraseña no tiene canal para valores ni JSON adicional',()=>{
    const sql=fs.readFileSync(path.join(root,C.FILE),'utf8');expect(sql).toContain("WHEN accion = 'CAMBIAR_PASSWORD'");expect(sql).toContain('valores_anteriores IS NULL AND valores_nuevos IS NULL');expect(sql).toContain("descripcion = 'Cambio de contraseña'");
    expect(sql).toContain("WHEN 'usuarios' THEN permitidas := ARRAY['nombre','correo','id_rol','estado','alcance_plataformas','platform_ids']");
});
test('lector puro y corredor no importan HTTP/Electron/servicios ni .env',()=>{
    for(const file of ['backend/config/adminAuditSchema.js','backend/config/adminAuditSchemaPolicy.js','scripts/adminAuditSchemaLab.cjs','scripts/adminAuditSchemaCases.cjs']){
        const source=fs.readFileSync(path.join(root,file),'utf8');expect(source).not.toMatch(/require\(['"](?:node:)?http|require\(['"]electron['"]|require\(['"].*services\/|require\(['"]dotenv/);
    }
});
