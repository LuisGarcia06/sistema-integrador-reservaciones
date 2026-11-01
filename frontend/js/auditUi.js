// Se carga exclusivamente desde la entrada experimental 021.
(function () {
  'use strict';
  const App = window.App;
  function validate(value, required) {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || !value.trim()) throw Error('Ingresa el Motivo del cambio.');
    if ([...value].length > 500) throw Error('El Motivo del cambio admite máximo 500 caracteres Unicode.');
  }
  function field(id, value = '') {
    return '<label class="field" for="' + id + '"><span class="field-label">Motivo del cambio</span><textarea class="input" id="' + id + '" name="motivo">' + App.ui.escapeHtml(value) + '</textarea><small>Opcional en altas; obligatorio al modificar. Máximo 500 caracteres Unicode.</small></label>';
  }
  function body(payload, id, required) {
    const value = document.getElementById(id)?.value;
    const result = {...payload};
    if (value !== '') result.motivo = value;
    validate(result.motivo, required);
    return result;
  }
  App.auditUi = Object.freeze({protocol:App.adminUi?.protocol || 'ctsk-audit-api-v1', validate, field, body});
})();
