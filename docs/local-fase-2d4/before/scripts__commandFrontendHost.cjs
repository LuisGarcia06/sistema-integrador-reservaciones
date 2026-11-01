// Host/proxy de ensayo exclusivamente loopback. No se importa desde el producto.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../backend/config/commandApiPolicy'),C=require('../backend/security/revisionApiContract');
const assets=['lab/command.html','lab/command.css','lab/revision.css','lab/revisionEditor.js','js/api.js','js/auth.js','js/revisionLab.js','js/revisionConflict.js','js/commandLab.js','js/commandPanel.js','css/variables.css','css/base.css','css/components.css'];
const UUID=require('../backend/security/commandIntent').UUID;
function allowed(method,url){
    if(typeof url!=='string'||url.includes('%')||url.includes('\\'))return false;
    if(method==='POST'&&['/api/auth/login','/api/precondiciones'].includes(url))return true;
    if(method==='GET')return url==='/api/auth/sesion'||/^\/api\/(tours|paises|plataformas|usuarios)$/.test(url)
        ||/^\/api\/(reservaciones|operaciones|transportes|vehiculos|guias|operadores|tours|usuarios|eventos-integracion)\/[1-9][0-9]*$/.test(url)
        ||/^\/api\/eventos-integracion\/[1-9][0-9]*\/diff$/.test(url)
        ||/^\/api\/daily\/observaciones\?fecha=\d{4}-\d\d-\d\d$/.test(url)
        ||url.startsWith('/api/comandos/')&&UUID.test(url.slice('/api/comandos/'.length));
    try{const spec=C.command(method,url,{});return spec.path!=='/'&&spec.path!=='/:id/password'&&(spec.resource==='daily'?/^\/api\/daily\/observaciones\?fecha=\d{4}-\d\d-\d\d$/.test(url):!url.includes('?'));}catch{return false;}
}
async function start(plan,{onHeld=()=>{},scope='commands'}={}){
    if(!['commands','reservaciones-integradas'].includes(scope))throw Error('FRONTEND_SCOPE_INVALID');
    const policy=scope==='commands'?{assets,allowed,entry:'lab/command.html'}:require('./reservationFrontendPolicy.cjs');
    P.validateManifest(plan.manifest,plan.manifest.root);P.validateConfig(plan.config,plan.manifest);
    if(P.readPlan(plan.filename).digest!==plan.digest)throw Error('FRONTEND_PLAN_CHANGED');
    const root=path.resolve(__dirname,'../frontend'),calls=[],agent=new http.Agent({keepAlive:true,maxSockets:8});
    let nextFault=null,recoveryFault=false,releaseHeld=null;
    const generation=plan.manifest.dataGeneration,port=plan.manifest.httpPort;
    function exchange(req,body,extra={},label='original'){
        return new Promise((yes,no)=>{
            const headers={host:'127.0.0.1:'+port};
            for(const name of ['content-type','authorization','x-ctsk-protocol','x-ctsk-data-generation','idempotency-key','if-match','if-operational-match'])if(req.headers[name])headers[name]=req.headers[name];
            if(body.length)headers['Content-Length']=body.length;
            const command=!['GET','HEAD'].includes(req.method)&&!['/api/auth/login','/api/precondiciones'].includes(req.url);
            const entry={method:req.method,url:req.url,writing:command,label,clientPort:req.socket.remotePort,clientConnection:req.headers.connection};
            if(command)Object.assign(entry,{key:headers['idempotency-key'],protocol:headers['x-ctsk-protocol'],generation:headers['x-ctsk-data-generation'],hasEtag:Boolean(headers['if-match']),hasContext:Boolean(headers['if-operational-match']),bodyHash:crypto.createHash('sha256').update(body).digest('hex')});
            if(scope==='reservaciones-integradas'&&req.url==='/api/precondiciones'){
                const preview=JSON.parse(body.toString('utf8'));
                if(preview.metodo==='POST'&&preview.ruta==='/api/reservaciones')Object.assign(entry,{creationPreview:true,dataHash:crypto.createHash('sha256').update(JSON.stringify(preview.datos)).digest('hex'),dataFields:Object.keys(preview.datos)});
            }
            calls.push(entry);
            const q=http.request({host:'127.0.0.1',port,method:req.method,path:req.url,headers:{...headers,...extra},agent,timeout:15000},res=>{
                entry.status=res.statusCode;entry.replayed=res.headers['idempotency-replayed']==='true';
                if(res.headers['x-ctsk-protocol']!==P.PROTOCOL||res.headers['x-ctsk-data-generation']!==generation){res.resume();no(Error('UPSTREAM_IDENTITY_CHANGED'));return;}
                const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>2*1024*1024){res.destroy();no(Error('RESPONSE_LIMIT'));}else chunks.push(c);});
                res.once('error',no);res.on('end',()=>yes({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),entry}));
            });
            q.on('socket',socket=>{const capture=()=>entry.upstreamPort=socket.localPort;if(socket.connecting)socket.once('connect',capture);else capture();});
            q.on('timeout',()=>q.destroy(Error('UPSTREAM_TIMEOUT')));q.once('error',no);q.end(body);
        });
    }
    const server=http.createServer(async(req,res)=>{
        const own='127.0.0.1:'+server.address().port;
        if(req.headers.host!==own||req.headers.origin&&req.headers.origin!=='http://'+own){res.writeHead(403).end();return;}
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
        const fail=(status,code)=>{if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({codigo:code}));};
        if(req.url.startsWith('/api/')){
            if(!policy.allowed(req.method,req.url)){fail(405,'ACCION_BLOQUEADA_EN_HARNESS');return;}
            try{
                const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>128*1024){fail(413,'BODY_LIMIT');return;}chunks.push(c);}const body=Buffer.concat(chunks);
                if(req.url==='/api/precondiciones'){
                    const value=JSON.parse(body.toString('utf8'));
                    if(!policy.allowed(value.metodo,value.ruta)||!['PATCH','POST','PUT'].includes(value.metodo)||['/api/auth/login','/api/precondiciones'].includes(value.ruta)){fail(405,'FORMULARIO_NO_ADAPTADO');return;}
                }
                if(req.method==='GET'&&req.url.startsWith('/api/comandos/')&&recoveryFault){recoveryFault=false;fail(503,'RECUPERACION_SINTETICA_INTERRUMPIDA');return;}
                const writing=!['GET','HEAD'].includes(req.method)&&!['/api/auth/login','/api/precondiciones'].includes(req.url),fault=writing?nextFault:null;if(writing)nextFault=null;
                if(scope==='reservaciones-integradas'&&writing){
                    if(!['idempotency-key','x-ctsk-protocol','x-ctsk-data-generation','if-match','if-operational-match'].every(name=>typeof req.headers[name]==='string'&&req.headers[name].length>0)){fail(428,'PRECONDICION_REQUERIDA');return;}
                    if(!UUID.test(req.headers['idempotency-key'])||req.headers['x-ctsk-protocol']!==P.PROTOCOL){fail(400,'CLIENTE_INCOMPATIBLE');return;}
                    if(req.headers['x-ctsk-data-generation']!==generation){fail(409,'GENERACION_INCOMPATIBLE');return;}
                }
                if(fault==='before-write'){calls.push({method:req.method,url:req.url,writing:true,label:'blocked-before-upstream',key:req.headers['idempotency-key'],status:503});fail(503,'TRANSPORTE_SINTETICO_INTERRUMPIDO');return;}
                let reply=await exchange(req,body);
                if(fault==='duplicate')reply=await exchange(req,body,{},'transport-replay');
                if(fault==='key-conflict')reply=await exchange(req,Buffer.from(JSON.stringify({...JSON.parse(body),habitacion:'SYN-DIFFERENT-INTENT'})),{},'transport-different-intent');
                if(fault==='hold'){await new Promise(resolve=>{releaseHeld=resolve;onHeld(req.headers['idempotency-key']);});releaseHeld=null;}
                for(const name of ['content-type','etag','x-ctsk-protocol','x-ctsk-data-generation','idempotency-replayed','location'])if(reply.headers[name])res.setHeader(name,reply.headers[name]);
                if(fault==='truncate'){
                    reply.entry.truncatedAfterCommit=reply.status===200;
                    res.writeHead(reply.status,{'Content-Length':reply.body.length});res.write(reply.body.subarray(0,Math.max(1,Math.floor(reply.body.length/2))));setTimeout(()=>res.destroy(),25);return;
                }
                res.writeHead(reply.status,{'Content-Length':reply.body.length});res.end(reply.body);return;
            }catch{if(!res.destroyed)fail(503,'UPSTREAM_NO_CONCLUYENTE');return;}
        }
        const file=req.url==='/'?policy.entry:req.url.startsWith('/frontend/')?req.url.slice(10):scope==='reservaciones-integradas'&&req.url.startsWith('/assets/')?req.url.slice(1):'';
        if(req.method!=='GET'||!policy.assets.includes(file)){res.writeHead(404).end();return;}
        res.setHeader('Content-Type',file.endsWith('.jpg')?'image/jpeg':(file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html')+'; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)));
    });
    server.keepAliveTimeout=10000;
    await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
    return {server,calls,origin:'http://127.0.0.1:'+server.address().port,arm(mode){if(!['truncate','duplicate','key-conflict','before-write','hold'].includes(mode))throw Error('FAULT_INVALID');nextFault=mode;},recoveryError(){recoveryFault=true;},release(){releaseHeld?.();},resetConnections(){agent.destroy();},async close(){releaseHeld?.();agent.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
module.exports={start,allowed,assets};
