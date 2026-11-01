const fs=require('node:fs'),path=require('node:path'),P=require('../config/commandApiPolicy');
const root=path.resolve(__dirname,'../..'),dir=path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456');
const manifest=()=>({version:4,environment:P.ENVIRONMENT,purpose:P.PURPOSE,protocol:P.PROTOCOL,commandKeyDigest:'f'.repeat(64),etagKeyDigest:'a'.repeat(64),dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,directory:dir,dataDirectory:path.join(dir,'data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'b'.repeat(64),configDigest:'c'.repeat(64)});
const config=m=>({APP_ENVIRONMENT:P.ENVIRONMENT,DB_HOST:'localhost',DB_PORT:String(m.pgPort),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:'d'.repeat(64),DB_CLUSTER_ID:m.cluster,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'020',JWT_SECRET:'e'.repeat(64),JWT_EXPIRES_IN:'8h',GYG_GMAIL_SYNC_ENABLED:'false'});
test('nuevo perfil tiene esquema explícito; lectores previos lo rechazan',()=>{
    const m=manifest(),c=config(m);expect(P.validateManifest(m,root)).toBe(m);expect(P.validateConfig(c,m)).toEqual(c);
    for(const name of ['revisionApiPolicy','revisionLabPolicy','standalonePolicy'])expect(()=>require('../config/'+name).validateManifest(m,root)).toThrow();
    expect(()=>require('../config/desktopPolicy').validateConfig(c)).toThrow();
    expect(require('../config/operationalTransactions').isOperationalLab(c)).toBe(true);
});
test.each([{version:3},{environment:'revision-api-lab'},{purpose:'http-preconditions-lab'},{protocol:'old'},{commandKeyDigest:''},{database:'sian_kaan_reservaciones'},{pgPort:5432},{host:'192.168.0.2'},{cluster:'7632825987452064788'},{extra:'value'}])('rechaza manifiesto incompatible %j',patch=>expect(()=>P.validateManifest({...manifest(),...patch},root)).toThrow());
test.each([{DB_SCHEMA_VERSION:'019'},{APP_ENVIRONMENT:'revision-schema-lab'},{DB_HOST:'192.168.0.2'},{DB_USER:'postgres'},{DB_NAME:'sian_kaan_reservaciones'},{GYG_GMAIL_SYNC_ENABLED:'true'}])('rechaza configuración incompatible %j',patch=>expect(()=>P.validateConfig({...config(manifest()),...patch},manifest())).toThrow());
test('destino principal se rechaza antes de abrir conexiones',async()=>{
    const pool={connect:jest.fn()},m={...manifest(),database:'sian_kaan_reservaciones'};await expect(P.verify(pool,{manifest:m,config:config(m)})).rejects.toThrow();expect(pool.connect).not.toHaveBeenCalled();
});
