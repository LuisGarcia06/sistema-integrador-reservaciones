// Base nueva y desechable: nunca inserta datos ficticios en principal.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Client, Pool } = require('pg');
const root = path.resolve(__dirname, '../..');
async function main() {
    const maintenance = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
    assert.equal(maintenance.DB_NAME, 'sian_kaan_reservaciones'); assert.equal(maintenance.DB_USER, 'postgres');
    const plan = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/fareharbor/continuous.json')));
    const runtime = require('../../backend/config/desktopPolicy').readConfig(plan.postgresConfigPath).config;
    const name = 'ctsk_controls_lab_' + crypto.randomBytes(6).toString('hex');
    assert.match(name, /^ctsk_controls_lab_[a-f0-9]{12}$/);
    const options = { host: '127.0.0.1', port: 5432, user: 'postgres', password: maintenance.DB_PASSWORD,
        database: 'postgres', connectionTimeoutMillis: 5000, application_name: 'ctsk-controls-isolated-lab' };
    const admin = new Client(options); let created = false, setup, pool; const checks = [];
    try {
        await admin.connect();
        assert.equal((await admin.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id, '7632825987452064788');
        await admin.query('CREATE DATABASE "' + name + '" TEMPLATE template0'); created = true;
        setup = new Client({ ...options, database: name }); await setup.connect();
        const baseSchema = fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8').split('\n-- MIGRACION 018:')[0];
        await setup.query(baseSchema);
        const user = (await setup.query(`INSERT INTO roles(nombre) VALUES ('Administrador') RETURNING id_rol`)).rows[0];
        const uid = (await setup.query(`INSERT INTO usuarios(id_rol,nombre,correo,password,estado)
            VALUES ($1,'Prueba aislada','isolated@example.invalid',$2,true) RETURNING id_usuario`, [user.id_rol, require('bcryptjs').hashSync(crypto.randomBytes(24).toString('hex'), 4)])).rows[0].id_usuario;
        await setup.query(`INSERT INTO eventos_integracion(provider,external_event_id,event_type) VALUES ('fareharbor','historical','new_booking')`);
        await setup.query(fs.readFileSync(path.join(root, 'database/migrations/018_publicacion_integraciones.sql'), 'utf8'));
        assert.match(runtime.DB_USER, /^[a-z][a-z0-9_]+$/);
        await setup.query('GRANT CONNECT ON DATABASE "' + name + '" TO "' + runtime.DB_USER + '"');
        await setup.query('GRANT USAGE ON SCHEMA public TO "' + runtime.DB_USER + '"');
        await setup.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO "' + runtime.DB_USER + '"');
        await setup.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "' + runtime.DB_USER + '"');
        const newPool = () => new Pool({ ...options, database: name, user: runtime.DB_USER, password: runtime.DB_PASSWORD, max: 8 });
        pool = newPool();
        const control = require('../../backend/services/integracionesControl.service');
        const events = require('../../backend/services/eventosIntegracion.service');
        const summary = require('../../backend/services/notificacionesIntegracion.service').obtenerResumenNotificaciones;
        const insert = (id, provider = 'fareharbor', event_type = 'modification', db = pool) => events.registrarEventoIntegracion({
            provider, external_event_id: id, external_booking_id: 'same-booking', event_type, normalized_data: { version: id } }, db);
        assert.equal((await summary(pool)).counts.pending, 1); checks.push('Histórico anterior a migración permanece publicado');
        await control.cambiarControl('fareharbor', false, uid, pool);
        for (let i = 0; i < 73; i++) await insert('backlog-' + i);
        await insert('gyg-active', 'getyourguide', 'cancellation');
        assert.equal((await summary(pool)).counts.pending, 2);
        const controls = await control.listarControles({}, pool, async () => true);
        assert.equal(controls.find(c => c.provider === 'fareharbor').acumulados, 73);
        const hidden = (await pool.query("SELECT id_evento_integracion FROM eventos_integracion WHERE external_event_id='backlog-0'")).rows[0].id_evento_integracion;
        assert.equal(await events.obtenerEventoIntegracion(hidden, pool), null);
        checks.push('Pausa en BD captura 73 avisos; histórico visible; otra plataforma sigue activa; detalle protegido');
        await pool.end(); pool = newPool();
        assert.equal((await control.listarControles({}, pool, async () => true)).find(c => c.provider === 'fareharbor').activado, false);
        assert.equal((await control.cambiarControl('fareharbor', true, uid, pool)).liberados, 73);
        assert.equal((await summary(pool)).counts.pending, 75);
        assert.equal((await control.cambiarControl('fareharbor', true, uid, pool)).liberados, 0);
        assert.equal((await insert('backlog-0')).duplicate, true);
        checks.push('Reconexión conserva pausa; reactivación completa sin límite ni duplicados');
        const received = await pool.connect(); await received.query('BEGIN');
        await insert('during-pause-race', 'fareharbor', 'modification', received);
        let completed = false;
        const pause = control.cambiarControl('fareharbor', false, uid, pool).then(r => { completed = true; return r; });
        await new Promise(r => setTimeout(r, 70)); assert.equal(completed, false);
        await received.query('COMMIT'); received.release(); await pause;
        assert.equal((await pool.query("SELECT aviso_publicado FROM eventos_integracion WHERE external_event_id='during-pause-race'")).rows[0].aviso_publicado, true);
        const toggler = await pool.connect(); await toggler.query('BEGIN');
        await toggler.query("SELECT * FROM integracion_sync_estado WHERE provider='fareharbor' AND source='publicacion' FOR UPDATE");
        let inserted = false;
        const receiving = insert('during-resume-race').then(r => { inserted = true; return r; });
        await new Promise(r => setTimeout(r, 70)); assert.equal(inserted, false);
        await toggler.query("UPDATE integracion_sync_estado SET avisos_activados=true WHERE provider='fareharbor' AND source='publicacion'");
        await toggler.query("UPDATE eventos_integracion SET aviso_publicado=true WHERE provider='fareharbor' AND NOT aviso_publicado");
        await toggler.query('COMMIT'); toggler.release(); await receiving;
        assert.equal((await pool.query("SELECT aviso_publicado FROM eventos_integracion WHERE external_event_id='during-resume-race'")).rows[0].aviso_publicado, true);
        checks.push('Concurrencia real: pausa espera COMMIT de recepción; recepción espera reactivación');
        // Fallo de auditoría real: usuario inexistente obliga a rollback de estado/liberación.
        await control.cambiarControl('getyourguide', false, uid, pool); await insert('gyg-paused', 'getyourguide');
        await assert.rejects(control.cambiarControl('getyourguide', true, 2147483647, pool));
        assert.equal((await pool.query("SELECT avisos_activados FROM integracion_sync_estado WHERE provider='getyourguide' AND source='publicacion'")).rows[0].avisos_activados, false);
        assert.equal((await pool.query("SELECT aviso_publicado FROM eventos_integracion WHERE external_event_id='gyg-paused'")).rows[0].aviso_publicado, false);
        checks.push('Error de auditoría revierte control y publicación en PostgreSQL');
        const duplicates = await Promise.all(Array.from({ length: 12 }, () => insert('concurrent-duplicate', 'getyourguide')));
        assert.equal(duplicates.filter(r => !r.duplicate).length, 1);
        assert.equal((await pool.query('SELECT count(*)::int n FROM reservaciones')).rows[0].n, 0);
        assert.equal((await pool.query("SELECT count(*)::int n FROM eventos_integracion WHERE review_status<>'pending_review' OR application_status<>'not_applied'")).rows[0].n, 0);
        checks.push('12 recepciones concurrentes deduplican; cero reservaciones internas; todo pendiente');
        console.log(JSON.stringify({ status: 'PASSED', database: name, checks }));
    } finally {
        if (pool) await pool.end(); if (setup) await setup.end();
        if (created) await admin.query('DROP DATABASE "' + name + '"');
        await admin.end();
    }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'FAILED', code: error.code || error.name, assertion: error.name === 'AssertionError' ? error.message : undefined })); process.exitCode = 1; });
module.exports = { main };
