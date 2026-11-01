// Se invoca SOLAMENTE después de crear y comprobar un clúster y una base vacíos.
// No acepta una URL, credenciales, respaldos ni un destino por argumentos CLI.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const C = require('../backend/config/revisionSchemaContract'), RP = require('../backend/config/revisionLabPolicy');
async function migrateNewCluster(db,m) {
    (m.environment==='revision-api-lab'?require('../backend/config/revisionApiPolicy'):RP).validateManifest(m,path.resolve(__dirname,'..'));
    assert.equal(fs.readFileSync(path.join(m.root,'database/migrations/019_revisiones_registros_lab.sql'),'utf8').replace(/\r\n/g,'\n'),C.MIGRATION_SQL);
    const identity = (await db.query("SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
    assert.equal(identity.db,m.database);assert.equal(identity.port,m.pgPort);assert.equal(identity.cluster,m.cluster);
    for (const table of Object.keys(C.TABLES)) assert.equal((await db.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n,0);
    await db.query('BEGIN');
    try {
        await db.query('SET LOCAL ROLE ctsk_standalone_owner');
        const id = async(sql,args)=>(await db.query(sql,args)).rows[0].id;
        const tour=await id("INSERT INTO tours(nombre,descripcion,activo) VALUES ('Tour revisión sintético','Solo laboratorio',true) RETURNING id_tour id");
        const country=await id("INSERT INTO paises(nombre) VALUES ('País revisión sintético') RETURNING id_pais id");
        const platform=await id("INSERT INTO plataformas(nombre) VALUES ('Revisión sintética') RETURNING id_plataforma id");
        const records=[];
        for (let n=1;n<=2;n++) {
            const op=await id("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2098-01-01',$1,'07:00','Mañana',$2,'Preparada') RETURNING id_operacion_tour id",[tour,n]);
            const tr=await id("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Preparado') RETURNING id_transporte_operacion id",[op]);
            const reservation=await id("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,fecha_registro,ultima_actualizacion) VALUES ($1,'2098-01-01',$2,$3,$4,'Cliente revisión sintético',2,0,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",['SYN-REV-'+n,tour,country,platform]);
            records.push({reservaciones:reservation,operaciones_tour:op,transportes_operacion:tr});
        }
        // Las filas anteriores prueban backfill=1. La segunda simula historial largo
        // ANTES de instalar la guardia: no hay bypass del trigger ni permiso runtime.
        await db.query(C.COLUMNS_SQL);
        for (const [table,columns] of Object.entries(C.TABLES)) await db.query(`UPDATE public.${table} SET revision=9007199254740993 WHERE ${columns[0]}=$1`,[records[1][table]]);
        await db.query(C.GUARDS_SQL);
        await db.query('COMMIT');
        return {tour,country,platform,records};
    } catch (error) { await db.query('ROLLBACK'); throw error; }
}
module.exports={migrateNewCluster};
