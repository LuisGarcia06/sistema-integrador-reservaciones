(function () {
  'use strict';
  const App = window.App;
  function render(host, session, action) {
    host.replaceChildren(); if (!session.command) return;
    const section = document.createElement('section'); section.className = 'command-panel';
    const title = document.createElement('h2'); title.tabIndex = -1; title.textContent = 'Resultado del comando original'; section.append(title);
    const id = document.createElement('p'); id.textContent = 'Identificador: ' + session.command.key; section.append(id);
    const status = document.createElement('p'); status.id = 'command-state'; status.setAttribute('role', 'status');
    const known = session.receipt?.comando.estado;
    status.textContent = known === 'confirmado' ? 'Confirmado. ' + (session.recovered ? 'Recibo recuperado sin guardar de nuevo.' : session.replayed ? 'Repetición reconocida por el servidor.' : 'Recibo posterior a COMMIT.')
      : known === 'rechazado' ? 'Rechazado durable: ' + session.receipt.resultado.codigo + '. Se conserva tu propuesta.'
      : session.state === 'forbidden' ? 'Acceso denegado o permisos cambiados. No se muestran datos históricos.'
      : 'Resultado incierto. No se sabe si la operación se confirmó; no se repetirá el guardado.';
    section.append(status);
    if (session.recoveryError) { const warning = document.createElement('p'); warning.setAttribute('role', 'alert'); warning.textContent = App.commandLab.message(session.recoveryError); section.append(warning); }
    if (session.receipt) { const receipt = document.createElement('pre'); receipt.id = 'command-receipt'; receipt.textContent = JSON.stringify(session.receipt, null, 2); section.append(receipt); }
    const note = document.createElement('p'); note.textContent = 'La consulta usa el identificador y la generación originales. Una ausencia o error no demuestra rollback. El recibo no sirve como ETag para otra edición.'; section.append(note);
    const button = (name, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.commandAction = name; b.textContent = label;
      b.addEventListener('click', async () => { section.querySelectorAll('button').forEach(c => c.disabled = true); try { await action(name); } finally { section.querySelectorAll('button').forEach(c => c.disabled = false); } }); section.append(b);
    };
    button('recover', 'Consultar resultado original');
    if (known === 'confirmado') button('current', 'Consultar información actual autorizada');
    const current = document.createElement('div'); current.id = 'current-command-data'; section.append(current);
    host.append(section); title.focus();
  }
  function showCurrent(host, value) {
    host.replaceChildren(); const title = document.createElement('h3'); title.textContent = 'Estado actual consultado por separado';
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(value, null, 2); host.append(title, pre);
  }
  App.commandPanel = { render, showCurrent };
})();
