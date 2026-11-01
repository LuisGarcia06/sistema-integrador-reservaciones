// Preparado en PRE-RELEASE-03 y ejecutado SOLO en PRE-RELEASE-03-LAB.
// No lee .env ni crea/elimina bases; ver docs/PRE-RELEASE-03-LAB.md.
// Requiere una BD VACÍA en clúster de laboratorio y un rol limitado a esa BD.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const report = { startedAt: new Date().toISOString(), scope: 'fixture sintético de componente, PostgreSQL real', cases: [], completed: false };
let stage = 'protecciones';
function passed(id, detail) { report.cases.push({ id, status: 'passed', detail }); }
function saveReport() {
    const file = process.env.PRERELEASE03_LAB_REPORT;
    if (!file) return;
    const allowed = path.resolve(__dirname, '../docs/pre-release-03-lab/casos.json');
    if (path.resolve(file) !== allowed) throw Error('Ruta de evidencia no autorizada');
    fs.mkdirSync(path.dirname(allowed), { recursive: true });
    fs.writeFileSync(allowed, JSON.stringify(report, null, 2) + '\n');
}

async function main() {
    if (!process.argv.includes('--execute-disposable')) throw Error('Se requiere autorización explícita: --execute-disposable');
    const uri = process.env.PRERELEASE03_DISPOSABLE_DATABASE_URL;
    if (!uri) throw Error('Falta PRERELEASE03_DISPOSABLE_DATABASE_URL; nunca se utiliza .env como respaldo');
    const url = new URL(uri);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^pre_release_03_disposable_[a-z0-9]{8,40}$/.test(name)) throw Error('Nombre/URL de laboratorio inválido');
    if (process.env.PRERELEASE03_CONFIRM !== 'SOLO_BASE_DESECHABLE_PRE_RELEASE_03') throw Error('Falta confirmación del destino desechable');
    const { Pool } = require('pg');
    const db = new Pool({ connectionString: uri, max: 3, connectionTimeoutMillis: 5000, options: '-c statement_timeout=10000 -c lock_timeout=5000 -c search_path=public' });
    // Los módulos del producto se importan con destino por defecto imposible;
    // todas las operaciones de esta comprobación reciben explícitamente db.
    Object.assign(process.env, { APP_CONFIG_PATH: 'NUL', DB_HOST: 'invalid.test', DB_NAME: 'pre_release_03_guard_test', DB_USER: 'synthetic', DB_PASSWORD: 'synthetic', GYG_GMAIL_SYNC_ENABLED: 'false' });
    let defaultPool;
    const root = path.resolve(__dirname, '..');
    try {
        stage = 'identidad_y_base_vacia';
        assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db, name);
        assert.equal(Number((await db.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n), 0, 'La base debe estar completamente vacía');
        const service = require('../backend/services/eventosIntegracion.service');
        const { verificarEsquemaArchivoEventos } = require('../backend/config/schemaArchivoEventos');
        defaultPool = require('../backend/config/database');
        stage = 'fixture_y_guardia_pre017';
        await db.query(fs.readFileSync(path.join(root, 'backend/__tests__/fixtures/eventosIntegracion.pre017.sql'), 'utf8'));
        await assert.rejects(verificarEsquemaArchivoEventos(db));
        passed(1, 'Guardia real rechaza el fixture anterior a 017.');
        await db.query("INSERT INTO usuarios VALUES (7001,'Administrador sintético'),(7002,'Revisor sintético'); INSERT INTO reservaciones VALUES (8001,'Pendiente')");
        const antes = (await db.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows;
        const usuariosAntes = (await db.query('SELECT * FROM usuarios ORDER BY id_usuario')).rows;
        const otherColumns = () => db.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name<>'eventos_integracion' ORDER BY 1,ordinal_position");
        const otherObjects = () => db.query("SELECT c.relname AS tabla, k.conname, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'eventos_integracion' ORDER BY 1,2");
        const columnsBefore = (await otherColumns()).rows;
        const objectsBefore = (await otherObjects()).rows;
        const migration = fs.readFileSync(path.join(root, 'database/migrations/017_archivo_eventos_integracion.sql'), 'utf8');
        report.migrationSha256 = crypto.createHash('sha256').update(migration).digest('hex');
        stage = 'migracion_017';
        await db.query(migration);
        await verificarEsquemaArchivoEventos(db);
        passed(2, 'Migración 017 aplicada en la base desechable.');
        stage = 'repeticion_017';
        await db.query(migration); // Repetición controlada sobre el mismo destino desechable.
        await verificarEsquemaArchivoEventos(db);
        passed(3, 'Segunda ejecución termina correctamente; restricciones e índice únicos.');
        stage = 'columnas_e_indice';
        report.columns = (await db.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='eventos_integracion' AND column_name IN ('archived_at','archived_by','archive_reason') ORDER BY column_name")).rows;
        assert.equal(report.columns.length, 3);
        assert.ok(report.columns.every(c => c.is_nullable === 'YES'));
        assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='idx_eventos_integracion_archived_at'")).rows[0].n, 1);
        passed(4, 'Tres columnas nulas e índice parcial presentes tras ambas ejecuciones.');
        const registrar = (id, overrides = {}) => service.registrarEventoIntegracion({ provider: 'fareharbor', external_event_id: 'synthetic-' + id,
            external_booking_id: 'synthetic-booking', event_type: 'new_booking', normalized_data: { booking: { display_id: '#SYN-' + id } }, ...overrides }, db);
        const viejo = (await registrar(1)).event;
        const nuevo = (await registrar(2, { review_status: 'approved' })).event;
        await db.query("UPDATE eventos_integracion SET reviewed_by=7002, reviewed_at=TIMESTAMP '2026-10-17 10:00:00', review_note='Aprobación sintética original' WHERE id_evento_integracion=$1", [nuevo.id_evento_integracion]);
        const immutable = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['archived_at', 'archived_by', 'archive_reason', 'updated_at'].includes(key)));
        const original = (await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [nuevo.id_evento_integracion])).rows[0];
        const archive = id => service.archivarEventoIntegracion({ idEventoIntegracion: id, idUsuario: 7001, motivo: 'Actividad sintética transcurrida' }, db);
        stage = 'archivo_aprobado';
        assert.equal((await archive(nuevo.id_evento_integracion)).tipo, 'archivado');
        const firstArchive = (await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [nuevo.id_evento_integracion])).rows[0];
        assert.equal(firstArchive.archived_by, 7001); assert.ok(firstArchive.archived_at); assert.equal(firstArchive.archive_reason, 'Actividad sintética transcurrida');
        passed(7, 'Archivo aprobado/no aplicado con fecha, motivo y usuario sintético.');
        assert.deepEqual(immutable(firstArchive), immutable(original));
        passed(8, 'Revisión, nota, revisor y fecha originales conservados; solo cambian campos de archivo y updated_at.');
        stage = 'doble_archivo';
        assert.equal((await archive(nuevo.id_evento_integracion)).tipo, 'ya_archivado');
        assert.deepEqual((await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [nuevo.id_evento_integracion])).rows[0], firstArchive);
        passed(14, 'Segundo archivo rechazado; primera auditoría íntegra.');
        const detail = await service.obtenerEventoIntegracion(nuevo.id_evento_integracion, db);
        assert.equal(detail.review_status, 'approved'); assert.equal(detail.application_status, 'not_applied');
        assert.equal(detail.archived_by_name, 'Administrador sintético'); assert.ok(detail.archived_at);
        stage = 'historial_y_pendientes';
        assert.equal((await service.listarEventosIntegracion({ operational_only: true }, {}, db)).pagination.total, 0);
        passed(11, 'Archivado excluido de pendientes; snapshot anterior no resucita.');
        const history = await service.listarEventosIntegracion({ archived: true }, {}, db);
        assert.equal(history.pagination.total, 1); assert.equal(history.data[0].id_evento_integracion, nuevo.id_evento_integracion);
        passed(10, 'Historial consulta el archivo aprobado y su ID original.');
        stage = 'deduplicacion';
        const duplicate = await registrar(2);
        assert.equal(duplicate.duplicate, true); assert.ok(duplicate.event.archived_at);
        assert.equal(duplicate.event.id_evento_integracion, nuevo.id_evento_integracion);
        const distinto = (await registrar(3)).event;
        assert.equal((await service.listarEventosIntegracion({ operational_only: true }, {}, db)).data[0].id_evento_integracion, distinto.id_evento_integracion);
        assert.notEqual(viejo.id_evento_integracion, distinto.id_evento_integracion);
        passed(16, 'Reentrega conserva archivo e identidad; snapshot diferente se inserta y figura activo.');
        stage = 'fk_y_checks';
        await assert.rejects(db.query('UPDATE eventos_integracion SET archive_reason=NULL WHERE id_evento_integracion=$1', [nuevo.id_evento_integracion]), e => e.code === '23514');
        await assert.rejects(db.query('UPDATE eventos_integracion SET archived_by=999999 WHERE id_evento_integracion=$1', [nuevo.id_evento_integracion]), e => e.code === '23503');
        await assert.rejects(db.query('DELETE FROM usuarios WHERE id_usuario=7001'), e => e.code === '23503');
        passed(5, 'FK rechaza responsable inexistente y borrado del responsable referenciado: SQLSTATE 23503.');
        await assert.rejects(db.query("UPDATE eventos_integracion SET application_status='applied' WHERE id_evento_integracion=$1", [nuevo.id_evento_integracion]), e => e.code === '23514');
        for (const reason of ['', ' \t\n', 'x'.repeat(501)]) await assert.rejects(db.query('UPDATE eventos_integracion SET archive_reason=$1 WHERE id_evento_integracion=$2', [reason, nuevo.id_evento_integracion]), e => e.code === '23514');
        await assert.rejects(db.query("UPDATE eventos_integracion SET review_status='dismissed' WHERE id_evento_integracion=$1", [nuevo.id_evento_integracion]), e => e.code === '23514');
        const limitClient = await db.connect();
        try {
            await limitClient.query('BEGIN');
            await limitClient.query('UPDATE eventos_integracion SET archive_reason=$1 WHERE id_evento_integracion=$2', ['x'.repeat(500), nuevo.id_evento_integracion]);
            await limitClient.query('ROLLBACK');
        } finally { limitClient.release(); }
        passed(6, 'CHECK rechaza auditoría incompleta, motivo nulo/vacío/blanco/501, aplicado y revisión descartada; acepta límite 500 (revertido). SQLSTATE 23514.');
        stage = 'vinculo_e_identidad';
        const linked = (await registrar('linked', { external_booking_id: 'synthetic-linked-booking', external_thread_id: 'synthetic-thread', review_status: 'approved' })).event;
        await db.query('INSERT INTO reservas_integracion_link VALUES ($1,$2,$3)', ['fareharbor', 'synthetic-linked-booking', 8001]);
        const linksBefore = (await db.query('SELECT * FROM reservas_integracion_link ORDER BY provider,external_booking_id')).rows;
        const linkedBefore = (await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [linked.id_evento_integracion])).rows[0];
        assert.equal((await archive(linked.id_evento_integracion)).tipo, 'archivado');
        assert.deepEqual(immutable((await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [linked.id_evento_integracion])).rows[0]), immutable(linkedBefore));
        assert.deepEqual((await db.query('SELECT * FROM reservas_integracion_link ORDER BY provider,external_booking_id')).rows, linksBefore);
        passed(9, 'Vínculo proveedor/booking/reserva 8001 e identidad externa, hilo y snapshot conservados.');
        // PG real: la aplicación sintética gana el bloqueo; archivo debe esperar y releer.
        stage = 'concurrencia_real';
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT id_evento_integracion FROM eventos_integracion WHERE id_evento_integracion=$1 FOR UPDATE', [distinto.id_evento_integracion]);
            const esperando = archive(distinto.id_evento_integracion);
            let bloqueoObservado = false;
            for (let i = 0; i < 60 && !bloqueoObservado; i++) {
                bloqueoObservado = (await db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS esperando")).rows[0].esperando;
                if (!bloqueoObservado) await new Promise(resolve => setTimeout(resolve, 20));
            }
            if (!bloqueoObservado) { await client.query('ROLLBACK'); await esperando; throw Error('No se observó la espera de bloqueo requerida'); }
            await client.query("UPDATE eventos_integracion SET application_status='applied' WHERE id_evento_integracion=$1", [distinto.id_evento_integracion]);
            await client.query('COMMIT');
            assert.equal((await esperando).tipo, 'ya_aplicado');
            report.concurrency = { lockObserved: bloqueoObservado, winner: 'aplicación sintética SQL bajo FOR UPDATE', loser: 'servicio real de archivo: ya_aplicado' };
        } finally { await client.query('ROLLBACK'); client.release(); }
        passed(15, 'Dos transacciones/conexiones reales, espera Lock observada en pg_stat_activity; archivo relee tras COMMIT y rechaza aplicado.');
        assert.equal((await archive(distinto.id_evento_integracion)).tipo, 'ya_aplicado');
        assert.equal((await db.query('SELECT archived_at FROM eventos_integracion WHERE id_evento_integracion=$1', [distinto.id_evento_integracion])).rows[0].archived_at, null);
        passed(13, 'Servicio rechaza archivar evento ya aplicado; auditoría sigue nula.');
        // Todos los servicios reales deben detenerse antes de consultar/modificar reservas.
        const paths = [
            ['../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide', 'getyourguide', 'new_booking'],
            ['../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide', 'getyourguide', 'modification'],
            ['../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide', 'getyourguide', 'cancellation'],
            ['../backend/integrations/fareharbor/fareharborApplication.service', 'aplicarNuevaReservaFareHarbor', 'fareharbor', 'new_booking'],
            ['../backend/integrations/fareharbor/fareharborModificationApplication.service', 'aplicarModificationFareHarbor', 'fareharbor', 'modification'],
            ['../backend/integrations/fareharbor/fareharborCancellationApplication.service', 'aplicarCancellationFareHarbor', 'fareharbor', 'cancellation']
        ];
        stage = 'seis_caminos_de_aplicacion';
        for (const [file, fn, provider, event_type] of paths) {
            const sintetico = (await registrar(provider + '-' + event_type, { provider, event_type, external_booking_id: provider + '-' + event_type, review_status: 'approved' })).event;
            assert.equal((await archive(sintetico.id_evento_integracion)).tipo, 'archivado');
            assert.equal((await require(file)[fn](sintetico.id_evento_integracion, 7001, {}, db)).tipo, 'evento_archivado');
        }
        passed(12, 'Seis caminos reales GYG/FH (alta, modificación, cancelación) retornan evento_archivado antes de operar reservas.');
        stage = 'testigos_e_inventario_final';
        assert.deepEqual((await db.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows, antes);
        passed(17, 'Reserva testigo 8001 conserva exactamente su fila original.');
        assert.deepEqual((await db.query('SELECT * FROM usuarios ORDER BY id_usuario')).rows, usuariosAntes);
        assert.deepEqual((await db.query('SELECT * FROM reservas_integracion_link ORDER BY provider,external_booking_id')).rows, linksBefore);
        assert.deepEqual((await otherColumns()).rows, columnsBefore);
        assert.deepEqual((await otherObjects()).rows, objectsBefore);
        report.tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows.map(r => r.table_name);
        assert.deepEqual(report.tables, ['eventos_integracion', 'reservaciones', 'reservas_integracion_link', 'usuarios']);
        assert.deepEqual((await db.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname")).rows.map(r => r.nspname), ['public']);
        passed(18, 'Solo cuatro tablas del fixture en public, sin otros esquemas de usuario; columnas/restricciones de otras tres tablas y filas de usuarios/vínculo/reserva sin cambios.');
        assert.equal(new Set(report.cases.map(c => c.id)).size, 18);
        report.completed = true; report.completedAt = new Date().toISOString(); saveReport();
        console.log('PRE_RELEASE_03_DISPOSABLE_OK (solo fixture de componente; no acredita proveedor ni lanzamiento)');
    } finally { await db.end(); if (defaultPool) await defaultPool.end(); }
}
main().catch(error => {
    report.failure = { stage, code: error.code || error.name };
    try { saveReport(); } catch { /* Nunca imprimir URL, contraseña ni error del driver. */ }
    console.error('Comprobación detenida:', error.code || error.name); process.exitCode = 1;
});
