const assert=require('node:assert/strict');
async function run(x){
    const {pool,db,R,O,T,admin,fixture,reservation,hold,execute,settled,blocked,timeout,passed,invariant,CLEAN}=x;
    const {KEY}=require('../backend/config/operationalTransactions');
    // Capacidad real del vehículo menor a 12, con contexto y filas independientes.
    {
        const f=await fixture({pax:2,vehicle:true});await db.query('UPDATE vehiculos SET capacidad=3 WHERE id_vehiculo=$1',[f.v1]);
        const r1=await reservation(f),r2=await reservation(f),h=hold('small-A',s=>s.startsWith('UPDATE reservaciones'));
        const a=settled(execute('small-A',()=>R.asignarTransporteReservacion(r1,f.trs[0],admin)));await timeout(h.entered.promise,'small vehicle');
        const b=settled(execute('small-B',()=>R.asignarTransporteReservacion(r2,f.trs[0],admin)));await blocked('small-B','small-A');h.release.resolve();
        assert((await a).ok);const loser=await b;assert(loser.ok);assert.equal(loser.value.tipo,'capacidad_invalida');passed('real-vehicle-capacity-three-preserved');
    }
    // Excepción tras UPDATE y antes de auditoría: no persiste ninguna parte de la acción.
    {
        const f=await fixture(),r=await reservation(f),h=hold('audit-fail',s=>s.startsWith('INSERT INTO bitacora'),'before');h.error=Error('SYNTHETIC_AUDIT_FAILURE');
        const result=await settled(execute('audit-fail',()=>R.actualizarReservacionParcial(r,{habitacion:'MUST-ROLL-BACK'},admin)));
        assert(!result.ok);assert.equal(result.error.message,'SYNTHETIC_AUDIT_FAILURE');
        assert.equal((await db.query('SELECT habitacion FROM reservaciones WHERE id_reservacion=$1',[r])).rows[0].habitacion,null);
        assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r])).rows[0].n,0);passed('audit-failure-rolls-back-data');
    }
    // Creaciones que antes eran autocommit: fallo de lectura final revierte su INSERT.
    {
        const f=await fixture();
        const ho=hold('create-op-fail',s=>s.includes('FROM operaciones_tour ot')&&s.includes('WHERE ot.id_operacion_tour'),'before');ho.error=Error('SYNTHETIC_FINAL_READ');
        const result=await settled(execute('create-op-fail',()=>O.crearOperacion({fecha:f.date,id_tour:f.tour,turno:'Mañana',numero_grupo:2,hora_inicio:'07:00',id_guia:null,estado:'Preparada'})));
        assert(!result.ok);assert.equal((await db.query('SELECT count(*)::int n FROM operaciones_tour WHERE id_tour=$1 AND numero_grupo=2',[f.tour])).rows[0].n,0);
        const op=await O.crearOperacion({fecha:f.date,id_tour:f.tour,turno:'Mañana',numero_grupo:2,hora_inicio:'07:00',id_guia:null,estado:'Preparada'});
        const ht=hold('create-tr-fail',s=>s.includes('FROM transportes_operacion tr')&&s.includes('WHERE tr.id_transporte_operacion'),'before');ht.error=Error('SYNTHETIC_FINAL_READ');
        const tr=await settled(execute('create-tr-fail',()=>T.crearTransporte({id_operacion_tour:op.id_operacion_tour,id_vehiculo:null,id_operador:null,observaciones_operador:null,estado:'Preparado'})));
        assert(!tr.ok);assert.equal((await db.query('SELECT count(*)::int n FROM transportes_operacion WHERE id_operacion_tour=$1',[op.id_operacion_tour])).rows[0].n,0);
        passed('operation-and-transport-creation-atomic');
    }
    // Contención acotada, sin reintentos; el pool queda reutilizable y sin candado de sesión.
    {
        const f=await fixture(),r=await reservation(f);
        await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);
        try{
            const rejected=await settled(execute('busy',()=>R.asignarTransporteReservacion(r,f.trs[0],admin)));
            assert(!rejected.ok);assert.equal(rejected.error.code,'55P03');assert.equal(rejected.error.statusCode,409);
            assert.equal((await db.query('SELECT id_transporte_operacion FROM reservaciones WHERE id_reservacion=$1',[r])).rows[0].id_transporte_operacion,null);
            const queued=await pool.connect();try{
                const begin=new Promise(resolve=>queued.query('BEGIN',error=>resolve(error)));
                const update=new Promise(resolve=>queued.query('UPDATE reservaciones SET habitacion=$1 WHERE id_reservacion=$2',['MUST-NOT-AUTOCOMMIT',r],error=>resolve(error)));
                assert.equal((await begin).code,'55P03');assert.equal((await update).code,'55P03');
                await queued.query('ROLLBACK');
                assert.equal((await db.query('SELECT habitacion FROM reservaciones WHERE id_reservacion=$1',[r])).rows[0].habitacion,null);
            }finally{queued.release();}
        }finally{await db.query('ROLLBACK');}
        const c=await pool.connect();try{
            assert.equal((await c.query('SHOW lock_timeout')).rows[0].lock_timeout,'0');
            assert.equal((await db.query("SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory'",[c.processID])).rows[0].n,0);
            await c.query('BEGIN');await c.query('SAVEPOINT synthetic');await c.query('ROLLBACK TO SAVEPOINT synthetic');
            assert.equal((await db.query("SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory'",[c.processID])).rows[0].n,1);
            await c.query('COMMIT');
            assert.equal((await db.query("SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory'",[c.processID])).rows[0].n,0);
        }finally{c.release();}
        passed('bounded-lock-conflict-no-retry-pool-and-savepoint-clean');
    }
    // Flujo manual REAL GYG, evento sintético: debe esperar ANTES de bloquear el evento.
    {
        const f=await fixture(),r=await reservation(f,2),booking='SYN-GYG-'+f.n;
        await db.query("INSERT INTO reservas_integracion_link(provider,external_booking_id,id_reservacion) VALUES ('getyourguide',$1,$2)",[booking,r]);
        const event=(await db.query("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at) VALUES ('getyourguide',$1,$1,'cancellation','approved','not_applied',$2,CURRENT_TIMESTAMP) RETURNING id_evento_integracion",[booking,JSON.stringify({date:f.date,customer_name:'Evento sintético'})])).rows[0].id_evento_integracion;
        const h=hold('manual-holder',s=>s.includes('FROM reservaciones')&&s.includes('FOR UPDATE'));
        const holder=settled(execute('manual-holder',()=>R.actualizarReservacionParcial(r,{habitacion:'SYN'},admin)));await timeout(h.entered.promise,'manual holder');
        const G=require('../backend/integrations/getyourguide/getyourguideReservationApplication.service');
        const apply=settled(execute('manual-gyg',()=>G.aplicarNuevaReservaGetYourGuide(event,admin,{motivo_cancelacion:'Cancelación sintética aprobada'})));
        await blocked('manual-gyg','manual-holder');
        assert.equal(x.trace.filter(t=>t.actor==='manual-gyg'&&t.sql.includes('FROM eventos_integracion')).length,0);
        h.release.resolve();assert((await holder).ok);const applied=await apply;assert(applied.ok,applied.error?.message);assert.equal(applied.value.tipo,'aplicado');
        assert.equal((await db.query('SELECT estado FROM reservaciones WHERE id_reservacion=$1',[r])).rows[0].estado,'Cancelada');
        assert.equal((await db.query('SELECT application_status FROM eventos_integracion WHERE id_evento_integracion=$1',[event])).rows[0].application_status,'applied');
        const twice=await G.aplicarNuevaReservaGetYourGuide(event,admin,{});assert.equal(twice.tipo,'ya_aplicado');
        assert.equal((await db.query("SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1 AND accion='CANCELAR'",[r])).rows[0].n,1);
        passed('real-manual-gyg-approved-cancellation-serialized-and-audited-once');
    }
    // Aplicador REAL FH: aprobación y huella continúan siendo obligatorias.
    {
        const f=await fixture(),r=await reservation(f,2),booking='SYN-FH-'+f.n;
        await db.query("INSERT INTO reservas_integracion_link(provider,external_booking_id,id_reservacion) VALUES ('fareharbor',$1,$2)",[booking,r]);
        const event=(await db.query("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at) VALUES ('fareharbor',$1,$1,'cancellation','pending_review','not_applied',$2,CURRENT_TIMESTAMP) RETURNING id_evento_integracion",[booking,JSON.stringify({external_booking_id:booking,booking:{status:'cancelled'}})])).rows[0].id_evento_integracion;
        const F=require('../backend/integrations/fareharbor/fareharborCancellationApplication.service'),preview=require('../backend/integrations/fareharbor/fareharborCancellationPreview.service');
        assert.equal((await F.aplicarCancellationFareHarbor(event,admin,{})).tipo,'no_aprobado');
        assert.equal((await require('../backend/services/eventosIntegracion.service').revisarEventoIntegracion({idEventoIntegracion:event,accion:'approve',idUsuario:admin,nota:'Prueba manual sintética'})).tipo,'revisado');
        const diff=await preview.obtenerDiffCancellationFareHarbor(event);
        assert.equal(diff.tipo,'preview');const fingerprint=diff.fareharbor_cancellation_preview.cancellation_fingerprint;
        assert.equal((await F.aplicarCancellationFareHarbor(event,admin,{cancellation_fingerprint:'0'.repeat(64),motivo_cancelacion:'Sintético'})).tipo,'fingerprint_obsoleto');
        const h=hold('fh-holder',s=>s.includes('FROM reservaciones')&&s.includes('FOR UPDATE'));
        // Mismo PAX: el no-op también mantiene el candado hasta el fin de su transacción.
        const holder=settled(execute('fh-holder',()=>R.actualizarReservacionParcial(r,{pax:2},admin)));await timeout(h.entered.promise,'FH holder');
        const apply=settled(execute('manual-fh',()=>F.aplicarCancellationFareHarbor(event,admin,{cancellation_fingerprint:fingerprint,motivo_cancelacion:'Cancelación sintética aprobada'})));
        await blocked('manual-fh','fh-holder');assert.equal(x.trace.filter(t=>t.actor==='manual-fh'&&t.sql.includes('FROM eventos_integracion')).length,0);
        h.release.resolve();assert((await holder).ok);const applied=await apply;assert(applied.ok,applied.error?.message);assert.equal(applied.value.tipo,'aplicado');
        assert.equal((await db.query("SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1 AND accion='CANCELAR'",[r])).rows[0].n,1);
        assert.equal((await F.aplicarCancellationFareHarbor(event,admin,{})).tipo,'ya_aplicado');
        passed('real-manual-fh-approval-fingerprint-lock-and-single-audit');
    }
    // Se agotan los cinco códigos candidatos: sin transacción abortada ni alta parcial.
    {
        const f=await fixture(),crypto=require('node:crypto'),bytes=crypto.randomBytes;let draws=0;
        const before=(await db.query('SELECT (SELECT count(*) FROM reservaciones)::int r,(SELECT count(*) FROM bitacora)::int b')).rows[0];
        crypto.randomBytes=function(size){if(size===5){draws++;return Buffer.from('a1b2c3d4e5','hex');}return bytes(size);};
        let result;try{result=await settled(R.crearReservacion({fecha:f.date,id_tour:f.tour,id_pais:x.country,id_plataforma:x.platform,nombre_cliente:'Solo sintético',pax:1,ninos:0,pickup_place:'Sintético',pickup_time:'07:00',turno:'Mañana',precio_total:1000,estado:'Programada'},admin));}finally{crypto.randomBytes=bytes;}
        assert(!result.ok);assert.equal(result.error.statusCode,500);assert.equal(draws,5);
        assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM reservaciones)::int r,(SELECT count(*) FROM bitacora)::int b')).rows[0],before);
        passed('five-code-collisions-bounded-clean-rollback');
    }
    assert.deepEqual(await invariant(),CLEAN);
}
module.exports={run};
