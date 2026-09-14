(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const ESTADO_PROGRAMADA = "Programada";
  const ESTADO_CANCELADA = "Cancelada";
  const FORM_CREATE = "create";
  const FORM_EDIT = "edit";
  const FORM_DETAIL = "detail";
  const COLUMN_COUNT = 10;
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
  let estadosConocidos = new Set([ESTADO_PROGRAMADA, ESTADO_CANCELADA]);
  let selectedReservacion = null;
  let submitLoading = false;
  let actionLoadingId = null;
  let catalogsLoaded = false;

  function isAdmin() {
    return Boolean(App.auth && App.auth.esAdministrador && App.auth.esAdministrador());
  }

  function getElements() {
    return {
      form: document.getElementById("reservaciones-filtros"),
      fecha: document.getElementById("reservaciones-fecha"),
      tour: document.getElementById("reservaciones-tour"),
      estado: document.getElementById("reservaciones-estado"),
      plataforma: document.getElementById("reservaciones-plataforma"),
      nombre: document.getElementById("reservaciones-nombre"),
      codigo: document.getElementById("reservaciones-codigo"),
      limpiar: document.getElementById("reservaciones-limpiar"),
      nueva: document.getElementById("reservaciones-nueva"),
      message: document.getElementById("reservaciones-message"),
      tbody: document.getElementById("reservaciones-tbody"),
      dialogHost: document.getElementById("reservaciones-dialog-host")
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
      elements.tour,
      elements.estado,
      elements.plataforma,
      elements.nombre,
      elements.codigo,
      elements.limpiar,
      elements.nueva
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

  function renderEstadoOptions(selectedValue) {
    const selected = selectedValue || "";
    const ordered = Array.from(estadosConocidos).sort(function (a, b) {
      if (a === ESTADO_PROGRAMADA) {
        return -1;
      }

      if (b === ESTADO_PROGRAMADA) {
        return 1;
      }

      if (a === ESTADO_CANCELADA) {
        return b === ESTADO_PROGRAMADA ? 1 : -1;
      }

      if (b === ESTADO_CANCELADA) {
        return a === ESTADO_PROGRAMADA ? -1 : 1;
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

  function buildQuery(elements) {
    const params = new URLSearchParams();

    if (elements.fecha && elements.fecha.value) {
      params.set("fecha", elements.fecha.value);
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

  function renderActions(reservacion) {
    const id = getReservacionId(reservacion);
    const viewButton = '<button class="btn btn-ghost" type="button" data-reservacion-action="view" data-id="' + App.ui.escapeHtml(id) + '">Ver</button>';

    if (!isAdmin()) {
      return viewButton;
    }

    const editButton = '<button class="btn" type="button" data-reservacion-action="edit" data-id="' + App.ui.escapeHtml(id) + '">Editar</button>';
    const cancelButton = isCancelada(reservacion)
      ? ""
      : '<button class="btn btn-ghost" type="button" data-reservacion-action="cancel" data-id="' + App.ui.escapeHtml(id) + '">Cancelar</button>';

    return [viewButton, editButton, cancelButton].join("");
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
        "<td>" + escapeValue(reservacion && reservacion.nombre_cliente) + "</td>",
        "<td>" + escapeValue(getTourName(reservacion)) + "</td>",
        '<td class="reservaciones-number-cell">' + escapeValue(reservacion && reservacion.pax) + "</td>",
        "<td>" + escapeValue(reservacion && reservacion.pickup_place) + '<span class="reservaciones-secondary-text">' + escapeValue(formatTime(reservacion && reservacion.pickup_time)) + "</span></td>",
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

      const response = await App.api.apiFetch("/api/reservaciones" + buildQuery(elements));

      if (activeRequestId !== requestId || window.location.hash !== "#/reservaciones") {
        return;
      }

      reservaciones = getArrayResponse(response);
      updateKnownEstados(reservaciones);
      populateFilterCatalogs();
      renderTable(reservaciones, getElements());
      setMessage(reservaciones.length + " reservaciones encontradas.", "is-info");
    } catch (error) {
      if (activeRequestId !== requestId || window.location.hash !== "#/reservaciones") {
        return;
      }

      reservaciones = [];
      elements.tbody.innerHTML = renderStatusRow(
        "No se pudieron cargar las reservaciones",
        getBackendMessage(error, "No fue posible consultar las reservaciones.")
      );
      setMessage(getBackendMessage(error, "No fue posible consultar las reservaciones."), "is-error");
    } finally {
      if (activeRequestId === requestId && window.location.hash === "#/reservaciones") {
        setLoading(false);
      }
    }
  }

  function findReservacion(id) {
    return reservaciones.find(function (reservacion) {
      return getReservacionId(reservacion) === String(id);
    });
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
    const estado = isCreate ? ESTADO_PROGRAMADA : (reservacion && reservacion.estado ? reservacion.estado : EMPTY_VALUE);
    const selectedTourId = reservacion ? reservacion.id_tour : "";
    const selectedPaisId = reservacion ? reservacion.id_pais : "";
    const selectedPlataformaId = reservacion ? reservacion.id_plataforma : "";

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
        textField("reserva-codigo", "Código *", reservacion && reservacion.codigo, 'type="text" maxlength="30"', readOnly),
        textField("reserva-fecha", "Fecha *", normalizeDate(reservacion && reservacion.fecha), 'type="date"', readOnly),
        selectField("reserva-tour", "Tour *", renderTourOptions(selectedTourId, !isCreate, false), readOnly),
        selectField("reserva-pais", "País *", renderPaisOptions(selectedPaisId, false), readOnly),
        selectField("reserva-plataforma", "Plataforma *", renderPlataformaOptions(selectedPlataformaId, false), readOnly)
      ].join("")),
      renderSection("Cliente", [
        textField("reserva-nombre", "Nombre del cliente *", reservacion && reservacion.nombre_cliente, 'type="text" maxlength="120"', readOnly),
        textField("reserva-telefono", "Teléfono", reservacion && reservacion.telefono_cliente, 'type="text" maxlength="30"', readOnly),
        textField("reserva-habitacion", "Habitación", reservacion && reservacion.habitacion, 'type="text" maxlength="50"', readOnly)
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
    if (submitLoading) {
      return;
    }

    selectedReservacion = null;

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
      codigo: getInputValue("reserva-codigo").trim(),
      fecha: getInputValue("reserva-fecha"),
      id_tour: Number(getInputValue("reserva-tour")),
      id_pais: Number(getInputValue("reserva-pais")),
      id_plataforma: Number(getInputValue("reserva-plataforma")),
      nombre_cliente: getInputValue("reserva-nombre").trim(),
      telefono_cliente: textOrNull(getInputValue("reserva-telefono")),
      habitacion: textOrNull(getInputValue("reserva-habitacion")),
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
      payload.estado = ESTADO_PROGRAMADA;
    }

    if (!payload.codigo) {
      errores.push("Ingresa el código.");
    }

    if (!isValidDateValue(payload.fecha)) {
      errores.push("Selecciona una fecha válida.");
    }

    if (!Number.isInteger(payload.id_tour) || payload.id_tour <= 0) {
      errores.push("Selecciona un tour.");
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
      if (mode === FORM_EDIT) {
        await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion), {
          method: "PATCH",
          body: payload
        });
        setMessage("Reservación actualizada correctamente.", "is-info");
      } else {
        await App.api.apiFetch("/api/reservaciones", {
          method: "POST",
          body: payload
        });
        setMessage("Reservación creada correctamente.", "is-info");
      }

      setFormLoading(false);
      closeDialog();
      await loadReservaciones();
    } catch (error) {
      setFormMessage(getBackendMessage(error, "No fue posible guardar la reservación."), "is-error");
      setFormLoading(false);
    }
  }

  async function cancelarReservacion(reservacion) {
    if (!isAdmin() || !reservacion || actionLoadingId) {
      return;
    }

    const idReservacion = getReservacionId(reservacion);
    const codigo = reservacion.codigo || ("ID " + idReservacion);
    const cliente = reservacion.nombre_cliente || EMPTY_VALUE;

    if (!window.confirm("¿Cancelar la reservación " + codigo + " de " + cliente + "? Esta acción no elimina el registro.")) {
      return;
    }

    actionLoadingId = idReservacion;
    setLoading(true);
    setMessage("", "");

    try {
      await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion) + "/cancelar", {
        method: "PATCH"
      });
      await loadReservaciones();
      setMessage("Reservación cancelada correctamente.", "is-info");
    } catch (error) {
      setMessage(getBackendMessage(error, "No fue posible cancelar la reservación."), "is-error");
    } finally {
      actionLoadingId = null;
      setLoading(false);
    }
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

      cancelarReservacion(reservacion);
    }
  }

  function bindPageEvents() {
    const elements = getElements();

    if (elements.form) {
      elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        loadReservaciones();
      });
    }

    if (elements.limpiar) {
      elements.limpiar.addEventListener("click", function () {
        elements.fecha.value = "";
        elements.tour.value = "";
        elements.estado.value = "";
        elements.plataforma.value = "";
        elements.nombre.value = "";
        elements.codigo.value = "";
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
  }

  App.pages.reservaciones = {
    title: "Reservaciones",
    subtitle: "Listado operativo y captura manual",
    render: function () {
      return [
        '<section class="page reservaciones-page">',
        '<form class="filter-bar reservaciones-filter-bar" id="reservaciones-filtros">',
        '<label class="field" for="reservaciones-fecha"><span class="field-label">Fecha</span><input class="input" id="reservaciones-fecha" name="fecha" type="date"></label>',
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
        '<div id="reservaciones-dialog-host"></div>',
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
      estadosConocidos = new Set([ESTADO_PROGRAMADA, ESTADO_CANCELADA]);
      selectedReservacion = null;
      submitLoading = false;
      actionLoadingId = null;
      catalogsLoaded = false;

      bindPageEvents();
      loadReservaciones({ reloadCatalogs: true });
    }
  };
})();
