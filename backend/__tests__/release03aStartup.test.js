const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startOwnedBackend } = require('../../electron/ownedBackend');
const { runChild } = require('../desktopChild');
const { PROTOCOL, MESSAGES } = require('../config/desktopPolicy');
const { config } = require('./helpers/release03aFixtures.cjs');
const code = 'c'.repeat(64), digest = 'd'.repeat(64), nonce = 'a'.repeat(64);
const ROOT = path.resolve(__dirname, '../..');
function child() {
    const c = new EventEmitter(); Object.assign(c, {pid:123,connected:true,killed:false,exitCode:null});
    c.kill=jest.fn(()=>{c.killed=true;c.exitCode=1;c.emit('exit',1);});
    c.send=jest.fn((m,cb)=>{if(cb)cb();});return c;
}
function launch(c, message = {}, extra = {}) {
    c.send.mockImplementation((boot,cb)=>{
        cb?.(); if(boot.type==='boot') setImmediate(()=>c.emit('message',{type:'ready',protocol:PROTOCOL,nonce:boot.nonce,pid:c.pid,
            code,configDigest:digest,port:3000,environment:'principal',...message}));
        if(boot.type==='stop')setImmediate(()=>{c.exitCode=0;c.emit('exit',0);});
    });
    return startOwnedBackend({execPath:'electron-ficticio',root:ROOT,configPath:'ficticio',sourceEnv:{},
        loadConfig:()=>({digest}),hashCode:()=>code,spawnProcess:()=>c,timeout:100,...extra});
}
describe('RELEASE-03A padre e identidad privada; no se usa salud HTTP',()=>{
    test('acepta solo hijo propio con todos los campos; secretos fuera de argv/env/IPC',async()=>{
        const c=child(),spawnProcess=jest.fn(()=>c);const result=await launch(c,{}, {spawnProcess});
        expect(result.process).toBe(c);expect(spawnProcess.mock.calls[0][2]).toMatchObject({stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
        const transcript=JSON.stringify([...spawnProcess.mock.calls,...c.send.mock.calls]);expect(transcript).not.toContain(config.DB_PASSWORD);expect(transcript).not.toContain(config.JWT_SECRET);
        result.stop();await new Promise(setImmediate);expect(c.exitCode).toBe(0);expect(c.kill).not.toHaveBeenCalled();
    });
    test.each([{pid:999},{nonce:'otro'},{protocol:'viejo'},{code:'otro'},{configDigest:'otro'},{port:55473},{environment:'dev'},{type:'health',statusCode:200}])('rechaza identidad inválida %j',async message=>{
        const c=child();await expect(launch(c,message)).rejects.toMatchObject({code:'IPC_INVALID'});await new Promise(setImmediate);expect(c.exitCode).toBe(0);
    });
    test('salida inesperada tras ready cierra el consumidor',async()=>{
        const c=child(),onExit=jest.fn();await launch(c,{}, {onExit});c.exitCode=1;c.emit('exit',1);expect(onExit).toHaveBeenCalledTimes(1);
    });
    test('salida antes de ready aborta',async()=>{
        const c=child();c.send.mockImplementation(()=>{});const promise=startOwnedBackend({execPath:'fake',root:ROOT,configPath:'fake',sourceEnv:{},loadConfig:()=>({digest}),hashCode:()=>code,spawnProcess:()=>c});
        c.exitCode=1;c.emit('exit',1);await expect(promise).rejects.toMatchObject({code:'CHILD_EXIT'});
    });
    test('cancelación durante inicio limpia únicamente hijo creado',async()=>{
        const c=child(),controller=new AbortController();c.send.mockImplementation((m,cb)=>{cb?.();if(m.type==='stop'){c.exitCode=0;c.emit('exit',0);}});
        const p=startOwnedBackend({execPath:'fake',root:ROOT,configPath:'fake',sourceEnv:{},loadConfig:()=>({digest}),hashCode:()=>code,spawnProcess:()=>c,signal:controller.signal});
        controller.abort();await expect(p).rejects.toMatchObject({code:'START_CANCELLED'});expect(c.send.mock.calls.at(-1)[0].type).toBe('stop');
    });
    test('timeout no abre UI y termina el hijo que no coopera',async()=>{
        jest.useFakeTimers();const c=child();
        try {
            const p=startOwnedBackend({execPath:'fake',root:ROOT,configPath:'fake',sourceEnv:{},loadConfig:()=>({digest}),hashCode:()=>code,spawnProcess:()=>c,timeout:10});
            const check=expect(p).rejects.toMatchObject({code:'START_TIMEOUT'});jest.advanceTimersByTime(10);await check;jest.advanceTimersByTime(2000);expect(c.kill).toHaveBeenCalledTimes(1);
        }finally{jest.useRealTimers();}
    });
    test('error privado desconocido queda saneado',async()=>{
        const c=child();await expect(launch(c,{type:'error',code:config.DB_PASSWORD})).rejects.toMatchObject({code:'START_FAILED',message:MESSAGES.START_FAILED});await new Promise(setImmediate);
    });
    test('huella que cambia entre inicio y aceptación detiene el arranque',async()=>{
        const c=child();let n=0;await expect(launch(c,{}, {hashCode:()=>n++?'otro':code})).rejects.toMatchObject({code:'CODE_CHANGED'});await new Promise(setImmediate);
    });
});

function fakeTransport() {
    const t=new EventEmitter();Object.assign(t,{pid:123,ppid:456,connected:true,send:jest.fn((m,cb)=>cb?.()),exit:jest.fn()});return t;
}
function boot(t) {t.emit('message',{type:'boot',protocol:PROTOCOL,nonce,parentPid:456,code,configDigest:digest,configPath:'falso'});}
function childHarness(extra={}) {
    const transport=fakeTransport(), server=new EventEmitter();server.listen=jest.fn((_opts,cb)=>setImmediate(cb));server.close=jest.fn(cb=>cb());server.closeAllConnections=jest.fn();
    const pool={end:jest.fn(async()=>{})},verify=jest.fn(async()=>{}),getApp=jest.fn(()=>jest.fn()),loadConfig=jest.fn(()=>({config,digest}));
    const result=runChild({transport,createServer:()=>server,loadConfig,hashCode:()=>code,initialize:jest.fn(),getPool:()=>pool,
        verify,getApp,isolate:jest.fn(),...extra});
    return {transport,server,pool,verify,getApp,loadConfig,...result};
}
const flush=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};
describe('RELEASE-03A hijo: bind exclusivo retenido, verificación antes de servir',()=>{
    test('puerto 3000 libre: bind único; PG y código antes de ready',async()=>{
        const h=childHarness();boot(h.transport);await flush();expect(h.server.listen).toHaveBeenCalledTimes(1);expect(h.server.listen.mock.calls[0][0]).toEqual({host:'127.0.0.1',port:3000,exclusive:true});
        expect(h.verify).toHaveBeenCalledWith(h.pool,config);expect(h.transport.send.mock.calls[0][0]).toMatchObject({type:'ready',pid:123,nonce,port:3000});await h.close();expect(h.pool.end).toHaveBeenCalled();
    });
    test.each(['desconocido','salud HTTP 200 idéntica','backend DEV','laboratorio'])('ocupado por %s: no consulta HTTP/PG ni lo termina',async()=>{
        const h=childHarness();h.server.listen.mockImplementation(()=>setImmediate(()=>h.server.emit('error',{code:'EADDRINUSE'})));boot(h.transport);await flush();
        expect(h.verify).not.toHaveBeenCalled();expect(h.loadConfig).not.toHaveBeenCalled();expect(h.transport.send.mock.calls[0][0]).toMatchObject({type:'error',code:'PORT_OCCUPIED'});expect(h.transport.exit).toHaveBeenCalledWith(1);
    });
    test('017 inválida impide montar Express; error no muestra mensajes originales',async()=>{
        const h=childHarness({verify:async()=>{throw Object.assign(Error(config.DB_PASSWORD),{code:'SCHEMA_INVALID'});}});boot(h.transport);await flush();expect(h.getApp).not.toHaveBeenCalled();expect(JSON.stringify(h.transport.send.mock.calls)).not.toContain(config.DB_PASSWORD);expect(h.transport.exit).toHaveBeenCalledWith(1);
    });
    test('cambio de configuración bloquea antes de PG',async()=>{
        const h=childHarness({loadConfig:()=>({config,digest:'otro'})});boot(h.transport);await flush();expect(h.verify).not.toHaveBeenCalled();expect(h.transport.send.mock.calls[0][0].code).toBe('CONFIG_CHANGED');
    });
    test('código incompatible bloquea antes de PG',async()=>{
        const h=childHarness({hashCode:()=> 'viejo'});boot(h.transport);await flush();expect(h.verify).not.toHaveBeenCalled();expect(h.transport.send.mock.calls[0][0].code).toBe('CODE_CHANGED');
    });
    test('desconexión del padre cierra listener y pool propios',async()=>{
        const h=childHarness();boot(h.transport);await flush();h.transport.emit('disconnect');await flush();expect(h.server.close).toHaveBeenCalled();expect(h.pool.end).toHaveBeenCalled();expect(h.transport.exit).toHaveBeenCalledWith(0);
    });
    test('boot de otro padre no llega a escuchar',async()=>{
        const h=childHarness();h.transport.emit('message',{type:'boot',protocol:PROTOCOL,nonce,parentPid:999});await flush();expect(h.server.listen).not.toHaveBeenCalled();expect(h.verify).not.toHaveBeenCalled();expect(h.transport.exit).toHaveBeenCalledWith(1);
    });
});

async function runElectron(start, {env={},argv=['electron','.'],lock=true}={}) {
    const windows=[],app=new EventEmitter();Object.assign(app,{isPackaged:false,requestSingleInstanceLock:()=>lock,quit:jest.fn(),whenReady:()=>Promise.resolve(),getPath:()=> 'falso'});
    class Window extends EventEmitter {
        constructor(){super();windows.push(this);this.webContents={setWindowOpenHandler:jest.fn(),on:jest.fn(),session:{webRequest:{onBeforeRequest:jest.fn()},setPermissionRequestHandler:jest.fn(),setPermissionCheckHandler:jest.fn()}};this.loadURL=jest.fn();this.destroy=jest.fn();}
        setMenuBarVisibility(){} maximize(){} static getAllWindows(){return windows;}
    }
    const dialog={showErrorBox:jest.fn()},http={get:jest.fn()};
    vm.runInNewContext(fs.readFileSync(path.join(ROOT,'electron/main.js'),'utf8'),{
        require:name=>name==='electron'?{app,BrowserWindow:Window,dialog,ipcMain:{handle:jest.fn()}}:name==='http'?http:name==='./ownedBackend'?{startOwnedBackend:start}:require(name),
        process:{env,argv,execPath:'electron'},__dirname:path.join(ROOT,'electron'),console:{error:jest.fn()},URL,AbortController,Buffer,setTimeout,clearTimeout
    });await flush();return {app,windows,http,dialog};
}
describe('RELEASE-03A integración del main real mediante Electron simulado',()=>{
    test('no abre ni consulta salud antes de IPC; después abre URL original',async()=>{
        let resolve;const promise=new Promise(r=>{resolve=r;});const start=jest.fn(()=>promise);const h=await runElectron(start);expect(h.windows).toHaveLength(0);expect(h.http.get).not.toHaveBeenCalled();resolve({process:child(),stop:jest.fn()});await flush();expect(h.windows[0].loadURL).toHaveBeenCalledWith('http://127.0.0.1:3000/app/');
    });
    test('ocupado: mensaje claro, cero ventanas, cero HTTP',async()=>{
        const h=await runElectron(async()=>{throw Object.assign(Error(config.DB_PASSWORD),{code:'PORT_OCCUPIED'});});expect(h.windows).toHaveLength(0);expect(h.http.get).not.toHaveBeenCalled();expect(h.app.quit).toHaveBeenCalled();expect(h.dialog.showErrorBox.mock.calls[0][1]).toBe(MESSAGES.PORT_OCCUPIED);
    });
    test('cierre normal de Electron solo detiene backend propio',async()=>{
        const stop=jest.fn();const h=await runElectron(async()=>({process:child(),stop}));h.app.emit('before-quit');expect(stop).toHaveBeenCalledTimes(1);
    });
    test('caída del backend destruye ventana y evita recrearla',async()=>{
        let options;const h=await runElectron(async opts=>{options=opts;return {process:child(),stop:jest.fn()};});options.onExit();h.app.emit('activate');expect(h.windows).toHaveLength(1);expect(h.windows[0].destroy).toHaveBeenCalled();expect(h.app.quit).toHaveBeenCalled();
    });
    test.each([{APP_DEV_DB02:'1'},{APP_PRINCIPAL_TEST:'1'}])('variable de modo heredada no inicia pruebas %j',async env=>{
        const start=jest.fn();const h=await runElectron(start,{env});expect(start).not.toHaveBeenCalled();expect(h.windows).toHaveLength(0);expect(h.dialog.showErrorBox.mock.calls[0][1]).toBe(MESSAGES.ENV_CONFLICT);
    });
    test('segunda instancia no inicia hijos ni abre ventanas',async()=>{
        const start=jest.fn();const h=await runElectron(start,{lock:false});expect(start).not.toHaveBeenCalled();expect(h.windows).toHaveLength(0);
    });
});
