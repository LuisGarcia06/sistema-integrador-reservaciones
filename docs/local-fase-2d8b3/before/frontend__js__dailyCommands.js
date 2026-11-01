// Control nuevo y optativo de laboratorio sobre la página Daily original.
(function () {
  'use strict';
  const App=window.App;
  let model=null,date='',epoch=0,busy=false,refresh=null;const outputs=new Set();
  const el=id=>document.getElementById(id);
  function message(text){if(el('daily-observations-message'))el('daily-observations-message').textContent=text;}
  function reset(){epoch++;model?.dispose();model=null;date='';busy=false;outputs.clear();}
  function canLeave(){if(busy||model?.hasUnresolved()){message('Consulta el comando original. Un resultado desconocido no permite otro guardado ni abandonar la intención.');return false;}return !model||model.state==='confirmed'||window.confirm('¿Descartar esta propuesta de observaciones?');}
  function canRead(next){if(outputs.size){message('Espera a que termine la preparación del PDF para cambiar la consulta.');return false;}if(busy||model?.hasUnresolved())return canLeave();if(date&&date!==next){if(!canLeave())return false;reset();sync();}return true;}
  function mount(callback){refresh=callback;const host=el('daily-observations-host');if(!host)return;
    host.innerHTML='<section class="card daily-notes-lab"><h2>Observaciones generales por fecha · Control nuevo de laboratorio</h2><p>Estas observaciones son independientes de las notas de pasajeros y operadores. El formato de impresión original conserva sus observaciones actuales.</p><p id="daily-observations-value"></p><button class="btn" type="button" id="daily-observations-edit">Editar observaciones</button><form id="daily-observations-form" hidden><label class="field">Observaciones<textarea class="input" id="daily-observations-text"></textarea></label><button class="btn btn-primary" type="submit" id="daily-observations-save">Confirmar y guardar</button><button class="btn" type="button" id="daily-observations-close">Cerrar edición</button></form><p id="daily-observations-message" role="status"></p><button class="btn" type="button" id="daily-observations-refresh">Consultar Daily actual</button><div id="daily-command-panel"></div><div id="daily-conflict-panel"></div></section>';
    el('daily-observations-edit').addEventListener('click',open);el('daily-observations-close').addEventListener('click',()=>{if(!canLeave())return;model?.dispose();model=null;el('daily-observations-form').hidden=true;paint();});
    el('daily-observations-form').addEventListener('submit',event=>{event.preventDefault();perform(async current=>{current.setProposal({observaciones:el('daily-observations-text').value.trim()});await current.submit(()=>window.confirm('¿Guardar las observaciones generales del '+date+'?'));});});
    el('daily-observations-refresh').addEventListener('click',()=>{if(!model||model.state==='confirmed')refresh();else message('Resuelve o cierra la edición antes de consultar de nuevo el Daily.');});sync();
  }
  async function loaded(next){date=next;const ticket=++epoch,version=App.auth.obtenerVersionSesion();const response=await App.api.apiFetch('/api/daily/observaciones?fecha='+next,{responseMetadata:true});if(ticket!==epoch||version!==App.auth.obtenerVersionSesion())return;
    if(response.headers?.protocol!==App.commandLab.PROTOCOL||!App.revisionLab||response.data.fecha!==next)throw Error('Observaciones de fecha o protocolo incompatibles');
    el('daily-observations-value').textContent=response.data.observaciones||'Sin observaciones generales';sync();
  }
  async function open(){if(outputs.size||!App.auth.esAdministrador()||!canLeave())return;model?.dispose();const current=new App.commandLab.CommandSession('PUT','/api/daily/observaciones?fecha='+date,{comparisonRead:true});model=current;busy=true;sync();
    try{await current.open();if(model!==current)return;el('daily-observations-text').value=App.revisionConflict.view(current.original).observaciones||'';el('daily-observations-form').hidden=false;message('Foto autorizada de '+date+'. Revisa y confirma antes de guardar.');}
    catch(error){if(model===current){current.dispose();model=null;message(App.commandLab.message(error));}}finally{if(model===current||!model){busy=false;paint();}}
  }
  function sync(){const locked=busy||outputs.size>0||!date;for(const id of ['daily-observations-edit','daily-observations-refresh'])if(el(id))el(id).disabled=locked||Boolean(model?.hasUnresolved());if(el('daily-observations-edit'))el('daily-observations-edit').hidden=!App.auth.esAdministrador();
    for(const id of ['daily-observations-text','daily-observations-save'])if(el(id))el(id).disabled=locked||model?.state!=='ready'||Boolean(model?.command);
    if(el('daily-observations-close'))el('daily-observations-close').disabled=locked||Boolean(model?.hasUnresolved());
    document.querySelectorAll('#daily-command-panel button,#daily-conflict-panel button').forEach(button=>button.disabled=locked);
  }
  function paint(){if(!el('daily-command-panel'))return;el('daily-command-panel').replaceChildren();el('daily-conflict-panel').replaceChildren();if(model){App.commandPanel.render(el('daily-command-panel'),model,action);if(['conflict','rejected'].includes(model.state)&&model.receipt?.comando.estado==='rechazado')App.revisionConflict.render(el('daily-conflict-panel'),model,decide);if(model.error)message(App.commandLab.message(model.error));else if(model.state==='confirmed')message('Recibo confirmado. Consulta el Daily actual por separado para actualizar su información.');}sync();}
  async function perform(work){if(!model||busy||outputs.size)return;const current=model;busy=true;sync();try{await work(current);}catch(error){if(model===current)message(App.commandLab.message(error));}finally{if(model===current){busy=false;paint();}}}
  async function action(name){const owner=model;let value;await perform(async current=>{if(name==='recover')await current.recover();if(name==='current')value=await current.inspectCurrent();});if(value&&model===owner)App.commandPanel.showCurrent(el('current-command-data'),value);}
  async function decide(choice){if(choice==='discard'){el('daily-observations-close').click();return;}await perform(async current=>{if(choice==='review'&&!window.confirm('¿Revisar la propuesta y preparar otra intención?'))return;const prepared=await current.prepare(choice,()=>window.confirm('¿Descartar tu propuesta y usar las observaciones actuales?'));if(prepared)el('daily-observations-text').value=choice==='current'?App.revisionConflict.view(current.original).observaciones||'':current.proposal.observaciones||'';});}
  function beginOutput(owner){if(busy||model?.hasUnresolved()||!App.auth.puedeAccederPagina('daily'))return false;outputs.add(owner);sync();return true;}
  function endOutput(owner){outputs.delete(owner);sync();}
  window.addEventListener('beforeunload',event=>{if(busy||model?.hasUnresolved()||outputs.size){event.preventDefault();event.returnValue='';}});
  App.dailyCommands={reset,mount,loaded,canRead,beginOutput,endOutput,getSession:()=>model};
})();
