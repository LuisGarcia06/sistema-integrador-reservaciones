(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "--";
  const TURNO_SIN_CLASIFICAR = "Sin clasificar";
  const MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ];

  let requestId = 0;
  let currentFecha = "";

  function escapeHtml(value) {
    return App.ui.escapeHtml(value === null || value === undefined || value === "" ? EMPTY_VALUE : value);
  }

  function getLocalDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
  }

  function formatDate(value) {
    if (!value || typeof value !== "string") {
      return EMPTY_VALUE;
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) {
      return value;
    }

    return [match[3], match[2], match[1]].join("/");
  }

  function formatReadableDate(value) {
    if (!value || typeof value !== "string") {
      return EMPTY_VALUE;
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return value;
    }

    const monthIndex = Number(match[2]) - 1;
    const month = MONTHS[monthIndex] || match[2];

    return Number(match[3]) + " de " + month + " de " + match[1];
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
  }

  function metricValue(value) {
    return String(getNumber(value));
  }

  function getTurnoLabel(value) {
    return value ? String(value) : TURNO_SIN_CLASIFICAR;
  }

  function getVendidoPor(reservacion) {
    const vendedor = reservacion && reservacion.vendedor !== null && reservacion.vendedor !== undefined
      ? String(reservacion.vendedor).trim()
      : "";
    const plataforma = reservacion && reservacion.plataforma !== null && reservacion.plataforma !== undefined
      ? String(reservacion.plataforma).trim()
      : "";

    return vendedor || plataforma || EMPTY_VALUE;
  }

  function normalizeEstado(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getEstadoBadgeClass(estado) {
    if (normalizeEstado(estado) === "cancelada") {
      return "badge badge-danger";
    }

    if (!estado) {
      return "badge badge-neutral";
    }

    return "badge";
  }

  function getBackendMessage(error, fallback) {
    if (error && error.isNetworkError) {
      return "No hay conexión con el backend. Revisa que el servidor esté activo.";
    }

    if (error && error.data) {
      if (Array.isArray(error.data.errores) && error.data.errores.length > 0) {
        return error.data.errores.join(" ");
      }

      if (error.data.mensaje) {
        return error.data.mensaje;
      }
    }

    if (error && error.status === 403) {
      return "No tienes permisos para consultar el Dashboard.";
    }

    return fallback || "No fue posible cargar el Dashboard.";
  }

  function renderLoading() {
    return [
      '<section class="card dashboard-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      "<div>",
      "<h2>Cargando Dashboard</h2>",
      '<p class="card-text">Consultando resumen, reservaciones recientes y salidas de hoy.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderError(message) {
    return [
      '<section class="card dashboard-state-panel">',
      "<h2>No se pudo cargar el Dashboard</h2>",
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      '<div class="dashboard-actions">',
      '<button class="btn btn-primary" id="dashboard-retry" type="button">Reintentar</button>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderTodayHeader(data) {
    return [
      '<section class="dashboard-today">',
      "<div>",
      '<p class="field-label">Resumen de hoy</p>',
      "<h2>" + App.ui.escapeHtml(formatReadableDate(data && data.fecha ? data.fecha : currentFecha)) + "</h2>",
      "</div>",
      '<span class="badge badge-neutral">Datos reales</span>',
      "</section>"
    ].join("");
  }

  function renderMetric(label, value) {
    return [
      '<article class="card metric-card dashboard-metric-card">',
      '<p class="metric-value">' + App.ui.escapeHtml(metricValue(value)) + "</p>",
      '<p class="metric-label">' + App.ui.escapeHtml(label) + "</p>",
      "</article>"
    ].join("");
  }

  function renderMetrics(metricas) {
    const data = metricas || {};

    return [
      '<div class="metric-grid dashboard-metric-grid">',
      renderMetric("Reservaciones", data.reservaciones_vigentes),
      renderMetric("PAX", data.pax_vigentes),
      renderMetric("Grupos preparados", data.grupos_preparados),
      renderMetric("Grupos pendientes", data.grupos_pendientes),
      "</div>"
    ].join("");
  }

  function renderAlerts(alertas) {
    const data = alertas || {};
    const sinTurno = getNumber(data.reservaciones_sin_turno);
    const exceso = getNumber(data.salidas_con_exceso_capacidad);
    const alerts = [];

    if (sinTurno > 0) {
      alerts.push([
        '<article class="dashboard-alert">',
        "<div>",
        "<strong>Hay " + App.ui.escapeHtml(sinTurno) + " reservaciones sin clasificar por turno.</strong>",
        '<p class="card-text">No participan en las salidas sugeridas hasta asignar Mañana o Tarde.</p>',
        "</div>",
        '<a class="btn btn-ghost" href="#/reservaciones">Ver reservaciones</a>',
        "</article>"
      ].join(""));
    }

    if (exceso > 0) {
      alerts.push([
        '<article class="dashboard-alert dashboard-alert-danger">',
        "<div>",
        "<strong>Hay salidas que superan la capacidad operativa de 24 PAX.</strong>",
        '<p class="card-text">Revisa Operaciones para preparar los grupos necesarios.</p>',
        "</div>",
        '<a class="btn btn-ghost" href="#/operaciones">Ver operaciones</a>',
        "</article>"
      ].join(""));
    }

    return alerts.length
      ? '<section class="dashboard-alerts">' + alerts.join("") + "</section>"
      : "";
  }

  function renderRecentRow(reservacion) {
    const estado = reservacion && reservacion.estado ? String(reservacion.estado) : "";

    return [
      "<tr>",
      '<td><strong class="dashboard-primary-text">' + escapeHtml(reservacion && reservacion.codigo) + "</strong></td>",
      "<td>" + escapeHtml(formatDate(reservacion && reservacion.fecha)) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.nombre_cliente) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.tour) + "</td>",
      '<td><span class="' + (reservacion && reservacion.turno ? "badge" : "badge badge-neutral") + '">' + escapeHtml(getTurnoLabel(reservacion && reservacion.turno)) + "</span></td>",
      '<td class="dashboard-number-cell">' + escapeHtml(reservacion && reservacion.pax) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      '<td><span class="' + getEstadoBadgeClass(estado) + '">' + escapeHtml(estado) + "</span></td>",
      "</tr>"
    ].join("");
  }

  function renderRecentReservations(reservaciones) {
    const data = getArray(reservaciones);
    const rows = data.map(renderRecentRow).join("");

    return [
      '<section class="card stack dashboard-section">',
      '<div class="card-header">',
      "<div>",
      "<h2>Reservaciones recientes</h2>",
      '<p class="card-text">Últimos registros capturados en el sistema.</p>',
      "</div>",
      '<a class="btn btn-ghost" href="#/reservaciones">Ver reservaciones</a>',
      "</div>",
      rows
        ? [
            '<div class="table-container dashboard-table-container">',
            '<table class="data-table dashboard-recent-table">',
            "<thead><tr>",
            "<th>Código</th>",
            "<th>Fecha</th>",
            "<th>Cliente</th>",
            "<th>Tour</th>",
            "<th>Turno</th>",
            "<th>PAX</th>",
            "<th>Vendido por</th>",
            "<th>Estado</th>",
            "</tr></thead>",
            "<tbody>" + rows + "</tbody>",
            "</table>",
            "</div>"
          ].join("")
        : App.ui.emptyState("No hay reservaciones registradas", "Cuando se capturen reservaciones aparecerán aquí."),
      "</section>"
    ].join("");
  }

  function renderSalida(salida) {
    const gruposNecesarios = getNumber(salida && salida.grupos_necesarios);
    const gruposPreparados = getNumber(salida && salida.grupos_preparados);
    const excede = Boolean(salida && salida.excede_capacidad);

    return [
      '<article class="dashboard-salida">',
      '<div class="dashboard-salida-main">',
      "<h3>" + escapeHtml(salida && salida.tour) + "</h3>",
      '<div class="daily-badges">',
      '<span class="badge badge-neutral">' + escapeHtml(salida && salida.turno) + "</span>",
      excede ? '<span class="badge badge-danger">Exceso +' + App.ui.escapeHtml(getNumber(salida && salida.pax_excedente)) + " PAX</span>" : "",
      "</div>",
      "</div>",
      '<div class="dashboard-salida-meta">',
      '<span><strong>' + App.ui.escapeHtml(getNumber(salida && salida.pax_total)) + '</strong><small>PAX</small></span>',
      '<span><strong>' + App.ui.escapeHtml(gruposPreparados + " de " + gruposNecesarios) + '</strong><small>grupos preparados</small></span>',
      '<span><strong>' + App.ui.escapeHtml(getNumber(salida && salida.total_reservaciones)) + '</strong><small>reservaciones</small></span>',
      "</div>",
      "</article>"
    ].join("");
  }

  function renderSalidas(salidas) {
    const data = getArray(salidas);

    return [
      '<section class="card stack dashboard-section">',
      '<div class="card-header">',
      "<div>",
      "<h2>Salidas de hoy</h2>",
      '<p class="card-text">Resumen por tour y turno basado en reservaciones vigentes.</p>',
      "</div>",
      '<a class="btn btn-ghost" href="#/operaciones">Ver operaciones</a>',
      "</div>",
      data.length
        ? '<div class="dashboard-salidas-list">' + data.map(renderSalida).join("") + "</div>"
        : App.ui.emptyState("No hay salidas detectadas para hoy", "No hay reservaciones vigentes con turno para esta fecha."),
      "</section>"
    ].join("");
  }

  function renderQuickActions() {
    const actions = [
      '<a class="btn btn-primary" href="#/reservaciones">Ver reservaciones</a>',
      '<a class="btn" href="#/operaciones">Ver operaciones</a>',
      '<a class="btn" href="#/daily">Ver Daily</a>'
    ];

    return [
      '<aside class="card stack dashboard-actions-card">',
      '<div class="card-header">',
      "<div>",
      "<h2>Acciones rápidas</h2>",
      '<p class="card-text">' + App.ui.escapeHtml(App.auth && App.auth.esAdministrador() ? "Accesos operativos principales." : "Accesos de consulta disponibles.") + "</p>",
      "</div>",
      "</div>",
      '<div class="dashboard-actions">',
      actions.join(""),
      "</div>",
      "</aside>"
    ].join("");
  }

  function renderEmptyToday(metricas) {
    return getNumber(metricas && metricas.reservaciones_vigentes) === 0
      ? App.ui.emptyState("No hay reservaciones vigentes para hoy", "Las reservaciones recientes siguen mostrando el último movimiento registrado.")
      : "";
  }

  function renderDashboard(data) {
    return [
      renderTodayHeader(data),
      renderMetrics(data && data.metricas),
      renderAlerts(data && data.alertas),
      renderEmptyToday(data && data.metricas),
      '<div class="dashboard-grid">',
      '<div class="stack">',
      renderRecentReservations(data && data.reservaciones_recientes),
      renderSalidas(data && data.salidas_hoy),
      "</div>",
      renderQuickActions(),
      "</div>"
    ].join("");
  }

  function bindRetry() {
    const retry = document.getElementById("dashboard-retry");

    if (retry) {
      retry.addEventListener("click", function () {
        loadDashboard(currentFecha || getLocalDateValue());
      });
    }
  }

  async function loadDashboard(fecha) {
    const content = document.getElementById("dashboard-content");

    if (!content) {
      return;
    }

    const activeRequestId = requestId + 1;
    requestId = activeRequestId;
    currentFecha = fecha;
    content.setAttribute("aria-busy", "true");
    content.innerHTML = renderLoading();

    try {
      const response = await App.api.apiFetch("/api/dashboard/resumen?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== requestId || window.location.hash !== "#/dashboard") {
        return;
      }

      content.innerHTML = renderDashboard(response || { fecha: fecha });
    } catch (error) {
      if (activeRequestId !== requestId || window.location.hash !== "#/dashboard") {
        return;
      }

      content.innerHTML = renderError(getBackendMessage(error, "No fue posible cargar el Dashboard."));
      bindRetry();
    } finally {
      if (activeRequestId === requestId && window.location.hash === "#/dashboard") {
        content.setAttribute("aria-busy", "false");
      }
    }
  }

  App.pages.dashboard = {
    title: "Dashboard",
    subtitle: "Resumen operativo de hoy",
    render: function () {
      return [
        '<section class="page dashboard-page">',
        '<section id="dashboard-content" class="dashboard-content" aria-live="polite">',
        renderLoading(),
        "</section>",
        "</section>"
      ].join("");
    },
    afterRender: function () {
      requestId += 1;
      currentFecha = getLocalDateValue();
      loadDashboard(currentFecha);
    }
  };
})();
