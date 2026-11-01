const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),policy=require('../../scripts/operationFrontendPolicy.cjs');
const before=fs.readFileSync(path.join(root,'docs/local-fase-2d4/before/frontend__pages__operaciones.js'),'utf8'),after=fs.readFileSync(path.join(root,'frontend/pages/operaciones.js'),'utf8');
function page(source){
  const controls=new Map(),document={getElementById:id=>controls.get(id)||null,querySelectorAll:()=>[],addEventListener(){}};
  const window={App:{auth:{esAdministrador:()=>true}},addEventListener(){},location:{hash:'#/operaciones'}};
  const context=vm.createContext({window,document,URLSearchParams,Date,Set,Map,console});
  for(const file of ['ui.js','transportesUi.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),context);
  const expose=`App.forms={renderDialog,buildOperacionPayload,getChangedPayload,setup(record,suggestion){selectedOperacion=record;selectedSugerencia=suggestion;currentFecha='2093-08-01';tours=[{id_tour:1,nombre:'Tour sintético',activo:true},{id_tour:2,nombre:'Tour inactivo',activo:false}];guias=[{id_guia:1,nombre:'Guía sintética',estado:true},{id_guia:2,nombre:'Guía inactiva',estado:false}];}};`;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,expose+'})();'),context);
  for(const [id,value]of Object.entries({fecha:'2093-08-01',tour:'1',turno:'Mañana',grupo:'1',hora:'07:00',guia:'',estado:'Activa'}))controls.set('operacion-'+id,{value});
  return {forms:window.App.forms,controls,set:(id,value)=>controls.get('operacion-'+id).value=value};
}
const record={id_operacion_tour:1,fecha:'2093-08-01',id_tour:1,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00:00',id_guia:null,estado:'Preparada'};
test.each(['create','edit','suggestion'])('HTML original completo idéntico en %s',mode=>{
  const old=page(before),current=page(after),suggestion={numeroGrupo:1,salida:{fecha:'2093-08-01',id_tour:1,tour:'Tour sintético',turno:'Mañana'}};
  for(const item of [old,current])item.forms.setup(record,suggestion);expect(current.forms.renderDialog(mode,record)).toBe(old.forms.renderDialog(mode,record));
});
test('selección inactiva y estados originales conservados',()=>{
  const old=page(before),current=page(after),inactive={...record,id_tour:2,id_guia:2};for(const p of [old,current])p.forms.setup(inactive,null);
  expect(current.forms.renderDialog('edit',inactive)).toBe(old.forms.renderDialog('edit',inactive));expect(current.forms.renderDialog('edit',inactive)).toContain('inactiva');
});
test.each([['fecha',''],['tour','0'],['turno','Otro'],['grupo','3'],['hora','07:1'],['guia','1.5'],['estado','']])('validación original conservada: %s',(field,value)=>{
  const old=page(before),current=page(after);for(const p of [old,current]){p.forms.setup(record,null);p.set(field,value);}const result=current.forms.buildOperacionPayload();expect(result.errores.length).toBeGreaterThan(0);expect(JSON.stringify(result)).toBe(JSON.stringify(old.forms.buildOperacionPayload()));
});
test('payload de alta completo conserva guía opcional y estado inicial del servidor',()=>{
  const p=page(after);p.forms.setup(null,null);p.controls.delete('operacion-estado');expect(JSON.parse(JSON.stringify(p.forms.buildOperacionPayload()))).toEqual({errores:[],payload:{fecha:'2093-08-01',id_tour:1,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00',id_guia:null}});
});
test.each([['POST','/api/operaciones'],['PATCH','/api/operaciones/1'],['GET','/api/operaciones/1'],['GET','/api/operaciones?fecha=2093-08-01'],['GET','/api/operaciones/sugeridas?fecha=2093-08-01'],['GET','/api/daily/operativo?fecha=2093-08-01']])('política exacta permite %s %s',(method,url)=>expect(policy.allowed(method,url)).toBe(true));
test.each([['POST','/api/operaciones/'],['POST','/api/operaciones?fecha=2093-08-01'],['PATCH','/api/operaciones/1?x=1'],['POST','/api/transportes'],['PATCH','/api/transportes/1'],['PATCH','/api/reservaciones/1/transporte'],['POST','/api/reservaciones'],['PUT','/api/daily/observaciones?fecha=2093-08-01'],['GET','/api/operaciones?fecha=2093-08-01&x=1'],['GET','/api/usuarios']])('escritor o lectura ajena sigue bloqueada %s %s',(method,url)=>expect(policy.allowed(method,url)).toBe(false));
test('entrada explícita original; perfiles anteriores conservan sus superficies',()=>{
  expect(policy.assets).toContain('pages/operaciones.js');expect(policy.assets).toContain('js/transportesUi.js');for(const file of ['index.html','pages/reservaciones.js','pages/daily.js','js/notificaciones.js'])expect(policy.assets).not.toContain(file);
  expect(require('../../scripts/reservationFrontendPolicy.cjs').allowed('POST','/api/operaciones')).toBe(false);expect(require('../../scripts/commandFrontendHost.cjs').allowed('POST','/api/operaciones')).toBe(false);
  expect(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8')).not.toContain('operationCommands.js');
});
test('modelo de alta de Operaciones usa cuerpo confirmado y recurso autorizado correcto',async()=>{
  const fetch=jest.fn(),generation='1a2b3c4d-1234-4567-89ab-123456789abc',protocol='ctsk-command-api-v1';
  const window={App:{auth:{obtenerVersionSesion:()=>1,obtenerUsuario:()=>({id_usuario:1})},api:{apiFetch:fetch}},crypto:{randomUUID:()=>require('node:crypto').randomUUID()},setTimeout,clearTimeout};
  const ctx=vm.createContext({window,Headers,AbortController});for(const file of ['revisionLab.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),ctx);
  const body={fecha:'2093-08-01',id_tour:1,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00',id_guia:null},photo={metodo:'POST',ruta:'/api/operaciones',revision:null,datos:{creacion:true,recurso:'operaciones',intento:'synthetic'},generacion:generation,etag:'"original"',contexto:'"context"'},headers={protocol,generation};
  const s=await new window.App.commandLab.CreateOperationSession().open();s.setProposal(body);expect(fetch).not.toHaveBeenCalled();
  fetch.mockImplementationOnce(async(url,options)=>{expect(url).toBe('/api/precondiciones');expect(JSON.parse(JSON.stringify(options.body.datos))).toEqual(body);return {data:photo,status:200,headers};}).mockImplementationOnce(async()=>({status:200,headers,data:{comando:{clave:s.command.key,generacion:generation,estado:'confirmado'},resultado:{codigo:'COMANDO_CONFIRMADO',referencias:[{recurso:'operaciones',id:'7'}]},ids_bitacora:[]}}));
  await s.submit(()=>true);expect(s.createdId()).toBe('7');expect(JSON.parse(JSON.stringify(s.command.body))).toEqual(body);fetch.mockResolvedValueOnce({data:{datos:{id_operacion_tour:7}},status:200,headers});await s.inspectCurrent();expect(fetch.mock.calls[2][0]).toBe('/api/operaciones/7');expect(s.original.etag).toBe('"original"');expect(()=>new window.App.commandLab.CommandSession('POST','/api/operaciones')).toThrow();
});
test('comparación de edición de Operaciones obtiene GET sin renovar precondiciones antes de decidir',async()=>{
  const fetch=jest.fn(),generation='1a2b3c4d-1234-4567-89ab-123456789abc',headers={protocol:'ctsk-command-api-v1',generation};
  const window={App:{auth:{obtenerVersionSesion:()=>1,obtenerUsuario:()=>({id_usuario:1})},api:{apiFetch:fetch}},crypto:{randomUUID:()=>require('node:crypto').randomUUID()},setTimeout,clearTimeout};const ctx=vm.createContext({window,Headers,AbortController});for(const file of ['revisionLab.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),ctx);
  const photo={metodo:'PATCH',ruta:'/api/operaciones/7',revision:'9007199254740993',datos:{datos:{estado:'Original'}},generacion:generation,etag:'"original"',contexto:'"context"'};fetch.mockResolvedValueOnce({data:photo,status:200,headers});const s=await new window.App.commandLab.CommandSession('PATCH',photo.ruta,{comparisonRead:true}).open();s.setProposal({estado:'Propuesta'});
  fetch.mockImplementationOnce(async()=>{throw {status:412,responseMetadata:headers,data:{comando:{clave:s.command.key,generacion:generation,estado:'rechazado'},resultado:{codigo:'PRECONDICION_OBSOLETA',referencias:[]},ids_bitacora:[]}};}).mockResolvedValueOnce({data:{datos:{estado:'Actual'}},status:200,headers});await s.submit(()=>true).catch(()=>{});expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/precondiciones','/api/operaciones/7','/api/operaciones/7']);expect(s.original.etag).toBe('"original"');expect(s.proposal.estado).toBe('Propuesta');
});
