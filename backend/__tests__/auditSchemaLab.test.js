'use strict';
const fs=require('node:fs'),path=require('node:path');
const P=require('../config/standalonePolicy'),A=require('../config/auditSchemaPolicy'),S=require('../config/auditSchema'),C=require('../config/auditSchemaContract');
const root=path.resolve(__dirname,'../..');
const original=JSON.parse(fs.readFileSync(path.join(root,'docs/local-fase-2d8b1/catalog-unicode-reviewed.json'),'utf8'));
const manifest=()=>({version:5,environment:A.ENVIRONMENT,purpose:A.PURPOSE,schemaVersion:'021',dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,
    directory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456'),dataDirectory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456','data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'a'.repeat(64),configDigest:'b'.repeat(64)});
const config=m=>({APP_ENVIRONMENT:A.ENVIRONMENT,DB_HOST:'localhost',DB_PORT:String(m.pgPort),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:'a'.repeat(64),DB_CLUSTER_ID:m.cluster,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'021'});
test('021 tiene perfil exclusivamente de esquema y todos los lectores anteriores lo rechazan',()=>{
    const m=manifest();expect(A.validateManifest(m,root)).toBe(m);expect(A.validateConfig(config(m),m)).toEqual(config(m));
    for(const file of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy'])expect(()=>require('../config/'+file).validateManifest(m,root)).toThrow();
    expect(require('../config/operationalTransactions').isOperationalLab(config(m))).toBe(false);
    expect(()=>require('../config/desktopPolicy').validateConfig(config(m))).toThrow();
});
test.each([{version:4},{environment:'command-api-lab'},{purpose:'single-transaction-commands-lab'},{schemaVersion:'020'},{dataGeneration:'invalid'},{database:'sian_kaan_reservaciones'},{pgPort:5432},{httpPort:5432},{host:'0.0.0.0'},{cluster:P.PROTECTED_CLUSTER},{runtime:'postgres'},{extra:true}])('perfil inseguro %j',patch=>expect(()=>A.validateManifest({...manifest(),...patch},root)).toThrow());
test.each([{APP_ENVIRONMENT:'principal'},{DB_SCHEMA_VERSION:'020'},{DB_HOST:'192.168.1.2'},{DB_PORT:'5432'},{DB_NAME:'sian_kaan_reservaciones'},{DB_USER:'postgres'},{DB_CLUSTER_ID:P.PROTECTED_CLUSTER},{DB_SERVER_VERSION:'18.4'},{DB_PASSWORD:'short'},{JWT_SECRET:'unused'},{GYG_GMAIL_SYNC_ENABLED:'true'}])('config insegura %j',patch=>{const m=manifest();expect(()=>A.validateConfig({...config(m),...patch},m)).toThrow('AUDIT_LAB_CONFIG');});
test('DDL revisado coincide con el digest fijo y conserva formato historico',()=>{
    const sql=fs.readFileSync(path.join(root,C.FILE),'utf8').replace(/\r\n/g,'\n');expect(P.sha(sql)).toBe(C.MIGRATION_SHA);
    expect(sql).not.toMatch(/SECURITY DEFINER|DISABLE TRIGGER|sian_kaan_reservaciones|ALTER TABLE public\.comandos_idempotentes/i);
    expect(()=>S.validate(original)).not.toThrow();
});
const changes=[
    ['columna eliminada',r=>r.columns.pop()],['columna extra',r=>r.columns.push({...r.columns[0],name:'intruso'})],
    ['tipo incorrecto',r=>r.columns[0].type='bigint'],['NULL cambiado',r=>r.columns[2].notnull=true],['default inyectado',r=>r.columns[6].default='2'],
    ['identidad no protegida',r=>r.columns[0].identity='d'],['campo generado',r=>r.columns[7].generated='s'],
    ['INSERT identity',r=>r.columns[0].insert=true],['UPDATE columna',r=>r.columns[4].update=true],
    ['restriccion eliminada',r=>r.constraints.pop()],['FK incorrecta',r=>r.constraints.find(c=>c.name==='fk_bitacora_comando_021').definition='FOREIGN KEY falsa'],
    ['FK no diferida',r=>r.constraints.find(c=>c.name==='fk_bitacora_comando_021').deferred=false],
    ['CHECK debilitado',r=>r.constraints.find(c=>c.type==='c').definition='CHECK (true)'],['CHECK no validado',r=>r.constraints.find(c=>c.type==='c').validated=false],
    ['indice faltante',r=>r.indexes.pop()],['indice invalido',r=>r.indexes[0].valid=false],['predicado cambiado',r=>r.indexes[1].definition+=' cambiado'],
    ['trigger deshabilitado',r=>r.triggers[0].enabled='D'],['trigger no always',r=>r.triggers[0].enabled='O'],['trigger faltante',r=>r.triggers.pop()],
    ['trigger adelantado',r=>r.triggers[0].deferred=false],['trigger otra funcion',r=>r.triggers[0].function='otra'],
    ['funcion alterada',r=>r.functions[0].definition='RETURN NULL'],['funcion owner',r=>r.functions[0].owner='ctsk_standalone_runtime'],
    ['execute PUBLIC',r=>r.functions[0].public=true],['grant a tercero',r=>r.functions[0].acl.push({grantee:'tercero',type:'EXECUTE',grantable:false})],
    ['owner tabla',r=>r.privileges.owner='ctsk_standalone_runtime'],['DELETE permitido',r=>r.privileges.delete=true],['TRUNCATE permitido',r=>r.privileges.truncate=true],
    ['grant columna PUBLIC',r=>r.privileges.column_acl.push({column:'motivo',grantee:'PUBLIC',type:'INSERT',grantable:false})],
    ['RLS inesperado',r=>r.privileges.rls=true],['regla adicional',r=>r.privileges.rules=true]
];
test.each(changes)('verificador exacto rechaza %s',(_,mutate)=>{const r=structuredClone(original);mutate(r);expect(()=>S.validate(r)).toThrow('AUDIT_SCHEMA_INVALID');});
