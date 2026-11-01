const TABLE='public.comandos_idempotentes';
const FIELDS=['generacion_datos','id_usuario','clave','version','metodo','ruta','recurso','id_recurso','huella','estado','http_status','resultado','alcance','ids_bitacora'];
const INSERT_SQL=`INSERT INTO ${TABLE} (${FIELDS.join(',')}) VALUES (${FIELDS.map((_,i)=>'$'+(i+1)).join(',')})`;
async function find(db,generation,user,key){return (await db.query(`SELECT * FROM ${TABLE} WHERE generacion_datos=$1 AND id_usuario=$2 AND clave=$3`,[generation,user,key])).rows[0]||null;}
module.exports={FIELDS,INSERT_SQL,find};
