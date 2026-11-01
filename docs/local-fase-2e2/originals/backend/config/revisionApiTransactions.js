// Únicamente revision-api-lab/command-api-lab: los servicios comparten cliente.
// Los BEGIN internos son savepoints, nunca confirman la transacción HTTP exterior.
const {AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();
let installed;
const sqlText=args=>String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
function callbackResult(args,work){
    const values=[...args];let callback=typeof values.at(-1)==='function'?values.pop():null;
    if(!callback&&typeof values[0]?.callback==='function'){callback=values[0].callback;values[0]={...values[0]};delete values[0].callback;}
    const task=Promise.resolve().then(()=>work(values));
    if(callback){void task.then(r=>callback(null,r),e=>callback(e));return;}
    return task;
}
function install(pool,config){
    if(!['revision-api-lab','command-api-lab','audit-api-lab','admin-audit-api-lab','user-audit-api-lab','credential-security-api-lab','administrative-frontend023-lab','first-access023-lab','unified023-lab'].includes(config?.APP_ENVIRONMENT))return;
    const unified=config.APP_ENVIRONMENT==='unified023-lab';
    const integrated=unified||config.APP_ENVIRONMENT==='administrative-frontend023-lab';
    const security=integrated||['credential-security-api-lab','first-access023-lab','unified023-lab'].includes(config.APP_ENVIRONMENT);
    const userAudit=security||config.APP_ENVIRONMENT==='user-audit-api-lab';
    const administrative=userAudit||config.APP_ENVIRONMENT==='admin-audit-api-lab';
    const auditing=administrative||config.APP_ENVIRONMENT==='audit-api-lab';
    const commands=auditing||config.APP_ENVIRONMENT==='command-api-lab';
    if(commands&&config.DB_SCHEMA_VERSION!==(security?'023':administrative?'022':auditing?'021':'020'))throw Error('COMMAND_API_SCHEMA_REQUIRED');
    if(installed)throw Error('REVISION_API_POOL_ALREADY_INSTALLED');
    const connect=pool.connect.bind(pool);
    function facade(db,state,readOnly=false){
        const stack=[];let serial=0;
        return {processID:db.processID,
            query(...args){return callbackResult(args,async values=>{
                if(state.closed)throw Error('REVISION_API_TRANSACTION_ENDED');
                const sql=sqlText(values);
                // Los servicios actuales usan sentencias parametrizadas simples.
                // No aceptar COMMIT;UPDATE ni otros lotes que escapen del límite.
                if(sql.replace(/;\s*$/,'').includes(';'))throw Error('REVISION_API_SQL_BATCH_FORBIDDEN');
                if(/^BEGIN(?: READ ONLY)?;?$/i.test(sql)){
                    if(readOnly){if(!/^BEGIN READ ONLY;?$/i.test(sql))throw Error('REVISION_API_WRITE_CONTEXT_REQUIRED');return {rows:[]};}
                    const name='ctsk_api_nested_'+(++serial);await db.query('SAVEPOINT '+name);stack.push({name,auditLength:state.auditIds?.length||0});return {rows:[]};
                }
                if(/^(COMMIT|ROLLBACK);?$/i.test(sql)){
                    if(readOnly){if(/^COMMIT/i.test(sql))throw Error('REVISION_API_TRANSACTION_BOUNDARY');return {rows:[]};}
                    const point=stack.pop();if(!point)throw Error('REVISION_API_TRANSACTION_BOUNDARY');
                    if(/^ROLLBACK/i.test(sql)){await db.query('ROLLBACK TO SAVEPOINT '+point.name);if(commands)state.auditIds.length=point.auditLength;}
                    await db.query('RELEASE SAVEPOINT '+point.name);return {rows:[]};
                }
                if(/^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\b/i.test(sql))throw Error('REVISION_API_TRANSACTION_BOUNDARY');
                // Lista cerrada: comentarios iniciales, DDL y formas alternativas
                // de control no se delegan al cliente PostgreSQL de los servicios.
                if(!/^(SELECT|SHOW|WITH|INSERT|UPDATE|DELETE)\b/i.test(sql))throw Error('REVISION_API_SQL_NOT_SUPPORTED');
                if(readOnly&&!/^(SELECT|SHOW|WITH)\b/i.test(sql))throw Error('REVISION_API_WRITE_CONTEXT_REQUIRED');
                if(!readOnly&&!state.writeEnabled&&(!/^(SELECT|SHOW|WITH)\b/i.test(sql)||/\b(INSERT|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|UPDATE)\b/i.test(sql)))throw Error('REVISION_API_PRECONDITIONS_NOT_VERIFIED');
                const result=await db.query(...values);
                if(commands&&/^INSERT\s+INTO\s+(?:public\.)?bitacora\b/i.test(sql))state.auditIds.push(...result.rows.map(r=>r.id_bitacora).filter(Number.isInteger));
                return result;
            });},
            release(){if(!readOnly||state.closed||state.managed)return;state.closed=true;void db.query('ROLLBACK').catch(()=>{}).finally(()=>db.release());},
            balanced:()=>stack.length===0,
            reset:()=>{stack.length=0;}
        };
    }
    async function readClient(){
        const db=await connect();
        try{await db.query('BEGIN READ ONLY');return facade(db,{closed:false},true);}
        catch(e){db.release();throw e;}
    }
    pool.connect=function(callback){
        const task=scope.getStore()?Promise.resolve(scope.getStore().client):readClient();
        if(callback){void task.then(c=>callback(null,c,c.release),e=>callback(e));return;}
        return task;
    };
    pool.query=function(...args){return callbackResult(args,async values=>{
        const current=scope.getStore();if(current)return current.client.query(...values);
        const c=await readClient();try{return await c.query(...values);}finally{c.release();}
    });};
    installed={pool,connect,facade,commands,auditing,administrative,userAudit,security,integrated,unified};
}
async function transaction(pool,work){
    if(installed?.pool!==pool||scope.getStore())throw Error('REVISION_API_TRANSACTION_REQUIRED');
    const db=await installed.connect(),state={closed:false,writeEnabled:false,auditIds:[],raw:db};
    try{
        await db.query('BEGIN'); // guardia 2C.1 antes de cualquier dependencia.
        state.client=installed.facade(db,state);
        const value=await scope.run(state,()=>work(state.client));
        if(!state.client.balanced())throw Error('REVISION_API_TRANSACTION_UNBALANCED');
        await db.query('COMMIT');return value;
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
    finally{state.closed=true;db.release();}
}
function authorizeWrites(){const current=scope.getStore();if(!current||current.closed)throw Error('REVISION_API_TRANSACTION_REQUIRED');current.writeEnabled=true;}
function commandScope(){const current=scope.getStore();if(!installed?.commands||!current||current.closed)throw Error('COMMAND_TRANSACTION_REQUIRED');return current;}
function establishAudit({actor,generation,key,spec}){
    const current=commandScope();
    if(!installed.auditing||!current.writeEnabled||current.audit||actor.rol!=='Administrador'||!actor.estado||!Number.isInteger(actor.id_usuario)||typeof actor.nombre!=='string')throw Error('AUDIT_AUTHENTICATED_CONTEXT_REQUIRED');
    if(installed.integrated&&!installed.unified&&!['usuarios','tours','guias','operadores','vehiculos','paises','plataformas'].includes(spec.resource))throw Error('ADMIN_AUDIT_RESOURCE_REQUIRED');
    if(installed.userAudit&&!installed.integrated&&(spec.resource!=='usuarios'||!(spec.method==='PATCH'||installed.security&&spec.method==='POST')))throw Error('USER_AUDIT_RESOURCE_REQUIRED');
    if(installed.administrative&&!installed.userAudit&&!['tours','guias','operadores','vehiculos','paises','plataformas'].includes(spec.resource))throw Error('ADMIN_AUDIT_RESOURCE_REQUIRED');
    const adminFormat=installed.unified?require('./unifiedHttpPolicy').ADMIN_RESOURCES.includes(spec.resource):installed.administrative;
    current.audit=Object.freeze({actor:Object.freeze({id:actor.id_usuario,name:actor.nombre}),generation,key,resource:spec.resource,
        ...(adminFormat?{version:3}:{}),
        ...(installed.security?{operation:spec.method==='POST'?'create':spec.url.endsWith('/password')?'password':'modify'}:{}),
        motivo:spec.body.motivo,hasMotivo:Object.hasOwn(spec.body,'motivo')});
}
function auditContext(db){const current=commandScope();if(!installed.auditing||!current.writeEnabled||current.client!==db||!current.audit||!Number.isInteger(db.processID))throw Error('AUDIT_TRANSACTION_CLIENT_REQUIRED');return current.audit;}
async function attemptCommand(work){
    const current=commandScope();if(current.attempted)throw Error('COMMAND_ATTEMPT_ALREADY_USED');
    current.attempted=true;await current.raw.query('SAVEPOINT ctsk_command_work');
    try{const value=await work();if(!current.client.balanced())throw Error('REVISION_API_TRANSACTION_UNBALANCED');await current.raw.query('RELEASE SAVEPOINT ctsk_command_work');current.attemptFinished=true;return {value};}
    catch(error){await current.raw.query('ROLLBACK TO SAVEPOINT ctsk_command_work');await current.raw.query('RELEASE SAVEPOINT ctsk_command_work');current.client.reset();current.auditIds=[];current.writeEnabled=false;current.attemptFinished=true;return {error};}
}
async function recordCommand(entry){
    const current=commandScope();if(!current.attemptFinished||current.recorded)throw Error('COMMAND_FINAL_RESULT_REQUIRED');
    const M=require('../models/comandos.model');
    await current.raw.query(M.INSERT_SQL,M.FIELDS.map(name=>name==='ids_bitacora'?current.auditIds:entry[name]));current.recorded=true;
    return current.auditIds.slice();
}
async function readCommand(pool,work){
    if(!installed?.commands||installed.pool!==pool||scope.getStore())throw Error('COMMAND_READ_REQUIRED');
    const db=await installed.connect(),state={closed:false,auditIds:[],managed:true};
    try{
        await db.query('BEGIN READ ONLY');
        if(installed.security){
            await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
            await db.query("SET LOCAL lock_timeout = '2000ms'");
            await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('./operationalTransactions').KEY);
        }else await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        state.client=installed.facade(db,state,true);
        return await scope.run(state,()=>work(state.client));
    }finally{state.closed=true;await db.query('ROLLBACK').catch(()=>{});db.release();}
}
function assertCommandClient(db){const current=commandScope();if(current.client!==db||!current.writeEnabled)throw Error('COMMAND_TRANSACTION_CLIENT_REQUIRED');}
module.exports={assertCommandClient,install,transaction,authorizeWrites,attemptCommand,recordCommand,readCommand,establishAudit,auditContext};
