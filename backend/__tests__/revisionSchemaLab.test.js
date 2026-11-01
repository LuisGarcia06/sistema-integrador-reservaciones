const path=require('node:path'),fs=require('node:fs');
const RP=require('../config/revisionLabPolicy'),P=require('../config/standalonePolicy');
const C=require('../config/revisionSchemaContract'),S=require('../config/revisionSchema');
const root=path.resolve(__dirname,'../..');
const manifest=()=>({version:2,environment:RP.ENVIRONMENT,purpose:RP.PURPOSE,dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,
    directory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456'),
    dataDirectory:path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456','data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,
    database:'ctsk_standalone_abcdef123456_test',runtime:C.RUNTIME,cluster:'8000000000000000000',code:'a'.repeat(64),configDigest:'b'.repeat(64)});
const config=m=>({APP_ENVIRONMENT:RP.ENVIRONMENT,DB_HOST:'localhost',DB_PORT:String(m.pgPort),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:'a'.repeat(64),DB_CLUSTER_ID:m.cluster,
    DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'019',JWT_SECRET:'b'.repeat(64),JWT_EXPIRES_IN:'8h',GYG_GMAIL_SYNC_ENABLED:'false'});
function metadata(){
    return {replication_set:false,tables:Object.keys(C.TABLES).map(table=>({table,owner:C.OWNER,insert:false,update:false,delete:false,truncate:false,trigger:false,references:false,kind:'r',rules:false,rls:false})),
        columns:Object.entries(C.TABLES).flatMap(([table,cols])=>[...cols.map((name,i)=>({table,name,select:true,insert:i>0,update:i>0})),{table,name:'revision',type:'bigint',notnull:true,default:'1',identity:'',generated:'',select:true,insert:false,update:false}]),
        checks:Object.keys(C.TABLES).map(table=>({table,name:`chk_${table}_revision_019`,type:'c',validated:true,deferrable:false,definition:'CHECK ((revision > 0))'})),
        triggers:Object.keys(C.TABLES).map(table=>({table,name:C.TRIGGER,enabled:'A',type:23,arguments:0,when:false,constraint:'0',function:C.FUNCTION,schema:'public',columns:'',oldTable:null,newTable:null})),
        functions:[{body:C.BODY,owner:C.OWNER,definer:false,language:'plpgsql',arguments:0,kind:'f',return:'trigger',volatile:'v',config:['search_path=pg_catalog'],execute:true,publicExecute:false}]};
}
test('perfil explícito 019 separado de modalidades anteriores y sin falsificar esquema',()=>{
    const m=manifest(),c=config(m);expect(RP.validateManifest(m,root)).toBe(m);expect(RP.validateConfig(c,m)).toEqual(c);
    expect(()=>P.validateManifest(m,root)).toThrow();expect(()=>require('../config/desktopPolicy').validateConfig(c)).toThrow();
    expect(require('../config/operationalTransactions').isOperationalLab(c)).toBe(true);
    expect(()=>require('../config/operationalTransactions').isOperationalLab({...c,DB_SCHEMA_VERSION:'017'})).toThrow('OPERATIONAL_LAB_CONFIG');
    expect(require('../config/operationalTransactions').isOperationalLab({APP_ENVIRONMENT:'principal'})).toBe(false);
});
test.each([{version:1},{environment:'standalone-development'},{purpose:'operational'},{dataGeneration:'8000000000000000000'},
    {database:'sian_kaan_reservaciones'},{pgPort:5432},{host:'192.168.1.2'},{cluster:P.PROTECTED_CLUSTER},{runtime:'postgres'},{unexpected:true}])('rechaza manifiesto inseguro %j',patch=>expect(()=>RP.validateManifest({...manifest(),...patch},root)).toThrow());
test.each([{DB_SCHEMA_VERSION:'017'},{APP_ENVIRONMENT:'principal'},{DB_HOST:'192.168.1.2'},{DB_PORT:'5432'},{DB_USER:'postgres'},
    {DB_NAME:'sian_kaan_reservaciones'},{DB_CLUSTER_ID:P.PROTECTED_CLUSTER},{DB_SERVER_VERSION:'18.4'},{DB_PASSWORD:'x'},
    {JWT_SECRET:'short'},{GYG_GMAIL_SYNC_ENABLED:'true'},{JWT_EXPIRES_IN:'24h'},{INTEGRATION_DASHBOARD_CUTOFF_AT:'2099-01-01T00:00:00Z'}])('rechaza configuración incompatible %j',patch=>{
    const m=manifest();expect(()=>RP.validateConfig({...config(m),...patch},m)).toThrow('REVISION_LAB_CONFIG');
});
test('migración identificada coincide con el contrato y conserva esquema base separado',()=>{
    expect(fs.readFileSync(path.join(root,'database/migrations/019_revisiones_registros_lab.sql'),'utf8').replace(/\r\n/g,'\n')).toBe(C.MIGRATION_SQL);
    expect(C.MIGRATION_SQL).not.toMatch(/sian_kaan_reservaciones|DISABLE TRIGGER|SECURITY DEFINER/i);
    expect((C.MIGRATION_SQL.match(/ADD COLUMN revision BIGINT NOT NULL DEFAULT 1/g)||[])).toHaveLength(3);
    for(const columns of Object.values(C.TABLES))expect(columns).not.toContain('revision');
});
test('verificador acepta únicamente los metadatos y permisos completos esperados',()=>expect(()=>S.validateSchema(metadata())).not.toThrow());
const changes=[
    ['missing revision',r=>r.columns=r.columns.filter(c=>c.name!=='revision')],['wrong type',r=>r.columns.find(c=>c.name==='revision').type='integer'],
    ['nullable',r=>r.columns.find(c=>c.name==='revision').notnull=false],['wrong default',r=>r.columns.find(c=>c.name==='revision').default='2'],
    ['generated',r=>r.columns.find(c=>c.name==='revision').generated='s'],['missing check',r=>r.checks.pop()],['unvalidated check',r=>r.checks[0].validated=false],
    ['weakened check',r=>r.checks[0].definition='CHECK ((revision >= 0))'],['missing trigger',r=>r.triggers.pop()],['disabled trigger',r=>r.triggers[0].enabled='D'],
    ['ordinary trigger',r=>r.triggers[0].enabled='O'],['after trigger',r=>r.triggers[0].type=21],['trigger WHEN',r=>r.triggers[0].when=true],
    ['wrong function schema',r=>r.triggers[0].schema='other'],['UPDATE OF bypass',r=>r.triggers[0].columns='2'],['rewrite rule',r=>r.tables[0].rules=true],
    ['additional trigger',r=>r.triggers.push({...r.triggers[0],name:'bypass'})],
    ['missing function',r=>r.functions=[]],['changed body',r=>r.functions[0].body='BEGIN RETURN NEW; END;'],['definer',r=>r.functions[0].definer=true],
    ['wrong search path',r=>r.functions[0].config=['search_path=public']],['wrong owner',r=>r.functions[0].owner=C.RUNTIME],
    ['table INSERT',r=>r.tables[0].insert=true],['table UPDATE',r=>r.tables[0].update=true],['DELETE',r=>r.tables[0].delete=true],
    ['TRUNCATE',r=>r.tables[0].truncate=true],['TRIGGER privilege',r=>r.tables[0].trigger=true],['column revision grant',r=>r.columns.find(c=>c.name==='revision').update=true],
    ['PK grant',r=>r.columns[0].update=true],['replication role',r=>r.replication_set=true],['PUBLIC function execution',r=>r.functions[0].publicExecute=true]
];
test.each(changes)('fail closed: %s',(_name,change)=>{const r=metadata();change(r);expect(()=>S.validateSchema(r)).toThrow('REVISION_SCHEMA_INVALID');});
test('verificador no ejecuta DDL, DML ni el cuerpo de funciones inspeccionadas',async()=>{
    const db={query:jest.fn(async()=>({rows:[metadata()]}))};await S.verifySchema(db);expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[0][0]).toBe(S.SQL);expect(S.SQL).toMatch(/^SELECT/);
});
test('019 también rechaza dependencias 018 ausentes sin fallback',async()=>{
    const db={query:jest.fn().mockResolvedValueOnce({rows:[metadata()]}).mockRejectedValueOnce(Object.assign(Error('missing'),{code:'42703'}))};
    await expect(S.verifySchema(db)).rejects.toMatchObject({code:'REVISION_SCHEMA_INVALID'});
});
test.each(['manifest','purpose','config','version'])('bloqueo API antes de crear socket o conectar PG: %s',async kind=>{
    const m=manifest(),c=config(m),plan={manifest:{environment:'standalone-development'},config:{}};
    if(kind==='manifest')plan.manifest.environment=m.environment;if(kind==='purpose')plan.manifest.purpose=m.purpose;
    if(kind==='config')plan.config.APP_ENVIRONMENT=c.APP_ENVIRONMENT;if(kind==='version')plan.config.DB_SCHEMA_VERSION='019';
    const createServer=jest.fn(),getPool=jest.fn(),getApp=jest.fn();
    await expect(require('../standalone').startStandalone(plan,{createServer,getPool,getApp})).rejects.toMatchObject({code:'SCHEMA_LAB_NOT_OPERATIONAL'});
    expect(createServer).not.toHaveBeenCalled();expect(getPool).not.toHaveBeenCalled();expect(getApp).not.toHaveBeenCalled();
});
