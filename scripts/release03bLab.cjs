const L=require('./release03bSafety.cjs'),{S}=L,fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const evidence=path.join(L.ROOT,'docs/release-03b');let m,started=false,stage='arguments',pools=[];
const report={startedAt:new Date().toISOString(),checks:[],completed:false};
function save(name,value){fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+'\n');}
function passed(name,detail){report.checks.push({name,status:'passed',detail});console.log('R03B_OK '+name);}
function ps(script,input=''){script="$ProgressPreference='SilentlyContinue';"+script;return cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input,env:S.env(),encoding:'utf8',windowsHide:true,timeout:30000}).trim();}
function seal(value){return ps('$v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString -String $v -AsPlainText -Force)',value);}
function pid(){const rows=fs.readFileSync(path.join(m.data,'postmaster.pid'),'utf8').split(/\r?\n/);if(path.resolve(rows[1])!==m.data||Number(rows[3])!==m.port||rows[5]!==m.host)L.fail('R03B_PID_MISMATCH');return Number(rows[0]);}
async function control(action){if(action==='stop')pid();const args=action==='start'?['start','-w','-t','30','-D',m.data,'-l',path.join(m.dir,'postgres.log')]:['stop','-m','fast','-w','-t','15','-D',m.data];
 const input=JSON.stringify({exe:path.join(S.BIN,'pg_ctl.exe'),args});ps('$v=ConvertFrom-Json ([Console]::In.ReadToEnd()); $p=Start-Process -FilePath $v.exe -ArgumentList $v.args -WindowStyle Hidden -PassThru; $p.WaitForExit(); exit $p.ExitCode',input);}
function config(c,name){fs.writeFileSync(path.join(m.dir,name),Object.entries(c).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'wx'});}
async function password(db,role,value){
 // El verificador SCRAM, no la contraseña, se usa en ALTER ROLE. Parámetros al servidor.
 const salt=crypto.randomBytes(16),salted=crypto.pbkdf2Sync(value,salt,4096,32,'sha256');
 const client=crypto.createHmac('sha256',salted).update('Client Key').digest(),stored=crypto.createHash('sha256').update(client).digest('base64'),server=crypto.createHmac('sha256',salted).update('Server Key').digest('base64');
 const verifier='SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+stored+':'+server;
 await db.query('BEGIN');try{await db.query("SELECT set_config('release03b.password',$1,true)",[verifier]);await db.query(`DO $p$ BEGIN EXECUTE format('ALTER ROLE %I PASSWORD %L','${role}',current_setting('release03b.password')); END $p$`);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
}
async function run(dir){
 stage='backup';assert.equal(S.hash(fs.readFileSync(S.BACKUP)),S.BACKUP_HASH);assert.equal(S.hash(fs.readFileSync(path.join(L.ROOT,'database/migrations/017_archivo_eventos_integracion.sql'))),S.MIGRATION_HASH);
 const expected=JSON.parse(fs.readFileSync(path.join(S.BACKUP_DIR,'inventory.json'),'utf8')).inventory;
 const backup=await S.huellasHerramienta('pg_restore.exe',['--exit-on-error','--file=-',S.BACKUP]);assert.equal(backup.tables.reservaciones.count,1150);assert.equal(backup.tables.eventos_integracion.count,136);
 for(const exe of ['postgres.exe','initdb.exe','pg_restore.exe','pg_dump.exe']){const r=await S.ejecutar(exe,['--version']);assert.equal(r.code,0);assert.ok(r.out.includes('18.3'));}
 passed('backup_hash_and_tools',{backupSha256:S.BACKUP_HASH,migrationSha256:S.MIGRATION_HASH,tables:Object.keys(backup.tables).length});
 stage='new_cluster';const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const suffix=crypto.randomBytes(6).toString('hex');m=L.validateManifest({dir:fs.realpathSync(dir),data:path.join(fs.realpathSync(dir),'data'),host:'127.0.0.1',port,database:'release03b_'+suffix,clusterName:'release03b_'+suffix,admin:'r03b_migrator',owner:'r03b_owner',runtime:'r03b_runtime'});
 assert.ok(fs.existsSync(path.join(m.dir,'directory-security.json')));assert.ok(!fs.existsSync(m.data));const barrier=L.barrier(m,{api:true});
 for(const port of [3000,5432,55473,57593])assert.throws(()=>net.connect(port,'127.0.0.1'),/R03B_NETWORK/);
 const secrets={admin:crypto.randomBytes(32).toString('hex'),runtime:crypto.randomBytes(32).toString('hex'),jwt:crypto.randomBytes(32).toString('hex')};
 fs.writeFileSync(path.join(m.dir,'credentials.dpapi'),seal(JSON.stringify(secrets)),{flag:'wx'});
 const initpw=path.join(m.dir,'init-password.tmp');fs.writeFileSync(initpw,secrets.admin,{flag:'wx'});
 try{const r=await S.ejecutar('initdb.exe',['-D',m.data,'-U',m.admin,'--encoding=UTF8','--locale=C','--auth=scram-sha-256','--pwfile='+initpw]);if(r.code)L.fail('R03B_INITDB_FAILED');}finally{fs.unlinkSync(initpw);}
 fs.appendFileSync(path.join(m.data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${m.port}\ncluster_name='${m.clusterName}'\nunix_socket_directories=''\nlog_statement='none'\nlog_min_error_statement='panic'\n`);
 await control('start');started=true;pid();
 const {Pool}=require('pg');function raw(user,pw,database=m.database){const p=new Pool({host:m.host,port:m.port,database,user,password:pw,max:4,connectionTimeoutMillis:5000,options:'-c search_path=public,pg_catalog -c timezone=UTC -c statement_timeout=10000 -c lock_timeout=3000'});pools.push(p);return p;}
 const maintenance=raw(m.admin,secrets.admin,'postgres');
 const first=(await maintenance.query("SELECT current_database() database,current_user username,current_setting('data_directory') data,inet_server_port() port,current_setting('server_version') version,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
 assert.equal(first.database,'postgres');assert.equal(first.username,m.admin);assert.equal(first.port,m.port);assert.equal(path.resolve(first.data),m.data);assert.equal(first.version,'18.3');assert.ok(!L.oldClusters.has(first.cluster));
 assert.deepEqual((await maintenance.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r=>r.datname),['postgres','template0','template1']);m.systemIdentifier=first.cluster;L.validateManifest(m);
 await maintenance.query('CREATE ROLE '+S.ident(m.owner)+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
 await maintenance.query('CREATE ROLE '+S.ident(m.runtime)+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10');
 await password(maintenance,m.runtime,secrets.runtime);
 await maintenance.query('CREATE DATABASE '+S.ident(m.database)+' OWNER '+S.ident(m.owner)+" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LOCALE 'Spanish_Mexico.1252'");
 for(const database of ['postgres','template1',m.database])await maintenance.query('REVOKE ALL ON DATABASE '+S.ident(database)+' FROM PUBLIC');
 const adminRaw=raw(m.admin,secrets.admin),admin=L.guardedPool(adminRaw,m,m.admin);
 await L.identity(adminRaw,m,m.admin);assert.equal((await admin.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
 report.lab={...m,pid:pid()};fs.writeFileSync(path.join(m.dir,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx'});L.readManifest(path.join(m.dir,'manifest.json'));
 const settings=(await admin.query("SELECT pg_encoding_to_char(encoding) encoding,datcollate collate,datctype ctype,datlocprovider provider FROM pg_database WHERE datname=current_database()")).rows[0];assert.deepEqual(settings,{encoding:'UTF8',collate:'Spanish_Mexico.1252',ctype:'Spanish_Mexico.1252',provider:'c'});
 passed('isolation',{...m,settings,onlyNewCluster:true});
 stage='restore';const toolArgs=['--host='+m.host,'--port='+m.port,'--username='+m.admin,'--no-password','--dbname='+m.database];
 const toolEnv={PGPASSWORD:secrets.admin,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c search_path=public -c timezone=UTC -c statement_timeout=60000'};
 const t=performance.now();const restored=await S.ejecutar('pg_restore.exe',[...toolArgs,'--exit-on-error','--single-transaction','--no-owner','--no-acl','--role='+m.owner,S.BACKUP],toolEnv);
 if(restored.code||restored.err.trim())L.fail('R03B_RESTORE_FAILED');report.restore={seconds:(performance.now()-t)/1000,exitCode:0,noOwner:true,noAcl:true,role:m.owner};
 const meta=await S.metadatos(admin);assert.deepEqual(meta.tables,expected.tables);assert.deepEqual(meta.columns,expected.columns);assert.deepEqual(meta.constraints.map(S.canon),expected.constraints.map(S.canon));assert.deepEqual(meta.indexes,expected.indexes);
 assert.deepEqual(await S.huellasHerramienta('pg_dump.exe',[...toolArgs,'--format=plain','--data-only','--no-owner','--no-acl'],toolEnv),backup);
 const keys=await S.originales(admin,meta),baseline=await S.originales(admin,meta,keys),seq=await S.secuencias(admin,meta);assert.equal(seq.length,17);assert.equal((await S.integridad(admin)).length,18);
 fs.writeFileSync(path.join(m.dir,'baseline-private.json'),JSON.stringify({keys,metadata:meta,baseline,sequences:seq}),{flag:'wx'});
 passed('restore_integrity',{tables:18,reservations:1150,events:136,allRowsMatchBackup:true,sequences:17,fk:18});
 stage='migration_017';await assert.rejects(require('../backend/config/desktopSchema').verifySchema(admin));
 const mt=performance.now();await L.identity(admin,m,m.admin);await admin.query(fs.readFileSync(path.join(L.ROOT,'database/migrations/017_archivo_eventos_integracion.sql'),'utf8'));
 report.migration={executions:1,seconds:(performance.now()-mt)/1000,sha256:S.MIGRATION_HASH};
 await require('../backend/config/desktopSchema').verifySchema(admin);assert.deepEqual(await S.originales(admin,meta,keys),baseline);assert.deepEqual(await S.secuencias(admin,meta),seq);
 passed('migration_017',report.migration);
 stage='runtime_grants';await admin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');await admin.query('GRANT USAGE ON SCHEMA public TO '+S.ident(m.runtime));await admin.query('GRANT CONNECT ON DATABASE '+S.ident(m.database)+' TO '+S.ident(m.runtime));
 const {TABLES}=require('../backend/config/desktopSchema');await admin.query('GRANT SELECT ON TABLE '+TABLES.map(t=>'public.'+S.ident(t)).join(',')+' TO '+S.ident(m.runtime));
 const updates=['usuarios','tours','vehiculos','operadores','guias','operaciones_tour','transportes_operacion','reservaciones','daily_observaciones','eventos_integracion'];
 const inserts=[...updates,'paises','plataformas','bitacora','reservas_integracion_link'];
 await admin.query('GRANT INSERT,UPDATE ON TABLE '+updates.map(t=>'public.'+S.ident(t)).join(',')+' TO '+S.ident(m.runtime));
 await admin.query('GRANT INSERT ON TABLE public.paises,public.plataformas,public.bitacora,public.reservas_integracion_link TO '+S.ident(m.runtime));
 await admin.query('GRANT INSERT,DELETE ON TABLE public.usuario_plataformas_visibles TO '+S.ident(m.runtime));
 for(const table of inserts){const pk=meta.primary.find(p=>p.table_name===table).columns[0];const sequence=(await admin.query('SELECT pg_get_serial_sequence($1,$2) name',['public.'+table,pk])).rows[0].name;assert.ok(/^public\.[a-z_]+$/.test(sequence));await admin.query('GRANT USAGE ON SEQUENCE '+sequence+' TO '+S.ident(m.runtime));}
 await admin.query('ALTER ROLE '+S.ident(m.runtime)+' LOGIN');
 const runtimeRaw=raw(m.runtime,secrets.runtime);
 const controlFunctions=(await runtimeRaw.query("SELECT p.proname,has_function_privilege(current_user,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pg_catalog' AND p.proname LIKE 'pg_control_%' ORDER BY p.proname")).rows;
 report.controlFunctionsDefault=controlFunctions;
 // Ensayar concesión directa, retirando primero los permisos PUBLIC SOLO del clúster nuevo.
 for(const f of controlFunctions){assert.ok(/^pg_control_[a-z]+$/.test(f.proname));await admin.query('REVOKE EXECUTE ON FUNCTION pg_catalog.'+S.ident(f.proname)+'() FROM PUBLIC');}
 const beforeExec=(await runtimeRaw.query("SELECT has_function_privilege(current_user,'pg_catalog.pg_control_system()','EXECUTE') allowed")).rows[0].allowed;assert.equal(beforeExec,false);
 await assert.rejects(require('../backend/config/desktopPostgres').verifyPostgresWithIdentity(runtimeRaw,{DB_NAME:m.database,DB_USER:m.runtime,DB_CLUSTER_ID:m.systemIdentifier},L.labIdentity(m)),e=>e.code==='PG_CLUSTER');
 await admin.query('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO '+S.ident(m.runtime));
 const runtime=L.guardedPool(runtimeRaw,m,m.runtime);await require('../backend/config/desktopPostgres').verifyPostgresWithIdentity(runtime,{DB_NAME:m.database,DB_USER:m.runtime,DB_CLUSTER_ID:m.systemIdentifier},L.labIdentity(m));
 report.privileges={role:m.runtime,updates,inserts,delete:['usuario_plataformas_visibles'],sequenceUsage:14,pgControlSystemBeforeGrant:beforeExec};
 passed('runtime_identity_and_schema',{user:m.runtime,owner:false,privileged:false,clusterVerified:true});
 const cfg={APP_ENVIRONMENT:'release03b-lab',DB_HOST:'localhost',DB_PORT:String(m.port),DB_NAME:m.database,DB_USER:m.runtime,DB_PASSWORD:secrets.runtime,DB_CLUSTER_ID:m.systemIdentifier,DB_SERVER_VERSION:'18.3',DB_SCHEMA_VERSION:'017',JWT_SECRET:secrets.jwt,GYG_GMAIL_SYNC_ENABLED:'false'};
 config(cfg,'runtime.env');config({...cfg,DB_USER:m.admin,DB_PASSWORD:secrets.admin},'privileged.env');L.loadConfig(m,path.join(m.dir,'runtime.env'));
 config({...cfg,DB_NAME:'other'},'contradictory.env');assert.throws(()=>L.loadConfig(m,path.join(m.dir,'contradictory.env')));
 config(cfg,'insecure.env');ps("$p=[Console]::In.ReadToEnd();$a=Get-Acl -LiteralPath $p;$a.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-1-0')),'Read','Allow')));Set-Acl -LiteralPath $p -AclObject $a",path.join(m.dir,'insecure.env'));assert.throws(()=>L.loadConfig(m,path.join(m.dir,'insecure.env')),e=>e.code==='CONFIG_ACL');
 // Restaurar solo la ACL de este archivo ficticio recién creado, nunca ancestros.
 ps("$p=ConvertFrom-Json ([Console]::In.ReadToEnd()); Set-Acl -LiteralPath $p.target -AclObject (Get-Acl -LiteralPath $p.source)",JSON.stringify({target:path.join(m.dir,'insecure.env'),source:path.join(m.dir,'runtime.env')}));
 passed('private_configuration',{realAcl:true,unsafeRejected:true,contradictoryRejected:true,realEnvLoaded:false});
 stage='real_functional_cases';const context={m,admin,runtime,runtimeRaw,raw,report,passed,secrets,barrier,ps,save,seal,meta,keys,baseline};
 await require('./release03bCases.cjs').run(context);
 stage='original_conservation';assert.deepEqual(await S.originales(admin,meta,keys),baseline);assert.equal((await admin.query('SELECT count(*)::int n FROM eventos_integracion WHERE id_evento_integracion=ANY($1::int[]) AND (archived_at IS NOT NULL OR archived_by IS NOT NULL OR archive_reason IS NOT NULL)',[keys.eventos_integracion.map(k=>k.id_evento_integracion)])).rows[0].n,0);
 const finalMeta=await S.metadatos(admin);await require('../backend/config/desktopSchema').verifySchema(runtime);const finalSequences=await S.secuencias(admin,finalMeta);const fks=await S.integridad(admin);assert.equal(fks.length,19);
 report.conservation={allOriginalTablesUnchanged:true,originalReservations:1150,originalEvents:136,events124and126Unmodified:true,sequences:finalSequences.map(s=>({name:s.name,nextIsSafe:s.nextIsSafe})),orphanCounts:fks};passed('original_conservation',report.conservation);
 report.completed=true;
}
async function main(){
 if(process.argv[2]!=='--new-lab'||!process.argv[3])L.fail('R03B_EXPLICIT_NEW_LAB_REQUIRED');
 try{await run(path.resolve(process.argv[3]));}catch(e){report.failure={stage,code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:e.name,operator:e.operator,actual:['boolean','number'].includes(typeof e.actual)?e.actual:typeof e.actual,expected:['boolean','number'].includes(typeof e.expected)?e.expected:typeof e.expected,locations:String(e.stack||'').split('\n').filter(s=>s.trim().startsWith('at ')).slice(0,3)};throw e;}
 finally{
  for(const pool of pools)await pool.end().catch(()=>{});
  if(started){await control('stop');report.serverStopped=!fs.existsSync(path.join(m.data,'postmaster.pid'));}
  report.finishedAt=new Date().toISOString();report.lab=m||null;save(report.completed?'resultado.json':'fallo.json',report);
 }
 console.log('RELEASE03B_LAB_OK');
}
main().catch(e=>{console.error('RELEASE03B_STOPPED '+stage+' '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:e.name));process.exitCode=1;});
