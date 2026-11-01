// Aplicación HTTP separada. No importa server.js, no sirve frontend ni receptores.
const express=require('express');
const {canonical,tokens,error}=require('./security/revisionTokens');
const C=require('./security/revisionApiContract'),state=require('./security/revisionApiState');
const transactions=require('./config/revisionApiTransactions'),PROTOCOL='ctsk-revision-api-v1',ENVIRONMENT='revision-api-lab';
function createApp(plan,pool,{auditFrontend=false}={}){
    const refs=require('./config/manualReferences025Policy').feature(plan)?require('./services/manualReferences025.service'):null;
    const enterprise=plan.config.APP_ENVIRONMENT==='enterprise026';
    const preproduction=plan.config.APP_ENVIRONMENT==='preproduction023-local';
    const sync024=preproduction&&require('./config/integration024Policy').feature(plan);
    const unified=enterprise||preproduction||plan.config.APP_ENVIRONMENT==='unified023-lab';
    const firstAccess=plan.config.APP_ENVIRONMENT==='first-access023-lab';
    const integrated=unified||plan.config.APP_ENVIRONMENT==='administrative-frontend023-lab';
    const security=firstAccess||integrated||plan.config.APP_ENVIRONMENT==='credential-security-api-lab';
    const userAudit=security||plan.config.APP_ENVIRONMENT==='user-audit-api-lab';
    const administrative=userAudit||plan.config.APP_ENVIRONMENT==='admin-audit-api-lab';
    const auditing=plan.config.APP_ENVIRONMENT==='audit-api-lab';
    if(auditFrontend&&!auditing)throw Error('AUDIT_FRONTEND_PROFILE_REQUIRED');
    const commandMode=administrative||auditing||plan.config.APP_ENVIRONMENT==='command-api-lab';
    const commandPolicy=commandMode?require(enterprise?'./config/enterprise026Policy':preproduction?'./config/preproductionPolicy':unified?'./config/unifiedPolicy':firstAccess?'./config/firstAccessPolicy':integrated?'./config/administrativeFrontendPolicy':security?'./config/credentialSecurityPolicy':userAudit?'./config/userAuditApiPolicy':administrative?'./config/adminAuditApiPolicy':auditing?'./config/auditApiPolicy':'./config/commandApiPolicy'):null;
    if(commandMode){commandPolicy.validateManifest(plan.manifest,plan.manifest.root);commandPolicy.validateConfig(plan.config,plan.manifest);}
    else if(plan.config.APP_ENVIRONMENT!==ENVIRONMENT||plan.manifest.purpose!=='http-preconditions-lab')throw Error('REVISION_API_PROFILE');
    const protocol=commandMode?commandPolicy.PROTOCOL:PROTOCOL;
    const command=security?((...args)=>commandPolicy.command(...args,plan.manifest.milestone)):auditing||administrative?commandPolicy.command:C.command;
    const router=express.Router();
    for(const resource of unified?['reservaciones','operaciones','transportes','daily','usuarios','tours','guias','operadores','vehiculos','paises','plataformas','bitacora','dashboard','eventos-integracion']:integrated?['usuarios','tours','guias','operadores','vehiculos','paises','plataformas','bitacora']:userAudit?['usuarios','plataformas']:administrative?['tours','guias','operadores','vehiculos','paises','plataformas']:auditing?(auditFrontend?['operaciones','transportes','daily','tours','guias','vehiculos','operadores','bitacora']:['operaciones','transportes','daily']):[...Object.keys(C.resources),'bitacora','dashboard']){
        const file=resource==='eventos-integracion'?'eventosIntegracion':resource;
        router.use('/api/'+resource,require('./routes/'+file+'.routes'));
        router.stack.at(-1).ctskMount='/api/'+resource;
    }
    C.assertCoverage(router);
    const T=tokens(plan.key,plan.manifest.dataGeneration),app=express();app.disable('x-powered-by');app.disable('etag');
    if(unified&&plan.manifest.activation==='electron-original')require('./unifiedFrontend').install(app,plan);
    app.use((req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-CTSK-Protocol',protocol);
        if(commandMode)res.setHeader('X-CTSK-Data-Generation',plan.manifest.dataGeneration);
        if(req.headers.host!==`127.0.0.1:${plan.manifest.httpPort}`)return res.status(403).json({codigo:'ORIGEN_NO_AUTORIZADO'});
        if((auditing||administrative)&&!(sync024&&require('./config/integration024Policy').allowHttp(req.method,req.originalUrl))&&!(auditFrontend?require('./config/auditFrontendPolicy'):commandPolicy).allowHttp(req.method,req.originalUrl,security?plan.manifest.milestone:undefined))return res.status(['GET','HEAD'].includes(req.method)?404:405).json({codigo:'RUTA_NO_HABILITADA'});
        if(/^\/api\/(integraciones|webhooks|whatsapp)(\/|$)/i.test(req.path))return res.status(503).json({codigo:'INTEGRACIONES_BLOQUEADAS'});
        next();
    });
    app.use(express.json({limit:'128kb',strict:true}));
    if(security)app.use((req,res,next)=>{res.once('finish',()=>{if(req.body?.password)delete req.body.password;if(req.body?.datos?.password)delete req.body.datos.password;});next();});
    app.use('/api/auth',require('./routes/auth.routes'));
    app.use(require('./middleware/auth.middleware').autenticarUsuario);
    if(sync024)app.use('/api/sincronizacion',require('./routes/sync024.routes').create(pool,plan));
    const send=(res,r)=>{for(const [k,v]of Object.entries(r.headers||{}))res.setHeader(k,v);return res.status(r.status).type('application/json').send(canonical(r.body));};
    function invoke(method,url,body,headers){
        return new Promise((resolve,reject)=>{
            const parsed=new URL(url,'http://127.0.0.1');
            const request={method,url,originalUrl:url,headers,body,query:Object.fromEntries(parsed.searchParams),params:{},baseUrl:''};
            let ended=false;const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){
                if(ended)return this;ended=true;const reply={status:this.statusCode,body:JSON.parse(JSON.stringify(value)),headers:this.headers};
                if(refs&&method==='GET'&&url.startsWith('/api/reservaciones')&&reply.status===200){(async()=>{const rows=Array.isArray(reply.body.datos)?reply.body.datos:reply.body.datos?.id_reservacion?[reply.body.datos]:[];for(const row of rows)row.referencia_externa=await refs.current(pool,row.id_reservacion);return reply;})().then(resolve,reject);}else resolve(reply);return this;
            }};
            router.handle(request,response,e=>{if(ended)return;e?reject(e):resolve({status:404,body:{mensaje:'Ruta no encontrada'},headers:{}});});
        });
    }
    const subject=(spec,user)=>({type:spec.resource,id:spec.id===null?'new:'+T.hash('creation',spec.body):spec.id,actor:user.id_usuario,role:user.rol});
    async function snapshot(db,spec,req){
        const view=spec.view?await invoke('GET',spec.view,{},req.headers):{status:200,body:{creacion:true,recurso:spec.resource,intento:T.hash('creation',spec.body)},headers:{}};
        if(view.status!==200&&!(spec.resource==='daily'&&view.status===404))throw {reply:view};
        const primary=await state.record(db,spec,{publicUsers:userAudit,credentialVersion:security});
        if(spec.id!==null&&primary.value==='absent'&&spec.resource!=='daily')throw {reply:{status:404,body:{mensaje:'Registro no encontrado'}}};
        const representation={...view.body,revision:primary.revision,...((auditFrontend||unified)&&spec.resource==='daily'?{existe:primary.value!=='absent'}:{})};
        // Para una fila existente la foto se toma al abrir la edición, antes de
        // conocer sus valores finales. El contexto global incluye TODO destino
        // posible; editar el formulario no exige refrescar la foto del servidor.
        // Las altas sí quedan ligadas al contenido por subject(new:<HMAC intent>).
        const target=subject(spec,req.usuario),action={target,method:spec.method,url:spec.url};
        return {representation,revision:primary.revision,etag:T.record(target,primary,representation),context:T.context(action,refs?[await state.context(db,{publicUsers:userAudit,credentialVersion:security}),await refs.context(db)]:await state.context(db,{publicUsers:userAudit,credentialVersion:security}))};
    }
    const commands=commandMode?require('./services/comandos.service').create({pool,plan,invoke,snapshot,command,protocol,auditing:auditing||administrative,verify(req,before){
        T.verifyRecord(req.headers['if-match'],before.etag);T.verifyContext(req.headers['if-operational-match'],before.context);
    }}):null;
    if(commands)app.get('/api/comandos/:clave',async(req,res)=>{try{return send(res,await commands.recover(req,req.params.clave));}catch(e){return failure(res,e);}});
    app.post('/api/precondiciones',async(req,res)=>{
        try{
            if(req.usuario.rol!=='Administrador')throw error(403,'NO_AUTORIZADO');
            if(req.headers['x-ctsk-protocol']!==protocol)throw error(400,'CLIENTE_INCOMPATIBLE');
            const {metodo,ruta,datos,...extra}=req.body||{};if(Object.keys(extra).length)throw error(400,'SOLICITUD_INVALIDA');
            const spec=command(metodo,ruta,datos);
            const result=await transactions.transaction(pool,async db=>{
                if(security){await commands.authorize(db,req);if(spec.resource==='usuarios'&&(spec.method==='POST'||spec.url.endsWith('/password')))require('./security/credentialPolicy').recent(req.credentialAuth);}
                return snapshot(db,spec,req);
            });
            return send(res,{status:200,body:{datos:result.representation,revision:result.revision,etag:result.etag,contexto:result.context,metodo:spec.method,ruta:spec.url,...(commandMode?{generacion:plan.manifest.dataGeneration}:{})}});
        }catch(e){return failure(res,e);}
    });
    app.use(async(req,res)=>{
        try{
            const reading=['GET','HEAD'].includes(req.method);
            if(!reading&&req.usuario.rol!=='Administrador')throw error(403,'NO_AUTORIZADO');
            if(!reading&&commands)return send(res,await commands.execute(req));
            const result=await transactions.transaction(pool,async db=>{
                if(reading){
                    const reply=await invoke(req.method,req.originalUrl,{},req.headers);
                    if(reply.status!==200)return reply;
                    const match=/^\/api\/([^/]+)\/([1-9][0-9]*)$/.exec(req.path);
                    if(match&&C.resources[match[1]]){
                        const [table,pk]=C.resources[match[1]],spec={resource:match[1],table,pk,id:match[2]},primary=await state.record(db,spec,{publicUsers:userAudit});
                        reply.body={...reply.body,revision:primary.revision};reply.headers.ETag=T.record(subject(spec,req.usuario),primary,reply.body);
                    }
                    return reply;
                }
                const spec=C.command(req.method,req.originalUrl,req.body);
                const before=await snapshot(db,spec,req);
                T.verifyRecord(req.headers['if-match'],before.etag);
                T.verifyContext(req.headers['if-operational-match'],before.context);
                if(req.headers['x-ctsk-protocol']!==protocol)throw error(400,'CLIENTE_INCOMPATIBLE');
                transactions.authorizeWrites();
                const reply=await invoke(req.method,spec.url,spec.body,req.headers);
                if(reply.status<200||reply.status>=300)throw {reply};
                // Contrato 019 del laboratorio: 200 solo después de COMMIT.
                // Las rutas heredadas conservan sus 201 fuera de este perfil.
                return {...reply,status:200};
            });
            return send(res,result);
        }catch(e){return failure(res,e);}
    });
    function failure(res,e){
        if(e.reply)return send(res,e.reply);
        const status=e.statusCode||500;
        return res.status(status).json({codigo:e.statusCode?e.code:'ERROR_LABORATORIO',mensaje:e.statusCode?e.message:'La operación no pudo confirmarse. Consulte el estado antes de volver a guardar.'});
    }
    app.use((e,req,res,next)=>res.status(400).json({codigo:'SOLICITUD_INVALIDA'}));
    return app;
}
module.exports={createApp};
