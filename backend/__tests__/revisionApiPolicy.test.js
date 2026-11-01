const fs=require('node:fs'),path=require('node:path');
const P=require('../config/revisionApiPolicy'),R=require('../config/revisionLabPolicy');
const root=path.resolve(__dirname,'../..'),dir=path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456');
const manifest=()=>({version:3,environment:P.ENVIRONMENT,purpose:P.PURPOSE,protocol:P.PROTOCOL,etagKeyDigest:'a'.repeat(64),dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,directory:dir,dataDirectory:path.join(dir,'data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'b'.repeat(64),configDigest:'c'.repeat(64)});
const config=m=>({APP_ENVIRONMENT:P.ENVIRONMENT,DB_HOST:'localhost',DB_PORT:String(m.pgPort),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:'d'.repeat(64),DB_CLUSTER_ID:m.cluster,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'019',JWT_SECRET:'e'.repeat(64),JWT_EXPIRES_IN:'8h',GYG_GMAIL_SYNC_ENABLED:'false'});
test('perfil API explícito, aislado, sin fallback a schema-tests-only o principal',()=>{
    const m=manifest(),c=config(m);expect(P.validateManifest(m,root)).toBe(m);expect(P.validateConfig(c,m)).toEqual(c);
    expect(()=>R.validateManifest(m,root)).toThrow();expect(()=>require('../config/standalonePolicy').validateManifest(m,root)).toThrow();expect(()=>require('../config/desktopPolicy').validateConfig(c)).toThrow();
});
test.each([{version:2},{environment:R.ENVIRONMENT},{purpose:'schema-tests-only'},{protocol:'unknown'},
    {database:'sian_kaan_reservaciones'},{cluster:'7632825987452064788'},{pgPort:5432},{host:'192.168.1.10'},
    {etagKeyDigest:'not-a-digest'},{dataGeneration:'8000000000000000000'},{unexpected:'value'}])('rechaza manifiesto API inseguro %j',patch=>expect(()=>P.validateManifest({...manifest(),...patch},root)).toThrow());
test.each([{APP_ENVIRONMENT:R.ENVIRONMENT},{DB_SCHEMA_VERSION:'017'},{DB_NAME:'sian_kaan_reservaciones'},{DB_HOST:'192.168.1.10'},
    {DB_PORT:'5432'},{DB_USER:'postgres'},{DB_PASSWORD:'real-not-allowed'},{GYG_GMAIL_SYNC_ENABLED:'true'}])('rechaza configuración API incompatible %j',patch=>{
    const m=manifest();expect(()=>P.validateConfig({...config(m),...patch},m)).toThrow();
});
test('destino principal se rechaza antes de conectar PostgreSQL',async()=>{
    const m={...manifest(),database:'sian_kaan_reservaciones'},pool={connect:jest.fn()};
    await expect(P.verify(pool,{manifest:m,config:config(m)})).rejects.toThrow();expect(pool.connect).not.toHaveBeenCalled();
});
test('un escritor adicional impide construir una API incompleta',()=>{
    const express=require('express'),inner=express.Router(),outer=express.Router();inner.post('/unreviewed',()=>{});outer.use('/api/reservaciones',inner);outer.stack[0].ctskMount='/api/reservaciones';
    expect(()=>require('../security/revisionApiContract').assertCoverage(outer)).toThrow('COVERAGE_INCOMPLETE');
});
