(function(){
  'use strict';const App=window.App,refs=new Map(),unresolved=new Set();let session=null,review=null;
  const panel=()=>document.getElementById('admin-form-panels')||document.getElementById('admin-command-host');
  function clearPasswords(){document.querySelectorAll('#usuarios-form input[type=password]').forEach(input=>input.value='');}
  function canOpen(){return !session?.hasUnresolved()&&!unresolved.size;}
  function assertOpen(){if(!canOpen())throw Error('Consulta el resultado original antes de crear otra intención.');}
  function resetSession(){session?.dispose();session=null;review=null;clearPasswords();panel()?.replaceChildren();document.getElementById('admin-recovery-host')?.replaceChildren();}
  async function open(method,url,{creation=false,credential=false,onReview}={}){
    assertOpen();session?.dispose();document.getElementById('admin-command-host')?.replaceChildren();session=creation?new App.commandLab.CreateResourceSession(url.slice(5)):new App.commandLab.CommandSession(method,url,{comparisonRead:true,credential});review=onReview;session.onSecretDispatched=clearPasswords;await session.open();draw();return session;
  }
  function retain(ref){refs.set(ref.key,Object.freeze({...ref}));unresolved.add(ref.key);}
  function resolved(key){unresolved.delete(key);if(refs.get(key)?.kind!=='self-password')refs.delete(key);}
  function clearReferences(){refs.clear();unresolved.clear();}
  function onSession(user){for(const [key,ref]of refs)if(ref.actorId!==user.id_usuario||ref.generation!==App.adminUi.generation){refs.delete(key);unresolved.delete(key);}renderRecovery();}
  async function reconcile(key){const ref=refs.get(key),user=App.auth.obtenerUsuario();if(!ref||ref.actorId!==user?.id_usuario||ref.generation!==App.adminUi.generation)throw Error('Referencia no disponible para esta identidad.');const r=await App.api.apiFetch('/api/comandos/'+key,{headers:{'X-CTSK-Protocol':App.adminUi.protocol,'X-CTSK-Data-Generation':ref.generation}});if(r.comando?.clave!==key||r.comando.generacion!==ref.generation||!['confirmado','rechazado'].includes(r.comando.estado))throw Error('Recibo incompatible.');resolved(key);return r;}
  function renderRecovery(){const host=document.getElementById('admin-recovery-host');if(!host)return;host.replaceChildren();if(!App.auth.esAdministrador())return;for(const ref of refs.values()){if(ref.actorId!==App.auth.obtenerUsuario()?.id_usuario||ref.generation!==App.adminUi.generation)continue;const section=document.createElement('section'),text=document.createElement('p'),b=document.createElement('button');text.textContent='Resultado de credenciales: '+ref.key;b.textContent='Consultar resultado tras nuevo login';b.dataset.credentialRecovery=ref.key;b.addEventListener('click',async()=>{b.disabled=true;try{const r=await reconcile(ref.key),pre=document.createElement('pre');pre.textContent=JSON.stringify(r,null,2);section.append(pre);}catch(e){text.textContent=e.status===404?'Resultado desconocido: no reenviar la contraseña ni crear otra intención.':App.commandLab.message(e);}finally{b.disabled=false;}});section.append(text,b);host.append(section);}}
  function draw(){const host=panel();if(!host||!session)return;host.replaceChildren();const conflict=document.createElement('div'),receipt=document.createElement('div');host.append(conflict,receipt);
    if(['conflict','rejected'].includes(session.state)&&session.receipt?.comando.estado==='rechazado')App.revisionConflict.render(conflict,session,async choice=>{if(choice==='discard'){session.dispose();session=null;review?.(null,null);host.replaceChildren();return;}const kept={...session.proposal};await session.prepare(choice,async()=>window.confirm('¿Descartar tu propuesta y usar los valores actuales?'));if(session.state==='ready'){const current=App.revisionConflict.view(session.original);review?.(current,choice==='review'?kept:{});}draw();});
    App.commandPanel.render(receipt,session,async action=>{try{if(action==='recover'){await session.recover();draw();}else{const value=await session.inspectCurrent();App.commandPanel.showCurrent(document.getElementById('current-command-data'),value);}}catch(e){const p=document.createElement('p');p.textContent=App.commandLab.message(e);receipt.append(p);draw();}});
    conflict.querySelector('h2')?.focus();
  }
  async function submit(payload,{clearSecrets=()=>{}}={}){
    if(!session||session.state!=='ready')throw Error('La intención requiere revisión o conciliación.');const current=session,own=current.credential&&!current.creation&&Number(current.url.split('/')[3])===App.auth.obtenerUsuario()?.id_usuario;
    current.onSecretDispatched=()=>{delete payload.password;clearSecrets();clearPasswords();};
    try{current.setProposal(payload);const result=await current.submit(async()=>window.confirm(current.credential?'¿Confirmar esta operación de credenciales? La contraseña no se mostrará en el recibo.':'¿Confirmar los cambios revisados?'));if(result&&current.credential)unresolved.delete(current.command.key);draw();return Boolean(result&&current.state==='confirmed');}
    finally{if(current.receipt&&['confirmado','rechazado'].includes(current.receipt.comando.estado))unresolved.delete(current.command.key);if(current.credential){current.releaseSecret();delete payload.password;clearSecrets();clearPasswords();}if(own&&current.command){App.auth.limpiarSesion();App.auth.establecerMensajeSesion('Inicia sesión de nuevo y consulta el resultado original. No reenvíes la contraseña.');App.router.navigate('login');}else draw();}
  }
  function close(){if(session?.hasUnresolved())return false;if(session?.command)return true;session?.dispose();session=null;review=null;return true;}
  App.adminCommands={open,submit,close,canOpen,canLeave:canOpen,getSession:()=>session,resetSession,retain,resolved,onSession,reconcile,renderRecovery,clearReferences,redraw:draw,references:()=>[...refs.values()].map(r=>({...r}))};
})();
