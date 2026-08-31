(function () {
  const App = window.App = window.App || {};
  const DEFAULT_ROUTE = "dashboard";
  const LOGIN_ROUTE = "login";
  const PUBLIC_ROUTES = [LOGIN_ROUTE];

  function getRouteFromHash() {
    const hash = window.location.hash || "";
    const route = hash.replace(/^#\//, "").trim();
    return route || DEFAULT_ROUTE;
  }

  function renderUnknown(routeId) {
    App.layout.setShellMode("authenticated");
    App.layout.updateActiveNavigation("");
    App.layout.setPageHeader({
      title: "Ruta no encontrada",
      subtitle: "La sección solicitada no existe en esta base visual"
    });

    document.getElementById("page-root").innerHTML = [
      '<section class="page">',
      App.ui.placeholder(
        "No se encontró la vista",
        'La ruta "#/' + App.ui.escapeHtml(routeId) + '" no está registrada. Usa la navegación principal para volver a una sección disponible.'
      ),
      '<a class="btn btn-primary" href="#/dashboard">Volver a Dashboard</a>',
      "</section>"
    ].join("");
  }

  function isPublicRoute(routeId) {
    return PUBLIC_ROUTES.includes(routeId);
  }

  function renderRoute() {
    const routeId = getRouteFromHash();
    const page = App.pages && App.pages[routeId];
    const pageRoot = document.getElementById("page-root");
    const isAuthenticated = App.auth && App.auth.estaAutenticado();

    if (routeId === LOGIN_ROUTE && isAuthenticated) {
      navigate(DEFAULT_ROUTE);
      return;
    }

    if (!isPublicRoute(routeId) && !isAuthenticated) {
      navigate(LOGIN_ROUTE);
      return;
    }

    if (!page) {
      renderUnknown(routeId);
      return;
    }

    if (isPublicRoute(routeId)) {
      App.layout.setShellMode("guest");
    } else {
      App.layout.setShellMode("authenticated");
      App.layout.updateActiveNavigation(routeId);
      App.layout.setPageHeader({
        title: page.title,
        subtitle: page.subtitle
      });
    }

    pageRoot.innerHTML = page.render();

    if (typeof page.afterRender === "function") {
      page.afterRender();
    }

    pageRoot.focus({ preventScroll: true });
  }

  function navigate(routeId) {
    const nextHash = "#/" + routeId;

    if (window.location.hash === nextHash) {
      renderRoute();
      return;
    }

    window.location.hash = nextHash;
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
