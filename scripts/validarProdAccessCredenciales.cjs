'use strict';
const d=require('./prodAccess02bDb.cjs');
const bcrypt=require('bcryptjs');
(async()=>{
 let raw='';for await(const chunk of process.stdin)raw+=chunk;
 const input=JSON.parse(raw);raw='';
 if(!Array.isArray(input.users)||input.users.length!==2)throw Error('INVALID_INPUT');
 const c=d.client();
 try{
  await c.connect();await c.query('BEGIN READ ONLY');await d.identity(c);
  const checks=[];
  for(let i=0;i<2;i++){
   const credential=input.users[i];
   const rows=(await c.query('SELECT u.password,u.estado,r.nombre rol FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE u.correo=$1',[credential.correo])).rows;
   const u=rows.length===1?rows[0]:null;
   checks.push(Boolean(u&&u.estado===true&&u.rol===['Administrador','Consulta'][i]&&await bcrypt.compare(credential.password,u.password)));
   credential.password='';
  }
  await c.query('ROLLBACK');process.stdout.write(JSON.stringify({checks}));
 }finally{for(const u of input.users)u.password='';await c.end()}
})().catch(()=>{process.stdout.write(JSON.stringify({error:'CREDENTIAL_VALIDATION_FAILED'}));process.exitCode=1});
