// Mantenimiento explícito. Sin arranque automático de Electron o receptores.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Client } = require('pg');
const root = path.resolve(__dirname, '../..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const backup = require('./backupMain017.cjs');
async function main() {
    if (process.argv.length !== 4 || !['--backup', '--migrate'].includes(process.argv[2])) throw Error('EXPLICIT_MODE_REQUIRED');
    const directory = fs.realpathSync(process.argv[3]);
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/backups/principal-final');
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('run-controls018-')) throw Error('PRIVATE_DESTINATION_REQUIRED');
    const checkAcl = require('../../backend/config/windowsConfigAcl').checkAcl;
    checkAcl(path.join(directory, 'directory-security.json'));
    const maintenanceConfigPath = path.join(root, '.env');
    // Fuente de mantenimiento existente, solo memoria; nunca se copia a Electron.
    const cfg = require('dotenv').parse(fs.readFileSync(maintenanceConfigPath));
    if (cfg.DB_HOST !== 'localhost' || cfg.DB_PORT !== '5432' || cfg.DB_NAME !== 'sian_kaan_reservaciones' || cfg.DB_USER !== 'postgres') throw Error('MAINTENANCE_IDENTITY_REQUIRED');
    const client = new Client({ host: '127.0.0.1', port: 5432, database: cfg.DB_NAME, user: cfg.DB_USER, password: cfg.DB_PASSWORD,
        application_name: 'ctsk-controls018-maintenance', connectionTimeoutMillis: 5000,
        options: '-c search_path=public,pg_catalog -c timezone=UTC -c statement_timeout=120000 -c lock_timeout=2000' });
    try {
        await client.connect();
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await backup.identity(client);
        const before = await backup.inventory(client);
        await client.query('ROLLBACK');
        if (process.argv[2] === '--backup') {
            const result = await backup.backupMain017({ directory, maintenanceConfigPath, expectedState: before });
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup-manifest.json')));
            const independent = hash(fs.readFileSync(result.file));
            if (independent !== result.sha256) throw Error('INDEPENDENT_HASH_MISMATCH');
            fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ status: 'VERIFIED', sha256: independent,
                independentSha256Matched: true, restored: false, verifiedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
            fs.writeFileSync(path.join(directory, 'migration018-baseline.json'), JSON.stringify({
                backupSha256: result.sha256, migrationSha256: hash(fs.readFileSync(path.join(root, 'database/migrations/018_publicacion_integraciones.sql'))),
                protectedEvents: (await client.query(`SELECT id_evento_integracion,md5(to_jsonb(t)::text) fingerprint
                    FROM eventos_integracion t ORDER BY id_evento_integracion`)).rows,
                reservations: manifest.inventory.rowHashes.reservaciones,
                count: manifest.inventory.counts.reservaciones
            }, null, 2), { flag: 'wx' });
            console.log(JSON.stringify(result)); return;
        }
        const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'migration018-baseline.json')));
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup-manifest.json')));
        const verified = JSON.parse(fs.readFileSync(path.join(directory, 'verification.json')));
        if (manifest.status !== 'VERIFIED' || verified.status !== 'VERIFIED' || !verified.independentSha256Matched
            || hash(fs.readFileSync(path.join(directory, manifest.filename))) !== baseline.backupSha256) throw Error('BACKUP_REQUIRED');
        const migration = fs.readFileSync(path.join(root, 'database/migrations/018_publicacion_integraciones.sql'), 'utf8');
        if (hash(migration) !== baseline.migrationSha256) throw Error('MIGRATION_CHANGED');
        const fh = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/fareharbor/continuous.json')));
        const runtime = require('../../backend/config/desktopPolicy').readConfig(fh.postgresConfigPath).config;
        if (!/^[a-z][a-z0-9_]+$/.test(runtime.DB_USER)) throw Error('ROLE_INVALID');
        // Quitar únicamente BEGIN/COMMIT exteriores para incluir grants y verificaciones
        // en la misma transacción de la migración. Sin reiniciar PostgreSQL o receptores.
        const body = migration.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
        await client.query('BEGIN');
        try {
            await client.query(body);
            await client.query('GRANT INSERT, UPDATE ON TABLE public.integracion_sync_estado TO "' + runtime.DB_USER + '"');
            await client.query('GRANT USAGE ON SEQUENCE public.integracion_sync_estado_id_integracion_sync_estado_seq TO "' + runtime.DB_USER + '"');
            // Campos originales de cada evento deben coincidir byte por byte.
            const originals = (await client.query(`SELECT id_evento_integracion,
                md5((to_jsonb(t)-'aviso_publicado')::text) fingerprint FROM eventos_integracion t ORDER BY id_evento_integracion`)).rows;
            for (const previous of baseline.protectedEvents) {
                if (originals.find(e => e.id_evento_integracion === previous.id_evento_integracion)?.fingerprint !== previous.fingerprint) throw Error('EXISTING_EVENT_CHANGED');
            }
            const reservations = (await client.query('SELECT row_to_json(t)::text value FROM reservaciones t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
            if (hash(reservations.map(r => r.value).join('\n')) !== baseline.reservations || reservations.length !== baseline.count) throw Error('RESERVATIONS_CHANGED');
            if ((await client.query('SELECT count(*)::int n FROM eventos_integracion WHERE NOT aviso_publicado')).rows[0].n !== 0) throw Error('HISTORICAL_PUBLICATION_CHANGED');
            await client.query('COMMIT');
            const record = { status: 'APPLIED', migration: '018', finishedAt: new Date().toISOString(),
                backupDirectory: directory, reservationsPreserved: true, reservations: reservations.length,
                events: originals.length, existingEventsPublished: true, automaticApplication: false,
                runtimeRole: runtime.DB_USER, noServiceRestart: true };
            fs.writeFileSync(path.join(directory, 'migration018-result.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
            console.log(JSON.stringify(record));
        } catch (error) { await client.query('ROLLBACK'); throw error; }
    } finally { await client.end(); }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ code: error.code || error.message })); process.exitCode = 1; });
module.exports = { main };
