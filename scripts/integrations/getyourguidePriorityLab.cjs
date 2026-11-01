// Pruebas nuevas en base desechable; ninguna escritura de prueba en principal.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
delete process.env.PSModulePath;
const { Client, Pool } = require('pg');
async function main() {
    const root = path.resolve(__dirname, '../..');
    const maintenance = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
    assert.equal(maintenance.DB_NAME, 'sian_kaan_reservaciones'); assert.equal(maintenance.DB_USER, 'postgres');
    const name = 'ctsk_gyg_priority_lab_' + crypto.randomBytes(6).toString('hex');
    assert.match(name, /^ctsk_gyg_priority_lab_[a-f0-9]{12}$/);
    const options = { host: '127.0.0.1', port: 5432, user: 'postgres', password: maintenance.DB_PASSWORD, database: 'postgres', connectionTimeoutMillis: 5000 };
    const admin = new Client(options); let pool, created = false;
    const checks = [];
    try {
        await admin.connect(); assert.equal((await admin.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id, '7632825987452064788');
        await admin.query('CREATE DATABASE "' + name + '" TEMPLATE template0'); created = true;
        pool = new Pool({ ...options, database: name });
        await pool.query(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8').split('\n-- MIGRACION 018:')[0]);
        await pool.query(fs.readFileSync(path.join(root, 'database/migrations/018_publicacion_integraciones.sql'), 'utf8'));
        const role = (await pool.query("INSERT INTO roles(nombre) VALUES ('Administrador') RETURNING id_rol")).rows[0].id_rol;
        const uid = (await pool.query(`INSERT INTO usuarios(id_rol,nombre,correo,password,estado) VALUES ($1,'Prueba aislada','isolated@example.invalid',$2,true) RETURNING id_usuario`,
            [role, require('bcryptjs').hashSync(crypto.randomBytes(24).toString('hex'), 4)])).rows[0].id_usuario;
        const state = require('../../backend/services/integracionSyncEstado.service');
        const control = require('../../backend/services/integracionesControl.service');
        const events = require('../../backend/services/eventosIntegracion.service');
        await state.guardarBaselineSync({ lastHistoryId: '10' }, pool);
        await state.iniciarRecoverySync({ recoveryTargetHistoryId: '20' }, pool);
        await state.guardarCheckpointRecoverySync({ recoveryPageToken: 'old-page' }, pool);
        await events.registrarEventoIntegracion({ provider: 'getyourguide', external_event_id: 'published-before', external_booking_id: 'GYGTESTOLD', event_type: 'new_booking', normalized_data: {} }, pool);
        await control.cambiarControl('getyourguide', false, uid, pool);
        const messages = Object.fromEntries(['new_booking','modification','cancellation'].map((type, i) => {
            const subject = ['Reserva - GYGTEST0001','Cambio en los detalles de la reserva: GYGTEST0001','Se ha cancelado una reserva - GYGTEST0001'][i];
            return [type, { id: type, threadId: type, internalDate: '1792611427000', payload: { mimeType: 'text/plain', headers: [
                { name: 'From', value: 'do-not-reply@notification.getyourguide.com' }, { name: 'Subject', value: subject }
            ], body: { data: Buffer.from('Referencia: GYGTEST0001\nFecha: 30 de octubre de 2026\nParticipantes: 2').toString('base64url') } } }];
        }));
        const gmail = { users: { messages: { list: async ({ pageToken }) => ({ data: pageToken
            ? { messages: [], nextPageToken: 'old-next' } : { messages: Object.keys(messages).map(id => ({ id })) } }),
        get: async ({ id }) => ({ data: messages[id] }) }, history: { list: async () => ({ data: { history: [], historyId: '99' } }) } } };
        const optionsWorker = { db: pool, identity: {}, getGmailClient: async () => gmail, verify: async () => {},
            register: (event, db) => events.registrarEventoIntegracion(event, db) };
        const run = require('../../backend/integrations/getyourguide/getyourguideContinuous.service').createContinuousSync(optionsWorker);
        await run();
        const inserted = (await pool.query("SELECT event_type,review_status,application_status,aviso_publicado FROM eventos_integracion WHERE external_event_id=ANY($1::text[])", [Object.keys(messages)])).rows;
        assert.equal(inserted.length, 3); assert(inserted.every(e => !e.aviso_publicado && e.review_status === 'pending_review' && e.application_status === 'not_applied'));
        checks.push('Tres tipos capturados durante pausa; trigger real los retiene pendientes');
        assert.equal((await pool.query("SELECT aviso_publicado FROM eventos_integracion WHERE external_event_id='published-before'")).rows[0].aviso_publicado, true);
        checks.push('Historico publicado permanece visible');
        const historical = await state.obtenerEstadoSync({}, pool), recent = await state.obtenerEstadoSync({ source: 'gmail_recent' }, pool);
        assert.equal(historical.recovery_page_token, 'old-next'); assert.equal(historical.recovery_target_history_id, '20'); assert.equal(recent.last_history_id, '99');
        checks.push('Cursores reales independientes; actualizar fecha tecnica conserva checkpoint historico');
        assert.equal((await pool.query("SELECT avisos_activados FROM integracion_sync_estado WHERE source='publicacion' AND provider='getyourguide'")).rows[0].avisos_activados, false);
        checks.push('Fila gmail_recent no altera el boton ni evade el trigger');
        await require('../../backend/integrations/getyourguide/getyourguideContinuous.service').createContinuousSync(optionsWorker)();
        assert.equal((await pool.query('SELECT count(*)::int n FROM eventos_integracion')).rows[0].n, 4);
        checks.push('Reinicio y solapamiento no duplican eventos');
        const activated = await control.cambiarControl('getyourguide', true, uid, pool);
        assert.equal(activated.liberados, 3);
        assert.equal((await pool.query('SELECT count(*)::int n FROM reservaciones')).rows[0].n, 0);
        checks.push('Reactivacion publica exactamente tres; cero reservaciones internas automaticas');
        const summary = await require('../../backend/services/notificacionesIntegracion.service').obtenerResumenNotificaciones(pool);
        assert.equal(summary.events.length, 4);
        checks.push('Avisos backend incluye los eventos liberados');
        console.log(JSON.stringify({ result: 'GYG_PRIORITY_POSTGRES_LAB_PASSED', checks, productionWrites: false, database: name }));
    } finally {
        if (pool) await pool.end();
        if (created) { assert.match(name, /^ctsk_gyg_priority_lab_[a-f0-9]{12}$/); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); }
        await admin.end();
    }
}
main().catch(error => { console.error('GYG_PRIORITY_LAB_FAILED', error.code || error.name,
    error.stack?.split('\n').find(line => line.includes('getyourguidePriorityLab.cjs')) || ''); process.exitCode = 1; });
