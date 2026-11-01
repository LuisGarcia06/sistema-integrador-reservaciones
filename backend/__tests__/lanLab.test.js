const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const C=require('../../shared/lanContract'),identity=require('../../shared/serverIdentity');
const B=require('../../electron/httpsBackend'),clientPolicy=require('../../electron/lanClientPolicy');
const {startStandalone}=require('../standalone');
jest.mock('../../shared/windowsConfigAcl',()=>({checkAcl:jest.fn()}));
jest.mock('../config/windowsConfigAcl',()=>({checkAcl:jest.fn()}));
const root=path.resolve(__dirname,'../..');
const snapshot=(address,machine='a')=>({machine:machine.repeat(64),adapter:crypto.randomUUID(),address,prefix:24,category:'Private',gateways:[],dns:[],activeAdapters:1});
const topology=()=>({version:1,networkId:crypto.randomUUID(),topology:'internal-vm-network',isolatedNetworkConfirmed:true,approvedBy:'Synthetic test only',expiresAt:new Date(Date.now()+86400000).toISOString(),server:snapshot('192.168.250.10'),client:snapshot('192.168.250.11','b')});
const endpoint=()=>({version:1,environment:C.ENVIRONMENT,protocol:2,serverId:crypto.randomUUID(),origin:'https://192.168.250.10:49152',address:'192.168.250.10',port:49152,name:'server.ctsk-lab.test',code:'c'.repeat(64),clientCode:'d'.repeat(64),caDigest:'e'.repeat(64),publicKeyDigest:'f'.repeat(64),tlsSpki:'1'.repeat(64),network:topology()});
test.each(['127.0.0.1','0.0.0.0','::1','::ffff:192.168.250.10','8.8.8.8','169.254.1.1','224.0.0.1','192.168.250.0','192.168.250.255','192.168.025.10','172.32.1.1','10.999.0.1'])('rechaza IP no autorizable %s',ip=>expect(C.privateAddress(ip)).toBe(false));
test.each(['10.20.0.1','172.16.1.2','172.31.1.2','192.168.250.10'])('acepta RFC1918 canónica %s',ip=>expect(C.privateAddress(ip)).toBe(true));
test('contrato exige dos máquinas y aprobación física vigente, además de IP privada',()=>{
    const t=topology();expect(C.validateTopology(t)).toBe(t);
    for(const patch of [{isolatedNetworkConfirmed:false},{approvedBy:''},{expiresAt:'2020-01-01'},{expiresAt:new Date(Date.now()+8*86400000).toISOString()},{topology:'operative-wifi'}])expect(()=>C.validateTopology({...t,...patch})).toThrow();
    expect(()=>C.validateTopology({...t,client:{...t.client,machine:t.server.machine}})).toThrow();
    expect(()=>C.validateTopology({...t,client:{...t.client,address:'192.168.251.11'}})).toThrow();
});
test.each([{gateways:['192.168.250.1']},{dns:['8.8.8.8']},{prefix:16},{category:'Public'},{activeAdapters:2},{address:'127.0.0.1'}])('red ambigua se rechaza %j',patch=>expect(()=>C.validateSnapshot({...snapshot('192.168.250.10'),...patch})).toThrow());
test('inventario local debe coincidir con rol, máquina, interfaz y dirección aprobados',()=>{
    const t=topology();expect(C.verifyLocal(t,'client',t.client)).toBe(t.client);
    expect(()=>C.verifyLocal(t,'server',t.client)).toThrow();
    expect(()=>C.verifyLocal(t,'server',{...t.server,adapter:crypto.randomUUID()})).toThrow();
});
test.each([{origin:'http://192.168.250.10:49152'},{origin:'https://otro.test:49152'},{port:5432},{address:'0.0.0.0'},{name:'production.example.com'},{protocol:1},{environment:'https-loopback-lab'},{clientCode:'unknown'}])('endpoint no se degrada %j',patch=>expect(()=>C.validateEndpoint({...endpoint(),...patch})).toThrow());
test('configuración pública usa lista cerrada de campos',()=>{
    const c=endpoint();expect(()=>C.exactKeys(c,clientPolicy.KEYS)).not.toThrow();
    for(const key of ['DB_PASSWORD','privateKey','serviceKey','JWT_SECRET'])expect(()=>C.exactKeys({...c,[key]:'secret'},clientPolicy.KEYS)).toThrow();
});
function req(c,url='/api/reservaciones'){return {url,headers:{host:`${c.address}:${c.port}`},socket:{remoteAddress:c.network.client.address,localAddress:c.address}};}
test('guardia acepta solo socket TLS de cliente, IP local y Host exactos',()=>{
    const c=endpoint();expect(C.authorizeRequest(c,req(c))).toBe(true);
    for(const patch of [{remoteAddress:'192.168.250.12'},{remoteAddress:'127.0.0.1'},{localAddress:'0.0.0.0'}])expect(C.authorizeRequest(c,{...req(c),socket:{...req(c).socket,...patch}})).toBe(false);
    const spoof=req(c);spoof.socket.remoteAddress='192.168.250.12';spoof.headers['x-forwarded-for']=c.network.client.address;expect(C.authorizeRequest(c,spoof)).toBe(false);
    expect(C.authorizeRequest(c,{...req(c),headers:{host:'evil.test'}})).toBe(false);
});
test.each(['/api/integraciones','/API/INTEGRACIONES/fareharbor/webhook','/api/webhooks/fareharbor','/api/%69ntegraciones','/%61pi/webhooks','/api/%252e/integraciones','//evil.test/api/reservaciones','http://evil.test','/api/../api/integraciones','/api\\integraciones'])('bloquea recepción/control o rutas ambiguas %s',url=>{const c=endpoint();expect(C.authorizeRequest(c,req(c,url))).toBe(false);});
test('Centro de Avisos no se confunde con administración de integraciones',()=>{
    const c=endpoint();expect(C.authorizeRequest(c,req(c,'/api/eventos-integracion/centro?tab=pendientes'))).toBe(true);
});
test('identidad LAN separa entorno/protocolo del loopback y rechaza replay y versión distinta',()=>{
    const pair=crypto.generateKeyPairSync('ed25519'),c={...endpoint(),publicKey:pair.publicKey.export({type:'spki',format:'pem'})};
    const signer=identity.createResponder({privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}),serverId:c.serverId,release:c.code,origin:c.origin,environment:C.ENVIRONMENT});
    const n=crypto.randomBytes(32).toString('hex'),response=signer.respond(n),verify=identity.createVerifier(c);
    expect(verify(response,n)).toBe(signer.instance);expect(()=>verify(response,n)).toThrow();expect(()=>signer.respond(n)).toThrow();
    expect(()=>identity.createVerifier({...c,code:'9'.repeat(64)})(response,n)).toThrow();
    expect(()=>identity.createVerifier({...c,protocol:1})).toThrow();
    expect(()=>identity.createVerifier({...c,environment:identity.ENVIRONMENT,protocol:1})(response,n)).toThrow();
});
test('TLS cliente conserva CA, SAN predeterminado y pin, usa la IP exacta sin proxy ni puerto PG',()=>{
    const c=endpoint(),o=B.options(c);expect(o.host).toBe(c.address);expect(o.port).toBe(c.port);expect(o.rejectUnauthorized).toBe(true);expect(o.minVersion).toBe('TLSv1.2');
    expect(o.checkServerIdentity('otro.test',{subjectaltname:'DNS:server.ctsk-lab.test'}).code).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
    const s={setCertificateVerifyProc:jest.fn(),setPermissionRequestHandler:jest.fn(),setPermissionCheckHandler:jest.fn()};B.installTrust(s,c);
    const cb=jest.fn();s.setCertificateVerifyProc.mock.calls[0][0]({hostname:'127.0.0.1'},cb);expect(cb).toHaveBeenCalledWith(-2);
});
test('cambio de red bloquea monitor antes de enviar reto; no inicia ni reintenta escrituras',async()=>{
    jest.useFakeTimers();const send=jest.fn(),states=[];
    const pair=crypto.generateKeyPairSync('ed25519'),c={...endpoint(),publicKey:pair.publicKey.export({type:'spki',format:'pem'})};
    const w=B.watchBackend(c,{send,beforePoll:()=>C.fail('LAN_NETWORK_CHANGED'),onState:s=>states.push(s)});
    try{await jest.advanceTimersByTimeAsync(1);expect(send).not.toHaveBeenCalled();expect(w.state).toBe('untrusted');expect(w.process).toBeUndefined();await expect(w.request('/api/daily')).rejects.toThrow();}
    finally{w.stop();jest.useRealTimers();}
});
test.each(['NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','DB_PASSWORD','PGHOST','JWT_SECRET','FAREHARBOR_TOKEN','HTTPS_PROXY'])('cliente rechaza inyección %s',key=>expect(()=>C.cleanClientEnvironment({[key]:'unsafe'})).toThrow());
test('exportación independiente contiene solo código público y tres archivos de confianza',()=>{
    const dir=path.join(fs.realpathSync(process.env.LOCALAPPDATA),'ctsk-lan-client-'+crypto.randomBytes(6).toString('hex'));
    const pub=path.join(require('node:os').tmpdir(),'ctsk-public-test-'+crypto.randomUUID());fs.mkdirSync(dir);fs.mkdirSync(pub);
    try{
        const ca=Buffer.from('synthetic public certificate'),key=Buffer.from('synthetic public Ed25519 key');
        fs.writeFileSync(path.join(pub,'ca.pem'),ca);fs.writeFileSync(path.join(pub,'identity-public.pem'),key);
        fs.writeFileSync(path.join(pub,'identity-private.pem'),'MUST NEVER BE COPIED');
        const c={...endpoint(),clientCode:clientPolicy.fingerprint(root),caDigest:C.sha(ca),publicKeyDigest:C.sha(key)};
        require('../../scripts/lanLabTools.cjs').exportClient(dir,c,pub);
        expect(fs.existsSync(path.join(dir,'backend'))).toBe(false);expect(fs.existsSync(path.join(dir,'client/identity-private.pem'))).toBe(false);
        expect(fs.readdirSync(path.join(dir,'client')).sort()).toEqual(['ca.pem','client.json','identity-public.pem']);
        expect(clientPolicy.fingerprint(dir)).toBe(c.clientCode);
        for(const file of clientPolicy.FILES)if(file!=='electron/main.js')expect(fs.readFileSync(path.join(dir,file),'utf8')).not.toMatch(/require\(['"]\.\.\/backend/);
        const plan=require('../../scripts/lanLabTools.cjs').firewallPlan(c);expect(plan.RemoteAddress).toBe(c.network.client.address);expect(plan.Profile).toBe('Private');expect(plan.EdgeTraversalPolicy).toBe('Block');
    }finally{
        // Solo dos directorios creados por esta prueba, nombres y padres comprobados.
        expect(path.dirname(dir)).toBe(fs.realpathSync(process.env.LOCALAPPDATA));expect(path.basename(dir)).toMatch(/^ctsk-lan-client-[a-f0-9]{12}$/);
        fs.rmSync(dir,{recursive:true});fs.rmSync(pub,{recursive:true});
    }
});
test('LAN reutiliza arranque sin omitir rol/esquema y conserva loopback PostgreSQL',async()=>{
    const {EventEmitter}=require('node:events'),c=endpoint();const server=new EventEmitter();
    server.listen=jest.fn((_o,cb)=>cb());server.close=jest.fn(cb=>cb());let handler;
    const m={host:'127.0.0.1',httpPort:c.port,pgPort:49151,code:c.code},p={manifest:m,config:{},filename:'fake',digest:'digest'};
    const isolate=jest.fn(),verify=jest.fn(async()=>{}),pool={query:jest.fn(async()=>({rows:[]})),end:jest.fn(async()=>{})},app=jest.fn();
    const service=await startStandalone(p,{bindHost:c.address,authorizeRequest:r=>C.authorizeRequest(c,r),readPlan:()=>p,verifyLocalCluster:jest.fn(),isolate,initialize:jest.fn(),getPool:()=>pool,verify,getApp:()=>app,createServer:fn=>{handler=fn;return server;}});
    try{
        expect(server.listen.mock.calls[0][0]).toEqual({host:c.address,port:c.port,exclusive:true});expect(isolate).toHaveBeenCalledWith(49151);expect(verify).toHaveBeenCalled();expect(pool.query).toHaveBeenCalledTimes(2);
        const res={setHeader:jest.fn(),writeHead:jest.fn(),end:jest.fn()};handler(req(c,'/API/INTEGRACIONES'),res);expect(res.writeHead).toHaveBeenCalledWith(403);expect(app).not.toHaveBeenCalled();
        handler(req(c),res);expect(app).toHaveBeenCalledTimes(1);
    }finally{await service.close();}
});
test('modalidad remota nunca selecciona ownedBackend; paquete tiene entrada que fuerza LAN',()=>{
    const main=fs.readFileSync(path.join(root,'electron/main.js'),'utf8'),entry=fs.readFileSync(path.join(root,'electron/lanEntry.js'),'utf8');
    expect(main.indexOf('if (secureClient) {')).toBeLessThan(main.indexOf("require('./ownedBackend')"));
    expect(main).toContain('nodeIntegration: false');expect(main).toContain('contextIsolation: true');expect(main).toContain('sandbox: true');expect(entry).toContain("process.argv.push('--ctsk-mode=lan-lab')");
});
test('rechazo de topología ocurre antes de cargar plan PostgreSQL o abrir servidor',()=>{
    const L=require('../config/lanLabPolicy'),P=require('../config/standalonePolicy');
    const read=jest.spyOn(fs,'readFileSync').mockReturnValue(Buffer.from(JSON.stringify(endpoint())));
    const local=jest.spyOn(C,'verifyLocal').mockImplementation(()=>C.fail('LAN_NETWORK_CHANGED'));
    const database=jest.spyOn(P,'readDatabasePlan');
    try{expect(()=>L.readServer(path.join(root,'synthetic-lab/lan-server/lan-server.json'))).toThrow('LAN_NETWORK_CHANGED');expect(database).not.toHaveBeenCalled();}
    finally{read.mockRestore();local.mockRestore();database.mockRestore();}
});
test('apiFetch de frontend no repite una escritura aunque se pierda la respuesta',async()=>{
    const vm=require('node:vm'),fetch=jest.fn(async()=>{throw Error('ECONNRESET');});
    const window={App:{},dispatchEvent:jest.fn()},context={window,Headers,AbortController,Event,fetch};
    vm.runInNewContext(fs.readFileSync(path.join(root,'frontend/js/api.js'),'utf8'),context);
    await expect(window.App.api.apiFetch('/api/reservaciones/1',{method:'PATCH',body:{observaciones:'sintético'}})).rejects.toMatchObject({isNetworkError:true});
    expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1].method).toBe('PATCH');
});
test('captura pública de PowerShell coincide con el inventario de arranque',()=>{
    expect(fs.readFileSync(path.join(root,'scripts/InspectLanNetwork.ps1'),'utf8').trim()).toBe(C.INSPECT.trim());
});
