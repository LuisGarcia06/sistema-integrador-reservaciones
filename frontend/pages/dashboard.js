(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "--";
  const TURNO_SIN_CLASIFICAR = "Sin clasificar";
  const INTEGRATION_REFRESH_MS = 60000;
  const MANUAL_NEW_BOOKING_FIELDS = ["id_tour", "turno", "pickup_time"];
  const TURNOS_VALIDOS = ["Mañana", "Tarde"];
  const EVENT_TYPE_LABELS = {
    new_booking: "Nueva reservación",
    modification: "Modificacion",
    cancellation: "Cancelacion"
  };
  const REVIEW_STATUS_LABELS = {
    pending_review: "Pendiente de revision",
    approved: "Aprobado",
    dismissed: "Descartado"
  };
  const APPLICATION_STATUS_LABELS = {
    not_applied: "No registrado",
    applied: "Registrado"
  };
  const FIELD_LABELS = {
    fecha: "Fecha",
    date: "Fecha",
    pax: "PAX",
    pickup_place: "Lugar de pickup",
    pickup_time: "Hora de pickup",
    id_tour: "Tour",
    turno: "Turno",
    idioma: "Idioma",
    tour_language: "Idioma",
    customer_name: "Cliente",
    customer_phone: "Telefono",
    price: "Precio",
    id_pais: "Pais",
    motivo_cancelacion: "Motivo de cancelación"
  };
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
  const integrationState = {
    events: [],
    loading: false,
    error: "",
    message: "",
    timer: null,
    hashListenerBound: false,
    modalEvent: null,
    modalDiff: null,
    modalLoading: false,
    modalError: "",
    actionLoading: false,
    tours: [],
    toursLoaded: false,
    toursLoading: false,
    toursError: ""
  };

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

  function formatDateTime(value) {
    if (!value || typeof value !== "string") {
      return EMPTY_VALUE;
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);

    if (!match) {
      return value;
    }

    return [match[3], match[2], match[1]].join("/") + " " + match[4] + ":" + match[5];
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

  function getObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

  function getFieldLabel(field) {
    return FIELD_LABELS[field] || field || "Dato";
  }

  function getIntegrationErrorMessage(error, fallback) {
    const data = error && error.data ? error.data : null;

    if (error && error.isNetworkError) {
      return "No hay conexion con el backend. Revisa que el servidor este activo.";
    }

    if (error && error.status === 403) {
      return "No tienes permisos para revisar o aplicar eventos de integración.";
    }

    if (data && Array.isArray(data.missing_fields) && data.missing_fields.length > 0) {
      if (data.missing_fields.length === 1 && data.missing_fields[0] === "pickup_time") {
        return "Falta asignar la hora de pickup.";
      }

      return "Faltan datos obligatorios: " + data.missing_fields.map(getFieldLabel).join(", ") + ".";
    }

    if (data && Array.isArray(data.errores) && data.errores.length > 0) {
      return data.errores.map(function (item) {
        return typeof item === "string" ? item : (item && item.mensaje ? item.mensaje : JSON.stringify(item));
      }).join(" ");
    }

    if (data && data.mensaje) {
      return data.mensaje;
    }

    if (error && error.status === 409) {
      return "El evento ya cambio de estado. Actualiza la lista y vuelve a revisar.";
    }

    if (error && error.status === 422) {
      return "El evento requiere informacion adicional antes de registrarse.";
    }

    if (error && error.status >= 500) {
      return "El backend no pudo completar la operacion. Intenta nuevamente.";
    }

    return fallback || "No fue posible completar la operacion.";
  }

  function getIntegrationId(evento) {
    return evento && (evento.id_evento_integracion || evento.id_evento || evento.id);
  }

  function getIntegrationList(response) {
    if (!response) {
      return [];
    }

    return getArray(response.data || response.datos || response.eventos);
  }

  function getIntegrationDetail(response) {
    return response && (response.datos || response.data || response.evento || response);
  }

  function getCatalogList(response) {
    return getArray(response && (response.datos || response.data || response.items || response));
  }

  function getTourId(tour) {
    return tour && (tour.id_tour || tour.id || tour.idTour);
  }

  function getTourName(tour) {
    return tour && (tour.nombre || tour.name || tour.tour_nombre || tour.tour);
  }

  function isActiveTour(tour) {
    return !tour || tour.activo !== false;
  }

  function getSelectableTours() {
    return getArray(integrationState.tours).filter(function (tour) {
      return getTourId(tour) && getTourName(tour) && isActiveTour(tour);
    });
  }

  function getEventTypeLabel(value) {
    return EVENT_TYPE_LABELS[value] || value || EMPTY_VALUE;
  }

  function getReviewStatusLabel(value) {
    return REVIEW_STATUS_LABELS[value] || value || EMPTY_VALUE;
  }

  function getApplicationStatusLabel(value) {
    return APPLICATION_STATUS_LABELS[value] || value || EMPTY_VALUE;
  }

  function getReviewBadgeClass(value) {
    if (value === "pending_review") {
      return "badge badge-warning";
    }

    if (value === "dismissed") {
      return "badge badge-danger";
    }

    return "badge";
  }

  function getApplicationBadgeClass(value) {
    return value === "not_applied" ? "badge badge-warning" : "badge badge-neutral";
  }

  function isDashboardActive() {
    return window.location.hash === "#/dashboard";
  }

  function resetIntegrationState() {
    integrationState.events = [];
    integrationState.loading = false;
    integrationState.error = "";
    integrationState.message = "";
    integrationState.modalEvent = null;
    integrationState.modalDiff = null;
    integrationState.modalLoading = false;
    integrationState.modalError = "";
    integrationState.actionLoading = false;
  }

  function handleDashboardHashChange() {
    if (!isDashboardActive()) {
      stopIntegrationRefresh();
      closeIntegrationDialog();
    }
  }

  function startIntegrationRefresh() {
    stopIntegrationRefresh();

    integrationState.timer = window.setInterval(function () {
      if (!isDashboardActive()) {
        stopIntegrationRefresh();
        return;
      }

      loadIntegrationPendientes({ silent: true });
    }, INTEGRATION_REFRESH_MS);

    if (!integrationState.hashListenerBound) {
      window.addEventListener("hashchange", handleDashboardHashChange);
      integrationState.hashListenerBound = true;
    }
  }

  function stopIntegrationRefresh() {
    if (integrationState.timer) {
      window.clearInterval(integrationState.timer);
      integrationState.timer = null;
    }
  }

  function getNewBookingPreview(evento) {
    return getObject(evento && evento.application_preview);
  }

  function getNewBookingMissingFields(evento) {
    const preview = getNewBookingPreview(evento);

    return getArray(preview.missingFields || preview.missing_fields);
  }

  function isManualNewBookingField(field) {
    return MANUAL_NEW_BOOKING_FIELDS.indexOf(field) !== -1;
  }

  function getNonManualNewBookingMissingFields(evento) {
    return getNewBookingMissingFields(evento).filter(function (field) {
      return !isManualNewBookingField(field);
    });
  }

  function needsManualField(evento, field) {
    return getNewBookingMissingFields(evento).indexOf(field) !== -1;
  }

  function getPreviewReservationData(evento) {
    return getObject(getNewBookingPreview(evento).reservationData);
  }

  function getPreviewReferences(evento) {
    return getObject(getNewBookingPreview(evento).referencias);
  }

  function getOperationalListPath(reviewStatus) {
    return "/api/eventos-integracion?review_status=" + encodeURIComponent(reviewStatus) + "&limit=50&operational_only=true";
  }

  function buildPendingIntegrationEvents(pendingResponse, approvedResponse) {
    const pending = getIntegrationList(pendingResponse);
    const approved = getIntegrationList(approvedResponse).filter(function (evento) {
      return evento && evento.application_status === "not_applied";
    });
    const byId = {};

    pending.concat(approved).forEach(function (evento) {
      const id = getIntegrationId(evento);

      if (id !== null && id !== undefined) {
        byId[String(id)] = evento;
      }
    });

    return Object.keys(byId).map(function (key) {
      return byId[key];
    }).sort(function (a, b) {
      const left = Date.parse(a.source_received_at || a.received_at || a.created_at || "") || 0;
      const right = Date.parse(b.source_received_at || b.received_at || b.created_at || "") || 0;

      return right - left;
    });
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

  function renderIntegrationEvent(evento) {
    const id = getIntegrationId(evento);
    const receivedAt = evento && (evento.source_received_at || evento.received_at || evento.created_at);

    return [
      '<article class="dashboard-integration-item">',
      '<div class="dashboard-integration-main">',
      '<strong class="dashboard-primary-text">' + escapeHtml(evento && evento.external_booking_id) + "</strong>",
      '<div class="dashboard-integration-meta">',
      '<span>' + escapeHtml(evento && evento.provider) + "</span>",
      '<span>' + escapeHtml(getEventTypeLabel(evento && evento.event_type)) + "</span>",
      '<span>' + escapeHtml(formatDateTime(receivedAt)) + "</span>",
      "</div>",
      '<div class="daily-badges">',
      '<span class="' + getReviewBadgeClass(evento && evento.review_status) + '">' + escapeHtml(getReviewStatusLabel(evento && evento.review_status)) + "</span>",
      '<span class="' + getApplicationBadgeClass(evento && evento.application_status) + '">' + escapeHtml(getApplicationStatusLabel(evento && evento.application_status)) + "</span>",
      "</div>",
      "</div>",
      '<div class="dashboard-integration-actions">',
      '<button class="btn btn-ghost" type="button" data-integration-action="review" data-integration-id="' + App.ui.escapeHtml(id) + '">Revisar</button>',
      "</div>",
      "</article>"
    ].join("");
  }

  function renderIntegrationPanel() {
    const count = integrationState.events.length;
    let body = "";

    if (integrationState.loading && count === 0) {
      body = [
        '<div class="dashboard-integration-loading">',
        '<span class="daily-spinner" aria-hidden="true"></span>',
        '<p class="card-text">Buscando eventos pendientes.</p>',
        "</div>"
      ].join("");
    } else if (integrationState.error) {
      body = [
        '<div class="dashboard-integration-state">',
        '<p class="form-message is-error">' + App.ui.escapeHtml(integrationState.error) + "</p>",
        '<button class="btn btn-ghost" type="button" id="dashboard-integration-retry">Reintentar</button>',
        "</div>"
      ].join("");
    } else if (count === 0) {
      body = App.ui.emptyState("No hay pendientes de integración", "Los eventos por revisar o registrar aparecerán aquí.");
    } else {
      body = '<div class="dashboard-integration-list">' + integrationState.events.map(renderIntegrationEvent).join("") + "</div>";
    }

    return [
      '<section class="card stack dashboard-section dashboard-integration-card" id="dashboard-integration-section">',
      '<div class="card-header dashboard-integration-header">',
      "<div>",
      "<h2>Pendientes de integración</h2>",
      '<p class="card-text">Eventos externos que requieren revision o registro.</p>',
      "</div>",
      '<span class="badge badge-neutral dashboard-integration-count">' + App.ui.escapeHtml(count) + "</span>",
      "</div>",
      '<div class="form-message is-info dashboard-integration-message">' + App.ui.escapeHtml(integrationState.message) + "</div>",
      body,
      "</section>"
    ].join("");
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
      renderIntegrationPanel(),
      renderRecentReservations(data && data.reservaciones_recientes),
      renderSalidas(data && data.salidas_hoy),
      "</div>",
      renderQuickActions(),
      "</div>"
    ].join("");
  }

  function renderDetailItem(label, value) {
    return [
      '<div class="dashboard-integration-detail-item">',
      "<span>" + App.ui.escapeHtml(label) + "</span>",
      "<strong>" + escapeHtml(value) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderCommonIntegrationDetails(evento) {
    const receivedAt = evento && (evento.source_received_at || evento.received_at || evento.created_at);

    return [
      '<div class="dashboard-integration-detail-grid">',
      renderDetailItem("Proveedor", evento && evento.provider),
      renderDetailItem("Booking externo", evento && evento.external_booking_id),
      renderDetailItem("Tipo", getEventTypeLabel(evento && evento.event_type)),
      renderDetailItem("Recibido", formatDateTime(receivedAt)),
      renderDetailItem("Revisión", getReviewStatusLabel(evento && evento.review_status)),
      renderDetailItem("Registro", getApplicationStatusLabel(evento && evento.application_status)),
      "</div>"
    ].join("");
  }

  function getDisplayValueFromPreview(evento, fieldName) {
    const normalized = getObject(evento && evento.normalized_data);
    const reservationData = getPreviewReservationData(evento);
    const references = getPreviewReferences(evento);

    if (fieldName === "date") {
      return reservationData.fecha || normalized.date;
    }

    if (fieldName === "turno") {
      return reservationData.turno || normalized.turno;
    }

    if (fieldName === "id_tour") {
      const tour = getObject(references.tour);
      return tour.nombre || reservationData.id_tour || normalized.id_tour;
    }

    if (fieldName === "id_pais") {
      const pais = getObject(references.pais);
      return pais.nombre || reservationData.id_pais || normalized.id_pais;
    }

    if (fieldName === "price") {
      return reservationData.precio_total || normalized.price;
    }

    return reservationData[fieldName] || normalized[fieldName];
  }

  function renderNewBookingPreviewMessage(evento) {
    const missingFields = getNewBookingMissingFields(evento);
    const nonManualMissingFields = getNonManualNewBookingMissingFields(evento);

    if (missingFields.length === 0) {
      return "";
    }

    if (nonManualMissingFields.length === 0 && missingFields.indexOf("pickup_time") !== -1 && missingFields.length === 1) {
      return '<p class="form-message is-info">Falta asignar la hora de pickup.</p>';
    }

    if (nonManualMissingFields.length === 0) {
      return '<p class="form-message is-info">Completa los datos operativos requeridos para registrar la reservación.</p>';
    }

    return '<p class="form-message is-error">Faltan datos obligatorios: ' + nonManualMissingFields.map(getFieldLabel).join(", ") + ".</p>";
  }

  function renderNormalizedData(evento) {
    const fields = [
      ["customer_name", "Cliente"],
      ["customer_phone", "Telefono"],
      ["date", "Fecha"],
      ["pickup_time", "Hora de pickup"],
      ["pickup_place", "Lugar de pickup"],
      ["pax", "PAX"],
      ["tour_language", "Idioma"],
      ["turno", "Turno"],
      ["id_tour", "Tour interno"],
      ["id_pais", "Pais interno"],
      ["price", "Precio"]
    ];

    return [
      renderNewBookingPreviewMessage(evento),
      '<div class="dashboard-integration-detail-grid">',
      fields.map(function (field) {
        return renderDetailItem(field[1], getDisplayValueFromPreview(evento, field[0]));
      }).join(""),
      "</div>"
    ].join("");
  }

  function hasPickupTime(evento) {
    const normalized = getObject(evento && evento.normalized_data);
    return Boolean(String(normalized.pickup_time || "").trim());
  }

  function renderTourSelect(evento) {
    const needsTour = needsManualField(evento, "id_tour");
    const tours = getSelectableTours();

    if (!needsTour) {
      return "";
    }

    if (integrationState.toursError) {
      return '<p class="form-message is-error dashboard-integration-full">' + App.ui.escapeHtml(integrationState.toursError) + "</p>";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Tour interno *</span>',
      '<select id="integration-tour-id" required' + (integrationState.toursLoading ? " disabled" : "") + ">",
      '<option value="">' + (integrationState.toursLoading ? "Cargando tours..." : "Selecciona un tour") + "</option>",
      tours.map(function (tour) {
        return '<option value="' + App.ui.escapeHtml(getTourId(tour)) + '">' + App.ui.escapeHtml(getTourName(tour)) + "</option>";
      }).join(""),
      "</select>",
      "</label>"
    ].join("");
  }

  function renderTurnoSelect(evento) {
    const needsTurno = needsManualField(evento, "turno");

    if (!needsTurno) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Turno *</span>',
      '<select id="integration-turno" required>',
      '<option value="">Selecciona turno</option>',
      TURNOS_VALIDOS.map(function (turno) {
        return '<option value="' + App.ui.escapeHtml(turno) + '">' + App.ui.escapeHtml(turno) + "</option>";
      }).join(""),
      "</select>",
      "</label>"
    ].join("");
  }

  function getManualTourValue() {
    const input = document.getElementById("integration-tour-id");

    return input ? String(input.value || "").trim() : "";
  }

  function getManualTurnoValue() {
    const input = document.getElementById("integration-turno");

    return input ? String(input.value || "").trim() : "";
  }

  function hasBlockingNewBookingMissingFields(evento) {
    return getNonManualNewBookingMissingFields(evento).length > 0;
  }

  function isNewBookingReadyForApply(evento) {
    if (!evento || evento.event_type !== "new_booking") {
      return false;
    }

    if (integrationState.actionLoading || integrationState.toursLoading || hasBlockingNewBookingMissingFields(evento)) {
      return false;
    }

    if (needsManualField(evento, "id_tour") && !getManualTourValue()) {
      return false;
    }

    if (needsManualField(evento, "turno") && TURNOS_VALIDOS.indexOf(getManualTurnoValue()) === -1) {
      return false;
    }

    if (!hasPickupTime(evento) && !getPickupTimeInputValue()) {
      return false;
    }

    return true;
  }

  function updateNewBookingApplyButtonState() {
    const button = document.querySelector('[data-dialog-action="apply-new-booking"]');

    if (!button || !integrationState.modalEvent || integrationState.actionLoading) {
      return;
    }

    button.disabled = !isNewBookingReadyForApply(integrationState.modalEvent);
  }

  function renderNewBookingReview(evento) {
    const needsPickupTime = !hasPickupTime(evento);

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Información normalizada</h3>",
      renderNormalizedData(evento),
      renderTourSelect(evento),
      renderTurnoSelect(evento),
      needsPickupTime
        ? [
            '<label class="field dashboard-integration-full">',
            '<span>Hora de pickup</span>',
            '<input id="integration-pickup-time" type="time" required>',
            '<small class="card-text">La hora de pickup es asignada por Community Tours.</small>',
            "</label>"
          ].join("")
        : "",
      "</section>"
    ].join("");
  }

  function normalizeDiffRows(diff) {
    const data = getObject(diff);
    const raw = data.diff || data.cambios || [];

    if (Array.isArray(raw)) {
      return raw.filter(function (row) {
        return row && row.cambio === true;
      });
    }

    return Object.keys(getObject(raw)).map(function (field) {
      const row = getObject(raw[field]);

      return {
        campo: field,
        actual: row.actual || row.valor_actual || row.from || row.anterior,
        nuevo: row.nuevo || row.valor_nuevo || row.to || row.propuesto,
        cambio: row.cambio !== false
      };
    }).filter(function (row) {
      return row.cambio;
    });
  }

  function getDiffValue(row, keys) {
    let index;

    for (index = 0; index < keys.length; index += 1) {
      if (row && row[keys[index]] !== undefined && row[keys[index]] !== null) {
        return row[keys[index]];
      }
    }

    return EMPTY_VALUE;
  }

  function renderModificationDiff(evento, diff) {
    const preview = getObject(diff);
    const rows = normalizeDiffRows(preview);
    const warnings = getArray(preview.warnings);
    const notApplicable = preview.aplicable === false;
    const requiereValidacion = preview.requiere_validacion_operativa === true;

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Cambios detectados</h3>",
      notApplicable
        ? '<p class="form-message is-error">' + App.ui.escapeHtml(preview.reason || "La modificación no puede aplicarse automáticamente.") + "</p>"
        : "",
      requiereValidacion
        ? '<p class="dashboard-integration-warning">La modificación requiere validación operativa antes de aplicarse.</p>'
        : "",
      warnings.length
        ? '<div class="dashboard-integration-warning">' + warnings.map(function (warning) {
            return "<p>" + App.ui.escapeHtml(warning) + "</p>";
          }).join("") + "</div>"
        : "",
      rows.length
        ? [
            '<div class="table-container dashboard-integration-table-container">',
            '<table class="data-table dashboard-integration-diff-table">',
            "<thead><tr><th>Campo</th><th>Actual</th><th>Nuevo</th></tr></thead>",
            "<tbody>",
            rows.map(function (row) {
              const field = row.campo || row.field || row.nombre || "";

              return [
                "<tr>",
                "<td>" + escapeHtml(getFieldLabel(field)) + "</td>",
                "<td>" + escapeHtml(getDiffValue(row, ["actual", "valor_actual", "from", "anterior"])) + "</td>",
                "<td>" + escapeHtml(getDiffValue(row, ["nuevo", "valor_nuevo", "to", "propuesto"])) + "</td>",
                "</tr>"
              ].join("");
            }).join(""),
            "</tbody>",
            "</table>",
            "</div>"
          ].join("")
        : App.ui.emptyState("No hay cambios aplicables", "El preview no reporto campos modificados."),
      "</section>"
    ].join("");
  }

  function renderCancellationReview(evento) {
    return [
      '<section class="dashboard-integration-block">',
      "<h3>Cancelacion</h3>",
      renderNormalizedData(evento),
      App.auth && App.auth.esAdministrador()
        ? [
            '<label class="field dashboard-integration-full">',
            '<span>Motivo de cancelación</span>',
            '<textarea id="integration-cancel-reason" class="dashboard-integration-textarea" required></textarea>',
            "</label>"
          ].join("")
        : "",
      "</section>"
    ].join("");
  }

  function canApplyModification(diff) {
    const preview = getObject(diff);
    return preview.aplicable !== false;
  }

  function renderDialogActions(evento, diff) {
    const isAdmin = App.auth && App.auth.esAdministrador();
    const reviewStatus = evento && evento.review_status;
    const applicationStatus = evento && evento.application_status;
    const type = evento && evento.event_type;
    const disabled = integrationState.actionLoading ? " disabled" : "";
    const actions = ['<button class="btn" type="button" data-dialog-action="close">Cerrar</button>'];

    if (!isAdmin) {
      actions.unshift('<span class="card-text dashboard-integration-readonly">Modo consulta: solo lectura.</span>');
      return actions.join("");
    }

    if (reviewStatus === "pending_review") {
      actions.unshift('<button class="btn btn-ghost" type="button" data-dialog-action="dismiss"' + disabled + ">Rechazar</button>");
    }

    if (type === "new_booking" && (reviewStatus === "pending_review" || (reviewStatus === "approved" && applicationStatus === "not_applied"))) {
      const readyDisabled = disabled || (isNewBookingReadyForApply(evento) ? "" : " disabled");
      actions.push('<button class="btn btn-primary" type="button" data-dialog-action="apply-new-booking"' + readyDisabled + ">" + (reviewStatus === "pending_review" ? "Aprobar y registrar" : "Registrar reservación") + "</button>");
    }

    if (type === "modification") {
      if (reviewStatus === "pending_review") {
        actions.push('<button class="btn btn-primary" type="button" data-dialog-action="approve-modification"' + disabled + ">Aprobar modificación</button>");
      } else if (reviewStatus === "approved" && applicationStatus === "not_applied") {
        actions.push('<button class="btn btn-primary" type="button" data-dialog-action="apply-modification"' + disabled + (canApplyModification(diff) ? "" : " disabled") + ">Aplicar modificación</button>");
      }
    }

    if (type === "cancellation" && (reviewStatus === "pending_review" || (reviewStatus === "approved" && applicationStatus === "not_applied"))) {
      actions.push('<button class="btn btn-primary" type="button" data-dialog-action="apply-cancellation"' + disabled + ">" + (reviewStatus === "pending_review" ? "Aprobar y aplicar cancelación" : "Aplicar cancelación") + "</button>");
    }

    return actions.join("");
  }

  function renderIntegrationDialog() {
    const host = document.getElementById("dashboard-integration-dialog-host");
    const evento = integrationState.modalEvent;
    const diff = integrationState.modalDiff;
    let content = "";

    if (!host) {
      return;
    }

    if (!integrationState.modalLoading && !evento) {
      host.innerHTML = "";
      return;
    }

    if (integrationState.modalLoading) {
      content = [
        '<div class="dashboard-integration-loading">',
        '<span class="daily-spinner" aria-hidden="true"></span>',
        '<p class="card-text">Cargando evento de integración.</p>',
        "</div>"
      ].join("");
    } else {
      content = [
        renderCommonIntegrationDetails(evento),
        evento.event_type === "new_booking" ? renderNewBookingReview(evento) : "",
        evento.event_type === "modification" ? renderModificationDiff(evento, diff) : "",
        evento.event_type === "cancellation" ? renderCancellationReview(evento) : ""
      ].join("");
    }

    host.innerHTML = [
      '<div class="dashboard-integration-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dashboard-integration-dialog-title">',
      '<section class="card dashboard-integration-dialog">',
      '<div class="dashboard-integration-dialog-header">',
      "<div>",
      '<p class="field-label">Revisión funcional</p>',
      '<h2 id="dashboard-integration-dialog-title">Pendiente de integración</h2>',
      "</div>",
      '<button class="btn btn-ghost" type="button" data-dialog-action="close" aria-label="Cerrar">Cerrar</button>',
      "</div>",
      '<div class="form-message is-error dashboard-integration-modal-message">' + App.ui.escapeHtml(integrationState.modalError) + "</div>",
      content,
      '<div class="dashboard-integration-modal-actions">',
      integrationState.modalLoading ? "" : renderDialogActions(evento, diff),
      "</div>",
      "</section>",
      "</div>"
    ].join("");

    bindIntegrationDialogEvents();
  }

  function renderIntegrationSection() {
    const section = document.getElementById("dashboard-integration-section");

    if (!section) {
      return;
    }

    section.outerHTML = renderIntegrationPanel();
    bindIntegrationPanelEvents();
  }

  function bindRetry() {
    const retry = document.getElementById("dashboard-retry");

    if (retry) {
      retry.addEventListener("click", function () {
        loadDashboard(currentFecha || getLocalDateValue());
      });
    }
  }

  function bindIntegrationPanelEvents() {
    const retry = document.getElementById("dashboard-integration-retry");
    const buttons = document.querySelectorAll("[data-integration-action='review']");

    if (retry) {
      retry.addEventListener("click", function () {
        loadIntegrationPendientes({ silent: false });
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        openIntegrationDialog(button.getAttribute("data-integration-id"));
      });
    });
  }

  function bindIntegrationDialogEvents() {
    const host = document.getElementById("dashboard-integration-dialog-host");

    if (!host) {
      return;
    }

    host.querySelectorAll("[data-dialog-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleIntegrationDialogAction(button.getAttribute("data-dialog-action"));
      });
    });

    ["integration-tour-id", "integration-turno", "integration-pickup-time"].forEach(function (id) {
      const input = document.getElementById(id);

      if (input) {
        input.addEventListener("input", updateNewBookingApplyButtonState);
        input.addEventListener("change", updateNewBookingApplyButtonState);
      }
    });

    updateNewBookingApplyButtonState();
  }

  async function loadIntegrationPendientes(options) {
    const config = options || {};

    if (!isDashboardActive()) {
      return;
    }

    integrationState.loading = !config.silent;
    integrationState.error = "";
    renderIntegrationSection();

    try {
      const pendingResponse = await App.api.apiFetch(getOperationalListPath("pending_review"));
      const approvedResponse = await App.api.apiFetch(getOperationalListPath("approved"));

      if (!isDashboardActive()) {
        return;
      }

      integrationState.events = buildPendingIntegrationEvents(pendingResponse, approvedResponse);
    } catch (error) {
      if (!isDashboardActive()) {
        return;
      }

      integrationState.error = getIntegrationErrorMessage(error, "No fue posible cargar los pendientes de integración.");
    } finally {
      if (isDashboardActive()) {
        integrationState.loading = false;
        renderIntegrationSection();
      }
    }
  }

  async function loadIntegrationToursIfNeeded() {
    if (integrationState.toursLoaded || integrationState.toursLoading) {
      return;
    }

    integrationState.toursLoading = true;
    integrationState.toursError = "";

    try {
      const response = await App.api.apiFetch("/api/tours");
      integrationState.tours = getCatalogList(response);
      integrationState.toursLoaded = true;
    } catch (error) {
      integrationState.toursError = getBackendMessage(error, "No fue posible cargar el catálogo de tours.");
    } finally {
      integrationState.toursLoading = false;
    }
  }

  async function openIntegrationDialog(id) {
    integrationState.modalEvent = null;
    integrationState.modalDiff = null;
    integrationState.modalError = "";
    integrationState.modalLoading = true;
    renderIntegrationDialog();

    try {
      const detailResponse = await App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id));
      const evento = getIntegrationDetail(detailResponse);
      let diff = null;

      if (evento && evento.event_type === "modification") {
        const diffResponse = await App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/diff");
        diff = getIntegrationDetail(diffResponse);
      }

      if (evento && evento.event_type === "new_booking" && needsManualField(evento, "id_tour")) {
        await loadIntegrationToursIfNeeded();
      }

      integrationState.modalEvent = evento;
      integrationState.modalDiff = diff;
    } catch (error) {
      integrationState.modalError = getIntegrationErrorMessage(error, "No fue posible cargar el evento.");
    } finally {
      integrationState.modalLoading = false;
      renderIntegrationDialog();
    }
  }

  function closeIntegrationDialog() {
    const host = document.getElementById("dashboard-integration-dialog-host");

    integrationState.modalEvent = null;
    integrationState.modalDiff = null;
    integrationState.modalLoading = false;
    integrationState.modalError = "";
    integrationState.actionLoading = false;

    if (host) {
      host.innerHTML = "";
    }
  }

  async function approveIntegrationEvent(id) {
    return App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/revision", {
      method: "PATCH",
      body: {
        accion: "approve",
        nota: null
      }
    });
  }

  async function dismissIntegrationEvent(id) {
    return App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/revision", {
      method: "PATCH",
      body: {
        accion: "dismiss",
        nota: null
      }
    });
  }

  async function applyIntegrationEvent(id, completar) {
    return App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/aplicar", {
      method: "POST",
      body: {
        completar: completar || {}
      }
    });
  }

  function setModalError(message) {
    integrationState.modalError = message;
    integrationState.actionLoading = false;
    renderIntegrationDialog();
  }

  function getCurrentIntegrationId() {
    return getIntegrationId(integrationState.modalEvent);
  }

  function getPickupTimeInputValue() {
    const input = document.getElementById("integration-pickup-time");

    return input ? String(input.value || "").trim() : "";
  }

  function getCancelReasonValue() {
    const input = document.getElementById("integration-cancel-reason");

    return input ? String(input.value || "").trim() : "";
  }

  async function refreshAfterIntegrationAction(message) {
    closeIntegrationDialog();
    integrationState.message = message || "";
    await loadIntegrationPendientes({ silent: true });
    loadDashboard(currentFecha || getLocalDateValue());
  }

  function getApplySuccessMessage(response, fallback) {
    const datos = response && (response.datos || response.data);

    if (datos && datos.codigo) {
      return "Reservación " + datos.codigo + " registrada correctamente.";
    }

    return fallback || "Reservación registrada correctamente.";
  }

  async function applyNewBooking() {
    const evento = integrationState.modalEvent;
    const id = getCurrentIntegrationId();
    const completar = {};
    let approvedInThisAction = false;
    let response;

    if (hasBlockingNewBookingMissingFields(evento)) {
      setModalError("El evento todavía tiene datos obligatorios que no se pueden completar manualmente desde este modal.");
      return;
    }

    if (needsManualField(evento, "id_tour")) {
      const idTour = getManualTourValue();

      if (!idTour) {
        setModalError("Selecciona el tour interno.");
        return;
      }

      completar.id_tour = Number(idTour);
    }

    if (needsManualField(evento, "turno")) {
      const turno = getManualTurnoValue();

      if (TURNOS_VALIDOS.indexOf(turno) === -1) {
        setModalError("Selecciona un turno válido.");
        return;
      }

      completar.turno = turno;
    }

    if (!hasPickupTime(evento)) {
      const pickupTime = getPickupTimeInputValue();

      if (!pickupTime) {
        setModalError("La hora de pickup es obligatoria.");
        return;
      }

      completar.pickup_time = pickupTime;
    }

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      if (evento.review_status === "pending_review") {
        await approveIntegrationEvent(id);
        approvedInThisAction = true;
      }

      response = await applyIntegrationEvent(id, completar);
      await refreshAfterIntegrationAction(getApplySuccessMessage(response, "Reservación registrada correctamente."));
    } catch (error) {
      if (approvedInThisAction) {
        integrationState.modalError = "El evento fue aprobado, pero todavía no pudo registrarse.";
        integrationState.actionLoading = false;
        await loadIntegrationPendientes({ silent: true });
        renderIntegrationDialog();
        return;
      }

      setModalError(getIntegrationErrorMessage(error, "No fue posible registrar la reservación."));
    }
  }

  async function approveModification() {
    const id = getCurrentIntegrationId();

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await approveIntegrationEvent(id);
      integrationState.message = "Modificacion aprobada. Aun falta aplicarla.";
      await loadIntegrationPendientes({ silent: true });
      await openIntegrationDialog(id);
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible aprobar la modificación."));
    }
  }

  async function applyModification() {
    const id = getCurrentIntegrationId();

    if (!canApplyModification(integrationState.modalDiff)) {
      setModalError("La modificación no puede aplicarse automáticamente.");
      return;
    }

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await applyIntegrationEvent(id, {});
      await refreshAfterIntegrationAction("Modificacion aplicada correctamente.");
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible aplicar la modificación."));
    }
  }

  async function applyCancellation() {
    const evento = integrationState.modalEvent;
    const id = getCurrentIntegrationId();
    const motivo = getCancelReasonValue();
    let approvedInThisAction = false;

    if (!motivo) {
      setModalError("El motivo de cancelación es obligatorio.");
      return;
    }

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      if (evento.review_status === "pending_review") {
        await approveIntegrationEvent(id);
        approvedInThisAction = true;
      }

      await applyIntegrationEvent(id, {
        motivo_cancelacion: motivo
      });
      await refreshAfterIntegrationAction("Cancelacion aplicada correctamente.");
    } catch (error) {
      if (approvedInThisAction) {
        integrationState.modalError = "El evento fue aprobado, pero todavía no pudo registrarse.";
        integrationState.actionLoading = false;
        await loadIntegrationPendientes({ silent: true });
        renderIntegrationDialog();
        return;
      }

      setModalError(getIntegrationErrorMessage(error, "No fue posible aplicar la cancelación."));
    }
  }

  async function dismissCurrentEvent() {
    const id = getCurrentIntegrationId();

    if (!window.confirm("¿Deseas rechazar este evento de integración?")) {
      return;
    }

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await dismissIntegrationEvent(id);
      await refreshAfterIntegrationAction("Evento descartado.");
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible rechazar el evento."));
    }
  }

  function handleIntegrationDialogAction(action) {
    if (integrationState.actionLoading) {
      return;
    }

    if (action === "close") {
      closeIntegrationDialog();
      return;
    }

    if (action === "dismiss") {
      dismissCurrentEvent();
      return;
    }

    if (action === "apply-new-booking") {
      applyNewBooking();
      return;
    }

    if (action === "approve-modification") {
      approveModification();
      return;
    }

    if (action === "apply-modification") {
      applyModification();
      return;
    }

    if (action === "apply-cancellation") {
      applyCancellation();
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
      bindIntegrationPanelEvents();
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
        '<div id="dashboard-integration-dialog-host"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      requestId += 1;
      currentFecha = getLocalDateValue();
      resetIntegrationState();
      loadDashboard(currentFecha);
      loadIntegrationPendientes({ silent: false });
      startIntegrationRefresh();
    }
  };
})();
