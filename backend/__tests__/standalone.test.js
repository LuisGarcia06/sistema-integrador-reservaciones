const { EventEmitter } = require('node:events');
const path = require('node:path'), fs = require('node:fs');
const P = require('../config/standalonePolicy');
const { startStandalone } = require('../standalone');
const { connectIndependentBackend } = require('../../electron/independentBackend');
const root = path.resolve(__dirname,'../..');
function manifest(change={}) {
    const directory=path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-standalone-abcdef123456');
    return {version:1,environment:'standalone-development',root,directory,dataDirectory:path.join(directory,'data'),
        host:'127.0.0.1',pgPort:49151,httpPort:49152,database:'ctsk_standalone_abcdef123456_test',
        runtime:'ctsk_standalone_runtime',cluster:'8000000000000000000',code:'a'.repeat(64),configDigest:'b'.repeat(64),...change};
}
function config(m=manifest(),change={}) {return {APP_ENVIRONMENT:m.environment,DB_HOST:'localhost',DB_PORT:String(m.pgPort),
    DB_NAME:m.database,DB_USER:m.runtime,DB_CLUSTER_ID:m.cluster,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'017',
    DB_PASSWORD:'synthetic-only',JWT_SECRET:'c'.repeat(64),GYG_GMAIL_SYNC_ENABLED:'false',...change};}
function plan() {const m=manifest();return {manifest:m,config:config(m),key:'d'.repeat(64),digest:'e'.repeat(64),filename:'synthetic-only'};}
describe('contrato aislado antes de PostgreSQL',()=>{
    test('acepta únicamente perfil explícito y credenciales con política heredada',()=>{
        const m=manifest();expect(P.validateManifest(m,root)).toBe(m);expect(P.validateConfig(config(m),m)).toEqual(config(m));
    });
    test.each([
        {database:'sian_kaan_reservaciones'},{database:'sian_kaan_reservaciones_dev'},{pgPort:5432},{httpPort:3000},
        {httpPort:3443},{pgPort:55473},{pgPort:49152},{cluster:P.PROTECTED_CLUSTER},{host:'0.0.0.0'},
        {directory:root},{dataDirectory:root},{environment:'principal'},{root:'otra-version'},{runtime:'postgres'}
    ])('rechaza destino protegido/ambiguo %j',change=>expect(()=>P.validateManifest(manifest(change),root)).toThrow());
    test.each([{DB_NAME:'sian_kaan_reservaciones'},{DB_PORT:'5432'},{DB_USER:'postgres'},{APP_ENVIRONMENT:'principal'},
        {GYG_GMAIL_SYNC_ENABLED:'true'},{JWT_SECRET:'short'},{DB_PASSWORD:''},{DB_SERVER_VERSION:'18.4'},{JWT_EXPIRES_IN:'99h'}
    ])('no convierte un perfil inseguro en autorización %j',change=>expect(()=>P.validateConfig(config(manifest(),change),manifest())).toThrow());
    test('identidad efectiva exige dirección, base, puerto, usuario, versión y permiso de clúster',()=>{
        const m=manifest(),c=config(m),row={database:m.database,username:m.runtime,port:m.pgPort,address:P.HOST,schema:'public',version:'180003',cluster_allowed:true};
        expect(()=>P.validateIdentity(row,c,m)).not.toThrow();
        for(const change of [{database:'sian_kaan_reservaciones'},{port:5432},{username:'postgres'},{address:'::1'},{version:'180004'},{schema:'otro'},{cluster_allowed:false}])
            expect(()=>P.validateIdentity({...row,...change},c,m)).toThrow();
    });
});
function harness(change={}) {
    const p=plan(),server=new EventEmitter();let handler;
    server.listen=jest.fn((_options,cb)=>setImmediate(cb));server.close=jest.fn(cb=>cb());server.closeAllConnections=jest.fn();
    const pool={query:jest.fn(async()=>({rows:[]})),end:jest.fn(async()=>{})};
    const getApp=jest.fn(()=>jest.fn()),verify=jest.fn(async()=>{}),verifyLocalCluster=jest.fn();
    const options={readPlan:()=>p,verifyLocalCluster,isolate:jest.fn(),initialize:jest.fn(),getPool:()=>pool,verify,getApp,
        createServer:fn=>{handler=fn;return server;},exit:jest.fn(),timeout:1000,...change};
    return {p,server,pool,getApp,verify,verifyLocalCluster,start:()=>startStandalone(p,options),call(req){
        const res={setHeader:jest.fn(),writeHead:jest.fn(),end:jest.fn()};handler(req,res);return res;
    }};
}
describe('servidor independiente: verificaciones antes de montar Express',()=>{
    test('bind loopback exclusivo; verificación heredada y 018; cierre idempotente',async()=>{
        const h=harness(),s=await h.start();
        expect(h.server.listen.mock.calls[0][0]).toEqual({host:'127.0.0.1',port:49152,exclusive:true});
        expect(h.verifyLocalCluster).toHaveBeenCalledWith(h.p.manifest);expect(h.verify).toHaveBeenCalledWith(h.pool,h.p.config);
        expect(h.pool.query).toHaveBeenCalledTimes(2);expect(h.getApp).toHaveBeenCalledTimes(1);
        const nonce='f'.repeat(64),r=h.call({method:'GET',headers:{host:'127.0.0.1:49152'},url:'/api/local-service/challenge?nonce='+nonce});
        P.verifyProof(h.p.key,nonce,JSON.parse(r.end.mock.calls[0][0]),P.publicIdentity(h.p,0));
        expect(h.call({headers:{host:'evil'},url:'/'}).writeHead).toHaveBeenCalledWith(403);
        expect(h.call({headers:{host:'127.0.0.1:49152'},url:'http://['}).writeHead).toHaveBeenCalledWith(400);
        expect(h.call({headers:{host:'127.0.0.1:49152'},url:'/api/integraciones'}).writeHead.mock.calls[0][0]).toBe(503);
        await Promise.all([s.close(),s.close()]);expect(h.pool.end).toHaveBeenCalledTimes(1);
    });
    test('puerto ocupado no verifica ni abre PostgreSQL',async()=>{
        const h=harness();h.server.listen.mockImplementation(()=>setImmediate(()=>h.server.emit('error',{code:'EADDRINUSE'})));
        await expect(h.start()).rejects.toMatchObject({code:'EADDRINUSE'});expect(h.verifyLocalCluster).not.toHaveBeenCalled();expect(h.verify).not.toHaveBeenCalled();
    });
    test.each(['PG_IDENTITY','PG_CLUSTER','PG_ROLE','SCHEMA_INVALID'])('%s no monta aplicación',async code=>{
        const h=harness({verify:async()=>{throw Object.assign(Error(code),{code});}});
        await expect(h.start()).rejects.toMatchObject({code});expect(h.getApp).not.toHaveBeenCalled();expect(h.pool.end).toHaveBeenCalled();
    });
    test('sin prueba local del clúster no llega al pool',async()=>{
        const getPool=jest.fn(),h=harness({verifyLocalCluster:()=>{throw Error('not isolated');},getPool});
        await expect(h.start()).rejects.toThrow();expect(getPool).not.toHaveBeenCalled();
    });
    test('cambio de manifiesto/configuración antes de ready aborta',async()=>{
        const h=harness({readPlan:()=>({...plan(),digest:'alterado'})});
        await expect(h.start()).rejects.toMatchObject({code:'CONFIG_CHANGED'});expect(h.getApp).not.toHaveBeenCalled();
    });
    test('018 ausente no monta aplicación',async()=>{
        const h=harness();h.pool.query.mockRejectedValue(Error('column missing'));
        await expect(h.start()).rejects.toThrow();expect(h.getApp).not.toHaveBeenCalled();
    });
    test('durante verificación responde 503 y no ofrece prueba de identidad',async()=>{
        let finish;const h=harness({verify:()=>new Promise(r=>{finish=r;})}),pending=h.start();
        await new Promise(setImmediate);expect(h.call({headers:{},url:'/'}).writeHead).toHaveBeenCalledWith(503);
        finish();const s=await pending;await s.close();
    });
});
describe('Electron cliente no posee el proceso servidor',()=>{
    test('verifica HMAC con nonce aleatorio; cerrar cliente solo detiene vigilancia',async()=>{
        const p=plan(),request=jest.fn(async(_plan,nonce)=>{const identity=P.publicIdentity(p,123);return {identity,proof:P.proof(p.key,nonce,identity)};});
        const c=await connectIndependentBackend({manifestPath:'fake',root,loadPlan:()=>p,request});
        expect(c.origin).toBe('http://127.0.0.1:49152');expect(c.process).toBeUndefined();c.stop();expect(request).toHaveBeenCalledTimes(1);
    });
    test.each(['wrong-key','wrong-code','replay','wrong-pid'])('rechaza %s aunque HTTP responda 200',async kind=>{
        const p=plan(),request=async(_plan,nonce)=>{
            const identity=P.publicIdentity(p,kind==='wrong-pid'?0:123);if(kind==='wrong-code')identity.code='0'.repeat(64);
            return {identity,proof:P.proof(kind==='wrong-key'?'otro':p.key,kind==='replay'?'otra-solicitud':nonce,identity)};
        };
        await expect(connectIndependentBackend({manifestPath:'fake',root,loadPlan:()=>p,request})).rejects.toThrow();
    });
    test('pérdida o reemplazo del servidor cierra consumidor, sin terminar servidor',async()=>{
        jest.useFakeTimers();const p=plan(),onExit=jest.fn();let calls=0;
        try{
            const c=await connectIndependentBackend({manifestPath:'fake',root,loadPlan:()=>p,onExit,interval:10,
                request:async(_plan,nonce)=>{const identity=P.publicIdentity(p,++calls===1?123:999);return {identity,proof:P.proof(p.key,nonce,identity)};}});
            await jest.advanceTimersByTimeAsync(10);expect(onExit).toHaveBeenCalledTimes(1);c.stop();
        }finally{jest.useRealTimers();}
    });
});
