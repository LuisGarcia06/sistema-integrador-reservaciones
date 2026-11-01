(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};
  let timer = null;
  let generation = 0;
  let requestVersion = 0;
  let busy = false;
  const names = { fareharbor: 'FareHarbor', getyourguide: 'GetYourGuide' };
  const connections = {
    receptor_local_disponible: 'Receptor HTTPS local disponible',
    receptor_no_disponible: 'Receptor HTTPS local no disponible',
    error: 'Error de sincronización', recuperando: 'Recuperando mensajes',
    sincronizando: 'Sincronización reciente', sin_sincronizacion_reciente: 'Sin sincronización reciente'
  };
  const esc = function (value) { return App.ui.escapeHtml(String(value)); };
  function date(value) {
    return value ? new Date(value).toLocaleString('es-MX', { timeZone: 'America/Cancun' }) : 'Sin registro';
  }
  function stop() { generation++; requestVersion++; if (timer) window.clearTimeout(timer); timer = null; busy = false; }
  async function refresh() {
    if (window.location.hash !== '#/integraciones' || !App.auth.estaAutenticado()) return stop();
    const current = generation;
    const request = ++requestVersion;
    try {
      const response = await App.api.apiFetch('/api/integraciones');
      if (current !== generation || request !== requestVersion || window.location.hash !== '#/integraciones') return;
      const root = document.getElementById('integraciones-lista');
      if (!root) return;
      root.innerHTML = response.datos.map(function (item) {
        return '<article class="card integracion-card"><h2>' + esc(names[item.provider]) + '</h2>' +
          '<p><strong>Avisos: ' + (item.activado ? 'Activados' : 'Pausados') + '</strong></p>' +
          '<p>Conexión: ' + esc(connections[item.conexion] || 'Sin información') + '</p>' +
          '<p>Acumulados: ' + (item.acumulados === null ? 'No disponible para este alcance' : esc(item.acumulados)) + '</p>' +
          '<p>Última recepción: ' + esc(date(item.ultima_recepcion)) + '</p>' +
          (item.provider === 'getyourguide' ? '<p>Última sincronización: ' + esc(date(item.ultima_sincronizacion)) + '</p>' :
            '<p>Full Capture cloud: no confirmado.</p>') +
          (App.auth.esAdministrador() ? '<button type="button" class="btn btn-primary" data-provider="' + esc(item.provider) +
            '" data-activar="' + String(!item.activado) + '">' + (item.activado ? 'Pausar' : 'Activar') + ' ' + esc(names[item.provider]) + '</button>' :
            '<p>Solo lectura</p>') + '</article>';
      }).join('');
      root.querySelectorAll('button[data-provider]').forEach(function (button) {
        button.addEventListener('click', async function () {
          if (busy) return;
          busy = true;
          requestVersion++;
          if (timer) window.clearTimeout(timer);
          root.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          const feedback = document.getElementById('integraciones-mensaje');
          try {
            const result = await App.api.apiFetch('/api/integraciones/' + button.dataset.provider, {
              method: 'PATCH', body: { activado: button.dataset.activar === 'true' }
            });
            if (current !== generation || window.location.hash !== '#/integraciones') return;
            feedback.textContent = result.datos.activado ? 'Avisos activados. Liberados: ' + result.datos.liberados :
              'Avisos pausados. La recepción continúa en segundo plano.';
            if (App.notificaciones) App.notificaciones.refresh();
          } catch (error) {
            if (current === generation && window.location.hash === '#/integraciones') feedback.textContent =
              'No se pudo confirmar el cambio. Consulta el estado actualizado antes de reintentar.';
          } finally { busy = false; await refresh(); }
        });
      });
    } catch (error) {
      if (current === generation && request === requestVersion && window.location.hash === '#/integraciones') {
        const feedback = document.getElementById('integraciones-mensaje');
        if (feedback) feedback.textContent = 'No fue posible consultar las integraciones.';
      }
    } finally {
      if (current === generation && request === requestVersion && !busy && window.location.hash === '#/integraciones') {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 30000);
      }
    }
  }
  window.addEventListener('hashchange', function () { if (window.location.hash !== '#/integraciones') stop(); });
  App.pages.integraciones = {
    title: 'Integraciones', subtitle: 'Publicación de avisos y estado de recepción', resetSession: stop,
    render: function () {
      return '<section class="page"><p>Al pausar se siguen guardando los eventos. Al activar se publican todos los acumulados. ' +
        'Las reservaciones requieren aprobación manual.</p><p id="integraciones-mensaje" role="status" aria-live="polite"></p>' +
        '<div id="integraciones-lista" class="integraciones-grid">Consultando integraciones…</div></section>';
    }, afterRender: function () { stop(); refresh(); }
  };
})();
