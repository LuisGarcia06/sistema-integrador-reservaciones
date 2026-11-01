'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const gen='1a2b3c4d-1234-4567-89ab-123456789abc',protocol='ctsk-command-api-v1';
function client(){
  let version=1,user={id_usuario:1,rol:'Administrador'};
  const auth={obtenerVersionSesion:()=>version,obtenerUsuario:()=>user,estaAutenticado:()=>true,refrescarSesion:async()=>{},obtenerToken:()=> 'synthetic-jwt',registrarSolicitud:()=>()=>{},limpiarSesion:jest.fn(),establecerMensajeSesion:jest.fn()};
  const window={App:{auth},crypto:{randomUUID:jest.fn(()=>crypto.randomUUID())},setTimeout,clearTimeout,location:{hash:'#/login'},dispatchEvent:jest.fn()};
  const fetch=jest.fn(),ctx=vm.createContext({window,fetch,Headers,AbortController,Event});
  for(const file of ['api.js','revisionLab.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../frontend/js',file),'utf8'),ctx);
  const response=(status,body,extra={})=>({status,ok:status<300,headers:new Headers({'content-type':'application/json','X-CTSK-Protocol':protocol,'X-CTSK-Data-Generation':gen,...extra}),json:async()=>body});
  const photo={datos:{datos:{habitacion:'Original',pax:2}},revision:'9007199254740993',etag:'"original"',contexto:'"ctx"',generacion:gen,metodo:'PATCH',ruta:'/api/reservaciones/1'};
  const receipt=(s,estado='confirmado',codigo='COMANDO_CONFIRMADO')=>({comando:{clave:s.command.key,generacion:gen,estado},resultado:{codigo,referencias:[{recurso:'reservaciones',id:'1'}]},ids_bitacora:estado==='confirmado'?[1]:[]});
  const open=async()=>{fetch.mockResolvedValueOnce(response(200,photo));const s=await new window.App.commandLab.CommandSession('PATCH',photo.ruta).open();s.setProposal({habitacion:'Mi intención'});return s;};
  return {fetch,window,response,photo,receipt,open,revoke(){version++;user={...user,rol:'Consulta'};}};
}
test('confirmar genera UUID segura y sobre profundo inmutable; un recibo congela otro guardado',async()=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>c.response(200,c.receipt(s)));
  await s.submit(()=>true);expect(s.state).toBe('confirmed');expect(c.window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(s.command)).toBe(true);expect(Object.isFrozen(s.command.body)).toBe(true);expect(()=>{s.command.body.habitacion='Otro';}).toThrow();
  const sent=c.fetch.mock.calls[1][1];expect(JSON.parse(sent.body)).toEqual({habitacion:'Mi intención'});
  for(const [name,value]of Object.entries(s.command.headers))expect(sent.headers.get(name)).toBe(value);
  expect(s.command.sessionVersion).toBe(1);expect(s.command.userId).toBe(1);expect(s.original.revision).toBe('9007199254740993');
  await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'blocked'});expect(c.fetch).toHaveBeenCalledTimes(2);
});
test('rechazar confirmación no genera clave ni escribe',async()=>{const c=client(),s=await c.open();expect(await s.submit(()=>false)).toBe(false);expect(s.command).toBeNull();expect(c.window.crypto.randomUUID).not.toHaveBeenCalled();expect(c.fetch).toHaveBeenCalledTimes(1);});
test('respuesta perdida conserva borrador/sobre; recuperación confirmada solo hace GET y no convierte recibo en foto',async()=>{
  const c=client(),s=await c.open();c.fetch.mockRejectedValueOnce(Error('incomplete'));await expect(s.submit(()=>true)).rejects.toMatchObject({isNetworkError:true});const envelope=s.command,original=s.original;
  expect(s.proposal.habitacion).toBe('Mi intención');c.fetch.mockResolvedValueOnce(c.response(200,{...c.receipt(s),http_status_original:200}));await s.recover();
  expect(s.command).toBe(envelope);expect(s.original).toBe(original);expect(s.state).toBe('confirmed');expect(c.fetch.mock.calls[2][0]).toBe('/api/comandos/'+envelope.key);expect(c.fetch.mock.calls[2][1].method).toBe('GET');expect(c.window.crypto.randomUUID).toHaveBeenCalledTimes(1);
});
test.each([404,503])('recuperación %s no autoriza otro guardado ni otra foto',async status=>{
  const c=client(),s=await c.open();c.fetch.mockRejectedValueOnce(Error('lost'));await s.submit(()=>true).catch(()=>{});const command=s.command;
  c.fetch.mockResolvedValueOnce(c.response(status,status===404?{estado:'desconocido',concluyente:false}:{}));await expect(s.recover()).rejects.toMatchObject({status});
  expect(s.state).toBe('uncertain');expect(s.command).toBe(command);expect(s.hasUnresolved()).toBe(true);await expect(s.prepare('review')).rejects.toMatchObject({kind:'blocked'});await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'blocked'});expect(c.fetch).toHaveBeenCalledTimes(3);
});
test.each([[412,'PRECONDICION_OBSOLETA'],[409,'CONTEXTO_OPERATIVO_CAMBIO'],[400,'NEGOCIO_RECHAZADO']])('rechazo durable %s conserva propuesta y nueva intención exige decisión y otra clave',async(status,code)=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>c.response(status,c.receipt(s,'rechazado',code))).mockResolvedValueOnce(c.response(200,{...c.photo,etag:'"actual"'}));
  await expect(s.submit(()=>true)).rejects.toMatchObject({status});const old=s.command;expect(s.receipt.comando.estado).toBe('rechazado');expect(s.proposal.habitacion).toBe('Mi intención');expect(s.original.etag).toBe('"original"');
  c.fetch.mockResolvedValueOnce(c.response(200,{...c.photo,etag:'"nueva"'}));await s.prepare('review');expect(s.command).toBeNull();expect(s.original.etag).toBe('"nueva"');
  expect(await s.submit(()=>false)).toBe(false);expect(c.window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  c.fetch.mockImplementationOnce(async()=>c.response(200,c.receipt(s)));await s.submit(()=>true);expect(s.command.key).not.toBe(old.key);expect(s.command.etag).toBe('"nueva"');
});
test.each([[409,'CLAVE_IDEMPOTENCIA_REUTILIZADA','keyConflict','key-reuse'],[409,'55P03','uncertain','lock']])('error %s %s requiere conciliación; no es conflicto de contexto',async(status,code,state,kind)=>{
  const c=client(),s=await c.open();c.fetch.mockResolvedValueOnce(c.response(status,{codigo:code}));await s.submit(()=>true).catch(()=>{});expect(s.state).toBe(state);expect(s.error.kind).toBe(kind);await expect(s.prepare('review')).rejects.toMatchObject({kind:'blocked'});expect(c.fetch).toHaveBeenCalledTimes(2);
});
test('recibo de otra clave o generación no se acepta',async()=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>c.response(200,{...c.receipt(s),comando:{clave:crypto.randomUUID(),generacion:gen,estado:'confirmado'}}));
  await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'protocol'});expect(s.receipt).toBeNull();expect(s.state).toBe('uncertain');
});
test('cabecera de generación/protocolo de otra API se rechaza al abrir',async()=>{
  const c=client();c.fetch.mockResolvedValueOnce(c.response(200,c.photo,{'X-CTSK-Protocol':'ctsk-revision-api-v1'}));await expect(new c.window.App.commandLab.CommandSession('PATCH',c.photo.ruta).open()).rejects.toMatchObject({kind:'protocol'});
});
test('403 de recuperación elimina recibo e información actual; cambio de sesión prohíbe reusar sobre',async()=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>c.response(200,c.receipt(s)));await s.submit(()=>true);
  c.fetch.mockResolvedValueOnce(c.response(403,{}));await expect(s.recover()).rejects.toMatchObject({status:403});expect(s.receipt).toBeNull();expect(s.state).toBe('forbidden');c.revoke();await expect(s.recover()).rejects.toMatchObject({kind:'blocked'});s.dispose();expect(s.command).toBeNull();
});
test('invalidación durante lectura de conflicto no resucita una edición ni su recibo',async()=>{
  const c=client(),s=await c.open();c.fetch.mockImplementationOnce(async()=>c.response(412,c.receipt(s,'rechazado','PRECONDICION_OBSOLETA')))
    .mockImplementationOnce(async()=>{s.dispose();return c.response(200,c.photo);});
  await expect(s.submit(()=>true)).rejects.toMatchObject({kind:'blocked'});expect(s.state).toBe('disposed');expect(s.command).toBeNull();expect(s.receipt).toBeNull();expect(s.original).toBeNull();
});
test('guardia cierra escritores heredados; la lista mantiene 14 de 25 rutas',async()=>{
  const c=client();await expect(c.window.App.api.apiFetch('/api/reservaciones/1',{method:'PATCH',body:{}})).rejects.toMatchObject({kind:'blocked'});
  const routes=require('../security/revisionApiContract').routes;expect(routes.filter(r=>c.window.App.commandLab.supported(r.method,r.mount+(r.path==='/'?'':r.path.replace(':id','1'))+(r.resource==='daily'?'?fecha=2098-01-01':'')))).toHaveLength(14);
  for(const url of ['/api/reservaciones','/api/usuarios/1/password'])expect(()=>new c.window.App.commandLab.CommandSession(url.endsWith('password')?'PATCH':'POST',url)).toThrow();
});
test('proxy tiene lista cerrada y no monta páginas originales ni sincronizadores',()=>{
  const H=require('../../scripts/commandFrontendHost.cjs');expect(H.allowed('PATCH','/api/reservaciones/1')).toBe(true);expect(H.allowed('POST','/api/reservaciones')).toBe(false);expect(H.allowed('PATCH','/api/usuarios/1/password')).toBe(false);expect(H.allowed('PATCH','/api/integraciones/fareharbor')).toBe(false);expect(H.assets).not.toContain('index.html');expect(H.assets).not.toContain('pages/reservaciones.js');
});
