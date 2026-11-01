// Adaptador optativo del modal original. Solo lo carga el laboratorio integrado.
(function () {
  'use strict';
  const App = window.App;
  let model = null, hooks = null, busy = false, controls = [], intent = 'edit', destinations = [];
  const view = App.revisionConflict.view;
  function reset() {
    model?.dispose(); model = hooks = null; controls = []; busy = false; destinations = [];
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
    if (App.unified?.active) return;
    document.querySelectorAll('[data-reservacion-action="print"]').forEach(control => {
      control.disabled = true; control.title = 'Acción no habilitada en este perfil';
    });
  }
  function sync() {
    if (!model || !hooks) return;
    const locked = busy || model.state !== 'ready' || Boolean(model.command);
    for (const [control, disabled] of controls) control.disabled = disabled || locked;
    for (const id of hooks.closeIds || ['reservaciones-close', 'reservaciones-cancel-form']) {
      const control = document.getElementById(id); if (control) control.disabled = busy || model.hasUnresolved();
    }
    document.querySelectorAll('#reservation-command-panel button, #reservation-conflict-panel button').forEach(button => button.disabled = busy);
  }
  async function open(id, operation = 'edit') {
    if (!['edit', 'cancel', 'transport'].includes(operation)) throw Error('Acción no adaptada.');
    reset(); intent = operation;
    const suffix = {edit:'',cancel:'/cancelar',transport:'/transporte'}[intent];
    const current = new App.commandLab.CommandSession('PATCH', '/api/reservaciones/' + encodeURIComponent(id) + suffix, { comparisonRead: true }); model = current;
    try { await current.open(); if (intent === 'transport') await loadDestinations(current); if (model !== current) throw Error('Edición invalidada.'); return view(current.original); }
    catch (error) { if (model === current) reset(); throw error; }
  }
  async function startCreate() {
    reset(); intent = 'create';
    const current = new App.commandLab.CreateReservationSession(); model = current;
    await current.open(); return model === current;
  }
  function attach(callbacks) {
    if (!model) throw Error('Falta la foto autorizada de edición.');
    hooks = callbacks;
    const form = document.getElementById(callbacks.formId || 'reservaciones-form');
    controls = [...form.querySelectorAll('input, select, textarea, button')].map(control => [control, control.disabled]);
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
      if (intent === 'create') {
        const note = document.createElement('p'); note.textContent = 'Creación rechazada. Conserva los datos, revisa el formulario y confirma otra intención para obtener precondiciones nuevas.'; conflictHost.append(note);
        const review = document.createElement('button'); review.type = 'button'; review.dataset.decision = 'review'; review.textContent = 'Revisar esta alta';
        review.addEventListener('click', () => decide('review')); conflictHost.append(review);
      } else App.revisionConflict.render(conflictHost, model, decide);
    }
    if (model.error && intent === 'create' && !model.command) hooks.message('No se envió el POST de creación: falló la consulta o validación de sus precondiciones. Revisa los datos y vuelve a confirmar.', 'is-error');
    else if (model.error) hooks.message(App.commandLab.message(model.error), 'is-error');
    else if (model.state === 'confirmed') hooks.message(intent === 'create' ? 'Reservación #' + model.createdId() + ' creada con recibo confirmado. Consulta la información actual para ver su código asignado.' : intent === 'cancel' ? 'Cancelación confirmada por el recibo del comando original.' : intent === 'transport' ? 'Asignación confirmada por el recibo del comando original.' : 'Reservación actualizada. El recibo confirma el comando original.', 'is-info');
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
      const question = intent === 'create' ? '¿Confirmar la creación de esta reservación con los datos capturados? Se enviará una única intención.' : intent === 'cancel' ? '¿Confirmar la cancelación de esta reservación con el motivo indicado?' : intent === 'transport' ? '¿Confirmar esta asignación de transporte para la reservación?' : '¿Confirmar estos cambios en la reservación? Se guardará una sola intención.';
      await current.submit(() => window.confirm(question));
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
    if (choice === 'discard') { if (canLeave()) { const closeId = hooks?.closeIds?.[0] || 'reservaciones-close'; reset(); document.getElementById(closeId)?.click(); } return; }
    await perform(async (current, callbacks) => {
      // El comparador jamás convierte su foto actual en la próxima precondición.
      if (choice === 'review' && !window.confirm('¿Preparar otra intención conservando tus cambios sobre una nueva foto autorizada? Revisa el formulario antes de confirmar otro guardado.')) return;
      const prepared = await current.prepare(choice, () => window.confirm('¿Descartar tu propuesta y preparar otra intención con la información actual?'));
      if (!prepared || model !== current) return;
      if (intent === 'create') {
        callbacks.message('Revisa los datos. Otra creación requiere validar y confirmar antes de pedir sus precondiciones.', 'is-info'); return;
      }
      const baseline = view(current.original), draft = { ...baseline, ...current.proposal };
      if (intent === 'transport') {
        try { await loadDestinations(current); } catch (error) { current.state = 'blocked'; throw error; }
      }
      if (model !== current) return;
      await callbacks.rebuild(baseline, draft);
      callbacks.message('Nueva foto autorizada. Revisa los campos y confirma el próximo guardado.', 'is-info');
    });
  }
  async function loadDestinations(current) {
    const record = view(current.original), date = String(record.fecha).slice(0, 10);
    const operations = await App.api.apiFetch('/api/operaciones?fecha=' + encodeURIComponent(date));
    current.assertIdentity();
    const compatible = operations.datos.filter(op => Number(op.id_tour) === Number(record.id_tour) && op.turno === record.turno && String(op.fecha).slice(0,10) === date);
    const replies = await Promise.all(compatible.map(op => App.api.apiFetch('/api/transportes?id_operacion_tour=' + encodeURIComponent(op.id_operacion_tour))));
    current.assertIdentity(); if (model !== current) throw Error('Selección invalidada.');
    destinations = replies.flatMap((reply, index) => reply.datos.map(tr => ({...tr, id_tour: compatible[index].id_tour})));
  }
  function transportControls(record, draft) {
    const id = record.id_reservacion, origin = record.id_transporte_operacion;
    const eligible = destinations.filter(tr => Number(tr.id_transporte_operacion) !== Number(origin));
    const options = '<option value="">Selecciona transporte</option>' + eligible.map(tr => '<option value="' + App.ui.escapeHtml(tr.id_transporte_operacion) + '">' + App.ui.escapeHtml(App.transportesUi.describir(tr).principal + ' · ' + App.transportesUi.describir(tr).secundaria) + '</option>').join('');
    return origin == null ? App.transportesUi.controlesPendiente(id, false, App.auth.esAdministrador(), destinations, options)
      : App.transportesUi.controlesAsignada(id, Number(origin), false, App.auth.esAdministrador(), destinations, options);
  }
  function validDestination(id) { return destinations.some(tr => Number(tr.id_transporte_operacion) === id); }
  window.addEventListener('beforeunload', event => {
    if (model && (busy || model.hasUnresolved())) { event.preventDefault(); event.returnValue = ''; }
  });
  App.reservationCommands = { open, startCreate, attach, submit, sync, reset, canLeave, limitPage, transportControls, validDestination, getSession: () => model };
})();
