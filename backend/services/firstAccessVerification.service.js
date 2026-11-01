'use strict';
// Sólo el supervisor local de mantenimiento importa este servicio; jamás el runtime HTTP.
const crypto=require('node:crypto'),B=require('../config/standalonePolicy'),P=require('../config/firstAccessPolicy'),bootstrap=require('./credentialBootstrap.service');
async function attest(db,plan,challenge,privateKey){
 if(!/^[a-f0-9]{64}$/.test(challenge||''))B.fail('FIRST_ACCESS_CHALLENGE');
 const current=P.readPlan(plan.filename);if(current.digest!==plan.digest)B.fail('CONFIG_CHANGED');
 await bootstrap.identity(db,plan.bootstrapPlan);await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../config/operationalTransactions').KEY);
  await db.query('SET LOCAL ROLE ctsk_standalone_runtime');if((await db.query(require('../config/desktopPostgres').ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');await require('../config/credentialSchema').verify(db,plan.manifest.dataGeneration);
  await db.query('SET LOCAL ROLE ctsk_standalone_owner');
  const records=(await db.query('SELECT * FROM public.inicializacion_sistema')).rows;
  const users=(await db.query(require('./credentialAuth.service').USER_SQL)).rows;
  const stats=(await db.query('SELECT (SELECT count(*)::int FROM bitacora) audits,(SELECT count(*)::int FROM comandos_idempotentes) commands')).rows[0];
  if(records.length!==1||users.length!==1||stats.audits!==0||stats.commands!==0)B.fail('FIRST_ACCESS_CLEAN_INSTALLATION_REQUIRED');
  const hash=(await db.query('SELECT password FROM public.usuarios WHERE id_usuario=$1',[plan.manifest.initialUser])).rows[0]?.password;
  if(!hash||require('bcryptjs').getRounds(hash)!==12)B.fail('FIRST_ACCESS_ACCOUNT_INVALID');
  const body={purpose:P.ATTESTATION,challenge,manifest:plan.digest,bootstrapManifest:plan.manifest.bootstrapDigest,cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,schema:require('../config/credentialSchemaContract').CATALOG_SHA,bootstrap:records[0],account:users[0],issuedAt:Date.now()};
  const proof={body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')};
  P.verifyAttestation(plan,challenge,proof);await db.query('COMMIT');return proof;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={attest};
