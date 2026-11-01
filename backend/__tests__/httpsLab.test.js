const crypto=require('node:crypto');
const {createResponder,createVerifier}=require('../security/serverIdentity');
const {watchBackend,installTrust}=require('../../electron/httpsBackend');
const {respond}=require('./helpers/notificacionesCentroFixture.cjs');
function fixture(){
    const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
    const config={publicKey:publicKey.export({type:'spki',format:'pem'}),serverId:crypto.randomUUID(),code:'a'.repeat(64),origin:'https://127.0.0.1:49152'};
    const signer=createResponder({privateKey:privateKey.export({type:'pkcs8',format:'pem'}),serverId:config.serverId,release:config.code,origin:config.origin});
    return {config,signer,nonce:crypto.randomBytes(32).toString('hex')};
}
test('Ed25519: solo clave pública; nonce se consume en ambos extremos',()=>{
    const f=fixture(),response=f.signer.respond(f.nonce),verify=createVerifier(f.config);
    expect(verify(response,f.nonce)).toBe(f.signer.instance);
    expect(()=>verify(response,f.nonce)).toThrow();expect(()=>f.signer.respond(f.nonce)).toThrow();
    expect(JSON.stringify(response)).not.toMatch(/PRIVATE|DB_|password|service.key|cluster/);
});
test.each(['nonce','protocol','serverId','environment','release','instance','origin','ready'])('rechaza payload alterado: %s',field=>{
    const f=fixture(),response=f.signer.respond(f.nonce);response.payload[field]='alterado';
    expect(()=>createVerifier(f.config)(response,f.nonce)).toThrow();
});
test('rechaza clave no autorizada y firma inválida',()=>{
    const f=fixture(),other=fixture(),r=f.signer.respond(f.nonce);
    expect(()=>createVerifier({...f.config,publicKey:other.config.publicKey})(r,f.nonce)).toThrow();
    expect(()=>createVerifier(f.config)({...r,signature:Buffer.alloc(64).toString('base64')},f.nonce)).toThrow();
});
test('reinicio cambia instancia, conserva identidad estable',()=>{
    const f=fixture(),again=fixture();expect(f.signer.instance).not.toBe(again.signer.instance);
    expect(createVerifier(f.config)(f.signer.respond(f.nonce),f.nonce)).toBe(f.signer.instance);
});
test('no acepta HMAC como clave de identidad',()=>{
    expect(()=>createVerifier({publicKey:'secreto-HMAC'})).toThrow();
    expect(()=>createResponder({privateKey:'secreto-HMAC',serverId:crypto.randomUUID()})).toThrow();
});
test('monitor conserva vida del cliente y exige nueva instancia después de desconexión',async()=>{
    jest.useFakeTimers();const f=fixture(),states=[];let offline=false;
    const watch=watchBackend(f.config,{interval:10,onState:s=>states.push(s),send:async(_c,url)=>{
        if(offline)throw Error('ECONNREFUSED');const nonce=new URL('https://127.0.0.1'+url).searchParams.get('nonce');
        return {statusCode:200,body:JSON.stringify(f.signer.respond(nonce))};
    }});
    try{
        await jest.advanceTimersByTimeAsync(1);expect(watch.state).toBe('ready');
        offline=true;await jest.advanceTimersByTimeAsync(10);expect(watch.state).toBe('disconnected');
        offline=false;await jest.advanceTimersByTimeAsync(10);expect(watch.state).toBe('ready');
        expect(states).toEqual(['connecting','ready','disconnected','ready']);
    }finally{watch.stop();jest.useRealTimers();}
});
test('monitor no abre interfaz si la firma o protocolo no se verifica',async()=>{
    jest.useFakeTimers();const f=fixture(),states=[];
    const watch=watchBackend(f.config,{onState:s=>states.push(s),send:async()=>({statusCode:200,body:'{}'})});
    try{await jest.advanceTimersByTimeAsync(1);expect(watch.state).toBe('untrusted');expect(states).not.toContain('ready');}
    finally{watch.stop();jest.useRealTimers();}
});
test('verificador Electron rechaza otros nombres antes de abrir sockets',()=>{
    const session={setCertificateVerifyProc:jest.fn(),setPermissionRequestHandler:jest.fn(),setPermissionCheckHandler:jest.fn()};
    installTrust(session,{});const callback=jest.fn();
    session.setCertificateVerifyProc.mock.calls[0][0]({hostname:'otro-servidor',certificate:{}},callback);
    expect(callback).toHaveBeenCalledWith(-2);
});
test('fixture Centro: mismos estados, filtros, historial y paginación',()=>{
    const rows=[1,2,3].map(id=>({id_evento_integracion:id,provider:'getyourguide',external_booking_id:'GYG0000'+id,
        review_status:'pending_review',application_status:'not_applied',normalized_data:{date:'2099-01-05',customer_name:'Sintético'}}));
    rows[2].application_status='applied';
    const url=s=>new URL('http://127.0.0.1'+s);
    expect(respond(rows,url('/api/eventos-integracion/centro?tab=pendientes')).pagination.total).toBe(2);
    expect(respond(rows,url('/api/eventos-integracion/centro?provider=fareharbor')).data).toEqual([]);
    expect(respond(rows,url('/api/eventos-integracion/centro/1/historial')).data[0].id_evento_integracion).toBe(1);
    expect(()=>respond(rows,url('/api/eventos-integracion/centro?limit=999'))).toThrow();
});
