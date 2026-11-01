// Adaptador optativo del formulario original; solo lo carga la entrada integrada de Operaciones.
(function () {
  'use strict';
  const App = window.App;
  let model = null, hooks = null, controls = [], busy = false;
  function reset() { model?.dispose(); model = hooks = null; controls = []; busy = false; }
  function canLeave() {
    if (!model) return true;
    if (busy || model.hasUnresolved()) { hooks?.message('Consulta el resultado original antes de cerrar o sustituir esta operación. Un desconocido no demuestra rollback.', 'error'); return false; }
    return model.state === 'confirmed' || window.confirm('¿Cerrar y descartar este borrador local de operación?');
  }
  function limitPage() {
    document.querySelectorAll('[data-manage-transportes], #transporte-new, [data-edit-transporte], [data-assign-reserva], [data-move-reserva], [data-unassign-reserva]').forEach(button => {
      button.disabled = true; button.title = 'Gestión de transporte fuera del alcance de este perfil';
    });
  }
  async function open(id) {
    reset(); busy = true;
    const current = id == null ? new App.commandLab.CreateOperationSession() : new App.commandLab.CommandSession('PATCH', '/api/operaciones/' + encodeURIComponent(id), {comparisonRead:true}); model = current;
    try { await current.open(); if (model !== current) return null; busy = false; return current.creation ? {} : App.revisionConflict.view(current.original); }
    catch (error) { if (model === current) reset(); throw error; }
  }
  function sync() {
    if (!model || !hooks) return;
    const locked = busy || model.state !== 'ready' || Boolean(model.command);
    controls.forEach(([control, disabled]) => control.disabled = disabled || locked);
    for (const id of ['operacion-close','operacion-cancel']) { const button = document.getElementById(id); if (button) button.disabled = busy || model.hasUnresolved(); }
    document.querySelectorAll('#operation-command-panel button, #operation-conflict-panel button').forEach(button => button.disabled = busy);
    limitPage();
  }
  function attach(callbacks) {
    hooks = callbacks;
    const form = document.getElementById('operacion-form');
    controls = [...form.querySelectorAll('input, select, button')].map(control => [control, control.disabled]);
    for (const id of ['operation-command-panel','operation-conflict-panel']) { const host = document.createElement('div'); host.id = id; form.append(host); }
    paint();
  }
  function paint() {
    if (!model || !hooks) return;
    App.commandPanel.render(document.getElementById('operation-command-panel'), model, action);
    const host = document.getElementById('operation-conflict-panel'); host.replaceChildren();
    if (['conflict','rejected'].includes(model.state) && model.receipt?.comando.estado === 'rechazado') {
      if (!model.creation) App.revisionConflict.render(host, model, decide);
      else {
        const note = document.createElement('p'); note.textContent = 'Alta rechazada. Revisa los datos y confirma otra intención antes de obtener precondiciones nuevas.'; host.append(note);
        const review = document.createElement('button'); review.type = 'button'; review.dataset.decision = 'review'; review.textContent = 'Revisar esta operación'; review.addEventListener('click', () => decide('review')); host.append(review);
      }
    }
    if (model.error && model.creation && !model.command) hooks.message('No se envió el alta: falló la consulta o validación de precondiciones. Revisa y vuelve a confirmar.', 'error');
    else if (model.error) hooks.message(App.commandLab.message(model.error), 'error');
    else if (model.state === 'confirmed') hooks.message('Operación ' + (model.creation ? '#' + model.createdId() + ' creada' : 'actualizada') + ' con recibo confirmado.', 'info');
    sync();
  }
  async function perform(work) {
    if (!model || !hooks || busy) return;
    const current = model, callbacks = hooks; busy = true; callbacks.loading(true); sync();
    try { await work(current, callbacks); }
    catch (error) { if (model === current) callbacks.message(App.commandLab.message(error), 'error'); }
    finally { if (model === current) { busy = false; callbacks.loading(false); paint(); } }
  }
  async function submit(body) {
    await perform(async (current, callbacks) => {
      current.setProposal(body);
      await current.submit(() => window.confirm(current.creation ? '¿Confirmar la creación de esta operación con los datos capturados?' : '¿Confirmar estos cambios de la operación?'));
      if (model === current && current.state === 'confirmed') await callbacks.refresh();
    });
  }
  async function action(name) {
    const owner = model; let value;
    await perform(async (current, callbacks) => {
      if (name === 'recover') { await current.recover(); if (model === current && current.state === 'confirmed') await callbacks.refresh(); }
      else if (name === 'current') value = await current.inspectCurrent();
    });
    if (value && model === owner && hooks) App.commandPanel.showCurrent(document.getElementById('current-command-data'), value);
  }
  async function decide(choice) {
    if (choice === 'discard') { if (canLeave()) { reset(); document.getElementById('operacion-close')?.click(); } return; }
    await perform(async (current, callbacks) => {
      if (choice === 'review' && !window.confirm('¿Preparar otra intención conservando tu propuesta? Revisa y confirma de nuevo antes de guardar.')) return;
      const prepared = await current.prepare(choice, () => window.confirm('¿Descartar tu propuesta y utilizar la información actual autorizada?'));
      if (!prepared || model !== current) return;
      if (!current.creation) { const baseline = App.revisionConflict.view(current.original); callbacks.rebuild(baseline, {...baseline,...current.proposal}); }
      callbacks.message('Revisa los campos. El próximo guardado requiere otra confirmación.', 'info');
    });
  }
  window.addEventListener('beforeunload', event => { if (model && (busy || model.hasUnresolved())) { event.preventDefault(); event.returnValue = ''; } });
  App.operationCommands = {open,attach,submit,reset,canLeave,limitPage,getSession:()=>model};
})();
