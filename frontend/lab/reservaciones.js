// Solo monta las páginas originales inventariadas; no carga el router del producto.
(function () {
  'use strict';
  const App = window.App;
  let rendered = '', version = -1;
  function render() {
    const route = App.auth.estaAutenticado() ? 'reservaciones' : 'login';
    const root = document.getElementById('page-root');
    if (location.hash !== '#/' + route) location.replace('#/' + route);
    if (rendered === route && version === App.auth.obtenerVersionSesion() && root.childElementCount) return;
    rendered = route; version = App.auth.obtenerVersionSesion();
    App.layout.setShellMode(route === 'login' ? 'guest' : 'authenticated');
    document.querySelectorAll('#sidebar a:not([data-route-id="reservaciones"])').forEach(link => link.remove());
    const page = App.pages[route];
    if (route === 'reservaciones') App.layout.setPageHeader(page);
    root.innerHTML = page.render(); page.afterRender?.();
    App.reservationCommands.limitPage(); App.layout.updateActiveNavigation(route);
  }
  App.router = { navigate: render };
  window.addEventListener('hashchange', render);
  window.addEventListener('permisosactualizados', render);
  document.addEventListener('DOMContentLoaded', render);
})();
