'use strict';
const fs=require('node:fs'),path=require('node:path');
const P=require('../config/auditApiPolicy'),B=require('../config/standalonePolicy'),config=require('../config/desktopConfiguration');
const V=require('../validators/auditoria.validator'),op=require('../validators/operaciones.validator'),tr=require('../validators/transportes.validator'),daily=require('../validators/daily.validator');
afterEach(()=>jest.restoreAllMocks());
test.each([
    ['POST','/api/operaciones'],['PATCH','/api/operaciones/123'],['POST','/api/transportes'],['PATCH','/api/transportes/456'],['PUT','/api/daily/observaciones?fecha=2099-01-01']
])('contrato cerrado permite %s %s',(method,url)=>expect(P.command(method,url,{}).url).toBe(url));
test.each([
    ['POST','/api/reservaciones'],['PATCH','/api/reservaciones/1'],['PATCH','/api/usuarios/1'],['POST','/api/tours'],['POST','/api/eventos-integracion/1/aplicar'],['POST','/api/bitacora'],
    ['DELETE','/api/operaciones/1'],['PATCH','/api/operaciones/0'],['PATCH','/api/operaciones/2147483648'],['POST','/api/operaciones/'],['PATCH','/api/operaciones/1?x=1'],
    ['PATCH','/api/transportes/%31'],['PATCH','/api/transportes/../operaciones/1'],['PUT','/api/daily/observaciones?fecha=2099-02-30'],['PUT','/api/daily/observaciones?fecha=2099-01-01&fecha=2099-01-02']
])('contrato rechaza %s %s',(method,url)=>expect(()=>P.command(method,url,{})).toThrow());
test.each([null,'',' ','\u00a0','\ufeff','x'.repeat(501),42,false,{},[]])('motivo humano invalido %j',value=>expect(()=>V.motivo(value)).toThrow());
test('motivo opcional, obligatorio, trim y limite Unicode',()=>{
    expect(V.motivo(undefined)).toBeNull();expect(()=>V.motivo(undefined,true)).toThrow();expect(V.motivo(' Texto ')).toBe('Texto');expect([...V.motivo('😀'.repeat(500))]).toHaveLength(500);
});
test('motivo se separa del payload comercial solo en el perfil nuevo',()=>{
    jest.spyOn(config,'get').mockReturnValue({APP_ENVIRONMENT:'audit-api-lab'});
    const r=V.validate(op.validarDatosActualizacionOperacion,{hora_inicio:'08:00',motivo:'Cambio'});expect(r.errores).toEqual([]);expect(r.camposActualizacion).toEqual({hora_inicio:'08:00:00'});
    expect(V.validate(tr.validarDatosActualizacionTransporte,{motivo:'Solo motivo'},true)).toEqual({errores:[],camposActualizacion:{}});
    expect(V.validate(daily.validarBodyObservacionesDaily,{observaciones:' Nota ',motivo:'Cambio'}).datos).toEqual({observaciones:'Nota'});
    expect(V.validate(op.validarDatosActualizacionOperacion,{hora_inicio:'08:00',id_usuario:123,motivo:'Cambio'}).errores.length).toBeGreaterThan(0);
});
test('perfiles anteriores no aceptan motivo ni actualizaciones vacias por este cambio',()=>{
    jest.spyOn(config,'get').mockReturnValue({APP_ENVIRONMENT:'command-api-lab'});
    expect(V.validate(op.validarDatosActualizacionOperacion,{motivo:'Cambio'},true).errores.length).toBeGreaterThan(0);
    expect(op.validarDatosActualizacionOperacion({}).errores.length).toBeGreaterThan(0);
    expect(tr.validarDatosActualizacionTransporte({}).errores.length).toBeGreaterThan(0);
    expect(V.active()).toBe(false);
});
test('contexto de auditoria ligado al cliente, autorizacion y vida de la transaccion',async()=>{
    let tx;jest.isolateModules(()=>{tx=require('../config/revisionApiTransactions');});
    const raw={processID:123,query:jest.fn(async()=>({rows:[]})),release:jest.fn()},pool={connect:async()=>raw};
    tx.install(pool,{APP_ENVIRONMENT:'audit-api-lab',DB_SCHEMA_VERSION:'021'});
    let escaped;
    await tx.transaction(pool,async db=>{
        escaped=db;expect(()=>tx.auditContext(db)).toThrow();tx.authorizeWrites();
        tx.establishAudit({actor:{id_usuario:1,nombre:'Administrador sintetico',rol:'Administrador',estado:true},generation:'g',key:'k',spec:{resource:'operaciones',body:{motivo:'Humano'}}});
        expect(tx.auditContext(db).actor.id).toBe(1);expect(Object.isFrozen(tx.auditContext(db))).toBe(true);
        expect(()=>tx.auditContext({processID:123,query:raw.query})).toThrow('AUDIT_TRANSACTION_CLIENT_REQUIRED');
    });
    expect(()=>tx.auditContext(escaped)).toThrow();expect(raw.query.mock.calls.filter(c=>c[0]==='COMMIT')).toHaveLength(1);
});
test('perfil de escritura independiente no es aceptado por los perfiles previos',()=>{
    const root=path.resolve(__dirname,'../..'),dir=path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456');
    const m={version:6,environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:'021',dataGeneration:'1a2b3c4d-1234-4567-89ab-123456789abc',root,directory:dir,dataDirectory:path.join(dir,'data'),host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'a'.repeat(64),configDigest:'b'.repeat(64),protocol:P.PROTOCOL,etagKeyDigest:'c'.repeat(64),commandKeyDigest:'d'.repeat(64)};
    expect(P.validateManifest(m,root)).toBe(m);
    for(const name of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy','auditSchemaPolicy'])expect(()=>require('../config/'+name).validateManifest(m,root)).toThrow();
    for(const patch of [{schemaVersion:'020'},{database:'sian_kaan_reservaciones'},{pgPort:5432},{host:'0.0.0.0'},{cluster:B.PROTECTED_CLUSTER},{environment:'audit-schema-lab'}])expect(()=>P.validateManifest({...m,...patch},root)).toThrow();
});
