(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "--";
  const FORM_MODE_CREATE = "create";
  const FORM_MODE_EDIT = "edit";
  const TRANSPORTE_FORM_CREATE = "create";
  const TRANSPORTE_FORM_EDIT = "edit";

  let operacionesRequestId = 0;
  let catalogosRequestId = 0;
  let transportesRequestId = 0;
  let transporteCatalogosRequestId = 0;
  let organizacionRequestId = 0;
  let currentFecha = "";
  let operaciones = [];
  let tours = [];
  let guias = [];
  let transportes = [];
  let organizacionDaily = null;
  let operadores = [];
  let vehiculos = [];
  let catalogosCargados = false;
  let catalogosLoading = false;
  let transporteCatalogosCargados = false;
  let transporteCatalogosLoading = false;
  let transportesLoading = false;
  let organizacionReservacionesAbierta = false;
  let organizacionReservacionesLoading = false;
  let selectedTransportOperacion = null;
  let selectedTransporte = null;
  let selectedOperacion = null;
  let submitLoading = false;
  let transporteSubmitLoading = false;
  let reservacionTransporteLoadingId = null;

  function escapeHtml(value) {
    return App.ui.escapeHtml(value === null || value === undefined || value === "" ? EMPTY_VALUE : value);
  }

  function getArrayResponse(response) {
    return response && Array.isArray(response.datos) ? response.datos : [];
  }

  function isValidDateValue(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function getLocalDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY_VALUE;
    }

    const time = String(value);
    const match = time.match(/^(\d{2}):(\d{2})/);

    return match ? match[1] + ":" + match[2] : time;
  }

  function normalizeTimeForInput(value) {
    const formatted = formatTime(value);
    return formatted === EMPTY_VALUE ? "" : formatted;
  }

  function deriveTurno(hora) {
    const match = String(hora || "").match(/^(\d{2}):(\d{2})$/);

    if (!match) {
      return "";
    }

    const minutes = Number(match[1]) * 60 + Number(match[2]);

    return minutes <= 720 ? "Mañana" : "Tarde";
  }

  function isActiveFlag(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function getOperacionId(operacion) {
    return Number(operacion && operacion.id_operacion_tour);
  }

  function findOperacionById(idOperacion) {
    const id = Number(idOperacion);

    return operaciones.find(function (operacion) {
      return getOperacionId(operacion) === id;
    }) || null;
  }

  function getTransporteId(transporte) {
    return Number(transporte && transporte.id_transporte_operacion);
  }

  function getReservacionId(reservacion) {
    return Number(reservacion && reservacion.id_reservacion);
  }

  function getOperacionFecha(operacion) {
    const fecha = operacion && operacion.fecha ? String(operacion.fecha) : currentFecha;
    const match = fecha.match(/^(\d{4}-\d{2}-\d{2})/);

    return match ? match[1] : "";
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toMetric(value) {
    const number = Number(value);

    return Number.isFinite(number) ? String(number) : "0";
  }

  function normalizeEstado(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isCancelada(reservacion) {
    return normalizeEstado(reservacion && reservacion.estado) === "cancelada";
  }

  function getEstadoBadgeClass(estado) {
    if (normalizeEstado(estado) === "cancelada") {
      return " badge-danger";
    }

    if (!estado || estado === EMPTY_VALUE) {
      return " badge-neutral";
    }

    return "";
  }

  function getReservacionEstado(reservacion) {
    return isCancelada(reservacion) ? "Cancelada" : (reservacion && reservacion.estado ? reservacion.estado : EMPTY_VALUE);
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

  function findTransporteById(idTransporte) {
    const id = Number(idTransporte);

    return transportes.find(function (transporte) {
      return getTransporteId(transporte) === id;
    }) || null;
  }

  function getOperacionOrganizacion() {
    const idOperacion = getOperacionId(selectedTransportOperacion);

    return getArray(organizacionDaily && organizacionDaily.operaciones).find(function (operacion) {
      return getOperacionId(operacion) === idOperacion;
    }) || null;
  }

  function getReservacionesPendientesOperacion() {
    const operacion = selectedTransportOperacion;

    if (!operacion) {
      return [];
    }

    const idTour = Number(operacion.id_tour);
    const fechaOperacion = getOperacionFecha(operacion);

    return getArray(organizacionDaily && organizacionDaily.reservaciones_sin_asignar).filter(function (reservacion) {
      return Number(reservacion && reservacion.id_tour) === idTour &&
        getOperacionFecha(reservacion) === fechaOperacion;
    });
  }

  function isAdmin() {
    return App.auth && App.auth.esAdministrador();
  }

  function setMessage(message, type) {
    const element = document.getElementById("operaciones-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function setContentLoading(isLoading) {
    const content = document.getElementById("operaciones-content");

    if (!content) {
      return;
    }

    content.setAttribute("aria-busy", isLoading ? "true" : "false");

    if (isLoading) {
      content.innerHTML = renderLoading();
    }
  }

  function setSubmitLoading(isLoading) {
    submitLoading = isLoading;

    const submitButton = document.getElementById("operacion-submit");
    const cancelButton = document.getElementById("operacion-cancel");
    const closeButton = document.getElementById("operacion-close");

    if (submitButton) {
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? "Guardando..." : "Guardar";
    }

    if (cancelButton) {
      cancelButton.disabled = isLoading;
    }

    if (closeButton) {
      closeButton.disabled = isLoading;
    }
  }

  function setCatalogosLoading(isLoading) {
    catalogosLoading = isLoading;

    const newButton = document.getElementById("operaciones-new");

    if (newButton) {
      newButton.disabled = isLoading || !catalogosCargados;
      newButton.textContent = isLoading ? "Cargando catálogos..." : "Nueva operación";
    }
  }

  function setTransportesLoading(isLoading) {
    transportesLoading = isLoading;

    const list = document.getElementById("transportes-list");

    if (list) {
      list.setAttribute("aria-busy", isLoading ? "true" : "false");

      if (isLoading) {
        list.innerHTML = renderTransportesLoading();
      }
    }
  }

  function setTransporteCatalogosLoading(isLoading) {
    transporteCatalogosLoading = isLoading;

    const newButton = document.getElementById("transporte-new");

    if (newButton) {
      newButton.disabled = isLoading || !transporteCatalogosCargados;
      newButton.textContent = isLoading ? "Cargando catálogos..." : "Nuevo transporte";
    }
  }

  function setTransporteSubmitLoading(isLoading) {
    transporteSubmitLoading = isLoading;

    const submitButton = document.getElementById("transporte-submit");
    const cancelButton = document.getElementById("transporte-cancel");

    if (submitButton) {
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? "Guardando..." : "Guardar";
    }

    if (cancelButton) {
      cancelButton.disabled = isLoading;
    }
  }

  function setOrganizacionLoading(isLoading) {
    organizacionReservacionesLoading = isLoading;

    const button = document.getElementById("reservaciones-organizar");
    const content = document.getElementById("reservas-organizacion-content");

    if (button) {
      button.disabled = isLoading;
      button.textContent = isLoading
        ? "Cargando reservaciones..."
        : (organizacionReservacionesAbierta ? "Ocultar organización" : "Organizar reservaciones");
    }

    if (content) {
      content.setAttribute("aria-busy", isLoading ? "true" : "false");

      if (isLoading) {
        content.innerHTML = renderOrganizacionLoading();
      }
    }
  }

  function setOrganizacionMessage(message, type) {
    const element = document.getElementById("reservas-organizacion-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
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
      return "No tienes permisos para realizar esta acción.";
    }

    return fallback;
  }

  function renderLoading() {
    return [
      '<section class="card operaciones-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      "<div>",
      "<h2>Cargando operaciones</h2>",
      '<p class="card-text">Consultando la planificación de la fecha seleccionada.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderError(message) {
    return [
      '<section class="card operaciones-state-panel">',
      "<h2>No se pudieron cargar las operaciones</h2>",
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      "</section>"
    ].join("");
  }

  function renderTransportesLoading() {
    return [
      '<section class="operaciones-inline-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      "<div>",
      "<h3>Cargando transportes</h3>",
      '<p class="card-text">Consultando los transportes de esta operación.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderTransportesError(message) {
    return [
      '<section class="operaciones-state-panel">',
      "<h3>No se pudieron cargar los transportes</h3>",
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      "</section>"
    ].join("");
  }

  function renderOrganizacionLoading() {
    return [
      '<section class="operaciones-inline-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      "<div>",
      "<h3>Cargando reservaciones</h3>",
      '<p class="card-text">Consultando el Daily operativo de esta fecha.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderOrganizacionError(message) {
    return [
      '<section class="operaciones-state-panel reservas-organizacion-state">',
      "<h3>No se pudieron cargar las reservaciones</h3>",
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      "</section>"
    ].join("");
  }

  function renderEmpty() {
    return [
      '<section class="card operaciones-state-panel">',
      App.ui.emptyState(
        "No hay operaciones programadas para esta fecha.",
        isAdmin()
          ? "Usa Nueva operación para preparar la planificación de este día."
          : "Cambia la fecha para consultar otra planificación."
      ),
      isAdmin()
        ? '<div class="operaciones-empty-actions"><button class="btn btn-primary" type="button" data-open-create>Crear operación</button></div>'
        : "",
      "</section>"
    ].join("");
  }

  function renderOperacionRow(operacion) {
    const idOperacion = getOperacionId(operacion);
    const actionButtons = [
      '<button class="btn btn-ghost" type="button" data-manage-transportes="' + App.ui.escapeHtml(idOperacion) + '">Gestionar transportes</button>',
      isAdmin()
        ? '<button class="btn btn-ghost" type="button" data-edit-operacion="' + App.ui.escapeHtml(idOperacion) + '">Editar</button>'
        : ""
    ].join("");

    return [
      "<tr>",
      "<td><strong>" + escapeHtml(formatTime(operacion && operacion.hora_inicio)) + "</strong></td>",
      '<td><span class="badge badge-neutral">' + escapeHtml(operacion && operacion.turno) + "</span></td>",
      "<td>" + escapeHtml(operacion && operacion.tour) + "</td>",
      "<td>" + escapeHtml(operacion && operacion.guia ? operacion.guia : "Sin guía asignada") + "</td>",
      '<td><span class="badge">' + escapeHtml(operacion && operacion.estado) + "</span></td>",
      '<td><div class="operaciones-row-actions">' + actionButtons + "</div></td>",
      "</tr>"
    ].join("");
  }

  function renderTable() {
    const headers = ["Hora", "Turno", "Tour", "Guía", "Estado"];
    const rows = operaciones.map(renderOperacionRow).join("");
    const headerCells = headers
      .concat(["Acciones"])
      .map(function (header) {
        return '<th scope="col">' + App.ui.escapeHtml(header) + "</th>";
      })
      .join("");

    return [
      '<div class="table-container operaciones-table-container">',
      '<table class="data-table operaciones-table">',
      "<thead><tr>" + headerCells + "</tr></thead>",
      "<tbody>" + rows + "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function getOperacionTitle(operacion) {
    if (!operacion) {
      return EMPTY_VALUE;
    }

    return [
      formatTime(operacion.hora_inicio),
      operacion.turno || EMPTY_VALUE,
      operacion.tour || EMPTY_VALUE
    ].join(" · ");
  }

  function renderVehiculoDetalle(transporte) {
    if (!transporte || transporte.id_vehiculo === null || transporte.id_vehiculo === undefined) {
      return [
        '<strong>Vehículo pendiente</strong>',
        '<span class="card-text">Sin vehículo asignado</span>'
      ].join("");
    }

    const detalles = [
      transporte.placas ? "Placas " + transporte.placas : "",
      transporte.color || "",
      transporte.capacidad !== null && transporte.capacidad !== undefined ? String(transporte.capacidad) + " PAX" : ""
    ].filter(Boolean).join(" · ");

    return [
      "<strong>" + escapeHtml(transporte.vehiculo) + "</strong>",
      '<span class="card-text">' + escapeHtml(detalles || "Datos de vehículo pendientes") + "</span>"
    ].join("");
  }

  function renderTransporteRow(transporte) {
    const idTransporte = getTransporteId(transporte);

    return [
      "<tr>",
      "<td><strong>#" + escapeHtml(idTransporte) + "</strong></td>",
      "<td>" + renderVehiculoDetalle(transporte) + "</td>",
      "<td>" + escapeHtml(transporte && transporte.operador ? transporte.operador : "Operador pendiente") + "</td>",
      '<td class="transportes-observaciones-cell">' + escapeHtml(transporte && transporte.observaciones_operador) + "</td>",
      '<td><span class="badge">' + escapeHtml(transporte && transporte.estado) + "</span></td>",
      isAdmin()
        ? '<td><button class="btn btn-ghost" type="button" data-edit-transporte="' + App.ui.escapeHtml(idTransporte) + '">Editar</button></td>'
        : "",
      "</tr>"
    ].join("");
  }

  function getTransporteLabel(transporte) {
    const idTransporte = getTransporteId(transporte);

    if (transporte && transporte.vehiculo) {
      return [
        transporte.vehiculo,
        transporte.operador || "Operador pendiente"
      ].join(" · ");
    }

    return "Transporte #" + idTransporte + " · Vehículo pendiente";
  }

  function renderTransporteDestinoOptions(currentTransporteId) {
    const currentId = currentTransporteId === null || currentTransporteId === undefined
      ? null
      : Number(currentTransporteId);
    const operacion = getOperacionOrganizacion();
    const transportesOperacion = getArray(operacion && operacion.transportes).filter(function (transporte) {
      return getTransporteId(transporte) !== currentId;
    });

    return [
      '<option value="">Selecciona transporte</option>',
      transportesOperacion.map(function (transporte) {
        const idTransporte = getTransporteId(transporte);

        return '<option value="' + App.ui.escapeHtml(idTransporte) + '">' +
          App.ui.escapeHtml(getTransporteLabel(transporte)) +
          "</option>";
      }).join("")
    ].join("");
  }

  function renderReservacionEstado(reservacion) {
    const estado = getReservacionEstado(reservacion);
    const nota = isCancelada(reservacion)
      ? '<span class="reservas-cancel-note">No cuenta en capacidad</span>'
      : "";

    return '<span class="badge' + getEstadoBadgeClass(estado) + '">' + escapeHtml(estado) + "</span>" + nota;
  }

  function renderReservacionPendienteRow(reservacion, transportesOperacion) {
    const idReservacion = getReservacionId(reservacion);
    const isLoading = reservacionTransporteLoadingId === idReservacion;
    const canAssign = isAdmin() && transportesOperacion.length > 0;
    const actionCell = canAssign
      ? [
        '<div class="reservas-action-group">',
        '<label class="field reservas-select-field" for="reservas-asignar-' + App.ui.escapeHtml(idReservacion) + '">',
        '<span class="field-label">Transporte</span>',
        '<select class="input" id="reservas-asignar-' + App.ui.escapeHtml(idReservacion) + '" data-reserva-select="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        renderTransporteDestinoOptions(null),
        "</select>",
        "</label>",
        '<button class="btn btn-primary" type="button" data-assign-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Asignar",
        "</button>",
        "</div>"
      ].join("")
      : (isAdmin() ? '<span class="card-text">Primero crea un transporte.</span>' : "");

    return [
      '<tr class="' + (isCancelada(reservacion) ? "is-cancelada" : "") + '">',
      '<td><strong>' + escapeHtml(reservacion && reservacion.codigo) + "</strong></td>",
      "<td>" + escapeHtml(reservacion && reservacion.nombre_cliente) + "</td>",
      '<td class="reservas-number-cell">' + escapeHtml(reservacion && reservacion.pax) + "</td>",
      '<td class="reservas-number-cell">' + escapeHtml(reservacion && reservacion.ninos) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.pickup_place) + "</td>",
      "<td>" + escapeHtml(formatTime(reservacion && reservacion.pickup_time)) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      "<td>" + renderReservacionEstado(reservacion) + "</td>",
      isAdmin() ? "<td>" + actionCell + "</td>" : "",
      "</tr>"
    ].join("");
  }

  function renderReservacionAsignadaRow(reservacion, transporte, transportesOperacion) {
    const idReservacion = getReservacionId(reservacion);
    const idTransporte = getTransporteId(transporte);
    const isLoading = reservacionTransporteLoadingId === idReservacion;
    const otrosTransportes = transportesOperacion.filter(function (item) {
      return getTransporteId(item) !== idTransporte;
    });
    const moveControls = otrosTransportes.length > 0
      ? [
        '<label class="field reservas-select-field" for="reservas-mover-' + App.ui.escapeHtml(idReservacion) + '">',
        '<span class="field-label">Destino</span>',
        '<select class="input" id="reservas-mover-' + App.ui.escapeHtml(idReservacion) + '" data-reserva-select="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        renderTransporteDestinoOptions(idTransporte),
        "</select>",
        "</label>",
        '<button class="btn" type="button" data-move-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Mover",
        "</button>"
      ].join("")
      : "";
    const actionCell = isAdmin()
      ? [
        '<div class="reservas-action-group">',
        moveControls,
        '<button class="btn btn-ghost" type="button" data-unassign-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Quitar asignación",
        "</button>",
        "</div>"
      ].join("")
      : "";

    return [
      '<tr class="' + (isCancelada(reservacion) ? "is-cancelada" : "") + '">',
      '<td><strong>' + escapeHtml(reservacion && reservacion.nombre_cliente) + '</strong><span class="reservas-row-code">' + escapeHtml(reservacion && reservacion.codigo) + "</span></td>",
      '<td class="reservas-number-cell">' + escapeHtml(reservacion && reservacion.pax) + "</td>",
      '<td class="reservas-number-cell">' + escapeHtml(reservacion && reservacion.ninos) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.pickup_place) + "</td>",
      "<td>" + escapeHtml(formatTime(reservacion && reservacion.pickup_time)) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      "<td>" + renderReservacionEstado(reservacion) + "</td>",
      isAdmin() ? "<td>" + actionCell + "</td>" : "",
      "</tr>"
    ].join("");
  }

  function renderReservacionesTable(headers, rowsHtml, emptyMessage, className) {
    if (!rowsHtml) {
      return '<div class="daily-empty-inline">' + App.ui.escapeHtml(emptyMessage) + "</div>";
    }

    const headerCells = headers.map(function (header) {
      return '<th scope="col">' + App.ui.escapeHtml(header) + "</th>";
    }).join("");

    return [
      '<div class="table-container reservas-table-container">',
      '<table class="data-table reservas-table ' + App.ui.escapeHtml(className || "") + '">',
      "<thead><tr>" + headerCells + "</tr></thead>",
      "<tbody>" + rowsHtml + "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function renderReservacionesPendientes(operacion) {
    const pendientes = getReservacionesPendientesOperacion();
    const transportesOperacion = getArray(operacion && operacion.transportes);
    const headers = ["Código", "Nombre", "PAX", "Niños", "Pickup", "Hora", "Vendido por", "Estado"]
      .concat(isAdmin() ? ["Acciones"] : []);
    const emptyMessage = transportesOperacion.length === 0
      ? "Primero crea un transporte para poder asignar reservaciones."
      : "No hay reservaciones pendientes de asignar para este tour y fecha.";

    return [
      '<section class="reservas-section">',
      '<div class="reservas-section-header">',
      "<div>",
      "<h3>Reservaciones sin asignar</h3>",
      '<p class="card-text">Misma fecha y mismo tour de la operación seleccionada.</p>',
      "</div>",
      '<span class="badge badge-warning">' + escapeHtml(pendientes.length) + "</span>",
      "</div>",
      renderReservacionesTable(
        headers,
        pendientes.map(function (reservacion) {
          return renderReservacionPendienteRow(reservacion, transportesOperacion);
        }).join(""),
        emptyMessage,
        "reservas-pendientes-table"
      ),
      "</section>"
    ].join("");
  }

  function renderReservacionesTransporte(transporte, transportesOperacion) {
    const reservaciones = getArray(transporte && transporte.reservaciones);
    const headers = ["Nombre", "PAX", "Niños", "Pickup", "Hora", "Vendido por", "Estado"]
      .concat(isAdmin() ? ["Acciones"] : []);

    return [
      '<section class="reservas-transporte-panel">',
      '<div class="reservas-transporte-header">',
      "<div>",
      "<h4>" + escapeHtml(getTransporteLabel(transporte)) + "</h4>",
      '<p class="card-text">' + escapeHtml(transporte && transporte.estado) + "</p>",
      "</div>",
      '<div class="daily-badges">',
      '<span class="badge">' + escapeHtml(toMetric(transporte && transporte.total_pax_activos)) + " PAX activos</span>",
      '<span class="badge badge-neutral">' + escapeHtml(toMetric(transporte && transporte.total_reservaciones)) + " reservaciones</span>",
      "</div>",
      "</div>",
      renderReservacionesTable(
        headers,
        reservaciones.map(function (reservacion) {
          return renderReservacionAsignadaRow(reservacion, transporte, transportesOperacion);
        }).join(""),
        "No hay reservaciones asignadas a este transporte.",
        "reservas-asignadas-table"
      ),
      "</section>"
    ].join("");
  }

  function renderReservacionesAsignadas(operacion) {
    const transportesOperacion = getArray(operacion && operacion.transportes);

    return [
      '<section class="reservas-section">',
      '<div class="reservas-section-header">',
      "<div>",
      "<h3>Reservaciones asignadas</h3>",
      '<p class="card-text">Movimientos acotados a los transportes de esta operación.</p>',
      "</div>",
      '<span class="badge">' + escapeHtml(transportesOperacion.length) + " transportes</span>",
      "</div>",
      transportesOperacion.length
        ? '<div class="reservas-transporte-list">' + transportesOperacion.map(function (transporte) {
          return renderReservacionesTransporte(transporte, transportesOperacion);
        }).join("") + "</div>"
        : '<div class="daily-empty-inline">Primero crea un transporte para poder asignar reservaciones.</div>',
      '<p class="card-text reservas-help-text">Si el backend rechaza dejar un vehículo con menos de 2 PAX, quita o reorganiza el vehículo antes de mover esas reservaciones.</p>',
      "</section>"
    ].join("");
  }

  function renderOrganizacionReservaciones() {
    const content = document.getElementById("reservas-organizacion-content");

    if (!content || !organizacionReservacionesAbierta) {
      return;
    }

    const operacion = getOperacionOrganizacion();

    if (!operacion) {
      content.innerHTML = renderOrganizacionError("No se encontró la operación seleccionada en el Daily operativo.");
      return;
    }

    content.innerHTML = [
      '<div class="reservas-summary">',
      '<span class="daily-transport-meta"><span>Operación</span><strong>' + App.ui.escapeHtml(getOperacionTitle(selectedTransportOperacion)) + "</strong></span>",
      '<span class="daily-transport-meta"><span>Transportes</span><strong>' + escapeHtml(getArray(operacion.transportes).length) + "</strong></span>",
      '<span class="daily-transport-meta"><span>PAX activos</span><strong>' + escapeHtml(toMetric(operacion.total_pax_activos)) + "</strong></span>",
      "</div>",
      renderReservacionesPendientes(operacion),
      renderReservacionesAsignadas(operacion)
    ].join("");
  }

  function renderOrganizacionShell() {
    return [
      '<section class="reservas-organizacion" id="reservas-organizacion" aria-labelledby="reservas-organizacion-title">',
      '<div class="reservas-organizacion-header">',
      "<div>",
      '<p class="field-label">Organización</p>',
      '<h3 id="reservas-organizacion-title">Reservaciones por transporte</h3>',
      '<p class="card-text">' + App.ui.escapeHtml(getOperacionTitle(selectedTransportOperacion)) + "</p>",
      "</div>",
      "</div>",
      '<p class="form-message reservas-organizacion-message" id="reservas-organizacion-message" role="status" aria-live="polite"></p>',
      '<div class="reservas-organizacion-content" id="reservas-organizacion-content" aria-live="polite">',
      renderOrganizacionLoading(),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderTransportesTable() {
    const headers = ["ID", "Vehículo", "Operador", "Observaciones", "Estado"];
    const headerCells = headers
      .concat(isAdmin() ? ["Acciones"] : [])
      .map(function (header) {
        return '<th scope="col">' + App.ui.escapeHtml(header) + "</th>";
      })
      .join("");

    return [
      '<div class="table-container transportes-table-container">',
      '<table class="data-table transportes-table">',
      "<thead><tr>" + headerCells + "</tr></thead>",
      "<tbody>" + transportes.map(renderTransporteRow).join("") + "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function renderTransportesEmpty() {
    return [
      '<section class="operaciones-state-panel transportes-empty-state">',
      App.ui.emptyState(
        "No hay transportes preparados para esta operación.",
        isAdmin()
          ? "Usa Nuevo transporte para preparar una unidad sin asignar reservaciones todavía."
          : "Esta operación todavía no tiene transportes preparados."
      ),
      isAdmin()
        ? '<div class="operaciones-empty-actions"><button class="btn btn-primary" type="button" data-open-transporte-create>Nuevo transporte</button></div>'
        : "",
      "</section>"
    ].join("");
  }

  function renderTransportesList() {
    const list = document.getElementById("transportes-list");

    if (!list) {
      return;
    }

    list.innerHTML = transportes.length ? renderTransportesTable() : renderTransportesEmpty();
  }

  function renderTransportesDialog(operacion) {
    const adminButton = isAdmin()
      ? '<button class="btn btn-primary" id="transporte-new" type="button" disabled>Nuevo transporte</button>'
      : "";

    return [
      '<div class="transportes-dialog-backdrop" id="transportes-dialog" role="dialog" aria-modal="true" aria-labelledby="transportes-dialog-title">',
      '<section class="card transportes-panel">',
      '<div class="transportes-panel-header">',
      "<div>",
      '<p class="field-label">Operación</p>',
      '<h2 id="transportes-dialog-title">Transportes</h2>',
      '<p class="card-text">' + App.ui.escapeHtml(getOperacionTitle(operacion)) + "</p>",
      "</div>",
      '<div class="transportes-panel-actions">',
      '<button class="btn" id="reservaciones-organizar" type="button">Organizar reservaciones</button>',
      adminButton,
      '<button class="btn btn-ghost" id="transportes-close" type="button" aria-label="Cerrar transportes">Cerrar</button>',
      "</div>",
      "</div>",
      '<p class="form-message transportes-message" id="transportes-message" role="status" aria-live="polite"></p>',
      '<div id="transporte-form-host"></div>',
      '<section class="transportes-list" id="transportes-list" aria-live="polite">',
      renderTransportesLoading(),
      "</section>",
      '<div id="reservas-organizacion-host"></div>',
      "</section>",
      "</div>"
    ].join("");
  }

  function renderOperadorOptions(selectedOperadorId, includeInactiveSelection) {
    const selectedId = selectedOperadorId === null || selectedOperadorId === undefined || selectedOperadorId === ""
      ? null
      : Number(selectedOperadorId);
    const selectableOperadores = operadores.filter(function (operador) {
      return isActiveFlag(operador.estado) || (includeInactiveSelection && Number(operador.id_operador) === selectedId);
    });

    return [
      '<option value=""' + (selectedId === null ? " selected" : "") + '>Sin operador asignado</option>',
      selectableOperadores.map(function (operador) {
        const id = Number(operador.id_operador);
        const inactiveLabel = isActiveFlag(operador.estado) ? "" : " (inactivo)";

        return [
          '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selectedId ? " selected" : "") + ">",
          App.ui.escapeHtml(String(operador.nombre || EMPTY_VALUE) + inactiveLabel),
          "</option>"
        ].join("");
      }).join("")
    ].join("");
  }

  function getVehiculoOptionText(vehiculo) {
    const detalles = [
      vehiculo && vehiculo.placas ? "Placas " + vehiculo.placas : "",
      vehiculo && vehiculo.color ? vehiculo.color : "",
      vehiculo && vehiculo.capacidad !== null && vehiculo.capacidad !== undefined ? String(vehiculo.capacidad) + " PAX" : ""
    ].filter(Boolean).join(" · ");

    return String(vehiculo && vehiculo.identificador ? vehiculo.identificador : EMPTY_VALUE) +
      (detalles ? " · " + detalles : "");
  }

  function renderVehiculoOptions(selectedVehiculoId, includeInactiveSelection) {
    const selectedId = selectedVehiculoId === null || selectedVehiculoId === undefined || selectedVehiculoId === ""
      ? null
      : Number(selectedVehiculoId);
    const selectableVehiculos = vehiculos.filter(function (vehiculo) {
      return isActiveFlag(vehiculo.estado) || (includeInactiveSelection && Number(vehiculo.id_vehiculo) === selectedId);
    });

    return [
      '<option value=""' + (selectedId === null ? " selected" : "") + '>Sin vehículo</option>',
      selectableVehiculos.map(function (vehiculo) {
        const id = Number(vehiculo.id_vehiculo);
        const inactiveLabel = isActiveFlag(vehiculo.estado) ? "" : " (inactivo)";

        return [
          '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selectedId ? " selected" : "") + ">",
          App.ui.escapeHtml(getVehiculoOptionText(vehiculo) + inactiveLabel),
          "</option>"
        ].join("");
      }).join("")
    ].join("");
  }

  function renderTransporteForm(mode, transporte) {
    const isEdit = mode === TRANSPORTE_FORM_EDIT;
    const operacionText = getOperacionTitle(selectedTransportOperacion);
    const selectedOperadorId = isEdit && transporte ? transporte.id_operador : null;
    const selectedVehiculoId = isEdit && transporte ? transporte.id_vehiculo : null;
    const observaciones = isEdit && transporte && transporte.observaciones_operador ? transporte.observaciones_operador : "";
    const estado = isEdit && transporte && transporte.estado ? transporte.estado : "";
    const title = isEdit ? "Editar transporte" : "Nuevo transporte";
    const vehiculoField = isEdit
      ? [
        '<label class="field" for="transporte-vehiculo">',
        '<span class="field-label">Vehículo</span>',
        '<select class="input" id="transporte-vehiculo" name="id_vehiculo">',
        renderVehiculoOptions(selectedVehiculoId, true),
        "</select>",
        "</label>"
      ].join("")
      : [
        '<div class="transporte-form-note">',
        '<span class="field-label">Vehículo</span>',
        '<p>El vehículo podrá asignarse cuando el transporte tenga al menos 2 PAX activos.</p>',
        "</div>"
      ].join("");

    return [
      '<form class="transporte-form" id="transporte-form" novalidate>',
      '<div class="transporte-form-header">',
      "<div>",
      "<h3>" + App.ui.escapeHtml(title) + "</h3>",
      '<p class="card-text">Operación: ' + App.ui.escapeHtml(operacionText) + "</p>",
      "</div>",
      "</div>",
      '<input type="hidden" id="transporte-mode" value="' + App.ui.escapeHtml(mode) + '">',
      '<input type="hidden" id="transporte-id" value="' + App.ui.escapeHtml(isEdit && transporte ? getTransporteId(transporte) : "") + '">',
      '<div class="transporte-form-grid">',
      '<div class="transporte-form-note"><span class="field-label">Operación</span><p>' + App.ui.escapeHtml(operacionText) + "</p></div>",
      '<label class="field" for="transporte-operador"><span class="field-label">Operador</span><select class="input" id="transporte-operador" name="id_operador">' + renderOperadorOptions(selectedOperadorId, isEdit) + "</select></label>",
      vehiculoField,
      '<label class="field transporte-estado-field" for="transporte-estado"><span class="field-label">Estado</span><input class="input" id="transporte-estado" name="estado" type="text" maxlength="30" value="' + App.ui.escapeHtml(estado) + '"></label>',
      '<label class="field transporte-observaciones-field" for="transporte-observaciones"><span class="field-label">Observaciones para operador</span><textarea class="input transporte-textarea" id="transporte-observaciones" name="observaciones_operador">' + App.ui.escapeHtml(observaciones) + "</textarea></label>",
      "</div>",
      '<p class="form-message" id="transporte-form-message" role="status" aria-live="polite"></p>',
      '<div class="operacion-form-actions">',
      '<button class="btn" id="transporte-cancel" type="button">Cancelar</button>',
      '<button class="btn btn-primary" id="transporte-submit" type="submit">Guardar</button>',
      "</div>",
      "</form>"
    ].join("");
  }

  function renderOperaciones() {
    const content = document.getElementById("operaciones-content");

    if (!content) {
      return;
    }

    content.innerHTML = operaciones.length ? renderTable() : renderEmpty();
  }

  function renderTourOptions(selectedTourId, includeInactiveSelection) {
    const selectedId = selectedTourId === null || selectedTourId === undefined || selectedTourId === ""
      ? null
      : Number(selectedTourId);
    const selectableTours = tours.filter(function (tour) {
      return isActiveFlag(tour.activo) || (includeInactiveSelection && Number(tour.id_tour) === selectedId);
    });

    return [
      '<option value="">Selecciona un tour</option>',
      selectableTours.map(function (tour) {
        const id = Number(tour.id_tour);
        const inactiveLabel = isActiveFlag(tour.activo) ? "" : " (inactivo)";

        return [
          '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selectedId ? " selected" : "") + ">",
          App.ui.escapeHtml(String(tour.nombre || EMPTY_VALUE) + inactiveLabel),
          "</option>"
        ].join("");
      }).join("")
    ].join("");
  }

  function renderGuiaOptions(selectedGuiaId, includeInactiveSelection) {
    const selectedId = selectedGuiaId === null || selectedGuiaId === undefined || selectedGuiaId === ""
      ? null
      : Number(selectedGuiaId);
    const selectableGuias = guias.filter(function (guia) {
      return isActiveFlag(guia.estado) || (includeInactiveSelection && Number(guia.id_guia) === selectedId);
    });

    return [
      '<option value=""' + (selectedId === null ? " selected" : "") + '>Sin guía asignada</option>',
      selectableGuias.map(function (guia) {
        const id = Number(guia.id_guia);
        const inactiveLabel = isActiveFlag(guia.estado) ? "" : " (inactiva)";

        return [
          '<option value="' + App.ui.escapeHtml(id) + '"' + (id === selectedId ? " selected" : "") + ">",
          App.ui.escapeHtml(String(guia.nombre || EMPTY_VALUE) + inactiveLabel),
          "</option>"
        ].join("");
      }).join("")
    ].join("");
  }

  function renderDialog(mode, operacion) {
    const isEdit = mode === FORM_MODE_EDIT;
    const fecha = isEdit && operacion ? operacion.fecha : currentFecha;
    const horaInicio = isEdit && operacion ? normalizeTimeForInput(operacion.hora_inicio) : "";
    const estado = isEdit && operacion ? String(operacion.estado || "") : "";
    const selectedTourId = isEdit && operacion ? operacion.id_tour : "";
    const selectedGuiaId = isEdit && operacion ? operacion.id_guia : null;
    const title = isEdit ? "Editar operación" : "Nueva operación";
    const turno = deriveTurno(horaInicio);

    return [
      '<div class="operacion-dialog-backdrop" id="operacion-dialog" role="dialog" aria-modal="true" aria-labelledby="operacion-dialog-title">',
      '<form class="card operacion-form" id="operacion-form" novalidate>',
      '<div class="operacion-form-header">',
      '<div>',
      '<h2 id="operacion-dialog-title">' + App.ui.escapeHtml(title) + "</h2>",
      '<p class="card-text">El turno se deriva de la hora y se valida en backend.</p>',
      "</div>",
      '<button class="btn btn-ghost" id="operacion-close" type="button" aria-label="Cerrar formulario">Cerrar</button>',
      "</div>",
      '<input type="hidden" id="operacion-mode" value="' + App.ui.escapeHtml(mode) + '">',
      '<input type="hidden" id="operacion-id" value="' + App.ui.escapeHtml(isEdit && operacion ? getOperacionId(operacion) : "") + '">',
      '<div class="operacion-form-grid">',
      '<label class="field" for="operacion-fecha"><span class="field-label">Fecha</span><input class="input" id="operacion-fecha" name="fecha" type="date" value="' + App.ui.escapeHtml(fecha || "") + '"></label>',
      '<label class="field" for="operacion-hora"><span class="field-label">Hora de inicio</span><input class="input" id="operacion-hora" name="hora_inicio" type="time" value="' + App.ui.escapeHtml(horaInicio) + '"></label>',
      '<label class="field" for="operacion-tour"><span class="field-label">Tour</span><select class="input" id="operacion-tour" name="id_tour">' + renderTourOptions(selectedTourId, isEdit) + "</select></label>",
      '<label class="field" for="operacion-guia"><span class="field-label">Guía</span><select class="input" id="operacion-guia" name="id_guia">' + renderGuiaOptions(selectedGuiaId, isEdit) + "</select></label>",
      '<label class="field operacion-estado-field" for="operacion-estado"><span class="field-label">Estado</span><input class="input" id="operacion-estado" name="estado" type="text" maxlength="30" value="' + App.ui.escapeHtml(estado) + '"></label>',
      '<div class="operacion-turno-preview" aria-live="polite"><span class="field-label">Turno</span><strong id="operacion-turno-preview">' + App.ui.escapeHtml(turno || "Pendiente") + "</strong></div>",
      "</div>",
      '<p class="form-message" id="operacion-form-message" role="status" aria-live="polite"></p>',
      '<div class="operacion-form-actions">',
      '<button class="btn" id="operacion-cancel" type="button">Cancelar</button>',
      '<button class="btn btn-primary" id="operacion-submit" type="submit">Guardar</button>',
      "</div>",
      "</form>",
      "</div>"
    ].join("");
  }

  function openForm(mode, operacion) {
    if (!isAdmin() || catalogosLoading) {
      return;
    }

    if (!catalogosCargados) {
      setMessage("No fue posible abrir el formulario porque tours y guías no están cargados.", "error");
      return;
    }

    const dialogHost = document.getElementById("operacion-dialog-host");

    if (!dialogHost) {
      return;
    }

    selectedOperacion = mode === FORM_MODE_EDIT ? operacion : null;
    dialogHost.innerHTML = renderDialog(mode, operacion);

    bindFormEvents();

    const firstInput = document.getElementById("operacion-fecha");

    if (firstInput) {
      firstInput.focus();
    }
  }

  function closeForm() {
    if (submitLoading) {
      return;
    }

    const dialogHost = document.getElementById("operacion-dialog-host");

    selectedOperacion = null;

    if (dialogHost) {
      dialogHost.innerHTML = "";
    }
  }

  function setFormMessage(message, type) {
    const element = document.getElementById("operacion-form-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function updateTurnoPreview() {
    const timeInput = document.getElementById("operacion-hora");
    const preview = document.getElementById("operacion-turno-preview");

    if (!timeInput || !preview) {
      return;
    }

    preview.textContent = deriveTurno(timeInput.value) || "Pendiente";
  }

  function buildOperacionPayload() {
    const fechaInput = document.getElementById("operacion-fecha");
    const tourInput = document.getElementById("operacion-tour");
    const horaInput = document.getElementById("operacion-hora");
    const guiaInput = document.getElementById("operacion-guia");
    const estadoInput = document.getElementById("operacion-estado");

    if (!fechaInput || !tourInput || !horaInput || !guiaInput || !estadoInput) {
      return { errores: ["No se pudo leer el formulario."], payload: null };
    }

    const fecha = fechaInput.value;
    const idTour = Number(tourInput.value);
    const horaInicio = horaInput.value;
    const idGuia = guiaInput.value ? Number(guiaInput.value) : null;
    const estado = estadoInput.value.trim();
    const errores = [];

    if (!isValidDateValue(fecha)) {
      errores.push("Selecciona una fecha válida.");
    }

    if (!Number.isInteger(idTour) || idTour <= 0) {
      errores.push("Selecciona un tour.");
    }

    if (!/^\d{2}:\d{2}$/.test(horaInicio)) {
      errores.push("Selecciona una hora de inicio válida.");
    }

    if (guiaInput.value && (!Number.isInteger(idGuia) || idGuia <= 0)) {
      errores.push("Selecciona una guía válida.");
    }

    if (!estado) {
      errores.push("Ingresa el estado de la operación.");
    }

    return {
      errores: errores,
      payload: {
        fecha: fecha,
        id_tour: idTour,
        hora_inicio: horaInicio,
        id_guia: idGuia,
        estado: estado
      }
    };
  }

  function getChangedPayload(payload) {
    if (!selectedOperacion) {
      return payload;
    }

    const changed = {};

    if (payload.fecha !== selectedOperacion.fecha) {
      changed.fecha = payload.fecha;
    }

    if (Number(payload.id_tour) !== Number(selectedOperacion.id_tour)) {
      changed.id_tour = payload.id_tour;
    }

    if (payload.hora_inicio !== normalizeTimeForInput(selectedOperacion.hora_inicio)) {
      changed.hora_inicio = payload.hora_inicio;
    }

    if (payload.id_guia !== (selectedOperacion.id_guia === null || selectedOperacion.id_guia === undefined ? null : Number(selectedOperacion.id_guia))) {
      changed.id_guia = payload.id_guia;
    }

    if (payload.estado !== String(selectedOperacion.estado || "")) {
      changed.estado = payload.estado;
    }

    return changed;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isAdmin() || submitLoading) {
      return;
    }

    const modeInput = document.getElementById("operacion-mode");
    const idInput = document.getElementById("operacion-id");
    const mode = modeInput ? modeInput.value : FORM_MODE_CREATE;
    const idOperacion = idInput ? Number(idInput.value) : null;
    const formData = buildOperacionPayload();

    if (formData.errores.length > 0) {
      setFormMessage(formData.errores.join(" "), "error");
      return;
    }

    const payload = mode === FORM_MODE_EDIT ? getChangedPayload(formData.payload) : formData.payload;

    if (mode === FORM_MODE_EDIT && Object.keys(payload).length === 0) {
      setFormMessage("No hay cambios por guardar.", "info");
      return;
    }

    setFormMessage("", "");
    setSubmitLoading(true);

    try {
      if (mode === FORM_MODE_EDIT) {
        await App.api.apiFetch("/api/operaciones/" + encodeURIComponent(idOperacion), {
          method: "PATCH",
          body: payload
        });
        setMessage("Operación actualizada correctamente.", "info");
      } else {
        await App.api.apiFetch("/api/operaciones", {
          method: "POST",
          body: payload
        });
        setMessage("Operación creada correctamente.", "info");
      }

      setSubmitLoading(false);
      closeForm();
      await loadOperaciones(currentFecha);
    } catch (error) {
      setFormMessage(getBackendMessage(error, "No fue posible guardar la operación. Intenta nuevamente."), "error");
      setSubmitLoading(false);
    }
  }

  function bindFormEvents() {
    const form = document.getElementById("operacion-form");
    const closeButton = document.getElementById("operacion-close");
    const cancelButton = document.getElementById("operacion-cancel");
    const timeInput = document.getElementById("operacion-hora");

    if (form) {
      form.addEventListener("submit", handleSubmit);
    }

    if (closeButton) {
      closeButton.addEventListener("click", closeForm);
    }

    if (cancelButton) {
      cancelButton.addEventListener("click", closeForm);
    }

    if (timeInput) {
      timeInput.addEventListener("input", updateTurnoPreview);
    }
  }

  function setTransportesMessage(message, type) {
    const element = document.getElementById("transportes-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function setTransporteFormMessage(message, type) {
    const element = document.getElementById("transporte-form-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function openTransporteForm(mode, transporte) {
    if (!isAdmin() || transporteCatalogosLoading || !selectedTransportOperacion) {
      return;
    }

    if (mode === TRANSPORTE_FORM_EDIT && !transporte) {
      setTransportesMessage("No se encontró el transporte seleccionado. Recarga la operación e intenta nuevamente.", "error");
      return;
    }

    if (!transporteCatalogosCargados) {
      setTransportesMessage("No fue posible abrir el formulario porque operadores y vehículos no están cargados.", "error");
      return;
    }

    const host = document.getElementById("transporte-form-host");

    if (!host) {
      return;
    }

    selectedTransporte = mode === TRANSPORTE_FORM_EDIT ? transporte : null;
    host.innerHTML = renderTransporteForm(mode, transporte);
    bindTransporteFormEvents();

    const operadorInput = document.getElementById("transporte-operador");

    if (operadorInput) {
      operadorInput.focus();
    }
  }

  function closeTransporteForm() {
    if (transporteSubmitLoading) {
      return;
    }

    const host = document.getElementById("transporte-form-host");

    selectedTransporte = null;

    if (host) {
      host.innerHTML = "";
    }
  }

  function closeTransportesPanel() {
    if (transporteSubmitLoading) {
      return;
    }

    const host = document.getElementById("transportes-dialog-host");

    transportesRequestId += 1;
    transporteCatalogosRequestId += 1;
    organizacionRequestId += 1;
    selectedTransportOperacion = null;
    selectedTransporte = null;
    transportes = [];
    organizacionDaily = null;
    operadores = [];
    vehiculos = [];
    organizacionReservacionesAbierta = false;
    organizacionReservacionesLoading = false;
    reservacionTransporteLoadingId = null;
    transporteCatalogosCargados = false;
    transporteCatalogosLoading = false;
    transportesLoading = false;

    if (host) {
      host.innerHTML = "";
    }
  }

  function buildTransportePayload(mode) {
    const operadorInput = document.getElementById("transporte-operador");
    const vehiculoInput = document.getElementById("transporte-vehiculo");
    const observacionesInput = document.getElementById("transporte-observaciones");
    const estadoInput = document.getElementById("transporte-estado");

    if (!operadorInput || !observacionesInput || !estadoInput || !selectedTransportOperacion) {
      return { errores: ["No se pudo leer el formulario."], payload: null };
    }

    const idOperador = operadorInput.value ? Number(operadorInput.value) : null;
    const idVehiculo = vehiculoInput && vehiculoInput.value ? Number(vehiculoInput.value) : null;
    const observacionesRaw = observacionesInput.value.trim();
    const estado = estadoInput.value.trim();
    const errores = [];

    if (operadorInput.value && (!Number.isInteger(idOperador) || idOperador <= 0)) {
      errores.push("Selecciona un operador válido.");
    }

    if (vehiculoInput && vehiculoInput.value && (!Number.isInteger(idVehiculo) || idVehiculo <= 0)) {
      errores.push("Selecciona un vehículo válido.");
    }

    if (!estado) {
      errores.push("Ingresa el estado del transporte.");
    }

    const payload = {
      id_operador: idOperador,
      observaciones_operador: observacionesRaw ? observacionesRaw : null,
      estado: estado
    };

    if (mode === TRANSPORTE_FORM_CREATE) {
      payload.id_operacion_tour = getOperacionId(selectedTransportOperacion);
    } else {
      payload.id_vehiculo = idVehiculo;
    }

    return {
      errores: errores,
      payload: payload
    };
  }

  function normalizeNullableNumber(value) {
    return value === null || value === undefined || value === "" ? null : Number(value);
  }

  function normalizeNullableText(value) {
    const text = value === null || value === undefined ? "" : String(value).trim();
    return text || null;
  }

  function getChangedTransportePayload(payload) {
    if (!selectedTransporte) {
      return payload;
    }

    const changed = {};

    if (normalizeNullableNumber(payload.id_operador) !== normalizeNullableNumber(selectedTransporte.id_operador)) {
      changed.id_operador = payload.id_operador;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "id_vehiculo") &&
      normalizeNullableNumber(payload.id_vehiculo) !== normalizeNullableNumber(selectedTransporte.id_vehiculo)) {
      changed.id_vehiculo = payload.id_vehiculo;
    }

    if (normalizeNullableText(payload.observaciones_operador) !== normalizeNullableText(selectedTransporte.observaciones_operador)) {
      changed.observaciones_operador = payload.observaciones_operador;
    }

    if (payload.estado !== String(selectedTransporte.estado || "")) {
      changed.estado = payload.estado;
    }

    return changed;
  }

  async function handleTransporteSubmit(event) {
    event.preventDefault();

    if (!isAdmin() || transporteSubmitLoading) {
      return;
    }

    const modeInput = document.getElementById("transporte-mode");
    const idInput = document.getElementById("transporte-id");
    const mode = modeInput ? modeInput.value : TRANSPORTE_FORM_CREATE;
    const idTransporte = idInput ? Number(idInput.value) : null;
    const formData = buildTransportePayload(mode);

    if (formData.errores.length > 0) {
      setTransporteFormMessage(formData.errores.join(" "), "error");
      return;
    }

    const payload = mode === TRANSPORTE_FORM_EDIT
      ? getChangedTransportePayload(formData.payload)
      : formData.payload;

    if (mode === TRANSPORTE_FORM_EDIT && Object.keys(payload).length === 0) {
      setTransporteFormMessage("No hay cambios por guardar.", "info");
      return;
    }

    setTransporteFormMessage("", "");
    setTransporteSubmitLoading(true);

    try {
      if (mode === TRANSPORTE_FORM_EDIT) {
        await App.api.apiFetch("/api/transportes/" + encodeURIComponent(idTransporte), {
          method: "PATCH",
          body: payload
        });
        setTransportesMessage("Transporte actualizado correctamente.", "info");
      } else {
        await App.api.apiFetch("/api/transportes", {
          method: "POST",
          body: payload
        });
        setTransportesMessage("Transporte creado correctamente.", "info");
      }

      setTransporteSubmitLoading(false);
      closeTransporteForm();
      await loadTransportes(selectedTransportOperacion);

      if (organizacionReservacionesAbierta) {
        await loadOrganizacionReservaciones(selectedTransportOperacion);
      }
    } catch (error) {
      setTransporteFormMessage(getBackendMessage(error, "No fue posible guardar el transporte. Intenta nuevamente."), "error");
      setTransporteSubmitLoading(false);
    }
  }

  function bindTransporteFormEvents() {
    const form = document.getElementById("transporte-form");
    const cancelButton = document.getElementById("transporte-cancel");

    if (form) {
      form.addEventListener("submit", handleTransporteSubmit);
    }

    if (cancelButton) {
      cancelButton.addEventListener("click", closeTransporteForm);
    }
  }

  function bindTransportesPanelEvents() {
    const closeButton = document.getElementById("transportes-close");
    const newButton = document.getElementById("transporte-new");
    const organizarButton = document.getElementById("reservaciones-organizar");
    const list = document.getElementById("transportes-list");
    const organizacionHost = document.getElementById("reservas-organizacion-host");

    if (closeButton) {
      closeButton.addEventListener("click", closeTransportesPanel);
    }

    if (newButton) {
      newButton.addEventListener("click", function () {
        openTransporteForm(TRANSPORTE_FORM_CREATE, null);
      });
    }

    if (organizarButton) {
      organizarButton.addEventListener("click", toggleOrganizacionReservaciones);
    }

    if (list) {
      list.addEventListener("click", function (event) {
        const createButton = event.target.closest ? event.target.closest("[data-open-transporte-create]") : null;
        const editButton = event.target.closest ? event.target.closest("[data-edit-transporte]") : null;

        if (createButton) {
          openTransporteForm(TRANSPORTE_FORM_CREATE, null);
          return;
        }

        if (editButton) {
          openTransporteForm(TRANSPORTE_FORM_EDIT, findTransporteById(editButton.dataset.editTransporte));
        }
      });
    }

    if (organizacionHost) {
      organizacionHost.addEventListener("click", function (event) {
        const assignButton = event.target.closest ? event.target.closest("[data-assign-reserva]") : null;
        const moveButton = event.target.closest ? event.target.closest("[data-move-reserva]") : null;
        const unassignButton = event.target.closest ? event.target.closest("[data-unassign-reserva]") : null;

        if (assignButton) {
          handleReservacionTransporteSubmit(assignButton.dataset.assignReserva, false);
          return;
        }

        if (moveButton) {
          handleReservacionTransporteSubmit(moveButton.dataset.moveReserva, false);
          return;
        }

        if (unassignButton) {
          handleReservacionTransporteSubmit(unassignButton.dataset.unassignReserva, true);
        }
      });
    }
  }

  async function loadOrganizacionReservaciones(operacion, options) {
    if (!operacion) {
      return;
    }

    const config = options || {};
    const fecha = getOperacionFecha(operacion);

    if (!isValidDateValue(fecha)) {
      setOrganizacionMessage("No se pudo determinar la fecha de la operación.", "error");
      return;
    }

    const activeRequestId = organizacionRequestId + 1;
    organizacionRequestId = activeRequestId;
    setOrganizacionLoading(true);

    if (!config.keepMessage) {
      setOrganizacionMessage("", "");
    }

    try {
      const daily = await App.api.apiFetch("/api/daily/operativo?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== organizacionRequestId || getOperacionId(selectedTransportOperacion) !== getOperacionId(operacion)) {
        return;
      }

      organizacionDaily = daily || { fecha: fecha, operaciones: [], reservaciones_sin_asignar: [] };
      renderOrganizacionReservaciones();
    } catch (error) {
      if (activeRequestId !== organizacionRequestId || getOperacionId(selectedTransportOperacion) !== getOperacionId(operacion)) {
        return;
      }

      organizacionDaily = null;
      const message = getBackendMessage(error, "No fue posible cargar las reservaciones de la operación.");
      setOrganizacionMessage(message, "error");

      const content = document.getElementById("reservas-organizacion-content");

      if (content) {
        content.innerHTML = renderOrganizacionError(message);
      }
    } finally {
      if (activeRequestId === organizacionRequestId && getOperacionId(selectedTransportOperacion) === getOperacionId(operacion)) {
        setOrganizacionLoading(false);
      }
    }
  }

  function toggleOrganizacionReservaciones() {
    const host = document.getElementById("reservas-organizacion-host");

    if (!host || organizacionReservacionesLoading || reservacionTransporteLoadingId !== null) {
      return;
    }

    if (organizacionReservacionesAbierta) {
      organizacionReservacionesAbierta = false;
      organizacionDaily = null;
      host.innerHTML = "";
      setOrganizacionLoading(false);
      return;
    }

    organizacionReservacionesAbierta = true;
    organizacionDaily = null;
    host.innerHTML = renderOrganizacionShell();
    loadOrganizacionReservaciones(selectedTransportOperacion);
  }

  function getSelectedReservaDestino(idReservacion) {
    const select = Array.prototype.find.call(
      document.querySelectorAll("[data-reserva-select]"),
      function (element) {
        return String(element.dataset.reservaSelect) === String(idReservacion);
      }
    );

    if (!select || !select.value) {
      return null;
    }

    const idTransporte = Number(select.value);

    return Number.isInteger(idTransporte) && idTransporte > 0 ? idTransporte : null;
  }

  function setReservacionActionLoading(idReservacion) {
    reservacionTransporteLoadingId = idReservacion;
    renderOrganizacionReservaciones();
  }

  async function handleReservacionTransporteSubmit(idReservacionRaw, quitarAsignacion) {
    if (!isAdmin() || reservacionTransporteLoadingId !== null || !selectedTransportOperacion) {
      return;
    }

    const idReservacion = Number(idReservacionRaw);

    if (!Number.isInteger(idReservacion) || idReservacion <= 0) {
      setOrganizacionMessage("No se pudo identificar la reservación seleccionada.", "error");
      return;
    }

    const idTransporteOperacion = quitarAsignacion ? null : getSelectedReservaDestino(idReservacion);

    if (!quitarAsignacion && idTransporteOperacion === null) {
      setOrganizacionMessage("Selecciona un transporte destino.", "error");
      return;
    }

    setOrganizacionMessage("", "");
    setReservacionActionLoading(idReservacion);

    try {
      const response = await App.api.apiFetch("/api/reservaciones/" + encodeURIComponent(idReservacion) + "/transporte", {
        method: "PATCH",
        body: {
          id_transporte_operacion: idTransporteOperacion
        }
      });

      reservacionTransporteLoadingId = null;
      await loadOrganizacionReservaciones(selectedTransportOperacion, { keepMessage: true });
      setOrganizacionMessage(response && response.mensaje ? response.mensaje : "Asignación actualizada correctamente.", "info");
    } catch (error) {
      reservacionTransporteLoadingId = null;
      await loadOrganizacionReservaciones(selectedTransportOperacion, { keepMessage: true });
      setOrganizacionMessage(getBackendMessage(error, "No fue posible actualizar la asignación de la reservación."), "error");
    }
  }

  async function loadTransporteCatalogos() {
    const activeRequestId = transporteCatalogosRequestId + 1;
    transporteCatalogosRequestId = activeRequestId;
    transporteCatalogosCargados = false;
    setTransporteCatalogosLoading(true);

    try {
      const responses = await Promise.all([
        App.api.apiFetch("/api/operadores"),
        App.api.apiFetch("/api/vehiculos")
      ]);

      if (activeRequestId !== transporteCatalogosRequestId) {
        return;
      }

      operadores = getArrayResponse(responses[0]);
      vehiculos = getArrayResponse(responses[1]);
      transporteCatalogosCargados = true;
    } catch (error) {
      if (activeRequestId !== transporteCatalogosRequestId) {
        return;
      }

      operadores = [];
      vehiculos = [];
      transporteCatalogosCargados = false;
      setTransportesMessage(getBackendMessage(error, "No fue posible cargar operadores y vehículos."), "error");
    } finally {
      if (activeRequestId === transporteCatalogosRequestId) {
        setTransporteCatalogosLoading(false);
      }
    }
  }

  async function loadTransportes(operacion) {
    if (!operacion) {
      return;
    }

    const activeRequestId = transportesRequestId + 1;
    transportesRequestId = activeRequestId;
    setTransportesLoading(true);

    try {
      const response = await App.api.apiFetch("/api/transportes?id_operacion_tour=" + encodeURIComponent(getOperacionId(operacion)));

      if (activeRequestId !== transportesRequestId || getOperacionId(selectedTransportOperacion) !== getOperacionId(operacion)) {
        return;
      }

      transportes = getArrayResponse(response);
      renderTransportesList();
    } catch (error) {
      if (activeRequestId !== transportesRequestId || getOperacionId(selectedTransportOperacion) !== getOperacionId(operacion)) {
        return;
      }

      const message = getBackendMessage(error, "No fue posible cargar los transportes. Intenta nuevamente.");

      transportes = [];
      setTransportesMessage(message, "error");

      const list = document.getElementById("transportes-list");

      if (list) {
        list.innerHTML = renderTransportesError(message);
      }
    } finally {
      if (activeRequestId === transportesRequestId && getOperacionId(selectedTransportOperacion) === getOperacionId(operacion)) {
        setTransportesLoading(false);
      }
    }
  }

  function openTransportesPanel(operacion) {
    if (!operacion) {
      return;
    }

    const host = document.getElementById("transportes-dialog-host");

    if (!host) {
      return;
    }

    selectedTransportOperacion = operacion;
    selectedTransporte = null;
    transportes = [];
    operadores = [];
    vehiculos = [];
    transporteCatalogosCargados = false;
    host.innerHTML = renderTransportesDialog(operacion);
    bindTransportesPanelEvents();
    loadTransporteCatalogos();
    loadTransportes(operacion);

    const closeButton = document.getElementById("transportes-close");

    if (closeButton) {
      closeButton.focus();
    }
  }

  async function loadCatalogos() {
    const activeRequestId = catalogosRequestId + 1;
    catalogosRequestId = activeRequestId;
    catalogosCargados = false;
    setCatalogosLoading(true);

    try {
      const responses = await Promise.all([
        App.api.apiFetch("/api/tours"),
        App.api.apiFetch("/api/guias")
      ]);

      if (activeRequestId !== catalogosRequestId) {
        return;
      }

      tours = getArrayResponse(responses[0]);
      guias = getArrayResponse(responses[1]);
      catalogosCargados = true;
    } catch (error) {
      if (activeRequestId !== catalogosRequestId) {
        return;
      }

      tours = [];
      guias = [];
      catalogosCargados = false;
      setMessage(getBackendMessage(error, "No fue posible cargar tours y guías para el formulario."), "error");
    } finally {
      if (activeRequestId === catalogosRequestId) {
        setCatalogosLoading(false);
      }
    }
  }

  async function loadOperaciones(fecha) {
    if (!isValidDateValue(fecha)) {
      setMessage("Selecciona una fecha válida para consultar operaciones.", "error");
      return;
    }

    const activeRequestId = operacionesRequestId + 1;
    operacionesRequestId = activeRequestId;
    currentFecha = fecha;
    setContentLoading(true);

    try {
      const response = await App.api.apiFetch("/api/operaciones?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== operacionesRequestId) {
        return;
      }

      operaciones = getArrayResponse(response);
      renderOperaciones();
    } catch (error) {
      if (activeRequestId !== operacionesRequestId) {
        return;
      }

      const message = getBackendMessage(error, "No fue posible cargar operaciones. Intenta nuevamente.");

      operaciones = [];
      setMessage(message, "error");

      const content = document.getElementById("operaciones-content");

      if (content) {
        content.innerHTML = renderError(message);
      }
    } finally {
      if (activeRequestId === operacionesRequestId) {
        setContentLoading(false);
      }
    }
  }

  function bindPageEvents() {
    const dateInput = document.getElementById("operaciones-fecha");
    const newButton = document.getElementById("operaciones-new");
    const content = document.getElementById("operaciones-content");

    if (dateInput) {
      dateInput.addEventListener("change", function () {
        if (dateInput.value === currentFecha) {
          return;
        }

        closeTransportesPanel();
        setMessage("", "");
        loadOperaciones(dateInput.value);
      });
    }

    if (newButton) {
      newButton.addEventListener("click", function () {
        openForm(FORM_MODE_CREATE, null);
      });
    }

    if (content) {
      content.addEventListener("click", function (event) {
        const createButton = event.target.closest ? event.target.closest("[data-open-create]") : null;
        const editButton = event.target.closest ? event.target.closest("[data-edit-operacion]") : null;
        const transportesButton = event.target.closest ? event.target.closest("[data-manage-transportes]") : null;

        if (createButton) {
          openForm(FORM_MODE_CREATE, null);
          return;
        }

        if (transportesButton) {
          openTransportesPanel(findOperacionById(transportesButton.dataset.manageTransportes));
          return;
        }

        if (editButton) {
          openForm(FORM_MODE_EDIT, findOperacionById(editButton.dataset.editOperacion));
        }
      });
    }
  }

  App.pages.operaciones = {
    title: "Operaciones",
    subtitle: "Planificación diaria de tours",
    render: function () {
      const adminControls = isAdmin()
        ? '<button class="btn btn-primary" id="operaciones-new" type="button" disabled>Nueva operación</button>'
        : "";

      return [
        '<section class="page operaciones-page">',
        '<div class="operaciones-toolbar">',
        '<label class="field operaciones-date-field" for="operaciones-fecha">',
        '<span class="field-label">Fecha</span>',
        '<input class="input" id="operaciones-fecha" type="date">',
        "</label>",
        '<div class="operaciones-actions">' + adminControls + "</div>",
        "</div>",
        '<p class="form-message operaciones-message" id="operaciones-message" role="status" aria-live="polite"></p>',
        '<section id="operaciones-content" aria-live="polite">',
        renderLoading(),
        "</section>",
        '<div id="operacion-dialog-host"></div>',
        '<div id="transportes-dialog-host"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const dateInput = document.getElementById("operaciones-fecha");
      const fecha = getLocalDateValue();

      operacionesRequestId += 1;
      catalogosRequestId += 1;
      organizacionRequestId += 1;
      currentFecha = "";
      operaciones = [];
      transportes = [];
      organizacionDaily = null;
      operadores = [];
      vehiculos = [];
      selectedOperacion = null;
      selectedTransportOperacion = null;
      selectedTransporte = null;
      submitLoading = false;
      transporteSubmitLoading = false;
      organizacionReservacionesAbierta = false;
      organizacionReservacionesLoading = false;
      reservacionTransporteLoadingId = null;
      catalogosCargados = false;
      catalogosLoading = false;
      transporteCatalogosCargados = false;
      transporteCatalogosLoading = false;
      transportesLoading = false;

      bindPageEvents();

      if (dateInput) {
        dateInput.value = fecha;
      }

      loadCatalogos();
      loadOperaciones(fecha);
    }
  };
})();
