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

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    reservaciones: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5 3 3 5-5"/>',
    operaciones: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6m-6 4h6m-6 4h4"/>',
    daily: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8m-8 4h8m-8 5 2 2 5-4"/>',
    historial: '<path d="M3 11a9 9 0 1 0 3-6M3 3v6h6m3-2v5l4 2"/>',
    bitacora: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h6"/>',
    usuarios: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-2-4"/>',
    configuracion: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
    collapse: '<path d="m13 7-5 5 5 5m5-10-5 5 5 5"/>'
  };
  const SIDEBAR_KEY = 'sian-kaan.sidebar-mode';
  let sidebarMode = null;
  try { sidebarMode = localStorage.getItem(SIDEBAR_KEY); } catch (_error) { /* Preferencia opcional. */ }

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.dashboard) + '</svg>';
  }

  function updateSidebarMode() {
    const compact = sidebarMode === 'compact' || (sidebarMode !== 'expanded' && window.matchMedia('(max-width: 1100px)').matches);
    document.body.classList.toggle('is-sidebar-collapsed', compact);
    const button = document.getElementById('sidebar-toggle');
    if (button) {
      const label = compact ? 'Expandir menú' : 'Contraer menú';
      button.setAttribute('aria-expanded', String(!compact));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('span').textContent = label;
    }
  }

  window.matchMedia('(max-width: 1100px)').addEventListener('change', updateSidebarMode);

  function getVisibleNavItems() {
    if (!App.auth || !App.auth.estaAutenticado()) {
      return [];
    }

    if (App.auth.esAdministrador()) {
      return NAV_ITEMS;
    }

    return NAV_ITEMS.filter(function (item) {
      return !item.adminOnly && App.auth.puedeAccederPagina(item.id);
    });
  }

  function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    const navItems = getVisibleNavItems();

    sidebar.innerHTML = [
      '<div class="sidebar-brand">',
      '<img class="brand-logo" src="./assets/branding/community-tours-sian-kaan-logo.jpg" width="1296" height="932" alt="Community Tours Sian Ka\'an — Place where the sky is born...">',
      "</div>",
      '<nav id="sidebar-navigation" class="sidebar-nav" aria-label="Secciones">',
      navItems.map(renderNavItem).join(""),
      "</nav>",
      '<div class="sidebar-controls">',
      '<button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="sidebar-navigation">' + icon('collapse') + '<span>Contraer menú</span></button>',
      '</div>'
    ].join("");

    updateSidebarMode();
    document.getElementById('sidebar-toggle').addEventListener('click', function () {
      sidebarMode = document.body.classList.contains('is-sidebar-collapsed') ? 'expanded' : 'compact';
      try { localStorage.setItem(SIDEBAR_KEY, sidebarMode); } catch (_error) { /* La navegacion funciona sin almacenamiento. */ }
      updateSidebarMode();
    });
  }

  function renderNavItem(item) {
    return [
      '<a class="nav-link" href="' + item.route + '" data-route-id="' + item.id + '" aria-label="' + item.label + '" title="' + item.label + '">',
      '<span class="nav-icon" aria-hidden="true">' + icon(item.id) + "</span>",
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
      '<p class="header-institution">Sistema Integrador de Reservaciones</p>',
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
