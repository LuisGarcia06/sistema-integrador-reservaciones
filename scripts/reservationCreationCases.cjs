const assert=require('node:assert/strict');
async function run(h){
  const {input,makeWindow,e,wait,ipc,pass,key,screenshot,model}=h,f=input.fixtures;
  const a=await makeWindow(input.credentials.correo),b=await makeWindow('alta@standalone.example.test');
  const fields=['fecha','turno','tour','pais','plataforma','nombre','telefono','habitacion','idioma','notificado','pax','ninos','pickup-place','pickup-time','metodo-pago','vendedor','precio-total','deposito','saldo','tipo-cambio','observaciones'];
  const values=win=>e(win,"Object.fromEntries([...document.querySelectorAll('#reservaciones-form [id^=reserva-]')].map(c=>[c.id,c.type==='checkbox'?c.checked:c.value]))");
  const field=(win,id,value)=>e(win,`document.getElementById('reserva-${id}').value=${JSON.stringify(String(value))}`);
  async function open(win,name){
    if(await e(win,"Boolean(document.getElementById('reservaciones-close'))")){await e(win,"document.getElementById('reservaciones-close').click()");await wait(win,`!${model}`);}
    await wait(win,"document.getElementById('reservaciones-nueva') && !document.getElementById('reservaciones-nueva').disabled");
    await e(win,"document.getElementById('reservaciones-nueva').click()");await wait(win,`${model}?.creation && ${model}.state==='ready' && document.getElementById('reservaciones-form-mode').value==='create'`);
    const data={fecha:'2096-05-01',turno:'Mañana',tour:f.tour,pais:f.country,plataforma:f.platform,nombre:name,telefono:'9980000000',habitacion:'SYN-ALTA',idioma:'Español',pax:2,ninos:1,'pickup-place':'Punto sintético','pickup-time':'07:00','metodo-pago':'Efectivo',vendedor:'Vendedor sintético','precio-total':'1234.56',deposito:100,saldo:'1134.56','tipo-cambio':'18.5',observaciones:'Alta original <script> como texto'};
    for(const [id,value]of Object.entries(data))await field(win,id,value);
    await e(win,"document.getElementById('reserva-notificado').checked=true");return data;
  }
  const send=win=>e(win,"document.getElementById('reservaciones-form').requestSubmit()");
  const settled=(win,state)=>wait(win,`${model}?.state==='${state}' && document.getElementById('command-state') && !document.querySelector('[data-command-action=recover]').disabled`);
  const save=async(win,state='confirmed')=>{await send(win);await settled(win,state);};
  const recover=async(win,state='confirmed')=>{await e(win,"document.querySelector('[data-command-action=recover]').click()");await settled(win,state);};
  const proof=async(win,name,knownKey)=>ipc('creation-counts',{type:'creation-counts',name,key:knownKey||await key(win)});
  const state=async()=> (await ipc('business-state',{type:'business-state'})).state;
  const record=win=>e(win,`${model}.inspectCurrent().then(r=>r.datos)`);
  const replay=(win,changes={},newKey=false)=>e(win,`(async()=>{const c=${model}.command;const r=await nativeFetch(c.url,{method:'POST',headers:{...c.headers,${newKey?"'Idempotency-Key':crypto.randomUUID(),":''}'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken()},body:JSON.stringify({...c.body,...${JSON.stringify(changes)}})});return {status:r.status,replayed:r.headers.get('Idempotency-Replayed'),data:await r.json()};})()`);
  async function gate(win){
    await e(win,"window.previewArrived=false;window.previewRelease=null;window.previousPreviewFetch=fetch;window.fetch=async(url,options)=>{const r=await previousPreviewFetch(url,options);if(url==='/api/precondiciones'&&JSON.parse(options.body).metodo==='POST'){window.fetch=previousPreviewFetch;window.previewArrived=true;await new Promise(resolve=>window.previewRelease=resolve);}return r;};true");
  }

  await open(a,'SYN-ALTA-VALIDA');assert.equal(await e(a,"document.getElementById('reservaciones-dialog-title').textContent"),'Nueva reservación');assert.equal(await e(a,"document.getElementById('reserva-codigo')"),null);
  assert.equal(await e(a,`JSON.stringify(${JSON.stringify(fields)}.filter(id=>!document.getElementById('reserva-'+id)))`),'[]');assert.equal(await e(a,'photos'),0);
  const valid=await values(a);
  for(const [id,value]of [['fecha',''],['turno',''],['tour',''],['pais',''],['plataforma',''],['nombre',''],['pax','0'],['ninos','99'],['pickup-place',''],['pickup-time','']]){
    await field(a,id,value);await send(a);assert.notEqual(await e(a,"document.getElementById('reservaciones-form-message').textContent"),'');assert.equal(await e(a,'photos'),0);assert.equal(await e(a,'writesIssued'),0);await field(a,id,valid['reserva-'+id]);
  }
  await e(a,'window.acceptConfirmation=false');await send(a);await wait(a,model+".state==='ready' && !document.getElementById('reservaciones-submit').disabled");assert.equal(await e(a,'photos'),0);assert.equal(await e(a,model+'.command'),null);
  await e(a,'window.acceptConfirmation=true');await e(a,"document.getElementById('reservaciones-form').requestSubmit();document.getElementById('reservaciones-form').requestSubmit()");await settled(a,'confirmed');
  let p=await proof(a,'SYN-ALTA-VALIDA');assert.equal(p.rows.length,1);assert.equal(p.commands,1);assert.equal(p.audits.length,1);assert.equal(p.upstreamWrites,1);assert.equal(p.bodyHadMatchingPreview,true);
  assert.equal(await e(a,`${model}.command.body.pax`),2);assert.equal(await e(a,`${model}.command.body.ninos`),1);assert.equal(await e(a,`${model}.command.body.notificado`),true);assert.equal(await e(a,`${model}.command.body.precio_total`),1234.56);
  assert.equal(await e(a,`Object.isFrozen(${model}.command.body)`),true);const original=await e(a,model+'.original'),created=await record(a);assert.match(created.codigo,/^RSV-\d{8}-[A-F0-9]{10}$/);
  await e(a,"document.querySelector('[data-command-action=current]').click()");await wait(a,"document.getElementById('current-command-data').textContent.includes('RSV-')");assert.deepEqual(await e(a,model+'.original'),original);
  const repeated=await replay(a);assert.equal(repeated.status,200);assert.equal(repeated.replayed,'true');p=await proof(a,'SYN-ALTA-VALIDA');assert.equal(p.rows.length,1);assert.equal(p.commands,1);assert.equal(p.audits.length,1);
  await screenshot(a,'alta-confirmada');pass('Alta original: 21 controles, diez validaciones y confirmación cancelable sin foto/UUID; cuerpo completo y único POST ante doble gesto, recibo/código y replay sin duplicados');

  const beforeChanged=await state(),changed=await replay(a,{habitacion:'Otro cuerpo'});assert.equal(changed.status,409);assert.equal(changed.data.codigo,'CLAVE_IDEMPOTENCIA_REUTILIZADA');assert.equal(await state(),beforeChanged);
  pass('Misma clave con cuerpo diferente se rechaza 409 sin crear otra reservación ni auditoría');

  await open(a,'SYN-ALTA-TRANSPORTE-DUP');await ipc('armed',{type:'arm',mode:'duplicate'});await save(a);p=await proof(a,'SYN-ALTA-TRANSPORTE-DUP');assert.equal(p.rows.length,1);assert.equal(p.commands,1);assert.equal(p.audits.length,1);assert.equal(p.upstreamWrites,2);assert.equal(await e(a,model+'.replayed'),true);
  pass('Duplicación HTTP del POST: dos envíos idénticos, una fila/comando/bitácora y recibo de repetición');

  await open(a,'SYN-ALTA-PRECONDICION-FALLIDA');const beforePreparation=await state(),preparedWrites=await e(a,'writesIssued');
  await e(a,"window.beforePreparationFetch=fetch;window.fetch=(url,options)=>{if(url==='/api/precondiciones'){window.fetch=beforePreparationFetch;return Promise.reject(Error('Sonda de precondiciones interrumpida'));}return beforePreparationFetch(url,options);};true");
  await send(a);await wait(a,model+".state==='ready' && !document.getElementById('reservaciones-submit').disabled");assert.equal(await e(a,model+'.command'),null);assert.equal(await e(a,'writesIssued'),preparedWrites);assert.equal(await state(),beforePreparation);assert.match(await e(a,"document.getElementById('reservaciones-form-message').textContent"),/No se envió el POST/);
  pass('Fallo previo de precondiciones deja formulario editable sin clave ni POST y se distingue de una creación incierta');

  await open(a,'SYN-ALTA-CUERPO-ALTERADO');const draft=await values(a),beforeBody=await state();
  await e(a,"window.beforeBodyFetch=fetch;window.fetch=(url,options)=>{if(url==='/api/reservaciones'&&options?.method==='POST'){window.fetch=beforeBodyFetch;options={...options,body:JSON.stringify({...JSON.parse(options.body),habitacion:'SYN-WIRE-CHANGED'})};}return beforeBodyFetch(url,options);};true");await save(a,'rejected');assert.equal(await e(a,model+'.error.status'),400);assert.equal(await e(a,model+'.error.code'),'PRECONDICION_INVALIDA');assert.equal(await state(),beforeBody);assert.deepEqual(await values(a),draft);
  p=await proof(a,'SYN-ALTA-CUERPO-ALTERADO');assert.equal(p.rows.length,0);assert.equal(p.commands,1);assert.equal(p.audits.length,0);assert.equal(p.bodyHadMatchingPreview,false);
  const rejectedKey=await key(a),priorPhotos=await e(a,'photos');await e(a,"window.acceptConfirmation=false;document.querySelector('[data-decision=review]').click()");await wait(a,"!document.querySelector('[data-decision=review]').disabled");assert.equal(await key(a),rejectedKey);assert.equal(await e(a,'photos'),priorPhotos);
  await e(a,"window.acceptConfirmation=true;document.querySelector('[data-decision=review]').click()");await wait(a,model+".state==='ready' && !document.getElementById('reservaciones-submit').disabled");assert.equal(await e(a,'photos'),priorPhotos);assert.deepEqual(await values(a),draft);
  await field(a,'habitacion','Nueva revisión confirmada');await save(a);assert.notEqual(await key(a),rejectedKey);
  pass('Cuerpo alterado después de la precondición recibe 400 PRECONDICION_INVALIDA durable sin alta parcial; revisión conserva datos y exige validación/confirmación y foto nueva');

  await open(a,'SYN-ALTA-CONTEXTO');await gate(a);await send(a);await wait(a,'window.previewArrived');const contextDraft=await values(a);
  await ipc('fixture-changed',{type:'fixture-change',url:'/api/vehiculos/'+f.vehicles[0],body:{color:'Contexto de alta cambiado'}});const beforeContext=await state();await e(a,'window.previewRelease()');await settled(a,'conflict');assert.equal(await e(a,model+'.error.kind'),'context');assert.deepEqual(await values(a),contextDraft);assert.equal(await state(),beforeContext);
  p=await proof(a,'SYN-ALTA-CONTEXTO');assert.equal(p.rows.length,0);assert.equal(p.commands,1);assert.equal(p.audits.length,0);await screenshot(a,'alta-contexto-409');
  pass('Contexto cambiado entre foto y POST produce 409 durable; formulario intacto, sin alta o bitácora parcial');

  await open(a,'SYN-ALTA-FK-INVALIDA');await e(a,"document.getElementById('reserva-pais').add(new Option('Sonda sintética de catálogo','2147483647'));document.getElementById('reserva-pais').value='2147483647'");const beforeBusiness=await state();await save(a,'rejected');assert.equal(await state(),beforeBusiness);p=await proof(a,'SYN-ALTA-FK-INVALIDA');assert.equal(p.rows.length,0);assert.equal(p.commands,1);assert.equal(p.audits.length,0);
  pass('FK de catálogo manipulada es rechazada por backend: recibo durable, formulario retenido y rollback sin fila o auditoría parcial');

  await open(a,'SYN-ALTA-DOS-INTENCIONES');await save(a);const firstKey=await key(a);await open(b,'SYN-ALTA-DOS-INTENCIONES');await save(b);assert.notEqual(await key(b),firstKey);p=await proof(b,'SYN-ALTA-DOS-INTENCIONES');assert.equal(p.rows.length,2);assert.equal(new Set(p.rows.map(r=>r.codigo)).size,2);assert.equal(p.audits.length,2);
  pass('Dos intenciones humanas distintas con claves diferentes pueden crear dos reservas: la idempotencia no deduplica clientes ni sustituye unicidad de código');

  await ipc('creation-fault-ready',{type:'creation-fault',mode:'code-collision'});await open(a,'SYN-ALTA-COLISION-A');await save(a);const collisionA=await record(a);await open(b,'SYN-ALTA-COLISION-B');await save(b);const collisionB=await record(b);
  const collision=await ipc('creation-fault-status',{type:'creation-fault-status'});assert.equal(collision.forcedCalls,2);assert.equal(collision.codeAttempts,3);assert(collisionA.codigo.endsWith('C3C3C3C3C3'));assert.notEqual(collisionA.codigo,collisionB.codigo);
  process.send({type:'action-proof',proof:{kind:'server-generated-code-collision',...collision,first:collisionA.codigo,second:collisionB.codigo}});
  p=await proof(a,'SYN-ALTA-COLISION-A');assert.equal(p.rows.length,1);assert.equal(p.audits.length,1);p=await proof(b,'SYN-ALTA-COLISION-B');assert.equal(p.rows.length,1);assert.equal(p.audits.length,1);
  pass('Dos administradores reciben el mismo código generado de prueba; el generador original resuelve la colisión dentro de la transacción, sin otro POST o código de cliente');

  await open(a,'SYN-ALTA-RESPUESTA-PERDIDA');const lostDraft=await values(a);await ipc('armed',{type:'arm',mode:'truncate'});await save(a,'uncertain');const lostKey=await key(a),lostPhoto=await e(a,model+'.original');assert.deepEqual(await values(a),lostDraft);
  p=await proof(a,'SYN-ALTA-RESPUESTA-PERDIDA');assert.equal(p.rows.length,1);assert.equal(p.commands,1);assert.equal(p.audits.length,1);assert.equal(p.upstreamWrites,1);
  await ipc('restarted',{type:'restart'});await recover(a);assert.equal(await key(a),lostKey);assert.deepEqual(await e(a,model+'.original'),lostPhoto);assert.deepEqual(await values(a),lostDraft);const recovered=await record(a);assert.equal(recovered.nombre_cliente,'SYN-ALTA-RESPUESTA-PERDIDA');p=await proof(a,'SYN-ALTA-RESPUESTA-PERDIDA');assert.equal(p.upstreamWrites,1);assert.equal(p.audits.length,1);await screenshot(a,'alta-recuperada');
  pass('Respuesta perdida después de COMMIT: alta única y recibo recuperado tras reiniciar API; consulta del registro creado separada y sin repetir POST');

  const unknown=await makeWindow(input.credentials.correo);await open(unknown,'SYN-ALTA-DESCONOCIDA');await ipc('armed',{type:'arm',mode:'before-write'});await save(unknown,'uncertain');const unknownKey=await key(unknown),unknownPhotos=await e(unknown,'photos');await recover(unknown,'uncertain');
  await e(unknown,"document.getElementById('reservaciones-form').requestSubmit();document.getElementById('reservaciones-nueva').click()");await wait(unknown,"!document.querySelector('[data-command-action=recover]').disabled");assert.equal(await key(unknown),unknownKey);assert.equal(await e(unknown,'photos'),unknownPhotos);p=await proof(unknown,'SYN-ALTA-DESCONOCIDA');assert.equal(p.rows.length,0);assert.equal(p.commands,0);assert.equal(p.audits.length,0);assert.equal(p.upstreamWrites,0);assert.equal(await e(unknown,'writesIssued'),1);
  pass('Alta desconocida sigue no concluyente: bloquea guardar y Nueva, conserva clave/generación y no reenvía ni pide otras precondiciones');

  await open(a,'SYN-ALTA-FALLO-BITACORA');await ipc('creation-fault-ready',{type:'creation-fault',mode:'audit-failure'});const beforeAudit=await state();await save(a,'uncertain');assert.equal(await state(),beforeAudit);p=await proof(a,'SYN-ALTA-FALLO-BITACORA');assert.equal(p.rows.length,0);assert.equal(p.commands,0);assert.equal(p.audits.length,0);
  const fault=await ipc('creation-fault-status',{type:'creation-fault-status'});assert.equal(fault.auditFailures,1);await recover(a,'uncertain');assert.equal(await e(a,model+'.recoveryError.kind'),'unknown');process.send({type:'action-proof',proof:{kind:'creation-audit-rollback',before:beforeAudit,after:await state(),auditFailures:fault.auditFailures,key:await key(a)}});
  pass('Excepción después de insertar bitácora revierte reserva, auditoría y comando; UI mantiene incertidumbre y GET desconocido sin reenvío');

  const consulta=await makeWindow('consulta@standalone.example.test');assert.equal(await e(consulta,"document.getElementById('reservaciones-nueva')"),null);
  const approved=await e(b,model+'.command');for(const platform of [f.platform,f.creation.hidden]){
    const denied=await e(consulta,`nativeFetch('/api/reservaciones',{method:'POST',headers:{...${JSON.stringify(approved.headers)},'Idempotency-Key':crypto.randomUUID(),'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken()},body:JSON.stringify({...${JSON.stringify(approved.body)},nombre_cliente:'SYN-ALTA-DENEGADA',id_plataforma:${platform}})}).then(r=>r.status)`);assert.equal(denied,403);
  }
  await open(b,'SYN-ALTA-PERMISOS');await field(b,'plataforma',f.creation.hidden);await ipc('armed',{type:'arm',mode:'hold'});const held=ipc('held');await send(b);const committed=await held;
  await ipc('fixture-changed',{type:'fixture-change',url:'/api/usuarios/'+f.creation.user,body:{id_rol:input.extraIds.consultaRole,alcance_plataformas:'selected',platform_ids:[f.platform]}});await e(b,'App.auth.refrescarSesion()');await wait(b,`!${model} && !document.getElementById('reservaciones-form')`);await ipc('released',{type:'release'});
  p=await proof(b,'SYN-ALTA-PERMISOS',committed.key);assert.equal(p.rows.length,1);assert.equal(p.commands,1);assert.equal(p.audits.length,1);assert.equal(await e(b,"document.getElementById('command-receipt')"),null);assert.equal(await e(b,`App.api.apiFetch('/api/reservaciones/${p.rows[0].id_reservacion}').then(()=>200,x=>x.status)`),404);
  assert.equal(await e(b,`nativeFetch('/api/comandos/${committed.key}',{headers:{Authorization:'Bearer '+App.auth.obtenerToken(),'X-CTSK-Protocol':'ctsk-command-api-v1','X-CTSK-Data-Generation':${JSON.stringify(input.generation)}}}).then(r=>r.status)`),403);
  pass('Consulta no crea en plataformas visibles u ocultas; revocación durante respuesta elimina formulario/recibo y oculta el alta ya confirmada según alcance');
}
module.exports={run};
