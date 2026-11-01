'use strict';
// Verificador local de mantenimiento. El proceso HTTP nunca lo importa.
const crypto=require('node:crypto'),B=require('../config/standalonePolicy'),P=require('../config/unifiedPolicy');
async function attest(db,plan,challenge,privateKey){
 if(!/^[a-f0-9]{64}$/.test(challenge||'')||P.readPlan(plan.filename).digest!==plan.digest)B.fail('UNIFIED_CHALLENGE');
 await require('./credentialBootstrap.service').identity(db,plan.bootstrapPlan);await db.query('BEGIN');
 try{await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../config/operationalTransactions').KEY);await db.query('SET LOCAL ROLE ctsk_standalone_runtime');if((await db.query(require('../config/desktopPostgres').ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');await require('../config/credentialSchema').verify(db,plan.manifest.dataGeneration);await db.query('SET LOCAL ROLE ctsk_standalone_owner');
 const records=(await db.query('SELECT * FROM public.inicializacion_sistema')).rows;if(records.length!==1)B.fail('UNIFIED_BOOTSTRAP_REQUIRED');
 const activeAdmins=(await db.query("SELECT count(*)::int n FROM usuarios u JOIN roles r USING(id_rol) WHERE r.nombre='Administrador' AND u.estado")).rows[0].n;
 const body={purpose:P.ATTESTATION,challenge,manifest:plan.digest,cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,schema:require('../config/credentialSchemaContract').CATALOG_SHA,bootstrap:records[0],activeAdmins,issuedAt:Date.now()};
 const proof={body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')};P.verifyAttestation(plan,challenge,proof);await db.query('COMMIT');return proof;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={attest};
