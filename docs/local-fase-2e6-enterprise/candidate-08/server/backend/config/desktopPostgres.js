const { fail } = require('./desktopPolicy');
const { verifySchema } = require('./desktopSchema');
const IDENTITY_SQL = `SELECT current_database() AS database,current_user AS username,
 inet_server_addr()::text AS address,inet_server_port() AS port,current_schema() AS schema,
 current_setting('server_version_num') AS version,
 has_function_privilege(current_user,'pg_catalog.pg_control_system()','EXECUTE') AS cluster_allowed`;
const ROLE_SQL = `SELECT EXISTS (SELECT 1 FROM pg_roles r WHERE
 (r.rolname=current_user OR pg_has_role(current_user,r.oid,'MEMBER')) AND
 (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolname LIKE 'pg_%'))
 OR EXISTS (SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_has_role(current_user,datdba,'MEMBER'))
 OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_has_role(current_user,nspowner,'MEMBER'))
 OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))
 OR has_database_privilege(current_user,current_database(),'CREATE')
 OR has_database_privilege(current_user,current_database(),'TEMP')
 OR has_schema_privilege(current_user,'public','CREATE') AS unsafe`;
function validateIdentity(row, config) {
    if (!row || row.database !== config.DB_NAME || row.username !== config.DB_USER || row.port !== 5432 ||
        !['127.0.0.1', '127.0.0.1/32'].includes(row.address) || row.schema !== 'public' || String(row.version) !== '180003') fail('PG_IDENTITY');
    if (row.cluster_allowed !== true) fail('PG_CLUSTER');
}
// El arranque principal siempre usa validateIdentity; un harness importado puede
// ejercitar el mismo SQL/rol/esquema con un contrato distinto, sin variables de bypass.
async function verifyPostgresWithIdentity(pool, config, validate) {
    if (typeof validate !== 'function') fail('PG_IDENTITY');
    let db;
    try {
        db = await pool.connect();
        await db.query('BEGIN READ ONLY');
        validate((await db.query(IDENTITY_SQL)).rows[0], config);
        if ((await db.query('SELECT system_identifier::text AS cluster FROM pg_catalog.pg_control_system()')).rows[0]?.cluster !== config.DB_CLUSTER_ID) fail('PG_CLUSTER');
        if ((await db.query(ROLE_SQL)).rows[0]?.unsafe !== false) fail('PG_ROLE');
        await verifySchema(db);
        await db.query('ROLLBACK');
    } catch (error) {
        if (db) await db.query('ROLLBACK').catch(() => {});
        if (['PG_IDENTITY', 'PG_CLUSTER', 'PG_ROLE', 'SCHEMA_INVALID'].includes(error.code)) throw error;
        fail('PG_UNAVAILABLE');
    } finally { if (db) db.release(); }
}
async function verifyPostgres(pool, config) { return verifyPostgresWithIdentity(pool, config, validateIdentity); }
module.exports = { IDENTITY_SQL, ROLE_SQL, validateIdentity, verifyPostgres, verifyPostgresWithIdentity };
