// Respaldo de lectura previo al despliegue. Nunca restaura ni migra la principal.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
delete process.env.PSModulePath;
const backup = require('./backupMain017.cjs');
const root = path.resolve(__dirname, '../..');
async function main() {
    const privateDir = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/getyourguide');
    const config = JSON.parse(fs.readFileSync(path.join(privateDir, 'continuous.json')));
    const maintenancePath = path.join(root, '.env');
    const maintenance = require('dotenv').parse(fs.readFileSync(maintenancePath));
    if (maintenance.DB_NAME !== 'sian_kaan_reservaciones' || maintenance.DB_USER !== 'postgres') throw Error('GYG_BACKUP_IDENTITY');
    const client = new (require('pg').Client)({ host: '127.0.0.1', port: 5432, user: maintenance.DB_USER,
        password: maintenance.DB_PASSWORD, database: maintenance.DB_NAME, connectionTimeoutMillis: 5000,
        options: '-c default_transaction_read_only=on -c search_path=public,pg_catalog -c timezone=UTC -c statement_timeout=120000' });
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/backups/principal-final');
    const directory = path.join(base, 'run-gyg-priority-' + new Date().toISOString().replace(/[-:.]/g, '') + '-' + crypto.randomBytes(4).toString('hex'));
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'directory-security.json'), JSON.stringify({ version: 1, purpose: 'GetYourGuide priority deployment' }), { flag: 'wx', mode: 0o600 });
    require('../../backend/config/windowsConfigAcl').checkAcl(path.join(directory, 'directory-security.json'));
    try {
        await client.connect(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await backup.identity(client);
        const inventory = await backup.inventory(client);
        const baseline = { capturedAt: new Date().toISOString(), reservations: inventory.rowHashes.reservaciones,
            reservationCount: inventory.counts.reservaciones, links: inventory.rowHashes.reservas_integracion_link,
            roles: inventory.rowHashes.roles, users: inventory.rowHashes.usuarios,
            existingEvents: (await client.query('SELECT id_evento_integracion,md5(row_to_json(t)::text) fingerprint FROM eventos_integracion t ORDER BY id_evento_integracion')).rows,
            publication: (await client.query("SELECT provider,avisos_activados,updated_at FROM integracion_sync_estado WHERE source='publicacion' ORDER BY provider")).rows,
            checkpoint: (await client.query("SELECT last_history_id,recovery_active,recovery_page_token,recovery_target_history_id,recovery_started_at FROM integracion_sync_estado WHERE provider='getyourguide' AND source='gmail'")).rows[0],
            target: (await client.query("SELECT id_evento_integracion,event_type,review_status,application_status,aviso_publicado FROM eventos_integracion WHERE provider=$1 AND external_booking_id=$2", ['getyourguide', 'GYGWZAH26NG7'])).rows };
        await client.query('ROLLBACK');
        const result = await backup.backupMain017({ directory, maintenanceConfigPath: maintenancePath, expectedState: inventory });
        const independent = crypto.createHash('sha256').update(fs.readFileSync(result.file)).digest('hex');
        if (independent !== result.sha256) throw Error('GYG_BACKUP_HASH');
        fs.writeFileSync(path.join(directory, 'priority-baseline.json'), JSON.stringify(baseline, null, 2), { flag: 'wx', mode: 0o600 });
        fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ status: 'VERIFIED', sha256: independent,
            independentSha256Matched: true, restored: false, verifiedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
        const record = { directory, file: result.file, sha256: independent, verifiedAt: new Date().toISOString(), status: 'VERIFIED' };
        fs.writeFileSync(path.join(privateDir, 'priority-backup.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
        console.log(JSON.stringify({ ...record, reservationCount: baseline.reservationCount, targetAlreadyExists: baseline.target.length > 0 }));
    } finally { await client.end(); }
}
main().catch(error => { console.error(/^(?:GYG_|BACKUP_|CONFIG_|SCHEMA_|PG_)[A-Z_]+$/.test(error.code || error.message) ? error.code || error.message : 'GYG_BACKUP_FAILED'); process.exitCode = 1; });
