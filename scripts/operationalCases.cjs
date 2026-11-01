const assert=require('node:assert/strict'),{AsyncLocalStorage}=require('node:async_hooks'),crypto=require('node:crypto');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const timeout=(promise,label,ms=7000)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('BARRIER_TIMEOUT '+label)),ms);})]).finally(()=>clearTimeout(timer));};
async function run({pool,observer:db,report,protectedMode}){
    const R=require('../backend/services/reservaciones.service'),O=require('../backend/services/operaciones.service'),T=require('../backend/services/transportes.service'),V=require('../backend/services/vehiculos.service');
    const actors=new AsyncLocalStorage(),hooks=[],pids=new Map(),trace=[];
    // Solo este proceso de pruebas; servicios reales, clientes reales y barreras por sesión lógica.
    const connect=pool.connect.bind(pool);
    pool.connect=function(callback){
        if(callback)return connect(callback);
        const actor=actors.getStore();
        return connect().then(client=>{
            const original=client.query.bind(client);if(actor)pids.set(actor,client.processID);
            client.query=async function(...args){
                const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
                if(actor){trace.push({actor,sql:sql.replace(/\s+/g,' ').slice(0,160)});const before=hooks.find(h=>!h.used&&h.actor===actor&&h.at==='before'&&h.match(sql));if(before){before.used=true;before.entered.resolve();if(before.error)throw before.error;await timeout(before.release.promise,actor+' before');}}
                const result=await original(...args);
                if(actor){const after=hooks.find(h=>!h.used&&h.actor===actor&&h.at==='after'&&h.match(sql));if(after){after.used=true;after.entered.resolve();await timeout(after.release.promise,actor+' after');}}
                return result;
            };
            const release=client.release.bind(client);client.release=(...args)=>{client.query=original;return release(...args);};
            return client;
        });
    };
    const hold=(actor,match,at='after')=>{const h={actor,match,at,entered:deferred(),release:deferred()};hooks.push(h);return h;};
    const execute=(actor,fn)=>actors.run(actor,fn);
    const settled=promise=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
    const passed=(name,data={})=>{report.checks.push({name,...data});console.log('OPERATIONAL_OK '+name);};
    async function blocked(actor,by){
        const until=Date.now()+2500;
        while(Date.now()<until){const pid=pids.get(actor),owner=pids.get(by);if(pid&&owner){const row=(await db.query('SELECT pg_blocking_pids($1) blockers',[pid])).rows[0];if(row.blockers.includes(owner))return;}
            await new Promise(r=>setTimeout(r,15));}
        throw Error('EXPECTED_DATABASE_WAIT '+actor+' -> '+by);
    }
    let sequence=0;
    const one=async(sql,values)=>(await db.query(sql,values)).rows[0].id;
    const admin=(await db.query("SELECT id_usuario FROM usuarios WHERE correo='administrador@standalone.example.test'")).rows[0].id_usuario;
    const country=await one("INSERT INTO paises(nombre) VALUES ('País operativo sintético') RETURNING id_pais id");
    const platform=await one("INSERT INTO plataformas(nombre) VALUES ('Externa') RETURNING id_plataforma id");
    async function fixture({pax=0,vehicle=false,two=false}={}){
        const n=++sequence,date=`2099-02-${String(n).padStart(2,'0')}`,tour=await one('INSERT INTO tours(nombre,descripcion,activo) VALUES ($1,$2,true) RETURNING id_tour id',['Tour operativo '+n,'Solo pruebas']);
        const v1=await one('INSERT INTO vehiculos(identificador,capacidad) VALUES ($1,12) RETURNING id_vehiculo id',['SYN-V'+n+'A']);
        const v2=await one('INSERT INTO vehiculos(identificador,capacidad) VALUES ($1,12) RETURNING id_vehiculo id',['SYN-V'+n+'B']);
        const ops=[],trs=[];
        for(let group=1;group<=(two?2:1);group++){
            const op=await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00','Mañana',$3,'Preparada') RETURNING id_operacion_tour id",[date,tour,group]);ops.push(op);
            const tr=await one("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,estado) VALUES ($1,$2,'Preparado') RETURNING id_transporte_operacion id",[op,vehicle?(group===1?v1:v2):null]);trs.push(tr);
        }
        const f={n,date,tour,v1,v2,ops,trs};
        if(pax)f.assigned=await reservation(f,pax,trs[0]);return f;
    }
    async function reservation(f,pax=1,tr=null){
        return one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,id_transporte_operacion,estado,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,'Cliente sintético', $6,0,'Punto sintético','07:00','Mañana',1000,200,800,$7,'Programada',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",['SYN-OP-'+crypto.randomBytes(8).toString('hex'),f.date,f.tour,country,platform,pax,tr]);
    }
    async function invariant(){
        const mismatch=(await db.query("SELECT count(*)::int n FROM reservaciones r JOIN transportes_operacion tr USING(id_transporte_operacion) JOIN operaciones_tour o USING(id_operacion_tour) WHERE r.fecha<>o.fecha OR r.id_tour<>o.id_tour OR r.turno IS DISTINCT FROM o.turno")).rows[0].n;
        const over=(await db.query("SELECT tr.id_transporte_operacion FROM transportes_operacion tr LEFT JOIN vehiculos v USING(id_vehiculo) LEFT JOIN reservaciones r ON r.id_transporte_operacion=tr.id_transporte_operacion AND r.estado<>'Cancelada' GROUP BY tr.id_transporte_operacion,v.capacidad HAVING COALESCE(sum(r.pax),0)>12 OR COALESCE(sum(r.pax),0)>v.capacidad")).rows.length;
        const operationOver=(await db.query("SELECT o.id_operacion_tour FROM operaciones_tour o JOIN transportes_operacion tr USING(id_operacion_tour) JOIN reservaciones r USING(id_transporte_operacion) WHERE r.estado<>'Cancelada' GROUP BY o.id_operacion_tour HAVING sum(r.pax)>12")).rows.length;
        const contextOver=(await db.query("SELECT o.fecha,o.id_tour,o.turno FROM operaciones_tour o JOIN transportes_operacion tr USING(id_operacion_tour) JOIN reservaciones r USING(id_transporte_operacion) WHERE r.estado<>'Cancelada' GROUP BY o.fecha,o.id_tour,o.turno HAVING sum(r.pax)>24")).rows.length;
        const minimum=(await db.query("SELECT tr.id_transporte_operacion FROM transportes_operacion tr LEFT JOIN reservaciones r ON r.id_transporte_operacion=tr.id_transporte_operacion AND r.estado<>'Cancelada' WHERE tr.id_vehiculo IS NOT NULL GROUP BY tr.id_transporte_operacion HAVING COALESCE(sum(r.pax),0)<2")).rows.length;
        return {mismatch,over,operationOver,contextOver,minimum};
    }
    const CLEAN={mismatch:0,over:0,operationOver:0,contextOver:0,minimum:0};
    try{
        // 1. Descubrimiento de dependencias: operación vacía mientras se agrega el primer pasajero.
        {
            const f=await fixture(),r=await reservation(f,2),h=hold('operation',s=>s.includes('FOR UPDATE OF r'));
            const u=settled(execute('operation',()=>O.actualizarOperacionParcial(f.ops[0],{fecha:'2099-03-01'})));await timeout(h.entered.promise,'empty membership');
            const a=settled(execute('assign',()=>R.asignarTransporteReservacion(r,f.trs[0],admin)));
            if(protectedMode){await blocked('assign','operation');h.release.resolve();}else{assert((await a).ok);h.release.resolve();}
            const ur=await u,ar=await a;assert(ur.ok,ur.error?.message);
            if(protectedMode){assert(ar.ok);assert.equal(ar.value.tipo,'incompatible');assert.equal((await invariant()).mismatch,0);}
            else{assert.equal((await invariant()).mismatch,1);/* Reparación solo del fixture para los siguientes ensayos. */await db.query('UPDATE operaciones_tour SET fecha=$1 WHERE id_operacion_tour=$2',[f.date,f.ops[0]]);}
            passed('operation-versus-first-assignment',{riskReproduced:!protectedMode,guarded:protectedMode});
        }
        // 2. Misma reservación: serialización, sin implementar todavía versiones de formulario.
        {
            const f=await fixture({two:true}),r=await reservation(f,2),h=hold('same-A',s=>s.includes('FROM reservaciones')&&s.includes('FOR UPDATE'));
            const a=settled(execute('same-A',()=>R.asignarTransporteReservacion(r,f.trs[0],admin)));await timeout(h.entered.promise,'same row');
            const b=settled(execute('same-B',()=>R.asignarTransporteReservacion(r,f.trs[1],admin)));await blocked('same-B','same-A');h.release.resolve();
            assert((await a).ok);assert((await b).ok);assert.equal((await db.query('SELECT id_transporte_operacion FROM reservaciones WHERE id_reservacion=$1',[r])).rows[0].id_transporte_operacion,f.trs[1]);
            assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r])).rows[0].n,2);
            passed('same-reservation-two-assignments',{lastWriterWinsStillExpected:true});
        }
        // 3. Último lugar, reservas distintas; el perdedor no deja cambio ni auditoría.
        {
            const f=await fixture({pax:11,two:true});await reservation(f,12,f.trs[1]);
            const r1=await reservation(f),r2=await reservation(f),h=hold('last-A',s=>s.startsWith('UPDATE reservaciones'));
            const a=settled(execute('last-A',()=>R.asignarTransporteReservacion(r1,f.trs[0],admin)));await timeout(h.entered.promise,'last seat');
            const b=settled(execute('last-B',()=>R.asignarTransporteReservacion(r2,f.trs[0],admin)));await blocked('last-B','last-A');h.release.resolve();
            assert((await a).ok);const second=await b;assert(second.ok);assert.equal(second.value.tipo,'capacidad_invalida');
            assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[r2])).rows[0].n,0);assert.deepEqual(await invariant(),CLEAN);passed('last-seat-no-overbooking-or-partial-audit');
        }
        // 4. Cancelación y PAX simultáneos en filas distintas del mismo vehículo.
        {
            const f=await fixture({pax:2,vehicle:true}),other=await reservation(f,2,f.trs[0]),h=hold('cancel',s=>s.startsWith('UPDATE reservaciones'));
            const a=settled(execute('cancel',()=>R.cancelarReservacion(f.assigned,admin,'Motivo sintético')));await timeout(h.entered.promise,'cancel');
            const b=settled(execute('pax',()=>R.actualizarReservacionParcial(other,{pax:1},admin)));await blocked('pax','cancel');h.release.resolve();
            assert((await a).ok);const pr=await b;assert(!pr.ok);assert.equal(pr.error.statusCode,400);
            assert.equal((await db.query('SELECT pax FROM reservaciones WHERE id_reservacion=$1',[other])).rows[0].pax,2);passed('cancel-versus-pax-preserves-vehicle-minimum');
        }
        // 5. Orden cruzado V/TR: tres conexiones, barreras antes del ciclo real de espera.
        {
            const f=await fixture({two:true,vehicle:true,pax:2});await reservation(f,2,f.trs[1]);const r=await reservation(f);
            const hb=hold('transport',s=>s.includes('FROM transportes_operacion')&&s.includes('FOR UPDATE'));
            const b=settled(execute('transport',()=>T.actualizarTransporteParcial(f.trs[1],{id_vehiculo:f.v1})));await timeout(hb.entered.promise,'transport row');
            if(protectedMode){
                const c=settled(execute('vehicle',()=>V.actualizarVehiculoParcial(f.v1,{capacidad:10})));
                const a=settled(execute('cycle-assign',()=>R.asignarTransporteReservacion(r,f.trs[0],admin)));
                await blocked('vehicle','transport');await blocked('cycle-assign','transport');hb.release.resolve();
                for(const result of await Promise.all([a,b,c]))assert(result.ok,result.error?.message);
                passed('cross-resource-writes-no-deadlock',{guarded:true});
            }else{
                const hc=hold('vehicle',s=>s.includes('FROM vehiculos')&&s.includes('FOR UPDATE'));
                const c=settled(execute('vehicle',()=>V.actualizarVehiculoParcial(f.v1,{capacidad:10})));await timeout(hc.entered.promise,'vehicle row');
                const a=settled(execute('cycle-assign',()=>R.asignarTransporteReservacion(r,f.trs[0],admin)));await blocked('cycle-assign','transport');
                hb.release.resolve();await blocked('transport','vehicle');hc.release.resolve();
                const results=await Promise.all([a,b,c]);assert(results.some(x=>!x.ok&&x.error.code==='40P01'));
                passed('cross-resource-deadlock-reproduced',{codes:results.map(x=>x.ok?'committed':x.error.code)});
            }
            assert.deepEqual(await invariant(),CLEAN);
        }
        // 6. Colisión de código: se fuerza solo el RNG del proceso de prueba.
        {
            const f=await fixture(),bytes=crypto.randomBytes,now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');
            const collision='a1b2c3d4e5';await db.query('UPDATE reservaciones SET codigo=$1 WHERE id_reservacion=$2',['RSV-'+date+'-'+collision.toUpperCase(),await reservation(f)]);
            let draws=0;crypto.randomBytes=function(size){return size===5?Buffer.from(++draws===1?collision:'b1b2c3d4e5','hex'):bytes(size);};
            const data={fecha:f.date,id_tour:f.tour,id_pais:country,id_plataforma:platform,nombre_cliente:'Colisión sintética',pax:1,ninos:0,pickup_place:'Sintético',pickup_time:'07:00',turno:'Mañana',precio_total:1000,deposito:200,saldo:800,estado:'Programada'};
            let result;try{result=await settled(R.crearReservacion(data,admin));}finally{crypto.randomBytes=bytes;}
            if(protectedMode){assert(result.ok,result.error?.message);assert.equal(draws,2);assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[result.value.id_reservacion])).rows[0].n,1);}
            else{assert(!result.ok);assert.equal(result.error.code,'25P02');}
            passed('unique-code-collision',{riskReproduced:!protectedMode,code:result.ok?'created-once':result.error.code});
        }
        if(protectedMode)await require('./operationalAdditionalCases.cjs').run({pool,db,R,O,T,V,admin,country,platform,fixture,reservation,hold,execute,settled,blocked,timeout,passed,invariant,CLEAN,trace});
        report.finalInvariants=await invariant();assert.deepEqual(report.finalInvariants,CLEAN);
    }finally{for(const h of hooks)h.release.resolve();pool.connect=connect;report.trace=trace;}
}
module.exports={run};
