(function () {
  const App = window.App = window.App || {};

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", route: "#/dashboard", mark: "DB" },
    { id: "reservaciones", label: "Reservaciones", route: "#/reservaciones", mark: "RS" },
    { id: "operaciones", label: "Operaciones", route: "#/operaciones", mark: "OP" },
    { id: "daily", label: "Daily", route: "#/daily", mark: "DY" },
    { id: "historial", label: "Historial", route: "#/historial", mark: "HS" },
    { id: "bitacora", label: "Bitácora", route: "#/bitacora", mark: "BT", adminOnly: true },
    { id: "usuarios", label: "Usuarios", route: "#/usuarios", mark: "US", adminOnly: true },
    { id: "configuracion", label: "Configuración", route: "#/configuracion", mark: "CF" }
  ];

  function getVisibleNavItems() {
    if (!App.auth || !App.auth.estaAutenticado()) {
      return [];
    }

    if (App.auth.esAdministrador()) {
      return NAV_ITEMS;
    }

    return NAV_ITEMS.filter(function (item) {
      return !item.adminOnly;
    });
  }

  function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    const navItems = getVisibleNavItems();

    sidebar.innerHTML = [
      '<div class="sidebar-brand">',
      '<div class="brand-mark">SK</div>',
      '<div class="brand-copy">',
      '<p class="brand-name">Sian Ka\'an</p>',
      '<p class="brand-context">Reservaciones</p>',
      "</div>",
      "</div>",
      '<nav class="sidebar-nav" aria-label="Secciones">',
      navItems.map(renderNavItem).join(""),
      "</nav>",
      '<button class="sidebar-logout" type="button" data-logout>Cerrar sesión</button>'
    ].join("");

    const logoutButton = sidebar.querySelector("[data-logout]");

    if (logoutButton) {
      logoutButton.addEventListener("click", function () {
        App.auth.cerrarSesion();
      });
    }
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
    const usuario = App.auth ? App.auth.obtenerUsuario() : null;
    const nombre = usuario && usuario.nombre ? usuario.nombre : "Usuario";
    const rol = usuario && usuario.rol ? usuario.rol : "";
    const iniciales = nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (parte) {
        return parte.charAt(0).toUpperCase();
      })
      .join("") || "US";

    header.innerHTML = [
      '<div class="header-copy">',
      '<h1 class="header-title">' + App.ui.escapeHtml(title) + "</h1>",
      subtitle ? '<p class="header-subtitle">' + App.ui.escapeHtml(subtitle) + "</p>" : "",
      "</div>",
      '<div class="header-actions">',
      '<button class="btn btn-ghost" type="button" data-logout>Cerrar sesión</button>',
      '<div class="user-chip" aria-label="Usuario autenticado">',
      '<span class="user-avatar" aria-hidden="true">' + App.ui.escapeHtml(iniciales) + "</span>",
      '<span><strong>' + App.ui.escapeHtml(nombre) + "</strong>",
      rol ? '<small>' + App.ui.escapeHtml(rol) + "</small>" : "",
      "</span>",
      "</div>",
      "</div>"
    ].join("");

    const logoutButton = header.querySelector("[data-logout]");

    if (logoutButton) {
      logoutButton.addEventListener("click", function () {
        App.auth.cerrarSesion();
      });
    }
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
    const mode = App.auth && App.auth.estaAutenticado() ? "authenticated" : "guest";
    setShellMode(mode);

    if (mode === "authenticated") {
      setPageHeader({
        title: "Dashboard",
        subtitle: "Base visual del sistema"
      });
    }
  }

  function setShellMode(mode) {
    const isAuthenticated = mode === "authenticated";
    const sidebar = document.getElementById("sidebar");
    const header = document.getElementById("app-header");

    document.body.classList.toggle("is-login-page", !isAuthenticated);
    sidebar.hidden = !isAuthenticated;
    header.hidden = !isAuthenticated;

    if (isAuthenticated) {
      renderSidebar();
    } else {
      sidebar.innerHTML = "";
      header.innerHTML = "";
      updateActiveNavigation("");
    }
  }

  App.layout = {
    NAV_ITEMS: NAV_ITEMS,
    getVisibleNavItems: getVisibleNavItems,
    renderLayout: renderLayout,
    setPageHeader: setPageHeader,
    setShellMode: setShellMode,
    updateActiveNavigation: updateActiveNavigation
  };
})();
