const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../shared/lanContract'),P=require('../backend/config/standalonePolicy');
const clientPolicy=require('../electron/lanClientPolicy'),{checkAcl}=require('../shared/windowsConfigAcl');
const root=path.resolve(__dirname,'..');
// Exportación por lista positiva. Nunca copiar recursivamente el repositorio o un directorio del servidor.
function exportClient(destination,config,publicDirectory){
    if(path.dirname(destination)!==fs.realpathSync(process.env.LOCALAPPDATA||'invalid')||
        !/^ctsk-lan-client-[a-f0-9]{12}$/.test(path.basename(destination))||fs.realpathSync(destination)!==destination||fs.readdirSync(destination).length)C.fail('LAN_NEW_CLIENT_REQUIRED');
    C.exactKeys(config,clientPolicy.KEYS);C.validateEndpoint(config);
    if(config.clientCode!==clientPolicy.fingerprint(root))C.fail('LAN_CLIENT_CODE_CHANGED');
    for(const file of clientPolicy.FILES){
        const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.copyFileSync(path.join(root,file),target,fs.constants.COPYFILE_EXCL);
    }
    const out=path.join(destination,'client');fs.mkdirSync(out);
    for(const file of ['ca.pem','identity-public.pem']){
        const bytes=fs.readFileSync(path.join(publicDirectory,file));
        if(/PRIVATE KEY/.test(bytes.toString()))C.fail('LAN_PRIVATE_MATERIAL_REJECTED');
        if(C.sha(bytes)!==(file==='ca.pem'?config.caDigest:config.publicKeyDigest))C.fail('LAN_PUBLIC_FILE_CHANGED');
        fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});
    }
    fs.writeFileSync(path.join(out,'client.json'),JSON.stringify(config,null,2),{flag:'wx'});
    fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify({name:'ctsk-private-lan-lab-client',version:'0.0.0',private:true,main:'electron/lanEntry.js'},null,2),{flag:'wx'});
    if(clientPolicy.fingerprint(destination)!==config.clientCode)C.fail('LAN_EXPORT_CHANGED');
    checkAcl(path.join(out,'client.json'));
    return out;
}
async function prepare(directory,destination,topologyFile,name){
    // El inventario y la aprobación se verifican ANTES de crear/iniciar PostgreSQL.
    C.cleanClientEnvironment();checkAcl(topologyFile);
    const network=C.validateTopology(JSON.parse(fs.readFileSync(topologyFile)));C.verifyLocal(network,'server');
    if(!/^[a-z][a-z0-9-]{0,40}\.ctsk-lab\.test$/.test(name||''))C.fail('LAN_NAME_REQUIRED');
    const m=await require('./standaloneDev.cjs').prepare(directory);
    try{
        const pki=path.join(directory,'lan-pki');fs.mkdirSync(pki);
        require('./httpsCertificates.cjs').generate(pki,{address:network.server.address,name});
        const server=path.join(directory,'lan-server');fs.mkdirSync(server);
        for(const file of ['tls-key.pem','tls-cert.pem','identity-private.pem'])fs.copyFileSync(path.join(pki,'server',file),path.join(server,file));
        for(const file of ['ca.pem','identity-public.pem'])fs.copyFileSync(path.join(pki,'client',file),path.join(server,file));
        const config={version:1,environment:C.ENVIRONMENT,protocol:C.PROTOCOL,serverId:crypto.randomUUID(),
            address:network.server.address,port:m.httpPort,name,origin:`https://${network.server.address}:${m.httpPort}`,
            code:m.code,clientCode:clientPolicy.fingerprint(root),network,
            caDigest:C.sha(fs.readFileSync(path.join(server,'ca.pem'))),publicKeyDigest:C.sha(fs.readFileSync(path.join(server,'identity-public.pem'))),
            tlsSpki:require('../backend/config/httpsLabPolicy').spki(fs.readFileSync(path.join(server,'tls-cert.pem')))};
        const filename=path.join(server,'lan-server.json');fs.writeFileSync(filename,JSON.stringify(config,null,2),{flag:'wx'});
        require('../backend/config/lanLabPolicy').readServer(filename);
        await require('./httpsLab.cjs').seed(m);
        exportClient(destination,config,server);
        return {server:filename,client:path.join(destination,'client/client.json'),database:m.database,httpsPort:m.httpPort,postgresLoopbackPort:m.pgPort};
    }finally{require('./standaloneDev.cjs').control(m,'stop');}
}
function firewallPlan(config){
    C.validateEndpoint(config);
    return {Name:'CTSK-LAN-LAB-'+config.network.networkId,DisplayName:'CTSK laboratorio aislado',
        Direction:'Inbound',Action:'Allow',Protocol:'TCP',LocalAddress:config.address,LocalPort:config.port,
        RemoteAddress:config.network.client.address,Profile:'Private',EdgeTraversalPolicy:'Block',
        InterfaceGuid:config.network.server.adapter,NetworkId:config.network.networkId};
}
function startDatabase(filename){
    const plan=require('../backend/config/lanLabPolicy').readServer(filename),m=plan.manifest;
    const read=file=>{const p=path.join(m.dataDirectory,file);checkAcl(p);return fs.readFileSync(p,'utf8');};
    if(fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')))C.fail('LAN_DATABASE_ALREADY_RUNNING');
    const conf=read('postgresql.conf').split(/\r?\n/).filter(line=>line.trim()&&!line.trim().startsWith('#'));
    const settings=Object.fromEntries(conf.map(line=>{const pair=/^\s*([a-z_]+)\s*=\s*([^#]*?)(?:\s*#.*)?$/.exec(line);if(!pair)C.fail('LAN_PG_CONFIG');return [pair[1],pair[2].trim()];}));
    if(settings.listen_addresses!=="'127.0.0.1'"||settings.port!==String(m.pgPort)||Object.keys(settings).some(k=>k.startsWith('include'))||
        read('postgresql.auto.conf').split(/\r?\n/).some(line=>line.trim()&&!line.trim().startsWith('#')))C.fail('LAN_PG_CONFIG');
    const info=require('node:child_process').execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_controldata.exe',[m.dataDirectory],{encoding:'utf8',windowsHide:true,timeout:10000});
    if(info.match(/(?:identifier|identificador)[^\r\n]*?([0-9]{19,20})/i)?.[1]!==m.cluster)C.fail('LAN_PG_CLUSTER');
    require('./standaloneDev.cjs').control(m,'start');P.verifyLocalCluster(m);
}
async function verifyComponents(directory,destination){
    C.cleanClientEnvironment();
    if(path.dirname(directory)!==fs.realpathSync(process.env.LOCALAPPDATA)||!/^ctsk-standalone-[a-f0-9]{12}$/.test(path.basename(directory))||fs.realpathSync(directory)!==directory||fs.readdirSync(directory).length)C.fail('LAN_NEW_DIRECTORY_REQUIRED');
    fs.writeFileSync(path.join(directory,'lab.marker'),'SYNTHETIC_COMPONENTS_NO_POSTGRES',{flag:'wx'});checkAcl(path.join(directory,'lab.marker'));
    // Estas identidades aleatorias son fixtures. Jamás se usan para iniciar escucha LAN.
    const sample=(address)=>({machine:crypto.randomBytes(32).toString('hex'),adapter:crypto.randomUUID(),address,prefix:24,category:'Private',gateways:[],dns:[],activeAdapters:1});
    const network={version:1,networkId:crypto.randomUUID(),topology:'internal-vm-network',isolatedNetworkConfirmed:true,
        approvedBy:'SYNTHETIC FIXTURE - NOT NETWORK APPROVAL',expiresAt:new Date(Date.now()+86400000).toISOString(),server:sample('192.168.250.10'),client:sample('192.168.250.11')};
    const pki=path.join(directory,'pki');fs.mkdirSync(pki);require('./httpsCertificates.cjs').generate(pki,{address:network.server.address,name:'server.ctsk-lab.test'});
    const server=path.join(pki,'server'),pub=path.join(pki,'client'),x=new crypto.X509Certificate(fs.readFileSync(path.join(server,'tls-cert.pem'))),authority=new crypto.X509Certificate(fs.readFileSync(path.join(pub,'ca.pem')));
    if(!x.verify(authority.publicKey)||x.checkIP(network.server.address)!==network.server.address||x.checkHost('server.ctsk-lab.test')!=='server.ctsk-lab.test')C.fail('LAN_CERTIFICATE_FIXTURE');
    const config={version:1,environment:C.ENVIRONMENT,protocol:2,serverId:crypto.randomUUID(),origin:'https://192.168.250.10:49152',address:network.server.address,port:49152,name:'server.ctsk-lab.test',code:P.codeFingerprint(root),clientCode:clientPolicy.fingerprint(root),network,
        caDigest:C.sha(fs.readFileSync(path.join(pub,'ca.pem'))),publicKeyDigest:C.sha(fs.readFileSync(path.join(pub,'identity-public.pem'))),tlsSpki:require('../backend/config/httpsLabPolicy').spki(x.raw)};
    const rejectedServer=path.join(directory,'lan-server');fs.mkdirSync(rejectedServer);
    const rejectedFile=path.join(rejectedServer,'lan-server.json');fs.writeFileSync(rejectedFile,JSON.stringify(config));
    const probeEnv=require('../backend/config/desktopPolicy').cleanEnvironment();delete probeEnv.ELECTRON_RUN_AS_NODE;
    const serverProbe=require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'lanServerProbe.cjs'),rejectedFile],{encoding:'utf8',windowsHide:true,timeout:30000,env:probeEnv});
    if(!serverProbe.includes('LAN_SERVER_REJECTED_SAFELY_NO_POSTGRES_NO_LISTENER'))C.fail('LAN_SERVER_PROBE_FAILED');
    exportClient(destination,config,pub);
    const imported=require('node:child_process').execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile','-NonInteractive','-File',path.join(destination,'scripts/ImportLanClient.ps1'),'-Source',destination],
        {encoding:'utf8',windowsHide:true,timeout:30000}).trim();
    if(path.dirname(imported)!==fs.realpathSync(process.env.LOCALAPPDATA)||!/^ctsk-lan-client-[a-f0-9]{12}$/.test(path.basename(imported)))C.fail('LAN_IMPORT_DESTINATION');
    const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
    const child=require('node:child_process').spawn(require('electron'),[path.join(__dirname,'lanClientProbe.cjs'),imported],
        {cwd:imported,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
    const exit=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(Error('LAN_CLIENT_PROBE_TIMEOUT'));},45000);
        child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    const report={completed:exit===0&&out.includes('LAN_CLIENT_REJECTED_SAFELY_NO_SERVER_NO_NETWORK'),certificatePrivateIPAndName:true,
        publicExportFingerprint:config.clientCode,publicImportFingerprint:clientPolicy.fingerprint(imported),imported,postgresUsed:false,lanListenerOpened:false,firewallChanged:false,
        probe:'real Node server and real Electron client reject unapproved local network before DB/listen/connect',physicalTwoHostConnection:'NOT_EXECUTED'};
    fs.writeFileSync(path.join(directory,'lan-components-verification.json'),JSON.stringify(report,null,2));
    if(!report.completed)throw Error('LAN_CLIENT_PROBE_FAILED '+err.slice(-250));
    console.log(JSON.stringify({directory,destination,...report},null,2));
}
async function main(argv=process.argv.slice(2)){
    const [mode,...args]=argv;
    if(mode==='Inspect'&&!args.length){console.log(JSON.stringify(C.inspectLocal(),null,2));return;}
    if(mode==='Prepare'&&args.length===4){console.log(JSON.stringify(await prepare(...args),null,2));return;}
    if(mode==='VerifyComponents'&&args.length===2){await verifyComponents(...args);return;}
    if(mode==='FirewallPlan'&&args.length===1){const plan=require('../backend/config/lanLabPolicy').readServer(args[0]);console.log(JSON.stringify(firewallPlan(plan.endpoint),null,2));return;}
    if(mode==='StartDatabase'&&args.length===1){startDatabase(args[0]);console.log('LAN_POSTGRES_LOOPBACK_READY');return;}
    if(mode==='StopDatabase'&&args.length===1){
        const lab=path.dirname(path.dirname(args[0]));
        const plan=P.readDatabasePlan(path.join(lab,'manifest.json'));
        require('./standaloneDev.cjs').control(plan.manifest,'stop');console.log('LAN_POSTGRES_STOPPED');return;
    }
    C.fail('LAN_TOOLS_ARGUMENTS');
}
if(require.main===module)main().catch(e=>{console.error('LAN_TOOLS_REJECTED '+(e.code||e.message||'FAILED'));process.exitCode=1;});
module.exports={prepare,exportClient,firewallPlan,startDatabase,main};
