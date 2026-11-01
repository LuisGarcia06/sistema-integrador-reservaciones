(function () {
  'use strict';
  const App = window.App; let rendered = '', version = -1;
  function render() {
    const authenticated = App.auth.estaAutenticado(),route = authenticated ? 'daily' : 'login';
    const root = document.getElementById('page-root');
    if (location.hash !== '#/' + route) location.replace('#/' + route);
    if (rendered === route && version === App.auth.obtenerVersionSesion() && root.childElementCount) return;
    rendered = route; version = App.auth.obtenerVersionSesion();
    App.layout.setShellMode(authenticated ? 'authenticated' : 'guest');
    document.querySelectorAll('#sidebar a:not([data-route-id="daily"])').forEach(link => link.remove());
    const page = App.pages[route];
    if (authenticated) App.layout.setPageHeader(page);
    if (authenticated && !App.auth.puedeAccederPagina('daily')) {
      App.dailyCommands.reset();root.innerHTML = App.ui.emptyState('Acceso no disponible','Tu rol o alcance no permite consultar Daily.');return;
    }
    root.innerHTML = page.render(); page.afterRender?.();
    App.layout.updateActiveNavigation(route);
  }
  App.router={navigate:render};window.addEventListener('hashchange',render);window.addEventListener('permisosactualizados',render);document.addEventListener('DOMContentLoaded',render);
})();
