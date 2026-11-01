// Servicios/ruta reales, pool inyectado SOLO al clúster nuevo, sin backend/server ni workers.
const S = require('./preRelease03RestoreSafety.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
async function probar(ctx) {
  const { db, admin, m, make, secrets, identity, meta, originalKeys, baseline, sequences, barrier, passed, report } = ctx;
  process.env.NODE_ENV = 'test'; process.env.APP_CONFIG_PATH = 'NUL';
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.GYG_GMAIL_SYNC_ENABLED = 'false'; process.env.FAREHARBOR_WEBHOOK_ENABLED = 'false';
  let active = db; const readQueries = [];
  const proxy = { query(...args) { readQueries.push(typeof args[0] === 'string' ? args[0] : args[0].text); return active.query(...args); }, connect(...args) { return active.connect(...args); } };
  const poolFile = require.resolve('../backend/config/database');
  require.cache[poolFile] = { id: poolFile, filename: poolFile, loaded: true, exports: proxy };
  const service = require('../backend/services/eventosIntegracion.service');
  const { verificarEsquemaArchivoEventos } = require('../backend/config/schemaArchivoEventos');
  await assert.rejects(verificarEsquemaArchivoEventos(db));
  assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='eventos_integracion' AND column_name IN ('archived_at','archived_by','archive_reason')")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='public.eventos_integracion'::regclass AND conname IN ('fk_eventos_integracion_archived_by','chk_eventos_integracion_archivo')")).rows[0].n, 0);
  const migration = fs.readFileSync(path.join(S.ROOT, 'database/migrations/017_archivo_eventos_integracion.sql'));
  assert.equal(S.hash(migration), S.MIGRATION_HASH);
  await identity(admin, db);
  const migrationStart = performance.now();
  const migrationClient = await db.connect();
  try { await migrationClient.query(migration.toString('utf8')); }
  catch (error) { await migrationClient.query('ROLLBACK'); throw error; }
  finally { migrationClient.release(); }
  report.migration = { sha256: S.MIGRATION_HASH, seconds: (performance.now() - migrationStart) / 1000, executions: 1, onlyRestoredCopy: true };
  await verificarEsquemaArchivoEventos(db);
  const afterMeta = await S.metadatos(db);
  const newFields = afterMeta.columns.filter(c => !meta.columns.some(b => b.table_name === c.table_name && b.column_name === c.column_name));
  assert.deepEqual(newFields.map(c => [c.table_name, c.column_name, c.data_type, c.is_nullable]), [
    ['eventos_integracion', 'archived_at', 'timestamp without time zone', 'YES'], ['eventos_integracion', 'archived_by', 'integer', 'YES'], ['eventos_integracion', 'archive_reason', 'text', 'YES']
  ]);
  const newConstraints = afterMeta.constraints.filter(c => !meta.constraints.some(b => b.name === c.name && b.table_name === c.table_name));
  assert.deepEqual(newConstraints.map(c => c.name), ['chk_eventos_integracion_archivo', 'fk_eventos_integracion_archived_by']);
  assert.ok(newConstraints.every(c => c.validated));
  assert.deepEqual(afterMeta.columns.filter(c => !newFields.includes(c)), meta.columns);
  assert.deepEqual(afterMeta.constraints.filter(c => !newConstraints.includes(c)), meta.constraints);
  const newIndex = afterMeta.indexes.filter(i => !meta.indexes.some(b => b.name === i.name));
  assert.equal(newIndex.length, 1); assert.equal(newIndex[0].name, 'idx_eventos_integracion_archived_at'); assert.equal(newIndex[0].valid, true);
  const index = (await db.query("SELECT pg_get_expr(indpred,indrelid) predicate,pg_get_indexdef(indexrelid) definition FROM pg_index WHERE indexrelid='public.idx_eventos_integracion_archived_at'::regclass")).rows[0];
  assert.equal(index.predicate, '(archived_at IS NOT NULL)');
  assert.ok(index.definition.includes('archived_at DESC, id_evento_integracion DESC'));
  const partialClient = await db.connect();
  try {
    await partialClient.query('BEGIN'); await partialClient.query('ALTER TABLE eventos_integracion DROP CONSTRAINT chk_eventos_integracion_archivo');
    await assert.rejects(verificarEsquemaArchivoEventos(partialClient));
  } finally { await partialClient.query('ROLLBACK'); partialClient.release(); }
  await verificarEsquemaArchivoEventos(db);
  assert.deepEqual(await S.originales(db, meta, originalKeys), baseline);
  assert.deepEqual(await S.secuencias(db, meta), sequences);
  assert.equal((await db.query('SELECT count(*)::int n FROM eventos_integracion WHERE archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL')).rows[0].n, 136);
  report.migration.columns = newFields; report.migration.constraints = newConstraints; report.migration.index = index;
  passed('017', 'Hash aprobado, una ejecución atómica en copia: tres columnas, FK/CHECK e índice válidos. Datos originales y secuencias intactos.');
  passed('guardia', 'Guardia rechaza pre-017 y restricción faltante simulada dentro de una transacción revertida; acepta esquema completo.');

  const summaryService = require('../backend/services/notificacionesIntegracion.service');
  const originalSummary = await summaryService.obtenerResumenNotificaciones(db);
  report.notificationsBaseline = { counts: originalSummary.counts, cutoff: 'sin configurar en el entorno aislado; no se lee .env', providersContacted: false };
  const roleIds = Object.fromEntries((await db.query("SELECT nombre,id_rol FROM roles WHERE nombre IN ('Administrador','Consulta')")).rows.map(r => [r.nombre, r.id_rol]));
  assert.ok(roleIds.Administrador && roleIds.Consulta);
  const userIds = {};
  for (const [label, roleName, scope] of [['admin', 'Administrador', 'all'], ['all', 'Consulta', 'all'], ['selected', 'Consulta', 'selected']]) {
    const r = (await db.query('INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES($1,$2,$3,$4,true,$5) RETURNING id_usuario', [roleIds[roleName], 'Usuario ficticio RESTORE ' + label, 'restore-' + label + '@example.test', await require('bcryptjs').hash(crypto.randomBytes(24).toString('hex'), 4), scope])).rows[0];
    userIds[label] = r.id_usuario;
  }
  const catalog = (await db.query('SELECT (SELECT min(id_tour) FROM tours) tour,(SELECT min(id_pais) FROM paises) pais,(SELECT min(id_plataforma) FROM plataformas) plataforma')).rows[0];
  await db.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES($1,$2)', [userIds.selected, catalog.plataforma]);
  const reservation = (await db.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,pickup_place,pickup_time,turno,precio_total,estado,fecha_registro,ultima_actualizacion) VALUES($1,DATE '2099-05-20',$2,$3,$4,'Visitante ficticio RESTORE',2,'Lobby ficticio',TIME '07:15','Mañana',0,'Pendiente',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion", ['RESTORE-' + crypto.randomBytes(4).toString('hex'), catalog.tour, catalog.pais, catalog.plataforma])).rows[0];
  const fixtureIds = [];
  async function event(label, provider = 'getyourguide', type = 'new_booking', status = 'approved', start = '2099-05-20T07:15:00-05:00') {
    const r = await service.registrarEventoIntegracion({ provider, external_event_id: 'restore-synthetic-' + label, external_booking_id: 'restore-synthetic-booking-' + label,
      event_type: type, review_status: status, normalized_data: provider === 'fareharbor' ? { booking: { display_id: '#RESTORE-' + label }, availability: { start_at: start, item: { name: 'Actividad ficticia RESTORE' } }, customers: { total: 2 } } : { customer_name: 'Visitante ficticio RESTORE', date: '2099-05-20', pax: 2 } }, db);
    assert.equal(r.duplicate, false); assert.ok(!originalKeys.eventos_integracion.some(k => k.id_evento_integracion === r.event.id_evento_integracion));
    assert.ok(![124, 126].includes(r.event.id_evento_integracion)); fixtureIds.push(r.event.id_evento_integracion); return r.event;
  }
  const linked = await event('linked');
  await db.query('UPDATE eventos_integracion SET reviewed_by=$1,reviewed_at=CURRENT_TIMESTAMP,review_note=$2 WHERE id_evento_integracion=$3', [userIds.all, 'Aprobación ficticia RESTORE original', linked.id_evento_integracion]);
  await db.query('INSERT INTO reservas_integracion_link(provider,external_booking_id,id_reservacion) VALUES($1,$2,$3)', ['getyourguide', linked.external_booking_id, reservation.id_reservacion]);
  const beforeArchive = (await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [linked.id_evento_integracion])).rows[0];
  const linkedRowsBefore = (await db.query('SELECT * FROM reservas_integracion_link WHERE id_reservacion=$1', [reservation.id_reservacion])).rows;
  const beforeSummary = await summaryService.obtenerResumenNotificaciones(db);
  assert.ok(beforeSummary.events.some(e => e.id_evento_integracion === linked.id_evento_integracion));
  const archived = await service.archivarEventoIntegracion({ idEventoIntegracion: linked.id_evento_integracion, idUsuario: userIds.admin, motivo: 'Ensayo ficticio de restauración y archivo' }, db);
  assert.equal(archived.tipo, 'archivado');
  const afterArchive = (await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [linked.id_evento_integracion])).rows[0];
  assert.equal(afterArchive.archived_by, userIds.admin); assert.ok(afterArchive.archived_at instanceof Date);
  assert.equal(afterArchive.archive_reason, 'Ensayo ficticio de restauración y archivo');
  // TIMESTAMP sin zona: comparar en PostgreSQL evita asumir la zona local del parser JS.
  assert.equal((await db.query("SELECT abs(extract(epoch FROM (LOCALTIMESTAMP-archived_at))) < 60 valid FROM eventos_integracion WHERE id_evento_integracion=$1", [linked.id_evento_integracion])).rows[0].valid, true);
  const immutable = e => Object.fromEntries(Object.entries(e).filter(([key]) => !['archived_at', 'archived_by', 'archive_reason', 'updated_at'].includes(key)));
  assert.deepEqual(immutable(afterArchive), immutable(beforeArchive));
  assert.deepEqual((await db.query('SELECT * FROM reservas_integracion_link WHERE id_reservacion=$1', [reservation.id_reservacion])).rows, linkedRowsBefore);
  const operational = await service.listarEventosIntegracion({ operational_only: true }, { page: 1, limit: 500 }, db);
  assert.ok(!operational.data.some(e => e.id_evento_integracion === linked.id_evento_integracion));
  const history = await service.listarEventosIntegracion({ archived: true }, { page: 1, limit: 25 }, db);
  assert.ok(history.data.some(e => e.id_evento_integracion === linked.id_evento_integracion));
  const detail = await service.obtenerEventoIntegracion(linked.id_evento_integracion, db);
  assert.equal(detail.archived_by_name, 'Usuario ficticio RESTORE admin');
  assert.equal((await service.archivarEventoIntegracion({ idEventoIntegracion: linked.id_evento_integracion, idUsuario: userIds.admin, motivo: 'Duplicado ficticio' }, db)).tipo, 'ya_archivado');
  assert.deepEqual((await db.query('SELECT * FROM eventos_integracion WHERE id_evento_integracion=$1', [linked.id_evento_integracion])).rows[0], afterArchive);
  assert.equal((await require('../backend/integrations/getyourguide/getyourguideReservationApplication.service').aplicarNuevaReservaGetYourGuide(linked.id_evento_integracion, userIds.admin, {}, db)).tipo, 'evento_archivado');
  passed('archivo_funcional', 'Motivo/fecha/responsable correctos; revisión y vínculo sintéticos conservados, exclusión operacional, historial y duplicado rechazado.');
  const applyPaths = [
    ['getyourguide', 'new_booking', '../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide'],
    ['getyourguide', 'modification', '../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide'],
    ['getyourguide', 'cancellation', '../backend/integrations/getyourguide/getyourguideReservationApplication.service', 'aplicarNuevaReservaGetYourGuide'],
    ['fareharbor', 'new_booking', '../backend/integrations/fareharbor/fareharborApplication.service', 'aplicarNuevaReservaFareHarbor'],
    ['fareharbor', 'modification', '../backend/integrations/fareharbor/fareharborModificationApplication.service', 'aplicarModificationFareHarbor'],
    ['fareharbor', 'cancellation', '../backend/integrations/fareharbor/fareharborCancellationApplication.service', 'aplicarCancellationFareHarbor']
  ];
  for (const [provider, type, file, fn] of applyPaths) {
    const e = await event(provider + '-' + type, provider, type);
    assert.equal((await service.archivarEventoIntegracion({ idEventoIntegracion: e.id_evento_integracion, idUsuario: userIds.admin, motivo: 'Protección ficticia de aplicación' }, db)).tipo, 'archivado');
    assert.equal((await require(file)[fn](e.id_evento_integracion, userIds.admin, {}, db)).tipo, 'evento_archivado');
  }
  passed('aplicacion_bloqueada', 'Seis servicios reales GYG/FH rechazan archivos confirmados antes de operar reservaciones.');
  const expired = await event('expired', 'fareharbor', 'new_booking', 'approved', '2020-01-05T07:15:00-05:00');
  const pending = await event('pending', 'getyourguide', 'new_booking', 'pending_review');
  const applied = await event('applied'); await db.query("UPDATE eventos_integracion SET application_status='applied' WHERE id_evento_integracion=$1", [applied.id_evento_integracion]);
  const dismissed = await event('dismissed', 'getyourguide', 'new_booking', 'dismissed');
  const summary = await summaryService.obtenerResumenNotificaciones(db);
  assert.equal(summary.counts.pending, originalSummary.counts.pending + 2);
  assert.equal(summary.counts.requires_archive, originalSummary.counts.requires_archive + 1);
  assert.equal(summary.events.find(e => e.id_evento_integracion === expired.id_evento_integracion).attention, 'requires_archive');
  assert.ok(summary.events.some(e => e.id_evento_integracion === pending.id_evento_integracion));
  assert.ok(!summary.events.some(e => [applied.id_evento_integracion, dismissed.id_evento_integracion, linked.id_evento_integracion].includes(e.id_evento_integracion)));
  assert.equal(summary.counts.pending, summary.events.length);
  assert.equal(summary.counts.pending, summary.counts.actionable + summary.counts.requires_archive + summary.counts.requires_schedule_review);
  passed('clasificacion_avisos', 'Volumen restaurado más fixtures: conteos consistentes; FH vencida requiere archivo; aplicados/descartados/archivados excluidos.');

  const readonly = make(m.app, secrets.appPassword, m.database, true);
  active = readonly; readQueries.length = 0;
  assert.equal((await readonly.query("SELECT current_setting('transaction_read_only') value")).rows[0].value, 'on');
  const beforeRead = await S.originales(db, afterMeta); // Conjunto de IDs, solo para firmas de todas las filas incluidas las sintéticas.
  const allBefore = await S.originales(db, afterMeta, beforeRead), seqBefore = await S.secuencias(db, afterMeta);
  const app = require('express')(); app.use(require('express').json()); app.use('/api/eventos-integracion', require('../backend/routes/eventosIntegracion.routes'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const apiPort = server.address().port; barrier.allowApi(apiPort);
  const request = require('supertest')('http://127.0.0.1:' + apiPort);
  const tokens = Object.fromEntries(Object.entries(userIds).map(([k, id]) => [k, require('jsonwebtoken').sign({ id_usuario: id }, process.env.JWT_SECRET, { expiresIn: '5m' })]));
  const get = (label, method = 'get') => request[method]('/api/eventos-integracion/resumen').set('Authorization', 'Bearer ' + tokens[label]);
  let calls = 0;
  // El controlador ya capturó la función; se cuentan sus consultas características en el proxy.
  const queryCount = () => readQueries.filter(q => q.includes('notificaciones_elegibles AS')).length;
  try {
    for (const label of ['admin', 'all']) {
      const r = await get(label); assert.equal(r.status, 200); assert.equal(r.headers['cache-control'], 'no-store'); assert.deepEqual(r.body.datos.counts, summary.counts); calls++;
    }
    const beforeSelected = queryCount();
    assert.equal((await get('selected')).status, 403); assert.equal((await get('selected', 'head')).status, 403);
    assert.equal(queryCount(), beforeSelected);
    assert.equal((await request.get('/api/eventos-integracion/resumen')).status, 401);
    const samples = [];
    for (let i = 0; i < 12; i++) { const start = performance.now(); assert.equal((await get('admin')).status, 200); samples.push(performance.now() - start); calls++; }
    const sorted = [...samples].sort((a, b) => a - b);
    assert.ok(readQueries.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|nextval|setval)\b/i.test(sql)));
    report.notifications = { testedRoute: 'GET /api/eventos-integracion/resumen', localHttpOnly: true, readOnlyPool: true, adminStatus: 200, consultaAllStatus: 200, consultaSelectedStatus: 403, consultaSelectedHeadStatus: 403, unauthenticatedStatus: 401, selectedReachedSummary: false,
      counts: summary.counts, restoredBaseline: originalSummary.counts, fixtureDelta: 2, measuredRequests: samples.length, successfulReads: calls, averageMs: samples.reduce((a, b) => a + b) / samples.length, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], queryCount: queryCount(), writesDetected: 0 };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); active = db; }
  assert.deepEqual(await S.originales(db, afterMeta, beforeRead), allBefore);
  assert.deepEqual(await S.secuencias(db, afterMeta), seqBefore);
  assert.deepEqual(await S.originales(db, meta, originalKeys), baseline);
  passed('endpoint_y_scope', 'Router/controlador/auth/ACCESS-SCOPE reales: Admin/all 200, selected GET/HEAD 403 antes del resumen, sin sesión 401. Pool READ ONLY.');
  passed('avisos_sin_escrituras', 'Firmas de todas las filas y estados de secuencias idénticos antes/después de las lecturas HTTP; SQL registrado solo de lectura.');
  report.synthetic = { users: userIds, reservation: reservation.id_reservacion, events: fixtureIds, linksCreated: 1, platformAssignmentsCreated: 1, originalRolesChanged: false, originalUsersChanged: false };
  return { synthetic: report.synthetic, afterMetadata: afterMeta, networkApiPort: apiPort };
}
module.exports = { probar };
