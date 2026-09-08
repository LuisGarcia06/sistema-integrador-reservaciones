(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const MONEY_FORMATTER = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  let requestId = 0;
  let currentFecha = "";

  function escapeHtml(value) {
    return App.ui.escapeHtml(value === null || value === undefined || value === "" ? EMPTY_VALUE : value);
  }

  function escapeOptionalText(value, fallback) {
    const text = value === null || value === undefined ? "" : String(value).trim();
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

  function formatTime(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY_VALUE;
    }

    const time = String(value);
    const match = time.match(/^(\d{2}):(\d{2})/);

    return match ? match[1] + ":" + match[2] : time;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
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
    const vendedor = reservacion && reservacion.vendedor !== null && reservacion.vendedor !== undefined
      ? String(reservacion.vendedor).trim()
      : "";
    const plataforma = reservacion && reservacion.plataforma !== null && reservacion.plataforma !== undefined
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
        return value === null || value === undefined ? "" : String(value).trim();
      })
      .filter(Boolean);

    return parts.length ? parts.join(" · ") : fallback;
  }

  function toMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : "0";
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
    const content = document.getElementById("daily-content");

    if (content) {
      content.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    if (content && isLoading) {
      content.innerHTML = renderLoading();
    }
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
      '<p class="card-text">Consultando operaciones, transportes y reservaciones de la fecha.</p>',
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
    const rows = getArray(reservaciones).map(renderReservacionRow).join("");

    return renderTable(
      ["Nombre", "PAX", "Hotel / Pickup", "Hab", "# Cel", "Horario", "Total", "Depósito", "Saldo", "Vendido por", "Observaciones"],
      rows,
      "No hay reservaciones asignadas a este transporte.",
      "daily-reservaciones-table"
    );
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
    const paxText = capacidad === null
      ? toMetric(transporte && transporte.total_pax_activos) + " PAX"
      : toMetric(transporte && transporte.total_pax_activos) + " / " + capacidad + " PAX";
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

    return [
      '<article class="card daily-operation-card">',
      '<div class="daily-operation-header">',
      "<div>",
      '<p class="field-label">Tour</p>',
      "<h2>" + escapeHtml(operacion && operacion.tour) + "</h2>",
      '<p class="card-text">' +
        escapeHtml(formatTime(operacion && operacion.hora_inicio)) +
        " · " +
        escapeHtml(operacion && operacion.turno) +
      "</p>",
      "</div>",
      '<div class="daily-operation-summary">',
      '<span class="badge' + getEstadoBadgeClass(operacion && operacion.estado) + '">' + escapeHtml(operacion && operacion.estado) + "</span>",
      '<strong>' + escapeHtml(toMetric(operacion && operacion.total_pax_activos)) + " PAX activos</strong>",
      "</div>",
      "</div>",
      '<div class="daily-operation-meta">',
      renderTransporteMeta("Guía", operacion && operacion.guia ? operacion.guia : "Sin guía asignada"),
      renderTransporteMeta("Transportes", transportes.length),
      "</div>",
      transportes.length
        ? '<div class="daily-transport-list">' + transportes.map(renderTransporte).join("") + "</div>"
        : '<div class="daily-empty-inline">No hay transportes preparados para esta operación.</div>',
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
      return;
    }

    content.innerHTML = [
      renderDateCard(daily),
      renderReservacionesSinAsignar(daily),
      renderOperaciones(daily)
    ].join("");

    renderSummary(daily);
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
    setMessage("", "");
    setLoading(true);
    renderSummary({});

    try {
      const daily = await App.api.apiFetch("/api/daily/operativo?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== requestId) {
        return;
      }

      renderDailyData(daily || { fecha: fecha, operaciones: [], reservaciones_sin_asignar: [] });
    } catch (error) {
      if (activeRequestId !== requestId) {
        return;
      }

      const content = document.getElementById("daily-content");
      const message = getDailyErrorMessage(error);

      setMessage(message, "error");

      if (content) {
        content.innerHTML = renderError(message);
      }
    } finally {
      if (activeRequestId === requestId) {
        setLoading(false);
      }
    }
  }

  function bindDailyEvents() {
    const dateInput = document.getElementById("daily-fecha");

    if (!dateInput) {
      return;
    }

    dateInput.addEventListener("change", function () {
      if (dateInput.value === currentFecha) {
        return;
      }

      loadDaily(dateInput.value);
    });
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
        '<div class="daily-actions" aria-label="Acciones futuras">',
        '<button class="btn" type="button" disabled title="Disponible próximamente">Exportar PDF</button>',
        '<button class="btn" type="button" disabled title="Disponible próximamente">Imprimir</button>',
        "</div>",
        "</div>",
        '<p class="form-message daily-message" id="daily-message" role="status" aria-live="polite"></p>',
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
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const dateInput = document.getElementById("daily-fecha");
      const fecha = getLocalDateValue();

      requestId += 1;
      currentFecha = "";

      bindDailyEvents();

      if (dateInput) {
        dateInput.value = fecha;
      }

      loadDaily(fecha);
    }
  };
})();
