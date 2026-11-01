'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const generation='1a2b3c4d-1234-4567-89ab-123456789abc',protocol='ctsk-command-api-v1';
const body={fecha:'2096-05-01',id_tour:1,id_pais:1,id_plataforma:1,turno:'Mañana',nombre_cliente:'Cliente sintético',telefono_cliente:null,habitacion:null,idioma:'Español',notificado:false,pax:2,ninos:1,pickup_place:'Punto sintético',pickup_time:'07:00',precio_total:1000,deposito:200,saldo:800,tipo_cambio:null,metodo_pago:null,vendedor:null,observaciones:null,estado:'Pendiente'};
function client(){
  let version=1;
  const auth={estaAutenticado:()=>true,obtenerVersionSesion:()=>version,obtenerUsuario:()=>({id_usuario:1,rol:'Administrador'}),refrescarSesion:async()=>{},obtenerToken:()=> 'synthetic-jwt',registrarSolicitud:()=>()=>{}};
  const window={App:{auth},crypto:{randomUUID:jest.fn(()=>crypto.randomUUID())},setTimeout,clearTimeout,location:{hash:'#/reservaciones'},dispatchEvent(){}};
  const fetch=jest.fn(),context=vm.createContext({window,fetch,Headers,AbortController,Event});
  for(const file of ['api.js','revisionLab.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../frontend/js',file),'utf8'),context);
  const response=(status,data,extra={})=>({status,ok:status<300,headers:new Headers({'content-type':'application/json','X-CTSK-Protocol':protocol,'X-CTSK-Data-Generation':generation,...extra}),json:async()=>data});
  const photo={datos:{creacion:true,recurso:'reservaciones',intento:'synthetic-hmac'},revision:null,etag:'"creation"',contexto:'"context"',generacion:generation,metodo:'POST',ruta:'/api/reservaciones'};
  const receipt=(s,estado='confirmado',codigo='COMANDO_CONFIRMADO')=>({comando:{clave:s.command.key,generacion:generation,estado},resultado:{codigo,recurso:'reservaciones',referencias:estado==='confirmado'?[{recurso:'reservaciones',id:'71'}]:[]},ids_bitacora:estado==='confirmado'?[91]:[]});
  const open=async()=>{const s=await new window.App.commandLab.CreateReservationSession().open();s.setProposal(body);return s;};
  const success=s=>fetch.mockResolvedValueOnce(response(200,photo)).mockImplementationOnce(async()=>response(200,receipt(s)));
  return {window,fetch,photo,response,receipt,open,success,revoke(){version++;}};
}
test('abrir alta o cancelar confirmación no consulta foto vacía, genera UUID o crea comando',async()=>{
  const c=client(),s=await c.open();expect(s.original).toBeNull();expect(c.fetch).not.toHaveBeenCalled();expect(await s.submit(()=>false)).toBe(false);expect(s.command).toBeNull();expect(c.fetch).not.toHaveBeenCalled();expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();
  await expect(s.snapshot({})).rejects.toMatchObject({kind:'blocked'});
});
test('confirmación, cuerpo completo congelado, precondición vinculada y UUID preceden un único POST idéntico',async()=>{
  const c=client(),s=await c.open();let confirmed=false;
  c.fetch.mockImplementationOnce(async(url,options)=>{expect(confirmed).toBe(true);expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();expect(JSON.parse(options.body)).toEqual({metodo:'POST',ruta:'/api/reservaciones',datos:body});expect(Object.isFrozen(s.proposal)).toBe(true);expect(()=>s.setProposal({pax:8})).toThrow();return c.response(200,c.photo);}).mockImplementationOnce(async()=>c.response(200,c.receipt(s)));
  await s.submit(proposed=>{expect(JSON.parse(JSON.stringify(proposed))).toEqual(body);confirmed=true;return true;});
  expect(s.state).toBe('confirmed');expect(c.fetch.mock.calls[1][0]).toBe('/api/reservaciones');expect(JSON.parse(c.fetch.mock.calls[1][1].body)).toEqual(body);expect(s.command.method).toBe('POST');expect(Object.isFrozen(s.command.body)).toBe(true);expect(()=>{s.command.body.pax=7;}).toThrow();expect(c.window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'blocked'});
  await expect(c.window.App.api.apiFetch('/api/reservaciones',{method:'POST',body:{...body,pax:3},headers:s.command.headers,revisionTicket:{}})).rejects.toMatchObject({kind:'blocked'});
  expect(c.fetch).toHaveBeenCalledTimes(2);
});
test('cambios al objeto externo durante precondiciones no alteran la intención confirmada',async()=>{
  const c=client(),s=await c.open();const external={...body};s.setProposal(external);
  c.fetch.mockImplementationOnce(async()=>{external.nombre_cliente='Cambio externo';return c.response(200,c.photo);}).mockImplementationOnce(async()=>c.response(200,c.receipt(s)));
  await s.submit(()=>true);expect(s.command.body.nombre_cliente).toBe(body.nombre_cliente);expect(JSON.parse(c.fetch.mock.calls[1][1].body)).toEqual(body);
});
test('fallo al obtener precondiciones deja alta editable sin clave ni POST',async()=>{
  const c=client(),s=await c.open();c.fetch.mockRejectedValueOnce(Error('synthetic preparation failure'));await expect(s.submit(()=>true)).rejects.toMatchObject({isNetworkError:true});expect(s.state).toBe('ready');expect(s.command).toBeNull();expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();expect(c.fetch).toHaveBeenCalledTimes(1);
});
test.each([{ruta:'/api/tours'},{metodo:'PATCH'},{generacion:'otra'},{revision:'1'},{etag:''},{contexto:''},{etag:'x'.repeat(1025)},{datos:{creacion:false,recurso:'reservaciones',intento:'hmac'}},{datos:{creacion:true,recurso:'usuarios',intento:'hmac'}}])('foto incompatible impide UUID/POST: %j',async delta=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,{...c.photo,...delta}));await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'protocol'});expect(s.command).toBeNull();expect(c.fetch).toHaveBeenCalledTimes(1);expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();
});
test.each([{'X-CTSK-Protocol':'ctsk-revision-api-v1'},{'X-CTSK-Data-Generation':'otra'}])('cabeceras incompatibles de precondiciones no autorizan creación: %j',async headers=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,c.photo,headers));await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'protocol'});expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();expect(c.fetch).toHaveBeenCalledTimes(1);
});
test.each([[409,'CONTEXTO_OPERATIVO_CAMBIO'],[400,'NEGOCIO_RECHAZADO'],[412,'PRECONDICION_OBSOLETA']])('rechazo durable %s conserva propuesta; revisar no reutiliza foto ni consulta una vacía',async(status,code)=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,c.photo)).mockImplementationOnce(async()=>c.response(status,c.receipt(s,'rechazado',code)));
  await s.submit(()=>true).catch(()=>{});const old=s.command;expect(s.proposal.pax).toBe(2);expect(c.fetch).toHaveBeenCalledTimes(2);await expect(s.prepare('current')).rejects.toMatchObject({kind:'blocked'});await s.prepare('review');expect(c.fetch).toHaveBeenCalledTimes(2);
  s.setProposal({...body,nombre_cliente:'Otra intención'});c.fetch.mockResolvedValueOnce(c.response(200,{...c.photo,etag:'"otra foto"'})).mockImplementationOnce(async()=>c.response(200,c.receipt(s)));await s.submit(()=>true);
  expect(s.command.key).not.toBe(old.key);expect(s.command.etag).toBe('"otra foto"');expect(JSON.parse(c.fetch.mock.calls[2][1].body).datos.nombre_cliente).toBe('Otra intención');
});
test('respuesta perdida, recuperación y GET del recurso creado mantienen foto y clave',async()=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,c.photo)).mockRejectedValueOnce(Error('lost'));await s.submit(()=>true).catch(()=>{});const original=s.original,envelope=s.command;
  c.fetch.mockResolvedValueOnce(c.response(200,{...c.receipt(s),http_status_original:200}));await s.recover();expect(s.command).toBe(envelope);expect(s.original).toBe(original);
  c.fetch.mockResolvedValueOnce(c.response(200,{datos:{id_reservacion:71,codigo:'CTSK-SYNTHETIC'}}));await s.inspectCurrent();expect(c.fetch.mock.calls[3][0]).toBe('/api/reservaciones/71');expect(s.original).toBe(original);expect(c.window.crypto.randomUUID).toHaveBeenCalledTimes(1);
});
test('404 sigue incierto; no hay revisión, otra clave o reenvío automático',async()=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,c.photo)).mockRejectedValueOnce(Error('lost'));await s.submit(()=>true).catch(()=>{});const key=s.command.key;c.fetch.mockResolvedValueOnce(c.response(404,{estado:'desconocido',concluyente:false}));await s.recover().catch(()=>{});
  expect(s.state).toBe('uncertain');expect(s.command.key).toBe(key);await expect(s.prepare('review')).rejects.toMatchObject({kind:'blocked'});await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'blocked'});expect(c.fetch).toHaveBeenCalledTimes(3);
});
test.each([[],[{recurso:'usuarios',id:'71'}],[{recurso:'reservaciones',id:'../usuarios'}],[{recurso:'reservaciones',id:'2147483648'}]].map(refs=>({refs})))('recibo con referencia creada inválida no se considera éxito: %j',async({refs})=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(200,c.photo)).mockImplementationOnce(async()=>{const r=c.receipt(s);r.resultado.referencias=refs;return c.response(200,r);});await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'protocol'});expect(s.state).toBe('uncertain');expect(s.receipt).toBeNull();
});
test('invalidación mientras llegan precondiciones elimina la creación antes de generar clave',async()=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>{s.dispose();c.revoke();return c.response(200,c.photo);});await expect(s.submit(()=>true)).rejects.toMatchObject({isStaleSession:true});expect(s.state).toBe('disposed');expect(s.command).toBeNull();expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();
});
test('única alta adicional exacta; perfiles anteriores y otros escritores siguen cerrados',()=>{
  const p=require('../../scripts/reservationFrontendPolicy.cjs'),old=require('../../scripts/commandFrontendHost.cjs');expect(p.allowed('POST','/api/reservaciones')).toBe(true);
  for(const url of ['/api/reservaciones/','/api/reservaciones?x=1','/api/usuarios','/api/tours','/api/transportes'])expect(p.allowed('POST',url)).toBe(false);
  expect(old.allowed('POST','/api/reservaciones')).toBe(false);const c=client();expect(()=>new c.window.App.commandLab.CommandSession('POST','/api/reservaciones')).toThrow();
});
