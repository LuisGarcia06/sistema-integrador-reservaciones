(function(){
 'use strict';if(document.documentElement.dataset.sync024!=='synthetic')return;
 window.addEventListener('DOMContentLoaded',async function(){
  const App=window.App;await App.unified.ready;let pending=null,busy=false,message='';
  const page=App.pages.configuracion,render=page.render,after=page.afterRender,reset=page.resetSession;
  const permits=new WeakMap(),originalGuard=App.revisionLab.guard;
  App.revisionLab.guard=function(url,options){
   const permit=permits.get(options);permits.delete(options);
   if(!permit)return originalGuard(url,options);
   const headers=new Headers(options.headers);
   if(options.method!=='POST'||url!==permit.url||!/^\/api\/sincronizacion\/(fareharbor|getyourguide)\/(activar|estado)$/.test(url)
    ||permit.actor!==App.auth.obtenerUsuario()?.id_usuario||permit.version!==App.auth.obtenerVersionSesion()
    ||JSON.stringify(options.body)!==permit.body||headers.get('X-CTSK-Sync')!=='synthetic-sync024-v1'
    ||headers.get('X-CTSK-Data-Generation')!==permit.generation)throw Error('Control sin intención confirmada.');
  };
  const api=(path,options)=>{const url='/api/sincronizacion'+path;if(options?.method==='POST')permits.set(options,{url,actor:App.auth.obtenerUsuario()?.id_usuario,version:App.auth.obtenerVersionSesion(),body:JSON.stringify(options.body),generation:App.adminUi.generation});return App.api.apiFetch(url,options);};
  const host=()=>document.getElementById('sync024-host');
  const current=()=>App.auth.obtenerUsuario();
  const text=(tag,value,parent)=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;};
  function same(user,version,root){return current()?.id_usuario===user&&App.auth.obtenerVersionSesion()===version&&root?.isConnected;}
  async function refresh(){
   const root=host(),user=current()?.id_usuario,version=App.auth.obtenerVersionSesion();if(!root||!user)return;
   if(pending&&pending.actor!==user)pending=null;
   try{const reply=await api('/estado');if(!same(user,version,root))return;root.replaceChildren();
    text('h2','Automatización de reservas externas',root);text('p','Ensayo local. Las conexiones reales siguen bloqueadas. GetYourGuide requiere recepción continua y recuperación autorizada.',root);
    if(message)text('p',message,root).setAttribute('role','status');
    for(const state of reply.datos){const section=document.createElement('section');root.append(section);section.dataset.provider=state.provider;
     text('h3',state.provider==='fareharbor'?'FareHarbor':'GetYourGuide',section);
     text('p','Corte inicial UTC: '+(state.first_activation_at||'Sin establecer')+' · Avance confirmado UTC: '+(state.confirmed_through||'Sin avance')+' · '+(state.automation_enabled?'Habilitada en laboratorio':'Manual / pausada'),section);
     if(state.pending_error)text('p','Revisión pendiente: '+state.pending_error,section);
     if(!App.auth.esAdministrador()){text('p','Sólo el Administrador puede confirmar controles.',section);continue;}
     if(pending){text('p','Hay una intención sin resultado confirmado. Consúltala antes de realizar otro cambio.',section);continue;}
     if(state.provider==='getyourguide'){text('p','Activación bloqueada: mecanismo de recuperación no verificado.',section);continue;}
     const form=document.createElement('form');form.id='sync024-'+state.provider+'-form';section.append(form);
     if(!state.first_activation_at){const label=text('label','Primera activación · hora America/Cancun',form),input=document.createElement('input');input.type='datetime-local';input.name='corte_local';input.required=true;input.id='sync024-cutoff';label.append(input);}
     const label=text('label','Motivo',form),reason=document.createElement('input');reason.name='motivo';reason.maxLength=500;reason.required=true;reason.id='sync024-reason';label.append(reason);
     const confirmation=text('label','Confirmo el corte inicial o el cambio de estado indicado.',form),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.required=true;checkbox.name='confirmacion';checkbox.id='sync024-confirm';confirmation.prepend(checkbox);
     const submit=text('button',state.first_activation_at?(state.reauthorization_required?'Reautorizar después de restaurar':state.automation_enabled?'Pausar':'Reanudar'):'Confirmar primera activación',form);submit.type='submit';submit.id='sync024-submit';submit.className='btn btn-primary';submit.disabled=busy;
     form.addEventListener('submit',async function(e){e.preventDefault();if(busy||pending)return;busy=true;const action=state.first_activation_at?'estado':'activar',key=crypto.randomUUID(),generation=App.adminUi.generation;
      let body={motivo:reason.value,confirmacion:checkbox.checked};if(action==='activar')body={...body,corte_local:form.elements.corte_local.value,zona:'America/Cancun'};else body.habilitada=state.reauthorization_required||!state.automation_enabled;
      pending={key,actor:user,generation,provider:state.provider};submit.disabled=true;reason.value='';if(form.elements.corte_local)form.elements.corte_local.value='';checkbox.checked=false;
      try{await api('/'+state.provider+'/'+action,{method:'POST',headers:{'X-CTSK-Sync':'synthetic-sync024-v1','X-CTSK-Data-Generation':generation,'Idempotency-Key':key},body});pending=null;message='Control confirmado. El corte original se conserva.';}
      catch(error){if(error.status>=400&&error.status<500&&error.status!==401&&error.status!==403)pending=null;message=pending?'Resultado sin confirmar. Consulta la intención; no vuelvas a enviarla.':error.message;}
      finally{body=null;busy=false;if(same(user,version,root))void refresh();}
     });
    }
    if(pending){const button=text('button','Consultar resultado pendiente',root);button.id='sync024-recover';button.className='btn';button.addEventListener('click',async()=>{try{await api('/comandos/'+pending.key);pending=null;message='Resultado recuperado sin repetir el envío.';}catch(error){if(error.status>=400&&error.status<500&&error.data?.replayed===true){pending=null;message='Rechazo confirmado y recuperado. Revisa el estado antes de otra intención.';}else message='Resultado aún desconocido. La intención permanece bloqueada.';}if(same(user,version,root))void refresh();});}
   }catch{if(same(user,version,root))root.textContent='No fue posible consultar la sincronización. Conserva la captura manual.';}
  }
  page.render=function(){return render.apply(this,arguments)+'<section id="sync024-host" class="card" aria-label="Automatización de reservas externas"></section>';};
  page.afterRender=function(){after.apply(this,arguments);void refresh();};
  page.resetSession=function(){reset?.apply(this,arguments);message='';busy=false;};
  const notices=App.pages.dashboard,noticesRender=notices.render,noticesAfter=notices.afterRender;
  notices.render=function(){return noticesRender.apply(this,arguments)+'<section id="sync024-notices" class="card" aria-live="polite"></section>';};
  notices.afterRender=function(){noticesAfter?.apply(this,arguments);const root=document.getElementById('sync024-notices'),user=current()?.id_usuario,version=App.auth.obtenerVersionSesion();
   api('/estado').then(reply=>{if(!same(user,version,root))return;text('h2','Reconciliación de plataformas',root);
    for(const state of reply.datos){if(state.provider==='getyourguide')text('p','GetYourGuide: reconciliación manual requerida. La recuperación de reservas durante una desconexión no está verificada.',root);
     else if(state.pending_error)text('p','FareHarbor: hay una consulta o una reserva pendiente de revisión. El avance se conserva; revisa los avisos y los datos antes de reanudar.',root);
     if(state.reauthorization_required)text('p','La copia restaurada necesita autorización del Administrador para reanudar, conservando su corte original.',root);
    }
   }).catch(()=>{if(same(user,version,root))root.textContent='No se pudo consultar el estado de reconciliación. Mantén la captura manual.';});
  };
  App.sync024={ready:true,get pending(){return pending&&{...pending};},refresh};
 });
})();
