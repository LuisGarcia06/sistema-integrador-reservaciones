const fs=require('node:fs'),path=require('node:path');
const base=require('./standalonePolicy'),prior=require('./revisionApiPolicy'),desktop=require('./desktopPolicy');
const {checkAcl}=require('./windowsConfigAcl');
const ENVIRONMENT='command-api-lab',PURPOSE='single-transaction-commands-lab',PROTOCOL='ctsk-command-api-v1',SCHEMA='020';
function validateManifest(m,root){
    if(!m||m.version!==4||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.protocol!==PROTOCOL||!/^[a-f0-9]{64}$/.test(m.commandKeyDigest||''))base.fail('COMMAND_API_PROFILE');
    const {commandKeyDigest,...rest}=m;
    // Composición de validadores de destino; ningún lector anterior acepta este manifiesto.
    prior.validateManifest({...rest,version:3,environment:prior.ENVIRONMENT,purpose:prior.PURPOSE,protocol:prior.PROTOCOL},root);
    return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!==SCHEMA)base.fail('COMMAND_API_CONFIG');
    prior.validateConfig({...c,APP_ENVIRONMENT:prior.ENVIRONMENT,DB_SCHEMA_VERSION:prior.SCHEMA},m);
    return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))base.fail('COMMAND_API_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'manifest.json')||fs.realpathSync(m.directory)!==m.directory)base.fail('COMMAND_API_PROFILE');
    const loaded=desktop.readConfig(path.join(m.directory,'runtime.env'),{validate:c=>validateConfig(c,m)});
    const readKey=(name,digest)=>{const file=path.join(m.directory,name);checkAcl(file);const key=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{64}$/.test(key)||base.sha(key)!==digest)base.fail('CONFIG_CHANGED');return key;};
    const key=readKey('preconditions.key',m.etagKeyDigest),commandKey=readKey('commands.key',m.commandKeyDigest);
    if(key===commandKey||loaded.digest!==m.configDigest||base.codeFingerprint(root)!==m.code)base.fail('CONFIG_CHANGED');
    return {manifest:Object.freeze(m),config:loaded.config,key,commandKey,digest:base.sha(bytes),filename};
}
async function verify(pool,plan){
    validateManifest(plan.manifest,plan.manifest.root);validateConfig(plan.config,plan.manifest);base.verifyLocalCluster(plan.manifest);
    const current=readPlan(plan.filename);
    if(current.digest!==plan.digest||current.key!==plan.key||current.commandKey!==plan.commandKey||JSON.stringify(current.config)!==JSON.stringify(plan.config))base.fail('CONFIG_CHANGED');
    const pg=require('./desktopPostgres'),schema=require('./desktopSchema'),db=await pool.connect();
    try{
        await db.query('BEGIN READ ONLY');
        base.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);
        if((await db.query('SELECT system_identifier::text AS cluster FROM pg_catalog.pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)base.fail('PG_CLUSTER');
        if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)base.fail('PG_ROLE');
        const row=(await db.query(schema.SCHEMA_SQL)).rows[0],expected=[...schema.TABLES,'comandos_idempotentes'].sort();
        if(JSON.stringify([...row.tables].sort())!==JSON.stringify(expected))base.fail('COMMAND_SCHEMA_INVALID');
        // La lista extendida solo se admite aquí; el verificador anterior sigue estricto.
        schema.validateSchema({...row,tables:row.tables.filter(t=>t!=='comandos_idempotentes')});
        await require('./revisionSchema').verifySchema(db);
        await require('./commandSchema').verifySchema(db,plan.manifest.dataGeneration);
        await db.query('ROLLBACK');
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={ENVIRONMENT,PURPOSE,PROTOCOL,SCHEMA,validateManifest,validateConfig,readPlan,verify};
