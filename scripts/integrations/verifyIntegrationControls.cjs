// Verificación en solo lectura de la release y los datos previos a 018.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/secure-runtime');
    const stage = JSON.parse(fs.readFileSync(path.join(base, 'admin/update-records/controls018-staging.json')));
    const root = path.join(base, 'releases', stage.releaseId);
    const policy = require(path.join(root, 'backend/config/desktopPolicy'));
    const config = policy.readConfig(path.join(root, '.env')).config;
    const digest = policy.fingerprint(root);
    if (digest !== require('../../backend/config/desktopPolicy').fingerprint(path.resolve(__dirname, '../..'))) throw Error('SOURCE_FINGERPRINT_MISMATCH');
    require(path.join(root, 'backend/config/desktopConfiguration')).initialize(config);
    require(path.join(root, 'backend/desktopChild')).blockProviderNetwork();
    const db = require(path.join(root, 'backend/config/database'));
    try {
        await require(path.join(root, 'backend/config/desktopPostgres')).verifyPostgres(db, config);
        const controls = await require(path.join(root, 'backend/services/integracionesControl.service')).listarControles({}, db);
        const baseline = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,
            'CommunityTours/backups/principal-final/run-controls018-20261021T095322-e86a1f1c/migration018-baseline.json')));
        const originals = (await db.query("SELECT id_evento_integracion,md5((to_jsonb(t)-'aviso_publicado')::text) fingerprint FROM eventos_integracion t ORDER BY id_evento_integracion")).rows;
        const reservations = (await db.query('SELECT row_to_json(t)::text value FROM reservaciones t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
        if (hash(reservations.map(r => r.value).join('\n')) !== baseline.reservations) throw Error('RESERVATIONS_CHANGED');
        if (baseline.protectedEvents.some(p => originals.find(e => e.id_evento_integracion === p.id_evento_integracion)?.fingerprint !== p.fingerprint)) throw Error('EXISTING_EVENT_CHANGED');
        const record = { status: 'VERIFIED_READY_TO_OPEN', root, fingerprint: digest, previousRelease: stage.previousRelease,
            controlsCompatibleRecovery: path.join(base, 'releases/r-20261021T145712Z-f2eb8b7d4c0d'),
            manifestPath: stage.manifestPath, manifestSha256: stage.manifestSha256, controls,
            reservations: reservations.length, priorEventsPreserved: baseline.protectedEvents.length,
            currentEvents: originals.length, desktopNetworkPolicyVerified: true, verifiedAt: new Date().toISOString() };
        const target = path.join(base, 'admin/update-records/controls018-final-verification.json');
        if (fs.existsSync(target)) fs.copyFileSync(target, target + '.' + Date.now() + '.previous', fs.constants.COPYFILE_EXCL);
        fs.writeFileSync(target, JSON.stringify(record, null, 2));
        fs.writeFileSync(path.resolve(__dirname, '../../docs/integraciones-controles/deployment-verification.json'), JSON.stringify(record, null, 2));
        console.log(JSON.stringify(record));
    } finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { main };
