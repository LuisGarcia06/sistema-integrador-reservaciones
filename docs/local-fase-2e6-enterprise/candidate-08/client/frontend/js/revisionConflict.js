(function () {
  'use strict';
  const App = window.App;
  const view = snapshot => snapshot && (snapshot.datos.datos || snapshot.datos);
  const show = value => value === undefined ? '—' : value === null ? '(vacío)' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  function render(host, session, decide) {
    host.replaceChildren();
    const section = document.createElement('section'); section.className = 'revision-conflict'; section.setAttribute('aria-labelledby', 'conflict-title');
    const title = document.createElement('h2'); title.id = 'conflict-title'; title.tabIndex = -1; title.textContent = 'Revisar conflicto y conservar mi intención'; section.append(title);
    const warning = document.createElement('p'); warning.setAttribute('role', 'alert');
    warning.textContent = App.revisionLab.message(session.error || {});
    if (session.error?.status === 409) warning.textContent += ' Las dependencias pueden haber cambiado aunque los campos de este registro coincidan. El servidor no publica el contenido de su contexto global.';
    section.append(warning);
    const table = document.createElement('table'); table.setAttribute('aria-label', 'Comparación de valores');
    const head = table.createTHead().insertRow(); ['Campo', 'Original consultado', 'Mi propuesta', 'Actual autorizado', 'Cambios'].forEach(label => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
    const original = view(session.original) || {}, current = view(session.current);
    const fields = new Set([...Object.keys(original), ...Object.keys(session.proposal), ...Object.keys(current || {})].filter(field => (!App.auditUi || field !== 'motivo') && !['password','hash','token','version_credenciales','cv'].includes(field)));
    if (App.auditUi && session.proposal.motivo !== undefined) {
      const reason = document.createElement('p'); reason.textContent = 'Motivo del cambio conservado: ' + session.proposal.motivo; section.append(reason);
    }
    const tbody = table.createTBody();
    const affected = field => Object.prototype.hasOwnProperty.call(session.proposal, field)
      || current && JSON.stringify(current[field]) !== JSON.stringify(original[field]);
    for (const field of [...fields].sort((a, b) => Number(Boolean(affected(b))) - Number(Boolean(affected(a))))) {
      const proposed = Object.prototype.hasOwnProperty.call(session.proposal, field) ? session.proposal[field] : original[field];
      const mine = JSON.stringify(proposed) !== JSON.stringify(original[field]);
      const theirs = current && JSON.stringify(current[field]) !== JSON.stringify(original[field]);
      const row = tbody.insertRow();
      [field, show(original[field]), show(proposed), current ? show(current[field]) : 'No disponible: acceso o lectura sin confirmar', [mine ? 'Mi cambio' : '', theirs ? 'Cambió en servidor' : ''].filter(Boolean).join(' · ') || 'Sin cambio visible'].forEach(text => { const cell = row.insertCell(); cell.textContent = text; });
      if (mine || theirs) row.className = 'revision-changed';
    }
    section.append(table);
    const hint = document.createElement('p'); hint.textContent = 'Revisar obtiene una foto nueva y conserva tu propuesta. Después deberás confirmar otro guardado. Ante resultado incierto, consulta también la bitácora antes de decidir.'; section.insertBefore(hint, table);
    [['review', 'Revisar mis cambios'], ['current', 'Utilizar la información actual'], ['discard', 'Cancelar o descartar']].forEach(([choice, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.decision = choice;
      button.addEventListener('click', async () => {
        const buttons = section.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
        try { await decide(choice); } catch (e) { warning.textContent = App.revisionLab.message(e); }
        finally { buttons.forEach(b => b.disabled = false); }
      }); section.insertBefore(button, table);
    });
    host.append(section); title.focus();
  }
  App.revisionConflict = { render, view };
})();
