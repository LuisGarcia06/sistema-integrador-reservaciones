(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const MAX_PAX_GRUPO = 12;
  const MONEY_FORMATTER = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  let requestId = 0;
  let currentFecha = "";
  let currentDaily = null;
  let isDailyLoading = false;
  let isPdfExportLoading = false;
  let hasDailyError = false;

  function escapeHtml(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return App.ui.escapeHtml(EMPTY_VALUE);
    }

    return App.ui.escapeHtml(value);
  }

  function escapeOptionalText(value, fallback) {
    const text = value === null || value === undefined || typeof value === "object" ? "" : String(value).trim();
    return App.ui.escapeHtml(text || fallback || EMPTY_VALUE);
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

  function formatDate(value) {
    if (!isValidDateValue(value)) {
      return EMPTY_VALUE;
    }

    const parts = value.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    return date.toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function formatPrintDate(value) {
    if (!isValidDateValue(value)) {
      return EMPTY_VALUE;
    }

    const parts = value.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === "" || typeof value === "object") {
      return EMPTY_VALUE;
    }

    const time = String(value);
    const match = time.match(/^(\d{2}):(\d{2})/);

    return match ? match[1] + ":" + match[2] : time;
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
    const vendedor = reservacion && reservacion.vendedor !== null && reservacion.vendedor !== undefined && typeof reservacion.vendedor !== "object"
      ? String(reservacion.vendedor).trim()
      : "";
    const plataforma = reservacion && reservacion.plataforma !== null && reservacion.plataforma !== undefined && typeof reservacion.plataforma !== "object"
      ? String(reservacion.plataforma).trim()
      : "";

    return vendedor || plataforma || EMPTY_VALUE;
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getJoinedText(values, fallback) {
    const parts = values
      .map(function (value) {
        return value === null || value === undefined || typeof value === "object" ? "" : String(value).trim();
      })
      .filter(Boolean);

    return parts.length ? parts.join(" · ") : fallback;
  }

  function toMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : "0";
  }

  function getGrupoLabel(numeroGrupo) {
    const grupo = Number(numeroGrupo);

    return Number.isInteger(grupo) && grupo > 0 ? "Grupo " + grupo : EMPTY_VALUE;
  }

  function getOperacionGrupoTitle(operacion) {
    return getJoinedText([
      operacion && operacion.tour,
      getGrupoLabel(operacion && operacion.numero_grupo)
    ], EMPTY_VALUE);
  }

  function getOperacionContext(operacion) {
    return getJoinedText([
      operacion && operacion.turno,
      getGrupoLabel(operacion && operacion.numero_grupo)
    ], EMPTY_VALUE);
  }

  function getPaxGrupoText(value) {
    return toMetric(value) + " / " + MAX_PAX_GRUPO;
  }

  function isGrupoCompleto(value) {
    const total = Number(value);

    return Number.isFinite(total) && total >= MAX_PAX_GRUPO;
  }

  function getReservacionId(reservacion) {
    return Number(reservacion && reservacion.id_reservacion) || 0;
  }

  function compareReservacionesByPickup(a, b) {
    return String(a && a.pickup_time || "").localeCompare(String(b && b.pickup_time || "")) ||
      String(a && a.pickup_place || "").localeCompare(String(b && b.pickup_place || ""), "es", { sensitivity: "base" }) ||
      (getReservacionId(a) - getReservacionId(b));
  }

  function sortReservacionesByPickup(reservaciones) {
    return getArray(reservaciones).slice().sort(compareReservacionesByPickup);
  }

  function setText(id, text) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = text;
    }
  }

  function setMessage(message, type) {
    const element = document.getElementById("daily-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function setLoading(isLoading) {
    isDailyLoading = isLoading;

    const content = document.getElementById("daily-content");

    if (content) {
      content.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    if (content && isLoading) {
      content.innerHTML = renderLoading();
    }

    updateActionButtons();
  }

  function hasDesktopPdfExport() {
    return Boolean(
      window.desktopAPI &&
      typeof window.desktopAPI.exportDailyPdf === "function"
    );
  }

  function setPdfExportLoading(isLoading) {
    isPdfExportLoading = isLoading;

    const pdfButton = document.getElementById("daily-pdf-button");

    if (pdfButton) {
      pdfButton.textContent = isLoading ? "Exportando..." : "Exportar PDF";
    }

    updateActionButtons();
  }

  function getTotalTransportes(daily) {
    const parsedTotal = Number(daily && daily.total_transportes);

    if (Number.isFinite(parsedTotal)) {
      return parsedTotal;
    }

    return getArray(daily && daily.operaciones).reduce(function (total, operacion) {
      return total + getArray(operacion && operacion.transportes).length;
    }, 0);
  }

  function updateActionButtons() {
    const printButton = document.getElementById("daily-print-button");
    const pdfButton = document.getElementById("daily-pdf-button");
    const canPrint = !isDailyLoading && !hasDailyError && getTotalTransportes(currentDaily) > 0;
    const hasPdfExport = hasDesktopPdfExport();
    const canExportPdf = canPrint && hasPdfExport && !isPdfExportLoading;

    if (printButton) {
      printButton.disabled = !canPrint;
      printButton.title = canPrint
        ? "Imprimir Daily operativo"
        : isDailyLoading
          ? "Cargando Daily operativo"
          : hasDailyError
            ? "No disponible por error de carga"
            : "No hay grupos con transporte preparado para imprimir";
    }

    if (pdfButton) {
      pdfButton.disabled = !canExportPdf;
      pdfButton.title = canExportPdf
        ? "Exportar Daily operativo a PDF"
        : isPdfExportLoading
          ? "Exportando Daily operativo"
          : !hasPdfExport
            ? "Disponible en la aplicación de escritorio"
            : isDailyLoading
              ? "Cargando Daily operativo"
              : hasDailyError
                ? "No disponible por error de carga"
                : "No hay grupos con transporte preparado para exportar";
    }
  }

  function updateUnassignedWarning(daily) {
    const warning = document.getElementById("daily-print-warning");
    const total = Number(daily && daily.total_reservaciones_sin_asignar) || 0;

    if (!warning) {
      return;
    }

    warning.hidden = total <= 0;
    warning.textContent = total > 0
      ? "Hay " + total + " reservaciones sin asignar que no se incluirán en la impresión."
      : "";
  }

  function updatePrintRoot(daily) {
    const printRoot = document.getElementById("daily-print-root");

    if (!printRoot) {
      return;
    }

    printRoot.innerHTML = daily ? renderPrintSheets(daily) : "";
  }

  function getDailyErrorMessage(error) {
    if (error && error.status === 400) {
      return "Selecciona una fecha válida para consultar el Daily.";
    }

    if (error && error.status === 403) {
      return "No tienes permisos para consultar el Daily.";
    }

    if (error && error.isNetworkError) {
      return "No hay conexión con el backend. Revisa que el servidor esté activo.";
    }

    return "No fue posible cargar el Daily. Intenta nuevamente.";
  }

  function renderLoading() {
    return [
      '<section class="card daily-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      "<div>",
      "<h2>Cargando Daily Operativo</h2>",
      '<p class="card-text">Consultando grupos, transporte y reservaciones de la fecha.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderError(message) {
    return [
      '<section class="card daily-state-panel">',
      "<h2>No se pudo cargar el Daily Operativo</h2>",
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      "</section>"
    ].join("");
  }

  function renderTable(headers, rowsHtml, emptyMessage, className) {
    if (!rowsHtml) {
      return [
        '<div class="daily-empty-inline">',
        App.ui.escapeHtml(emptyMessage),
        "</div>"
      ].join("");
    }

    const headerCells = headers.map(function (header) {
      return '<th scope="col">' + App.ui.escapeHtml(header) + "</th>";
    }).join("");

    return [
      '<div class="table-container daily-table-container">',
      '<table class="data-table daily-data-table ' + App.ui.escapeHtml(className || "") + '">',
      "<thead><tr>" + headerCells + "</tr></thead>",
      "<tbody>",
      rowsHtml,
      "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function renderReservacionRow(reservacion) {
    const estado = getReservacionEstado(reservacion);
    const cancelada = isCancelada(reservacion);

    return [
      '<tr class="' + (cancelada ? "is-cancelada" : "") + '">',
      '<td><strong>' + escapeHtml(reservacion && reservacion.nombre_cliente) + '</strong><span class="daily-row-code">' + escapeHtml(reservacion && reservacion.codigo) + "</span></td>",
      '<td class="daily-number-cell">' + escapeHtml(reservacion && reservacion.pax) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.pickup_place) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.habitacion) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.telefono_cliente) + "</td>",
      "<td>" + escapeHtml(formatTime(reservacion && reservacion.pickup_time)) + "</td>",
      '<td class="daily-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.precio_total)) + "</td>",
      '<td class="daily-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.deposito)) + "</td>",
      '<td class="daily-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.saldo)) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      '<td><span class="badge' + getEstadoBadgeClass(estado) + '">' + escapeHtml(estado) + '</span><span class="daily-observation-cell">' + escapeHtml(reservacion && reservacion.observaciones) + "</span></td>",
      "</tr>"
    ].join("");
  }

  function renderReservacionesTable(reservaciones) {
    const rows = sortReservacionesByPickup(reservaciones).map(renderReservacionRow).join("");

    return renderTable(
      ["Nombre", "PAX", "Hotel / Pickup", "Hab", "# Cel", "Horario", "Total", "Depósito", "Saldo", "Vendido por", "Observaciones"],
      rows,
      "No hay reservaciones asignadas a este transporte.",
      "daily-reservaciones-table"
    );
  }

  function renderPrintMeta(label, value) {
    return [
      '<div class="daily-print-meta-item">',
      '<span>' + App.ui.escapeHtml(label) + "</span>",
      "<strong>" + escapeHtml(value) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderPrintPax(reservacion) {
    const ninos = Number(reservacion && reservacion.ninos) || 0;
    const ninosText = ninos === 1 ? "1 niño" : ninos + " niños";

    return [
      '<strong>' + escapeHtml(reservacion && reservacion.pax) + "</strong>",
      ninos > 0 ? '<span class="daily-print-secondary">(' + App.ui.escapeHtml(ninosText) + ")</span>" : ""
    ].join("");
  }

  function renderPrintReservacionRow(reservacion) {
    const cancelada = isCancelada(reservacion);

    return [
      '<tr class="' + (cancelada ? "is-cancelada" : "") + '">',
      "<td>",
      '<strong>' + escapeHtml(reservacion && reservacion.nombre_cliente) + "</strong>",
      '<span class="daily-print-secondary">' + escapeHtml(reservacion && reservacion.codigo) + "</span>",
      cancelada ? '<span class="daily-print-cancel-tag">CANCELADA</span>' : "",
      "</td>",
      '<td class="daily-print-number-cell">' + renderPrintPax(reservacion) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.pickup_place) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.habitacion) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.telefono_cliente) + "</td>",
      '<td class="daily-print-time-cell">' + escapeHtml(formatTime(reservacion && reservacion.pickup_time)) + "</td>",
      '<td class="daily-print-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.precio_total)) + "</td>",
      '<td class="daily-print-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.deposito)) + "</td>",
      '<td class="daily-print-money-cell">' + escapeHtml(formatMoney(reservacion && reservacion.saldo)) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.observaciones) + "</td>",
      "</tr>"
    ].join("");
  }

  function renderPrintReservacionesTable(reservaciones) {
    const rows = sortReservacionesByPickup(reservaciones).map(renderPrintReservacionRow).join("");

    if (!rows) {
      return [
        '<table class="daily-print-table">',
        "<thead><tr>",
        "<th>NOMBRE</th>",
        "<th>PAX</th>",
        "<th>HOTEL / PICKUP</th>",
        "<th>HAB</th>",
        "<th># CEL</th>",
        "<th>HORARIO</th>",
        "<th>TOTAL</th>",
        "<th>DEPÓSITO</th>",
        "<th>SALDO</th>",
        "<th>VENDIDO POR</th>",
        "<th>OBSERVACIONES</th>",
        "</tr></thead>",
        '<tbody><tr><td colspan="11" class="daily-print-empty-cell">No hay reservaciones asignadas a este transporte.</td></tr></tbody>',
        "</table>"
      ].join("");
    }

    return [
      '<table class="daily-print-table">',
      "<thead><tr>",
      "<th>NOMBRE</th>",
      "<th>PAX</th>",
      "<th>HOTEL / PICKUP</th>",
      "<th>HAB</th>",
      "<th># CEL</th>",
      "<th>HORARIO</th>",
      "<th>TOTAL</th>",
      "<th>DEPÓSITO</th>",
      "<th>SALDO</th>",
      "<th>VENDIDO POR</th>",
      "<th>OBSERVACIONES</th>",
      "</tr></thead>",
      "<tbody>",
      rows,
      "</tbody>",
      "</table>"
    ].join("");
  }

  function renderPrintSheet(daily, operacion, transporte) {
    const fecha = daily && daily.fecha ? daily.fecha : currentFecha;
    const paxActivos = transporte && transporte.total_pax_activos;
    const observacionesOperador = transporte && typeof transporte.observaciones_operador === "string"
      ? transporte.observaciones_operador.trim()
      : "";

    return [
      '<section class="daily-print-sheet">',
      '<header class="daily-print-header">',
      '<div class="daily-print-brand-block">',
      '<p class="daily-print-company">Community Tours Sian Ka\'an</p>',
      '<p class="daily-print-subtitle">Daily operativo</p>',
      "</div>",
      '<div class="daily-print-summary-block">',
      renderPrintMeta("Fecha", formatPrintDate(fecha)),
      renderPrintMeta("PAX activos", getPaxGrupoText(paxActivos)),
      "</div>",
      "</header>",
      '<div class="daily-print-meta-grid">',
      renderPrintMeta("Tour", getOperacionGrupoTitle(operacion)),
      renderPrintMeta("Turno", operacion && operacion.turno),
      renderPrintMeta("Grupo", getGrupoLabel(operacion && operacion.numero_grupo)),
      renderPrintMeta("Primera hora de pickup", formatTime(operacion && operacion.hora_inicio)),
      renderPrintMeta("Guía", operacion && operacion.guia),
      renderPrintMeta("Vehículo", transporte && transporte.vehiculo),
      renderPrintMeta("Operador", transporte && transporte.operador),
      renderPrintMeta("PAX activos", getPaxGrupoText(paxActivos)),
      "</div>",
      renderPrintReservacionesTable(transporte && transporte.reservaciones),
      '<section class="daily-print-operator-notes">',
      "<h2>OBSERVACIONES PARA EL OPERADOR</h2>",
      "<p>" + escapeOptionalText(observacionesOperador, EMPTY_VALUE) + "</p>",
      "</section>",
      "</section>"
    ].join("");
  }

  function renderPrintSheets(daily) {
    const sheets = [];

    getArray(daily && daily.operaciones).forEach(function (operacion) {
      getArray(operacion && operacion.transportes).forEach(function (transporte) {
        sheets.push(renderPrintSheet(daily, operacion, transporte));
      });
    });

    return sheets.join("");
  }

  function renderSinAsignarRow(reservacion) {
    const estado = getReservacionEstado(reservacion);
    const cancelada = isCancelada(reservacion);

    return [
      '<tr class="' + (cancelada ? "is-cancelada" : "") + '">',
      '<td><strong>' + escapeHtml(reservacion && reservacion.nombre_cliente) + '</strong><span class="daily-row-code">' + escapeHtml(reservacion && reservacion.codigo) + "</span></td>",
      "<td>" + escapeHtml(reservacion && reservacion.tour) + "</td>",
      '<td class="daily-number-cell">' + escapeHtml(reservacion && reservacion.pax) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.pickup_place) + "</td>",
      "<td>" + escapeHtml(formatTime(reservacion && reservacion.pickup_time)) + "</td>",
      "<td>" + escapeHtml(reservacion && reservacion.telefono_cliente) + "</td>",
      "<td>" + escapeHtml(getVendidoPor(reservacion)) + "</td>",
      '<td><span class="badge' + getEstadoBadgeClass(estado) + '">' + escapeHtml(estado) + "</span></td>",
      "<td>" + escapeHtml(reservacion && reservacion.observaciones) + "</td>",
      "</tr>"
    ].join("");
  }

  function renderReservacionesSinAsignar(daily) {
    const reservaciones = getArray(daily && daily.reservaciones_sin_asignar);

    return [
      '<section class="card daily-unassigned-section">',
      '<div class="daily-section-header">',
      "<div>",
      "<h2>Reservaciones sin asignar</h2>",
      '<p class="card-text">Reservaciones de la fecha que todavía no pertenecen a un transporte.</p>',
      "</div>",
      '<span class="badge badge-warning">' + escapeHtml(toMetric(daily && daily.total_reservaciones_sin_asignar)) + "</span>",
      "</div>",
      renderTable(
        ["Nombre", "Tour", "PAX", "Hotel / Pickup", "Horario", "Teléfono", "Vendido por", "Estado", "Observaciones"],
        reservaciones.map(renderSinAsignarRow).join(""),
        "No hay reservaciones sin asignar para esta fecha.",
        "daily-unassigned-table"
      ),
      "</section>"
    ].join("");
  }

  function renderTransporteMeta(label, value) {
    return [
      '<span class="daily-transport-meta">',
      '<span>' + App.ui.escapeHtml(label) + "</span>",
      "<strong>" + escapeHtml(value) + "</strong>",
      "</span>"
    ].join("");
  }

  function renderTransporte(transporte) {
    const capacidad = transporte && transporte.capacidad !== null && transporte.capacidad !== undefined && transporte.capacidad !== ""
      ? transporte.capacidad
      : null;
    const paxText = getPaxGrupoText(transporte && transporte.total_pax_activos);
    const vehiculoDetalle = getJoinedText(
      [transporte && transporte.color, transporte && transporte.placas],
      "Datos del vehículo pendientes"
    );
    const observacionesOperador = transporte && typeof transporte.observaciones_operador === "string"
      ? transporte.observaciones_operador.trim()
      : "";

    return [
      '<article class="daily-transport-card">',
      '<div class="daily-transport-header">',
      "<div>",
      '<h3>' + escapeOptionalText(transporte && transporte.vehiculo, "Vehículo pendiente") + "</h3>",
      '<p class="card-text">' + escapeHtml(vehiculoDetalle) + "</p>",
      "</div>",
      '<div class="daily-badges">',
      '<span class="badge">' + escapeHtml(paxText) + "</span>",
      isGrupoCompleto(transporte && transporte.total_pax_activos) ? '<span class="badge badge-warning">Completo</span>' : "",
      '<span class="badge badge-neutral">' + escapeHtml(transporte && transporte.estado) + "</span>",
      "</div>",
      "</div>",
      '<div class="daily-transport-details">',
      renderTransporteMeta("Operador", transporte && transporte.operador ? transporte.operador : "Operador pendiente"),
      renderTransporteMeta("Capacidad", capacidad),
      renderTransporteMeta("Reservaciones", transporte && transporte.total_reservaciones),
      renderTransporteMeta("PAX activos", transporte && transporte.total_pax_activos),
      "</div>",
      renderReservacionesTable(transporte && transporte.reservaciones),
      '<div class="daily-operator-notes">',
      '<p class="field-label">Observaciones para el operador</p>',
      '<p>' + escapeOptionalText(observacionesOperador, "Sin observaciones para el operador.") + "</p>",
      "</div>",
      "</article>"
    ].join("");
  }

  function renderOperacion(operacion) {
    const transportes = getArray(operacion && operacion.transportes);
    const paxActivos = operacion && operacion.total_pax_activos;

    return [
      '<article class="card daily-operation-card">',
      '<div class="daily-operation-header">',
      "<div>",
      '<p class="field-label">Tour</p>',
      "<h2>" + escapeHtml(operacion && operacion.tour) + "</h2>",
      '<p class="card-text">' + escapeHtml(getOperacionContext(operacion)) + "</p>",
      "</div>",
      '<div class="daily-operation-summary">',
      '<span class="badge' + getEstadoBadgeClass(operacion && operacion.estado) + '">' + escapeHtml(operacion && operacion.estado) + "</span>",
      '<strong>' + escapeHtml(getPaxGrupoText(paxActivos)) + " PAX activos</strong>",
      isGrupoCompleto(paxActivos) ? '<span class="badge badge-warning">Completo</span>' : "",
      "</div>",
      "</div>",
      '<div class="daily-operation-meta">',
      renderTransporteMeta("Primera hora de pickup", formatTime(operacion && operacion.hora_inicio)),
      renderTransporteMeta("Guía", operacion && operacion.guia ? operacion.guia : "Sin guía asignada"),
      renderTransporteMeta("Transporte", transportes.length ? "Asignado" : "Pendiente"),
      renderTransporteMeta("Grupo", getGrupoLabel(operacion && operacion.numero_grupo)),
      "</div>",
      transportes.length
        ? '<div class="daily-transport-list">' + transportes.map(renderTransporte).join("") + "</div>"
        : '<div class="daily-empty-inline">Este grupo todavía no tiene transporte preparado.</div>',
      "</article>"
    ].join("");
  }

  function renderOperaciones(daily) {
    const operaciones = getArray(daily && daily.operaciones);

    if (operaciones.length === 0) {
      return [
        '<section class="card daily-state-panel">',
        App.ui.emptyState(
          "No hay operaciones preparadas.",
          "Las reservaciones sin asignar se muestran en su sección independiente si existen."
        ),
        "</section>"
      ].join("");
    }

    return [
      '<section class="daily-operations-section">',
      '<div class="daily-section-header">',
      "<div>",
      "<h2>Operaciones / Tours</h2>",
      '<p class="card-text">Detalle operativo por tour, transporte y reservación.</p>',
      "</div>",
      "</div>",
      '<div class="daily-operation-list">',
      operaciones.map(renderOperacion).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderDateCard(daily) {
    return [
      '<section class="daily-date-card">',
      '<p class="field-label">Fecha consultada</p>',
      '<h2>Daily Operativo</h2>',
      '<p>' + App.ui.escapeHtml(formatDate(daily && daily.fecha ? daily.fecha : currentFecha)) + "</p>",
      "</section>"
    ].join("");
  }

  function renderEmptyDaily(daily) {
    return [
      renderDateCard(daily),
      '<section class="card daily-state-panel">',
      App.ui.emptyState(
        "No hay operaciones ni reservaciones para esta fecha.",
        "Cambia la fecha para consultar otro Daily Operativo."
      ),
      "</section>"
    ].join("");
  }

  function renderDailyData(daily) {
    const content = document.getElementById("daily-content");
    const totalOperaciones = Number(daily && daily.total_operaciones) || 0;
    const totalReservaciones = Number(daily && daily.total_reservaciones) || 0;

    if (!content) {
      return;
    }

    if (totalOperaciones === 0 && totalReservaciones === 0) {
      content.innerHTML = renderEmptyDaily(daily);
      renderSummary(daily);
      updateUnassignedWarning(daily);
      updatePrintRoot(daily);
      updateActionButtons();
      return;
    }

    content.innerHTML = [
      renderDateCard(daily),
      renderReservacionesSinAsignar(daily),
      renderOperaciones(daily)
    ].join("");

    renderSummary(daily);
    updateUnassignedWarning(daily);
    updatePrintRoot(daily);
    updateActionButtons();
  }

  function renderSummary(daily) {
    setText("daily-total-operaciones", toMetric(daily && daily.total_operaciones));
    setText("daily-total-transportes", toMetric(daily && daily.total_transportes));
    setText("daily-total-reservaciones", toMetric(daily && daily.total_reservaciones));
    setText("daily-total-pax", toMetric(daily && daily.total_pax_activos));
    setText("daily-total-sin-asignar", toMetric(daily && daily.total_reservaciones_sin_asignar));
  }

  async function loadDaily(fecha) {
    if (!isValidDateValue(fecha)) {
      setMessage("Selecciona una fecha válida para consultar el Daily.", "error");
      return;
    }

    const activeRequestId = requestId + 1;
    requestId = activeRequestId;
    currentFecha = fecha;
    currentDaily = null;
    hasDailyError = false;
    setMessage("", "");
    updateUnassignedWarning(null);
    updatePrintRoot(null);
    setLoading(true);
    renderSummary({});

    try {
      const daily = await App.api.apiFetch("/api/daily/operativo?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== requestId) {
        return;
      }

      currentDaily = daily || { fecha: fecha, operaciones: [], reservaciones_sin_asignar: [] };
      renderDailyData(currentDaily);
    } catch (error) {
      if (activeRequestId !== requestId) {
        return;
      }

      const content = document.getElementById("daily-content");
      const message = getDailyErrorMessage(error);

      currentDaily = null;
      hasDailyError = true;
      setMessage(message, "error");
      updateUnassignedWarning(null);
      updatePrintRoot(null);

      if (content) {
        content.innerHTML = renderError(message);
      }
    } finally {
      if (activeRequestId === requestId) {
        setLoading(false);
      }
    }
  }

  async function exportDailyPdf() {
    const dailyToExport = currentDaily;
    const fechaToExport = dailyToExport && dailyToExport.fecha ? dailyToExport.fecha : currentFecha;

    if (
      isPdfExportLoading ||
      !hasDesktopPdfExport() ||
      isDailyLoading ||
      hasDailyError ||
      getTotalTransportes(dailyToExport) <= 0
    ) {
      return;
    }

    setPdfExportLoading(true);
    setMessage("", "");

    try {
      const result = await window.desktopAPI.exportDailyPdf({ fecha: fechaToExport });

      if (result && result.canceled) {
        return;
      }

      if (result && result.ok) {
        setMessage("PDF guardado correctamente.", "info");
        return;
      }

      throw new Error("PDF export failed");
    } catch (error) {
      setMessage("No se pudo generar el PDF.", "error");
    } finally {
      setPdfExportLoading(false);
    }
  }

  function bindDailyEvents() {
    const dateInput = document.getElementById("daily-fecha");
    const pdfButton = document.getElementById("daily-pdf-button");
    const printButton = document.getElementById("daily-print-button");

    if (!dateInput) {
      return;
    }

    dateInput.addEventListener("change", function () {
      if (dateInput.value === currentFecha) {
        return;
      }

      loadDaily(dateInput.value);
    });

    if (printButton) {
      printButton.addEventListener("click", function () {
        if (printButton.disabled) {
          return;
        }

        window.print();
      });
    }

    if (pdfButton) {
      pdfButton.addEventListener("click", function () {
        exportDailyPdf();
      });
    }
  }

  App.pages.daily = {
    title: "Daily",
    subtitle: "Agenda operativa diaria",
    render: function () {
      return [
        '<section class="page daily-page">',
        '<div class="daily-toolbar">',
        '<label class="field daily-date-field" for="daily-fecha">',
        '<span class="field-label">Fecha</span>',
        '<input class="input" id="daily-fecha" type="date">',
        "</label>",
        '<div class="daily-actions" aria-label="Acciones del Daily">',
        '<button class="btn" id="daily-pdf-button" type="button" disabled title="Disponible en la aplicación de escritorio">Exportar PDF</button>',
        '<button class="btn btn-primary" id="daily-print-button" type="button" disabled title="No hay grupos con transporte preparado para imprimir">Imprimir</button>',
        "</div>",
        "</div>",
        '<p class="form-message daily-message" id="daily-message" role="status" aria-live="polite"></p>',
        '<p class="daily-print-warning" id="daily-print-warning" role="status" aria-live="polite" hidden></p>',
        '<div class="daily-layout">',
        '<section class="daily-main" id="daily-content" aria-live="polite">',
        renderLoading(),
        "</section>",
        '<aside class="daily-summary" aria-label="Resumen operativo">',
        '<article class="card metric-card daily-metric-card">',
        '<p class="metric-value" id="daily-total-operaciones">0</p>',
        '<p class="metric-label">Operaciones</p>',
        "</article>",
        '<article class="card metric-card daily-metric-card">',
        '<p class="metric-value" id="daily-total-transportes">0</p>',
        '<p class="metric-label">Transportes</p>',
        "</article>",
        '<article class="card metric-card daily-metric-card">',
        '<p class="metric-value" id="daily-total-reservaciones">0</p>',
        '<p class="metric-label">Reservaciones</p>',
        "</article>",
        '<article class="card metric-card daily-metric-card">',
        '<p class="metric-value" id="daily-total-pax">0</p>',
        '<p class="metric-label">PAX activos</p>',
        "</article>",
        '<article class="card metric-card daily-metric-card daily-metric-warning">',
        '<p class="metric-value" id="daily-total-sin-asignar">0</p>',
        '<p class="metric-label">Sin asignar</p>',
        "</article>",
        "</aside>",
        "</div>",
        '<div class="daily-print-root" id="daily-print-root" aria-hidden="true"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const dateInput = document.getElementById("daily-fecha");
      const fecha = getLocalDateValue();

      requestId += 1;
      currentFecha = "";
      currentDaily = null;
      isDailyLoading = false;
      isPdfExportLoading = false;
      hasDailyError = false;

      bindDailyEvents();
      updateActionButtons();

      if (dateInput) {
        dateInput.value = fecha;
      }

      loadDaily(fecha);
    }
  };
})();
