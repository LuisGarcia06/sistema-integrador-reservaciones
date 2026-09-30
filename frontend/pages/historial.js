(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const COLUMN_COUNT = 10;
  const PAGE_LIMITS = [25, 50, 100];
  const ESTADOS = ["Pendiente", "Confirmada", "Activa", "Cancelada", "Completada"];
  const TURNOS = ["Mañana", "Tarde"];

  let requestId = 0;
  let reservaciones = [];
  let tours = [];
  let plataformas = [];
  let resumenTours = [];
  let pagination = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  };
  let savedState = null;
  let savedStateUserId = null;

  function getElements() {
    return {
      form: document.getElementById("historial-filtros"),
      fechaDesde: document.getElementById("historial-fecha-desde"),
      fechaHasta: document.getElementById("historial-fecha-hasta"),
      tour: document.getElementById("historial-tour"),
      turno: document.getElementById("historial-turno"),
      estado: document.getElementById("historial-estado"),
      plataforma: document.getElementById("historial-plataforma"),
      codigo: document.getElementById("historial-codigo"),
      nombre: document.getElementById("historial-nombre"),
      limpiar: document.getElementById("historial-limpiar"),
      tbody: document.getElementById("historial-tbody"),
      message: document.getElementById("historial-message"),
      summary: document.getElementById("historial-tour-summary"),
      paginationSummary: document.getElementById("historial-pagination-summary"),
      paginationPages: document.getElementById("historial-pagination-pages"),
      paginationPrev: document.getElementById("historial-pagination-prev"),
      paginationNext: document.getElementById("historial-pagination-next"),
      paginationLimit: document.getElementById("historial-pagination-limit"),
      dialogHost: document.getElementById("historial-dialog-host")
    };
  }

  function escapeValue(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return App.ui.escapeHtml(EMPTY_VALUE);
    }

    return App.ui.escapeHtml(value);
  }

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function getLocalDateString(date) {
    return [
      date.getFullYear(),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getDate())
    ].join("-");
  }

  function getYesterdayLocalString() {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    return getLocalDateString(yesterday);
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
      fecha_desde: "",
      fecha_hasta: getYesterdayLocalString(),
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
    const filters = getEffectiveFilters(elements);
    const nextState = {
      page: normalizeSavedPage(pagination.page),
      limit: normalizeSavedLimit(pagination.limit),
      fecha_desde: filters.fechaDesde,
      fecha_hasta: filters.fechaHasta,
      turno: filters.turno,
      id_tour: filters.idTour,
      estado: filters.estado,
      id_plataforma: filters.idPlataforma,
      nombre: filters.nombre,
      codigo: filters.codigo
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

    if (elements.fechaDesde) {
      elements.fechaDesde.value = state.fecha_desde || "";
    }

    if (elements.fechaHasta) {
      elements.fechaHasta.value = state.fecha_hasta || getYesterdayLocalString();
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

  function isValidDateString(value) {
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

  function normalizeDateValue(value) {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === "string") {
      return value.slice(0, 10);
    }

    return "";
  }

  function formatDate(value) {
    const date = normalizeDateValue(value);

    if (!isValidDateString(date)) {
      return value || EMPTY_VALUE;
    }

    const parts = date.split("-");

    return [parts[2], parts[1], parts[0]].join("/");
  }

  function formatDateTime(value) {
    if (!value) {
      return EMPTY_VALUE;
    }

    const text = String(value);
    const date = normalizeDateValue(text);
    const timeMatch = text.match(/T(\d{2}):(\d{2})/);
    const formattedDate = formatDate(date);

    return timeMatch
      ? formattedDate + " " + timeMatch[1] + ":" + timeMatch[2]
      : formattedDate;
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return EMPTY_VALUE;
    }

    const match = String(value).match(/^(\d{2}):(\d{2})/);
    return match ? match[1] + ":" + match[2] : String(value);
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY_VALUE;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  }

  function getArrayResponse(response) {
    return Array.isArray(response && response.datos) ? response.datos : [];
  }

  function getPaginatedResponse(response) {
    const responsePagination = response && response.pagination ? response.pagination : {};
    const meta = response && response.meta ? response.meta : {};

    return {
      data: Array.isArray(response && response.data) ? response.data : [],
      resumenTours: Array.isArray(meta.resumen_tours) ? meta.resumen_tours : [],
      pagination: {
        page: Number(responsePagination.page) || 1,
        limit: PAGE_LIMITS.includes(Number(responsePagination.limit)) ? Number(responsePagination.limit) : pagination.limit,
        total: Number(responsePagination.total) || 0,
        totalPages: Number(responsePagination.totalPages) || 0
      }
    };
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

  function getPlataformaName(reservacion) {
    return reservacion && reservacion.plataforma
      ? reservacion.plataforma
      : getCatalogName(plataformas, "id_plataforma", reservacion && reservacion.id_plataforma);
  }

  function getVendidoPor(reservacion) {
    if (reservacion && reservacion.vendedor) {
      return reservacion.vendedor;
    }

    return getPlataformaName(reservacion) || EMPTY_VALUE;
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

  function getEstadoBadgeClass(estado) {
    if (estado === "Cancelada") {
      return "badge badge-danger";
    }

    if (estado === "Completada") {
      return "badge";
    }

    return "badge badge-neutral";
  }

  function getMensajeError(error) {
    if (error && error.status === 403) {
      return "No tienes permisos para consultar el historial.";
    }

    if (error && error.data && error.data.mensaje) {
      return error.data.mensaje;
    }

    if (error && error.isNetworkError) {
      return "No se pudo conectar con el servidor.";
    }

    return "No se pudo consultar el historial.";
  }

  function setMessage(elements, text, type) {
    if (!elements.message) {
      return;
    }

    elements.message.textContent = text || "";
    elements.message.className = "form-message historial-message" + (type ? " " + type : "");
  }

  function setLoading(elements, isLoading) {
    [
      elements.fechaDesde,
      elements.fechaHasta,
      elements.tour,
      elements.turno,
      elements.estado,
      elements.plataforma,
      elements.codigo,
      elements.nombre,
      elements.limpiar,
      elements.paginationPrev,
      elements.paginationNext,
      elements.paginationLimit
    ].forEach(function (control) {
      if (control) {
        control.disabled = isLoading;
      }
    });

    const submit = elements.form ? elements.form.querySelector('[type="submit"]') : null;

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

  function renderSelectOptions(collection, idField, selectedValue, emptyLabel) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);

    return [
      '<option value="">' + App.ui.escapeHtml(emptyLabel) + "</option>",
      collection.map(function (item) {
        const id = item && item[idField] !== null && item[idField] !== undefined ? String(item[idField]) : "";
        const name = item && item.nombre ? item.nombre : id;

        return '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selected ? " selected" : "") + ">" +
          App.ui.escapeHtml(name || EMPTY_VALUE) +
          "</option>";
      }).join("")
    ].join("");
  }

  function renderStaticOptions(values, selectedValue, emptyLabel) {
    const selected = selectedValue || "";

    return [
      '<option value="">' + App.ui.escapeHtml(emptyLabel) + "</option>",
      values.map(function (value) {
        return '<option value="' + App.ui.escapeHtml(value) + '"' + (value === selected ? " selected" : "") + ">" +
          App.ui.escapeHtml(value) +
          "</option>";
      }).join("")
    ].join("");
  }

  function populateCatalogs(elements) {
    if (elements.tour) {
      const current = elements.tour.value;
      elements.tour.innerHTML = renderSelectOptions(tours, "id_tour", current, "Todos");
      elements.tour.value = current;
    }

    if (elements.plataforma) {
      const current = elements.plataforma.value;
      elements.plataforma.innerHTML = renderSelectOptions(plataformas, "id_plataforma", current, "Todas");
      elements.plataforma.value = current;
    }
  }

  function getEffectiveFilters(elements) {
    const yesterday = getYesterdayLocalString();
    const fechaDesde = elements.fechaDesde ? elements.fechaDesde.value : "";
    let fechaHasta = elements.fechaHasta ? elements.fechaHasta.value : "";

    if (fechaHasta && fechaHasta > yesterday) {
      fechaHasta = yesterday;
    }

    return {
      fechaDesde: fechaDesde,
      fechaHasta: fechaHasta || yesterday,
      idTour: elements.tour ? elements.tour.value : "",
      turno: elements.turno ? elements.turno.value : "",
      estado: elements.estado ? elements.estado.value : "",
      idPlataforma: elements.plataforma ? elements.plataforma.value : "",
      codigo: elements.codigo && elements.codigo.value.trim() ? elements.codigo.value.trim() : "",
      nombre: elements.nombre && elements.nombre.value.trim() ? elements.nombre.value.trim() : ""
    };
  }

  function validateFilters(elements) {
    const filters = getEffectiveFilters(elements);

    if (filters.fechaDesde && !isValidDateString(filters.fechaDesde)) {
      return "La fecha desde debe tener formato YYYY-MM-DD y ser una fecha válida.";
    }

    if (filters.fechaHasta && !isValidDateString(filters.fechaHasta)) {
      return "La fecha hasta debe tener formato YYYY-MM-DD y ser una fecha válida.";
    }

    if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
      return "La fecha desde debe ser menor o igual a la fecha hasta.";
    }

    return "";
  }

  function buildBackendQuery(elements, page, limit) {
    const params = new URLSearchParams();
    const filters = getEffectiveFilters(elements);

    params.set("page", String(page || 1));
    params.set("limit", String(limit || pagination.limit));
    params.set("include_resumen_tours", "1");
    params.set("fecha_hasta", filters.fechaHasta);

    if (filters.fechaDesde) {
      params.set("fecha_desde", filters.fechaDesde);
    }

    if (filters.idTour) {
      params.set("id_tour", filters.idTour);
    }

    if (filters.turno) {
      params.set("turno", filters.turno);
    }

    if (filters.estado) {
      params.set("estado", filters.estado);
    }

    if (filters.idPlataforma) {
      params.set("id_plataforma", filters.idPlataforma);
    }

    if (filters.codigo) {
      params.set("codigo", filters.codigo);
    }

    if (filters.nombre) {
      params.set("nombre", filters.nombre);
    }

    return "?" + params.toString();
  }

  function hasActiveFilters(elements) {
    const filters = getEffectiveFilters(elements);

    return Boolean(
      filters.fechaDesde ||
      (elements.fechaHasta && elements.fechaHasta.value) ||
      filters.idTour ||
      filters.turno ||
      filters.estado ||
      filters.idPlataforma ||
      filters.codigo ||
      filters.nombre
    );
  }

  function renderPaginationShell() {
    return [
      '<nav class="pagination historial-pagination" id="historial-pagination" aria-label="Paginación del historial">',
      '<p class="pagination-summary" id="historial-pagination-summary">Mostrando 0 de 0</p>',
      '<div class="pagination-controls">',
      '<button class="btn btn-ghost pagination-nav" id="historial-pagination-prev" type="button">Anterior</button>',
      '<div class="pagination-pages" id="historial-pagination-pages"></div>',
      '<button class="btn btn-ghost pagination-nav" id="historial-pagination-next" type="button">Siguiente</button>',
      "</div>",
      '<label class="field pagination-limit-field" for="historial-pagination-limit">',
      '<span class="field-label">Por página</span>',
      '<select class="input" id="historial-pagination-limit">',
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
      const estado = reservacion.estado || EMPTY_VALUE;
      const isCancelada = estado === "Cancelada";
      const id = reservacion && reservacion.id_reservacion !== null && reservacion.id_reservacion !== undefined
        ? String(reservacion.id_reservacion)
        : "";

      return [
        '<tr class="' + (isCancelada ? "is-cancelada" : "") + '">',
        "<td>" + escapeValue(formatDate(reservacion.fecha)) + "</td>",
        '<td><strong class="historial-primary-text">' + escapeValue(reservacion.codigo) + "</strong></td>",
        "<td>" + escapeValue(reservacion.nombre_cliente) + "</td>",
        "<td>" + escapeValue(getTourName(reservacion)) + "</td>",
        '<td class="historial-number-cell">' + escapeValue(reservacion.pax) + "</td>",
        "<td>" + renderPickupCell(reservacion) + "</td>",
        "<td>" + escapeValue(getVendidoPor(reservacion)) + "</td>",
        '<td><span class="' + getEstadoBadgeClass(estado) + '">' + escapeValue(estado) + "</span></td>",
        '<td class="historial-money-cell">' + escapeValue(formatMoney(reservacion.precio_total)) + "</td>",
        '<td><button class="btn btn-ghost" type="button" data-historial-action="view" data-id="' + App.ui.escapeHtml(id) + '">Ver detalle</button></td>',
        "</tr>"
      ].join("");
    }).join("");
  }

  function renderSummary() {
    if (!Array.isArray(resumenTours) || resumenTours.length === 0) {
      return "";
    }

    return [
      '<div class="historial-summary-label">Clasificación por tour</div>',
      '<div class="historial-summary-list">',
      resumenTours.map(function (entry) {
        return [
          '<span class="badge badge-neutral historial-tour-badge">',
          App.ui.escapeHtml(entry.tour || ("Tour ID " + entry.id_tour)),
          " ",
          '<strong>' + App.ui.escapeHtml(entry.total) + "</strong>",
          "</span>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderHistorial(elements, data) {
    if (!elements.tbody) {
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      elements.tbody.innerHTML = hasActiveFilters(elements)
        ? renderStatusRow("No se encontraron reservaciones con los filtros seleccionados.", "Ajusta los filtros para consultar otros registros históricos.")
        : renderStatusRow("No hay reservaciones en el historial.", "Las reservaciones entran al historial cuando su fecha es anterior a hoy.");
    } else {
      elements.tbody.innerHTML = renderRows(data);
    }

    if (elements.summary) {
      elements.summary.innerHTML = renderSummary();
    }
  }

  function resetPagination() {
    pagination.page = 1;
    pagination.total = 0;
    pagination.totalPages = 0;
  }

  function findReservacion(id) {
    return reservaciones.find(function (reservacion) {
      return reservacion && String(reservacion.id_reservacion) === String(id);
    });
  }

  function detailValue(value, formatter) {
    if (value === null || value === undefined || value === "") {
      return EMPTY_VALUE;
    }

    return formatter ? formatter(value) : value;
  }

  function renderDetailItem(label, value) {
    return [
      '<div class="historial-detail-item">',
      '<span class="historial-detail-label">' + App.ui.escapeHtml(label) + "</span>",
      '<strong class="historial-detail-value">' + escapeValue(value) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderDetailDialog(reservacion) {
    const estado = reservacion && reservacion.estado ? String(reservacion.estado) : "";

    return [
      '<div class="historial-dialog-backdrop" id="historial-dialog" role="dialog" aria-modal="true" aria-labelledby="historial-dialog-title">',
      '<article class="card historial-detail-dialog">',
      '<header class="historial-detail-header">',
      '<div>',
      '<p class="card-eyebrow">Detalle histórico</p>',
      '<h2 id="historial-dialog-title">' + escapeValue(reservacion && reservacion.codigo) + "</h2>",
      '<p class="card-text">' + escapeValue(reservacion && reservacion.nombre_cliente) + "</p>",
      "</div>",
      '<button class="btn btn-ghost" id="historial-close" type="button" aria-label="Cerrar detalle">Cerrar</button>',
      "</header>",
      '<section class="historial-detail-grid">',
      renderDetailItem("Código", detailValue(reservacion && reservacion.codigo)),
      renderDetailItem("Fecha", detailValue(reservacion && reservacion.fecha, formatDate)),
      renderDetailItem("Tour", detailValue(getTourName(reservacion))),
      renderDetailItem("Turno", detailValue(reservacion && reservacion.turno)),
      renderDetailItem("Estado", detailValue(estado)),
      renderDetailItem("Nombre cliente", detailValue(reservacion && reservacion.nombre_cliente)),
      renderDetailItem("Teléfono", detailValue(reservacion && reservacion.telefono_cliente)),
      renderDetailItem("Idioma", detailValue(reservacion && reservacion.idioma)),
      renderDetailItem("Notificado", formatNotificado(reservacion && reservacion.notificado)),
      renderDetailItem("País", detailValue(reservacion && reservacion.pais)),
      renderDetailItem("Habitación", detailValue(reservacion && reservacion.habitacion)),
      renderDetailItem("PAX", detailValue(reservacion && reservacion.pax)),
      renderDetailItem("Niños", detailValue(reservacion && reservacion.ninos)),
      renderDetailItem("Pickup place", detailValue(reservacion && reservacion.pickup_place)),
      renderDetailItem("Pickup time", detailValue(reservacion && reservacion.pickup_time, formatTime)),
      renderDetailItem("Plataforma", detailValue(getPlataformaName(reservacion))),
      renderDetailItem("Vendedor", detailValue(reservacion && reservacion.vendedor)),
      renderDetailItem("Precio total", detailValue(reservacion && reservacion.precio_total, formatMoney)),
      renderDetailItem("Depósito", detailValue(reservacion && reservacion.deposito, formatMoney)),
      renderDetailItem("Saldo", detailValue(reservacion && reservacion.saldo, formatMoney)),
      renderDetailItem("Tipo de cambio", detailValue(reservacion && reservacion.tipo_cambio, formatMoney)),
      renderDetailItem("Método de pago", detailValue(reservacion && reservacion.metodo_pago)),
      renderDetailItem("Fecha de registro", detailValue(reservacion && reservacion.fecha_registro, formatDateTime)),
      renderDetailItem("Última actualización", detailValue(reservacion && reservacion.ultima_actualizacion, formatDateTime)),
      '<div class="historial-detail-item historial-detail-full">',
      '<span class="historial-detail-label">Observaciones</span>',
      '<strong class="historial-detail-value">' + escapeValue(reservacion && reservacion.observaciones) + "</strong>",
      "</div>",
      '<div class="historial-detail-item historial-detail-full">',
      '<span class="historial-detail-label">Motivo de cancelación</span>',
      '<strong class="historial-detail-value">' + escapeValue(reservacion && reservacion.motivo_cancelacion) + "</strong>",
      "</div>",
      "</section>",
      "</article>",
      "</div>"
    ].join("");
  }

  function closeDetailDialog() {
    const elements = getElements();

    if (elements.dialogHost) {
      elements.dialogHost.innerHTML = "";
    }
  }

  function openDetailDialog(reservacion) {
    const elements = getElements();

    if (!elements.dialogHost || !reservacion) {
      return;
    }

    elements.dialogHost.innerHTML = renderDetailDialog(reservacion);

    const close = document.getElementById("historial-close");

    if (close) {
      close.addEventListener("click", closeDetailDialog);
      close.focus();
    }
  }

  async function loadCatalogs() {
    const responses = await Promise.all([
      App.api.apiFetch("/api/tours"),
      App.api.apiFetch("/api/plataformas")
    ]);

    tours = getArrayResponse(responses[0]);
    plataformas = getArrayResponse(responses[1]);
    populateCatalogs(getElements());
  }

  async function loadHistorial(options) {
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
      setMessage(elements, validationMessage, "is-error");
      return;
    }

    const currentRequestId = requestId + 1;
    requestId = currentRequestId;
    elements.tbody.innerHTML = renderStatusRow("Cargando historial", "Consultando reservaciones históricas reales del backend.");

    if (elements.summary) {
      elements.summary.innerHTML = "";
    }

    setMessage(elements, "", "");
    setLoading(elements, true);

    try {
      if (config.reloadCatalogs || tours.length === 0 || plataformas.length === 0) {
        await loadCatalogs();
      }

      if (config.restoreState) {
        restoreState();
      }

      const response = await App.api.apiFetch(
        "/api/reservaciones" + buildBackendQuery(elements, requestedPage, requestedLimit)
      );

      if (currentRequestId !== requestId || window.location.hash !== "#/historial") {
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
        await loadHistorial({
          page: pagination.page,
          limit: pagination.limit
        });
        return;
      }

      reservaciones = paginatedResponse.data;
      resumenTours = paginatedResponse.resumenTours;
      pagination = paginatedResponse.pagination;
      renderHistorial(getElements(), reservaciones);
      renderPaginationControls(getElements());
      setMessage(
        getElements(),
        pagination.total + " reservaciones históricas encontradas. Hoy y fechas futuras quedan excluidas.",
        "is-info"
      );
      captureState();
    } catch (error) {
      if (currentRequestId !== requestId || window.location.hash !== "#/historial") {
        return;
      }

      const message = getMensajeError(error);

      reservaciones = [];
      resumenTours = [];
      pagination.total = 0;
      pagination.totalPages = 0;
      elements.tbody.innerHTML = renderStatusRow("No se pudo cargar el historial", message);

      if (elements.summary) {
        elements.summary.innerHTML = "";
      }

      renderPaginationControls(getElements());
      setMessage(elements, message, "is-error");
    } finally {
      if (currentRequestId === requestId && window.location.hash === "#/historial") {
        setLoading(getElements(), false);
        renderPaginationControls(getElements());
      }
    }
  }

  function bindPageEvents() {
    const elements = getElements();

    if (elements.form) {
      elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        resetPagination();
        captureState();
        loadHistorial();
      });
    }

    if (elements.limpiar) {
      elements.limpiar.addEventListener("click", function () {
        resetSavedState();
        elements.fechaDesde.value = "";
        elements.fechaHasta.value = getYesterdayLocalString();
        elements.tour.value = "";
        elements.turno.value = "";
        elements.estado.value = "";
        elements.plataforma.value = "";
        elements.codigo.value = "";
        elements.nombre.value = "";
        resetPagination();
        captureState();
        loadHistorial();
      });
    }

    if (elements.tbody) {
      elements.tbody.addEventListener("click", function (event) {
        const button = event.target.closest ? event.target.closest("[data-historial-action]") : null;

        if (!button) {
          return;
        }

        const reservacion = findReservacion(button.dataset.id);

        if (button.dataset.historialAction === "view") {
          openDetailDialog(reservacion);
        }
      });
    }

    if (elements.dialogHost) {
      elements.dialogHost.addEventListener("click", function (event) {
        if (event.target && event.target.id === "historial-dialog") {
          closeDetailDialog();
        }
      });
    }

    if (elements.paginationPrev) {
      elements.paginationPrev.addEventListener("click", function () {
        if (pagination.total === 0 || pagination.page <= 1) {
          return;
        }

        pagination.page -= 1;
        captureState();
        loadHistorial();
      });
    }

    if (elements.paginationNext) {
      elements.paginationNext.addEventListener("click", function () {
        if (pagination.total === 0 || pagination.page >= pagination.totalPages) {
          return;
        }

        pagination.page += 1;
        captureState();
        loadHistorial();
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
        loadHistorial();
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
        loadHistorial();
      });
    }
  }

  App.pages.historial = {
    title: "Historial",
    subtitle: "Consulta histórica de reservaciones",
    render: function () {
      return [
        '<section class="page historial-page">',
        '<form class="filter-bar historial-filter-bar" id="historial-filtros">',
        '<label class="field" for="historial-fecha-desde"><span class="field-label">Fecha desde</span><input class="input" id="historial-fecha-desde" name="fecha_desde" type="date"></label>',
        '<label class="field" for="historial-fecha-hasta"><span class="field-label">Fecha hasta</span><input class="input" id="historial-fecha-hasta" name="fecha_hasta" type="date" max="' + App.ui.escapeHtml(getYesterdayLocalString()) + '"></label>',
        '<label class="field" for="historial-tour"><span class="field-label">Tour</span><select class="input" id="historial-tour" name="id_tour"><option value="">Todos</option></select></label>',
        '<label class="field" for="historial-turno"><span class="field-label">Turno</span><select class="input" id="historial-turno" name="turno">' + renderStaticOptions(TURNOS, "", "Todos") + "</select></label>",
        '<label class="field" for="historial-estado"><span class="field-label">Estado</span><select class="input" id="historial-estado" name="estado">' + renderStaticOptions(ESTADOS, "", "Todos") + "</select></label>",
        '<label class="field" for="historial-plataforma"><span class="field-label">Plataforma</span><select class="input" id="historial-plataforma" name="id_plataforma"><option value="">Todas</option></select></label>',
        '<label class="field" for="historial-codigo"><span class="field-label">Código</span><input class="input" id="historial-codigo" name="codigo" type="search" maxlength="30" placeholder="Código exacto"></label>',
        '<label class="field" for="historial-nombre"><span class="field-label">Nombre</span><input class="input" id="historial-nombre" name="nombre" type="search" maxlength="120" placeholder="Cliente"></label>',
        '<div class="historial-filter-actions">',
        '<button class="btn btn-primary" type="submit">Aplicar filtros</button>',
        '<button class="btn btn-ghost" id="historial-limpiar" type="button">Limpiar</button>',
        "</div>",
        '<p class="form-message historial-message" id="historial-message" aria-live="polite"></p>',
        "</form>",
        '<section class="historial-tour-summary" id="historial-tour-summary" aria-live="polite"></section>',
        '<div class="table-container historial-table-container">',
        '<table class="data-table historial-table">',
        "<thead><tr>",
        '<th scope="col">Fecha</th>',
        '<th scope="col">Código</th>',
        '<th scope="col">Cliente</th>',
        '<th scope="col">Tour</th>',
        '<th scope="col">PAX</th>',
        '<th scope="col">Pickup</th>',
        '<th scope="col">Plataforma / vendido por</th>',
        '<th scope="col">Estado</th>',
        '<th scope="col">Total</th>',
        '<th scope="col">Acciones</th>',
        "</tr></thead>",
        '<tbody id="historial-tbody">',
        renderStatusRow("Cargando historial", "Consultando reservaciones históricas reales del backend."),
        "</tbody>",
        "</table>",
        "</div>",
        renderPaginationShell(),
        '<div id="historial-dialog-host"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      requestId += 1;
      reservaciones = [];
      tours = [];
      plataformas = [];
      resumenTours = [];
      pagination = {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0
      };
      restoreState();

      bindPageEvents();
      renderPaginationControls(getElements());
      loadHistorial({ reloadCatalogs: true, restoreState: true });
    }
  };
})();
