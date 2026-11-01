const assert = require('node:assert/strict');
const C = require('../backend/config/revisionSchemaContract');
const schema = require('../backend/config/revisionSchema');
async function run({admin,plan,fixtures,report}) {
    const launch = {...process.env};
    require('../backend/config/desktopConfiguration').initialize(plan.config);
    const pool = require('../backend/config/database');
    const {Client} = require('pg');
    const observer = new Client({host:'127.0.0.1',port:plan.manifest.pgPort,database:plan.config.DB_NAME,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});
    const pass = name => {report.checks.push(name);console.log('REVISION_OK '+name);};
    const rev = async(table,id) => (await pool.query(`SELECT revision FROM public.${table} WHERE ${C.TABLES[table][0]}=$1`,[id])).rows[0].revision;
    const expectCode = async(work,code) => assert.rejects(work,e=>e.code===code);
    try {
        await observer.connect();
        await require('../backend/config/revisionLabPolicy').verify(pool,plan);
        pass('strict identity, base schema, revision schema and effective runtime privileges');
        assert.throws(()=>require('../backend/server'),e=>e.code==='SCHEMA_LAB_NOT_OPERATIONAL');
        let touched=false;
        await assert.rejects(require('../backend/standalone').startStandalone(plan,{createServer:()=>{touched=true;throw Error('must not bind');}}),e=>e.code==='SCHEMA_LAB_NOT_OPERATIONAL');
        assert.equal(touched,false);pass('schema-only profile rejects Express and standalone before socket creation');
        for (const [table,columns] of Object.entries(C.TABLES)) {
            const id=fixtures.records[0][table],high=fixtures.records[1][table],pk=columns[0];
            assert.equal(await rev(table,id),'1');
            assert.equal(await rev(table,high),'9007199254740993');
            const field=table==='reservaciones'?'observaciones':table==='operaciones_tour'?'estado':'observaciones_operador';
            await pool.query(`UPDATE public.${table} SET ${field}=$1 WHERE ${pk}=$2`,['Prueba revisión A',id]);assert.equal(await rev(table,id),'2');
            await pool.query(`UPDATE public.${table} SET ${field}=$1 WHERE ${pk}=$2`,['Prueba revisión B',id]);assert.equal(await rev(table,id),'3');
            await pool.query(`UPDATE public.${table} SET ${field}=${field} WHERE ${pk}=$1`,[id]);assert.equal(await rev(table,id),'3');
            const tx=await pool.connect();
            try {
                await tx.query('BEGIN');
                await tx.query(`UPDATE public.${table} SET ${field}=$1 WHERE ${pk}=$2`,['Se revierte',id]);
                assert.equal((await tx.query(`SELECT revision FROM public.${table} WHERE ${pk}=$1`,[id])).rows[0].revision,'4');
                await tx.query('ROLLBACK');
            } finally {tx.release();}
            assert.equal(await rev(table,id),'3');
            assert.equal((await pool.query(`SELECT ${field} value FROM public.${table} WHERE ${pk}=$1`,[id])).rows[0].value,'Prueba revisión B');
            await pool.query(`UPDATE public.${table} SET ${field}=$1 WHERE ${pk}=$2`,['Historial largo',high]);
            const large=await rev(table,high);assert.equal(large,'9007199254740994');assert.equal(typeof large,'string');
            assert.equal(JSON.parse(JSON.stringify({revision:large})).revision,large);
            pass(table+': backfill=1, increments, no-op, rollback and BIGINT exact decimal string');
            for (const expression of ['1','0','revision-1','revision+1','NULL','revision']) await expectCode(()=>pool.query(`UPDATE public.${table} SET revision=${expression} WHERE ${pk}=$1`,[id]),'42501');
            await expectCode(()=>pool.query(`INSERT INTO public.${table} (revision) VALUES (1)`),'42501');
            await expectCode(()=>pool.query(`UPDATE public.${table} SET ${pk}=DEFAULT WHERE ${pk}=$1`,[id]),'42501');
            await expectCode(()=>pool.query(`DELETE FROM public.${table} WHERE ${pk}=$1`,[id]),'42501');
            await expectCode(()=>pool.query(`TRUNCATE public.${table} CASCADE`),'42501'); // ONLY this freshly verified disposable cluster.
            await expectCode(()=>pool.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${C.TRIGGER}`),'42501');
            assert.equal(await rev(table,id),'3');pass(table+': runtime cannot write revision/PK, delete, truncate or disable guard');
            await expectCode(()=>admin.query(`UPDATE public.${table} SET revision=1 WHERE ${pk}=$1`,[id]),'22023');
            await expectCode(()=>admin.query(`INSERT INTO public.${table} (revision) VALUES (2)`),'22023');
            pass(table+': ordinary owner/admin DML also obeys revision guard');
        }
        await expectCode(()=>pool.query('SET ROLE ctsk_standalone_owner'),'42501');
        await expectCode(()=>pool.query("SET session_replication_role='replica'"),'42501');
        pass('runtime cannot impersonate owner or change replication role');
        // Inserción posterior a instalar triggers, sin escribir revision.
        const op=(await pool.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2098-02-01',$1,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour,revision",[fixtures.tour])).rows[0];
        const tr=(await pool.query("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Preparado') RETURNING id_transporte_operacion,revision",[op.id_operacion_tour])).rows[0];
        const r=(await pool.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,fecha_registro,ultima_actualizacion) VALUES ('SYN-REV-NEW','2098-02-01',$1,$2,$3,'Inserción sintética',2,0,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion,revision",[fixtures.tour,fixtures.country,fixtures.platform])).rows[0];
        assert.deepEqual([op.revision,tr.revision,r.revision],['1','1','1']);pass('new insert defaults to revision 1 in all three tables');
        const user=(await pool.query("SELECT id_usuario FROM usuarios WHERE correo='administrador@standalone.example.test'")).rows[0].id_usuario;
        await require('../backend/services/reservaciones.service').actualizarReservacionParcial(r.id_reservacion,{observaciones:'Servicio real sintético'},user);
        await require('../backend/services/operaciones.service').actualizarOperacionParcial(op.id_operacion_tour,{hora_inicio:'07:30'});
        await require('../backend/services/transportes.service').actualizarTransporteParcial(tr.id_transporte_operacion,{observaciones_operador:'Servicio real sintético'});
        assert.deepEqual(await Promise.all([rev('reservaciones',r.id_reservacion),rev('operaciones_tour',op.id_operacion_tour),rev('transportes_operacion',tr.id_transporte_operacion)]),['2','2','2']);
        assert.equal((await pool.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r.id_reservacion])).rows[0].n,1);
        await require('../backend/services/reservaciones.service').actualizarReservacionParcial(r.id_reservacion,{observaciones:'Servicio real sintético'},user);
        await require('../backend/services/operaciones.service').actualizarOperacionParcial(op.id_operacion_tour,{hora_inicio:'07:30'});
        await require('../backend/services/transportes.service').actualizarTransporteParcial(tr.id_transporte_operacion,{observaciones_operador:'Servicio real sintético'});
        assert.deepEqual(await Promise.all([rev('reservaciones',r.id_reservacion),rev('operaciones_tour',op.id_operacion_tour),rev('transportes_operacion',tr.id_transporte_operacion)]),['2','2','2']);
        assert.equal((await pool.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r.id_reservacion])).rows[0].n,1);
        pass('existing real services increment revisions; all three service no-ops preserve revision and audit');
        const audit=require('../backend/services/bitacora.service'),originalAudit=audit.crearEntradaBitacora;
        try {
            audit.crearEntradaBitacora=async()=>{throw Error('SYNTHETIC_REVISION_AUDIT_FAILURE');};
            await assert.rejects(require('../backend/services/reservaciones.service').actualizarReservacionParcial(r.id_reservacion,{habitacion:'Debe revertirse'},user),/SYNTHETIC_REVISION_AUDIT_FAILURE/);
        } finally {audit.crearEntradaBitacora=originalAudit;}
        assert.equal(await rev('reservaciones',r.id_reservacion),'2');
        assert.equal((await pool.query('SELECT habitacion FROM reservaciones WHERE id_reservacion=$1',[r.id_reservacion])).rows[0].habitacion,null);
        assert.equal((await pool.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r.id_reservacion])).rows[0].n,1);
        pass('real reservation service audit failure rolls back data and revision together');
        // Mutaciones DDL SOLO en esta conexión administradora efímera, siempre ROLLBACK.
        // Cambiar a runtime dentro de la misma transacción permite ver el catálogo
        // alterado sin desbloquearlo ni publicarlo a otro proceso.
        async function rejectBroken(name,sql) {
            await admin.query('BEGIN');
            try {
                await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);
                await admin.query('SET LOCAL ROLE ctsk_standalone_runtime');
                await expectCode(()=>schema.verifySchema(admin),'REVISION_SCHEMA_INVALID');
            } finally {await admin.query('ROLLBACK');}
            await require('../backend/config/revisionLabPolicy').verify(pool,plan);pass('fail closed: '+name+'; rollback restores verified schema');
        }
        for (const table of Object.keys(C.TABLES)) {
            await rejectBroken(table+' missing trigger',`DROP TRIGGER ${C.TRIGGER} ON public.${table}`);
            await rejectBroken(table+' disabled trigger',`ALTER TABLE public.${table} DISABLE TRIGGER ${C.TRIGGER}`);
            await rejectBroken(table+' missing column',`ALTER TABLE public.${table} DROP COLUMN revision CASCADE`);
        }
        await rejectBroken('ordinary instead of ALWAYS trigger',`ALTER TABLE public.reservaciones ENABLE TRIGGER ${C.TRIGGER}`);
        await rejectBroken('trigger restricted to one field',`DROP TRIGGER ${C.TRIGGER} ON public.reservaciones; CREATE TRIGGER ${C.TRIGGER} BEFORE INSERT OR UPDATE OF pax ON public.reservaciones FOR EACH ROW EXECUTE FUNCTION public.${C.FUNCTION}(); ALTER TABLE public.reservaciones ENABLE ALWAYS TRIGGER ${C.TRIGGER}`);
        await rejectBroken('wrong default','ALTER TABLE public.reservaciones ALTER COLUMN revision SET DEFAULT 2');
        await rejectBroken('nullable revision','ALTER TABLE public.reservaciones ALTER COLUMN revision DROP NOT NULL');
        await rejectBroken('wrong type','ALTER TABLE public.reservaciones ALTER COLUMN revision TYPE numeric');
        await rejectBroken('missing positive check','ALTER TABLE public.reservaciones DROP CONSTRAINT chk_reservaciones_revision_019');
        await rejectBroken('weakened positive check','ALTER TABLE public.reservaciones DROP CONSTRAINT chk_reservaciones_revision_019; ALTER TABLE public.reservaciones ADD CONSTRAINT chk_reservaciones_revision_019 CHECK(revision>=0)');
        await rejectBroken('changed trigger function',`CREATE OR REPLACE FUNCTION public.${C.FUNCTION}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN RETURN NEW; END; $$`);
        await rejectBroken('missing trigger function',`DROP FUNCTION public.${C.FUNCTION}() CASCADE`);
        await rejectBroken('table UPDATE overrides column restriction','GRANT UPDATE ON public.reservaciones TO ctsk_standalone_runtime');
        await rejectBroken('table INSERT overrides column restriction','GRANT INSERT ON public.reservaciones TO ctsk_standalone_runtime');
        await rejectBroken('direct revision column grant','GRANT UPDATE(revision) ON public.reservaciones TO ctsk_standalone_runtime');
        await rejectBroken('delete can reset identity','GRANT DELETE ON public.reservaciones TO ctsk_standalone_runtime');
        await rejectBroken('missing publication dependency 018','ALTER TABLE public.eventos_integracion DROP COLUMN aviso_publicado CASCADE');
        await rejectBroken('missing sync dependency 018','ALTER TABLE public.integracion_sync_estado DROP COLUMN avisos_activados CASCADE');
        const operational={checks:[],failures:[]};
        await require('./operationalCases.cjs').run({pool,observer,report:operational,protectedMode:true});
        report.operational=operational;assert.equal(operational.checks.length,13);
        pass('all 13 real operational concurrency scenarios preserved under schema 019');
        const manual=(await pool.query("SELECT l.provider,r.revision,r.estado FROM reservas_integracion_link l JOIN reservaciones r USING(id_reservacion) WHERE l.external_booking_id LIKE 'SYN-GYG-%' OR l.external_booking_id LIKE 'SYN-FH-%' ORDER BY l.provider")).rows;
        assert.deepEqual(manual,[{provider:'fareharbor',revision:'2',estado:'Cancelada'},{provider:'getyourguide',revision:'3',estado:'Cancelada'}]);
        pass('synthetic manual FH/GYG application increments once; duplicate application and no-op do not increment');
        // Todos los escritores del ensayo, incluso los aplicadores manuales, están
        // cubiertos. Sus operaciones reales y bitácora se comprobaron arriba.
        assert((await pool.query('SELECT count(*)::int n FROM reservaciones WHERE revision>1')).rows[0].n>3);
        await require('../backend/config/revisionLabPolicy').verify(pool,plan);
    } finally {
        await observer.end().catch(()=>{});await pool.end().catch(()=>{});process.env=launch;
    }
}
module.exports={run};
