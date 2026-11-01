// Únicamente revision-api-lab: todos los servicios comparten el mismo cliente.
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
    if(config?.APP_ENVIRONMENT!=='revision-api-lab')return;
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
                    const name='ctsk_api_nested_'+(++serial);await db.query('SAVEPOINT '+name);stack.push(name);return {rows:[]};
                }
                if(/^(COMMIT|ROLLBACK);?$/i.test(sql)){
                    if(readOnly){if(/^COMMIT/i.test(sql))throw Error('REVISION_API_TRANSACTION_BOUNDARY');return {rows:[]};}
                    const name=stack.pop();if(!name)throw Error('REVISION_API_TRANSACTION_BOUNDARY');
                    if(/^ROLLBACK/i.test(sql))await db.query('ROLLBACK TO SAVEPOINT '+name);
                    await db.query('RELEASE SAVEPOINT '+name);return {rows:[]};
                }
                if(/^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\b/i.test(sql))throw Error('REVISION_API_TRANSACTION_BOUNDARY');
                // Lista cerrada: comentarios iniciales, DDL y formas alternativas
                // de control no se delegan al cliente PostgreSQL de los servicios.
                if(!/^(SELECT|SHOW|WITH|INSERT|UPDATE|DELETE)\b/i.test(sql))throw Error('REVISION_API_SQL_NOT_SUPPORTED');
                if(readOnly&&!/^(SELECT|SHOW|WITH)\b/i.test(sql))throw Error('REVISION_API_WRITE_CONTEXT_REQUIRED');
                if(!readOnly&&!state.writeEnabled&&(!/^(SELECT|SHOW|WITH)\b/i.test(sql)||/\b(INSERT|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|UPDATE)\b/i.test(sql)))throw Error('REVISION_API_PRECONDITIONS_NOT_VERIFIED');
                return db.query(...values);
            });},
            release(){if(!readOnly||state.closed)return;state.closed=true;void db.query('ROLLBACK').catch(()=>{}).finally(()=>db.release());},
            balanced:()=>stack.length===0
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
    installed={pool,connect,facade};
}
async function transaction(pool,work){
    if(installed?.pool!==pool||scope.getStore())throw Error('REVISION_API_TRANSACTION_REQUIRED');
    const db=await installed.connect(),state={closed:false,writeEnabled:false};
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
module.exports={install,transaction,authorizeWrites};
