// Adaptador optativo del modal original. Solo lo carga el laboratorio integrado.
(function () {
  'use strict';
  const App = window.App;
  let model = null, hooks = null, busy = false, controls = [];
  const view = App.revisionConflict.view;
  function reset() {
    model?.dispose(); model = hooks = null; controls = []; busy = false;
  }
  function canLeave() {
    if (!model) return true;
    if (busy || model.hasUnresolved()) {
      hooks?.message('Consulta y concilia el comando original antes de cerrar o abrir otra reservación. La referencia permanece en esta ventana.', 'is-error');
      return false;
    }
    return model.state === 'confirmed' || window.confirm('¿Cerrar esta edición y descartar su borrador local?');
  }
  function limitPage() {
    document.querySelectorAll('#reservaciones-nueva, [data-reservacion-action="cancel"], [data-reservacion-action="print"]').forEach(control => {
      control.disabled = true; control.title = 'Fuera del alcance del laboratorio integrado';
    });
  }
  function sync() {
    if (!model || !hooks) return;
    const locked = busy || model.state !== 'ready' || Boolean(model.command);
    for (const [control, disabled] of controls) control.disabled = disabled || locked;
    for (const id of ['reservaciones-close', 'reservaciones-cancel-form']) {
      const control = document.getElementById(id); if (control) control.disabled = busy || model.hasUnresolved();
    }
    document.querySelectorAll('#reservation-command-panel button, #reservation-conflict-panel button').forEach(button => button.disabled = busy);
  }
  async function open(id) {
    reset(); const current = new App.commandLab.CommandSession('PATCH', '/api/reservaciones/' + encodeURIComponent(id), { comparisonRead: true }); model = current;
    try { await current.open(); if (model !== current) throw Error('Edición invalidada.'); return view(current.original); }
    catch (error) { if (model === current) reset(); throw error; }
  }
  function attach(callbacks) {
    if (!model) throw Error('Falta la foto autorizada de edición.');
    hooks = callbacks;
    const form = document.getElementById('reservaciones-form');
    controls = [...form.querySelectorAll('input, select, textarea, #reservaciones-submit')].map(control => [control, control.disabled]);
    for (const id of ['reservation-command-panel', 'reservation-conflict-panel']) {
      const host = document.createElement('div'); host.id = id; form.append(host);
    }
    paint();
  }
  function paint() {
    if (!model || !hooks) return;
    const commandHost = document.getElementById('reservation-command-panel'), conflictHost = document.getElementById('reservation-conflict-panel');
    App.commandPanel.render(commandHost, model, action);
    conflictHost.replaceChildren();
    if (['conflict', 'rejected'].includes(model.state) && model.receipt?.comando.estado === 'rechazado') {
      App.revisionConflict.render(conflictHost, model, decide);
    }
    if (model.error) hooks.message(App.commandLab.message(model.error), 'is-error');
    else if (model.state === 'confirmed') hooks.message('Reservación actualizada. El recibo confirma el comando original.', 'is-info');
    sync();
  }
  async function perform(work) {
    if (!model || busy) return;
    const current = model, callbacks = hooks; busy = true; callbacks.loading(true); sync();
    try { await work(current, callbacks); }
    catch (error) { if (model === current) callbacks.message(App.commandLab.message(error), 'is-error'); }
    finally {
      if (model === current) { busy = false; callbacks.loading(false); paint(); }
    }
  }
  async function submit(patch) {
    return perform(async current => {
      current.setProposal(patch);
      await current.submit(() => window.confirm('¿Confirmar estos cambios en la reservación? Se guardará una sola intención.'));
    });
  }
  async function action(name) {
    const owner = model;
    let value;
    await perform(async current => {
      if (name === 'recover') await current.recover();
      else if (name === 'current') value = await current.inspectCurrent();
    });
    if (value && model === owner && hooks) App.commandPanel.showCurrent(document.getElementById('current-command-data'), value);
  }
  async function decide(choice) {
    if (choice === 'discard') { if (canLeave()) { reset(); document.getElementById('reservaciones-close')?.click(); } return; }
    await perform(async (current, callbacks) => {
      // El comparador jamás convierte su foto actual en la próxima precondición.
      if (choice === 'review' && !window.confirm('¿Preparar otra intención conservando tus cambios sobre una nueva foto autorizada? Revisa el formulario antes de confirmar otro guardado.')) return;
      const prepared = await current.prepare(choice, () => window.confirm('¿Descartar tu propuesta y preparar otra intención con la información actual?'));
      if (!prepared || model !== current) return;
      const baseline = view(current.original), draft = { ...baseline, ...current.proposal };
      callbacks.rebuild(baseline, draft);
      callbacks.message('Nueva foto autorizada. Revisa los campos y confirma el próximo guardado.', 'is-info');
    });
  }
  window.addEventListener('beforeunload', event => {
    if (model && (busy || model.hasUnresolved())) { event.preventDefault(); event.returnValue = ''; }
  });
  App.reservationCommands = { open, attach, submit, sync, reset, canLeave, limitPage, getSession: () => model };
})();
