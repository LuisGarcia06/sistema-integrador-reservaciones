// Despliegue de escritorio: snapshots de SOLO LECTURA y release nueva; nunca migra ni cambia tareas.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
delete process.env.PSModulePath;
const root=path.resolve(__dirname,'..'),base=path.join(process.env.LOCALAPPDATA,'CommunityTours/secure-runtime');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const profile=process.argv[3]||'centro-avisos';
if(!['centro-avisos','centro-avisos-horarios'].includes(profile))throw Error('INVALID_RELEASE_PROFILE');
const feature=profile==='centro-avisos-horarios'?'Ordenamiento, recepción y horarios del Centro de Avisos':'Centro de Avisos y Resumen operativo';
const records=path.join(base,'admin/update-records'),baselineFile=path.join(records,profile+'-baseline.json');
const activeFile=path.join(records,'controls018-final-verification.json');
function privateRead(file){require('../backend/config/windowsConfigAcl').checkAcl(file);return JSON.parse(fs.readFileSync(file));}
function runtimeHashes(){
 const hashes={};
 for(const provider of ['fareharbor','getyourguide']){
  const folder=path.join(process.env.LOCALAPPDATA,'CommunityTours/integrations',provider),file=path.join(folder,'continuous.json'),config=privateRead(file);
  hashes[provider+':config']=hash(fs.readFileSync(file));
  for(const [relative,expected] of Object.entries(config.sourceHashes)){
   const candidate=path.join(folder,'runtime',relative),actual=hash(fs.readFileSync(candidate));if(actual!==expected)throw Error('RUNTIME_SOURCE_CHANGED');hashes[provider+':'+relative]=actual;
  }
  for(const relative of provider==='fareharbor'?['ngrok.yml','webhook-secret.txt']:['oauth/credentials.json','oauth/gmail-token.json']){
   const candidate=path.join(folder,relative);if(fs.existsSync(candidate))hashes[provider+':'+relative]=hash(fs.readFileSync(candidate));
  }
 }
 return hashes;
}
async function databaseSnapshot(releaseRoot){
 const config=require(path.join(releaseRoot,'backend/config/desktopPolicy')).readConfig(path.join(releaseRoot,'.env')).config;
 const {Client}=require('pg'),db=new Client({host:'127.0.0.1',port:5432,user:config.DB_USER,password:config.DB_PASSWORD,database:config.DB_NAME,options:'-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000'});
 try{
  await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity=(await db.query("SELECT current_database() db,current_user username,system_identifier::text cluster FROM pg_control_system()")).rows[0];
  if(identity.db!=='sian_kaan_reservaciones'||identity.cluster!=='7632825987452064788'||identity.username!==config.DB_USER)throw Error('DATABASE_IDENTITY');
  const tables={};
  for(const table of ['reservaciones','reservas_integracion_link','bitacora','roles','usuarios','usuario_plataformas_visibles','operaciones_tour','transportes_operacion','daily_observaciones']){
   const rows=(await db.query('SELECT row_to_json(t)::text value FROM '+table+' t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
   tables[table]={count:rows.length,sha256:hash(rows.map(r=>r.value).join('\n'))};
  }
  const events=(await db.query('SELECT id_evento_integracion,md5(row_to_json(t)::text) fingerprint FROM eventos_integracion t ORDER BY id_evento_integracion')).rows;
  const publication=(await db.query("SELECT provider,avisos_activados,updated_at FROM integracion_sync_estado WHERE source='publicacion' ORDER BY provider")).rows;
  await db.query('ROLLBACK');return{identity,tables,events,publication};
 }finally{await db.end();}
}
async function main(){
 const mode=process.argv[2],active=privateRead(activeFile);
 if(mode==='--snapshot'){
  const data=await databaseSnapshot(active.root),baseline={capturedAt:new Date().toISOString(),previous:active,data,integrations:runtimeHashes()};
  if(fs.existsSync(baselineFile))throw Error('BASELINE_ALREADY_EXISTS');
  fs.writeFileSync(baselineFile,JSON.stringify(baseline,null,2),{flag:'wx'});
  require('../backend/config/windowsConfigAcl').checkAcl(baselineFile);
  console.log(JSON.stringify({status:'READ_ONLY_BASELINE_SAVED',reservations:data.tables.reservaciones.count,events:data.events.length,integrationsUnchanged:true}));return;
 }
 const baseline=privateRead(baselineFile);
 if(mode==='--manifest'){
  const prior=privateRead(active.manifestPath),files=prior.files.filter(f=>f.path.startsWith('node_modules/'));
  for(const f of files)if(hash(fs.readFileSync(path.join(root,f.path)))!==f.sha256)throw Error('DEPENDENCY_CHANGED');
  function add(relative){const candidate=path.join(root,relative),stat=fs.lstatSync(candidate);if(stat.isSymbolicLink())throw Error('SOURCE_LINK');if(stat.isDirectory()){for(const name of fs.readdirSync(candidate).sort())if(!['__tests__','__fixtures__'].includes(name)&&!name.endsWith('.test.js'))add(relative+'/'+name);}else{const bytes=fs.readFileSync(candidate);files.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}}
  for(const relative of ['package.json','package-lock.json','backend','frontend','electron'])add(relative);
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const manifest={...prior,createdAt:new Date().toISOString(),status:'APPROVED',approvalReference:'Solicitud expresa: '+feature+', despliegue protegido recuperable, 2026-10-21.',configExcluded:true,files};
  const bytes=JSON.stringify(manifest,null,2)+'\n',digest=hash(bytes),releaseId='r-'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'-'+digest.slice(0,12);
  const manifestPath=path.join(base,'admin/approved-manifests/'+profile+'-'+releaseId+'.json');fs.writeFileSync(manifestPath,bytes,{flag:'wx'});
  const record={releaseId,manifestPath,manifestSha256:digest,previousRoot:baseline.previous.root};
  fs.writeFileSync(path.join(records,profile+'-staging.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));return;
 }
 if(mode==='--verify-and-activate'){
  const stage=privateRead(path.join(records,profile+'-staging.json')),target=path.join(base,'releases',stage.releaseId);
  if(!fs.existsSync(path.join(target,'.env')))fs.copyFileSync(path.join(baseline.previous.root,'.env'),path.join(target,'.env'),fs.constants.COPYFILE_EXCL);
  const manifest=privateRead(stage.manifestPath);if(hash(fs.readFileSync(stage.manifestPath))!==stage.manifestSha256)throw Error('MANIFEST_CHANGED');
  for(const f of manifest.files)if(hash(fs.readFileSync(path.join(target,f.path)))!==f.sha256)throw Error('RELEASE_FILE_CHANGED');
  const policy=require(path.join(target,'backend/config/desktopPolicy')),config=policy.readConfig(path.join(target,'.env')).config;
  if(hash(fs.readFileSync(path.join(target,'.env')))!==hash(fs.readFileSync(path.join(baseline.previous.root,'.env'))))throw Error('CONFIG_CHANGED');
  const fingerprint=policy.fingerprint(target);if(fingerprint!==require('../backend/config/desktopPolicy').fingerprint(root))throw Error('CODE_CHANGED');
  require(path.join(target,'backend/config/desktopConfiguration')).initialize(config);
  require(path.join(target,'backend/desktopChild')).blockProviderNetwork();
  const pool=require(path.join(target,'backend/config/database'));
  let summary,groupCount;
  try{
   await require(path.join(target,'backend/config/desktopPostgres')).verifyPostgres(pool,config);
   const client=await pool.connect();
   try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const centro=require(path.join(target,'backend/services/centroAvisos.service'));
    const filters=centro.validarConsulta({tab:'pendientes',date:'2026-10-21'});
    summary=await centro.obtenerIndicadores(filters.date,client);
    groupCount=(await centro.listarCentro(filters,{},client)).pagination.total;
    if(profile==='centro-avisos-horarios')for(const sort of ['newest','oldest','service'])await centro.listarCentro({...filters,sort},{},client);
    await client.query('ROLLBACK');
   }finally{client.release();}
  }finally{await pool.end();}
  const current=await databaseSnapshot(target);
  if(JSON.stringify(current.tables)!==JSON.stringify(baseline.data.tables))throw Error('EXISTING_TABLE_CHANGED');
  if(baseline.data.events.some(e=>current.events.find(row=>row.id_evento_integracion===e.id_evento_integracion)?.fingerprint!==e.fingerprint))throw Error('EXISTING_EVENT_CHANGED');
  if(JSON.stringify(current.publication)!==JSON.stringify(baseline.data.publication))throw Error('PUBLICATION_CONTROL_CHANGED');
  if(JSON.stringify(runtimeHashes())!==JSON.stringify(baseline.integrations))throw Error('INTEGRATION_CHANGED');
  const record={...active,status:'VERIFIED_READY_TO_OPEN',root:target,fingerprint,previousRelease:baseline.previous.root,
   manifestPath:stage.manifestPath,manifestSha256:stage.manifestSha256,verifiedAt:new Date().toISOString(),feature,
   reservations:current.tables.reservaciones.count,priorEventsPreserved:baseline.data.events.length,currentEvents:current.events.length,summary,pendingGroups:groupCount};
  const recoveryFile=path.join(records,profile+'-recovery-'+path.basename(baseline.previous.root)+'.json');
  if(!fs.existsSync(recoveryFile))fs.copyFileSync(activeFile,recoveryFile,fs.constants.COPYFILE_EXCL);
  const next=activeFile+'.'+profile+'-next';fs.writeFileSync(next,JSON.stringify(record,null,2),{flag:'wx'});
  fs.renameSync(next,activeFile);
  const result={status:'VERIFIED_AND_ACTIVATED',root:target,previousRelease:baseline.previous.root,recoveryRecord:recoveryFile,
   reservationsPreserved:current.tables.reservaciones.count,eventsPreserved:baseline.data.events.length,newCapturedEvents:current.events.length-baseline.data.events.length,
   integrationRuntimeHashesPreserved:true,publicationControlsPreserved:true,databaseWrites:false,migrations:false,summary,pendingGroups:groupCount};
  fs.writeFileSync(path.join(root,'docs',profile,'deployment.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
 }
 throw Error('EXPLICIT_MODE_REQUIRED');
}
main().catch(e=>{console.error('CENTRO_RELEASE_FAILED',e.code||e.message);process.exitCode=1;});
