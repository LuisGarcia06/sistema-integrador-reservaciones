// Datos sintéticos solo en una base desechable; principal se usa únicamente para validar identidad.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { Client, Pool } = require('pg');
const root = path.resolve(__dirname, '..');
async function main() {
    const cfg = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
    assert.equal(cfg.DB_NAME, 'sian_kaan_reservaciones'); assert.equal(cfg.DB_USER, 'postgres');
    const name = 'ctsk_centro_lab_' + crypto.randomBytes(6).toString('hex');
    const options = { host:'127.0.0.1',port:5432,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'postgres',options:'-c timezone=UTC' };
    const admin = new Client(options); let db, created = false;
    const checks = [], check = (label, condition) => { assert(condition, label); checks.push(label); };
    try {
        await admin.connect(); assert.equal((await admin.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id,'7632825987452064788');
        assert.match(name,/^ctsk_centro_lab_[a-f0-9]{12}$/); await admin.query('CREATE DATABASE "' + name + '" TEMPLATE template0'); created = true;
        db = new Pool({...options,database:name});
        await db.query(fs.readFileSync(path.join(root,'database/schema.sql'),'utf8').split('\n-- MIGRACION 018:')[0]);
        await db.query(fs.readFileSync(path.join(root,'database/migrations/018_publicacion_integraciones.sql'),'utf8'));
        require.cache[require.resolve('../backend/config/database')] = { id:require.resolve('../backend/config/database'),filename:require.resolve('../backend/config/database'),loaded:true,exports:db };
        await db.query("INSERT INTO roles(nombre) VALUES ('Administrador'),('Consulta')");
        await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES (1,'Admin aislado','a@example.invalid','hash-sintetico',true,'all'),(2,'Consulta aislada','b@example.invalid','hash-sintetico',true,'all'),(2,'Consulta limitada','c@example.invalid','hash-sintetico',true,'selected')");
        await db.query("INSERT INTO tours(nombre,descripcion,activo) VALUES ('Tour A','Laboratorio',true),('Tour B','Laboratorio',true); INSERT INTO paises(nombre) VALUES ('México'); INSERT INTO plataformas(nombre) VALUES ('GetYourGuide')");
        const events = require('../backend/services/eventosIntegracion.service'), centro = require('../backend/services/centroAvisos.service');
        async function insert(code,type,date,extra={}) {
            await events.registrarEventoIntegracion({ provider:'getyourguide',external_event_id:crypto.randomBytes(8).toString('hex'),external_booking_id:code,event_type:type,
                normalized_data:{date,customer_name:'Cliente de laboratorio',...extra.normalized},source_received_at:extra.received || '2026-10-21T10:00:00Z',...extra },db);
            return (await db.query('SELECT max(id_evento_integracion) id FROM eventos_integracion')).rows[0].id;
        }
        const a = await insert('GYGLAB0001','new_booking','21 de octubre de 2026');
        await insert('GYGLAB0001','modification','October 22, 2026 8:30 AM',{received:'2026-10-21T11:00:00Z',source_received_at:'2026-10-21T11:00:00Z'});
        await insert('GYGLAB0001','cancellation','2026-10-22',{source_received_at:'2026-10-21T12:00:00Z'});
        await insert('GYGLABPAST','new_booking','2025-05-12',{source_received_at:'2025-05-01T10:00:00Z'});
        await insert('GYGLABNONE','modification','fecha ilegible');
        await insert('GYGLABINVALID','cancellation','2026-02-31');
        await insert('GYGLABNEXT','new_booking','23 de octubre de 2026');
        const fh = await insert('FHSAFE1','new_booking',null,{provider:'fareharbor',normalized_data:{availability:{start_at:'2026-10-22T02:00:00Z'},contact:{name:'Privado laboratorio'}}});
        const list = f => centro.listarCentro(centro.validarConsulta({date:'2026-10-21',...f}),{includeFareHarborName:true},db);
        let res = await list({});
        check('Prioridad por servicio y conversión FareHarbor a Cancún',res.data.length===3 && res.data[0].id_evento_integracion===fh && res.data[0].service_date==='2026-10-21');
        check('Agrupación conserva tres eventos y último cambio por fecha original',res.data.find(g=>g.external_booking_id==='GYGLAB0001').event_count===3 && res.data.find(g=>g.external_booking_id==='GYGLAB0001').event_type==='cancellation');
        const history = await centro.historialGrupo(a,{page:1,limit:25},db);
        check('Historial individual completo',history.pagination.total===3 && history.data[0].event_type==='cancellation');
        res = await list({tab:'pendientes'});
        check('Fechas ilegibles e inválidas siguen en Pendientes',res.data.filter(g=>g.service_date===null).length===2);
        res = await list({tab:'historico'});
        check('Histórico recuperado sigue pendiente de revisión',res.data.length===1 && res.data[0].review_status==='pending_review' && res.data[0].historical_recovered);
        check('Filtro por código y nombre', (await list({tab:'pendientes',q:'GYGLAB0001'})).pagination.total===1 && (await list({tab:'pendientes',q:'Cliente de laboratorio'})).pagination.total===5);
        check('Búsqueda trata comodines como texto y parametriza SQL',(await list({tab:'pendientes',q:"%' OR 1=1 --"})).pagination.total===0);
        const limitedName = await centro.listarCentro(centro.validarConsulta({date:'2026-10-21',tab:'pendientes',q:'Privado laboratorio'}),{},db);
        check('Nombre FareHarbor reservado a Administrador',limitedName.pagination.total===0);
        check('Filtros combinados por plataforma tipo revisión y rango',(await list({tab:'pendientes',provider:'getyourguide',event_type:'modification',review_status:'pending_review',from:'2026-10-22',to:'2026-10-22'})).pagination.total===1);
        let counts = await centro.obtenerIndicadores('2026-10-21',db);
        check('Indicadores cuentan eventos publicados, no reservaciones internas',counts.pendientes===8 && counts.sin_revisar===8 && counts.urgentes===4 && counts.historicos===1 && counts.sin_fecha===2);
        await db.query("UPDATE integracion_sync_estado SET avisos_activados=false WHERE provider='getyourguide' AND source='publicacion'");
        await insert('GYGLABHIDDEN','new_booking','2026-10-21');
        check('Captura retenida por pausa no aparece en grupos ni indicadores',(await list({tab:'pendientes',q:'GYGLABHIDDEN'})).pagination.total===0 && (await centro.obtenerIndicadores('2026-10-21',db)).pendientes===8);
        await db.query("UPDATE integracion_sync_estado SET avisos_activados=true WHERE provider='getyourguide' AND source='publicacion'; UPDATE eventos_integracion SET aviso_publicado=true WHERE NOT aviso_publicado");
        check('Publicación posterior aparece sin cambiar revisión',(await list({q:'GYGLABHIDDEN'})).pagination.total===1);
        await db.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,estado,fecha_registro,ultima_actualizacion) VALUES ('LAB1','2026-10-21',1,1,1,'Laboratorio',8,2,'Laboratorio','08:00','Mañana',100,'Pendiente',now(),now()),('LAB2','2026-10-21',1,1,1,'Laboratorio',6,1,'Laboratorio','08:00','Mañana',100,'Confirmada',now(),now()),('LAB3','2026-10-21',2,1,1,'Laboratorio',4,1,'Laboratorio','08:00','Tarde',100,'Cancelada',now(),now())");
        await db.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2026-10-21',1,'08:00','Mañana',1,'Pendiente'),('2026-10-21',2,'08:00','Tarde',1,'Pendiente')");
        const dashboard = require('../backend/services/dashboard.service');
        let summary = await dashboard.obtenerResumenDashboard('2026-10-21',{all:true});
        check('Banner: solo internas vigentes, PAX incluye niños una sola vez',summary.metricas.reservaciones_vigentes===2 && summary.metricas.pax_vigentes===14);
        check('Grupos: preparado necesario, pendiente y operación sobrante excluida',summary.metricas.grupos_preparados===1 && summary.metricas.grupos_pendientes===1);
        summary = await dashboard.obtenerResumenDashboard('2026-10-20',{all:true});
        check('Día sin operación conserva cuatro ceros',Object.values(summary.metricas).every(v=>v===0));
        await db.query("UPDATE eventos_integracion SET review_status='approved' WHERE id_evento_integracion=$1",[a]);
        check('Aprobado sin aplicar sigue pendiente pero deja de estar sin revisar',(await centro.obtenerIndicadores('2026-10-21',db)).sin_revisar===8 && (await centro.obtenerIndicadores('2026-10-21',db)).pendientes===9);
        await db.query("UPDATE eventos_integracion SET application_status='applied',applied_by=1,applied_at=now() WHERE id_evento_integracion=$1",[a]);
        check('Aplicación manual reflejada por la siguiente consulta',(await centro.obtenerIndicadores('2026-10-21',db)).pendientes===8);
        process.env.JWT_SECRET='laboratorio-centro-avisos-clave-sintetica';
        const express = require('express'), request = require('supertest'), jwt = require('jsonwebtoken');
        const app=express(); app.use(express.json()); app.use('/api/eventos-integracion',require('../backend/routes/eventosIntegracion.routes'));
        const get = (id,url) => request(app).get(url).set('Authorization','Bearer '+jwt.sign({id_usuario:id},process.env.JWT_SECRET));
        check('API exige sesión',(await request(app).get('/api/eventos-integracion/centro')).status===401);
        check('Administrador y Consulta global pueden consultar',(await get(1,'/api/eventos-integracion/centro')).status===200 && (await get(2,'/api/eventos-integracion/centro/'+a+'/historial')).status===200);
        check('Consulta limitada no accede a listados ni historial global',(await get(3,'/api/eventos-integracion/centro')).status===403 && (await get(3,'/api/eventos-integracion/centro/'+a+'/historial')).status===403);
        check('Consulta no puede aprobar',(await request(app).patch('/api/eventos-integracion/'+a+'/revision').set('Authorization','Bearer '+jwt.sign({id_usuario:2},process.env.JWT_SECRET)).send({accion:'approve'})).status===403);
        check('Validación de fechas y paginación inválidas',(await get(1,'/api/eventos-integracion/centro?from=2026-02-31')).status===400 && (await get(1,'/api/eventos-integracion/centro?limit=10000')).status===400);
        await db.query("UPDATE eventos_integracion SET archived_at=now(),archived_by=1,archive_reason='Archivo sintético aislado' WHERE external_booking_id='GYGLABNONE'");
        check('Archivados sin fecha siguen consultables con filtro explícito',(await list({tab:'pendientes',archived:'archived'})).data.some(g=>g.external_booking_id==='GYGLABNONE'));
        await insert(null,'modification',null); await insert(null,'modification',null);
        check('Eventos sin identificador confiable no se fusionan',(await list({tab:'pendientes'})).data.filter(g=>g.external_booking_id===null).length===2);
        await db.query(`INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,normalized_data,source_received_at)
            SELECT 'getyourguide','volume-'||n,'GYGVOLUME'||n,'new_booking','{"date":"2026-11-01"}'::jsonb, timestamp '2026-10-21' FROM generate_series(1,5000) n`);
        let lastSql, lastValues;
        const measured = { query: async (sql,values) => { lastSql=sql; lastValues=values; return db.query(sql,values); } };
        const start = performance.now(), first = await centro.listarCentro(centro.validarConsulta({date:'2026-10-21',tab:'pendientes',q:'GYGVOLUME',page:1}),{},measured), second = await list({tab:'pendientes',q:'GYGVOLUME',page:2});
        check('Paginación real de 5,000 grupos sin duplicar ni truncar',first.pagination.total===5000 && first.data.length===25 && second.data.length===25 && !first.data.some(e=>second.data.some(other=>e.id_evento_integracion===other.id_evento_integracion)));
        const result={status:'PASSED',checks,productionWrites:false,disposableDatabase:name,paginationTwoPagesMs:Math.round(performance.now()-start),migrationRequired:false};
        fs.mkdirSync(path.join(root,'docs/centro-avisos'),{recursive:true}); fs.writeFileSync(path.join(root,'docs/centro-avisos/postgres-lab.json'),JSON.stringify(result,null,2));
        fs.writeFileSync(path.join(root,'docs/centro-avisos/query-plan.json'),JSON.stringify((await db.query('EXPLAIN (ANALYZE, FORMAT JSON) '+lastSql,lastValues)).rows,null,2));
        console.log(JSON.stringify(result));
    } finally {
        if (db) await db.end();
        if (created) { assert.match(name,/^ctsk_centro_lab_[a-f0-9]{12}$/); await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)'); }
        await admin.end();
    }
}
main().catch(e=>{console.error('CENTRO_LAB_FAILED',e.code||e.name,e.message?.slice(0,200),e.stack?.split('\n').find(l=>l.includes('centroAvisosLab.cjs')));process.exitCode=1;});
