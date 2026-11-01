(function () {
  'use strict';
  const App = window.App;
  const commands = App.commandLab;
  // Tipos del formulario. Las revisiones y etiquetas nunca se convierten a número.
  const actions = [
    ['reservacion', 'Reservación: modificar', 'PATCH', 'reservaciones', '', 'nombre_cliente,telefono_cliente,habitacion,pax:n,ninos:n,pickup_place,pickup_time,turno,observaciones'],
    ['cancelar', 'Reservación: cancelar', 'PATCH', 'reservaciones', '/cancelar', 'motivo_cancelacion'],
    ['asignar', 'Reservación: transporte', 'PATCH', 'reservaciones', '/transporte', 'id_transporte_operacion:n'],
    ['operacion', 'Operación: modificar', 'PATCH', 'operaciones', '', 'hora_inicio,id_guia:n,estado'],
    ['transporte', 'Transporte: modificar', 'PATCH', 'transportes', '', 'id_vehiculo:n,id_operador:n,observaciones_operador,estado'],
    ['daily', 'Daily: observaciones por fecha', 'PUT', 'daily', '', 'observaciones'],
    ['revision', 'Evento: aprobar o rechazar', 'PATCH', 'eventos-integracion', '/revision', 'accion,nota'],
    ['archivo', 'Evento: archivar', 'PATCH', 'eventos-integracion', '/archivo', 'motivo'],
    ['aplicar', 'Evento: aplicar cancelación sintética', 'POST', 'eventos-integracion', '/aplicar', 'motivo_cancelacion'],
    ['vehiculo', 'Vehículo: modificar', 'PATCH', 'vehiculos', '', 'identificador,capacidad:n,color,estado:b'],
    ['guia', 'Guía: modificar', 'PATCH', 'guias', '', 'nombre,estado:b'],
    ['operador', 'Operador: modificar', 'PATCH', 'operadores', '', 'nombre,estado:b'],
    ['tour', 'Tour: modificar', 'PATCH', 'tours', '', 'nombre,descripcion,activo:b'],
    ['usuario', 'Usuario: nombre o estado', 'PATCH', 'usuarios', '', 'nombre,estado:b']
  ];
  const $ = id => document.getElementById(id);
  let session = null, selected = null, busy = false, fingerprint = null, provider = null;
  function status(text) { $('lab-status').textContent = text; }
  function discardSession() { if (session) session.dispose(); session = null; fingerprint = null; provider = null; $('editor').replaceChildren(); $('conflict').replaceChildren(); if (commands) $('command-result').replaceChildren(); }
  App.pages = { lab: { resetSession: discardSession } };
  async function discard() {
    if (commands && session?.hasUnresolved()) { status('El comando original sigue sin conciliar. Consulta su resultado antes de abrir otra intención. Cerrar sesión perderá esta referencia en memoria.'); return false; }
    if (session && !window.confirm('¿Descartar los cambios escritos en este formulario?')) return false;
    discardSession(); return true;
  }
  function fields() { return selected[5].split(',').map(item => item.split(':')); }
  function baseline() { return App.revisionConflict.view(session.original); }
  function readProposal() {
    const result = {}, original = baseline();
    for (const [name, type] of fields()) {
      const input = document.querySelector('[data-field="' + name + '"]');
      let value = input.value;
      if (type === 'n') { value = value === '' ? null : Number(value); if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Identificador o cantidad inválida: ' + name); }
      if (type === 'b') value = value === 'true';
      const old = original[name] === undefined ? '' : original[name];
      if (String(value ?? '') !== String(old ?? '')) result[name] = value;
    }
    if (selected[0] === 'aplicar') {
      const reason = document.querySelector('[data-field="motivo_cancelacion"]').value;
      return provider === 'fareharbor' ? { motivo_cancelacion: reason, cancellation_fingerprint: fingerprint } : { completar: { motivo_cancelacion: reason } };
    }
    return result;
  }
  function renderEditor() {
    const host = $('editor'); host.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = selected[1]; host.append(heading);
    const original = document.createElement('pre'); original.textContent = 'Original autorizado · revisión ' + (session.original.revision ?? 'sin revisión de registro') + '\n' + JSON.stringify(baseline(), null, 2); host.append(original);
    const form = document.createElement('form'); form.id = 'protected-form';
    const values = baseline(), proposal = session.proposal;
    for (const [name, type] of fields()) {
      const label = document.createElement('label'); label.textContent = name;
      const input = document.createElement(type === 'b' ? 'select' : 'textarea'); input.dataset.field = name;
      if (type === 'b') for (const v of ['true', 'false']) { const option = document.createElement('option'); option.value = v; option.textContent = v === 'true' ? 'Activo' : 'Inactivo'; input.append(option); }
      input.value = Object.prototype.hasOwnProperty.call(proposal, name) ? proposal[name] ?? '' : values[name] ?? '';
      if (selected[0] === 'aplicar') input.value = proposal.motivo_cancelacion ?? proposal.completar?.motivo_cancelacion ?? '';
      label.append(input); form.append(label);
    }
    const save = document.createElement('button'); save.type = 'submit'; save.id = 'save'; save.textContent = 'Guardar con confirmación'; form.append(save);
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Descartar'; cancel.addEventListener('click', discard); form.append(cancel);
    form.addEventListener('submit', submit); host.append(form);
    if (commands) syncCommandControls();
  }
  function syncCommandControls() {
    if (!commands || !session) return;
    const frozen = session.state !== 'ready';
    $('protected-form')?.querySelectorAll('textarea, select, #save').forEach(c => c.disabled = frozen);
  }
  function renderCommandOutcome() {
    if (!commands || !session) return;
    const active = session;
    if (['conflict', 'rejected'].includes(active.state)) App.revisionConflict.render($('conflict'), active, decide);
    else $('conflict').replaceChildren();
    App.commandPanel.render($('command-result'), active, async action => {
      if (busy || session !== active) return;
      busy = true;
      try {
        if (action === 'recover') await active.recover();
        else {
          const value = await active.inspectCurrent();
          if (session === active) App.commandPanel.showCurrent($('current-command-data'), value);
          return;
        }
        if (session === active) status(active.receipt?.comando.estado === 'confirmado' ? 'Resultado original confirmado y recuperado. No se envió otra escritura.' : App.revisionLab.message(active.error || {}));
      } catch (e) { if (session === active) status(App.revisionLab.message(e)); }
      finally { busy = false; if (session === active && (action === 'recover' || active.state === 'forbidden')) renderCommandOutcome(); syncCommandControls(); }
    });
    syncCommandControls();
  }
  async function externalPreview() {
    if (selected[0] !== 'aplicar') return;
    const event = baseline(); provider = event.provider;
    // Esta etapa solo expone cancelaciones. Nunca aplica otras variantes con un
    // formulario incompleto o una huella derivada de una representación vieja.
    if (event.event_type !== 'cancellation' || !['fareharbor', 'getyourguide'].includes(provider)) throw new Error('Aplicación bloqueada: este formulario solo cubre cancelaciones sintéticas.');
    if (provider === 'fareharbor') {
      const diff = await App.api.apiFetch('/api/eventos-integracion/' + event.id_evento_integracion + '/diff');
      fingerprint = diff.datos.cancellation_fingerprint;
      if (typeof fingerprint !== 'string') throw new Error('No hay huella autorizada de cancelación.');
    }
  }
  async function openAction(key, target) {
    if (busy) return;
    if (!await discard()) return;
    busy = true;
    try {
      selected = actions.find(a => a[0] === key); if (!selected) throw new Error('Acción no adaptada.');
      if (selected[0] === 'daily' ? !/^\d{4}-\d\d-\d\d$/.test(target) : !/^[1-9][0-9]*$/.test(target)) throw new Error('Identificador o fecha inválida.');
      const url = selected[0] === 'daily' ? '/api/daily/observaciones?fecha=' + target : '/api/' + selected[3] + '/' + target + selected[4];
      const pending = new App.revisionLab.EditSession(selected[2], url); session = pending;
      await pending.open(); if (session !== pending) return;
      await externalPreview(); renderEditor(); status('Foto original conservada. Edita y confirma para guardar.');
    } catch (e) { discardSession(); status(App.revisionLab.message(e)); }
    finally { busy = false; }
  }
  async function decide(choice) {
    if (commands && busy) return;
    if (choice === 'discard') { await discard(); return; }
    const active = session;
    if (commands) busy = true;
    try { if (await active.prepare(choice, () => window.confirm('¿Descartar mi propuesta y utilizar la información actual?'))) {
      if (session !== active) return;
      try { await externalPreview(); }
      catch (e) { if (session === active) session.state = 'blocked'; throw e; }
      if (session !== active) return;
      renderEditor(); $('conflict').replaceChildren(); status('Nueva foto consultada. Revisa el formulario y confirma un nuevo guardado.');
      if (commands) renderCommandOutcome();
    }} finally { if (commands) busy = false; }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || !session) return;
    busy = true;
    const controls = $('protected-form').querySelectorAll('button, textarea, select');
    const active = session;
    try {
      session.setProposal(readProposal()); controls.forEach(c => c.disabled = true);
      const result = await session.submit((proposal, snapshot) => window.confirm('¿Enviar esta escritura con las precondiciones consultadas?\nRevisión: ' + (snapshot.revision ?? 'opaca') + '\n' + JSON.stringify(proposal)));
      if (result && session === active) {
        if (commands) { renderCommandOutcome(); status(active.replayed ? 'Comando confirmado: el transporte repitió una solicitud y el servidor reconoció el mismo resultado.' : 'Escritura confirmada por el servidor después de COMMIT. Recibo conservado.'); }
        else { discardSession(); status('Escritura confirmada por el servidor después de COMMIT.'); }
      }
    } catch (e) {
      if (session === active) {
        status(App.revisionLab.message(e));
        if (commands) renderCommandOutcome();
        else if (session && ['conflict', 'uncertain', 'blocked'].includes(session.state)) App.revisionConflict.render($('conflict'), session, decide);
      }
    } finally { controls.forEach(c => c.disabled = false); busy = false; syncCommandControls(); }
  }
  actions.forEach(a => { const option = document.createElement('option'); option.value = a[0]; option.textContent = a[1]; $('action').append(option); });
  $('lab-login').addEventListener('submit', async event => { event.preventDefault(); if (!await discard()) return; try { await App.auth.iniciarSesion($('correo').value, $('password').value); $('password').value = ''; status('Sesión verificada: ' + App.auth.obtenerUsuario().rol); } catch (e) { status(App.revisionLab.message(e)); } });
  $('logout').addEventListener('click', async () => {
    if (commands && session?.hasUnresolved()) {
      if (!window.confirm('El resultado sigue sin conciliar. Cerrar sesión pierde el borrador y la referencia en memoria; no cancela el comando. ¿Cerrar sesión?')) return;
      discardSession(); App.auth.cerrarSesion(); status('Sesión cerrada; no se conservó un borrador persistente.'); return;
    }
    if (await discard()) { App.auth.cerrarSesion(); status('Sesión cerrada.'); }
  });
  $('lab-select').addEventListener('submit', event => { event.preventDefault(); openAction($('action').value, $('target').value); });
  App.revisionEditor = { actions, openAction, getSession: () => session };
})();
