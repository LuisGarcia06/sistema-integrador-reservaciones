// Contrato del Centro de Avisos, usando las mismas filas mutables del escenario de avisos.
function respond(rows, url) {
    const q=url.searchParams, page=Number(q.get('page')||1),limit=Number(q.get('limit')||25);
    if(!Number.isInteger(page)||page<1||![25,50,100].includes(limit))throw Error('Paginación sintética inválida');
    const date=q.get('date')||'2026-10-26';
    const project=r=>({...r,service_date:r.provider==='fareharbor'?r.fareharbor_summary?.availability?.start_at?.slice(0,10):r.normalized_data?.date,
        event_count:1,pendientes:!r.archived_at&&r.application_status!=='applied'&&['approved','pending_review'].includes(r.review_status)?1:0,
        first_received_at:r.created_at,last_received_at:r.created_at,source_received_at:r.created_at});
    let data=rows.map(project);
    const history=/\/centro\/(\d+)\/historial$/.exec(url.pathname);
    if(history){
        const parent=rows.find(r=>r.id_evento_integracion===Number(history[1]));
        data=parent?data.filter(r=>r.provider===parent.provider&&r.external_booking_id===parent.external_booking_id):[];
    }else{
        data=data.filter(r=>!q.get('provider')||r.provider===q.get('provider'))
            .filter(r=>!q.get('event_type')||r.event_type===q.get('event_type'))
            .filter(r=>!q.get('review_status')||r.review_status===q.get('review_status'))
            .filter(r=>q.get('archived')==='all'||Boolean(r.archived_at)===(q.get('archived')==='archived'))
            .filter(r=>!q.get('q')||(r.external_booking_id+' '+r.normalized_data?.customer_name).toLowerCase().includes(q.get('q').toLowerCase()))
            .filter(r=>!q.get('from')||(r.service_date&&r.service_date>=q.get('from')))
            .filter(r=>!q.get('to')||(r.service_date&&r.service_date<=q.get('to')));
        if(q.get('tab')!=='historico'&&q.get('archived')!=='all')data=data.filter(r=>r.pendientes);
        if(q.get('tab')==='prioritarios')data=data.filter(r=>r.service_date&&r.service_date>=date);
        if(q.get('tab')==='historico')data=data.filter(r=>r.service_date&&r.service_date<date);
    }
    data.sort((a,b)=>q.get('sort')==='oldest'?a.id_evento_integracion-b.id_evento_integracion:
        q.get('sort')==='service'?String(a.service_date||'9999').localeCompare(String(b.service_date||'9999')):b.id_evento_integracion-a.id_evento_integracion);
    return {data:data.slice((page-1)*limit,page*limit),pagination:{page,limit,total:data.length,totalPages:Math.ceil(data.length/limit)}};
}
module.exports={respond};
