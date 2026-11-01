(function () {
  'use strict';
  const App = window.App; let rendered = '', version = -1;
  function render() {
    const authenticated = App.auth.estaAutenticado(),route = authenticated ? 'operaciones' : 'login';
    const root = document.getElementById('page-root');
    if (location.hash !== '#/' + route) location.replace('#/' + route);
    if (rendered === route && version === App.auth.obtenerVersionSesion() && root.childElementCount) return;
    rendered = route; version = App.auth.obtenerVersionSesion();
    App.layout.setShellMode(authenticated ? 'authenticated' : 'guest');
    document.querySelectorAll('#sidebar a:not([data-route-id="operaciones"])').forEach(link => link.remove());
    const page = App.pages[route];
    if (authenticated) App.layout.setPageHeader(page);
    if (authenticated && !App.auth.puedeAccederPagina('operaciones')) {
      App.transportCommands.reset();root.innerHTML = App.ui.emptyState('Acceso no disponible','Tu rol o alcance no permite consultar Operaciones.');return;
    }
    root.innerHTML = page.render(); page.afterRender?.();
    App.transportCommands.limitPage();App.layout.updateActiveNavigation(route);
  }
  App.router={navigate:render};window.addEventListener('hashchange',render);window.addEventListener('permisosactualizados',render);document.addEventListener('DOMContentLoaded',render);
})();
