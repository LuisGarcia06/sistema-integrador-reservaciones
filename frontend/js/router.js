(function () {
  const App = window.App = window.App || {};
  const DEFAULT_ROUTE = "dashboard";

  function getRouteFromHash() {
    const hash = window.location.hash || "";
    const route = hash.replace(/^#\//, "").trim();
    return route || DEFAULT_ROUTE;
  }

  function renderUnknown(routeId) {
    App.layout.updateActiveNavigation("");
    App.layout.setPageHeader({
      title: "Ruta no encontrada",
      subtitle: "La sección solicitada no existe en esta base visual"
    });

    document.getElementById("page-root").innerHTML = [
      '<section class="page">',
      App.ui.placeholder(
        "No se encontró la vista",
        'La ruta "#/' + routeId + '" no está registrada. Usa la navegación principal para volver a una sección disponible.'
      ),
      '<a class="btn btn-primary" href="#/dashboard">Volver a Dashboard</a>',
      "</section>"
    ].join("");
  }

  function renderRoute() {
    const routeId = getRouteFromHash();
    const page = App.pages && App.pages[routeId];
    const pageRoot = document.getElementById("page-root");

    if (!page) {
      renderUnknown(routeId);
      return;
    }

    App.layout.updateActiveNavigation(routeId);
    App.layout.setPageHeader({
      title: page.title,
      subtitle: page.subtitle
    });

    pageRoot.innerHTML = page.render();
    pageRoot.focus({ preventScroll: true });
  }

  function navigate(routeId) {
    window.location.hash = "#/" + routeId;
  }

  function init() {
    window.addEventListener("hashchange", renderRoute);

    if (!window.location.hash) {
      navigate(DEFAULT_ROUTE);
      return;
    }

    renderRoute();
  }

  App.router = {
    init: init,
    navigate: navigate,
    renderRoute: renderRoute
  };
})();
