// Regresión del formulario original sin PostgreSQL ni HTTP real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const policy=require('../../scripts/reservationFrontendPolicy.cjs');
const root=path.resolve(__dirname,'../..');
const before=fs.readFileSync(path.join(root,'docs/local-fase-2d1/before/frontend__pages__reservaciones.js'),'utf8');
const after=fs.readFileSync(path.join(root,'frontend/pages/reservaciones.js'),'utf8');
function page(source,record={}){
  const elements=new Map();
  const document={getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]};
  const App={auth:{esAdministrador:()=>true,obtenerUsuario:()=>({id_usuario:1})},api:{apiFetch:jest.fn().mockRejectedValue(Error('SYNTHETIC_STOP'))}};
  const window={App,location:{hash:'#/reservaciones'},addEventListener(){},clearTimeout(){}};
  const context=vm.createContext({window,document,URLSearchParams,Date,Set,console});
  vm.runInContext(fs.readFileSync(path.join(root,'frontend/js/ui.js'),'utf8'),context);
  const expose=`App.formTest={renderReservacionDialog,buildPayload,getChangedPayload,submitForm,setup(value){selectedReservacion=value;tours=[{id_tour:1,nombre:'Tour sintético',activo:true},{id_tour:2,nombre:'Inactivo sintético',activo:false}];paises=[{id_pais:1,nombre:'País sintético'}];plataformas=[{id_plataforma:1,nombre:'Externa'}];}};`;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,expose+'})();'),context);App.formTest.setup(record);
  const data={'reservaciones-form-mode':'edit','reservaciones-form-id':'1','reserva-fecha':'2098-01-01','reserva-turno':'Mañana','reserva-tour':'1','reserva-pais':'1','reserva-plataforma':'1','reserva-nombre':'Cliente sintético','reserva-telefono':'','reserva-habitacion':'','reserva-idioma':'','reserva-pax':'2','reserva-ninos':'0','reserva-pickup-place':'Punto sintético','reserva-pickup-time':'07:00','reserva-precio-total':'1000','reserva-deposito':'200','reserva-saldo':'800','reserva-tipo-cambio':'','reserva-metodo-pago':'','reserva-vendedor':'','reserva-observaciones':'','reserva-notificado':'','reserva-motivo-cancelacion':'Motivo sintético'};
  for(const [key,value]of Object.entries(data))elements.set(key,{value});
  elements.set('reservaciones-form-message',{textContent:'',className:''});
  return {App,form:App.formTest,elements,set:(id,value)=>elements.get(id).value=value};
}
const record={id_reservacion:1,codigo:'SYN-1',fecha:'2098-01-01',turno:'Mañana',id_tour:1,id_pais:1,id_plataforma:1,nombre_cliente:'Cliente sintético',pax:2,ninos:0,pickup_place:'Punto sintético',pickup_time:'07:00:00',precio_total:'1000.00',deposito:'200.00',saldo:'800.00',estado:'Programada',notificado:null};
test.each(['edit','create','detail'])('sin adaptador el HTML completo original permanece idéntico: %s',mode=>{
  expect(page(after,record).form.renderReservacionDialog(mode,record)).toBe(page(before,record).form.renderReservacionDialog(mode,record));
});
test.each([{...record,turno:null},{...record,id_tour:2},{...record,estado:'Cancelada',motivo_cancelacion:'Motivo original'}])('conserva variantes históricas, tour inactivo y motivo de cancelación: %j',r=>{
  const current=page(after,r).form.renderReservacionDialog('edit',r);
  expect(current).toBe(page(before,r).form.renderReservacionDialog('edit',r));
  if(!r.turno)expect(current).toContain('Sin clasificar');
  if(r.id_tour===2)expect(current).toContain('Inactivo sintético');
  if(r.estado==='Cancelada')expect(current).toContain('reserva-motivo-cancelacion');
});
test.each([['reserva-fecha','2026-02-31'],['reserva-tour','0'],['reserva-nombre',''],['reserva-pax','1.5'],['reserva-ninos','-1'],['reserva-ninos','3'],['reserva-pickup-place',''],['reserva-pickup-time','07:1'],['reserva-idioma','X'.repeat(51)],['reserva-precio-total','NaN'],['reserva-deposito','NaN']])('validación heredada idéntica y sin solicitud: %s', (id,value)=>{
  const old=page(before,record),current=page(after,record);for(const p of [old,current])p.set(id,value);
  const actual=current.form.buildPayload('edit');expect(actual.errores.length).toBeGreaterThan(0);expect(JSON.stringify(actual)).toBe(JSON.stringify(old.form.buildPayload('edit')));expect(current.App.api.apiFetch).not.toHaveBeenCalled();
});
test('el PATCH heredado conserva cuerpo y comportamiento sin cargar el adaptador optativo',async()=>{
  const original=page(before,record),current=page(after,record);
  for(const p of [original,current]){p.set('reserva-habitacion','Cambio legacy');await p.form.submitForm({preventDefault(){}});}
  expect(current.App.api.apiFetch.mock.calls).toEqual(original.App.api.apiFetch.mock.calls);
  expect(current.App.api.apiFetch).toHaveBeenCalledWith('/api/reservaciones/1',{method:'PATCH',body:{habitacion:'Cambio legacy'}});
});
test.each([['POST','/api/reservaciones'],['PATCH','/api/reservaciones/1/cancelar'],['PATCH','/api/reservaciones/1/transporte'],['PATCH','/api/usuarios/1'],['PATCH','/api/operaciones/1'],['GET','/api/usuarios'],['GET','/api/reservaciones?foo=1'],['GET','/api/reservaciones?page=1&page=2'],['GET','//example.test/api/reservaciones'],['GET','/api/reservaciones/1%2fcancelar']])('proxy integrado cierra superficie no adaptada: %s %s',(method,url)=>expect(policy.allowed(method,url)).toBe(false));
test.each([['PATCH','/api/reservaciones/1'],['GET','/api/reservaciones?page=1&limit=25&turno=Ma%C3%B1ana&nombre=Cliente+sint%C3%A9tico'],['GET','/api/comandos/1a2b3c4d-1234-4567-89ab-123456789abc'],['POST','/api/precondiciones']])('proxy conserva ruta autorizada: %s %s',(method,url)=>expect(policy.allowed(method,url)).toBe(true));
test('entrada integrada carga el módulo original; instalación y perfil anterior no cargan el adaptador',()=>{
  expect(policy.assets).toContain('pages/reservaciones.js');
  for(const file of ['index.html','pages/operaciones.js','pages/daily.js','pages/usuarios.js','js/notificaciones.js','lab/revisionEditor.js'])expect(policy.assets).not.toContain(file);
  for(const file of ['frontend/index.html','frontend/lab/command.html','frontend/lab/revision.html'])expect(fs.readFileSync(path.join(root,file),'utf8')).not.toContain('reservationCommands.js');
  const old=require('../../scripts/commandFrontendHost.cjs');expect(old.assets).not.toContain('pages/reservaciones.js');expect(old.allowed('PATCH','/api/vehiculos/1')).toBe(true);
});

test.each([[412,'PRECONDICION_OBSOLETA'],[409,'CONTEXTO_OPERATIVO_CAMBIO']])('comparación integrada %s obtiene solo GET; otra precondición espera la decisión',async(status,code)=>{
  const generation='1a2b3c4d-1234-4567-89ab-123456789abc',protocol='ctsk-command-api-v1',fetch=jest.fn();
  const window={App:{auth:{obtenerVersionSesion:()=>1,obtenerUsuario:()=>({id_usuario:1})},api:{apiFetch:fetch}},crypto:{randomUUID:()=>require('node:crypto').randomUUID()},setTimeout,clearTimeout};
  const context=vm.createContext({window,Headers,AbortController});
  for(const file of ['revisionLab.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),context);
  const photo={metodo:'PATCH',ruta:'/api/reservaciones/1',generacion:generation,etag:'"original"',contexto:'"ctx"',revision:'9007199254740993',datos:{datos:{habitacion:'Original'}}};
  const headers={protocol,generation},reply=data=>({data,status:200,headers});
  fetch.mockResolvedValueOnce(reply(photo));
  const s=await new window.App.commandLab.CommandSession('PATCH',photo.ruta,{comparisonRead:true}).open();s.setProposal({habitacion:'Mía'});
  fetch.mockImplementationOnce(async()=>{throw Object.assign(Error('Rechazo'),{status,data:{comando:{clave:s.command.key,generacion:generation,estado:'rechazado'},resultado:{codigo:code,referencias:[]},ids_bitacora:[]},responseMetadata:headers});});
  fetch.mockResolvedValueOnce(reply({datos:{habitacion:'Actual'}}));
  await expect(s.submit(()=>true)).rejects.toMatchObject({status});
  expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/precondiciones','/api/reservaciones/1','/api/reservaciones/1']);
  expect(fetch.mock.calls[2][1].method).toBeUndefined();expect(s.current.datos.datos.habitacion).toBe('Actual');expect(s.current.etag).toBeUndefined();expect(s.original.etag).toBe('"original"');
  expect(s.proposal.habitacion).toBe('Mía');
  expect(await s.prepare('current',()=>false)).toBe(false);expect(fetch).toHaveBeenCalledTimes(3);
  fetch.mockResolvedValueOnce(reply({...photo,etag:'"Nueva"'}));await s.prepare('review');
  expect(fetch.mock.calls[3][0]).toBe('/api/precondiciones');expect(s.original.etag).toBe('"Nueva"');expect(s.command).toBeNull();
});
