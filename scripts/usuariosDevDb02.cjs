const fs=require('node:fs'),path=require('node:path'),{Client}=require('pg'),bcrypt=require('bcryptjs'),g=require('./devDb02.cjs');
async function readInput(){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>8192)g.fail('DEV_INPUT_TOO_LARGE');}try{return JSON.parse(text);}catch{g.fail('DEV_INPUT_INVALID');}}
async function main(){
 const payload=await readInput(),passwords=payload.passwords;
 if(!Array.isArray(passwords)||passwords.length!==4||passwords.some(p=>typeof p!=='string'||p.length<8||Buffer.byteLength(p)>72)||new Set(passwords).size!==4)g.fail('DEV_PASSWORD_POLICY');
 const cfg=require('dotenv').parse(fs.readFileSync(path.join(g.ROOT,'.env')));
 const db=new Client({host:'localhost',port:5432,database:g.DATABASE,user:cfg.DB_USER,password:cfg.DB_PASSWORD,connectionTimeoutMillis:5000,application_name:'DEV-DB-02-user-provisioning'});
 try{await db.connect();await db.query('BEGIN');await g.verifyIdentity(db,{username:cfg.DB_USER});await g.verifySchema(db);
 if(process.argv[2]!=='--verify'){
  await db.query('LOCK TABLE usuarios,usuario_plataformas_visibles IN SHARE ROW EXCLUSIVE MODE');
  if((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n!==0)g.fail('DEV_USERS_ALREADY_EXIST');
  const roles=(await db.query('SELECT id_rol,nombre FROM roles')).rows,platforms=(await db.query('SELECT id_plataforma,nombre FROM plataformas WHERE nombre=ANY($1::varchar[])',[['GetYourGuide','FareHarbor']])).rows;
  const roleId=name=>{const rows=roles.filter(r=>r.nombre===name);if(rows.length!==1)g.fail('DEV_ROLE_AMBIGUOUS');return rows[0].id_rol;};
  if(platforms.length!==2)g.fail('DEV_PLATFORMS_MISSING');
  const specs=[['admin.dev@example.test','Administrador DEV','Administrador','all'],['consulta.all.dev@example.test','Consulta General DEV','Consulta','all'],['consulta.selected.dev@example.test','Consulta Restringida DEV','Consulta','selected'],['consulta.empty.dev@example.test','Consulta Vacia DEV','Consulta','selected']],users=[];
  for(let i=0;i<specs.length;i++){
   const [correo,nombre,rol,scope]=specs[i],hash=await bcrypt.hash(passwords[i],12);
   const user=(await db.query('INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES($1,$2,$3,$4,true,$5) RETURNING id_usuario,nombre,correo,alcance_plataformas',[roleId(rol),nombre,correo,hash,scope])).rows[0];
   if(i===2)for(const p of platforms)await db.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES($1,$2)',[user.id_usuario,p.id_plataforma]);
   users.push({...user,rol,plataformas:i===2?platforms:[]});
  }
  await db.query('COMMIT');g.writeJson('users.json',{users,passwords_plaintext_persisted:false,bcrypt_cost:12,credential_delivery:payload.credential_delivery==='windows_dpapi_current_user'?'windows_dpapi_current_user':'interactive_without_vault'});
  const manifest=JSON.parse(fs.readFileSync(path.join(g.LAB,'initialization.json'),'utf8'));manifest.users_status='CREATED';g.writeJson('initialization.json',manifest);
 }else await db.query('ROLLBACK');
 const report=await require('./verificarDevDb02.cjs').verify(db,passwords);
 g.writeJson('users-status.json',{ok:true,checks_passed:report.passed});
 console.log('DEV-DB-02: cuatro usuarios verificados; '+report.passed+' comprobaciones con PostgreSQL real. Sin contrasenas en logs ni informes.');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{passwords.fill('');await db.end();}
}
main().catch(e=>{const code=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'USER_SETUP_FAILED';g.writeJson('users-status.json',{ok:false,code});console.error('DEV-DB-02 detenido:',code);process.exitCode=1;});

