const {error}=require('./revisionTokens');
const resources={
    reservaciones:['reservaciones','id_reservacion'],operaciones:['operaciones_tour','id_operacion_tour'],transportes:['transportes_operacion','id_transporte_operacion'],
    vehiculos:['vehiculos','id_vehiculo'],guias:['guias','id_guia'],operadores:['operadores','id_operador'],tours:['tours','id_tour'],
    paises:['paises','id_pais'],plataformas:['plataformas','id_plataforma'],usuarios:['usuarios','id_usuario'],
    'eventos-integracion':['eventos_integracion','id_evento_integracion'],daily:['daily_observaciones','fecha']
};
const routes=[];
function add(resource,method,path){routes.push({resource,method,path,mount:'/api/'+resource,table:resources[resource][0],pk:resources[resource][1],pattern:new RegExp('^/api/'+resource+(path==='/'?'':path.replace(':id','([1-9][0-9]{0,9})'))+'$')});}
for(const r of ['reservaciones','operaciones','transportes','vehiculos','guias','operadores','tours','usuarios']){add(r,'POST','/');add(r,'PATCH','/:id');}
for(const r of ['paises','plataformas'])add(r,'POST','/');
add('reservaciones','PATCH','/:id/cancelar');add('reservaciones','PATCH','/:id/transporte');add('usuarios','PATCH','/:id/password');
add('eventos-integracion','PATCH','/:id/revision');add('eventos-integracion','PATCH','/:id/archivo');add('eventos-integracion','POST','/:id/aplicar');
add('daily','PUT','/observaciones');
function command(method,url,body){
    if(typeof url!=='string'||!url.startsWith('/api/')||url.includes('%')||url.includes('\\')||typeof method!=='string'||!body||Array.isArray(body)||typeof body!=='object')throw error(400,'SOLICITUD_INVALIDA');
    const parsed=new URL(url,'http://127.0.0.1');parsed.searchParams.sort();
    const pathname=parsed.pathname.replace(/\/$/,''),spec=routes.find(r=>r.method===method&&r.pattern.test(pathname));
    if(!spec)throw error(405,'ESCRITURA_NO_HABILITADA');
    const id=spec.resource==='daily'?parsed.searchParams.get('fecha'):spec.pattern.exec(pathname)[1]||null;
    if(id!==null&&spec.resource!=='daily'&&Number(id)>2147483647)throw error(400,'SOLICITUD_INVALIDA');
    if(spec.resource==='daily'&&!/^\d{4}-\d\d-\d\d$/.test(id||''))throw error(400,'SOLICITUD_INVALIDA');
    return {...spec,id,url:pathname+parsed.search,body,view:spec.resource==='daily'?'/api/daily/observaciones'+parsed.search:id?spec.mount+'/'+id:null};
}
function assertCoverage(router){
    for(const layer of router.stack){
        if(!layer.handle?.stack)continue;
        const mount=layer.ctskMount;
        for(const inner of layer.handle.stack){
            if(!inner.route)continue;
            for(const method of Object.keys(inner.route.methods).filter(m=>!['get','head','options'].includes(m))){
                if(!routes.some(r=>r.mount===mount&&r.path===inner.route.path&&r.method===method.toUpperCase()))throw Error('REVISION_API_COVERAGE_INCOMPLETE');
            }
        }
    }
}
module.exports={resources,routes,command,assertCoverage};
