(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "-";
  const COLUMN_COUNT = 9;
  let requestId = 0;
  let reservacionesCargadas = [];
  let toursCargados = [];

  function getElements() {
    return {
      form: document.getElementById("historial-filtros"),
      fechaDesde: document.getElementById("historial-fecha-desde"),
      fechaHasta: document.getElementById("historial-fecha-hasta"),
      tour: document.getElementById("historial-tour"),
      codigo: document.getElementById("historial-codigo"),
      nombre: document.getElementById("historial-nombre"),
      limpiar: document.getElementById("historial-limpiar"),
      tbody: document.getElementById("historial-tbody"),
      message: document.getElementById("historial-message"),
      summary: document.getElementById("historial-tour-summary")
    };
  }

  function escapeValue(value) {
    if (value === null || value === undefined || value === "") {
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

  function getTodayLocalString() {
    return getLocalDateString(new Date());
  }

  function getYesterdayLocalString() {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    return getLocalDateString(yesterday);
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

  function formatTime(value) {
    if (!value) {
      return EMPTY_VALUE;
    }

    return String(value).slice(0, 5);
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

  function getTourId(reservacion) {
    return reservacion && reservacion.id_tour !== null && reservacion.id_tour !== undefined
      ? String(reservacion.id_tour)
      : "";
  }

  function getTourMap() {
    return toursCargados.reduce(function (map, tour) {
      if (tour && tour.id_tour !== null && tour.id_tour !== undefined) {
        map.set(String(tour.id_tour), tour.nombre);
      }

      return map;
    }, new Map());
  }

  function getTourName(reservacion, tourMap) {
    const existingName = reservacion && reservacion.tour;

    if (existingName) {
      return existingName;
    }

    const idTour = getTourId(reservacion);

    if (idTour && tourMap.has(idTour)) {
      return tourMap.get(idTour);
    }

    return idTour ? "Tour ID " + idTour : EMPTY_VALUE;
  }

  function getVendidoPor(reservacion) {
    if (reservacion && reservacion.vendedor) {
      return reservacion.vendedor;
    }

    if (reservacion && reservacion.plataforma) {
      return reservacion.plataforma;
    }

    return EMPTY_VALUE;
  }

  function getEstadoBadgeClass(estado) {
    if (estado === "Cancelada") {
      return "badge badge-danger";
    }

    if (estado === "Programada") {
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
      elements.codigo,
      elements.nombre,
      elements.limpiar
    ].forEach(function (control) {
      if (control) {
        control.disabled = isLoading;
      }
    });

    const submit = elements.form ? elements.form.querySelector('[type="submit"]') : null;

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

  function renderTourOptions(tours, reservaciones) {
    const tourMap = new Map();

    tours.forEach(function (tour) {
      if (tour && tour.id_tour !== null && tour.id_tour !== undefined) {
        tourMap.set(String(tour.id_tour), tour.nombre || ("Tour ID " + tour.id_tour));
      }
    });

    reservaciones.forEach(function (reservacion) {
      const idTour = getTourId(reservacion);

      if (idTour && !tourMap.has(idTour)) {
        tourMap.set(idTour, "Tour ID " + idTour);
      }
    });

    return [
      '<option value="">Todos</option>',
      Array.from(tourMap.entries()).map(function (entry) {
        return '<option value="' + App.ui.escapeHtml(entry[0]) + '">' + App.ui.escapeHtml(entry[1]) + "</option>";
      }).join("")
    ].join("");
  }

  function populateTours(elements) {
    if (!elements.tour) {
      return;
    }

    const currentValue = elements.tour.value;
    elements.tour.innerHTML = renderTourOptions(toursCargados, reservacionesCargadas);

    if (currentValue) {
      elements.tour.value = currentValue;
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
      fechaHasta: fechaHasta,
      idTour: elements.tour ? elements.tour.value : ""
    };
  }

  function validateFilters(elements) {
    const fechaDesde = elements.fechaDesde ? elements.fechaDesde.value : "";
    const fechaHasta = elements.fechaHasta ? elements.fechaHasta.value : "";
    const yesterday = getYesterdayLocalString();
    const effectiveFechaHasta = fechaHasta && fechaHasta <= yesterday ? fechaHasta : yesterday;

    if (fechaDesde && !isValidDateString(fechaDesde)) {
      return "La fecha desde debe tener formato YYYY-MM-DD y ser una fecha válida.";
    }

    if (fechaHasta && !isValidDateString(fechaHasta)) {
      return "La fecha hasta debe tener formato YYYY-MM-DD y ser una fecha válida.";
    }

    if (fechaDesde && effectiveFechaHasta && fechaDesde > effectiveFechaHasta) {
      return "La fecha desde debe ser menor o igual a la fecha hasta.";
    }

    return "";
  }

  function buildBackendQuery(elements) {
    const params = new URLSearchParams();
    const filters = getEffectiveFilters(elements);

    if (elements.codigo && elements.codigo.value.trim()) {
      params.set("codigo", elements.codigo.value.trim());
    }

    if (elements.nombre && elements.nombre.value.trim()) {
      params.set("nombre", elements.nombre.value.trim());
    }

    if (filters.fechaDesde) {
      params.set("fecha_desde", filters.fechaDesde);
    }

    params.set("fecha_hasta", filters.fechaHasta || getYesterdayLocalString());

    if (filters.idTour) {
      params.set("id_tour", filters.idTour);
    }

    const query = params.toString();

    return query ? "?" + query : "";
  }

  function filterHistorial(elements) {
    const today = getTodayLocalString();
    const filters = getEffectiveFilters(elements);

    return reservacionesCargadas.filter(function (reservacion) {
      const fecha = normalizeDateValue(reservacion && reservacion.fecha);

      if (!fecha || fecha >= today) {
        return false;
      }

      if (filters.fechaDesde && fecha < filters.fechaDesde) {
        return false;
      }

      if (filters.fechaHasta && fecha > filters.fechaHasta) {
        return false;
      }

      if (filters.idTour && getTourId(reservacion) !== filters.idTour) {
        return false;
      }

      return true;
    }).sort(function (a, b) {
      const fechaA = normalizeDateValue(a && a.fecha);
      const fechaB = normalizeDateValue(b && b.fecha);

      if (fechaA !== fechaB) {
        return fechaA < fechaB ? 1 : -1;
      }

      return Number(b && b.id_reservacion || 0) - Number(a && a.id_reservacion || 0);
    });
  }

  function hasActiveFilters(elements) {
    return Boolean(
      (elements.fechaDesde && elements.fechaDesde.value) ||
      (elements.fechaHasta && elements.fechaHasta.value) ||
      (elements.tour && elements.tour.value) ||
      (elements.codigo && elements.codigo.value.trim()) ||
      (elements.nombre && elements.nombre.value.trim())
    );
  }

  function renderRows(reservaciones) {
    const tourMap = getTourMap();

    if (!Array.isArray(reservaciones) || reservaciones.length === 0) {
      return "";
    }

    return reservaciones.map(function (reservacion) {
      const estado = reservacion.estado || EMPTY_VALUE;
      const isCancelada = estado === "Cancelada";

      return [
        '<tr class="' + (isCancelada ? "is-cancelada" : "") + '">',
        "<td>" + escapeValue(formatDate(reservacion.fecha)) + "</td>",
        '<td><strong class="historial-primary-text">' + escapeValue(reservacion.codigo) + "</strong></td>",
        "<td>" + escapeValue(reservacion.nombre_cliente) + "</td>",
        "<td>" + escapeValue(getTourName(reservacion, tourMap)) + "</td>",
        '<td class="historial-number-cell">' + escapeValue(reservacion.pax) + "</td>",
        "<td>" + escapeValue(reservacion.pickup_place) + '<span class="historial-secondary-text">' + escapeValue(formatTime(reservacion.pickup_time)) + "</span></td>",
        "<td>" + escapeValue(getVendidoPor(reservacion)) + "</td>",
        '<td><span class="' + getEstadoBadgeClass(estado) + '">' + escapeValue(estado) + "</span></td>",
        '<td class="historial-money-cell">' + escapeValue(formatMoney(reservacion.precio_total)) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function renderSummary(reservaciones) {
    const tourMap = getTourMap();
    const counts = new Map();

    reservaciones.forEach(function (reservacion) {
      const idTour = getTourId(reservacion) || "sin-tour";
      const label = getTourName(reservacion, tourMap);
      const current = counts.get(idTour) || {
        label: label,
        total: 0
      };

      current.total += 1;
      counts.set(idTour, current);
    });

    if (counts.size === 0) {
      return "";
    }

    return [
      '<div class="historial-summary-label">Clasificación por tour</div>',
      '<div class="historial-summary-list">',
      Array.from(counts.values()).map(function (entry) {
        return [
          '<span class="badge badge-neutral historial-tour-badge">',
          App.ui.escapeHtml(entry.label),
          " ",
          '<strong>' + App.ui.escapeHtml(entry.total) + "</strong>",
          "</span>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderHistorial(elements, reservaciones) {
    if (!elements.tbody) {
      return;
    }

    if (!Array.isArray(reservaciones) || reservaciones.length === 0) {
      elements.tbody.innerHTML = hasActiveFilters(elements)
        ? renderStatusRow("No se encontraron reservaciones con los filtros seleccionados.", "Ajusta los filtros para consultar otros registros históricos.")
        : renderStatusRow("No hay reservaciones en el historial.", "Las reservaciones entran al historial cuando su fecha es anterior a hoy.");
    } else {
      elements.tbody.innerHTML = renderRows(reservaciones);
    }

    if (elements.summary) {
      elements.summary.innerHTML = renderSummary(reservaciones);
    }
  }

  async function loadHistorial() {
    const elements = getElements();
    const validationMessage = validateFilters(elements);

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
      const responses = await Promise.all([
        App.api.apiFetch("/api/reservaciones" + buildBackendQuery(elements)),
        App.api.apiFetch("/api/tours")
      ]);

      if (currentRequestId !== requestId || window.location.hash !== "#/historial") {
        return;
      }

      reservacionesCargadas = Array.isArray(responses[0] && responses[0].datos) ? responses[0].datos : [];
      toursCargados = Array.isArray(responses[1] && responses[1].datos) ? responses[1].datos : [];

      populateTours(elements);

      const reservacionesHistoricas = filterHistorial(elements);
      renderHistorial(elements, reservacionesHistoricas);
      setMessage(
        elements,
        reservacionesHistoricas.length + " reservaciones históricas encontradas. Hoy y fechas futuras quedan excluidas.",
        "is-info"
      );
    } catch (error) {
      if (currentRequestId !== requestId || window.location.hash !== "#/historial") {
        return;
      }

      const message = getMensajeError(error);

      reservacionesCargadas = [];
      elements.tbody.innerHTML = renderStatusRow("No se pudo cargar el historial", message);

      if (elements.summary) {
        elements.summary.innerHTML = "";
      }

      setMessage(elements, message, "is-error");
    } finally {
      if (currentRequestId === requestId && window.location.hash === "#/historial") {
        setLoading(elements, false);
      }
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
        "</tr></thead>",
        '<tbody id="historial-tbody">',
        renderStatusRow("Cargando historial", "Consultando reservaciones históricas reales del backend."),
        "</tbody>",
        "</table>",
        "</div>",
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const elements = getElements();

      if (!elements.form) {
        return;
      }

      elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        loadHistorial();
      });

      elements.limpiar.addEventListener("click", function () {
        elements.fechaDesde.value = "";
        elements.fechaHasta.value = "";
        elements.tour.value = "";
        elements.codigo.value = "";
        elements.nombre.value = "";
        loadHistorial();
      });

      loadHistorial();
    }
  };
})();
