/* Controles de laboratorio. Las pantallas y acciones del producto son las originales. */
(function () {
  'use strict';
  const banner = document.createElement('section');
  banner.id = 'preview-lab'; banner.setAttribute('aria-label', 'Controles de demostración');
  banner.innerHTML = '<strong>PRUEBA PARCIAL · synthetic-acceptance-only · productionAuthorized=false · SIN POSTGRESQL NI PROVEEDORES</strong>' +
    '<div>Los cambios viven en memoria hasta cerrar. El acceso de cada perfil se valida en la API sintética.</div>' +
    '<div class="preview-controls"><label>Perfil <select id="preview-profile"><option value="admin">Administrador</option><option value="all">Consulta all</option><option value="selected">Consulta selected</option></select></label>' +
    '<button id="preview-login" type="button">Entrar / cambiar perfil</button><button id="preview-operations" type="button">Operaciones de hoy</button>' +
    '<button id="preview-gyg" type="button">Simular llegada GYG</button><button id="preview-fh" type="button">Simular llegada FareHarbor</button>' +
    '<button id="preview-close" type="button">Cerrar demo</button><span id="preview-message" role="status" aria-live="polite">Selecciona un perfil ficticio.</span></div>';
  document.body.prepend(banner);
  const resize = new ResizeObserver(() => document.documentElement.style.setProperty('--preview-height', Math.ceil(banner.getBoundingClientRect().height) + 'px'));
  resize.observe(banner);
  const message = document.getElementById('preview-message');
  const capability = document.querySelector('meta[name="preview-capability"]').content;
  let busy = false;
  async function action(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (error) { message.textContent = error.data?.mensaje || error.message || 'No fue posible completar el control de laboratorio.'; }
    finally { busy = false; sync(); }
  }
  function sync() {
    const user = window.App?.auth?.obtenerUsuario();
    const enabled = Boolean(user && user.alcance_plataformas === 'all');
    document.getElementById('preview-operations').disabled = busy || !enabled;
    document.getElementById('preview-gyg').disabled = busy || !enabled;
    document.getElementById('preview-fh').disabled = busy || !enabled;
    document.getElementById('preview-login').disabled = busy;
  }
  document.getElementById('preview-login').onclick = () => action(async () => {
    const key = document.getElementById('preview-profile').value;
    App.auth.cerrarSesion();
    await App.auth.iniciarSesion(key + '@demo.invalid', 'Solo-Demo-05');
    App.router.navigate('dashboard');
    message.textContent = 'Sesión ficticia: ' + App.auth.obtenerUsuario().nombre + '.';
  });
  document.getElementById('preview-operations').onclick = () => { App.router.navigate('operaciones'); message.textContent = 'Grupos 1 y 2 de hoy: abre Transportes para cambiar la unidad o asignar pasajeros.'; };
  async function llegada(provider) {
    await App.notificaciones.refresh(); // Establece la línea base antes de introducir el evento.
    const response = await App.api.apiFetch('/__preview/arrival', { method: 'POST', headers: { 'X-Preview-Capability': capability }, body: { provider } });
    await App.notificaciones.refresh();
    message.textContent = 'Llegó el evento ficticio #' + response.datos.id_evento_integracion + '. Revisa Avisos.';
  }
  document.getElementById('preview-gyg').onclick = () => action(() => llegada('getyourguide'));
  document.getElementById('preview-fh').onclick = () => action(() => llegada('fareharbor'));
  document.getElementById('preview-close').onclick = () => action(async () => {
    await fetch('/__preview/close', { method: 'POST', headers: { 'X-Preview-Capability': capability } });
  });
  window.addEventListener('hashchange', sync);
  window.addEventListener('permisosactualizados', sync);
  const timer = setInterval(sync, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); resize.disconnect(); }, { once: true });
  sync();
})();
