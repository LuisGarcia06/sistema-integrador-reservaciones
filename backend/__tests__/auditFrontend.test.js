'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),P=require('../config/auditFrontendPolicy');
test.each([
  ['GET','/api/bitacora'],['GET','/api/bitacora?fecha_desde=2099-01-01&fecha_hasta=2099-02-01'],
  ['GET','/api/operaciones?fecha=2099-01-01'],['GET','/api/transportes?id_operacion_tour=1'],
  ['GET','/api/tours'],['GET','/api/daily/operativo?fecha=2099-01-01'],['POST','/api/operaciones'],
  ['PATCH','/api/transportes/1'],['PUT','/api/daily/observaciones?fecha=2099-01-01']
])('lector optativo permite %s %s',(method,url)=>expect(P.allowHttp(method,url)).toBe(true));
test.each([
  ['POST','/api/bitacora'],['POST','/api/reservaciones'],['PATCH','/api/usuarios/1'],['POST','/api/tours'],
  ['GET','/api/usuarios'],['GET','/api/bitacora?fecha_desde=2099-02-30'],['GET','/api/bitacora?fecha_desde=2099-01-01&fecha_desde=2099-01-02'],
  ['GET','/api/bitacora?x=1'],['GET','/api/bitacora?'],['GET','/api/bitacora/'],['GET','/api/operaciones?fecha=2099-01-01&x=1'],
  ['GET','/api/transportes?id_operacion_tour=2147483648'],['GET','/api/comandos/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'],
  ['GET','/api/operaciones/%31'],['GET','/api/daily/operativo?fecha=2099-02-30'],['OPTIONS','/api/bitacora']
])('superficie cerrada rechaza %s %s',(method,url)=>expect(P.allowHttp(method,url)).toBe(false));
function client(audit=true){
  let version=1;const fetch=jest.fn();
  const window={App:{auth:{obtenerVersionSesion:()=>version,obtenerUsuario:()=>({id_usuario:1})},ui:{escapeHtml:v=>String(v).replaceAll('<','&lt;')},api:{apiFetch:fetch}},crypto:{randomUUID:()=>crypto.randomUUID()},setTimeout,clearTimeout};
  const ctx=vm.createContext({window,Headers,AbortController,document:{getElementById:()=>({value:'😀'.repeat(500)})}});
  for(const file of ['revisionLab.js',...(audit?['auditUi.js']:[]),'commandLab.js','revisionConflict.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',file),'utf8'),ctx);
  const protocol=audit?'ctsk-audit-api-v1':'ctsk-command-api-v1',generation=crypto.randomUUID(),headers={protocol,generation};
  const photo=(method,url,datos)=>({metodo:method,ruta:url,datos,revision:null,generacion:generation,etag:'"original"',contexto:'"ctx"'});
  const receipt=s=>({comando:{clave:s.command.key,generacion:generation,estado:'confirmado'},resultado:{codigo:'COMANDO_CONFIRMADO',referencias:s.creation?[{recurso:s.creationResource,id:'12'}]:[]},ids_bitacora:[]});
  return {App:window.App,fetch,photo,headers,receipt,revoke(){version++;}};
}
test.each([undefined,null,'',' ','\u00a0',false,3,{},[],'😀'.repeat(501)])('motivo obligatorio invalido %j',value=>expect(()=>client().App.auditUi.validate(value,true)).toThrow());
test('Unicode se cuenta por puntos de código y cuerpo conserva motivo humano exacto',()=>{
  const c=client();expect(()=>c.App.auditUi.validate('😀'.repeat(500),true)).not.toThrow();expect(()=>c.App.auditUi.validate(undefined,false)).not.toThrow();
  expect(c.App.auditUi.body({estado:'Preparada'},'reason',true).motivo).toBe('😀'.repeat(500));
});
test('alta congela motivo antes de foto y UUID; contrato 020 sigue predeterminado',async()=>{
  expect(client(false).App.commandLab.PROTOCOL).toBe('ctsk-command-api-v1');const c=client(),s=await new c.App.commandLab.CreateOperationSession().open();
  const body={fecha:'2099-01-01',id_tour:1,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00',motivo:' Humano <b>😀 '};s.setProposal(body);
  c.fetch.mockImplementationOnce(async(url,options)=>{expect(options.body.datos.motivo).toBe(body.motivo);return {data:c.photo('POST',s.url,{creacion:true,recurso:'operaciones',intento:'synthetic'}),headers:c.headers,status:200};})
    .mockImplementationOnce(async()=>({status:200,headers:c.headers,data:c.receipt(s)}));
  await s.submit(()=>true);expect(s.command.protocol).toBe('ctsk-audit-api-v1');expect(s.command.body.motivo).toBe(body.motivo);expect(Object.isFrozen(s.command.body)).toBe(true);
});
test.each([[false,'',true],[true,'',true],[true,'Nuevo',false]])('Daily existencia %s texto %s valido sin motivo=%s',async(existe,text,valid)=>{
  const c=client(),url='/api/daily/observaciones?fecha=2099-01-01';c.fetch.mockResolvedValueOnce({data:c.photo('PUT',url,{fecha:'2099-01-01',observaciones:'',existe}),headers:c.headers,status:200});
  const s=await new c.App.commandLab.CommandSession('PUT',url).open();s.setProposal({observaciones:text});c.fetch.mockImplementationOnce(async()=>({status:200,headers:c.headers,data:c.receipt(s)}));
  if(valid)await s.submit(()=>true);else {await expect(s.submit(()=>true)).rejects.toThrow(/Motivo/);expect(s.command).toBeNull();}
});
test('Bitácora escapa JSON, motivo y snapshot y conserva identificadores históricos',()=>{
  const c=client(),window={App:{...c.App,pages:{},ui:{escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),emptyState:()=>''}}};
  const ctx=vm.createContext({window,document:{},Intl,Date,URLSearchParams});let source=fs.readFileSync(path.join(root,'frontend/pages/bitacora.js'),'utf8');
  source=source.replace(/\}\)\(\);\s*$/,'App.testRows=renderRows;})();');vm.runInContext(source,ctx);
  const html=window.App.testRows([{id_bitacora:4,id_usuario:1,id_reservacion:7,codigo_reservacion:'SYN-7',usuario:'Actual',descripcion:'Histórica <script>'},{version_auditoria:2,id_operacion_tour:8,usuario_nombre_snapshot:'Anterior <img>',usuario:'Actual',valores_anteriores:null,valores_nuevos:{estado:'<script>'},motivo:'😀 <script>'}]);
  expect(html).toContain('SYN-7');expect(html).toContain('Operación #8');expect(html).toContain('Anterior &lt;img&gt;');expect(html).toContain('😀 &lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('sin registro anterior');
});
test('entrada 021 no cambia contratos anteriores ni carga formularios alternativos',()=>{
  expect(require('../config/auditApiPolicy').allowHttp('GET','/api/bitacora')).toBe(false);
  const policy=require('../../scripts/auditFrontendPolicy.cjs');for(const file of ['pages/operaciones.js','pages/daily.js','pages/bitacora.js'])expect(policy.assets).toContain(file);
  expect(policy.assets).not.toContain('index.html');expect(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8')).not.toContain('auditUi.js');
});
test('Daily rechaza una foto 021 sin existencia explícita, aunque GET tenga texto vacío',async()=>{
  const c=client(),url='/api/daily/observaciones?fecha=2099-01-01';
  c.fetch.mockResolvedValueOnce({data:c.photo('PUT',url,{fecha:'2099-01-01',observaciones:''}),headers:c.headers,status:200});
  await expect(new c.App.commandLab.CommandSession('PUT',url).open()).rejects.toMatchObject({kind:'protocol'});
});
test('Bitácora mantiene el HTML y filas históricas del perfil anterior',()=>{
  function page(file){
    const window={App:{pages:{},ui:{emptyState:()=>'',escapeHtml:value=>String(value).replaceAll('<','&lt;')}}};
    const ctx=vm.createContext({window,document:{},Intl,Date,URLSearchParams});const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.replace(/\}\)\(\);\s*$/,'App.testRows=renderRows;})();'),ctx);return window.App;
  }
  const old=page('docs/local-fase-2d8b3/before/frontend__pages__bitacora.js'),current=page('frontend/pages/bitacora.js');
  expect(current.pages.bitacora.render()).toBe(old.pages.bitacora.render());
  const rows=[{id_bitacora:1,id_usuario:2,usuario:'Responsable',id_reservacion:3,codigo_reservacion:'SYN-3',accion:'MODIFICAR',descripcion:'Historia <b>',fecha:'2020-01-01T12:00:00Z'}];
  expect(current.testRows(rows)).toBe(old.testRows(rows));
});
