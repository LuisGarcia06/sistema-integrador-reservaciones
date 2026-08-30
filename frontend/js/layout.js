(function () {
  const App = window.App = window.App || {};

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", route: "#/dashboard", mark: "DB" },
    { id: "reservaciones", label: "Reservaciones", route: "#/reservaciones", mark: "RS" },
    { id: "daily", label: "Daily", route: "#/daily", mark: "DY" },
    { id: "historial", label: "Historial", route: "#/historial", mark: "HS" },
    { id: "bitacora", label: "Bitácora", route: "#/bitacora", mark: "BT" },
    { id: "usuarios", label: "Usuarios", route: "#/usuarios", mark: "US" },
    { id: "configuracion", label: "Configuración", route: "#/configuracion", mark: "CF" }
  ];

  function renderSidebar() {
    const sidebar = document.getElementById("sidebar");

    sidebar.innerHTML = [
      '<div class="sidebar-brand">',
      '<div class="brand-mark">SK</div>',
      '<div class="brand-copy">',
      '<p class="brand-name">Sian Ka\'an</p>',
      '<p class="brand-context">Reservaciones</p>',
      "</div>",
      "</div>",
      '<nav class="sidebar-nav" aria-label="Secciones">',
      NAV_ITEMS.map(renderNavItem).join(""),
      "</nav>",
      '<p class="sidebar-footer">Base visual local</p>'
    ].join("");
  }

  function renderNavItem(item) {
    return [
      '<a class="nav-link" href="' + item.route + '" data-route-id="' + item.id + '">',
      '<span class="nav-icon" aria-hidden="true">' + item.mark + "</span>",
      '<span class="nav-label">' + item.label + "</span>",
      "</a>"
    ].join("");
  }

  function setPageHeader(config) {
    const header = document.getElementById("app-header");
    const title = config && config.title ? config.title : "Sistema Integrador";
    const subtitle = config && config.subtitle ? config.subtitle : "";

    header.innerHTML = [
      '<div class="header-copy">',
      '<h1 class="header-title">' + App.ui.escapeHtml(title) + "</h1>",
      subtitle ? '<p class="header-subtitle">' + App.ui.escapeHtml(subtitle) + "</p>" : "",
      "</div>",
      '<div class="header-actions">',
      '<button class="btn btn-ghost" type="button" disabled>Acciones</button>',
      '<div class="user-chip" aria-label="Área futura de usuario">',
      '<span class="user-avatar" aria-hidden="true">US</span>',
      "<span>Usuario</span>",
      "</div>",
      "</div>"
    ].join("");
  }

  function updateActiveNavigation(routeId) {
    document.querySelectorAll(".nav-link").forEach(function (link) {
      const isActive = link.dataset.routeId === routeId;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function renderLayout() {
    renderSidebar();
    setPageHeader({
      title: "Dashboard",
      subtitle: "Base visual del sistema"
    });
  }

  App.layout = {
    NAV_ITEMS: NAV_ITEMS,
    renderLayout: renderLayout,
    setPageHeader: setPageHeader,
    updateActiveNavigation: updateActiveNavigation
  };
})();
