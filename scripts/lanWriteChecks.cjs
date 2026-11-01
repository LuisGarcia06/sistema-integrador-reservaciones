const assert=require('node:assert/strict'),https=require('node:https');
const B=require('../electron/httpsBackend');
async function run({c,admin,credentials,api,passed}){
    const second=await api(c,'/api/auth/login',credentials);assert.equal(second.status,200);
    const listing=await api(c,'/api/reservaciones',undefined,admin);
    const rows=listing.body.data||listing.body.datos;
    const row=rows.find(r=>r.codigo==='SYN-HTTPS-1');assert(row);const id=row.id_reservacion;
    const patches=await Promise.all([
        api(c,'/api/reservaciones/'+id,{habitacion:'SYN-CONCURRENT'},admin,'PATCH'),
        api(c,'/api/reservaciones/'+id,{observaciones:'Dos sesiones sintéticas'},second.body.token,'PATCH')
    ]);
    for(const r of patches)assert.equal(r.status,200,JSON.stringify(r.body));
    const get=()=>api(c,'/api/reservaciones/'+id,undefined,admin);
    const current=await get();assert.equal(current.body.datos.habitacion,'SYN-CONCURRENT');assert.equal(current.body.datos.observaciones,'Dos sesiones sintéticas');
    passed('Loopback: dos sesiones escriben campos distintos simultáneamente sin perder cambios');
    // Descartar el cuerpo de la respuesta después de recibir cabeceras 200 (COMMIT ya ocurrió).
    // Una sola escritura. No interpretar el error local como rollback ni reintentar.
    let attempts=0;
    await new Promise((resolve,reject)=>{
        attempts++;
        const request=https.request({...B.options(c),path:'/api/reservaciones/'+id,method:'PATCH',agent:false,timeout:5000,
            headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'}},res=>{
            if(res.statusCode!==200){res.resume();return reject(Error('EXPECTED_COMMITTED_WRITE'));}
            res.destroy();request.destroy();resolve();
        });
        request.on('error',reject);request.on('timeout',()=>request.destroy(Error('HTTPS_TIMEOUT')));
        request.end(JSON.stringify({observaciones:'SYN-UNCERTAIN-RECONCILE-ONCE'}));
    });
    assert.equal(attempts,1);
    const reconciled=await get();assert.equal(reconciled.body.datos.observaciones,'SYN-UNCERTAIN-RECONCILE-ONCE');
    const log=await api(c,'/api/bitacora',undefined,admin);
    assert.equal(log.status,200);const entries=log.body.data||log.body.datos;
    assert.equal(entries.filter(e=>e.id_reservacion===id&&String(e.descripcion).includes('SYN-UNCERTAIN-RECONCILE-ONCE')).length,1);
    passed('Loopback: respuesta descartada tras COMMIT; consulta y bitácora reconcilian una sola escritura, sin reenvío');
}
module.exports={run};
