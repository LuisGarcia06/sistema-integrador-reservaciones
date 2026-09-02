(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  let requestId = 0;
  let isLoadingDaily = false;
  let isSavingObservaciones = false;
  let currentDaily = null;
  let currentFecha = "";

  function escapeHtml(value) {
    return App.ui.escapeHtml(value === null || value === undefined || value === "" ? "-" : value);
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
      return "-";
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
      return "-";
    }

    const time = String(value);
    const match = time.match(/^(\d{2}):(\d{2})/);

    return match ? match[1] + ":" + match[2] : time;
  }

  function normalizeEstado(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isCancelada(reservacion) {
    return normalizeEstado(reservacion && reservacion.estado) === "cancelada";
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
    const dateInput = document.getElementById("daily-fecha");
    const content = document.getElementById("daily-content");

    isLoadingDaily = isLoading;

    if (dateInput) {
      dateInput.disabled = isLoading;
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
      return "No tienes permisos para realizar esta acción.";
    }

    return "No fue posible cargar el Daily. Intenta nuevamente.";
  }

  function getObservacionesErrorMessage(error) {
    if (error && error.status === 403) {
      return "No tienes permisos para realizar esta acción.";
    }

    if (error && error.status === 400) {
      return "Revisa las observaciones antes de guardar.";
    }

    return "No fue posible guardar las observaciones. Intenta nuevamente.";
  }

  function renderLoading() {
    return [
      '<section class="card daily-loading" aria-live="polite">',
      '<span class="daily-spinner" aria-hidden="true"></span>',
      '<div>',
      '<h2>Cargando Daily</h2>',
      '<p class="card-text">Consultando reservaciones y observaciones del día.</p>',
      "</div>",
      "</section>"
    ].join("");
  }

  function renderError(message) {
    return [
      '<section class="card daily-state-panel">',
      '<h2>No se pudo cargar el Daily</h2>',
      '<p class="card-text">' + App.ui.escapeHtml(message) + "</p>",
      "</section>"
    ].join("");
  }

  function renderSummary(daily) {
    const datos = Array.isArray(daily && daily.datos) ? daily.datos : [];
    const total = Number.isFinite(Number(daily && daily.total)) ? Number(daily.total) : datos.length;
    const canceladas = datos.filter(isCancelada).length;

    setText("daily-total", String(total));
    setText("daily-canceladas", String(canceladas));
  }

  function renderObservaciones(daily) {
    const isAdmin = App.auth && App.auth.esAdministrador();
    const observaciones = daily && typeof daily.observaciones === "string" ? daily.observaciones : "";
    const body = [
      '<p class="daily-observaciones-text" id="daily-observaciones-text"></p>'
    ];

    if (isAdmin) {
      body.push(
        '<div class="daily-observaciones-editor">',
        '<label class="field" for="daily-observaciones-input">',
        '<span class="field-label">Editar observaciones</span>',
        '<textarea class="input daily-textarea" id="daily-observaciones-input" rows="5"></textarea>',
        "</label>",
        '<div class="daily-observaciones-actions">',
        '<button class="btn btn-primary" id="daily-observaciones-save" type="button">Guardar observaciones</button>',
        '<p class="form-message daily-save-message" id="daily-save-message" role="status" aria-live="polite"></p>',
        "</div>",
        "</div>"
      );
    }

    return [
      '<section class="card daily-observaciones-card">',
      '<div class="card-header">',
      '<div>',
      '<h2>Observaciones del día</h2>',
      '<p class="card-text">Notas generales para la operación.</p>',
      "</div>",
      isAdmin ? '<span class="badge">Editable</span>' : '<span class="badge">Solo lectura</span>',
      "</div>",
      body.join(""),
      "</section>"
    ].join("");
  }

  function hydrateObservaciones(daily) {
    const observaciones = daily && typeof daily.observaciones === "string" ? daily.observaciones : "";
    const textElement = document.getElementById("daily-observaciones-text");
    const input = document.getElementById("daily-observaciones-input");

    if (textElement) {
      textElement.textContent = observaciones || "Sin observaciones para este día.";
      textElement.classList.toggle("is-empty", !observaciones);
    }

    if (input) {
      input.value = observaciones;
    }
  }

  function renderMetaItem(label, value) {
    return [
      '<div class="daily-meta-item">',
      '<span>' + App.ui.escapeHtml(label) + "</span>",
      '<strong>' + escapeHtml(value) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderReservacion(reservacion) {
    const cancelada = isCancelada(reservacion);
    const estado = cancelada ? "Cancelada" : (reservacion.estado || "-");

    return [
      '<article class="card daily-reservation-card' + (cancelada ? " is-cancelada" : "") + '">',
      '<div class="daily-timeline-node" aria-hidden="true"></div>',
      '<div class="daily-reservation-header">',
      '<div class="daily-reservation-title">',
      '<div class="daily-badges">',
      '<span class="badge' + (cancelada ? " badge-danger" : "") + '">' + escapeHtml(estado) + "</span>",
      '<span class="badge badge-neutral">' + escapeHtml(reservacion.plataforma) + "</span>",
      "</div>",
      '<h3>' + escapeHtml(reservacion.tour) + "</h3>",
      '<p class="daily-code">' + escapeHtml(reservacion.codigo) + "</p>",
      "</div>",
      '<div class="daily-client">',
      '<strong>' + escapeHtml(reservacion.nombre_cliente) + "</strong>",
      '<span>PAX ' + escapeHtml(reservacion.pax) + ' · Niños ' + escapeHtml(reservacion.ninos) + "</span>",
      "</div>",
      "</div>",
      '<div class="daily-pickup">',
      '<div class="daily-pickup-time">' + escapeHtml(formatTime(reservacion.pickup_time)) + "</div>",
      '<div>',
      '<p>' + escapeHtml(reservacion.pickup_place) + "</p>",
      cancelada ? '<span class="daily-cancel-note">Reservación cancelada</span>' : "",
      "</div>",
      "</div>",
      '<div class="daily-meta-grid">',
      renderMetaItem("País", reservacion.pais),
      renderMetaItem("Habitación", reservacion.habitacion),
      renderMetaItem("Método de pago", reservacion.metodo_pago),
      renderMetaItem("Precio total", reservacion.precio_total),
      renderMetaItem("Depósito", reservacion.deposito),
      renderMetaItem("Saldo", reservacion.saldo),
      renderMetaItem("Tipo de cambio", reservacion.tipo_cambio),
      "</div>",
      "</article>"
    ].join("");
  }

  function renderReservaciones(daily) {
    const datos = Array.isArray(daily && daily.datos) ? daily.datos : [];

    if (datos.length === 0) {
      return [
        '<section class="card daily-state-panel">',
        App.ui.emptyState(
          "No hay reservaciones programadas para esta fecha.",
          "El Daily queda disponible para consultar observaciones del día."
        ),
        "</section>"
      ].join("");
    }

    return [
      '<section class="daily-reservaciones-section">',
      '<div class="daily-section-header">',
      '<div>',
      '<h2>Reservaciones del día</h2>',
      '<p class="card-text">Ordenadas por hora de pickup.</p>',
      "</div>",
      "</div>",
      '<div class="daily-timeline">',
      datos.map(renderReservacion).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderDailyData(daily) {
    const content = document.getElementById("daily-content");

    if (!content) {
      return;
    }

    content.innerHTML = [
      '<section class="daily-date-card">',
      '<p class="field-label">Fecha consultada</p>',
      '<h2>' + App.ui.escapeHtml(formatDate(daily.fecha || currentFecha)) + "</h2>",
      "</section>",
      renderObservaciones(daily),
      renderReservaciones(daily)
    ].join("");

    renderSummary(daily);
    hydrateObservaciones(daily);
    bindObservacionesEvents();
  }

  async function loadDaily(fecha) {
    if (isLoadingDaily || !isValidDateValue(fecha)) {
      if (!isValidDateValue(fecha)) {
        setMessage("Selecciona una fecha válida para consultar el Daily.", "error");
      }

      return;
    }

    const activeRequestId = requestId + 1;
    requestId = activeRequestId;
    currentFecha = fecha;
    currentDaily = null;
    setMessage("", "");
    setLoading(true);
    renderSummary({ fecha: fecha, total: 0, datos: [] });

    try {
      const daily = await App.api.apiFetch("/api/daily?fecha=" + encodeURIComponent(fecha));

      if (activeRequestId !== requestId) {
        return;
      }

      currentDaily = daily || { fecha: fecha, observaciones: "", total: 0, datos: [] };
      renderDailyData(currentDaily);
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

  function setSavingObservaciones(isSaving) {
    const button = document.getElementById("daily-observaciones-save");
    const input = document.getElementById("daily-observaciones-input");

    isSavingObservaciones = isSaving;

    if (button) {
      button.disabled = isSaving;
      button.textContent = isSaving ? "Guardando..." : "Guardar observaciones";
    }

    if (input) {
      input.disabled = isSaving;
    }
  }

  function setSaveMessage(message, type) {
    const element = document.getElementById("daily-save-message");

    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  async function saveObservaciones() {
    const input = document.getElementById("daily-observaciones-input");

    if (!input || !currentFecha || isSavingObservaciones) {
      return;
    }

    setSaveMessage("", "");
    setSavingObservaciones(true);

    try {
      const respuesta = await App.api.apiFetch(
        "/api/daily/observaciones?fecha=" + encodeURIComponent(currentFecha),
        {
          method: "PUT",
          body: {
            observaciones: input.value
          }
        }
      );
      const observaciones = respuesta && typeof respuesta.observaciones === "string"
        ? respuesta.observaciones
        : input.value.trim();

      currentDaily = Object.assign({}, currentDaily || {}, {
        fecha: currentFecha,
        observaciones: observaciones
      });

      hydrateObservaciones(currentDaily);
      setSaveMessage("Observaciones guardadas.", "info");
    } catch (error) {
      setSaveMessage(getObservacionesErrorMessage(error), "error");
    } finally {
      setSavingObservaciones(false);
    }
  }

  function bindObservacionesEvents() {
    const button = document.getElementById("daily-observaciones-save");

    if (button) {
      button.addEventListener("click", saveObservaciones);
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
        '<button class="btn" type="button" disabled title="Disponible en una fase posterior">Exportar PDF</button>',
        '<button class="btn" type="button" disabled title="Disponible en una fase posterior">Imprimir</button>',
        "</div>",
        "</div>",
        '<p class="form-message daily-message" id="daily-message" role="status" aria-live="polite"></p>',
        '<div class="daily-layout">',
        '<section class="daily-main" id="daily-content">',
        renderLoading(),
        "</section>",
        '<aside class="daily-summary" aria-label="Resumen operativo">',
        '<article class="card metric-card daily-metric-card">',
        '<p class="metric-value" id="daily-total">0</p>',
        '<p class="metric-label">Reservaciones</p>',
        "</article>",
        '<article class="card metric-card daily-metric-card daily-metric-canceladas">',
        '<p class="metric-value" id="daily-canceladas">0</p>',
        '<p class="metric-label">Canceladas</p>',
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
      isLoadingDaily = false;
      isSavingObservaciones = false;
      currentDaily = null;
      currentFecha = "";

      bindDailyEvents();

      if (dateInput) {
        dateInput.value = fecha;
      }

      loadDaily(fecha);
    }
  };
})();
