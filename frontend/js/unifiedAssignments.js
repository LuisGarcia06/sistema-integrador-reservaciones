(function(){
 'use strict';const App=window.App;let model=null,options=null,busy=false;
 function host(){const parent=document.getElementById('reservas-organizacion-host');if(!parent)return null;let h=document.getElementById('unified-assignment-host');if(!h){h=document.createElement('div');h.id='unified-assignment-host';parent.append(h);}return h;}
 function canLeave(){if(busy||model?.hasUnresolved()){options?.message('Consulta el comando original antes de cambiar la asignación.','error');return false;}return true;}
 function reset(){model?.dispose();model=null;options=null;busy=false;document.getElementById('unified-assignment-host')?.remove();}
 async function confirmed(){if(model?.state==='confirmed')await options?.onConfirmed();}
 function paint(){const h=host();if(!h||!model)return;h.replaceChildren();const conflict=document.createElement('div'),receipt=document.createElement('div');h.append(conflict,receipt);
  if(['conflict','rejected'].includes(model.state))App.revisionConflict.render(conflict,model,async choice=>{if(choice==='discard'){if(canLeave())reset();return;}const prepared=await model.prepare(choice,()=>window.confirm('¿Utilizar la asignación actual?'));if(prepared&&choice==='current')model.setProposal({id_transporte_operacion:App.revisionConflict.view(model.original).id_transporte_operacion??null});paint();});
  if(model.state==='ready'){const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent='Confirmar asignación revisada';button.addEventListener('click',send);h.append(button);}
  App.commandPanel.render(receipt,model,async action=>{try{if(action==='recover'){await model.recover();await confirmed();}else App.commandPanel.showCurrent(document.getElementById('current-command-data'),await model.inspectCurrent());}catch(e){options?.message(App.commandLab.message(e),'error');}finally{paint();}});
 }
 async function send(){if(!model||busy||model.state!=='ready')return;const current=model;busy=true;try{await current.submit(()=>window.confirm('¿Confirmar el transporte seleccionado para esta reservación?'));if(model===current)await confirmed();}catch(e){if(model===current)options?.message(App.commandLab.message(e),'error');}finally{if(model===current){busy=false;paint();}}}
 async function assign(id,destination,callbacks){if(!canLeave())return;reset();options=callbacks;model=new App.commandLab.CommandSession('PATCH','/api/reservaciones/'+id+'/transporte',{comparisonRead:true});const current=model;busy=true;try{await current.open();if(model!==current)return;current.setProposal({id_transporte_operacion:destination});}catch(e){callbacks.message(App.commandLab.message(e),'error');reset();return;}finally{busy=false;}await send();}
 App.unifiedAssignments={assign,canLeave,reset,getSession:()=>model};
})();
