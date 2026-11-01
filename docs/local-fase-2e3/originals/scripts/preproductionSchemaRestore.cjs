'use strict';
// Reconstruye únicamente nueve CHECK cuyo árbol cambia en el roundtrip de PG18.3.
// No cambia migraciones, datos, verificadores ni acepta diferencias desconocidas.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const KNOWN=[
  {
    "table": "bitacora",
    "name": "chk_bitacora_formato_022",
    "source": "2e604597d80fd3de6efd87c20968809ab3aa7f012fd426dce2757aeb3dbf91d2",
    "restored": "d8101d7b9a0334bc3a0dfcefe6a3726ad54dfc21437a2d3283105dcdd37cfdc7",
    "file": "database/migrations/022_auditoria_administrativa_lab.sql"
  },
  {
    "table": "comandos_idempotentes",
    "name": "chk_comandos_metodo_020",
    "source": "286f58309f0acd62f02e9587e1b74b7b15ab142e5655bae90b9b0c8b6eaf4b5e",
    "restored": "c5c44929905de59d753d3225050a5f9ec9ddf4631440a44299f1b4b5af1c7deb",
    "file": "database/migrations/020_comandos_idempotentes_lab.sql"
  },
  {
    "table": "equivalencias_tours_externos",
    "name": "chk_equivalencias_tours_externos_turno",
    "source": "4f838fa5cf6bb20c20f17fdc2758ab55af8c79afeb039db4d22a29068f61c4ea",
    "restored": "242c38e0b8cce7340cb611ef1359890e94c77143ba36f744487562d6b9e50273",
    "file": "database/schema.sql"
  },
  {
    "table": "eventos_integracion",
    "name": "chk_eventos_integracion_application_status",
    "source": "ff15535400ef7afbbe686b6ab96755ba1dbd26b96b138f30588d42e77670c81a",
    "restored": "7af84a577b0a8f542d77b406e765c7cb376e50649da51af77aa36394fa561b91",
    "file": "database/schema.sql"
  },
  {
    "table": "eventos_integracion",
    "name": "chk_eventos_integracion_archivo",
    "source": "b5b1a065d7c7b98bf322048ec7e043440389b670f6d19ce3348e49f1c3abbe10",
    "restored": "88830b7c98fc49093b1e5b4a2a18b051eefad907e2890754004e0f71b2217479",
    "file": "database/schema.sql"
  },
  {
    "table": "eventos_integracion",
    "name": "chk_eventos_integracion_review_status",
    "source": "c7f1df7f36e5fd082b2895de2fa30946890d2d3caf51f3d380808004d4d05cfb",
    "restored": "37f219fdb6f243e7b97f2d2105ba7d8cf9a9c0e479202b3a0cf7a560ca90a1fe",
    "file": "database/schema.sql"
  },
  {
    "table": "operaciones_tour",
    "name": "chk_operaciones_tour_turno",
    "source": "4f838fa5cf6bb20c20f17fdc2758ab55af8c79afeb039db4d22a29068f61c4ea",
    "restored": "242c38e0b8cce7340cb611ef1359890e94c77143ba36f744487562d6b9e50273",
    "file": "database/schema.sql"
  },
  {
    "table": "reservaciones",
    "name": "chk_reservaciones_turno",
    "source": "6abbfdbfa47e4c51cc39475920a7049e32d3a35e0071212fe7be918e4cc1ea78",
    "restored": "cf03f5b12569f3d331fbebe0da57274c5fd19d839d8065454148a8ec7c5d0f44",
    "file": "database/schema.sql"
  },
  {
    "table": "usuarios",
    "name": "chk_usuarios_alcance_plataformas",
    "source": "dca8a259a70b67f35c6761e24f06422175ac1fdae410f7b8d185f301676ac189",
    "restored": "d78b0f24ac0864ef7c6ca3dbb57e62f4b2d4a3beeb1d2b93ddd6848e5225b1f9",
    "file": "database/schema.sql"
  }
];
const HASHES={'database/schema.sql':'f877105709676488f3e6af41638f76439fe0477383ed411cdcde37ad9edd8123','database/migrations/020_comandos_idempotentes_lab.sql':require('../backend/config/commandSchemaContract').MIGRATION_SHA,'database/migrations/022_auditoria_administrativa_lab.sql':require('../backend/config/adminAuditSchemaContract').MIGRATION_SHA};

const SQL="SELECT t.relname AS table,c.conname AS name,c.contype AS type,c.convalidated AS validated,c.condeferrable AS deferrable,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname";
async function inspect(db){return (await db.query(SQL)).rows;}
function expression(root,item){
 const text=fs.readFileSync(path.join(root,item.file),'utf8').replace(/\r\n/g,'\n');if(sha(text)!==HASHES[item.file])throw Error('RESTORE_CANONICAL_SQL_CHANGED');
 const marker='CONSTRAINT '+item.name,at=text.indexOf(marker);if(at<0||text.indexOf(marker,at+marker.length)>=0)throw Error('RESTORE_CANONICAL_CONSTRAINT');
 const start=text.indexOf('CHECK',at+marker.length),open=text.indexOf('(',start);if(start<0||open<0)throw Error('RESTORE_CANONICAL_EXPRESSION');
 let depth=0,quoted=false;for(let n=open;n<text.length;n++){const ch=text[n];if(ch==="'"){if(quoted&&text[n+1]==="'"){n++;continue;}quoted=!quoted;}if(!quoted){if(ch==='(')depth++;if(ch===')'&&--depth===0)return text.slice(start,n+1);}}
 throw Error('RESTORE_CANONICAL_EXPRESSION');
}
function differences(expected,actual){
 if(!Array.isArray(expected)||expected.length!==actual.length)throw Error('RESTORE_CONSTRAINT_SET');
 const changes=[];
 for(let n=0;n<expected.length;n++){const e=expected[n],a=actual[n];if(JSON.stringify(e)===JSON.stringify(a))continue;
 const k=KNOWN.find(k=>k.table===e.table&&k.name===e.name);
 if(!k||a.table!==e.table||a.name!==e.name||e.type!=='c'||a.type!=='c'||!e.validated||!a.validated||e.deferrable||a.deferrable||sha(e.definition)!==k.source||sha(a.definition)!==k.restored)throw Error('RESTORE_UNKNOWN_CONSTRAINT_DIFFERENCE');
 changes.push(k);
 }return changes;
}
async function reconstruct(db,root,expected){
 const changes=differences(expected,await inspect(db));
 await db.query('BEGIN');try{await db.query('SET LOCAL ROLE ctsk_standalone_owner');await db.query('SET LOCAL search_path=public');
 for(const k of changes){const check=expression(root,k);await db.query('ALTER TABLE public."'+k.table+'" DROP CONSTRAINT "'+k.name+'"');await db.query('ALTER TABLE public."'+k.table+'" ADD CONSTRAINT "'+k.name+'" '+check);}
 assert.deepEqual(await inspect(db),expected,'RESTORE_EXACT_CONSTRAINTS_REQUIRED');await db.query('COMMIT');return changes.map(k=>({table:k.table,name:k.name}));
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={KNOWN,SQL,inspect,expression,differences,reconstruct};
