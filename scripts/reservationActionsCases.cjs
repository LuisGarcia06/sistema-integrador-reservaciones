const assert=require('node:assert/strict');
async function run(h){
  const {input,makeWindow,e,wait,ipc,pass,key,counts,screenshot,model}=h,f=input.fixtures.actions;
  const a=await makeWindow(input.credentials.correo),b=await makeWindow('tercero@standalone.example.test');
  const close=async win=>{const id=await e(win,"document.getElementById('reservaciones-cancel-close')?.id || document.getElementById('reservaciones-close')?.id || null");if(id){await e(win,`document.getElementById('${id}').click()`);await wait(win,`!${model}`);}};
  async function open(win,record,action){
    await close(win);const code=await e(win,`App.api.apiFetch('/api/reservaciones/${record.id}').then(r=>r.datos.codigo)`);
    await e(win,`document.getElementById('reservaciones-codigo').value=${JSON.stringify(code)};document.getElementById('reservaciones-filtros').requestSubmit()`);
    const selector=`[data-reservacion-action="${action}"][data-id="${record.id}"]`;
    await wait(win,`document.querySelector(${JSON.stringify(selector)}) && !document.getElementById('reservaciones-codigo').disabled`);
    await e(win,`document.querySelector(${JSON.stringify(selector)}).click()`);
    await wait(win,`${model}?.state==='ready' && document.getElementById('${action==='cancel'?'reservaciones-cancel-motivo':'reservation-command-panel'}')`);
  }
  const reason=(win,value)=>e(win,`document.getElementById('reservaciones-cancel-motivo').value=${JSON.stringify(value)}`);
  const cancel=win=>e(win,"document.getElementById('reservaciones-cancel-form').requestSubmit()");
  async function choose(win,destination,remove=false){
    if(!remove)await e(win,`document.querySelector('[data-reserva-select]').value=${JSON.stringify(String(destination))}`);
    await e(win,`document.querySelector('${remove?'[data-unassign-reserva]':'[data-assign-reserva], [data-move-reserva]'}').click()`);
  }
  const settled=(win,state)=>wait(win,`${model}?.state==='${state}' && document.getElementById('command-state') && !document.querySelector('[data-command-action=recover]').disabled`);
  const state=async()=> (await ipc('business-state',{type:'business-state'})).state;
  const recover=async(win,result)=>{await e(win,"document.querySelector('[data-command-action=recover]').click()");await settled(win,result);};
  const read=(win,id)=>e(win,`App.api.apiFetch('/api/reservaciones/${id}').then(r=>r.datos)`);
  const editOther=(win,id,body)=>e(win,`(async()=>{const s=await new App.commandLab.CommandSession('PATCH','/api/reservaciones/${id}').open();s.setProposal(${JSON.stringify(body)});await s.submit(()=>window.confirm('Confirmar cambio sintético del otro administrador'));return s.receipt.comando.estado;})()`);
  const replay=win=>e(win,`(async()=>{const c=${model}.command;const r=await nativeFetch(c.url,{method:c.method,headers:{...c.headers,'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken()},body:c.bodyJson});return {status:r.status,replayed:r.headers.get('Idempotency-Replayed'),data:await r.json()};})()`);

  await open(a,f.cancelValid,'cancel');assert.equal(await e(a,"document.getElementById('reservaciones-cancel-title').textContent"),'Cancelar reservación');
  assert.match(await e(a,"document.getElementById('reservaciones-cancel-form').textContent"),/SYN-ACC-cancelValid/);
  const writes=await e(a,'writesIssued');await cancel(a);assert.equal(await e(a,'writesIssued'),writes);assert.equal(await e(a,model+'.command'),null);
  assert.match(await e(a,"document.getElementById('reservaciones-cancel-message').textContent"),/motivo/);
  await reason(a,'  Motivo obligatorio original  ');await e(a,'window.acceptConfirmation=false');await cancel(a);await wait(a,model+".state==='ready' && !document.getElementById('reservaciones-cancel-submit').disabled");assert.equal(await e(a,model+'.command'),null);
  await e(a,'window.acceptConfirmation=true');await e(a,"document.getElementById('reservaciones-cancel-form').requestSubmit();document.getElementById('reservaciones-cancel-form').requestSubmit()");await settled(a,'confirmed');
  let proof=await counts(a,f.cancelValid.id);assert.equal(proof.audit,1);assert.equal(proof.commands,1);assert.equal(proof.upstreamWrites,1);assert.equal(proof.auditRows[0].id_usuario,await e(a,'App.auth.obtenerUsuario().id_usuario'));
  assert.match(proof.auditRows[0].descripcion,/Motivo obligatorio original/);assert.equal((await read(a,f.cancelValid.id)).estado,'Cancelada');
  const duplicate=await replay(a);assert.equal(duplicate.status,200);assert.equal(duplicate.replayed,'true');proof=await counts(a,f.cancelValid.id);assert.equal(proof.audit,1);assert.equal(proof.commands,1);
  await screenshot(a,'cancelacion-confirmada');pass('Cancelación original: motivo obligatorio, confirmación cancelable, doble gesto bloqueado, responsable y recibo; misma clave conserva una cancelación y bitácora');

  await open(a,f.cancelConcurrent,'cancel');await open(b,f.cancelConcurrent,'cancel');await reason(a,'Cancelación simultánea A');await reason(b,'Cancelación simultánea B');
  await Promise.all([cancel(a),cancel(b)]);await wait(a,`['confirmed','conflict'].includes(${model}.state) && document.getElementById('command-state')`);await wait(b,`['confirmed','conflict'].includes(${model}.state) && document.getElementById('command-state')`);
  const winner=await e(a,model+'.state')==='confirmed'?a:b,loser=winner===a?b:a;await settled(loser,'conflict');assert.equal(await e(loser,model+'.error.status'),412);proof=await counts(winner,f.cancelConcurrent.id);assert.equal(proof.audit,1);assert.equal(proof.commands,1);
  assert.match(await e(loser,"document.getElementById('reservaciones-cancel-motivo').value"),/Cancelación simultánea/);await screenshot(loser,'cancelacion-conflicto-412');
  pass('Dos administradores cancelan simultáneamente: un efecto, una bitácora y rechazo durable 412 con motivo conservado');

  await open(b,f.cancelStale,'cancel');await reason(b,'Mi motivo conservado');assert.equal(await editOther(a,f.cancelStale.id,{habitacion:'Modificada por otro'}),'confirmado');
  let before=await state();await cancel(b);await settled(b,'conflict');assert.equal(await state(),before);assert.equal(await e(b,model+'.error.status'),412);
  const photos=await e(b,'photos'),oldKey=await key(b);await e(b,"window.acceptConfirmation=false;document.querySelector('[data-decision=review]').click()");await wait(b,"!document.querySelector('[data-decision=review]').disabled");assert.equal(await e(b,'photos'),photos);assert.equal(await key(b),oldKey);
  await e(b,"window.acceptConfirmation=true;document.querySelector('[data-decision=review]').click()");await wait(b,model+".state==='ready' && !document.getElementById('reservaciones-cancel-submit').disabled");assert.equal(await e(b,"document.getElementById('reservaciones-cancel-motivo').value"),'Mi motivo conservado');
  await editOther(a,f.cancelValid.id,{observaciones:'Contexto posterior autorizado'});before=await state();await cancel(b);await settled(b,'conflict');assert.equal(await e(b,model+'.error.kind'),'context');assert.equal(await state(),before);
  pass('Cancelación obsoleta y contexto 409 conservan motivo y comparador; renovar exige decisión confirmada, sin precondiciones anticipadas ni cambios parciales');

  for(const action of ['cancel','transport']){
    const item=action==='cancel'?f.cancelLost:f.transportLost;
    await open(a,item,action);if(action==='cancel')await reason(a,'Respuesta perdida al cancelar');
    const original=await e(a,model+'.original');await ipc('armed',{type:'arm',mode:'truncate'});
    if(action==='cancel')await cancel(a);else await choose(a,item.transports[0]);await settled(a,'uncertain');const lostKey=await key(a);
    proof=await counts(a,item.id);assert.equal(proof.commands,1);assert.equal(proof.audit,1);assert.equal(proof.upstreamWrites,1);
    await recover(a,'confirmed');assert.equal(await key(a),lostKey);assert.deepEqual(await e(a,model+'.original'),original);proof=await counts(a,item.id);assert.equal(proof.upstreamWrites,1);assert.equal(proof.audit,1);
    await screenshot(a,action+'-recuperado');pass(action+': respuesta truncada después de COMMIT conserva sobre/foto y recupera por GET sin otro envío, comando o bitácora');
  }

  for(const action of ['cancel','transport']){
    const win=await makeWindow(input.credentials.correo),item=action==='cancel'?f.cancelUnknown:f.transportUnknown;
    await open(win,item,action);if(action==='cancel')await reason(win,'Resultado desconocido conservado');await ipc('armed',{type:'arm',mode:'before-write'});
    if(action==='cancel')await cancel(win);else await choose(win,item.transports[0]);await settled(win,'uncertain');const unknownKey=await key(win),issued=await e(win,'writesIssued');
    await recover(win,'uncertain');assert.equal(await e(win,model+'.recoveryError.kind'),'unknown');
    if(action==='cancel')await cancel(win);else await e(win,"document.querySelector('[data-assign-reserva]').dispatchEvent(new Event('click'))");
    await wait(win,"!document.querySelector('[data-command-action=recover]').disabled");assert.equal(await key(win),unknownKey);assert.equal(await e(win,'writesIssued'),issued);
    proof=await counts(win,item.id);assert.equal(proof.commands,0);assert.equal(proof.audit,0);assert.equal(proof.upstreamWrites,0);pass(action+': desconocido no concluyente bloquea otro guardado y conserva clave sin reenvío');
  }

  await open(a,f.assignValid,'transport');await e(a,"document.querySelector('[data-assign-reserva]').click()");assert.match(await e(a,"document.getElementById('reservaciones-form-message').textContent"),/destino/);assert.equal(await e(a,model+'.command'),null);
  await choose(a,f.assignValid.transports[0]);await settled(a,'confirmed');assert.equal((await read(a,f.assignValid.id)).id_transporte_operacion,f.assignValid.transports[0]);proof=await counts(a,f.assignValid.id);assert.equal(proof.audit,1);assert.equal(proof.transportPax,2);assert.equal(proof.commands,1);
  assert.equal((await replay(a)).replayed,'true');proof=await counts(a,f.assignValid.id);assert.equal(proof.audit,1);assert.equal(proof.commands,1);await screenshot(a,'transporte-asignado');
  pass('Selector original: destino obligatorio, asignación válida y repetición idempotente; PAX=2 incluye un niño sin duplicarlo');

  await open(a,f.moveValid,'transport');await choose(a,f.moveValid.transports[1]);await settled(a,'confirmed');assert.equal((await read(a,f.moveValid.id)).id_transporte_operacion,f.moveValid.transports[1]);
  await open(a,f.moveValid,'transport');await choose(a,null,true);await settled(a,'confirmed');assert.equal((await read(a,f.moveValid.id)).id_transporte_operacion,null);
  pass('Controles originales Mover y Quitar asignación conservados; cada intención usa revisión vigente y confirmación propia');

  await open(a,f.assignConcurrent,'transport');await open(b,f.assignConcurrent,'transport');await Promise.all([choose(a,f.assignConcurrent.transports[0]),choose(b,f.assignConcurrent.transports[1])]);
  await wait(a,`['confirmed','conflict'].includes(${model}.state)`);await wait(b,`['confirmed','conflict'].includes(${model}.state)`);
  const transportWinner=await e(a,model+'.state')==='confirmed'?a:b,transportLoser=transportWinner===a?b:a;await settled(transportLoser,'conflict');assert.equal(await e(transportLoser,model+'.error.status'),412);proof=await counts(transportWinner,f.assignConcurrent.id);assert.equal(proof.audit,1);
  assert.notEqual(await e(transportLoser,"document.querySelector('[data-reserva-select]').value"),'');await screenshot(transportLoser,'transporte-conflicto-412');
  pass('Dos administradores asignan transportes simultáneamente: una asignación y bitácora; 412 conserva destino propuesto');

  for(const [name,action]of [['cancelMinimum','cancel'],['capacity','transport'],['groupMaximum','transport'],['originMinimum','transport'],['destinationMinimum','transport']]){
    const item=f[name];await open(a,item,action);if(action==='cancel')await reason(a,'Validar mínimo existente');before=await state();
    if(action==='cancel')await cancel(a);else await choose(a,name==='originMinimum'?item.transports[1]:item.transports[0]);await settled(a,'rejected');assert.equal(await e(a,model+'.error.status'),400);const after=await state();assert.equal(after,before);proof=await counts(a,item.id);assert.equal(proof.audit,0);assert.equal(proof.commands,1);
    process.send({type:'action-proof',proof:{name,kind:'rejected-without-partial-changes',before,after,key:await key(a),status:400}});
  }
  pass('Rechazos durables sin cambios parciales: capacidad real, máximo operativo 12, mínimo del origen/destino y mínimo al cancelar; bitácora sin entradas');

  await open(b,f.capacity,'transport');await editOther(a,f.moveValid.id,{observaciones:'Contexto transporte cambiado'});before=await state();await choose(b,f.capacity.transports[1]);await settled(b,'conflict');assert.equal(await e(b,model+'.error.kind'),'context');assert.equal(await state(),before);
  pass('Transporte con contexto 409 conserva selección y no produce modificación parcial');
  const transportPhotos=await e(b,'photos'),priorKey=await key(b);
  await e(b,"window.acceptConfirmation=false;document.querySelector('[data-decision=review]').click()");await wait(b,"!document.querySelector('[data-decision=review]').disabled");assert.equal(await e(b,'photos'),transportPhotos);assert.equal(await key(b),priorKey);
  await e(b,"window.acceptConfirmation=true;document.querySelector('[data-decision=review]').click()");await wait(b,model+".state==='ready' && !document.querySelector('[data-assign-reserva]').disabled");
  assert.equal(await e(b,"document.querySelector('[data-reserva-select]').value"),String(f.capacity.transports[1]));await choose(b,f.capacity.transports[1]);await settled(b,'confirmed');assert.notEqual(await key(b),priorKey);
  pass('Revisión explícita de transporte renueva foto y destinos, conserva selección y exige confirmar otra intención con clave nueva');

  await open(a,f.tourMaximum,'transport');await choose(a,f.tourMaximum.transports[0]);await settled(a,'confirmed');
  await open(a,{id:f.tourMaximum.peer},'transport');await choose(a,f.tourMaximum.transports[1]);await settled(a,'confirmed');
  assert.equal((await counts(a,f.tourMaximum.peer)).transportPax,12);
  await open(a,{id:f.tourMaximum.extra},'transport');before=await state();await choose(a,f.tourMaximum.transports[1]);await settled(a,'rejected');assert.equal(await state(),before);assert.equal((await counts(a,f.tourMaximum.extra)).audit,0);
  pass('Dos grupos alcanzan 12+12=24 PAX; el pasajero adicional se rechaza sin modificar datos o bitácora');

  await open(a,f.incompatible,'transport');const options=await e(a,"[...document.querySelector('[data-reserva-select]').options].map(o=>Number(o.value))");for(const id of f.incompatible.mismatch)assert(!options.includes(id));
  // Sondas de cliente manipulado: mismo CommandSession protegido; el servidor debe rechazar aunque se omita el selector.
  for(const destination of f.incompatible.mismatch){before=await state();const result=await e(a,`(async()=>{const s=await new App.commandLab.CommandSession('PATCH','/api/reservaciones/${f.incompatible.id}/transporte').open();s.setProposal({id_transporte_operacion:${destination}});try{await s.submit(()=>window.confirm('Sonda sintética de destino incompatible'));}catch{}return {status:s.error?.status,code:s.receipt?.resultado.codigo};})()`);assert.equal(result.status,400);assert.equal(result.code,'NEGOCIO_RECHAZADO');assert.equal(await state(),before);}
  await open(a,f.cancelled,'transport');await choose(a,f.cancelled.transports[0]);await settled(a,'confirmed');proof=await counts(a,f.cancelled.id);assert.equal(proof.transportPax,0);assert.equal((await read(a,f.cancelled.id)).estado,'Cancelada');
  pass('Fecha/tour/turno filtran destinos y backend rechaza tres sondas incompatibles sin cambios; canceladas conservan estado y PAX operativo cero');

  const consulta=await makeWindow('consulta@standalone.example.test');assert.equal(await e(consulta,"document.querySelector('[data-reservacion-action=cancel], [data-reservacion-action=transport]')"),null);
  for(const suffix of ['cancelar','transporte'])assert.equal(await e(consulta,`App.api.apiFetch('/api/precondiciones',{method:'POST',headers:{'X-CTSK-Protocol':'ctsk-command-api-v1'},body:{metodo:'PATCH',ruta:'/api/reservaciones/${input.fixtures.reservations[8]}/${suffix}',datos:{}}}).then(()=>200,x=>x.status)`),403);
  await open(b,f.permissions,'transport');await ipc('fixture-changed',{type:'fixture-change',url:'/api/usuarios/'+f.user,body:{id_rol:input.extraIds.consultaRole,alcance_plataformas:'selected',platform_ids:[input.fixtures.platform]}});
  await e(b,'App.auth.refrescarSesion()');await wait(b,`!${model}`);assert.equal(await e(b,"document.getElementById('reservaciones-form')"),null);assert.equal(await e(b,"document.querySelector('[data-reservacion-action=transport]')"),null);
  pass('Consulta y plataforma oculta impiden cancelar/asignar; cambio de permisos elimina la selección y bloquea acciones protegidas');
}
module.exports={run};
