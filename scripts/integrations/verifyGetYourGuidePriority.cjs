// Verificacion posterior en READ ONLY, sin datos personales ni llamadas Gmail.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
delete process.env.PSModulePath;
const root = path.resolve(__dirname, '../..');
const dir = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/getyourguide');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'continuous.json')));
    const backup = JSON.parse(fs.readFileSync(path.join(dir, 'priority-backup.json')));
    const baseline = JSON.parse(fs.readFileSync(path.join(backup.directory, 'priority-baseline.json')));
    require('../../backend/config/desktopConfiguration').initialize(require('../../backend/config/desktopPolicy').readConfig(config.postgresConfigPath).config);
    const pool = require('../../backend/config/database'), client = await pool.connect();
    const result = { checkedAt: new Date().toISOString() };
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        result.events = (await client.query(`SELECT id_evento_integracion,external_event_id,event_type,review_status,application_status,
            aviso_publicado,source_received_at,created_at,archived_at FROM eventos_integracion WHERE provider=$1 AND external_booking_id=$2 ORDER BY id_evento_integracion`,
        ['getyourguide', 'GYGWZAH26NG7'])).rows;
        result.duplicateMessageIds = (await client.query(`SELECT count(*)::int AS groups FROM
            (SELECT external_event_id FROM eventos_integracion WHERE provider=$1 AND external_booking_id=$2 GROUP BY external_event_id HAVING count(*)>1) t`,
        ['getyourguide', 'GYGWZAH26NG7'])).rows[0].groups;
        const ids = baseline.existingEvents.map(e => e.id_evento_integracion);
        const current = (await client.query('SELECT id_evento_integracion,md5(row_to_json(t)::text) fingerprint FROM eventos_integracion t WHERE id_evento_integracion=ANY($1::int[]) ORDER BY id_evento_integracion', [ids])).rows;
        result.preexistingEventsUnchanged = JSON.stringify(current) === JSON.stringify(baseline.existingEvents);
        result.preservation = {};
        for (const [table, name] of [['reservaciones','reservations'],['reservas_integracion_link','links'],['roles','roles'],['usuarios','users']]) {
            // Identificadores constantes de esta lista, no entradas del usuario.
            const rows = (await client.query('SELECT row_to_json(t)::text value FROM public.' + table + ' t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
            result.preservation[name] = hash(rows.map(r => r.value).join('\n')) === baseline[name];
            if (table === 'reservaciones') result.reservationCount = rows.length;
        }
        result.publication = (await client.query("SELECT provider,avisos_activados,updated_at FROM integracion_sync_estado WHERE source='publicacion' ORDER BY provider")).rows;
        result.publicationControlsUnchanged = JSON.stringify(result.publication) === JSON.stringify(baseline.publication);
        result.checkpoints = (await client.query(`SELECT source,last_history_id,last_successful_sync_at,recovery_active,
            recovery_page_token IS NOT NULL has_page,md5(recovery_page_token) AS page_fingerprint,recovery_target_history_id,
            recovery_started_at,last_error_code,backoff_until,updated_at FROM integracion_sync_estado WHERE provider=$1 AND source IN ('gmail','gmail_recent') ORDER BY source`, ['getyourguide'])).rows;
        const summary = await require('../../backend/services/notificacionesIntegracion.service').obtenerResumenNotificaciones(client);
        result.presentInElectronSummary = result.events.map(e => ({ id: e.id_evento_integracion, present: summary.events.some(n => n.id_evento_integracion === e.id_evento_integracion) }));
        result.internalLinksForReference = (await client.query('SELECT count(*)::int n FROM reservas_integracion_link WHERE provider=$1 AND external_booking_id=$2', ['getyourguide','GYGWZAH26NG7'])).rows[0].n;
        await client.query('ROLLBACK');
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); await pool.end(); }
    result.workerStatus = JSON.parse(fs.readFileSync(path.join(dir, 'continuous-status.json')));
    result.sourceIntegrity = Object.entries(config.sourceHashes).every(([relative, digest]) => hash(fs.readFileSync(path.join(dir,'runtime',relative))) === digest);
    const traceFile = path.join(dir, 'priority-verification-samples.json');
    const samples = fs.existsSync(traceFile) ? JSON.parse(fs.readFileSync(traceFile)) : [];
    if (!samples.some(sample => sample.workerStatus.cycleStartedAt === result.workerStatus.cycleStartedAt)) samples.push(result);
    fs.writeFileSync(traceFile, JSON.stringify(samples, null, 2));
    console.log(JSON.stringify(result, null, 2));
}
main().catch(() => { console.error('GYG_PRIORITY_VERIFICATION_FAILED'); process.exitCode = 1; });
