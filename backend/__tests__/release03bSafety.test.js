const path=require('node:path'),cp=require('node:child_process');
const L=require('../../scripts/release03bSafety.cjs');
const {config,identity,fakePool}=require('./helpers/release03aFixtures.cjs');
const base=path.join(process.env.LOCALAPPDATA||'C:/invalid','CTSK-Release03B-0123abcd');
const dir=path.join(base,'run-20261018T000000000Z-0123abcd');
const manifest={dir,data:path.join(dir,'data'),host:'127.0.0.1',port:62091,database:'release03b_012345abcdef',admin:'r03b_migrator',owner:'r03b_owner',runtime:'r03b_runtime',systemIdentifier:'9999999999999999999'};
test('nuevo laboratorio exige ruta y cuenta propias',()=>expect(L.validateManifest(manifest)).toBe(manifest));
test.each([3000,5432,55473,57593,57479,57512,57533])('laboratorio rechaza puerto protegido %i',port=>expect(()=>L.validateManifest({...manifest,port})).toThrow('R03B_ISOLATION_REJECTED'));
test.each([{database:'sian_kaan_reservaciones'},{database:'sian_kaan_reservaciones_dev'},{host:'localhost'},{runtime:'postgres'},{owner:'r03b_runtime'},{dir:path.resolve('.access-scope-lab/old')},{systemIdentifier:'7632825987452064788'},{systemIdentifier:'7697790721838933676'}])('rechaza identidad o ruta ajena %j',change=>expect(()=>L.validateManifest({...manifest,...change})).toThrow('R03B_ISOLATION_REJECTED'));
test('contrato principal sigue rechazando un archivo de laboratorio',()=>expect(()=>require('../config/desktopPolicy').validateConfig({...config,APP_ENVIRONMENT:'release03b-lab',DB_PORT:String(manifest.port),DB_NAME:manifest.database,DB_CLUSTER_ID:manifest.systemIdentifier})).toThrow());
test('verificador principal no adopta el puerto de laboratorio desde config',async()=>{
 const {verifyPostgres}=require('../config/desktopPostgres');const pool=fakePool({row:{...identity,port:manifest.port}});
 await expect(verifyPostgres(pool,{...config,DB_PORT:String(manifest.port)})).rejects.toMatchObject({code:'PG_IDENTITY'});
});
test('inyección expresa reutiliza SQL, rol y esquema sin falsear identidad efectiva',async()=>{
 const cfg={...config,DB_NAME:manifest.database,DB_USER:manifest.runtime,DB_CLUSTER_ID:manifest.systemIdentifier};
 const pool=fakePool({row:{...identity,database:manifest.database,username:manifest.runtime,port:manifest.port},cluster:manifest.systemIdentifier});
 await expect(require('../config/desktopPostgres').verifyPostgresWithIdentity(pool,cfg,L.labIdentity(manifest))).resolves.toBeUndefined();
 expect(pool.calls[0]).toBe('BEGIN READ ONLY');expect(pool.calls.at(-1)).toBe('ROLLBACK');
});
test('barrera del harness bloquea los destinos prohibidos antes del socket',()=>{
 const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive'])if(process.env[key]!==undefined)env[key]=process.env[key];
 const code=`const L=require('./scripts/release03bSafety.cjs');const m=${JSON.stringify(manifest)};L.barrier(m);for(const p of [3000,5432,55473,57593]){let blocked=false;try{require('net').connect(p,'127.0.0.1')}catch(e){blocked=e.code==='R03B_NETWORK_BLOCKED'}if(!blocked)process.exit(2)}console.log('R03B_BLOCKED');`;
 const r=cp.spawnSync(process.execPath,['-e',code],{cwd:L.ROOT,env,windowsHide:true,encoding:'utf8',timeout:10000});expect(r.status).toBe(0);expect(r.stdout).toContain('R03B_BLOCKED');
});
