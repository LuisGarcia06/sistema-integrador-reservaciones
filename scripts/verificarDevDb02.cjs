// Verificacion real de DB y handlers registrados; no abre HTTP ni Electron.
const g=require('./devDb02.cjs');
async function invoke(router,method,routePath,baseUrl,{body={},query={},params={},token}={}){
 const layer=router.stack.find(l=>l.route?.path===routePath&&l.route.methods[method.toLowerCase()]);
 if(!layer)g.fail('DEV_ROUTE_NOT_FOUND');
 const req={method,body,query,params,baseUrl,route:{path:routePath},headers:token?{authorization:'Bearer '+token}:{}};
 const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;}};
 const steps=[...router.stack.filter(l=>!l.route).map(l=>l.handle),...layer.route.stack.map(l=>l.handle)];
 async function run(i){if(i<steps.length)await steps[i](req,res,()=>run(i+1));}
 await run(0);return res;
}
async function verify(db,passwords){
 const resolved=require.resolve('../backend/config/database');
 if(require.cache[resolved])g.fail('DEV_VERIFICATION_REQUIRES_CLEAN_PROCESS');
 const beforeJwt=process.env.JWT_SECRET;process.env.JWT_SECRET=g.readConfig().JWT_SECRET;
 // Cliente de mantenimiento ya verificado, READ ONLY; ninguna credencial llega a config.
 let queryQueue=Promise.resolve();
 const query=(...args)=>{const result=queryQueue.then(()=>db.query(...args));queryQueue=result.then(()=>{},()=>{});return result;};
 require.cache[resolved]={id:resolved,filename:resolved,loaded:true,exports:{query}};
 const checks=[];function check(name,ok){if(!ok)g.fail('DEV_SMOKE_'+name);checks.push({name,passed:true});}
 try{
 await db.query('BEGIN READ ONLY');await g.verifyIdentity(db);await g.verifySchema(db);
 const auth=require('../backend/routes/auth.routes'),reservations=require('../backend/routes/reservaciones.routes'),dashboard=require('../backend/routes/dashboard.routes'),users=require('../backend/routes/usuarios.routes'),daily=require('../backend/routes/daily.routes');
 const manifest=require('node:fs').readFileSync(require('node:path').join(g.LAB,'initialization.json'),'utf8'),fixture=JSON.parse(manifest);
 const sql=(await db.query("SELECT count(*)::int n,COALESCE(sum(pax),0)::int pax FROM reservaciones WHERE fecha=$1 AND estado=ANY($2::varchar[])",[fixture.test_date,['Pendiente','Confirmada','Activa']])).rows[0];
 const selected=(await db.query("SELECT count(*)::int n,COALESCE(sum(r.pax),0)::int pax FROM reservaciones r JOIN plataformas p USING(id_plataforma) WHERE fecha=$1 AND estado=ANY($2::varchar[]) AND p.nombre=ANY($3::varchar[])",[fixture.test_date,['Pendiente','Confirmada','Activa'],['FareHarbor','GetYourGuide']])).rows[0];
 const emails=['admin.dev@example.test','consulta.all.dev@example.test','consulta.selected.dev@example.test','consulta.empty.dev@example.test'];
 const results=[];
 for(let i=0;i<emails.length;i++){
  const login=await invoke(auth,'POST','/login','/api/auth',{body:{correo:emails[i],password:passwords[i]}});
  check('LOGIN_'+i,login.statusCode===200&&Boolean(login.body.token));
  const token=login.body.token;const session=await invoke(auth,'GET','/sesion','/api/auth',{token});
  check('SESSION_'+i,session.statusCode===200&&session.body.usuario?.correo===emails[i]);
  const assigned=i===2?fixture.platforms.filter(p=>['GetYourGuide','FareHarbor'].includes(p.nombre)).map(p=>p.id_plataforma).sort((a,b)=>a-b):[];
  check('SCOPE_'+i,session.body.usuario.alcance_plataformas===(i<2?'all':'selected')&&JSON.stringify(session.body.usuario.platform_ids)===JSON.stringify(assigned));
  const list=await invoke(reservations,'GET','/','/api/reservaciones',{token});
  const expected=i<2?6:i===2?4:0;
  check('LIST_'+i,list.statusCode===200&&list.body.total===expected);
  if(i===2){
   check('PLATFORM_FILTER',list.body.datos.every(r=>['FareHarbor','GetYourGuide'].includes(r.plataforma)));
   const foreign=fixture.platforms.find(p=>p.nombre==='Externa').id_plataforma;
   const filtered=await invoke(reservations,'GET','/','/api/reservaciones',{token,query:{id_plataforma:String(foreign)}});
   check('FOREIGN_FILTER_EMPTY',filtered.statusCode===200&&filtered.body.total===0);
   const historical=fixture.reservations.find(r=>r.codigo==='DEV-GYG-HIST').id_reservacion;
   check('HISTORICAL_VISIBLE',(await invoke(reservations,'GET','/:id','/api/reservaciones',{token,params:{id:String(historical)}})).statusCode===200);
  }
  const dash=await invoke(dashboard,'GET','/resumen','/api/dashboard',{token,query:{fecha:fixture.test_date}});
  const oracle=i<2?sql:i===2?selected:{n:0,pax:0};
  check('DASHBOARD_'+i,dash.statusCode===200&&dash.body.metricas.reservaciones_vigentes===oracle.n&&dash.body.metricas.pax_vigentes===oracle.pax);

  // router.use contiene la autorizacion administrativa, se comprueba por separado abajo.
  results.push({correo:emails[i],login:login.statusCode,session:session.statusCode,reservaciones:list.body.total,dashboard:dash.body.metricas});
  if(i>=2){
   const hidden=fixture.reservations.find(r=>r.codigo==='DEV-WA-001').id_reservacion;
   const detail=await invoke(reservations,'GET','/:id','/api/reservaciones',{token,params:{id:String(hidden)}});
   const absent=await invoke(reservations,'GET','/:id','/api/reservaciones',{token,params:{id:'2147483647'}});
   check('HIDDEN_404_'+i,detail.statusCode===404&&absent.statusCode===404);
  }
 }
 for(let i=1;i<emails.length;i++){
  const login=await invoke(auth,'POST','/login','/api/auth',{body:{correo:emails[i],password:passwords[i]}});
  check('USERS_FORBIDDEN_'+i,(await invoke(users,'GET','/','/api/usuarios',{token:login.body.token})).statusCode===403);
  if(i>=2)check('DAILY_FORBIDDEN_'+i,(await invoke(daily,'GET','/operativo','/api/daily',{token:login.body.token,query:{fecha:fixture.test_date}})).statusCode===403);
  const write=await invoke(reservations,'POST','/','/api/reservaciones',{token:login.body.token,body:{}});
  check('WRITE_FORBIDDEN_'+i,write.statusCode===403);
 }
 await db.query('ROLLBACK');
 const report={transport:'registered_handlers_in_process_no_http_listener',checks,profiles:results,oracle:{date:fixture.test_date,all:sql,selected},passed:checks.length};
 g.writeJson('verification.json',report);return report;
 }finally{await db.query('ROLLBACK').catch(()=>{});delete require.cache[resolved];if(beforeJwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=beforeJwt;}
}
module.exports={verify,invoke};

