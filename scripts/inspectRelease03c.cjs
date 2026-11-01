'use strict';
// RELEASE-03C: entrada explícita de inventario. No importa servidor, workers ni pool de aplicación.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const expected = { database: 'sian_kaan_reservaciones', port: 5432, cluster: '7632825987452064788', version: '180003' };
const report = { startedAt: new Date().toISOString(), phase: 'RELEASE-03C', readOnly: true, identityVerified: false };
const output = path.join(root, 'docs', 'release-03c', 'inventario.json');
const { TABLES, SCHEMA_SQL, validateSchema } = require('../backend/config/desktopSchema');

async function main() {
    if (process.argv.length !== 3 || process.argv[2] !== '--read-only-principal') throw Object.assign(Error(), { code: 'EXPLICIT_MODE_REQUIRED' });
    const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env'), 'utf8'));
    if (!['localhost', '127.0.0.1'].includes(config.DB_HOST) || String(config.DB_PORT || '5432') !== '5432' ||
        config.DB_NAME !== expected.database || !config.DB_USER || !config.DB_PASSWORD) throw Object.assign(Error(), { code: 'CONFIG_DESTINATION_MISMATCH' });
    report.configuration = {
        path: path.join(root, '.env'), host: config.DB_HOST, port: config.DB_PORT || '(default 5432)', database: config.DB_NAME,
        user: config.DB_USER, passwordPresent: Boolean(config.DB_PASSWORD), jwtPresent: Boolean(config.JWT_SECRET), jwtAtLeast32: (config.JWT_SECRET || '').trim().length >= 32,
        contractKeysMissing: ['APP_ENVIRONMENT', 'DB_CLUSTER_ID', 'DB_SERVER_VERSION', 'DB_SCHEMA_VERSION', 'GYG_GMAIL_SYNC_ENABLED'].filter(k => !Object.hasOwn(config, k)),
        unknownKeyNames: Object.keys(config).filter(k => !new Set(['APP_ENVIRONMENT','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_CLUSTER_ID','DB_SERVER_VERSION','DB_SCHEMA_VERSION','JWT_SECRET','JWT_EXPIRES_IN','GYG_GMAIL_SYNC_ENABLED','INTEGRATION_DASHBOARD_CUTOFF_AT']).has(k)),
        inheritedConflictingKeyNames: Object.keys(process.env).filter(k => /^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|ELECTRON_RUN_AS_NODE$|GYG_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|GOOGLE_|JWT_|INTEGRATION_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(k)),
        mainContractPasses: false
    };
    try { require('../backend/config/desktopPolicy').validateConfig(config); report.configuration.mainContractPasses = true; } catch (e) { report.configuration.mainContractCode = e.code; }
    // Credenciales existentes solo en memoria. IPv4 fijo; sin dotenv.config(), variables PG ni fallback.
    const db = new Client({ host: '127.0.0.1', port: 5432, database: expected.database, user: config.DB_USER,
        password: config.DB_PASSWORD, ssl: false, application_name: 'release03c_readonly', connectionTimeoutMillis: 5000,
        options: '-c default_transaction_read_only=on -c search_path=public,pg_catalog -c statement_timeout=15000 -c lock_timeout=2000' });
    try {
        await db.connect();
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const q = async (sql, params) => (await db.query(sql, params)).rows;
        const identity = (await q(`SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS address,
            inet_server_port() AS port,current_setting('server_version_num') AS version,current_setting('transaction_read_only') AS read_only,
            current_schema() AS schema,system_identifier::text AS cluster FROM pg_catalog.pg_control_system()`))[0];
        report.identity = identity;
        if (identity.database !== expected.database || identity.username !== config.DB_USER || !['127.0.0.1','127.0.0.1/32'].includes(identity.address) ||
            identity.port !== expected.port || identity.cluster !== expected.cluster || identity.version !== expected.version || identity.read_only !== 'on' || identity.schema !== 'public') {
            throw Object.assign(Error(), { code: 'IDENTITY_MISMATCH_STOP' });
        }
        report.identityVerified = true;
        report.server = (await q(`SELECT current_setting('server_version') AS version,current_setting('listen_addresses') AS listen_addresses,
            current_setting('port') AS port,current_setting('password_encryption') AS password_encryption,
            pg_postmaster_start_time() AS postmaster_started_at`))[0];
        report.databases = await q(`SELECT datname,pg_get_userbyid(datdba) AS owner,datallowconn,datconnlimit,
            pg_encoding_to_char(encoding) AS encoding,datcollate,datctype,
            (SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
             'privilege',a.privilege_type,'grantable',a.is_grantable)) FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a) AS acl
            FROM pg_database d ORDER BY datname`);
        report.roles = await q(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,
            rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname`);
        report.memberships = await q(`SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
            admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2`);
        report.schemaAcl = await q(`SELECT nspname,pg_get_userbyid(nspowner) AS owner,
            CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable
            FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
            WHERE nspname='public' ORDER BY grantee,privilege_type`);
        report.tables = await q(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,
            (SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
            'privilege',a.privilege_type,'grantable',a.is_grantable)) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a) AS acl
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
        if (report.tables.map(t => t.relname).sort().join('|') !== [...TABLES].sort().join('|')) throw Object.assign(Error(), { code: 'TABLE_SET_MISMATCH_STOP' });
        report.effectiveDatabasePrivileges = await q(`SELECT r.rolname,has_database_privilege(r.oid,current_database(),'CONNECT') AS connect,
            has_database_privilege(r.oid,current_database(),'CREATE') AS create_database_objects,
            has_database_privilege(r.oid,current_database(),'TEMP') AS temp,has_schema_privilege(r.oid,'public','USAGE') AS schema_usage,
            has_schema_privilege(r.oid,'public','CREATE') AS schema_create,
            has_function_privilege(r.oid,'pg_catalog.pg_control_system()','EXECUTE') AS control_system
            FROM pg_roles r WHERE r.rolcanlogin ORDER BY r.rolname`);
        report.controlFunctions = await q(`SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,
            CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
            WHERE n.nspname='pg_catalog' AND p.proname IN ('pg_control_system','pg_control_checkpoint','pg_control_init','pg_control_recovery') ORDER BY 1,3`);
        report.defaultAcl = await q(`SELECT pg_get_userbyid(d.defaclrole) AS role,COALESCE(n.nspname,'(global)') AS schema,d.defaclobjtype,
            CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable
            FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a ORDER BY 1,2,3,4`);
        report.consumers = await q(`SELECT datname,usename,COALESCE(client_addr::text,'local/background') AS client_address,
            CASE WHEN application_name='release03c_readonly' THEN application_name
                 WHEN application_name ILIKE '%pgadmin%' THEN 'pgAdmin'
                 WHEN application_name IN ('psql','pg_dump','pg_restore') THEN application_name
                 WHEN application_name='' THEN '(sin application_name)' ELSE '(otra aplicación; nombre omitido)' END AS application,
            state,backend_type,wait_event_type,count(*)::int AS sessions,min(backend_start) AS oldest_connection,
            min(xact_start) AS oldest_transaction
            FROM pg_stat_activity GROUP BY 1,2,3,4,5,6,7 ORDER BY datname,usename,application`);
        report.preparedTransactions = await q(`SELECT database,owner,prepared FROM pg_prepared_xacts ORDER BY prepared`);
        report.targetLocks = await q(`SELECT c.relname,l.mode,l.granted,count(*)::int AS locks
            FROM pg_locks l JOIN pg_class c ON l.relation=c.oid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname IN ('eventos_integracion','usuarios') GROUP BY 1,2,3 ORDER BY 1,2`);
        report.hba = await q(`SELECT line_number,type,database,user_name,address,netmask,auth_method,(error IS NOT NULL) AS has_error
            FROM pg_hba_file_rules ORDER BY rule_number`);
        report.schema = (await q(SCHEMA_SQL))[0];
        report.schema017Valid = false;
        try { validateSchema(report.schema); report.schema017Valid = true; } catch (e) { report.schema017Code = e.code; }
        report.counts = {};
        for (const table of TABLES) report.counts[table] = Number((await q(`SELECT count(*)::text AS n FROM public."${table}"`))[0].n);
        report.constraints = await q(`SELECT c.contype,count(*)::int AS total,bool_and(c.convalidated) AS all_valid
            FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' GROUP BY c.contype ORDER BY c.contype`);
        report.indexes = (await q(`SELECT count(*)::int AS total,bool_and(i.indisvalid AND i.indisready) AS all_valid
            FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`))[0];
        report.changeIndicators = (await q(`SELECT max(fecha_registro) AS latest_reservation_created,max(ultima_actualizacion) AS latest_reservation_updated,
            count(*) FILTER (WHERE fecha_registro > TIMESTAMPTZ '2026-10-17 21:21:24+00')::int AS created_after_backup,
            count(*) FILTER (WHERE ultima_actualizacion > TIMESTAMPTZ '2026-10-17 21:21:24+00')::int AS updated_after_backup FROM reservaciones`))[0];
        report.protectedEvents = await q(`SELECT id_evento_integracion,review_status,application_status FROM eventos_integracion WHERE id_evento_integracion IN (124,126) ORDER BY 1`);
        report.runtimeRoleExists = report.roles.some(r => r.rolname === 'ctsk_runtime');
        await db.query('ROLLBACK');
        report.completed = true;
    } finally { await db.end().catch(() => {}); }
}
main().catch(e => { report.completed = false; report.errorCode = /^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'INVENTORY_FAILED'; process.exitCode = 1; }).finally(() => {
    report.finishedAt = new Date().toISOString(); fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ completed: report.completed, identityVerified: report.identityVerified, errorCode: report.errorCode, report: 'docs/release-03c/inventario.json' }));
});
