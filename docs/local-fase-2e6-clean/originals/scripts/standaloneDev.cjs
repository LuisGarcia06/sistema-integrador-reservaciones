// Solo clúster NUEVO con datos sintéticos. Sin lectura de .env, respaldos o secretos existentes.
const fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto'), net = require('node:net');
const assert = require('node:assert/strict'), http = require('node:http');
const P = require('../backend/config/standalonePolicy');
const root = path.resolve(__dirname, '..'), bin = 'C:/Program Files/PostgreSQL/18/bin';
const random = () => crypto.randomBytes(32).toString('hex');
const clean = () => { const e = require('../backend/config/desktopPolicy').cleanEnvironment(); delete e.ELECTRON_RUN_AS_NODE; return e; };
function tool(name, args) {
    return cp.execFileSync(path.join(bin, name + '.exe'), args, { env: clean(), windowsHide: true, encoding: 'utf8', timeout: 45000 });
}
function validateDirectory(dir) {
    assert.equal(path.dirname(dir), fs.realpathSync(process.env.LOCALAPPDATA));
    assert.match(path.basename(dir), /^ctsk-standalone-[a-f0-9]{12}$/);
    assert.equal(fs.realpathSync(dir), dir);
}
function control(m, action) {
    validateDirectory(m.directory);
    assert.equal(m.dataDirectory, path.join(m.directory, 'data'));
    assert.equal(fs.realpathSync(m.dataDirectory), m.dataDirectory);
    if (action === 'stop') P.verifyLocalCluster(m);
    const args = action === 'start' ? ['start', '-w', '-t', '30', '-D', m.dataDirectory, '-l', path.join(m.directory, 'postgres.log')]
        : ['stop', '-m', 'fast', '-w', '-t', '15', '-D', m.dataDirectory];
    // PostgreSQL en Windows debe iniciarse sin ventana y sin heredar pipes del llamador.
    const input = JSON.stringify({ exe: path.join(bin, 'pg_ctl.exe'), args });
    const script = '$v=ConvertFrom-Json ([Console]::In.ReadToEnd());$p=Start-Process -FilePath $v.exe -ArgumentList $v.args -WindowStyle Hidden -PassThru;$p.WaitForExit();exit $p.ExitCode';
    cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { input, env: clean(), windowsHide: true, timeout: 45000, stdio: ['pipe', 'pipe', 'pipe'] });
}
async function freePort() {
    const s = net.createServer(); await new Promise((yes, no) => { s.once('error', no); s.listen(0, P.HOST, yes); });
    const port = s.address().port; await new Promise(r => s.close(r));
    return P.validPort(port) ? port : freePort();
}
function barrier(port) {
    const connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        const v = Array.isArray(args[0]) ? args[0] : args, t = v[0];
        const h = t && typeof t === 'object' ? t.host : v[1], p = t && typeof t === 'object' ? t.port : t;
        if (h !== P.HOST || Number(p) !== port) P.fail('STANDALONE_NETWORK_BLOCKED');
        return connect.apply(this, args);
    };
    return () => { net.Socket.prototype.connect = connect; };
}
async function prepare(dir, labOptions = {}) {
    const provisionEnvironment = {...process.env};
    const emptyBootstrap = labOptions.profile === 'empty-bootstrap-lab';
    const commands = labOptions.profile === 'command-api-lab';
    const api = labOptions.profile === 'revision-api-lab' || commands;
    const revision = labOptions.profile === 'revision-schema-lab' || api;
    if (Object.keys(labOptions).some(k=>!['profile','revisionAudit','bootstrapAudit'].includes(k)) ||
        (labOptions.profile !== undefined && !revision && !emptyBootstrap) || (labOptions.revisionAudit !== undefined && (!revision || typeof labOptions.revisionAudit !== 'function')) ||
        (labOptions.bootstrapAudit !== undefined && (!emptyBootstrap || typeof labOptions.bootstrapAudit !== 'function'))) throw Error('LAB_PROFILE_INVALID');
    const RP = revision ? require(commands ? '../backend/config/commandApiPolicy' : api ? '../backend/config/revisionApiPolicy' : '../backend/config/revisionLabPolicy') : null;
    validateDirectory(dir); assert.deepEqual(fs.readdirSync(dir), []);
    const marker=path.join(dir,'lab.marker');fs.writeFileSync(marker,'NEW_SYNTHETIC_CLUSTER_ONLY',{flag:'wx'});
    require('../backend/config/windowsConfigAcl').checkAcl(marker);
    for (const name of ['initdb','postgres','pg_ctl','pg_controldata']) assert.match(tool(name, ['--version']), /18\.3/);
    const pgPort = await freePort(); let httpPort; do { httpPort = await freePort(); } while (httpPort === pgPort);
    const dataDirectory = path.join(dir, 'data'), pwFile = path.join(dir, 'init-password.tmp');
    const adminPassword = random(), runtimePassword = random(), jwt = random(), appPassword = random();
    fs.writeFileSync(pwFile, adminPassword, { flag: 'wx' });
    try { tool('initdb', ['-D', dataDirectory, '-U', 'ctsk_standalone_admin', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + pwFile]); }
    finally { fs.unlinkSync(pwFile); }
    fs.appendFileSync(path.join(dataDirectory, 'postgresql.conf'), `\nlisten_addresses='127.0.0.1'\nport=${pgPort}\nunix_socket_directories=''\nlog_statement='none'\nlog_min_error_statement='panic'\n`);
    const cluster = tool('pg_controldata', [dataDirectory]).match(/(?:identifier|identificador)[^\r\n]*?([0-9]{19,20})/i)?.[1];
    assert.ok(cluster && cluster !== P.PROTECTED_CLUSTER);
    const m = { version: 1, environment: 'standalone-development', root, directory: dir, dataDirectory, host: P.HOST,
        pgPort, httpPort, database: 'ctsk_standalone_' + crypto.randomBytes(6).toString('hex') + '_test',
        runtime: 'ctsk_standalone_runtime', cluster, code: P.codeFingerprint(root), configDigest: '0'.repeat(64) };
    if (revision) Object.assign(m,{version:commands?4:api?3:2,environment:RP.ENVIRONMENT,purpose:RP.PURPOSE,dataGeneration:crypto.randomUUID()});
    if (api) Object.assign(m,{protocol:RP.PROTOCOL,etagKeyDigest:'0'.repeat(64)});
    if (commands) m.commandKeyDigest='0'.repeat(64);
    (RP || P).validateManifest(m, root);
    let started = false, admin, restore;
    try {
        control(m, 'start'); started = true; P.verifyLocalCluster(m); restore = barrier(pgPort);
        const { Client } = require('pg');
        const options = { host: P.HOST, port: pgPort, user: 'ctsk_standalone_admin', password: adminPassword,
            database: 'postgres', connectionTimeoutMillis: 5000 };
        admin = new Client(options); await admin.connect();
        async function check(client, database) {
            const r = (await client.query("SELECT current_database() db,current_user username,inet_server_port() port,current_setting('data_directory') data,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
            assert.equal(r.db, database); assert.equal(r.port, pgPort); assert.equal(r.cluster, cluster);
            assert.equal(r.username, options.user); assert.equal(path.resolve(r.data), dataDirectory);
        }
        await check(admin, 'postgres');
        assert.deepEqual((await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r => r.datname), ['postgres','template0','template1']);
        await admin.query('CREATE ROLE ctsk_standalone_owner NOLOGIN');
        await admin.query('CREATE ROLE ctsk_standalone_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
        await admin.query("SELECT set_config('standalone.password',$1,false)", [runtimePassword]);
        await admin.query("DO $$ BEGIN EXECUTE format('ALTER ROLE ctsk_standalone_runtime PASSWORD %L',current_setting('standalone.password')); END $$");
        await admin.query('CREATE DATABASE ' + m.database + ' OWNER ctsk_standalone_owner TEMPLATE template0');
        await admin.query('REVOKE ALL ON DATABASE ' + m.database + ' FROM PUBLIC');
        await admin.query('GRANT CONNECT ON DATABASE ' + m.database + ' TO ctsk_standalone_runtime');
        await admin.end(); admin = new Client({ ...options, database: m.database }); await admin.connect(); await check(admin, m.database);
        assert.equal((await admin.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
        await admin.query('SET ROLE ctsk_standalone_owner');
        await admin.query(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
        await admin.query('RESET ROLE');
        await admin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
        await admin.query('GRANT USAGE ON SCHEMA public TO ctsk_standalone_runtime');
        await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ctsk_standalone_runtime');
        await admin.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ctsk_standalone_runtime');
        await admin.query('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ctsk_standalone_runtime');
        const roles = await admin.query("INSERT INTO roles(nombre,descripcion) VALUES ('Administrador','Prueba sintética'),('Consulta','Prueba sintética') RETURNING id_rol,nombre");
        if(!emptyBootstrap){
            const hash = await require('bcryptjs').hash(appPassword, 10);
            for (const r of roles.rows) await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES ($1,$2,$3,$4,true,'all')",
                [r.id_rol, 'Usuario sintético ' + r.nombre, r.nombre.toLowerCase() + '@standalone.example.test', hash]);
        }
        let revisionFixtures;
        if (revision) revisionFixtures = await require('./revisionFixtures.cjs').migrateNewCluster(admin,m);
        if (commands) await require('./commandFixtures.cjs').migrateNewCluster(admin,m);
        const c = { APP_ENVIRONMENT: m.environment, DB_HOST: 'localhost', DB_PORT: String(pgPort), DB_NAME: m.database,
            DB_USER: m.runtime, DB_PASSWORD: runtimePassword, DB_CLUSTER_ID: cluster, DB_SERVER_VERSION: '18.3',
            DB_SCHEMA_VERSION: revision ? RP.SCHEMA : '017', JWT_SECRET: jwt, JWT_EXPIRES_IN: '8h', GYG_GMAIL_SYNC_ENABLED: 'false' };
        const config = Object.entries(c).map(([k,v]) => k + '=' + v).join('\n') + '\n'; m.configDigest = P.sha(config);
        fs.writeFileSync(path.join(dir, 'runtime.env'), config, { flag: 'wx' });
        if (api) { const key=random(); fs.writeFileSync(path.join(dir,'preconditions.key'),key,{flag:'wx'});m.etagKeyDigest=P.sha(key); }
        if (commands) { const key=random(); fs.writeFileSync(path.join(dir,'commands.key'),key,{flag:'wx'});m.commandKeyDigest=P.sha(key); }
        if (!revision) fs.writeFileSync(path.join(dir, 'service.key'), random(), { flag: 'wx' });
        if(!emptyBootstrap)fs.writeFileSync(path.join(dir, 'test-user.json'), JSON.stringify({ correo: 'administrador@standalone.example.test', password: appPassword }), { flag: 'wx' });
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
        const plan = (RP || P).readPlan(path.join(dir, 'manifest.json'));
        const runtime = new Client({ host:P.HOST,port:pgPort,database:m.database,user:m.runtime,password:runtimePassword });
        await runtime.connect();
        try {
            const pool = { connect:async()=>({query:runtime.query.bind(runtime),release(){}}) };
            if (revision) {
                try { await RP.verify(pool,plan); }
                catch (error) {
                    // Solo metadatos del laboratorio nuevo: facilita diagnosticar un
                    // rechazo estricto sin permitir continuar ni registrar secretos.
                    const metadata = (await runtime.query(require('../backend/config/revisionSchema').SQL,
                        [Object.keys(require('../backend/config/revisionSchemaContract').TABLES),require('../backend/config/revisionSchemaContract').FUNCTION])).rows[0];
                    fs.writeFileSync(path.join(dir,'revision-schema-diagnostics.json'),JSON.stringify(metadata,null,2));
                    throw error;
                }
            }
            else await require('../backend/config/desktopPostgres').verifyPostgresWithIdentity(pool, c, (r,cfg)=>P.validateIdentity(r,cfg,m));
        }
        finally { await runtime.end(); }
        if (revision && labOptions.revisionAudit) {
            try { await labOptions.revisionAudit({admin,plan,fixtures:revisionFixtures}); }
            finally { process.env = provisionEnvironment; }
        }
        if(emptyBootstrap&&labOptions.bootstrapAudit){
            try{await labOptions.bootstrapAudit({admin,plan,sqlPassword:adminPassword});}
            finally{process.env=provisionEnvironment;}
        }
        await admin.end(); admin = null;
        return m;
    } catch (e) { if (admin) await admin.end().catch(()=>{}); if (revision) process.env = provisionEnvironment; if (started) control(m, 'stop'); throw e; }
    finally { restore?.(); }
}
async function request(port, pathname, body, token) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const req = http.request({ host:P.HOST,port,path:pathname,method:data?'POST':'GET',timeout:4000,agent:false,
            headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})} }, res=>{
            let text='';res.on('data',c=>text+=c);res.on('end',()=>{let value;try{value=JSON.parse(text);}catch{value=text;}resolve({status:res.statusCode,body:value});});
        });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));req.end(data);
    });
}
function waitFor(child, marker, timeout=60000) {
    return new Promise((resolve,reject)=>{
        let text='';const timer=setTimeout(()=>done(Error('CHILD_TIMEOUT')),timeout);
        function done(error){clearTimeout(timer);child.stdout.off('data',data);child.off('exit',closed);error?reject(error):resolve(text);}
        function data(c){text+=c;if(text.includes(marker))done();}
        function closed(){done(Error('CHILD_EXIT'));}child.stdout.on('data',data);child.once('exit',closed);
    });
}
async function verify(m) {
    const manifest=path.join(m.directory,'manifest.json'), report={realPostgres:true,realElectron:true,
        host:m.host,database:m.database,pgPort:m.pgPort,httpPort:m.httpPort,cluster:m.cluster,checks:[]};
    let service;
    const stopChild=async child=>{if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}};
    try {
        service=cp.spawn(process.execPath,[path.join(root,'backend/standalone.js'),'--manifest',manifest],{cwd:root,env:clean(),windowsHide:true,stdio:['ignore','pipe','pipe']});
        let diagnostics='';service.stderr.on('data',c=>diagnostics+=c);await waitFor(service,'STANDALONE_READY');
        assert.equal((await request(m.httpPort,'/api/reservaciones')).status,401);report.checks.push('API requires login');
        const credentials=JSON.parse(fs.readFileSync(path.join(m.directory,'test-user.json')));
        const login=await request(m.httpPort,'/api/auth/login',credentials);assert.equal(login.status,200);
        assert.equal((await request(m.httpPort,'/api/reservaciones',undefined,login.body.token)).status,200);
        assert.equal((await request(m.httpPort,'/api/integraciones')).status,503);report.checks.push('Synthetic login and authenticated API; integrations blocked');
        const result=await require('./standaloneElectronCheck.cjs').run({m,root,clean,request});
        report.checks.push(...result);
        assert.equal(service.exitCode,null);assert.equal((await request(m.httpPort,'/api/reservaciones',undefined,login.body.token)).status,200);
        report.checks.push('Backend and authenticated API survive Electron exit');
        await stopChild(service);service=null;
        await assert.rejects(request(m.httpPort,'/'));report.checks.push('Explicit backend stop releases its port');
        report.completed=true;
    } finally { await stopChild(service);fs.writeFileSync(path.join(m.directory,'verification.json'),JSON.stringify(report,null,2)); }
    console.log(JSON.stringify(report));
}
async function main(){
    const [mode,dir]=process.argv.slice(2);assert.ok(['Prepare','Verify','Stop'].includes(mode));assert.ok(path.isAbsolute(dir||''));
    if(mode==='Stop'){const plan=P.readPlan(path.join(dir,'manifest.json'));control(plan.manifest,'stop');console.log('ISOLATED_POSTGRES_STOPPED');return;}
    const m=await prepare(dir);console.log('MANIFEST '+path.join(dir,'manifest.json'));
    if(mode==='Verify'){
        try{await verify(m);}finally{
            control(m,'stop');
            const filename=path.join(m.directory,'verification.json');
            if(fs.existsSync(filename)){
                const report=JSON.parse(fs.readFileSync(filename));report.postgresStopped=!fs.existsSync(path.join(m.dataDirectory,'postmaster.pid'));
                fs.writeFileSync(filename,JSON.stringify(report,null,2));
            }
        }
    }
}
if(require.main===module)main().catch(e=>{console.error('STANDALONE_LAB_FAILED '+(e.code||e.name));process.exitCode=1;});
module.exports={prepare,verify,request,control};
