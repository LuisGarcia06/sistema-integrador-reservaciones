const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function migrateNewCluster(db,m){
    require('../backend/config/commandApiPolicy').validateManifest(m,path.resolve(__dirname,'..'));
    const identity=(await db.query("SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
    assert.equal(identity.db,m.database);assert.equal(identity.port,m.pgPort);assert.equal(identity.cluster,m.cluster);
    assert.equal((await db.query("SELECT to_regclass('public.comandos_idempotentes') AS table")).rows[0].table,null);
    const sqlMigration=fs.readFileSync(path.join(m.root,'database/migrations/020_comandos_idempotentes_lab.sql'),'utf8').replace(/\r\n/g,'\n');
    assert.equal(require('node:crypto').createHash('sha256').update(sqlMigration).digest('hex'),require('../backend/config/commandSchemaContract').MIGRATION_SHA,'COMMAND_MIGRATION_CHANGED');
    await db.query('BEGIN');
    try{
        await db.query('SET LOCAL ROLE ctsk_standalone_owner');
        await db.query(sqlMigration);
        // UUID generado por el aprovisionador y validado por la política, jamás entrada HTTP.
        const sql=(await db.query("SELECT format('COMMENT ON TABLE public.comandos_idempotentes IS %L',$1::text) sql",[m.dataGeneration])).rows[0].sql;
        await db.query(sql);await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}
}
module.exports={migrateNewCluster};
