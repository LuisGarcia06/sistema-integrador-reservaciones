(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "--";
  const TURNO_SIN_CLASIFICAR = "Sin clasificar";
  const INTEGRATION_REFRESH_MS = 60000;
  const MANUAL_NEW_BOOKING_FIELDS = ["id_tour", "turno", "pickup_place", "pickup_time"];
  const FAREHARBOR_MANUAL_FIELDS = ["id_tour", "turno", "pickup_place", "pickup_time", "ninos", "nombre_cliente"];
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
    nombre_cliente: "Nombre",
    customer_phone: "Telefono",
    telefono_cliente: "Teléfono",
    ninos: "Niños",
    price: "Precio",
    precio_total: "Precio total",
    deposito: "Depósito",
    saldo: "Balance pendiente",
    money_group: "Datos de pago",
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
    fareHarborManualValues: {},
    fareHarborModificationDecisions: {},
    fareHarborModificationManualValues: {},
    fareHarborModificationFingerprint: null,
    fareHarborCancellationReason: "",
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

  function formatDateTimeLocal(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return formatDateTime(value);
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return [day, month, year].join("/") + " " + hours + ":" + minutes;
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

  function isFareHarborEvent(evento) {
    return Boolean(evento && evento.provider === "fareharbor");
  }

  function isFareHarborModificationEvent(evento) {
    return Boolean(isFareHarborEvent(evento) && evento.event_type === "modification");
  }

  function isFareHarborCancellationEvent(evento) {
    return Boolean(isFareHarborEvent(evento) && evento.event_type === "cancellation");
  }

  function getFareHarborSummary(evento) {
    return getObject(evento && evento.fareharbor_summary);
  }

  function getFareHarborBooking(evento) {
    return getObject(getFareHarborSummary(evento).booking);
  }

  function getFareHarborAvailability(evento) {
    return getObject(getFareHarborSummary(evento).availability);
  }

  function getFareHarborItem(evento) {
    return getObject(getFareHarborAvailability(evento).item);
  }

  function getFareHarborCustomers(evento) {
    return getObject(getFareHarborSummary(evento).customers);
  }

  function getFareHarborMoney(evento) {
    return getObject(getFareHarborSummary(evento).money);
  }

  function getFareHarborPickup(evento) {
    return getObject(getFareHarborSummary(evento).pickup);
  }

  function getFareHarborDisplayId(evento) {
    const booking = getFareHarborBooking(evento);
    return booking.display_id || (evento && evento.external_booking_id) || EMPTY_VALUE;
  }

  function maskExternalBookingId(value) {
    const text = String(value || "").trim();

    if (!text) {
      return EMPTY_VALUE;
    }

    if (text.length <= 10) {
      return text;
    }

    return text.slice(0, 6) + "…" + text.slice(-4);
  }

  function formatFareHarborPresence(value) {
    return value ? "Presente" : "No recibido";
  }

  function formatFareHarborMoneyValue(displayValue, rawValue, currency) {
    const display = String(displayValue || "").trim();

    if (display) {
      return display;
    }

    if (rawValue === null || rawValue === undefined || rawValue === "") {
      return EMPTY_VALUE;
    }

    return String(rawValue) + (currency ? " " + String(currency).toUpperCase() : "");
  }

  function formatFareHarborCategories(evento) {
    const customers = getFareHarborCustomers(evento);
    const categories = getArray(customers.by_category).filter(function (category) {
      return category && category.count !== null && category.count !== undefined;
    });

    if (!categories.length) {
      return EMPTY_VALUE;
    }

    return categories.map(function (category) {
      const label = category.plural || category.singular || "Categoria";
      return String(category.count) + " " + label;
    }).join(", ");
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
    return getObject(evento && (evento.application_preview || evento.fareharbor_application_preview));
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

  function canEditIntegrationManually() {
    return Boolean(App.auth && App.auth.esAdministrador());
  }

  function resetFareHarborManualValues() {
    integrationState.fareHarborManualValues = {};
  }

  function getFareHarborManualValue(field) {
    const values = getObject(integrationState.fareHarborManualValues);
    const value = values[field];

    return value === null || value === undefined ? "" : String(value);
  }

  function setFareHarborManualValue(field, value) {
    if (FAREHARBOR_MANUAL_FIELDS.indexOf(field) === -1) {
      return;
    }

    integrationState.fareHarborManualValues[field] = value === null || value === undefined ? "" : String(value);
  }

  function saveFareHarborManualInputs() {
    const fields = {
      id_tour: "integration-tour-id",
      turno: "integration-turno",
      pickup_place: "integration-pickup-place",
      pickup_time: "integration-pickup-time",
      nombre_cliente: "fareharbor-customer-name",
      ninos: "fareharbor-ninos"
    };

    Object.keys(fields).forEach(function (field) {
      const input = document.getElementById(fields[field]);

      if (input) {
        setFareHarborManualValue(field, String(input.value || "").trim());
      }
    });
  }

  function resetFareHarborModificationState() {
    integrationState.fareHarborModificationDecisions = {};
    integrationState.fareHarborModificationManualValues = {};
    integrationState.fareHarborModificationFingerprint = null;
  }

  function getFareHarborModificationManualValue(field) {
    const values = getObject(integrationState.fareHarborModificationManualValues);
    const value = values[field];

    return value === null || value === undefined ? "" : String(value);
  }

  function setFareHarborModificationManualValue(field, value) {
    if (["id_tour", "turno", "ninos"].indexOf(field) === -1) {
      return;
    }

    integrationState.fareHarborModificationManualValues[field] = value === null || value === undefined ? "" : String(value);
  }

  function saveFareHarborModificationInputs() {
    const fields = {
      id_tour: "fhmod-tour-id",
      turno: "fhmod-turno",
      ninos: "fhmod-ninos"
    };

    Object.keys(fields).forEach(function (field) {
      const input = document.getElementById(fields[field]);

      if (input) {
        setFareHarborModificationManualValue(field, String(input.value || "").trim());
      }
    });
  }

  function setFareHarborModificationDecision(key, value) {
    if (!key) {
      return;
    }

    integrationState.fareHarborModificationDecisions[key] = value || "";
  }

  function getFareHarborModificationDecision(key) {
    return getObject(integrationState.fareHarborModificationDecisions)[key] || "";
  }

  function preserveFareHarborModificationStateForDiff(diff) {
    const preview = getFareHarborModificationPreview(diff);
    const keys = getFareHarborModificationGroups(preview).map(function (group) {
      return group.key;
    });
    const allowed = keys.reduce(function (map, key) {
      map[key] = true;
      return map;
    }, {});
    const decisions = {};

    Object.keys(getObject(integrationState.fareHarborModificationDecisions)).forEach(function (key) {
      if (allowed[key]) {
        decisions[key] = integrationState.fareHarborModificationDecisions[key];
      }
    });

    integrationState.fareHarborModificationDecisions = decisions;
    integrationState.fareHarborModificationFingerprint = preview.diff_fingerprint || null;
  }

  function resetFareHarborCancellationState() {
    integrationState.fareHarborCancellationReason = "";
  }

  function getFareHarborCancellationReason() {
    return String(integrationState.fareHarborCancellationReason || "").trim();
  }

  function setFareHarborCancellationReason(value) {
    integrationState.fareHarborCancellationReason = value === null || value === undefined ? "" : String(value);
  }

  function saveFareHarborCancellationInputs() {
    const input = document.getElementById("fareharbor-cancellation-reason");

    if (input) {
      setFareHarborCancellationReason(input.value || "");
    }
  }
  function getFareHarborPax(evento) {
    const candidate = getFareHarborReservationCandidate(evento);
    const pax = Number(candidate.pax);

    return Number.isInteger(pax) && pax >= 0 ? pax : null;
  }

  function getFareHarborManualFieldErrors(evento) {
    const errors = [];
    const missing = getNewBookingMissingFields(evento);
    const pax = getFareHarborPax(evento);

    missing.forEach(function (field) {
      if (FAREHARBOR_MANUAL_FIELDS.indexOf(field) === -1) {
        return;
      }

      if (field === "id_tour" && !getManualTourValue()) {
        errors.push({ field: field, message: "Selecciona el tour interno." });
      }

      if (field === "turno" && TURNOS_VALIDOS.indexOf(getManualTurnoValue()) === -1) {
        errors.push({ field: field, message: "Selecciona un turno válido." });
      }

      if (field === "pickup_place" && !getManualPickupPlaceValue()) {
        errors.push({ field: field, message: "El lugar de pickup es obligatorio." });
      }

      if (field === "pickup_time" && !getPickupTimeInputValue()) {
        errors.push({ field: field, message: "La hora de pickup es obligatoria." });
      }

      if (field === "nombre_cliente" && !getFareHarborManualValue("nombre_cliente").trim()) {
        errors.push({ field: field, message: "El nombre es obligatorio." });
      }

      if (field === "ninos") {
        const rawValue = getFareHarborManualValue("ninos").trim();
        const numberValue = Number(rawValue);

        if (rawValue === "" || !Number.isInteger(numberValue) || numberValue < 0 || (pax !== null && numberValue > pax)) {
          errors.push({ field: field, message: pax !== null ? "La cantidad de niños debe estar entre 0 y " + pax + "." : "La cantidad de niños debe ser un entero mayor o igual a 0." });
        }
      }
    });

    return errors;
  }

  function getFareHarborBlockingIssues(evento) {
    const preview = getFareHarborApplicationPreview(evento);
    const blocking = [];

    function pushUnique(message) {
      if (message && blocking.indexOf(message) === -1) {
        blocking.push(message);
      }
    }

    if (preview.money_ready !== true) {
      pushUnique("El dinero de FareHarbor todavía no está listo para aplicación.");
    }

    getNewBookingMissingFields(evento).forEach(function (field) {
      if (FAREHARBOR_MANUAL_FIELDS.indexOf(field) === -1) {
        pushUnique("Falta " + getFieldLabel(field) + ".");
      }
    });

    getArray(preview.issues).forEach(function (issue) {
      pushUnique(issue);
    });

    return blocking;
  }

  function getFareHarborApplyValidation(evento) {
    const errors = getFareHarborBlockingIssues(evento).concat(getFareHarborManualFieldErrors(evento).map(function (error) {
      return error.message;
    }));

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  function isFareHarborReadyForApply(evento) {
    return Boolean(
      evento
      && isFareHarborEvent(evento)
      && evento.event_type === "new_booking"
      && evento.review_status === "approved"
      && evento.application_status === "not_applied"
      && !integrationState.actionLoading
      && !integrationState.toursLoading
      && getFareHarborApplyValidation(evento).valid
    );
  }

  function buildFareHarborApplyCompletar(evento) {
    const completar = {};

    FAREHARBOR_MANUAL_FIELDS.forEach(function (field) {
      if (!needsManualField(evento, field)) {
        return;
      }

      if (field === "id_tour") {
        completar.id_tour = Number(getManualTourValue());
        return;
      }

      if (field === "turno") {
        completar.turno = getManualTurnoValue();
        return;
      }

      if (field === "pickup_place") {
        completar.pickup_place = getManualPickupPlaceValue();
        return;
      }

      if (field === "pickup_time") {
        completar.pickup_time = getPickupTimeInputValue();
        return;
      }

      if (field === "ninos") {
        completar.ninos = Number(getFareHarborManualValue("ninos").trim());
        return;
      }

      if (field === "nombre_cliente") {
        completar.nombre_cliente = getFareHarborManualValue("nombre_cliente").trim();
      }
    });

    return completar;
  }

  function getPreviewReservationData(evento) {
    const preview = getNewBookingPreview(evento);
    return getObject(preview.reservationData || preview.reservation_candidate);
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

  function isRestricted() { return Boolean(App.auth && App.auth.esConsultaRestringida()); }

  function renderMetrics(metricas) {
    const data = metricas || {};

    return [
      '<div class="metric-grid dashboard-metric-grid">',
      renderMetric("Reservaciones", data.reservaciones_vigentes),
      renderMetric("PAX", data.pax_vigentes),
      isRestricted() ? "" : renderMetric("Grupos preparados", data.grupos_preparados),
      isRestricted() ? "" : renderMetric("Grupos pendientes", data.grupos_pendientes),
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

  function renderFareHarborIntegrationEvent(evento) {
    const id = getIntegrationId(evento);
    const receivedAt = evento && (evento.source_received_at || evento.received_at || evento.created_at);
    const booking = getFareHarborBooking(evento);
    const availability = getFareHarborAvailability(evento);
    const item = getFareHarborItem(evento);
    const customers = getFareHarborCustomers(evento);
    const money = getFareHarborMoney(evento);
    const eventTypeLabel = isFareHarborModificationEvent(evento)
      ? "Modificación FareHarbor"
      : (isFareHarborCancellationEvent(evento) ? "Cancelación FareHarbor" : getEventTypeLabel(evento && evento.event_type));
    const primaryText = (isFareHarborModificationEvent(evento) || isFareHarborCancellationEvent(evento))
      ? maskExternalBookingId(getFareHarborDisplayId(evento))
      : getFareHarborDisplayId(evento);

    return [
      '<article class="dashboard-integration-item">',
      '<div class="dashboard-integration-main">',
      '<strong class="dashboard-primary-text">' + escapeHtml(primaryText) + "</strong>",
      '<div class="dashboard-integration-meta">',
      '<span>FareHarbor</span>',
      '<span>' + escapeHtml(eventTypeLabel) + "</span>",
      '<span>' + escapeHtml(formatDateTimeLocal(receivedAt)) + "</span>",
      "</div>",
      '<div class="dashboard-integration-meta">',
      '<span>' + escapeHtml(item.name || item.headline || "Actividad no determinada") + "</span>",
      '<span>' + escapeHtml(formatDateTime(availability.start_at)) + "</span>",
      '<span>' + escapeHtml((customers.total !== null && customers.total !== undefined ? customers.total : EMPTY_VALUE) + " PAX") + "</span>",
      '<span>' + escapeHtml((booking.status || "Estado no determinado")) + "</span>",
      money.currency ? '<span>' + escapeHtml(String(money.currency).toUpperCase()) + "</span>" : "",
      "</div>",
      '<div class="daily-badges">',
      '<span class="' + getReviewBadgeClass(evento && evento.review_status) + '">' + escapeHtml(getReviewStatusLabel(evento && evento.review_status)) + "</span>",
      '<span class="' + getApplicationBadgeClass(evento && evento.application_status) + '">' + escapeHtml(getApplicationStatusLabel(evento && evento.application_status)) + "</span>",
      "</div>",
      "</div>",
      '<div class="dashboard-integration-actions">',
      '<button class="btn btn-ghost" type="button" data-integration-action="review" data-integration-id="' + App.ui.escapeHtml(id) + '">Ver</button>',
      "</div>",
      "</article>"
    ].join("");
  }

  function renderIntegrationEvent(evento) {
    const id = getIntegrationId(evento);
    const receivedAt = evento && (evento.source_received_at || evento.received_at || evento.created_at);

    if (isFareHarborEvent(evento)) {
      return renderFareHarborIntegrationEvent(evento);
    }

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
      isRestricted() ? "" : '<a class="btn" href="#/operaciones">Ver operaciones</a>',
      isRestricted() ? "" : '<a class="btn" href="#/daily">Ver Daily</a>'
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
      isRestricted() ? '<p class="card-text" role="status">Información limitada a las plataformas asignadas a tu usuario.</p>' : "",
      renderMetrics(data && data.metricas),
      isRestricted() ? "" : renderAlerts(data && data.alertas),
      renderEmptyToday(data && data.metricas),
      '<div class="dashboard-grid">',
      '<div class="stack">',
      isRestricted() ? "" : renderIntegrationPanel(),
      renderRecentReservations(data && data.reservaciones_recientes),
      isRestricted() ? "" : renderSalidas(data && data.salidas_hoy),
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
      renderDetailItem("Recibido", isFareHarborEvent(evento) ? formatDateTimeLocal(receivedAt) : formatDateTime(receivedAt)),
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
    const temporalBlockers = getNewBookingTemporalBlockers(evento);

    if (temporalBlockers.length > 0) {
      return '<p class="form-message is-error">' + temporalBlockers.map(function (message) {
        return App.ui.escapeHtml(message);
      }).join(" ") + "</p>";
    }

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
    const reservationData = getPreviewReservationData(evento);
    return Boolean(String(reservationData.pickup_time || normalized.pickup_time || "").trim());
  }

  function renderTourSelect(evento) {
    const needsTour = needsManualField(evento, "id_tour");
    const tours = getSelectableTours();
    const selectedTour = isFareHarborEvent(evento) ? getFareHarborManualValue("id_tour") : "";

    if (!needsTour || !canEditIntegrationManually()) {
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
        const tourId = String(getTourId(tour));
        const selected = selectedTour && selectedTour === tourId ? ' selected' : '';

        return '<option value="' + App.ui.escapeHtml(tourId) + '"' + selected + '>' + App.ui.escapeHtml(getTourName(tour)) + "</option>";
      }).join(""),
      "</select>",
      "</label>"
    ].join("");
  }

  function renderTurnoSelect(evento) {
    const needsTurno = needsManualField(evento, "turno");
    const selectedTurno = isFareHarborEvent(evento) ? getFareHarborManualValue("turno") : "";

    if (!needsTurno || !canEditIntegrationManually()) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Turno *</span>',
      '<select id="integration-turno" required>',
      '<option value="">Selecciona turno</option>',
      TURNOS_VALIDOS.map(function (turno) {
        const selected = selectedTurno === turno ? ' selected' : '';

        return '<option value="' + App.ui.escapeHtml(turno) + '"' + selected + '>' + App.ui.escapeHtml(turno) + "</option>";
      }).join(""),
      "</select>",
      "</label>"
    ].join("");
  }

  function renderPickupPlaceInput(evento) {
    const value = isFareHarborEvent(evento) ? getFareHarborManualValue("pickup_place") : "";

    if (!needsManualField(evento, "pickup_place") || !canEditIntegrationManually()) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Lugar de pickup *</span>',
      '<input id="integration-pickup-place" type="text" maxlength="120" required value="' + App.ui.escapeHtml(value) + '">',
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

  function getManualPickupPlaceValue() {
    const input = document.getElementById("integration-pickup-place");

    return input ? String(input.value || "").trim() : "";
  }

  function hasBlockingNewBookingMissingFields(evento) {
    return getNonManualNewBookingMissingFields(evento).length > 0 || getNewBookingTemporalBlockers(evento).length > 0;
  }

  function getNewBookingTemporalBlockers(evento) {
    const preview = getNewBookingPreview(evento);
    const timing = getObject(preview.activity_timing);
    const blockers = [];

    if (timing.is_past_date === true) {
      blockers.push("La fecha de la actividad GetYourGuide ya pasó y no puede registrarse como una reservación operativa.");
    } else if (timing.is_past_date === null && Object.prototype.hasOwnProperty.call(timing, "is_past_date")) {
      blockers.push("No fue posible determinar la fecha de la actividad GetYourGuide.");
    }

    return blockers;
  }

  function isNewBookingReadyForApply(evento) {
    if (!evento || isFareHarborEvent(evento) || evento.event_type !== "new_booking") {
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

    if (needsManualField(evento, "pickup_place") && !getManualPickupPlaceValue()) {
      return false;
    }

    if (!hasPickupTime(evento) && !getPickupTimeInputValue()) {
      return false;
    }

    return true;
  }

  function updateNewBookingApplyButtonState() {
    const button = document.querySelector('[data-dialog-action="apply-new-booking"], [data-dialog-action="apply-fareharbor"]');

    if (!button || !integrationState.modalEvent || integrationState.actionLoading) {
      return;
    }

    button.disabled = isFareHarborEvent(integrationState.modalEvent)
      ? !isFareHarborReadyForApply(integrationState.modalEvent)
      : !isNewBookingReadyForApply(integrationState.modalEvent);
  }

  function renderNewBookingReview(evento) {
    const needsPickupTime = !hasPickupTime(evento);

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Información normalizada</h3>",
      renderNormalizedData(evento),
      renderTourSelect(evento),
      renderTurnoSelect(evento),
      renderPickupPlaceInput(evento),
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

  function getFareHarborModificationPreview(diff) {
    const preview = getObject(diff);
    return getObject(preview.fareharbor_modification_diff || preview);
  }

  function formatFareHarborDiffValue(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY_VALUE;
    }

    if (Array.isArray(value)) {
      return value.length ? value.map(formatFareHarborDiffValue).join(", ") : EMPTY_VALUE;
    }

    if (value && typeof value === "object") {
      return Object.keys(value).filter(function (key) {
        return value[key] !== null && value[key] !== undefined && value[key] !== "";
      }).map(function (key) {
        return getFieldLabel(key) + ": " + formatFareHarborDiffValue(value[key]);
      }).join(", ") || EMPTY_VALUE;
    }

    if (typeof value === "boolean") {
      return value ? "Sí" : "No";
    }

    return String(value);
  }

  function getFareHarborChangeReasonLabel(reason) {
    const labels = {
      baseline_external_missing: "El valor aplicado originalmente desde FareHarbor no está disponible para comparar.",
      baseline_tour_manual_or_unknown: "El tour original fue manual o no se pudo determinar desde FareHarbor.",
      baseline_turno_manual_or_unknown: "El turno original fue manual o no se pudo determinar desde FareHarbor.",
      baseline_pickup_manual_or_unknown: "El pickup original fue manual o no se pudo determinar desde FareHarbor.",
      baseline_ninos_manual_or_unknown: "Los niños originales fueron manuales o no se pudieron derivar desde FareHarbor.",
      baseline_money_manual_or_unknown: "Los importes originales fueron manuales o no se pudieron derivar desde FareHarbor.",
      internal_diverged_from_baseline: "El valor interno ya no coincide con el último valor aplicado desde FareHarbor.",
      operational_change_requires_review: "El cambio afecta datos operativos y requiere revisión manual.",
      unknown_customer_category: "FareHarbor envió una categoría de pasajero no reconocida.",
    };

    return labels[reason] || reason || "";
  }

  function getFareHarborProposedActionLabel(value) {
    if (value === "manual") {
      return "Revisión manual";
    }

    if (value === "future_apply") {
      return "Cambio detectado";
    }

    return "Sin acción automática";
  }

  function getFareHarborModificationIssueLabel(issue) {
    const labels = {
      external_booking_id_faltante: "Falta el identificador externo de FareHarbor.",
      sin_reservacion_vinculada: "No existe una reservación interna vinculada a este booking FareHarbor.",
      reservacion_vinculada_no_encontrada: "La reservación vinculada no fue encontrada.",
      baseline_aplicado_faltante: "No se encontró un evento FareHarbor aplicado para usar como baseline.",
    };

    return labels[issue] || issue;
  }

  function getFareHarborModificationSummary(preview, changes) {
    const blockingIssues = getArray(preview.blocking_issues);

    if (getObject(preview.current_event).is_latest_snapshot === false) {
      return "Existe un snapshot FareHarbor más reciente para este booking. Este evento se muestra solo como referencia.";
    }

    if (preview.baseline_status === "missing") {
      return "No hay baseline aplicado suficiente para comparar la modificación automáticamente.";
    }

    if (!changes.length) {
      return "No se detectaron cambios relevantes entre FareHarbor y la reservación interna.";
    }

    if (blockingIssues.length) {
      return "Se detectaron cambios, pero hay condiciones que requieren revisión antes de cualquier aplicación futura.";
    }

    return "Se detectaron cambios FareHarbor listos para revisión visual. La aplicación automática aún no está habilitada.";
  }

  function renderFareHarborModificationIssues(title, issues, className) {
    const list = getArray(issues).filter(Boolean);

    if (!list.length) {
      return "";
    }

    return [
      '<section class="dashboard-integration-block">',
      "<h3>" + escapeHtml(title) + "</h3>",
      '<div class="' + (className || "dashboard-integration-warning") + '">',
      list.map(function (issue) {
        return "<p>" + escapeHtml(getFareHarborModificationIssueLabel(issue)) + "</p>";
      }).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderFareHarborModificationResolution(change) {
    const parts = [getFareHarborProposedActionLabel(change.proposed_action)];
    const reason = getFareHarborChangeReasonLabel(change.reason);

    if (change.conflict) {
      parts.push("Conflicto detectado");
    } else if (change.external_changed) {
      parts.push("Sin divergencia interna");
    }

    if (change.field === "pax" && change.delta_pax !== null && change.delta_pax !== undefined) {
      parts.push("Delta PAX: " + (change.delta_pax > 0 ? "+" : "") + String(change.delta_pax));
    }

    if (change.requires_capacity_validation) {
      parts.push("Requiere validación de capacidad");
    }

    if (reason) {
      parts.push(reason);
    }

    return parts.join(". ");
  }

  function renderFareHarborModificationChanges(changes) {
    if (!changes.length) {
      return App.ui.emptyState("Sin cambios relevantes", "FareHarbor no reportó diferencias aplicables contra el baseline.");
    }

    return [
      '<div class="table-container dashboard-integration-table-container">',
      '<table class="data-table dashboard-integration-diff-table">',
      "<thead><tr><th>Campo</th><th>Baseline aplicado</th><th>Interno actual</th><th>Nuevo FareHarbor</th><th>Resolución</th></tr></thead>",
      "<tbody>",
      changes.map(function (change) {
        return [
          "<tr>",
          "<td>" + escapeHtml(getFieldLabel(change.field)) + "</td>",
          "<td>" + escapeHtml(formatFareHarborDiffValue(change.baseline_external)) + "</td>",
          "<td>" + escapeHtml(formatFareHarborDiffValue(change.internal_current)) + "</td>",
          "<td>" + escapeHtml(formatFareHarborDiffValue(change.fareharbor_new)) + "</td>",
          "<td>" + escapeHtml(renderFareHarborModificationResolution(change)) + "</td>",
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function getFareHarborModificationGroupKey(field) {
    if (field === "id_tour" || field === "turno") {
      return "tour_turno_group";
    }

    if (field === "pax" || field === "ninos") {
      return "passengers_group";
    }

    return field;
  }

  function getFareHarborModificationGroupLabel(key) {
    const labels = {
      fecha: "Fecha",
      tour_turno_group: "Tour / Turno",
      passengers_group: "PAX / Niños",
      pickup_place: "Lugar de pickup",
      pickup_time: "Hora de pickup",
      nombre_cliente: "Nombre del cliente",
      telefono_cliente: "Teléfono del cliente",
      money_group: "Datos de pago"
    };

    return labels[key] || getFieldLabel(key);
  }

  function getFareHarborModificationGroups(preview) {
    const order = [
      "fecha",
      "tour_turno_group",
      "passengers_group",
      "pickup_place",
      "pickup_time",
      "nombre_cliente",
      "telefono_cliente",
      "money_group"
    ];
    const groups = {};

    getArray(preview && preview.changes).forEach(function (change) {
      const key = getFareHarborModificationGroupKey(change.field);

      if (order.indexOf(key) === -1) {
        return;
      }

      if (!groups[key]) {
        groups[key] = {
          key: key,
          label: getFareHarborModificationGroupLabel(key),
          changes: []
        };
      }

      groups[key].changes.push(change);
    });

    return order.filter(function (key) {
      return groups[key];
    }).map(function (key) {
      return groups[key];
    });
  }

  function hasDeterminedFareHarborValue(value) {
    if (value === null || value === undefined || value === "") {
      return false;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).some(function (key) {
        return hasDeterminedFareHarborValue(value[key]);
      });
    }

    return true;
  }

  function getChangeByField(group, field) {
    return getArray(group.changes).find(function (change) {
      return change.field === field;
    }) || null;
  }

  function isFareHarborModificationEventBlocker(issue) {
    const text = String(issue || "");

    return text === "external_booking_id_faltante"
      || text === "sin_reservacion_vinculada"
      || text === "reservacion_vinculada_no_encontrada"
      || text === "baseline_aplicado_faltante"
      || text.indexOf("no está pendiente de aplicación") !== -1
      || text.indexOf("no esta pendiente de aplicacion") !== -1
      || text.indexOf("snapshot FareHarbor más reciente") !== -1
      || text.indexOf("snapshot FareHarbor mas reciente") !== -1
      || /cancelada/i.test(text)
      || /completada/i.test(text)
      || /ya inició/i.test(text)
      || /ya inicio/i.test(text);
  }

  function getFareHarborModificationEventBlockers(preview) {
    return getArray(preview && preview.blocking_issues).filter(isFareHarborModificationEventBlocker);
  }

  function groupHasCurrentMoneyIssue(preview) {
    return getArray(preview && preview.blocking_issues).some(function (issue) {
      return /^current money:/i.test(String(issue || ""));
    });
  }

  function isFareHarborModificationUnknownChildren(group) {
    const change = getChangeByField(group, "ninos");

    return Boolean(change && change.reason === "unknown_customer_category");
  }

  function getFareHarborModificationPaxForManual(group) {
    const paxChange = getChangeByField(group, "pax");
    const ninosChange = getChangeByField(group, "ninos");
    const pax = paxChange ? Number(paxChange.fareharbor_new) : Number(ninosChange && ninosChange.fareharbor_new);

    if (Number.isInteger(pax) && pax >= 0) {
      return pax;
    }

    if (paxChange && Number.isInteger(Number(paxChange.internal_current))) {
      return Number(paxChange.internal_current);
    }

    return null;
  }

  function getFareHarborModificationGroupOptions(preview, group) {
    const reservationContext = getObject(preview && preview.reservation_context);
    const options = {
      canApplyExternal: true,
      canKeepInternal: true,
      canManual: false,
      applyDisabledReason: "",
      manualDisabledReason: ""
    };

    if (!group || !group.key) {
      return options;
    }

    if (group.key === "fecha" && reservationContext.assigned_to_transport) {
      options.canApplyExternal = false;
      options.applyDisabledReason = "La reservación tiene transporte asignado.";
    }

    if (group.key === "tour_turno_group") {
      const tourChange = getChangeByField(group, "id_tour");
      const turnoChange = getChangeByField(group, "turno");
      const source = (tourChange && tourChange.source) || (turnoChange && turnoChange.source);

      if (source !== "equivalence") {
        options.canApplyExternal = false;
        options.applyDisabledReason = "No existe equivalencia exacta FareHarbor.";
        options.canManual = true;
      }
    }

    if (group.key === "passengers_group") {
      if (isFareHarborModificationUnknownChildren(group)) {
        options.canApplyExternal = false;
        options.applyDisabledReason = "Niños requiere resolución manual.";
        options.canManual = true;
      }
    }

    if (group.key === "money_group" && groupHasCurrentMoneyIssue(preview)) {
      options.canApplyExternal = false;
      options.applyDisabledReason = "FareHarbor envió importes inválidos.";
    }

    if (group.key !== "tour_turno_group" && group.key !== "passengers_group") {
      const firstChange = getArray(group.changes)[0];

      if (!firstChange || !hasDeterminedFareHarborValue(firstChange.fareharbor_new)) {
        options.canApplyExternal = false;
        options.applyDisabledReason = "FareHarbor no envió un valor determinable.";
      }
    }

    if (group.key === "money_group") {
      const money = getArray(group.changes)[0] && getArray(group.changes)[0].fareharbor_new;

      if (!money || typeof money !== "object" || !hasDeterminedFareHarborValue(money.precio_total) || !hasDeterminedFareHarborValue(money.deposito) || !hasDeterminedFareHarborValue(money.saldo)) {
        options.canApplyExternal = false;
        options.applyDisabledReason = options.applyDisabledReason || "FareHarbor no envió importes completos.";
      }
    }

    return options;
  }

  function renderFareHarborModificationRadio(group, value, label, disabled, reason) {
    const selected = getFareHarborModificationDecision(group.key) === value;

    return [
      '<label class="dashboard-integration-decision-option">',
      '<input type="radio" name="fhmod-decision-' + App.ui.escapeHtml(group.key) + '" data-fhmod-decision="' + App.ui.escapeHtml(group.key) + '" value="' + App.ui.escapeHtml(value) + '"' + (selected ? " checked" : "") + (disabled ? " disabled" : "") + ">",
      '<span>' + App.ui.escapeHtml(label) + (reason ? ' <small>(' + App.ui.escapeHtml(reason) + ')</small>' : '') + '</span>',
      '</label>'
    ].join("");
  }

  function renderFareHarborModificationManualControls(group) {
    const decision = getFareHarborModificationDecision(group.key);

    if (decision !== "manual") {
      return "";
    }

    if (group.key === "tour_turno_group") {
      const selectedTour = getFareHarborModificationManualValue("id_tour");
      const selectedTurno = getFareHarborModificationManualValue("turno");
      const tours = getSelectableTours();

      return [
        '<div class="dashboard-integration-detail-grid">',
        '<label class="field">',
        '<span>Tour interno *</span>',
        '<select id="fhmod-tour-id" data-fhmod-manual="id_tour" required' + (integrationState.toursLoading ? " disabled" : "") + '>',
        '<option value="">' + (integrationState.toursLoading ? "Cargando tours..." : "Selecciona un tour") + '</option>',
        tours.map(function (tour) {
          const tourId = String(getTourId(tour));
          const selected = selectedTour === tourId ? ' selected' : '';

          return '<option value="' + App.ui.escapeHtml(tourId) + '"' + selected + '>' + App.ui.escapeHtml(getTourName(tour)) + '</option>';
        }).join(""),
        '</select>',
        '</label>',
        '<label class="field">',
        '<span>Turno *</span>',
        '<select id="fhmod-turno" data-fhmod-manual="turno" required>',
        '<option value="">Selecciona turno</option>',
        TURNOS_VALIDOS.map(function (turno) {
          const selected = selectedTurno === turno ? ' selected' : '';

          return '<option value="' + App.ui.escapeHtml(turno) + '"' + selected + '>' + App.ui.escapeHtml(turno) + '</option>';
        }).join(""),
        '</select>',
        '</label>',
        '</div>',
        integrationState.toursError ? '<p class="form-message is-error">' + App.ui.escapeHtml(integrationState.toursError) + '</p>' : ''
      ].join("");
    }

    if (group.key === "passengers_group") {
      const value = getFareHarborModificationManualValue("ninos");
      const pax = getFareHarborModificationPaxForManual(group);

      return [
        '<label class="field dashboard-integration-full">',
        '<span>Niños *</span>',
        '<input id="fhmod-ninos" data-fhmod-manual="ninos" type="number" min="0"' + (pax !== null ? ' max="' + App.ui.escapeHtml(pax) + '"' : '') + ' step="1" required value="' + App.ui.escapeHtml(value) + '">',
        '</label>',
        pax !== null ? '<p class="card-text">PAX FareHarbor: ' + App.ui.escapeHtml(pax) + '</p>' : ''
      ].join("");
    }

    return "";
  }

  function renderFareHarborModificationGroup(preview, group, canEdit) {
    const options = getFareHarborModificationGroupOptions(preview, group);
    const decision = getFareHarborModificationDecision(group.key);
    const disabled = !canEdit || integrationState.actionLoading;
    const hasConflict = getArray(group.changes).some(function (change) {
      return Boolean(change.conflict);
    });
    const hasManualBaseline = getArray(group.changes).some(function (change) {
      return String(change.reason || "").indexOf("baseline_") === 0;
    });

    return [
      '<div class="dashboard-integration-block">',
      '<h4>' + App.ui.escapeHtml(group.label) + '</h4>',
      hasConflict ? '<p class="dashboard-integration-warning">Revisión manual' + (getArray(group.changes).map(function (change) { return getFareHarborChangeReasonLabel(change.reason); }).filter(Boolean)[0] ? ': ' + App.ui.escapeHtml(getArray(group.changes).map(function (change) { return getFareHarborChangeReasonLabel(change.reason); }).filter(Boolean)[0]) : '') + '</p>' : '',
      hasManualBaseline ? '<p class="dashboard-integration-warning">El valor original fue manual o no estaba disponible en FareHarbor.</p>' : '',
      '<div class="table-container dashboard-integration-table-container">',
      '<table class="data-table dashboard-integration-diff-table">',
      '<thead><tr><th>Campo</th><th>Baseline aplicado</th><th>Interno actual</th><th>Nuevo FareHarbor</th></tr></thead>',
      '<tbody>',
      getArray(group.changes).map(function (change) {
        return [
          '<tr>',
          '<td>' + escapeHtml(getFieldLabel(change.field)) + '</td>',
          '<td>' + escapeHtml(formatFareHarborDiffValue(change.baseline_external)) + '</td>',
          '<td>' + escapeHtml(formatFareHarborDiffValue(change.internal_current)) + '</td>',
          '<td>' + escapeHtml(formatFareHarborDiffValue(change.fareharbor_new)) + '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody>',
      '</table>',
      '</div>',
      canEdit ? [
        '<div class="dashboard-integration-decision-group">',
        renderFareHarborModificationRadio(group, "apply_external", "Usar FareHarbor", disabled || !options.canApplyExternal, options.canApplyExternal ? "" : options.applyDisabledReason),
        renderFareHarborModificationRadio(group, "keep_internal", "Mantener actual", disabled || !options.canKeepInternal, ""),
        options.canManual ? renderFareHarborModificationRadio(group, "manual", "Resolver manualmente", disabled, options.manualDisabledReason) : "",
        '</div>',
        renderFareHarborModificationManualControls(group),
        !decision ? '<p class="form-message is-info">Selecciona una decisión para este cambio.</p>' : ''
      ].join("") : '<p class="card-text dashboard-integration-readonly">Solo lectura.</p>',
      '</div>'
    ].join("");
  }

  function getFareHarborModificationMissingDecisions(preview) {
    return getFareHarborModificationGroups(preview).filter(function (group) {
      return !getFareHarborModificationDecision(group.key);
    }).map(function (group) {
      return group.label;
    });
  }

  function getFareHarborModificationValidation(evento, diff) {
    const preview = getFareHarborModificationPreview(diff);
    const groups = getFareHarborModificationGroups(preview);
    const blockers = getFareHarborModificationEventBlockers(preview);
    const errors = [];

    if (!preview.diff_fingerprint) {
      errors.push("Falta el fingerprint actual del diff.");
    }

    if (blockers.length > 0) {
      errors.push("Esta modificación no puede aplicarse: " + blockers.map(getFareHarborModificationIssueLabel).join(" "));
    }

    groups.forEach(function (group) {
      const decision = getFareHarborModificationDecision(group.key);
      const options = getFareHarborModificationGroupOptions(preview, group);

      if (!decision) {
        errors.push("Falta revisar: " + group.label + ".");
        return;
      }

      if (decision === "apply_external" && !options.canApplyExternal) {
        errors.push(group.label + ": no se puede usar FareHarbor. " + options.applyDisabledReason);
      }

      if (decision === "manual" && !options.canManual) {
        errors.push(group.label + ": no permite resolución manual.");
      }

      if (decision === "manual" && group.key === "tour_turno_group") {
        if (!getFareHarborModificationManualValue("id_tour")) {
          errors.push("Selecciona el tour interno.");
        }

        if (TURNOS_VALIDOS.indexOf(getFareHarborModificationManualValue("turno")) === -1) {
          errors.push("Selecciona un turno válido.");
        }
      }

      if (decision === "manual" && group.key === "passengers_group") {
        const ninos = Number(getFareHarborModificationManualValue("ninos"));
        const pax = getFareHarborModificationPaxForManual(group);

        if (!Number.isInteger(ninos) || ninos < 0 || (pax !== null && ninos > pax)) {
          errors.push("Niños debe ser un entero entre 0 y PAX.");
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  function canApplyModification(diff) {
    return getFareHarborModificationValidation(integrationState.modalEvent, diff).valid;
  }

  function updateFareHarborModificationApplyButtonState() {
    const button = document.querySelector('[data-dialog-action="apply-modification"]');

    if (!button || !isFareHarborModificationEvent(integrationState.modalEvent)) {
      return;
    }

    button.disabled = integrationState.actionLoading || !canApplyModification(integrationState.modalDiff);
  }
  function buildFareHarborModificationApplyBody(diff) {
    const preview = getFareHarborModificationPreview(diff);
    const groups = getFareHarborModificationGroups(preview);
    const body = {
      diff_fingerprint: preview.diff_fingerprint,
      decisions: {},
      completar: {}
    };

    groups.forEach(function (group) {
      const decision = getFareHarborModificationDecision(group.key);

      if (!decision) {
        return;
      }

      body.decisions[group.key] = decision;

      if (decision === "manual" && group.key === "tour_turno_group") {
        body.completar.id_tour = Number(getFareHarborModificationManualValue("id_tour"));
        body.completar.turno = getFareHarborModificationManualValue("turno");
      }

      if (decision === "manual" && group.key === "passengers_group") {
        body.completar.ninos = Number(getFareHarborModificationManualValue("ninos"));
      }
    });

    return body;
  }

  function allFareHarborModificationDecisionsKeepInternal(diff) {
    const groups = getFareHarborModificationGroups(getFareHarborModificationPreview(diff));

    return groups.length > 0 && groups.every(function (group) {
      return getFareHarborModificationDecision(group.key) === "keep_internal";
    });
  }

  function isFareHarborModificationNoop(diff) {
    return getFareHarborModificationGroups(getFareHarborModificationPreview(diff)).length === 0;
  }
  function renderFareHarborModificationDiff(evento, diff) {
    const preview = getFareHarborModificationPreview(diff);
    const changes = getArray(preview.changes);
    const groups = getFareHarborModificationGroups(preview);
    const currentEvent = getObject(preview.current_event);
    const baseline = getObject(preview.baseline);
    const reservationContext = getObject(preview.reservation_context);
    const canEdit = Boolean(App.auth && App.auth.esAdministrador() && evento && evento.application_status === "not_applied");
    const missing = getFareHarborModificationMissingDecisions(preview);
    const eventBlockers = getFareHarborModificationEventBlockers(preview);
    const snapshotLabel = currentEvent.is_latest_snapshot === true
      ? "Más reciente"
      : (currentEvent.is_latest_snapshot === false ? "Obsoleto" : EMPTY_VALUE);
    const transportLabel = reservationContext.assigned_to_transport
      ? "Asignada a transporte"
      : "Sin transporte asignado";

    preserveFareHarborModificationStateForDiff(diff);

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Modificación FareHarbor</h3>",
      '<p class="form-message is-info">' + escapeHtml(getFareHarborModificationSummary(preview, changes)) + "</p>",
      '<div class="dashboard-integration-detail-grid">',
      renderDetailItem("Booking FareHarbor", maskExternalBookingId(preview.external_booking_id || (evento && evento.external_booking_id))),
      renderDetailItem("Reservación interna", preview.id_reservacion),
      renderDetailItem("Revisión", getReviewStatusLabel(evento && evento.review_status)),
      renderDetailItem("Aplicación", getApplicationStatusLabel(evento && evento.application_status)),
      renderDetailItem("Snapshot", snapshotLabel),
      renderDetailItem("Recibido", formatDateTimeLocal(currentEvent.source_received_at || (evento && evento.source_received_at))),
      renderDetailItem("Baseline", baseline.id_evento_integracion ? "Evento " + baseline.id_evento_integracion : preview.baseline_status),
      renderDetailItem("Transporte", transportLabel),
      renderDetailItem("Estado interno", reservationContext.estado),
      renderDetailItem("Fingerprint", preview.diff_fingerprint ? String(preview.diff_fingerprint).slice(0, 12) + "..." : EMPTY_VALUE),
      "</div>",
      evento && evento.review_status === "pending_review"
        ? '<p class="form-message is-info">Puedes preparar decisiones, pero primero debes aprobar la modificación.</p>'
        : "",
      reservationContext.assigned_to_transport
        ? '<p class="dashboard-integration-warning">La reservación ya tiene transporte asignado; algunos cambios operativos pueden quedar bloqueados.</p>'
        : "",
      "</section>",
      eventBlockers.length
        ? renderFareHarborModificationIssues("Esta modificación no puede aplicarse", eventBlockers, "form-message is-error")
        : "",
      renderFareHarborModificationIssues("Bloqueos de campo", getArray(preview.blocking_issues).filter(function (issue) { return !isFareHarborModificationEventBlocker(issue); }), "dashboard-integration-warning"),
      renderFareHarborModificationIssues("Advertencias", preview.warnings, "dashboard-integration-warning"),
      '<section class="dashboard-integration-block">',
      "<h3>Decisiones</h3>",
      !groups.length
        ? App.ui.emptyState("Sin cambios relevantes", "No hay datos de la reservación que actualizar.")
        : groups.map(function (group) {
            return renderFareHarborModificationGroup(preview, group, canEdit);
          }).join(""),
      missing.length && canEdit
        ? '<p id="fhmod-decision-status" class="form-message is-info">Falta revisar: ' + missing.map(App.ui.escapeHtml).join(", ") + '.</p>'
        : '<p id="fhmod-decision-status" class="form-message is-info">' + (groups.length ? "Decisiones completas." : "Evento listo para reconciliación sin cambios.") + '</p>',
      "</section>"
    ].join("");
  }
  function getFareHarborApplicationPreview(evento) {
    return getObject(evento && evento.fareharbor_application_preview);
  }

  function getFareHarborReservationCandidate(evento) {
    return getObject(getFareHarborApplicationPreview(evento).reservation_candidate);
  }

  function formatFareHarborPreviewCategories(categories) {
    const data = getArray(categories).filter(function (category) {
      return category && category.count !== null && category.count !== undefined;
    });

    if (!data.length) {
      return EMPTY_VALUE;
    }

    return data.map(function (category) {
      const label = category.plural || category.singular || "Categoria";
      return String(category.count) + " " + label;
    }).join(", ");
  }

  function getFareHarborManualMissingFields(evento) {
    return getFareHarborManualFieldErrors(evento).map(function (error) {
      return error.field;
    });
  }

  function updateFareHarborPreviewStatus() {
    const status = document.getElementById("fareharbor-preview-status");
    const evento = integrationState.modalEvent;

    if (!status || !evento || !isFareHarborEvent(evento)) {
      return;
    }

    const validation = getFareHarborApplyValidation(evento);
    const missing = getFareHarborManualMissingFields(evento);

    if (validation.valid) {
      status.className = "form-message is-info";
      status.textContent = "Datos completos para aplicación.";
      return;
    }

    status.className = "form-message is-info";
    status.textContent = missing.length
      ? "Faltan datos: " + missing.map(getFieldLabel).join(", ") + "."
      : validation.errors.join(" ");
  }

  function renderFareHarborReadonlyCandidate(label, value) {
    return renderDetailItem(label, value === null || value === undefined || value === "" ? EMPTY_VALUE : value);
  }

  function renderFareHarborManualName(evento) {
    const value = getFareHarborManualValue("nombre_cliente");

    if (!needsManualField(evento, "nombre_cliente") || !canEditIntegrationManually()) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Nombre *</span>',
      '<input id="fareharbor-customer-name" type="text" maxlength="120" required value="' + App.ui.escapeHtml(value) + '">',
      "</label>"
    ].join("");
  }

  function renderFareHarborManualChildren(evento) {
    const value = getFareHarborManualValue("ninos");
    const pax = getFareHarborPax(evento);

    if (!needsManualField(evento, "ninos") || !canEditIntegrationManually()) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Niños *</span>',
      '<input id="fareharbor-ninos" type="number" min="0"' + (pax !== null ? ' max="' + App.ui.escapeHtml(pax) + '"' : '') + ' step="1" required value="' + App.ui.escapeHtml(value) + '">',
      "</label>"
    ].join("");
  }

  function renderFareHarborPickupTimeInput(evento) {
    const value = getFareHarborManualValue("pickup_time");

    if (!needsManualField(evento, "pickup_time") || !canEditIntegrationManually()) {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Hora de pickup *</span>',
      '<input id="integration-pickup-time" type="time" required value="' + App.ui.escapeHtml(value) + '">',
      "</label>"
    ].join("");
  }

  function renderFareHarborApplicationPreview(evento) {
    const preview = getFareHarborApplicationPreview(evento);
    const external = getObject(preview.external);
    const candidate = getObject(preview.reservation_candidate);
    const sources = getObject(preview.sources);
    const tourSource = getObject(sources.tour);
    const pickupSource = getObject(sources.pickup);
    const issues = getArray(preview.issues);
    const missingFields = getNewBookingMissingFields(evento);

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Datos externos FareHarbor</h3>",
      evento.review_status === "pending_review"
        ? '<p class="form-message is-info">Aprueba esta reserva FareHarbor antes de aplicarla.</p>'
        : '<p class="form-message is-info">Completa los datos manuales requeridos para aplicar la reserva.</p>',
      '<div class="dashboard-integration-detail-grid">',
      renderDetailItem("Actividad externa", external.activity_title),
      renderDetailItem("Opción externa", external.option_title),
      renderDetailItem("Status", external.booking_status),
      renderDetailItem("Inicio", formatDateTime(external.start_at)),
      renderDetailItem("Fin", formatDateTime(external.end_at)),
      renderDetailItem("PAX", candidate.pax),
      renderDetailItem("Categorías", formatFareHarborPreviewCategories(external.categories)),
      "</div>",
      "</section>",
      '<section class="dashboard-integration-block">',
      "<h3>Datos para reservación</h3>",
      missingFields.length
        ? '<p id="fareharbor-preview-status" class="form-message is-info">Faltan datos: ' + missingFields.map(getFieldLabel).join(", ") + ".</p>"
        : '<p id="fareharbor-preview-status" class="form-message is-info">Datos completos para aplicación.</p>',
      issues.length
        ? '<div class="dashboard-integration-warning">' + issues.map(function (issue) {
            return "<p>" + App.ui.escapeHtml(issue) + "</p>";
          }).join("") + "</div>"
        : "",
      '<div class="dashboard-integration-detail-grid">',
      renderFareHarborReadonlyCandidate("Fecha", candidate.fecha),
      tourSource.source === "equivalence"
        ? renderFareHarborReadonlyCandidate("Tour", candidate.tour || candidate.id_tour)
        : "",
      tourSource.source === "equivalence"
        ? renderFareHarborReadonlyCandidate("Turno", candidate.turno)
        : "",
      renderFareHarborReadonlyCandidate("Nombre", candidate.nombre_cliente),
      renderFareHarborReadonlyCandidate("Teléfono", candidate.telefono_cliente || "Opcional sin capturar"),
      renderFareHarborReadonlyCandidate("PAX", candidate.pax),
      getObject(sources.children).source === "derived"
        ? renderFareHarborReadonlyCandidate("Niños", candidate.ninos)
        : "",
      pickupSource.pickup_place !== "manual"
        ? renderFareHarborReadonlyCandidate("Pickup place", candidate.pickup_place)
        : "",
      pickupSource.pickup_time !== "manual"
        ? renderFareHarborReadonlyCandidate("Pickup time", candidate.pickup_time)
        : "",
      renderFareHarborReadonlyCandidate("Precio total", candidate.precio_total),
      renderFareHarborReadonlyCandidate("Depósito", candidate.deposito),
      renderFareHarborReadonlyCandidate("Balance pendiente", candidate.saldo),
      renderFareHarborReadonlyCandidate("País", candidate.pais),
      renderFareHarborReadonlyCandidate("Plataforma", candidate.plataforma),
      renderFareHarborReadonlyCandidate("Estado", candidate.estado),
      renderFareHarborReadonlyCandidate("Idioma", candidate.idioma || "Sin definir"),
      renderFareHarborReadonlyCandidate("Pickup recibido", pickupSource.pickup_place !== "manual" ? "Sí" : "No recibido"),
      renderFareHarborReadonlyCandidate("Lodging", pickupSource.lodging_present ? "Presente" : "No recibido"),
      renderFareHarborReadonlyCandidate("Arrival", pickupSource.arrival_present ? "Presente" : "No recibido"),
      "</div>",
      renderTourSelect(evento),
      renderTurnoSelect(evento),
      renderFareHarborManualName(evento),
      renderFareHarborManualChildren(evento),
      renderPickupPlaceInput(evento),
      renderFareHarborPickupTimeInput(evento),
      "</section>"
    ].join("");
  }
  function getFareHarborCancellationPreview(diff) {
    const data = getObject(diff);

    return getObject(data.fareharbor_cancellation_preview || data.cancellation_preview || data);
  }

  function getFareHarborCancellationModeLabel(mode) {
    if (mode === "cancel_reservation") {
      return "Cancelar reservación";
    }

    if (mode === "reconcile_already_cancelled") {
      return "Reconciliar ya cancelada";
    }

    if (mode === "resolve_without_link") {
      return "Resolver sin vínculo";
    }

    if (mode === "link_broken") {
      return "Vínculo inconsistente";
    }

    return mode || EMPTY_VALUE;
  }

  function getFareHarborCancellationApplyLabel(diff) {
    const mode = getFareHarborCancellationPreview(diff).resolution_mode;

    if (mode === "cancel_reservation") {
      return "Cancelar reservación";
    }

    if (mode === "reconcile_already_cancelled") {
      return "Marcar como reconciliada";
    }

    if (mode === "resolve_without_link") {
      return "Marcar como resuelta";
    }

    return "Aplicar cancelación";
  }

  function getFareHarborCancellationSummary(preview) {
    const mode = preview && preview.resolution_mode;

    if (mode === "cancel_reservation") {
      return "Esta cancelación afectará una reservación existente.";
    }

    if (mode === "reconcile_already_cancelled") {
      return "La reservación vinculada ya se encuentra cancelada; el evento puede reconciliarse sin cancelar de nuevo.";
    }

    if (mode === "resolve_without_link") {
      return "FareHarbor reportó una cancelación, pero no existe reservación interna vinculada. Puedes marcar el evento como resuelto sin modificar reservaciones.";
    }

    if (mode === "link_broken") {
      return "El evento apunta a una reservación interna inconsistente. Requiere revisión manual y no puede aplicarse desde este modal.";
    }

    return "Revisa la cancelación FareHarbor antes de resolverla.";
  }

  function formatFareHarborCancellationIssue(issue) {
    if (!issue) {
      return "";
    }

    if (typeof issue === "string") {
      return issue;
    }

    return issue.message || issue.mensaje || issue.reason || issue.code || JSON.stringify(issue);
  }

  function getFareHarborCancellationBlockers(preview) {
    return getArray(preview && preview.blocking_issues).map(formatFareHarborCancellationIssue).filter(Boolean);
  }

  function getFareHarborCancellationWarnings(preview) {
    return getArray(preview && preview.warnings).map(formatFareHarborCancellationIssue).filter(Boolean);
  }

  function isFareHarborCancellationLatest(preview) {
    const currentEvent = getObject(preview && preview.current_event);

    return currentEvent.is_latest_snapshot === true;
  }

  function getFareHarborCancellationValidation(evento, diff) {
    const preview = getFareHarborCancellationPreview(diff);
    const blockers = getFareHarborCancellationBlockers(preview);
    const errors = blockers.slice();
    const mode = preview.resolution_mode;

    if (!isFareHarborCancellationEvent(evento)) {
      errors.push("El evento no es una cancelación FareHarbor.");
    }

    if (!isFareHarborCancellationLatest(preview)) {
      errors.push("Existe una actualización más reciente de esta reserva FareHarbor.");
    }

    if (!preview.cancellation_fingerprint) {
      errors.push("Falta la huella de cancelación. Actualiza los datos antes de aplicar.");
    }

    if (["cancel_reservation", "reconcile_already_cancelled", "resolve_without_link"].indexOf(mode) === -1) {
      errors.push("Esta cancelación requiere revisión manual.");
    }

    if (mode === "cancel_reservation" && !getFareHarborCancellationReason()) {
      errors.push("El motivo de cancelación es obligatorio.");
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  function canApplyFareHarborCancellation(diff) {
    return getFareHarborCancellationValidation(integrationState.modalEvent, diff).valid;
  }

  function updateFareHarborCancellationApplyButtonState() {
    const button = document.querySelector('[data-dialog-action="apply-fareharbor-cancellation"]');
    const status = document.getElementById("fhcancel-apply-status");
    const reason = getFareHarborCancellationReason();

    if (status) {
      status.textContent = reason ? "Motivo capturado." : "Captura el motivo para cancelar la reservación.";
    }

    if (!button || !isFareHarborCancellationEvent(integrationState.modalEvent)) {
      return;
    }

    button.disabled = integrationState.actionLoading || !canApplyFareHarborCancellation(integrationState.modalDiff);
  }

  function buildFareHarborCancellationApplyBody(diff) {
    const preview = getFareHarborCancellationPreview(diff);
    const body = {
      cancellation_fingerprint: preview.cancellation_fingerprint
    };

    if (preview.resolution_mode === "cancel_reservation") {
      body.motivo_cancelacion = getFareHarborCancellationReason();
    }

    return body;
  }

  function getFareHarborCancellationApplyConfirmation(diff) {
    const preview = getFareHarborCancellationPreview(diff);

    if (preview.resolution_mode === "cancel_reservation") {
      return "Se cancelará la reservación interna vinculada.\n¿Deseas continuar?";
    }

    if (preview.resolution_mode === "reconcile_already_cancelled") {
      return "La reservación ya está cancelada; el evento se marcará como reconciliado.\n¿Deseas continuar?";
    }

    if (preview.resolution_mode === "resolve_without_link") {
      return "El evento se marcará como resuelto sin modificar reservaciones.\n¿Deseas continuar?";
    }

    return "Se resolverá la cancelación FareHarbor.\n¿Deseas continuar?";
  }

  function getFareHarborCancellationSuccessMessage(response, diff) {
    const datos = response && (response.datos || response.data);
    const mode = (datos && datos.resolution_mode) || getFareHarborCancellationPreview(diff).resolution_mode;

    if (mode === "cancel_reservation") {
      return "Reservación cancelada correctamente.";
    }

    if (mode === "reconcile_already_cancelled") {
      return "Cancelación reconciliada correctamente.";
    }

    if (mode === "resolve_without_link") {
      return "Cancelación marcada como resuelta.";
    }

    return "Cancelación FareHarbor aplicada correctamente.";
  }

  function renderFareHarborCancellationIssues(title, issues, className) {
    const items = getArray(issues).map(formatFareHarborCancellationIssue).filter(Boolean);

    if (!items.length) {
      return "";
    }

    return [
      '<section class="dashboard-integration-block">',
      "<h3>" + App.ui.escapeHtml(title) + "</h3>",
      '<div class="' + (className || "dashboard-integration-warning") + '">',
      items.map(function (issue) {
        return '<p>' + App.ui.escapeHtml(issue) + '</p>';
      }).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderFareHarborCancellationReason(evento, preview, canEdit) {
    if (!canEdit || preview.resolution_mode !== "cancel_reservation") {
      return "";
    }

    return [
      '<label class="field dashboard-integration-full">',
      '<span>Motivo de cancelación *</span>',
      '<textarea id="fareharbor-cancellation-reason" class="dashboard-integration-textarea" required>' + App.ui.escapeHtml(integrationState.fareHarborCancellationReason || "") + '</textarea>',
      "</label>"
    ].join("");
  }

  function renderFareHarborCancellationPreview(evento, diff) {
    const preview = getFareHarborCancellationPreview(diff);
    const currentEvent = getObject(preview.current_event);
    const reservationContext = getObject(preview.reservation_context);
    const isAdmin = Boolean(App.auth && App.auth.esAdministrador());
    const canEdit = Boolean(isAdmin && evento && evento.review_status === "approved" && evento.application_status === "not_applied");
    const snapshotLabel = currentEvent.is_latest_snapshot === true
      ? "Más reciente"
      : (currentEvent.is_latest_snapshot === false ? "Obsoleto" : EMPTY_VALUE);
    const transportLabel = reservationContext.assigned_to_transport
      ? "Asignada a transporte"
      : "Sin transporte asignado";

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Cancelación FareHarbor</h3>",
      '<p class="form-message is-info">' + escapeHtml(getFareHarborCancellationSummary(preview)) + "</p>",
      '<div class="dashboard-integration-detail-grid">',
      renderDetailItem("Booking FareHarbor", maskExternalBookingId(preview.external_booking_id || (evento && evento.external_booking_id))),
      renderDetailItem("Estado FareHarbor", preview.booking_status),
      renderDetailItem("Resolución", getFareHarborCancellationModeLabel(preview.resolution_mode)),
      renderDetailItem("Revisión", getReviewStatusLabel(evento && evento.review_status)),
      renderDetailItem("Aplicación", getApplicationStatusLabel(evento && evento.application_status)),
      renderDetailItem("Snapshot", snapshotLabel),
      renderDetailItem("Recibido", formatDateTimeLocal(currentEvent.source_received_at || (evento && evento.source_received_at))),
      renderDetailItem("Reservación interna", reservationContext.id_reservacion),
      renderDetailItem("Código", reservationContext.codigo),
      renderDetailItem("Fecha", formatDate(reservationContext.fecha)),
      renderDetailItem("Tour", reservationContext.id_tour),
      renderDetailItem("Turno", reservationContext.turno),
      renderDetailItem("Estado interno", reservationContext.estado),
      renderDetailItem("Transporte", transportLabel),
      renderDetailItem("Fingerprint", preview.cancellation_fingerprint ? String(preview.cancellation_fingerprint).slice(0, 12) + "..." : EMPTY_VALUE),
      "</div>",
      evento && evento.review_status === "pending_review"
        ? '<p class="form-message is-info">Aprueba esta cancelación FareHarbor antes de resolverla.</p>'
        : "",
      preview.resolution_mode === "link_broken"
        ? '<p class="form-message is-error">El vínculo interno está inconsistente. No se puede aplicar automáticamente.</p>'
        : "",
      "</section>",
      renderFareHarborCancellationIssues("Esta cancelación no puede aplicarse", getFareHarborCancellationBlockers(preview), "form-message is-error"),
      renderFareHarborCancellationIssues("Advertencias", getFareHarborCancellationWarnings(preview), "dashboard-integration-warning"),
      renderFareHarborCancellationReason(evento, preview, canEdit),
      canEdit && preview.resolution_mode === "cancel_reservation"
        ? '<p id="fhcancel-apply-status" class="form-message is-info">' + (getFareHarborCancellationReason() ? "Motivo capturado." : "Captura el motivo para cancelar la reservación.") + '</p>'
        : ""
    ].join("");
  }
  function renderFareHarborReadOnly(evento) {
    const preview = getFareHarborApplicationPreview(evento);

    if (preview.tipo === "preview") {
      return renderFareHarborApplicationPreview(evento);
    }

    const booking = getFareHarborBooking(evento);
    const availability = getFareHarborAvailability(evento);
    const item = getFareHarborItem(evento);
    const customers = getFareHarborCustomers(evento);
    const money = getFareHarborMoney(evento);
    const pickup = getFareHarborPickup(evento);
    const currency = money.currency || null;

    return [
      '<section class="dashboard-integration-block">',
      "<h3>Reserva FareHarbor</h3>",
      evento.review_status === "pending_review"
        ? '<p class="form-message is-info">Aprueba esta reserva FareHarbor antes de aplicarla.</p>'
        : '<p class="form-message is-info">Completa los datos manuales requeridos para aplicar la reserva.</p>',
      '<div class="dashboard-integration-detail-grid">',
      renderDetailItem("Display ID", booking.display_id),
      renderDetailItem("Estado externo", booking.status),
      renderDetailItem("Actividad", item.name || item.headline),
      renderDetailItem("Inicio", formatDateTime(availability.start_at)),
      renderDetailItem("Fin", formatDateTime(availability.end_at)),
      renderDetailItem("PAX", customers.total),
      renderDetailItem("Categorias", formatFareHarborCategories(evento)),
      renderDetailItem("Moneda", currency ? String(currency).toUpperCase() : EMPTY_VALUE),
      renderDetailItem("Invoice price", formatFareHarborMoneyValue(money.invoice_price_display, money.invoice_price, currency)),
      renderDetailItem("Receipt total", formatFareHarborMoneyValue(money.receipt_total_display, money.receipt_total, currency)),
      renderDetailItem("Amount paid", formatFareHarborMoneyValue(money.amount_paid_display, money.amount_paid, currency)),
      renderDetailItem("Pickup", formatFareHarborPresence(pickup.pickup_present)),
      renderDetailItem("Lodging", formatFareHarborPresence(pickup.lodging_present)),
      renderDetailItem("Arrival", formatFareHarborPresence(pickup.arrival_present)),
      "</div>",
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


  function renderDialogActions(evento, diff) {
    if (isFareHarborEvent(evento)) {
      const isAdmin = App.auth && App.auth.esAdministrador();
      const reviewStatus = evento && evento.review_status;
      const applicationStatus = evento && evento.application_status;
      const disabled = integrationState.actionLoading ? " disabled" : "";
      const actions = ['<button class="btn" type="button" data-dialog-action="close">Cerrar</button>'];

      if (isFareHarborModificationEvent(evento)) {
        if (!isAdmin) {
          actions.unshift('<span class="card-text dashboard-integration-readonly">Modo consulta: solo lectura.</span>');
          return actions.join("");
        }

        if (reviewStatus === "pending_review") {
          actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="approve-modification"' + disabled + ">Aprobar</button>");
        } else if (reviewStatus === "approved" && applicationStatus === "not_applied") {
          const applyLabel = isFareHarborModificationNoop(diff) ? "Marcar como revisado" : "Aplicar modificación";
          actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="apply-modification"' + disabled + (canApplyModification(diff) ? "" : " disabled") + ">" + applyLabel + "</button>");
        }

        return actions.join("");
      }

      if (isFareHarborCancellationEvent(evento)) {
        if (!isAdmin) {
          actions.unshift('<span class="card-text dashboard-integration-readonly">Modo consulta: solo lectura.</span>');
          return actions.join("");
        }

        if (reviewStatus === "pending_review") {
          actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="approve-fareharbor-cancellation"' + disabled + ">Aprobar</button>");
        } else if (reviewStatus === "approved" && applicationStatus === "not_applied" && getFareHarborCancellationPreview(diff).resolution_mode !== "link_broken") {
          actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="apply-fareharbor-cancellation"' + disabled + (canApplyFareHarborCancellation(diff) ? "" : " disabled") + ">" + getFareHarborCancellationApplyLabel(diff) + "</button>");
        }

        return actions.join("");
      }

      if (!isAdmin) {
        actions.unshift('<span class="card-text dashboard-integration-readonly">Modo consulta: solo lectura.</span>');
        return actions.join("");
      }

      if (evento && evento.event_type === "new_booking" && reviewStatus === "pending_review") {
        actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="approve-fareharbor"' + disabled + ">Aprobar</button>");
      } else if (evento && evento.event_type === "new_booking" && reviewStatus === "approved" && applicationStatus === "not_applied") {
        actions.unshift('<button class="btn btn-primary" type="button" data-dialog-action="apply-fareharbor"' + disabled + (isFareHarborReadyForApply(evento) ? "" : " disabled") + ">Aplicar reservación</button>");
      }

      return actions.join("");
    }

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
        actions.push('<button class="btn btn-primary" type="button" data-dialog-action="apply-modification"' + disabled + (getObject(diff).aplicable !== false ? "" : " disabled") + ">Aplicar modificación</button>");
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
    } else if (isFareHarborModificationEvent(evento)) {
      content = renderFareHarborModificationDiff(evento, diff);
    } else if (isFareHarborCancellationEvent(evento)) {
      content = renderFareHarborCancellationPreview(evento, diff);
    } else if (isFareHarborEvent(evento)) {
      content = [
        renderCommonIntegrationDetails(evento),
        renderFareHarborReadOnly(evento)
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

    ["integration-tour-id", "integration-turno", "integration-pickup-place", "integration-pickup-time", "fareharbor-customer-name", "fareharbor-ninos"].forEach(function (id) {
      const input = document.getElementById(id);

      if (input) {
        input.addEventListener("input", function () {
          if (integrationState.modalEvent && isFareHarborEvent(integrationState.modalEvent)) {
            saveFareHarborManualInputs();
          }

          updateNewBookingApplyButtonState();
          updateFareHarborPreviewStatus();
        });
        input.addEventListener("change", function () {
          if (integrationState.modalEvent && isFareHarborEvent(integrationState.modalEvent)) {
            saveFareHarborManualInputs();
          }

          updateNewBookingApplyButtonState();
          updateFareHarborPreviewStatus();
        });
      }
    });

    host.querySelectorAll("[data-fhmod-decision]").forEach(function (input) {
      input.addEventListener("change", function () {
        setFareHarborModificationDecision(input.getAttribute("data-fhmod-decision"), input.value);
        renderIntegrationDialog();
      });
    });

    host.querySelectorAll("[data-fhmod-manual]").forEach(function (input) {
      input.addEventListener("input", function () {
        saveFareHarborModificationInputs();
        updateFareHarborModificationApplyButtonState();
      });
      input.addEventListener("change", function () {
        saveFareHarborModificationInputs();
        updateFareHarborModificationApplyButtonState();
      });
    });

    ["fareharbor-cancellation-reason"].forEach(function (id) {
      const input = document.getElementById(id);

      if (input) {
        input.addEventListener("input", function () {
          saveFareHarborCancellationInputs();
          updateFareHarborCancellationApplyButtonState();
        });
        input.addEventListener("change", function () {
          saveFareHarborCancellationInputs();
          updateFareHarborCancellationApplyButtonState();
        });
      }
    });

    updateNewBookingApplyButtonState();
    updateFareHarborPreviewStatus();
    updateFareHarborModificationApplyButtonState();
    updateFareHarborCancellationApplyButtonState();
  }
  async function loadIntegrationPendientes(options) {
    const config = options || {};

    if (!isDashboardActive() || isRestricted()) {
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

  async function openIntegrationDialog(id, options) {
    const config = options || {};

    if (!config.preserveFareHarborManualValues) {
      resetFareHarborManualValues();
    }

    if (!config.preserveFareHarborModificationState) {
      resetFareHarborModificationState();
    }

    if (!config.preserveFareHarborCancellationState) {
      resetFareHarborCancellationState();
    }

    integrationState.modalEvent = null;
    integrationState.modalDiff = null;
    integrationState.modalError = "";
    integrationState.modalLoading = true;
    renderIntegrationDialog();

    try {
      const detailResponse = await App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id));
      const evento = getIntegrationDetail(detailResponse);
      let diff = null;

      if (evento && (evento.event_type === "modification" || isFareHarborCancellationEvent(evento))) {
        const diffResponse = await App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/diff");
        diff = getIntegrationDetail(diffResponse);
      }

      if (evento && evento.event_type === "new_booking" && needsManualField(evento, "id_tour")) {
        await loadIntegrationToursIfNeeded();
      }

      if (isFareHarborModificationEvent(evento)) {
        await loadIntegrationToursIfNeeded();
        preserveFareHarborModificationStateForDiff(diff);
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
    resetFareHarborManualValues();
    resetFareHarborModificationState();
    resetFareHarborCancellationState();

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

  async function applyFareHarborModificationEvent(id, body) {
    return App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/aplicar", {
      method: "POST",
      body: body
    });
  }

  async function applyFareHarborCancellationEvent(id, body) {
    return App.api.apiFetch("/api/eventos-integracion/" + encodeURIComponent(id) + "/aplicar", {
      method: "POST",
      body: body
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

  function getFareHarborApplySuccessMessage(response) {
    const datos = response && (response.datos || response.data);

    if (datos && datos.codigo) {
      return "Reservación registrada correctamente: " + datos.codigo;
    }

    return "Reservación registrada correctamente.";
  }

  function getFareHarborApplyErrorMessage(error) {
    const data = error && error.data ? error.data : null;

    if (error && error.isNetworkError) {
      return "No hay conexion con el backend. Revisa que el servidor este activo.";
    }

    if (error && error.status === 404) {
      return "El evento o uno de los catálogos necesarios ya no está disponible.";
    }

    if (error && error.status >= 500) {
      return "No fue posible registrar la reservación.";
    }

    if (data && Array.isArray(data.errores) && data.errores.length > 0) {
      return data.errores.map(function (item) {
        return typeof item === "string" ? item : (item && item.mensaje ? item.mensaje : JSON.stringify(item));
      }).join(" ");
    }

    if (data && Array.isArray(data.missing_fields) && data.missing_fields.length > 0) {
      return "Faltan datos obligatorios: " + data.missing_fields.map(getFieldLabel).join(", ") + ".";
    }

    if (data && data.mensaje) {
      return data.mensaje;
    }

    return "No fue posible registrar la reservación.";
  }

  function shouldCloseFareHarborAfterConflict(message) {
    const text = String(message || "").toLowerCase();

    return text.indexOf("actualización") !== -1
      || text.indexOf("actualizacion") !== -1
      || text.indexOf("vinculad") !== -1;
  }

  async function approveFareHarborBooking() {
    const id = getCurrentIntegrationId();

    saveFareHarborManualInputs();
    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await approveIntegrationEvent(id);
      integrationState.message = "Evento FareHarbor aprobado.";
      await loadIntegrationPendientes({ silent: true });
      integrationState.actionLoading = false;
      await openIntegrationDialog(id, { preserveFareHarborManualValues: true });
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible aprobar el evento FareHarbor."));
    }
  }

  async function applyFareHarborBooking() {
    const evento = integrationState.modalEvent;
    const id = getCurrentIntegrationId();
    let validation;
    let completar;
    let response;
    let message;

    saveFareHarborManualInputs();
    validation = getFareHarborApplyValidation(evento);

    if (!validation.valid) {
      setModalError(validation.errors.join(" "));
      return;
    }

    completar = buildFareHarborApplyCompletar(evento);

    if (!window.confirm("Se creará una reservación en el Sistema Integrador.\n¿Deseas continuar?")) {
      return;
    }

    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      response = await applyIntegrationEvent(id, completar);
      await refreshAfterIntegrationAction(getFareHarborApplySuccessMessage(response));
    } catch (error) {
      message = getFareHarborApplyErrorMessage(error);

      if (error && error.status === 409 && shouldCloseFareHarborAfterConflict(message)) {
        await refreshAfterIntegrationAction(message);
        return;
      }

      setModalError(message);
    }
  }

  async function applyNewBooking() {
    const evento = integrationState.modalEvent;
    const id = getCurrentIntegrationId();
    const completar = {};
    let approvedInThisAction = false;
    let response;
    const temporalBlockers = getNewBookingTemporalBlockers(evento);

    if (temporalBlockers.length > 0) {
      setModalError(temporalBlockers.join(" "));
      return;
    }

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

    if (needsManualField(evento, "pickup_place")) {
      const pickupPlace = getManualPickupPlaceValue();

      if (!pickupPlace) {
        setModalError("El lugar de pickup es obligatorio.");
        return;
      }

      completar.pickup_place = pickupPlace;
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

    saveFareHarborModificationInputs();
    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await approveIntegrationEvent(id);
      integrationState.message = "Modificacion aprobada. Aun falta aplicarla.";
      await loadIntegrationPendientes({ silent: true });
      integrationState.actionLoading = false;
      await openIntegrationDialog(id, { preserveFareHarborModificationState: true });
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible aprobar la modificación."));
    }
  }

  function getFareHarborModificationApplyConfirmation(diff) {
    if (isFareHarborModificationNoop(diff) || allFareHarborModificationDecisionsKeepInternal(diff)) {
      return "No se modificarán los datos de la reservación; el evento se marcará como revisado.\n¿Deseas continuar?";
    }

    return "Se aplicarán las decisiones seleccionadas a la reservación vinculada.\n¿Deseas continuar?";
  }

  function getFareHarborModificationSuccessMessage(response, diff) {
    const datos = response && (response.datos || response.data);

    if (datos && datos.no_changes_applied) {
      return "Evento FareHarbor reconciliado sin modificar la reservación.";
    }

    if (isFareHarborModificationNoop(diff)) {
      return "Evento FareHarbor marcado como revisado.";
    }

    return "Modificacion FareHarbor aplicada correctamente.";
  }

  function isStaleFareHarborModificationError(error) {
    const message = getIntegrationErrorMessage(error, "");

    return error && error.status === 409 && message.indexOf("La reservación o la modificación cambió") !== -1;
  }

  function shouldCloseFareHarborModificationConflict(error) {
    const message = getIntegrationErrorMessage(error, "").toLowerCase();

    return error && error.status === 409 && (
      message.indexOf("snapshot") !== -1
      || message.indexOf("más reciente") !== -1
      || message.indexOf("mas reciente") !== -1
      || message.indexOf("vinculad") !== -1
    );
  }

  async function applyModification() {
    const evento = integrationState.modalEvent;
    const id = getCurrentIntegrationId();
    let validation;
    let body;
    let response;

    if (isFareHarborModificationEvent(evento)) {
      saveFareHarborModificationInputs();
      validation = getFareHarborModificationValidation(evento, integrationState.modalDiff);

      if (!validation.valid) {
        setModalError(validation.errors.join(" "));
        return;
      }

      if (!window.confirm(getFareHarborModificationApplyConfirmation(integrationState.modalDiff))) {
        return;
      }

      body = buildFareHarborModificationApplyBody(integrationState.modalDiff);
      integrationState.actionLoading = true;
      integrationState.modalError = "";
      renderIntegrationDialog();

      try {
        response = await applyFareHarborModificationEvent(id, body);
        await refreshAfterIntegrationAction(getFareHarborModificationSuccessMessage(response, integrationState.modalDiff));
      } catch (error) {
        if (isStaleFareHarborModificationError(error)) {
          const staleMessage = getIntegrationErrorMessage(error, "La reservación o la modificación cambió. Actualiza los datos antes de aplicar.");
          integrationState.actionLoading = false;
          await openIntegrationDialog(id, { preserveFareHarborModificationState: true });
          integrationState.modalError = staleMessage;
          renderIntegrationDialog();
          return;
        }

        if (shouldCloseFareHarborModificationConflict(error)) {
          await refreshAfterIntegrationAction(getIntegrationErrorMessage(error, "Existe una actualización FareHarbor más reciente."));
          return;
        }

        integrationState.actionLoading = false;
        setModalError(getIntegrationErrorMessage(error, "No fue posible aplicar la modificación."));
      }
      return;
    }

    if (getObject(integrationState.modalDiff).aplicable === false) {
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

  async function approveFareHarborCancellation() {
    const id = getCurrentIntegrationId();

    saveFareHarborCancellationInputs();
    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      await approveIntegrationEvent(id);
      integrationState.message = "Cancelación FareHarbor aprobada. Aun falta resolverla.";
      await loadIntegrationPendientes({ silent: true });
      integrationState.actionLoading = false;
      await openIntegrationDialog(id, { preserveFareHarborCancellationState: true });
    } catch (error) {
      setModalError(getIntegrationErrorMessage(error, "No fue posible aprobar la cancelación."));
    }
  }

  function isStaleFareHarborCancellationError(error) {
    const message = getIntegrationErrorMessage(error, "");

    return error && error.status === 409 && message.indexOf("La cancelación o la reservación cambió") !== -1;
  }

  function shouldCloseFareHarborCancellationConflict(error) {
    const message = getIntegrationErrorMessage(error, "").toLowerCase();

    return error && error.status === 409 && (
      message.indexOf("snapshot") !== -1
      || message.indexOf("más reciente") !== -1
      || message.indexOf("mas reciente") !== -1
      || message.indexOf("vinculad") !== -1
    );
  }

  async function applyFareHarborCancellation() {
    const id = getCurrentIntegrationId();
    let validation;
    let body;
    let response;

    saveFareHarborCancellationInputs();
    validation = getFareHarborCancellationValidation(integrationState.modalEvent, integrationState.modalDiff);

    if (!validation.valid) {
      setModalError(validation.errors.join(" "));
      return;
    }

    if (!window.confirm(getFareHarborCancellationApplyConfirmation(integrationState.modalDiff))) {
      return;
    }

    body = buildFareHarborCancellationApplyBody(integrationState.modalDiff);
    integrationState.actionLoading = true;
    integrationState.modalError = "";
    renderIntegrationDialog();

    try {
      response = await applyFareHarborCancellationEvent(id, body);
      await refreshAfterIntegrationAction(getFareHarborCancellationSuccessMessage(response, integrationState.modalDiff));
    } catch (error) {
      if (isStaleFareHarborCancellationError(error)) {
        const staleMessage = getIntegrationErrorMessage(error, "La cancelación o la reservación cambió. Actualiza los datos antes de aplicar.");
        integrationState.actionLoading = false;
        await openIntegrationDialog(id, { preserveFareHarborCancellationState: true });
        integrationState.modalError = staleMessage;
        renderIntegrationDialog();
        return;
      }

      if (shouldCloseFareHarborCancellationConflict(error)) {
        await refreshAfterIntegrationAction(getIntegrationErrorMessage(error, "Existe una actualización FareHarbor más reciente."));
        return;
      }

      integrationState.actionLoading = false;
      setModalError(getIntegrationErrorMessage(error, "No fue posible aplicar la cancelación."));
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

    if (action === "approve-fareharbor") {
      approveFareHarborBooking();
      return;
    }

    if (action === "apply-fareharbor") {
      applyFareHarborBooking();
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

    if (action === "approve-fareharbor-cancellation") {
      approveFareHarborCancellation();
      return;
    }

    if (action === "apply-fareharbor-cancellation") {
      applyFareHarborCancellation();
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
    resetSession: function () {
      requestId += 1;
      currentFecha = '';
      stopIntegrationRefresh();
      resetIntegrationState();
      resetFareHarborModificationState();
      integrationState.fareHarborManualValues = {};
      integrationState.fareHarborCancellationReason = '';
      integrationState.tours = [];
      integrationState.toursLoaded = false;
      integrationState.toursLoading = false;
      integrationState.toursError = '';
    },
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
      if (!isRestricted()) {
        loadIntegrationPendientes({ silent: false });
        startIntegrationRefresh();
      }
    }
  };
})();
