'use strict';
const crypto=require('node:crypto'),readline=require('node:readline/promises'),{Writable}=require('node:stream');
const P=require('../backend/config/enterprise026Policy'),service=require('../backend/services/enterprise026Bootstrap.service');
function localCapture(input=process.stdin,output=process.stdout){
  if(!input.isTTY||!output.isTTY)throw Object.assign(Error('LOCAL_TTY_REQUIRED'),{code:'LOCAL_TTY_REQUIRED'});
  let muted=false;const terminal=new Writable({write(chunk,_encoding,done){if(!muted)output.write(chunk);done();}});terminal.isTTY=true;terminal.columns=output.columns;
  const rl=readline.createInterface({input,output:terminal,terminal:true,historySize:0,removeHistoryDuplicates:true});
  async function ask(prompt,hidden=false){muted=hidden;output.write(prompt);try{return await rl.question('');}finally{if(hidden)output.write('\n');muted=false;rl.history=[];rl.line='';}}
  return {ask,close(){rl.history=[];rl.line='';rl.close();terminal.end();}};
}
async function connection(plan,sqlPassword){const m=plan.manifest,db=new(require('pg').Client)({host:'127.0.0.1',port:m.pgPort,database:m.database,user:P.SQL_PRINCIPAL,password:sqlPassword,connectionTimeoutMillis:5000,query_timeout:10000});db.on('error',()=>{});await db.connect();return db;}
async function main(argv=process.argv.slice(2)){
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 if(argv.length!==4||argv[0]!=='--server'||argv[2]!=='--authority')throw Object.assign(Error('BOOTSTRAP_ARGUMENTS_INVALID'),{code:'BOOTSTRAP_ARGUMENTS_INVALID'});
 const plan=P.readPlan(argv[1],argv[3]),capture=localCapture();let db,sqlPassword,input;
 try{sqlPassword=await capture.ask('Clave técnica local autorizada (sin eco): ',true);db=await connection(plan,sqlPassword);sqlPassword=null;await service.preflight(db,plan);const attempt=crypto.randomUUID();input={nombre:await capture.ask('Nombre del primer Administrador: '),correo:await capture.ask('Correo: '),password:await capture.ask('Contraseña nueva (sin eco): ',true),confirmacion:await capture.ask('Confirmación (sin eco): ',true)};service.validateInput(input);if(await capture.ask('Escribe INICIALIZAR para confirmar: ')!=='INICIALIZAR')throw Object.assign(Error('BOOTSTRAP_CANCELLED'),{code:'BOOTSTRAP_CANCELLED'});const created=await service.initialize(db,plan,input,attempt);const proof=P.sign(plan.signingKey,{purpose:'ctsk-bootstrap-completed026-v1',attempt,user:created.id_usuario,cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,code:plan.manifest.code,installationId:plan.manifest.installationId});const file=require('node:path').join(plan.manifest.directory,'bootstrap-completed026.json');require('node:fs').writeFileSync(file,JSON.stringify(proof,null,2),{flag:'wx'});process.stdout.write('BOOTSTRAP_COMPLETED_REENROLLMENT_REQUIRED\n');
 }finally{sqlPassword=null;if(input){input.password=null;input.confirmacion=null;}capture.close();await db?.end();}
}
if(require.main===module)main().catch(e=>{console.error('BOOTSTRAP_FAILED '+(/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'LOCAL_INITIALIZATION_FAILED'));process.exitCode=1;});
module.exports={main,localCapture,connection};
