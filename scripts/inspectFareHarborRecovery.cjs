// Auditoria solicitada: solo SELECT en transaccion READ ONLY; sin datos personales.
const fs = require('node:fs'), path = require('node:path');
delete process.env.PSModulePath;
const directory = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/fareharbor');
const plan = JSON.parse(fs.readFileSync(path.join(directory, 'continuous.json'), 'utf8'));
const config = require('../backend/config/desktopPolicy').readConfig(plan.postgresConfigPath).config;
require('../backend/config/desktopConfiguration').initialize(config);
const pool = require('../backend/config/database');
const filename = path.join(directory, 'recovery-data-baseline-20261021.json');
async function main() {
    const before = process.argv[2] === '--before';
    const prior = before ? null : JSON.parse(fs.readFileSync(filename, 'utf8'));
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const tables = [
            ['reservaciones', 'id_reservacion', 'TRUE'],
            ['eventos_integracion', 'id_evento_integracion', "provider='fareharbor'"],
            ['reservas_integracion_link', 'id_reserva_integracion_link', "provider='fareharbor'"]
        ];
        const result = { checkedAt: new Date().toISOString(), tables: {} };
        for (const [table, key, scope] of tables) {
            // Identificadores constantes locales; ningun valor externo se concatena en SQL.
            const maximum = prior ? prior.tables[table].maxId : null;
            const bound = maximum === null ? '' : ` AND ${key} <= $1`;
            const row = (await client.query(`SELECT count(*)::int AS count, coalesce(max(${key}),0)::int AS "maxId",
                md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY ${key}),'')) AS fingerprint
                FROM public.${table} t WHERE ${scope}${bound}`, maximum === null ? [] : [maximum])).rows[0];
            result.tables[table] = row;
        }
        result.fareharbor = (await client.query(`SELECT count(*)::int AS events, max(created_at) AS last_persisted_at,
            count(*) FILTER (WHERE created_at >= $1::timestamptz)::int AS persisted_since_restore
            FROM eventos_integracion WHERE provider=$2`, ['2026-10-21T19:48:14Z', 'fareharbor'])).rows[0];
        result.changesAndCancellations = (await client.query(`SELECT event_type, count(*)::int AS total,
            count(*) FILTER (WHERE review_status IN ('pending_review','approved')
                AND application_status='not_applied' AND archived_at IS NULL)::int AS pending,
            count(*) FILTER (WHERE created_at::date=$1::date)::int AS persisted_on_incident_date,
            max(created_at) AS last_persisted_at
            FROM eventos_integracion WHERE provider=$2 AND event_type IN ('modification','cancellation')
            GROUP BY event_type ORDER BY event_type`, ['2026-10-21', 'fareharbor'])).rows;
        await client.query('ROLLBACK');
        if (before) fs.writeFileSync(filename, JSON.stringify(result, null, 2) + '\n');
        else result.preexistingRowsUnchanged = tables.every(([table]) =>
            JSON.stringify(result.tables[table]) === JSON.stringify(prior.tables[table]));
        console.log(JSON.stringify(result, null, 2));
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); await pool.end(); }
}
main().catch(() => { console.error('FH_READ_ONLY_AUDIT_FAILED'); process.exitCode = 1; });
