const cp = require('node:child_process'), http = require('node:http'), path = require('node:path');
const { once } = require('node:events');
const { startOwnedBackend } = require('../../electron/ownedBackend');
const { config } = require('./helpers/release03aFixtures.cjs');
const ROOT = path.resolve(__dirname, '../..');
function env() {
    const result={};for(const key of ['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive']) if(process.env[key]!==undefined)result[key]=process.env[key];return result;
}
function launch(port=0) {
    let child,ready;
    const promise=startOwnedBackend({execPath:process.execPath,root:ROOT,configPath:'FICTICIO_SIN_ARCHIVO',sourceEnv:env(),
        loadConfig:()=>({digest:'d'.repeat(64)}),hashCode:()=> 'c'.repeat(64),
        spawnProcess(exe,_args,options) {
            child=cp.spawn(exe,[path.join(__dirname,'helpers/release03aChild.cjs'),String(port)],options);
            child.on('message',message=>{if(message.type==='ready')ready=message;});return child;
        },timeout:10000});
    return {promise,get child(){return child;},get ready(){return ready;}};
}
async function read(port) {
    return new Promise((resolve,reject)=>{const r=http.get({host:'127.0.0.1',port,path:'/',timeout:2000},res=>{let body='';res.on('data',c=>{body+=c;});res.on('end',()=>resolve({status:res.statusCode,body}));});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('timeout')));});
}
test('IPC con proceso Node real, API solo ficticia, cierre propio y liberación de puerto efímero',async()=>{
    const run=launch();let backend;
    try {
        backend=await run.promise;expect(run.ready.pid).toBe(run.child.pid);expect(run.ready.laboratoryPort).toBeGreaterThan(0);expect(run.ready.laboratoryPort).not.toBe(3000);
        expect(await read(run.ready.laboratoryPort)).toEqual({status:200,body:'SOLO_API_FICTICIA_RELEASE_03A'});
        const closed=once(run.child,'exit');backend.stop();await closed;expect(run.child.exitCode).toBe(0);
        await expect(read(run.ready.laboratoryPort)).rejects.toMatchObject({code:'ECONNREFUSED'});
    }finally{if(run.child.exitCode===null){run.child.kill();await once(run.child,'exit');}}
},15000);
test('listener propio con salud idéntica: bind real rechazado, sin solicitudes ni terminación del testigo',async()=>{
    let requests=0;const witness=http.createServer((_req,res)=>{requests++;res.end('API del Sistema Integrador de Reservaciones funcionando');});
    await new Promise(r=>witness.listen(0,'127.0.0.1',r));let run;
    try {
        run=launch(witness.address().port);const exited=once(run.child,'exit');await expect(run.promise).rejects.toMatchObject({code:'PORT_OCCUPIED'});await exited;
        expect(witness.listening).toBe(true);expect(requests).toBe(0);expect(run.child.exitCode).toBe(1);
    }finally{if(run?.child.exitCode===null){run.child.kill();await once(run.child,'exit');}await new Promise(r=>witness.close(r));}
},15000);
test('huella real es estable y no lee configuración privada',()=>{
    const fs=require('node:fs'),original=fs.readFileSync;
    const spy=jest.spyOn(fs,'readFileSync').mockImplementation((filename,...args)=>{
        if(/(?:^|[/\\])(?:\.env|config\.env|secrets|\.access-scope-lab)(?:$|[/\\])/.test(String(filename)))throw Error('SECRET_READ_BLOCKED');
        return original(filename,...args);
    });
    try{const {fingerprint}=require('../config/desktopPolicy');const first=fingerprint(ROOT);expect(first).toMatch(/^[a-f0-9]{64}$/);expect(fingerprint(ROOT)).toBe(first);expect(first).not.toContain(config.DB_PASSWORD);}finally{spy.mockRestore();}
});
