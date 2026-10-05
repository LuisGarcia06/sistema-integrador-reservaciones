(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const ESTADO_PENDIENTE = "Pendiente";
  const ESTADO_CONFIRMADA = "Confirmada";
  const ESTADO_ACTIVA = "Activa";
  const ESTADO_CANCELADA = "Cancelada";
  const ESTADO_COMPLETADA = "Completada";
  const TURNO_MANANA = "Mañana";
  const TURNO_TARDE = "Tarde";
  const TURNOS = [TURNO_MANANA, TURNO_TARDE];
  const TURNO_SIN_CLASIFICAR = "Sin clasificar";
  const FORM_CREATE = "create";
  const FORM_EDIT = "edit";
  const FORM_DETAIL = "detail";
  const COLUMN_COUNT = 11;
  const PAGE_LIMITS = [25, 50, 100];
  const PRINT_CLEANUP_DELAY_MS = 2000;
  const MONEY_FORMATTER = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  let requestId = 0;
  let catalogRequestId = 0;
  let reservaciones = [];
  let tours = [];
  let paises = [];
  let plataformas = [];
  let estadosConocidos = new Set([ESTADO_PENDIENTE, ESTADO_CONFIRMADA, ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_COMPLETADA]);
  let selectedReservacion = null;
  let selectedCancelReservacion = null;
  let submitLoading = false;
  let cancelLoading = false;
  let actionLoadingId = null;
  let printCleanupTimer = null;
  let printAfterPrintHandler = null;
  let catalogsLoaded = false;
  let pagination = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  };
  let savedState = null;
  let savedStateUserId = null;

  function isAdmin() {
    return Boolean(App.auth && App.auth.esAdministrador && App.auth.esAdministrador());
  }

  function getCurrentUserId() {
    const usuario = App.auth && App.auth.obtenerUsuario ? App.auth.obtenerUsuario() : null;
    return usuario && usuario.id_usuario !== null && usuario.id_usuario !== undefined
      ? String(usuario.id_usuario)
      : "";
  }

  function getDefaultSavedState() {
    return {
      page: 1,
      limit: 25,
      fecha: "",
      turno: "",
      id_tour: "",
      estado: "",
      id_plataforma: "",
      nombre: "",
      codigo: ""
    };
  }

  function ensureSavedStateForCurrentUser() {
    const currentUserId = getCurrentUserId();

    if (savedStateUserId !== currentUserId) {
      savedStateUserId = currentUserId;
      savedState = null;
    }
  }

  function getSavedState() {
    ensureSavedStateForCurrentUser();
    return savedState ? Object.assign(getDefaultSavedState(), savedState) : getDefaultSavedState();
  }

  function normalizeSavedPage(value) {
    const page = Number(value);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function normalizeSavedLimit(value) {
    const limit = Number(value);
    return PAGE_LIMITS.includes(limit) ? limit : 25;
  }

  function captureState(overrides) {
    ensureSavedStateForCurrentUser();

    const elements = getElements();
    const nextState = {
      page: normalizeSavedPage(pagination.page),
      limit: normalizeSavedLimit(pagination.limit),
      fecha: elements.fecha ? elements.fecha.value : "",
      turno: elements.turno ? elements.turno.value : "",
      id_tour: elements.tour ? elements.tour.value : "",
      estado: elements.estado ? elements.estado.value : "",
      id_plataforma: elements.plataforma ? elements.plataforma.value : "",
      nombre: elements.nombre && elements.nombre.value.trim() ? elements.nombre.value.trim() : "",
      codigo: elements.codigo && elements.codigo.value.trim() ? elements.codigo.value.trim() : ""
    };

    savedState = Object.assign(nextState, overrides || {});
    savedState.page = normalizeSavedPage(savedState.page);
    savedState.limit = normalizeSavedLimit(savedState.limit);
  }

  function restoreState() {
    const state = getSavedState();
    const elements = getElements();

    pagination.page = normalizeSavedPage(state.page);
    pagination.limit = normalizeSavedLimit(state.limit);

    if (elements.fecha) {
      elements.fecha.value = state.fecha || "";
    }

    if (elements.turno) {
      elements.turno.value = state.turno || "";
    }

    if (elements.tour) {
      elements.tour.value = state.id_tour || "";
    }

    if (elements.estado) {
      elements.estado.value = state.estado || "";
    }

    if (elements.plataforma) {
      elements.plataforma.value = state.id_plataforma || "";
    }

    if (elements.nombre) {
      elements.nombre.value = state.nombre || "";
    }

    if (elements.codigo) {
      elements.codigo.value = state.codigo || "";
    }
  }

  function resetSavedState() {
    ensureSavedStateForCurrentUser();
    savedState = getDefaultSavedState();
  }

  function getElements() {
    return {
      form: document.getElementById("reservaciones-filtros"),
      fecha: document.getElementById("reservaciones-fecha"),
      turno: document.getElementById("reservaciones-turno"),
      tour: document.getElementById("reservaciones-tour"),
      estado: document.getElementById("reservaciones-estado"),
      plataforma: document.getElementById("reservaciones-plataforma"),
      nombre: document.getElementById("reservaciones-nombre"),
      codigo: document.getElementById("reservaciones-codigo"),
      limpiar: document.getElementById("reservaciones-limpiar"),
      nueva: document.getElementById("reservaciones-nueva"),
      message: document.getElementById("reservaciones-message"),
      tbody: document.getElementById("reservaciones-tbody"),
      pagination: document.getElementById("reservaciones-pagination"),
      paginationSummary: document.getElementById("reservaciones-pagination-summary"),
      paginationPages: document.getElementById("reservaciones-pagination-pages"),
      paginationPrev: document.getElementById("reservaciones-pagination-prev"),
      paginationNext: document.getElementById("reservaciones-pagination-next"),
      paginationLimit: document.getElementById("reservaciones-pagination-limit"),
      dialogHost: document.getElementById("reservaciones-dialog-host"),
      printRoot: document.getElementById("reservacion-print-root")
    };
  }

  function escapeValue(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return App.ui.escapeHtml(EMPTY_VALUE);
    }

    return App.ui.escapeHtml(value);
  }

  function normalizeDate(value) {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === "string") {
      return value.slice(0, 10);
    }

    return "";
  }

  function isValidDateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const parts = value.split("-").map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    return (
      date.getUTCFullYear() === parts[0] &&
      date.getUTCMonth() === parts[1] - 1 &&
      date.getUTCDate() === parts[2]
    );
  }

  function formatDate(value) {
    const date = normalizeDate(value);

    if (!isValidDateValue(date)) {
      return value || EMPTY_VALUE;
    }

    const parts = date.split("-");
    return [parts[2], parts[1], parts[0]].join("/");
  }

  function normalizeTime(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return "";
    }

    const match = String(value).match(/^(\d{2}):(\d{2})/);
    return match ? match[1] + ":" + match[2] : String(value);
  }

  function formatTime(value) {
    return normalizeTime(value) || EMPTY_VALUE;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return EMPTY_VALUE;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return MONEY_FORMATTER.format(number);
  }

  function normalizeEstado(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isCancelada(reservacion) {
    return normalizeEstado(reservacion && reservacion.estado) === "cancelada";
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

  function getReservacionId(reservacion) {
    return reservacion && reservacion.id_reservacion !== null && reservacion.id_reservacion !== undefined
      ? String(reservacion.id_reservacion)
      : "";
  }

  function getCatalogName(collection, idField, idValue) {
    const id = idValue === null || idValue === undefined ? "" : String(idValue);
    const item = collection.find(function (entry) {
      return entry && String(entry[idField]) === id;
    });

    return item && item.nombre ? item.nombre : "";
  }

  function getTourName(reservacion) {
    return reservacion && reservacion.tour
      ? reservacion.tour
      : getCatalogName(tours, "id_tour", reservacion && reservacion.id_tour);
  }

  function getPaisName(reservacion) {
    return reservacion && reservacion.pais
      ? reservacion.pais
      : getCatalogName(paises, "id_pais", reservacion && reservacion.id_pais);
  }

  function getPlataformaName(reservacion) {
    return reservacion && reservacion.plataforma
      ? reservacion.plataforma
      : getCatalogName(plataformas, "id_plataforma", reservacion && reservacion.id_plataforma);
  }

  function getVendidoPor(reservacion) {
    const vendedor = reservacion && reservacion.vendedor !== null && reservacion.vendedor !== undefined
      ? String(reservacion.vendedor).trim()
      : "";
    const plataforma = getPlataformaName(reservacion);

    return vendedor || plataforma || EMPTY_VALUE;
  }

  function formatNotificado(value) {
    if (value === true) {
      return "Sí";
    }

    if (value === false) {
      return "No";
    }

    return "Sin dato";
  }

  function getPrintableText(value, fallback) {
    const fallbackValue = fallback !== undefined ? fallback : EMPTY_VALUE;

    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return fallbackValue;
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      return fallbackValue;
    }

    if (typeof value === "boolean") {
      return value ? "Sí" : "No";
    }

    const text = String(value).trim();
    const normalized = text.toLowerCase();

    if (!text || normalized === "null" || normalized === "undefined" || normalized === "nan") {
      return fallbackValue;
    }

    return text;
  }

  function hasPrintableText(value) {
    return getPrintableText(value, "") !== "";
  }

  function formatPrintMoney(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return EMPTY_VALUE;
    }

    const number = Number(value);

    return Number.isFinite(number) ? MONEY_FORMATTER.format(number) : EMPTY_VALUE;
  }

  function formatPrintDate(value) {
    return getPrintableText(formatDate(value));
  }

  function formatPrintTime(value) {
    return getPrintableText(formatTime(value));
  }

  function getNotificadoSelectValue(value) {
    if (value === true) {
      return "true";
    }

    if (value === false) {
      return "false";
    }

    return "";
  }

  function parseNotificadoSelectValue(value) {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    return null;
  }

  function getBackendMessage(error, fallback) {
    if (error && error.status === 403) {
      return "No tienes permisos para realizar esta acción.";
    }

    if (error && error.data && error.data.mensaje) {
      return error.data.mensaje;
    }

    if (error && error.isNetworkError) {
      return "No se pudo conectar con el servidor.";
    }

    return fallback || "Ocurrió un error inesperado.";
  }

  function fieldValue(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function setMessage(text, type) {
    const element = document.getElementById("reservaciones-message");

    if (!element) {
      return;
    }

    element.textContent = text || "";
    element.className = "form-message reservaciones-message" + (type ? " " + type : "");
  }

  function setLoading(isLoading) {
    const elements = getElements();
    const controls = [
      elements.fecha,
      elements.turno,
      elements.tour,
      elements.estado,
      elements.plataforma,
      elements.nombre,
      elements.codigo,
      elements.limpiar,
      elements.nueva,
      elements.paginationPrev,
      elements.paginationNext,
      elements.paginationLimit
    ];
    const submit = elements.form ? elements.form.querySelector('[type="submit"]') : null;

    controls.forEach(function (control) {
      if (control) {
        control.disabled = isLoading;
      }
    });

    if (submit) {
      submit.disabled = isLoading;
    }

    if (elements.paginationPages) {
      elements.paginationPages.querySelectorAll("button").forEach(function (button) {
        button.disabled = isLoading;
      });
    }
  }

  function renderStatusRow(title, text) {
    return [
      '<tr><td colspan="' + COLUMN_COUNT + '">',
      App.ui.emptyState(title, text),
      "</td></tr>"
    ].join("");
  }

  function getArrayResponse(response) {
    return Array.isArray(response && response.datos) ? response.datos : [];
  }

  function getPaginatedResponse(response) {
    const responsePagination = response && response.pagination ? response.pagination : {};

    return {
      data: Array.isArray(response && response.data) ? response.data : [],
      pagination: {
        page: Number(responsePagination.page) || 1,
        limit: PAGE_LIMITS.includes(Number(responsePagination.limit)) ? Number(responsePagination.limit) : pagination.limit,
        total: Number(responsePagination.total) || 0,
        totalPages: Number(responsePagination.totalPages) || 0
      }
    };
  }

  function updateKnownEstados(data) {
    getArrayResponse({ datos: data }).forEach(function (reservacion) {
      const estado = reservacion && reservacion.estado ? String(reservacion.estado).trim() : "";

      if (estado) {
        estadosConocidos.add(estado);
      }
    });
  }

  function renderTourOptions(selectedValue, includeInactiveSelection, includeAll) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);
    const rows = includeAll ? ['<option value="">Todos</option>'] : ['<option value="">Selecciona un tour</option>'];

    tours
      .filter(function (tour) {
        if (!tour) {
          return false;
        }

        if (includeAll) {
          return true;
        }

        return tour.activo === true || (includeInactiveSelection && String(tour.id_tour) === selected);
      })
      .forEach(function (tour) {
        const id = String(tour.id_tour);
        const inactiveLabel = tour.activo === false ? " (inactivo)" : "";
        rows.push(
          '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selected ? " selected" : "") + ">" +
          App.ui.escapeHtml(String(tour.nombre || EMPTY_VALUE) + inactiveLabel) +
          "</option>"
        );
      });

    return rows.join("");
  }

  function renderPaisOptions(selectedValue, includeAll) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);
    const rows = includeAll ? ['<option value="">Todos</option>'] : ['<option value="">Selecciona un país</option>'];

    paises.forEach(function (pais) {
      if (!pais) {
        return;
      }

      const id = String(pais.id_pais);
      rows.push(
        '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selected ? " selected" : "") + ">" +
        App.ui.escapeHtml(pais.nombre || EMPTY_VALUE) +
        "</option>"
      );
    });

    return rows.join("");
  }

  function renderPlataformaOptions(selectedValue, includeAll) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);
    const rows = includeAll ? ['<option value="">Todas</option>'] : ['<option value="">Selecciona una plataforma</option>'];

    plataformas.forEach(function (plataforma) {
      if (!plataforma) {
        return;
      }

      const id = String(plataforma.id_plataforma);
      rows.push(
        '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selected ? " selected" : "") + ">" +
        App.ui.escapeHtml(plataforma.nombre || EMPTY_VALUE) +
        "</option>"
      );
    });

    return rows.join("");
  }

  function renderTurnoOptions(selectedValue, includeAll, includeUnclassified) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);
    const rows = [];

    if (includeAll) {
      rows.push('<option value="">Todos</option>');
    } else if (includeUnclassified) {
      rows.push('<option value="">' + App.ui.escapeHtml(TURNO_SIN_CLASIFICAR) + "</option>");
    } else {
      rows.push('<option value="">Selecciona turno</option>');
    }

    TURNOS.forEach(function (turno) {
      rows.push(
        '<option value="' + App.ui.escapeHtml(turno) + '"' + (turno === selected ? " selected" : "") + ">" +
        App.ui.escapeHtml(turno) +
        "</option>"
      );
    });

    return rows.join("");
  }

  function getTurnoLabel(reservacion) {
    const turno = reservacion && reservacion.turno ? String(reservacion.turno) : "";
    return turno || TURNO_SIN_CLASIFICAR;
  }

  function getTurnoBadgeClass(reservacion) {
    return reservacion && reservacion.turno ? "badge" : "badge badge-neutral";
  }

  function renderEstadoOptions(selectedValue) {
    const selected = selectedValue || "";
    const ordered = Array.from(estadosConocidos).sort(function (a, b) {
      const preferred = [ESTADO_PENDIENTE, ESTADO_CONFIRMADA, ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_COMPLETADA];
      const indexA = preferred.indexOf(a);
      const indexB = preferred.indexOf(b);

      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? preferred.length : indexA) - (indexB === -1 ? preferred.length : indexB);
      }

      return a.localeCompare(b, "es");
    });

    return [
      '<option value="">Todos</option>',
      ordered.map(function (estado) {
        return '<option value="' + App.ui.escapeHtml(estado) + '"' + (estado === selected ? " selected" : "") + ">" +
          App.ui.escapeHtml(estado) +
          "</option>";
      }).join("")
    ].join("");
  }

  function populateFilterCatalogs() {
    const elements = getElements();

    if (elements.tour) {
      const current = elements.tour.value;
      elements.tour.innerHTML = renderTourOptions(current, true, true);
      elements.tour.value = current;
    }

    if (elements.plataforma) {
      const current = elements.plataforma.value;
      elements.plataforma.innerHTML = renderPlataformaOptions(current, true);
      elements.plataforma.value = current;
    }

    if (elements.estado) {
      const current = elements.estado.value;
      elements.estado.innerHTML = renderEstadoOptions(current);
      elements.estado.value = current;
    }
  }

  function hasActiveFilters(elements) {
    return Boolean(
      (elements.fecha && elements.fecha.value) ||
      (elements.turno && elements.turno.value) ||
      (elements.tour && elements.tour.value) ||
      (elements.estado && elements.estado.value) ||
      (elements.plataforma && elements.plataforma.value) ||
      (elements.nombre && elements.nombre.value.trim()) ||
      (elements.codigo && elements.codigo.value.trim())
    );
  }

  function validateFilters(elements) {
    if (elements.fecha && elements.fecha.value && !isValidDateValue(elements.fecha.value)) {
      return "Selecciona una fecha válida.";
    }

    return "";
  }

  function buildQuery(elements, page, limit) {
    const params = new URLSearchParams();

    params.set("page", String(page || 1));
    params.set("limit", String(limit || pagination.limit));

    if (elements.fecha && elements.fecha.value) {
      params.set("fecha", elements.fecha.value);
    }

    if (elements.turno && elements.turno.value) {
      params.set("turno", elements.turno.value);
    }

    if (elements.tour && elements.tour.value) {
      params.set("id_tour", elements.tour.value);
    }

    if (elements.estado && elements.estado.value) {
      params.set("estado", elements.estado.value);
    }

    if (elements.plataforma && elements.plataforma.value) {
      params.set("id_plataforma", elements.plataforma.value);
    }

    if (elements.nombre && elements.nombre.value.trim()) {
      params.set("nombre", elements.nombre.value.trim());
    }

    if (elements.codigo && elements.codigo.value.trim()) {
      params.set("codigo", elements.codigo.value.trim());
    }

    const query = params.toString();

    return query ? "?" + query : "";
  }

  function renderPaginationShell() {
    return [
      '<nav class="pagination reservaciones-pagination" id="reservaciones-pagination" aria-label="Paginación de reservaciones">',
      '<p class="pagination-summary" id="reservaciones-pagination-summary">Mostrando 0 de 0</p>',
      '<div class="pagination-controls">',
      '<button class="btn btn-ghost pagination-nav" id="reservaciones-pagination-prev" type="button">Anterior</button>',
      '<div class="pagination-pages" id="reservaciones-pagination-pages"></div>',
      '<button class="btn btn-ghost pagination-nav" id="reservaciones-pagination-next" type="button">Siguiente</button>',
      "</div>",
      '<label class="field pagination-limit-field" for="reservaciones-pagination-limit">',
      '<span class="field-label">Por página</span>',
      '<select class="input" id="reservaciones-pagination-limit">',
      PAGE_LIMITS.map(function (limit) {
        return '<option value="' + App.ui.escapeHtml(limit) + '">' + App.ui.escapeHtml(limit) + "</option>";
      }).join(""),
      "</select>",
      "</label>",
      "</nav>"
    ].join("");
  }

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 0) {
      return [];
    }

    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, function (_, index) {
        return index + 1;
      });
    }

    const pages = new Set([1, totalPages]);
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);

    for (let page = start; page <= end; page += 1) {
      pages.add(page);
    }

    return Array.from(pages).sort(function (a, b) {
      return a - b;
    });
  }

  function renderPageButtons(currentPage, totalPages) {
    const pages = getVisiblePages(currentPage, totalPages);

    if (pages.length === 0) {
      return '<span class="pagination-empty">Sin páginas</span>';
    }

    return pages.reduce(function (html, page, index) {
      const previousPage = pages[index - 1];
      const separator = previousPage && page - previousPage > 1
        ? '<span class="pagination-ellipsis" aria-hidden="true">...</span>'
        : "";
      const current = page === currentPage;

      return html + separator + [
        '<button class="btn btn-ghost pagination-page' + (current ? " is-active" : "") + '" type="button" data-page="' + App.ui.escapeHtml(page) + '"' + (current ? ' aria-current="page"' : "") + ">",
        App.ui.escapeHtml(page),
        "</button>"
      ].join("");
    }, "");
  }

  function renderPaginationControls(elements) {
    const total = Number(pagination.total) || 0;
    const page = Number(pagination.page) || 1;
    const limit = Number(pagination.limit) || 25;
    const totalPages = Number(pagination.totalPages) || 0;
    const start = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const end = total === 0 ? 0 : Math.min(page * limit, total);

    if (elements.paginationSummary) {
      elements.paginationSummary.textContent = total === 0
        ? "Mostrando 0 de 0"
        : "Mostrando " + start + "-" + end + " de " + total;
    }

    if (elements.paginationPages) {
      elements.paginationPages.innerHTML = renderPageButtons(page, totalPages);
    }

    if (elements.paginationPrev) {
      elements.paginationPrev.disabled = total === 0 || page <= 1;
    }

    if (elements.paginationNext) {
      elements.paginationNext.disabled = total === 0 || page >= totalPages;
    }

    if (elements.paginationLimit) {
      elements.paginationLimit.value = String(limit);
    }
  }

  function renderActions(reservacion) {
    const id = getReservacionId(reservacion);
    const viewButton = '<button class="btn btn-ghost" type="button" data-reservacion-action="view" data-id="' + App.ui.escapeHtml(id) + '">Ver</button>';
    const printButton = '<button class="btn btn-ghost" type="button" data-reservacion-action="print" data-id="' + App.ui.escapeHtml(id) + '">Imprimir reservación</button>';

    if (!isAdmin()) {
      return [viewButton, printButton].join("");
    }

    const editButton = '<button class="btn" type="button" data-reservacion-action="edit" data-id="' + App.ui.escapeHtml(id) + '">Editar</button>';
    const cancelButton = isCancelada(reservacion)
      ? ""
      : '<button class="btn btn-ghost" type="button" data-reservacion-action="cancel" data-id="' + App.ui.escapeHtml(id) + '">Cancelar</button>';

    return [viewButton, printButton, editButton, cancelButton].join("");
  }

  function renderPickupCell(reservacion) {
    return [
      '<div class="pickup-cell">',
      '<span class="pickup-place">' + escapeValue(reservacion && reservacion.pickup_place) + "</span>",
      '<span class="pickup-time">' + escapeValue(formatTime(reservacion && reservacion.pickup_time)) + "</span>",
      "</div>"
    ].join("");
  }

  function renderRows(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return "";
    }

    return data.map(function (reservacion) {
      const estado = reservacion && reservacion.estado ? String(reservacion.estado) : "";

      return [
        '<tr class="' + (isCancelada(reservacion) ? "is-cancelada" : "") + '">',
        '<td><strong class="reservaciones-primary-text">' + escapeValue(reservacion && reservacion.codigo) + "</strong></td>",
        "<td>" + escapeValue(formatDate(reservacion && reservacion.fecha)) + "</td>",
        '<td><span class="' + getTurnoBadgeClass(reservacion) + '">' + escapeValue(getTurnoLabel(reservacion)) + "</span></td>",
        "<td>" + escapeValue(reservacion && reservacion.nombre_cliente) + "</td>",
        "<td>" + escapeValue(getTourName(reservacion)) + "</td>",
        '<td class="reservaciones-number-cell">' + escapeValue(reservacion && reservacion.pax) + "</td>",
        "<td>" + renderPickupCell(reservacion) + "</td>",
        "<td>" + escapeValue(getVendidoPor(reservacion)) + "</td>",
        '<td><span class="' + getEstadoBadgeClass(estado) + '">' + escapeValue(estado) + "</span></td>",
        '<td class="reservaciones-money-cell">' + escapeValue(formatMoney(reservacion && reservacion.precio_total)) + "</td>",
        '<td><div class="reservaciones-row-actions">' + renderActions(reservacion) + "</div></td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function renderTable(data, elements) {
    if (!elements.tbody) {
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      elements.tbody.innerHTML = hasActiveFilters(elements)
        ? renderStatusRow("No se encontraron reservaciones con estos filtros", "Ajusta los filtros para consultar otros registros.")
        : renderStatusRow("No hay reservaciones registradas", "Crea una reservación manual para comenzar.");
      return;
    }

    elements.tbody.innerHTML = renderRows(data);
  }

  function resetPagination() {
    pagination.page = 1;
    pagination.total = 0;
    pagination.totalPages = 0;
  }

  async function loadCatalogs() {
    const activeRequestId = catalogRequestId + 1;
    catalogRequestId = activeRequestId;
    catalogsLoaded = false;

    const responses = await Promise.all([
      App.api.apiFetch("/api/tours"),
      App.api.apiFetch("/api/paises"),
      App.api.apiFetch("/api/plataformas")
    ]);

    if (activeRequestId !== catalogRequestId || window.location.hash !== "#/reservaciones") {
      return false;
    }

    tours = getArrayResponse(responses[0]);
    paises = getArrayResponse(responses[1]);
    plataformas = getArrayResponse(responses[2]);
    catalogsLoaded = true;
    populateFilterCatalogs();

    return true;
  }

  async function loadReservaciones(options) {
    const config = options || {};
    const elements = getElements();
    const validationMessage = validateFilters(elements);
    const requestedPage = Number(config.page) || pagination.page || 1;
    const requestedLimit = Number(config.limit) || pagination.limit || 25;

    if (!elements.tbody) {
      return;
    }

    if (validationMessage) {
      elements.tbody.innerHTML = renderStatusRow("Filtros inválidos", validationMessage);
      setMessage(validationMessage, "is-error");
      return;
    }

    const activeRequestId = requestId + 1;
    requestId = activeRequestId;
    elements.tbody.innerHTML = renderStatusRow("Cargando reservaciones", "Consultando reservaciones reales del backend.");
    setMessage("", "");
    setLoading(true);

    try {
      if (!catalogsLoaded || config.reloadCatalogs) {
        await loadCatalogs();
      }

      if (config.restoreState) {
        restoreState();
      }

      const response = await App.api.apiFetch("/api/reservaciones" + buildQuery(elements, requestedPage, requestedLimit));

      if (activeRequestId !== requestId || window.location.hash !== "#/reservaciones") {
        return;
      }

      const paginatedResponse = getPaginatedResponse(response);

      if (paginatedResponse.pagination.totalPages === 0) {
        paginatedResponse.pagination.page = 1;
      }

      if (
        paginatedResponse.pagination.totalPages > 0 &&
        paginatedResponse.pagination.page > paginatedResponse.pagination.totalPages
      ) {
        pagination.page = paginatedResponse.pagination.totalPages;
        pagination.limit = paginatedResponse.pagination.limit;
        captureState();
        await loadReservaciones({
          page: pagination.page,
          limit: pagination.limit
        });
        return;
      }

      reservaciones = paginatedResponse.data;
      pagination = paginatedResponse.pagination;
      updateKnownEstados(reservaciones);
      populateFilterCatalogs();
      renderTable(reservaciones, getElements());
      renderPaginationControls(getElements());
      setMessage(pagination.total + " reservaciones encontradas.", "is-info");
      captureState();
    } catch (error) {
      if (activeRequestId !== requestId || window.location.hash !== "#/reservaciones") {
        return;
      }

      reservaciones = [];
      pagination.total = 0;
      pagination.totalPages = 0;
      elements.tbody.innerHTML = renderStatusRow(
        "No se pudieron cargar las reservaciones",
        getBackendMessage(error, "No fue posible consultar las reservaciones.")
      );
      renderPaginationControls(getElements());
      setMessage(getBackendMessage(error, "No fue posible consultar las reservaciones."), "is-error");
    } finally {
      if (activeRequestId === requestId && window.location.hash === "#/reservaciones") {
        setLoading(false);
        renderPaginationControls(getElements());
      }
    }
  }

  function findReservacion(id) {
    return reservaciones.find(function (reservacion) {
      return getReservacionId(reservacion) === String(id);
    });
  }

  function renderPrintField(label, value) {
    return [
      '<div class="reservacion-print-field">',
      '<span>' + App.ui.escapeHtml(label) + "</span>",
      "<strong>" + App.ui.escapeHtml(getPrintableText(value)) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderPrintSection(title, fieldsHtml, className) {
    return [
      '<section class="reservacion-print-section ' + App.ui.escapeHtml(className || "") + '">',
      "<h2>" + App.ui.escapeHtml(title) + "</h2>",
      '<div class="reservacion-print-grid">',
      fieldsHtml,
      "</div>",
      "</section>"
    ].join("");
  }

  function renderPrintTextSection(title, text, className) {
    return [
      '<section class="reservacion-print-section reservacion-print-text-section ' + App.ui.escapeHtml(className || "") + '">',
      "<h2>" + App.ui.escapeHtml(title) + "</h2>",
      "<p>" + App.ui.escapeHtml(getPrintableText(text)) + "</p>",
      "</section>"
    ].join("");
  }

  function getPrintMotivoCancelacion(reservacion) {
    if (hasPrintableText(reservacion && reservacion.motivo_cancelacion)) {
      return getPrintableText(reservacion.motivo_cancelacion);
    }

    return isCancelada(reservacion) ? "Sin dato" : "";
  }

  function mergeReservacionForPrint(localReservacion, remoteReservacion) {
    const merged = Object.assign({}, localReservacion || {}, remoteReservacion || {});

    ["tour", "pais", "plataforma"].forEach(function (field) {
      if (!hasPrintableText(merged[field]) && localReservacion && hasPrintableText(localReservacion[field])) {
        merged[field] = localReservacion[field];
      }
    });

    return merged;
  }

  function renderReservacionPrintDocument(reservacion) {
    const codigo = getPrintableText(reservacion && reservacion.codigo);
    const estado = getPrintableText(reservacion && reservacion.estado);
    const motivoCancelacion = getPrintMotivoCancelacion(reservacion);
    const cancelacionHtml = motivoCancelacion
      ? renderPrintTextSection("Cancelación", motivoCancelacion, "reservacion-print-cancelacion")
      : "";

    return [
      '<article class="reservacion-print-sheet">',
      '<header class="reservacion-print-header">',
      "<div>",
      '<p class="reservacion-print-company">Community Tours Sian Ka\'an</p>',
      '<h1>Reservación</h1>',
      '<p class="reservacion-print-subtitle">Sistema Integrador de Reservaciones</p>',
      "</div>",
      '<div class="reservacion-print-code-block">',
      "<span>Código</span>",
      "<strong>" + App.ui.escapeHtml(codigo) + "</strong>",
      '<em class="' + getEstadoBadgeClass(estado) + '">' + App.ui.escapeHtml(estado) + "</em>",
      "</div>",
      "</header>",
      renderPrintSection("Servicio", [
        renderPrintField("Fecha", formatPrintDate(reservacion && reservacion.fecha)),
        renderPrintField("Estado", estado),
        renderPrintField("Tour", getTourName(reservacion)),
        renderPrintField("Turno", getTurnoLabel(reservacion))
      ].join("")),
      renderPrintSection("Datos del cliente", [
        renderPrintField("Nombre del cliente", reservacion && reservacion.nombre_cliente),
        renderPrintField("Teléfono", reservacion && reservacion.telefono_cliente),
        renderPrintField("País", getPaisName(reservacion)),
        renderPrintField("Habitación", reservacion && reservacion.habitacion),
        renderPrintField("Idioma", reservacion && reservacion.idioma),
        renderPrintField("Notificado", formatNotificado(reservacion && reservacion.notificado))
      ].join("")),
      renderPrintSection("Pasajeros y pickup", [
        renderPrintField("PAX", reservacion && reservacion.pax),
        renderPrintField("Niños", reservacion && reservacion.ninos),
        renderPrintField("Pickup place", reservacion && reservacion.pickup_place),
        renderPrintField("Pickup time", formatPrintTime(reservacion && reservacion.pickup_time))
      ].join("")),
      renderPrintSection("Información comercial", [
        renderPrintField("Plataforma", getPlataformaName(reservacion)),
        renderPrintField("Vendedor", reservacion && reservacion.vendedor),
        renderPrintField("Precio total", formatPrintMoney(reservacion && reservacion.precio_total)),
        renderPrintField("Depósito", formatPrintMoney(reservacion && reservacion.deposito)),
        renderPrintField("Saldo", formatPrintMoney(reservacion && reservacion.saldo)),
        renderPrintField("Tipo de cambio", formatPrintMoney(reservacion && reservacion.tipo_cambio)),
        renderPrintField("Método de pago", reservacion && reservacion.metodo_pago)
      ].join("")),
      renderPrintTextSection("Observaciones", reservacion && reservacion.observaciones),
      cancelacionHtml,
      "</article>"
    ].join("");
  }

  function clearReservacionPrint() {
    const printRoot = document.getElementById("reservacion-print-root");

    document.body.classList.remove("is-printing-reservacion");

    if (printCleanupTimer) {
      window.clearTimeout(printCleanupTimer);
      printCleanupTimer = null;
    }

    if (printAfterPrintHandler) {
      window.removeEventListener("afterprint", printAfterPrintHandler);
      printAfterPrintHandler = null;
    }

    if (printRoot) {
      printRoot.innerHTML = "";
    }
  }

  function scheduleReservacionPrintCleanup() {
    if (printCleanupTimer) {
      window.clearTimeout(printCleanupTimer);
    }

    printCleanupTimer = window.setTimeout(clearReservacionPrint, PRINT_CLEANUP_DELAY_MS);
  }

  function prepareReservacionPrint(reservacion) {
    const printRoot = document.getElementById("reservacion-print-root");

    if (!printRoot) {
      setMessage("No se encontró el contenedor de impresión.", "is-error");
      return false;
    }

    clearReservacionPrint();
    printRoot.innerHTML = renderReservacionPrintDocument(reservacion);
    document.body.classList.add("is-printing-reservacion");

    printAfterPrintHandler = function () {
      clearReservacionPrint();
    };

    window.addEventListener("afterprint", printAfterPrintHandler, { once: true });

    return true;
  }

  async function printReservacion(idReservacion, localReservacion) {
    if (actionLoadingId) {
      return;
    }

    actionLoadingId = idReservacion;
    setLoading(true);
    setMessage("", "");

    try {
      if (!catalogsLoaded) {
        await loadCatalogs();
      }

      const response = await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion));
      const remoteReservacion = response && response.datos ? response.datos : null;

      if (!remoteReservacion) {
        setMessage("Reservación no encontrada.", "is-error");
        return;
      }

      const reservacion = mergeReservacionForPrint(localReservacion, remoteReservacion);

      if (!prepareReservacionPrint(reservacion)) {
        return;
      }

      actionLoadingId = null;
      setLoading(false);
      renderPaginationControls(getElements());
      window.print();
      scheduleReservacionPrintCleanup();
    } catch (error) {
      clearReservacionPrint();
      setMessage(getBackendMessage(error, "No fue posible preparar la impresión de la reservación."), "is-error");
    } finally {
      if (actionLoadingId === idReservacion) {
        actionLoadingId = null;
        setLoading(false);
        renderPaginationControls(getElements());
      }
    }
  }

  function textField(id, label, value, attrs, readOnly) {
    return [
      '<label class="field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<input class="input" id="' + App.ui.escapeHtml(id) + '" ' + (attrs || 'type="text"') + ' value="' + App.ui.escapeHtml(fieldValue(value)) + '"' + (readOnly ? " disabled" : "") + ">",
      "</label>"
    ].join("");
  }

  function selectField(id, label, optionsHtml, readOnly) {
    return [
      '<label class="field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<select class="input" id="' + App.ui.escapeHtml(id) + '"' + (readOnly ? " disabled" : "") + ">",
      optionsHtml,
      "</select>",
      "</label>"
    ].join("");
  }

  function textareaField(id, label, value, readOnly) {
    return [
      '<label class="field reservaciones-full-field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<textarea class="input reservaciones-textarea" id="' + App.ui.escapeHtml(id) + '"' + (readOnly ? " disabled" : "") + ">",
      App.ui.escapeHtml(fieldValue(value)),
      "</textarea>",
      "</label>"
    ].join("");
  }

  function checkboxField(id, label, checked, readOnly) {
    return [
      '<label class="field reservaciones-checkbox-field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<span class="reservaciones-checkbox-control">',
      '<input id="' + App.ui.escapeHtml(id) + '" type="checkbox"' + (checked ? " checked" : "") + (readOnly ? " disabled" : "") + ">",
      '<span>Notificado</span>',
      "</span>",
      "</label>"
    ].join("");
  }

  function staticField(id, label, value) {
    return textField(id, label, value, 'type="text"', true);
  }

  function renderNotificadoOptions(value) {
    const selected = getNotificadoSelectValue(value);
    const options = [
      { value: "", label: "Sin dato" },
      { value: "false", label: "No" },
      { value: "true", label: "Sí" }
    ];

    return options.map(function (option) {
      return '<option value="' + App.ui.escapeHtml(option.value) + '"' + (option.value === selected ? " selected" : "") + ">" +
        App.ui.escapeHtml(option.label) +
        "</option>";
    }).join("");
  }

  function renderNotificadoField(mode, reservacion, readOnly) {
    if (mode === FORM_DETAIL) {
      return staticField("reserva-notificado-label", "Cliente notificado", formatNotificado(reservacion && reservacion.notificado));
    }

    if (mode === FORM_CREATE) {
      return checkboxField("reserva-notificado", "Cliente notificado", false, readOnly);
    }

    return selectField("reserva-notificado", "Cliente notificado", renderNotificadoOptions(reservacion && reservacion.notificado), readOnly);
  }

  function renderSection(title, content) {
    return [
      '<section class="reservaciones-form-section">',
      '<h3>' + App.ui.escapeHtml(title) + "</h3>",
      '<div class="reservaciones-form-grid">',
      content,
      "</div>",
      "</section>"
    ].join("");
  }

  function renderReservacionDialog(mode, reservacion) {
    const isCreate = mode === FORM_CREATE;
    const isDetail = mode === FORM_DETAIL;
    const readOnly = isDetail;
    const title = isCreate ? "Nueva reservación" : (mode === FORM_EDIT ? "Editar reservación" : "Detalle de reservación");
    const estado = isCreate ? ESTADO_PENDIENTE : (reservacion && reservacion.estado ? reservacion.estado : EMPTY_VALUE);
    const selectedTourId = reservacion ? reservacion.id_tour : "";
    const selectedPaisId = reservacion ? reservacion.id_pais : "";
    const selectedPlataformaId = reservacion ? reservacion.id_plataforma : "";
    const selectedTurno = reservacion ? reservacion.turno : "";
    const cancelada = isCancelada(reservacion);
    const codigoField = isCreate
      ? ""
      : textField("reserva-codigo", "Código", reservacion && reservacion.codigo, 'type="text" maxlength="30"', true);

    return [
      '<div class="reservaciones-dialog-backdrop" id="reservaciones-dialog" role="dialog" aria-modal="true" aria-labelledby="reservaciones-dialog-title">',
      '<form class="card reservaciones-form" id="reservaciones-form" novalidate autocomplete="off">',
      '<div class="reservaciones-form-header">',
      "<div>",
      '<h2 id="reservaciones-dialog-title">' + App.ui.escapeHtml(title) + "</h2>",
      '<p class="card-text">Estado: <span class="' + getEstadoBadgeClass(estado) + '">' + App.ui.escapeHtml(estado) + "</span></p>",
      "</div>",
      '<button class="btn btn-ghost" id="reservaciones-close" type="button" aria-label="Cerrar formulario">Cerrar</button>',
      "</div>",
      '<input type="hidden" id="reservaciones-form-mode" value="' + App.ui.escapeHtml(mode) + '">',
      '<input type="hidden" id="reservaciones-form-id" value="' + App.ui.escapeHtml(reservacion ? getReservacionId(reservacion) : "") + '">',
      renderSection("Datos de reserva", [
        codigoField,
        textField("reserva-fecha", "Fecha *", normalizeDate(reservacion && reservacion.fecha), 'type="date"', readOnly),
        selectField("reserva-turno", "Turno *", renderTurnoOptions(selectedTurno, false, !isCreate && !selectedTurno), readOnly),
        selectField("reserva-tour", "Tour *", renderTourOptions(selectedTourId, !isCreate, false), readOnly),
        selectField("reserva-pais", "País *", renderPaisOptions(selectedPaisId, false), readOnly),
        selectField("reserva-plataforma", "Plataforma *", renderPlataformaOptions(selectedPlataformaId, false), readOnly)
      ].join("")),
      renderSection("Cliente", [
        textField("reserva-nombre", "Nombre del cliente *", reservacion && reservacion.nombre_cliente, 'type="text" maxlength="120"', readOnly),
        textField("reserva-telefono", "Teléfono", reservacion && reservacion.telefono_cliente, 'type="text" maxlength="30"', readOnly),
        textField("reserva-habitacion", "Habitación", reservacion && reservacion.habitacion, 'type="text" maxlength="50"', readOnly),
        textField("reserva-idioma", "Idioma", reservacion && reservacion.idioma, 'type="text" maxlength="50" placeholder="Español, Inglés, etc."', readOnly),
        renderNotificadoField(mode, reservacion, readOnly)
      ].join("")),
      renderSection("Pasajeros", [
        textField("reserva-pax", "PAX *", reservacion && reservacion.pax, 'type="number" min="1" step="1"', readOnly),
        textField("reserva-ninos", "Niños", reservacion && reservacion.ninos, 'type="number" min="0" step="1"', readOnly)
      ].join("")),
      renderSection("Pickup", [
        textField("reserva-pickup-place", "Pickup / Meeting Point *", reservacion && reservacion.pickup_place, 'type="text" maxlength="120"', readOnly),
        textField("reserva-pickup-time", "Hora de pickup *", normalizeTime(reservacion && reservacion.pickup_time), 'type="time"', readOnly)
      ].join("")),
      renderSection("Venta", [
        textField("reserva-metodo-pago", "Método de pago", reservacion && reservacion.metodo_pago, 'type="text" maxlength="50"', readOnly),
        textField("reserva-vendedor", "Vendedor", reservacion && reservacion.vendedor, 'type="text" maxlength="120"', readOnly)
      ].join("")),
      renderSection("Importes", [
        textField("reserva-precio-total", "Precio total *", reservacion && reservacion.precio_total, 'type="number" step="0.01"', readOnly),
        textField("reserva-deposito", "Depósito", reservacion && reservacion.deposito, 'type="number" step="0.01"', readOnly),
        textField("reserva-saldo", "Saldo", reservacion && reservacion.saldo, 'type="number" step="0.01"', readOnly),
        textField("reserva-tipo-cambio", "Tipo de cambio", reservacion && reservacion.tipo_cambio, 'type="number" step="0.01"', readOnly)
      ].join("")),
      renderSection("Observaciones", textareaField("reserva-observaciones", "Observaciones", reservacion && reservacion.observaciones, readOnly)),
      (cancelada || (reservacion && reservacion.motivo_cancelacion)
        ? renderSection("Cancelación", textareaField("reserva-motivo-cancelacion", "Motivo de cancelación", reservacion && reservacion.motivo_cancelacion, readOnly || !cancelada))
        : ""),
      '<p class="form-message" id="reservaciones-form-message" role="status" aria-live="polite"></p>',
      '<div class="reservaciones-form-actions">',
      '<button class="btn" id="reservaciones-cancel-form" type="button">' + (isDetail ? "Cerrar" : "Cancelar") + "</button>",
      readOnly ? "" : '<button class="btn btn-primary" id="reservaciones-submit" type="submit">Guardar</button>',
      "</div>",
      "</form>",
      "</div>"
    ].join("");
  }

  function closeDialog() {
    if (submitLoading || cancelLoading) {
      return;
    }

    selectedReservacion = null;
    selectedCancelReservacion = null;

    const host = document.getElementById("reservaciones-dialog-host");

    if (host) {
      host.innerHTML = "";
    }
  }

  function setFormMessage(text, type) {
    const element = document.getElementById("reservaciones-form-message");

    if (!element) {
      return;
    }

    element.textContent = text || "";
    element.className = "form-message" + (type ? " " + type : "");
  }

  function setFormLoading(isLoading) {
    submitLoading = isLoading;

    document.querySelectorAll("#reservaciones-form input, #reservaciones-form select, #reservaciones-form textarea, #reservaciones-form button").forEach(function (control) {
      control.disabled = isLoading;
    });

    const submit = document.getElementById("reservaciones-submit");

    if (submit) {
      submit.textContent = isLoading ? "Guardando..." : "Guardar";
    }
  }

  function getCheckboxValue(id) {
    const element = document.getElementById(id);
    return Boolean(element && element.checked);
  }

  async function openDialog(mode, reservacion) {
    const host = document.getElementById("reservaciones-dialog-host");

    if (!host || submitLoading) {
      return;
    }

    if ((mode === FORM_CREATE || mode === FORM_EDIT) && !isAdmin()) {
      setMessage("No tienes permisos para modificar reservaciones.", "is-error");
      return;
    }

    if (!catalogsLoaded) {
      setMessage("Los catálogos todavía no están cargados.", "is-error");
      return;
    }

    selectedReservacion = mode === FORM_EDIT ? reservacion : null;
    host.innerHTML = renderReservacionDialog(mode, reservacion);
    bindDialogEvents();

    const firstInput = host.querySelector("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])");

    if (firstInput) {
      firstInput.focus();
    }
  }

  async function openRemoteDialog(mode, idReservacion) {
    if (actionLoadingId) {
      return;
    }

    actionLoadingId = idReservacion;
    setLoading(true);
    setMessage("", "");

    try {
      const response = await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion));
      const reservacion = response && response.datos ? response.datos : null;

      if (!reservacion) {
        setMessage("Reservación no encontrada.", "is-error");
        return;
      }

      await openDialog(mode, reservacion);
    } catch (error) {
      setMessage(getBackendMessage(error, "No fue posible consultar la reservación."), "is-error");
    } finally {
      actionLoadingId = null;
      setLoading(false);
      renderPaginationControls(getElements());
    }
  }

  function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : "";
  }

  function textOrNull(value) {
    const text = String(value || "").trim();
    return text ? text : null;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    return Number(value);
  }

  function buildPayload(mode) {
    const errores = [];
    const payload = {
      fecha: getInputValue("reserva-fecha"),
      turno: getInputValue("reserva-turno"),
      id_tour: Number(getInputValue("reserva-tour")),
      id_pais: Number(getInputValue("reserva-pais")),
      id_plataforma: Number(getInputValue("reserva-plataforma")),
      nombre_cliente: getInputValue("reserva-nombre").trim(),
      telefono_cliente: textOrNull(getInputValue("reserva-telefono")),
      habitacion: textOrNull(getInputValue("reserva-habitacion")),
      idioma: textOrNull(getInputValue("reserva-idioma")),
      pax: Number(getInputValue("reserva-pax")),
      ninos: numberOrNull(getInputValue("reserva-ninos")),
      pickup_place: getInputValue("reserva-pickup-place").trim(),
      pickup_time: getInputValue("reserva-pickup-time"),
      precio_total: Number(getInputValue("reserva-precio-total")),
      deposito: numberOrNull(getInputValue("reserva-deposito")),
      saldo: numberOrNull(getInputValue("reserva-saldo")),
      tipo_cambio: numberOrNull(getInputValue("reserva-tipo-cambio")),
      metodo_pago: textOrNull(getInputValue("reserva-metodo-pago")),
      vendedor: textOrNull(getInputValue("reserva-vendedor")),
      observaciones: textOrNull(getInputValue("reserva-observaciones"))
    };

    if (mode === FORM_CREATE) {
      payload.estado = ESTADO_PENDIENTE;
      payload.notificado = getCheckboxValue("reserva-notificado");
    } else {
      payload.notificado = parseNotificadoSelectValue(getInputValue("reserva-notificado"));
    }

    if (mode === FORM_EDIT && isCancelada(selectedReservacion)) {
      const motivoCancelacion = textOrNull(getInputValue("reserva-motivo-cancelacion"));

      if (motivoCancelacion !== null || selectedReservacion.motivo_cancelacion !== null) {
        payload.motivo_cancelacion = motivoCancelacion;
      }
    }

    if (!isValidDateValue(payload.fecha)) {
      errores.push("Selecciona una fecha válida.");
    }

    if (!Number.isInteger(payload.id_tour) || payload.id_tour <= 0) {
      errores.push("Selecciona un tour.");
    }

    if (mode === FORM_CREATE && !TURNOS.includes(payload.turno)) {
      errores.push("Selecciona un turno.");
    }

    if (mode === FORM_EDIT && payload.turno && !TURNOS.includes(payload.turno)) {
      errores.push("Selecciona un turno válido.");
    }

    if (!Number.isInteger(payload.id_pais) || payload.id_pais <= 0) {
      errores.push("Selecciona un país.");
    }

    if (!Number.isInteger(payload.id_plataforma) || payload.id_plataforma <= 0) {
      errores.push("Selecciona una plataforma.");
    }

    if (!payload.nombre_cliente) {
      errores.push("Ingresa el nombre del cliente.");
    }

    if (payload.idioma && payload.idioma.length > 50) {
      errores.push("Idioma no debe exceder 50 caracteres.");
    }

    if (!Number.isInteger(payload.pax) || payload.pax <= 0) {
      errores.push("PAX debe ser un entero mayor a 0.");
    }

    if (payload.ninos !== null && (!Number.isInteger(payload.ninos) || payload.ninos < 0)) {
      errores.push("Niños debe ser un entero mayor o igual a 0.");
    }

    if (payload.ninos !== null && Number.isInteger(payload.pax) && payload.ninos > payload.pax) {
      errores.push("Niños no puede ser mayor que PAX.");
    }

    if (!payload.pickup_place) {
      errores.push("Ingresa el Pickup / Meeting Point.");
    }

    if (!/^\d{2}:\d{2}$/.test(payload.pickup_time)) {
      errores.push("Selecciona una hora de pickup válida.");
    }

    if (!Number.isFinite(payload.precio_total)) {
      errores.push("Precio total debe ser numérico.");
    }

    ["deposito", "saldo", "tipo_cambio"].forEach(function (campo) {
      if (payload[campo] !== null && !Number.isFinite(payload[campo])) {
        errores.push("Los importes opcionales deben ser numéricos.");
      }
    });

    if (Object.prototype.hasOwnProperty.call(payload, "motivo_cancelacion") && payload.motivo_cancelacion === null) {
      errores.push("Ingresa el motivo de cancelación.");
    }

    return {
      errores: errores,
      payload: payload
    };
  }

  function normalizeForCompare(campo, value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (campo === "fecha") {
      return normalizeDate(value);
    }

    if (campo === "pickup_time") {
      return normalizeTime(value);
    }

    if (campo === "notificado") {
      return value === true || value === false ? value : null;
    }

    if (["id_tour", "id_pais", "id_plataforma", "pax", "ninos", "precio_total", "deposito", "saldo", "tipo_cambio"].includes(campo)) {
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    }

    return String(value);
  }

  function getChangedPayload(payload) {
    if (!selectedReservacion) {
      return payload;
    }

    const changed = {};

    Object.keys(payload).forEach(function (campo) {
      if (campo === "estado") {
        return;
      }

      if (normalizeForCompare(campo, payload[campo]) !== normalizeForCompare(campo, selectedReservacion[campo])) {
        changed[campo] = payload[campo];
      }
    });

    return changed;
  }

  async function submitForm(event) {
    event.preventDefault();

    if (!isAdmin() || submitLoading) {
      return;
    }

    const mode = getInputValue("reservaciones-form-mode") || FORM_CREATE;
    const idReservacion = getInputValue("reservaciones-form-id");
    const data = buildPayload(mode);

    if (data.errores.length > 0) {
      setFormMessage(data.errores.join(" "), "is-error");
      return;
    }

    const payload = mode === FORM_EDIT ? getChangedPayload(data.payload) : data.payload;

    if (mode === FORM_EDIT && Object.keys(payload).length === 0) {
      setFormMessage("No hay cambios por guardar.", "is-info");
      return;
    }

    setFormMessage("", "");
    setFormLoading(true);

    try {
      let successMessage = "Reservación creada correctamente.";

      if (mode === FORM_EDIT) {
        await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion), {
          method: "PATCH",
          body: payload
        });
        successMessage = "Reservación actualizada correctamente.";
      } else {
        const response = await App.api.apiFetch("/api/reservaciones", {
          method: "POST",
          body: payload
        });

        const codigo = response && response.datos && response.datos.codigo
          ? response.datos.codigo
          : "";

        successMessage = codigo
          ? "Reservación creada correctamente. Código: " + codigo
          : "Reservación creada correctamente.";
      }

      setFormLoading(false);
      closeDialog();
      await loadReservaciones();
      setMessage(successMessage, "is-info");
    } catch (error) {
      setFormMessage(getBackendMessage(error, "No fue posible guardar la reservación."), "is-error");
      setFormLoading(false);
    }
  }

  function renderCancelDialog(reservacion) {
    const idReservacion = getReservacionId(reservacion);
    const codigo = reservacion && reservacion.codigo ? reservacion.codigo : ("ID " + idReservacion);
    const cliente = reservacion && reservacion.nombre_cliente ? reservacion.nombre_cliente : EMPTY_VALUE;

    return [
      '<div class="reservaciones-dialog-backdrop" id="reservaciones-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="reservaciones-cancel-title">',
      '<form class="card reservaciones-form reservaciones-cancel-form" id="reservaciones-cancel-form" novalidate autocomplete="off">',
      '<div class="reservaciones-form-header">',
      '<div>',
      '<h2 id="reservaciones-cancel-title">Cancelar reservación</h2>',
      '<p class="card-text">Código: <strong>' + App.ui.escapeHtml(codigo) + '</strong></p>',
      '<p class="card-text">Cliente: <strong>' + App.ui.escapeHtml(cliente) + '</strong></p>',
      '</div>',
      '<button class="btn btn-ghost" id="reservaciones-cancel-close" type="button" aria-label="Cerrar cancelación">Cerrar</button>',
      '</div>',
      textareaField("reservaciones-cancel-motivo", "Motivo de cancelación *", "", false),
      '<p class="form-message" id="reservaciones-cancel-message" role="status" aria-live="polite"></p>',
      '<div class="reservaciones-form-actions">',
      '<button class="btn" id="reservaciones-cancel-back" type="button">Volver</button>',
      '<button class="btn btn-primary" id="reservaciones-cancel-submit" type="submit">Confirmar cancelación</button>',
      '</div>',
      '</form>',
      '</div>'
    ].join("");
  }

  function closeCancelDialog() {
    if (cancelLoading) {
      return;
    }

    selectedCancelReservacion = null;

    const host = document.getElementById("reservaciones-dialog-host");

    if (host) {
      host.innerHTML = "";
    }
  }

  function setCancelMessage(text, type) {
    const element = document.getElementById("reservaciones-cancel-message");

    if (!element) {
      return;
    }

    element.textContent = text || "";
    element.className = "form-message" + (type ? " " + type : "");
  }

  function setCancelLoading(isLoading) {
    cancelLoading = isLoading;

    document.querySelectorAll("#reservaciones-cancel-form input, #reservaciones-cancel-form select, #reservaciones-cancel-form textarea, #reservaciones-cancel-form button").forEach(function (control) {
      control.disabled = isLoading;
    });

    const submit = document.getElementById("reservaciones-cancel-submit");

    if (submit) {
      submit.textContent = isLoading ? "Cancelando..." : "Confirmar cancelación";
    }
  }

  function openCancelDialog(reservacion) {
    const host = document.getElementById("reservaciones-dialog-host");

    if (!host || !reservacion || cancelLoading) {
      return;
    }

    selectedCancelReservacion = reservacion;
    host.innerHTML = renderCancelDialog(reservacion);
    bindCancelDialogEvents();

    const motivo = document.getElementById("reservaciones-cancel-motivo");

    if (motivo) {
      motivo.focus();
    }
  }

  async function submitCancelacion(event) {
    event.preventDefault();

    if (!isAdmin() || !selectedCancelReservacion || cancelLoading) {
      return;
    }

    const motivo = textOrNull(getInputValue("reservaciones-cancel-motivo"));

    if (!motivo) {
      setCancelMessage("Ingresa el motivo de cancelación.", "is-error");
      return;
    }

    const idReservacion = getReservacionId(selectedCancelReservacion);

    actionLoadingId = idReservacion;
    setCancelMessage("", "");
    setCancelLoading(true);
    setLoading(true);

    try {
      await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion) + "/cancelar", {
        method: "PATCH",
        body: {
          motivo_cancelacion: motivo
        }
      });
      setCancelLoading(false);
      closeCancelDialog();
      await loadReservaciones();
      setMessage("Reservación cancelada correctamente.", "is-info");
    } catch (error) {
      setCancelMessage(getBackendMessage(error, "No fue posible cancelar la reservación."), "is-error");
      setCancelLoading(false);
    } finally {
      actionLoadingId = null;
      setLoading(false);
      renderPaginationControls(getElements());
    }
  }

  function bindCancelDialogEvents() {
    const form = document.getElementById("reservaciones-cancel-form");
    const close = document.getElementById("reservaciones-cancel-close");
    const back = document.getElementById("reservaciones-cancel-back");

    if (form) {
      form.addEventListener("submit", submitCancelacion);
    }

    [close, back].forEach(function (button) {
      if (button) {
        button.addEventListener("click", closeCancelDialog);
      }
    });
  }

  function bindDialogEvents() {
    const form = document.getElementById("reservaciones-form");
    const close = document.getElementById("reservaciones-close");
    const cancel = document.getElementById("reservaciones-cancel-form");

    if (form) {
      form.addEventListener("submit", submitForm);
    }

    [close, cancel].forEach(function (button) {
      if (button) {
        button.addEventListener("click", closeDialog);
      }
    });
  }

  function handleTableClick(event) {
    const button = event.target.closest ? event.target.closest("[data-reservacion-action]") : null;

    if (!button || actionLoadingId || submitLoading) {
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.reservacionAction;
    const reservacion = findReservacion(id);

    if (action === "view") {
      openRemoteDialog(FORM_DETAIL, id);
      return;
    }

    if (action === "print") {
      printReservacion(id, reservacion);
      return;
    }

    if (!isAdmin()) {
      setMessage("No tienes permisos para modificar reservaciones.", "is-error");
      return;
    }

    if (action === "edit") {
      openRemoteDialog(FORM_EDIT, id);
      return;
    }

    if (action === "cancel") {
      if (!reservacion) {
        setMessage("Reservación no encontrada en el listado actual.", "is-error");
        return;
      }

      openCancelDialog(reservacion);
    }
  }

  function bindPageEvents() {
    const elements = getElements();

    if (elements.form) {
      elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        resetPagination();
        captureState();
        loadReservaciones();
      });
    }

    if (elements.limpiar) {
      elements.limpiar.addEventListener("click", function () {
        resetSavedState();
        elements.fecha.value = "";
        elements.turno.value = "";
        elements.tour.value = "";
        elements.estado.value = "";
        elements.plataforma.value = "";
        elements.nombre.value = "";
        elements.codigo.value = "";
        resetPagination();
        captureState();
        loadReservaciones();
      });
    }

    if (elements.nueva) {
      elements.nueva.addEventListener("click", function () {
        openDialog(FORM_CREATE, null);
      });
    }

    if (elements.tbody) {
      elements.tbody.addEventListener("click", handleTableClick);
    }

    if (elements.paginationPrev) {
      elements.paginationPrev.addEventListener("click", function () {
        if (pagination.total === 0 || pagination.page <= 1) {
          return;
        }

        pagination.page -= 1;
        captureState();
        loadReservaciones();
      });
    }

    if (elements.paginationNext) {
      elements.paginationNext.addEventListener("click", function () {
        if (pagination.total === 0 || pagination.page >= pagination.totalPages) {
          return;
        }

        pagination.page += 1;
        captureState();
        loadReservaciones();
      });
    }

    if (elements.paginationPages) {
      elements.paginationPages.addEventListener("click", function (event) {
        const button = event.target.closest ? event.target.closest("[data-page]") : null;

        if (!button || button.disabled) {
          return;
        }

        const page = Number(button.dataset.page);

        if (!Number.isInteger(page) || page <= 0 || page === pagination.page) {
          return;
        }

        pagination.page = page;
        captureState();
        loadReservaciones();
      });
    }

    if (elements.paginationLimit) {
      elements.paginationLimit.addEventListener("change", function () {
        const limit = Number(elements.paginationLimit.value);

        if (!PAGE_LIMITS.includes(limit)) {
          elements.paginationLimit.value = String(pagination.limit);
          return;
        }

        pagination.limit = limit;
        resetPagination();
        pagination.limit = limit;
        captureState();
        loadReservaciones();
      });
    }
  }

  App.pages.reservaciones = {
    title: "Reservaciones",
    subtitle: "Listado operativo y captura manual",
    render: function () {
      return [
        '<section class="page reservaciones-page">',
        '<form class="filter-bar reservaciones-filter-bar" id="reservaciones-filtros">',
        '<label class="field" for="reservaciones-fecha"><span class="field-label">Fecha</span><input class="input" id="reservaciones-fecha" name="fecha" type="date"></label>',
        '<label class="field" for="reservaciones-turno"><span class="field-label">Turno</span><select class="input" id="reservaciones-turno" name="turno">' + renderTurnoOptions("", true, false) + "</select></label>",
        '<label class="field" for="reservaciones-tour"><span class="field-label">Tour</span><select class="input" id="reservaciones-tour" name="id_tour"><option value="">Todos</option></select></label>',
        '<label class="field" for="reservaciones-estado"><span class="field-label">Estado</span><select class="input" id="reservaciones-estado" name="estado">' + renderEstadoOptions("") + "</select></label>",
        '<label class="field" for="reservaciones-plataforma"><span class="field-label">Plataforma</span><select class="input" id="reservaciones-plataforma" name="id_plataforma"><option value="">Todas</option></select></label>',
        '<label class="field" for="reservaciones-nombre"><span class="field-label">Cliente</span><input class="input" id="reservaciones-nombre" name="nombre" type="search" maxlength="120" placeholder="Búsqueda parcial"></label>',
        '<label class="field" for="reservaciones-codigo"><span class="field-label">Código</span><input class="input" id="reservaciones-codigo" name="codigo" type="search" maxlength="30" placeholder="Código exacto"></label>',
        '<div class="reservaciones-filter-actions">',
        '<button class="btn btn-primary" type="submit">Aplicar filtros</button>',
        '<button class="btn btn-ghost" id="reservaciones-limpiar" type="button">Limpiar</button>',
        isAdmin() ? '<button class="btn btn-primary" id="reservaciones-nueva" type="button">Nueva reservación</button>' : "",
        "</div>",
        '<p class="form-message reservaciones-message" id="reservaciones-message" role="status" aria-live="polite"></p>',
        "</form>",
        '<div class="table-container reservaciones-table-container">',
        '<table class="data-table reservaciones-table">',
        "<thead><tr>",
        '<th scope="col">Código</th>',
        '<th scope="col">Fecha</th>',
        '<th scope="col">Turno</th>',
        '<th scope="col">Cliente</th>',
        '<th scope="col">Tour</th>',
        '<th scope="col">PAX</th>',
        '<th scope="col">Pickup</th>',
        '<th scope="col">Vendido por</th>',
        '<th scope="col">Estado</th>',
        '<th scope="col">Total</th>',
        '<th scope="col">Acciones</th>',
        "</tr></thead>",
        '<tbody id="reservaciones-tbody">',
        renderStatusRow("Cargando reservaciones", "Consultando reservaciones reales del backend."),
        "</tbody>",
        "</table>",
        "</div>",
        renderPaginationShell(),
        '<div id="reservaciones-dialog-host"></div>',
        '<div class="reservacion-print-root" id="reservacion-print-root" aria-hidden="true"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      requestId += 1;
      catalogRequestId += 1;
      reservaciones = [];
      tours = [];
      paises = [];
      plataformas = [];
      estadosConocidos = new Set([ESTADO_PENDIENTE, ESTADO_CONFIRMADA, ESTADO_ACTIVA, ESTADO_CANCELADA, ESTADO_COMPLETADA]);
      selectedReservacion = null;
      selectedCancelReservacion = null;
      submitLoading = false;
      cancelLoading = false;
      actionLoadingId = null;
      catalogsLoaded = false;
      pagination = {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0
      };
      restoreState();

      bindPageEvents();
      renderPaginationControls(getElements());
      loadReservaciones({ reloadCatalogs: true, restoreState: true });
    }
  };
})();
