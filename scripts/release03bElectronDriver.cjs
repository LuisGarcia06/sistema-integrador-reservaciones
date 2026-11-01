const L=require('./release03bSafety.cjs'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
async function run({m,admin,report,passed,users,secrets}){
 const results=[];
 for(const scenario of ['wrong-pid','wrong-nonce','wrong-code','wrong-db','wrong-cluster','privileged','schema-incomplete','normal-close','unexpected-exit']){
  let definition;
  if(scenario==='schema-incomplete'){
   definition=(await admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.eventos_integracion'::regclass AND conname='chk_eventos_integracion_archivo'")).rows[0].definition;
   assert.ok(definition.startsWith('CHECK ('));await admin.query('ALTER TABLE public.eventos_integracion DROP CONSTRAINT chk_eventos_integracion_archivo');
  }
  try{
   const r=await new Promise((resolve,reject)=>{
    const child=cp.spawn(require('electron'),[path.join(L.ROOT,'scripts/release03bElectron.cjs'),'--release03b-electron',path.join(m.dir,'manifest.json'),scenario],{cwd:L.ROOT,env:L.S.env(),stdio:['pipe','pipe','pipe','ipc'],windowsHide:true});
    let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
    const timer=setTimeout(()=>{child.kill();reject(Object.assign(Error('timeout'),{code:'R03B_ELECTRON_TIMEOUT'}));},90000);
    child.once('error',()=>{clearTimeout(timer);reject(Object.assign(Error('spawn'),{code:'R03B_ELECTRON_PROCESS'}));});
    child.once('message',msg=>{if(msg?.type==='release03b-input-ready')child.send({users});});
    child.once('close',code=>{clearTimeout(timer);resolve({code,out,err});});child.stdin.end();
   });
   for(const secret of [...Object.values(secrets),...Object.values(users).map(u=>u.password)])assert.ok(!r.out.includes(secret)&&!r.err.includes(secret));
   if(r.code!==0){fs.writeFileSync(path.join(m.dir,'electron-failure-'+scenario+'.txt'),r.out+'\n'+r.err);L.fail('R03B_ELECTRON_'+scenario.replace(/-/g,'_').toUpperCase());}
   const line=r.out.split(/\r?\n/).find(s=>s.startsWith('RELEASE03B_ELECTRON_RESULT '));assert.ok(line);const result=JSON.parse(line.slice('RELEASE03B_ELECTRON_RESULT '.length));assert.equal(result.status,'passed');assert.equal(result.childStopped,true);results.push(result);
  }finally{
   if(definition){await admin.query('ALTER TABLE public.eventos_integracion ADD CONSTRAINT chk_eventos_integracion_archivo '+definition);await require('../backend/config/desktopSchema').verifySchema(admin);}
  }
  passed('electron_'+scenario,{status:'passed',realPostgres:true,port3000Used:false});
 }
 report.electron={cases:results,productionMainRun:false,productionContractChanged:false,controlledInjection:true,allOwnChildrenStopped:true};
}
module.exports={run};
