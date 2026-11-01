'use strict';
// Mantenimiento local explícito. Ningún router ni servidor importa este módulo.
const path=require('node:path'),crypto=require('node:crypto'),bcrypt=require('bcryptjs'),P=require('../config/enterprise026Policy'),CP=require('../security/credentialPolicy'),KEY=require('../config/operationalTransactions').KEY;
const fail=code=>{throw Object.assign(Error(code),{code});};
async function identity(db,plan){await P.maintenanceIdentity(db,plan);const owner=(await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='ctsk_standalone_owner'")).rows[0];if(!owner||owner.rolcanlogin)fail('BOOTSTRAP_OWNER_UNSAFE');}
async function schema(db,plan){
  await db.query('SET LOCAL ROLE ctsk_standalone_runtime');
  if((await db.query(require('../config/desktopPostgres').ROLE_SQL)).rows[0].unsafe!==false)fail('BOOTSTRAP_RUNTIME_UNSAFE');
  await require('../config/credentialSchema').verify(db,plan.manifest.dataGeneration);
  await db.query('SET LOCAL ROLE ctsk_standalone_owner');
}
async function empty(db){
  if((await db.query('SELECT count(*)::int n FROM public.inicializacion_sistema')).rows[0].n!==0)fail('BOOTSTRAP_ALREADY_INITIALIZED');
  if((await db.query('SELECT count(*)::int n FROM public.usuarios')).rows[0].n!==0)fail('BOOTSTRAP_USERS_EXIST');
  const rows=(await db.query("SELECT nombre,min(id_rol)::int id,count(*)::int n FROM public.roles WHERE nombre=ANY($1::text[]) GROUP BY nombre ORDER BY nombre",[['Administrador','Consulta']])).rows;
  if(rows.length!==2||rows.some(r=>r.n!==1))fail('BOOTSTRAP_FUNCTIONAL_ROLES_REQUIRED');return rows.find(r=>r.nombre==='Administrador').id;
}
async function preflight(db,plan){
  await identity(db,plan);await db.query('BEGIN READ ONLY');try{await schema(db,plan);await empty(db);await db.query('ROLLBACK');return {ready:true};}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
function validateInput(input){
  if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!=='confirmacion,correo,nombre,password'||typeof input.nombre!=='string'||!input.nombre.trim()||[...input.nombre.trim()].length>100)fail('BOOTSTRAP_INPUT_INVALID');
  CP.password(input.password);if(input.password!==input.confirmacion)fail('BOOTSTRAP_CONFIRMATION_MISMATCH');return {nombre:input.nombre.trim(),correo:CP.email(input.correo)};
}
async function initialize(db,plan,input,attempt){
  let hash;
  try{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attempt||''))fail('BOOTSTRAP_ATTEMPT_INVALID');
    await preflight(db,plan);const publicInput=validateInput(input);
    const canonical=(await db.query('SELECT public.ctsk_correo_clave_023($1) clave',[publicInput.correo])).rows[0].clave;if(canonical!==publicInput.correo.toLowerCase())fail('EMAIL_NORMALIZATION_REVIEW_REQUIRED');
    hash=await bcrypt.hash(input.password,12); // No bloqueo mientras se captura/calcula.
    input.password=null;input.confirmacion=null;
    await db.query('BEGIN');try{
      await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await db.query("SET LOCAL lock_timeout='2000ms'");
      await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);await identity(db,plan);await schema(db,plan);
      await db.query('LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE');const role=await empty(db);
      const id=(await db.query("INSERT INTO public.usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES ($1,$2,$3,$4,true,'all') RETURNING id_usuario",[role,publicInput.nombre,canonical,hash])).rows[0].id_usuario;
      const m=plan.manifest;await db.query('INSERT INTO public.inicializacion_sistema(singleton,id_inicializacion,id_usuario_inicial,generacion_datos,cluster_id,version_esquema_inicial,huella_herramienta) VALUES (1,$1,$2,$3,$4,23,$5)',[attempt,id,m.dataGeneration,m.cluster,m.code]);
      await db.query('COMMIT');return {estado:'inicializado',id_inicializacion:attempt,id_usuario:id,generacion:m.dataGeneration};
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  }finally{hash=null;if(input){input.password=null;input.confirmacion=null;}}
}
async function inspect(db,plan,attempt){
  await identity(db,plan);await db.query('BEGIN READ ONLY');try{await schema(db,plan);const row=(await db.query('SELECT * FROM public.inicializacion_sistema WHERE singleton=1')).rows[0];if(row&&attempt&&row.id_inicializacion!==attempt)fail('BOOTSTRAP_ATTEMPT_DIFFERENT');await db.query('ROLLBACK');return row||{estado:'sin_constancia'};}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={identity,preflight,validateInput,initialize,inspect};
