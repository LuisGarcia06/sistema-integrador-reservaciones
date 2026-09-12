(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};
  let requestId = 0;

  const COLUMN_COUNT = 5;

  function getElements() {
    return {
      form: document.getElementById("bitacora-filtros"),
      fechaDesde: document.getElementById("bitacora-fecha-desde"),
      fechaHasta: document.getElementById("bitacora-fecha-hasta"),
      limpiar: document.getElementById("bitacora-limpiar"),
      tbody: document.getElementById("bitacora-tbody"),
      message: document.getElementById("bitacora-message")
    };
  }

  function getMensajeError(error) {
    if (error && error.status === 403) {
      return "No tienes permisos para consultar la bitácora.";
    }

    if (error && error.data && error.data.mensaje) {
      return error.data.mensaje;
    }

    if (error && error.isNetworkError) {
      return "No se pudo conectar con el servidor.";
    }

    return "No se pudo consultar la bitácora.";
  }

  function setLoading(elements, isLoading) {
    [elements.fechaDesde, elements.fechaHasta, elements.limpiar].forEach(function (control) {
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

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    const parts = new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date).reduce(function (accumulator, part) {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

    return [
      parts.day,
      parts.month,
      parts.year
    ].join("/") + " " + [
      parts.hour,
      parts.minute
    ].join(":");
  }

  function getBadgeClass(accion) {
    if (accion === "CANCELAR") {
      return "badge badge-danger";
    }

    if (accion === "MODIFICAR") {
      return "badge badge-warning";
    }

    return "badge";
  }

  function renderUsuario(registro) {
    const nombre = registro.usuario || "Usuario " + registro.id_usuario;
    const correo = registro.usuario_correo || "";

    return [
      '<strong class="bitacora-primary-text">' + App.ui.escapeHtml(nombre) + "</strong>",
      correo ? '<span class="bitacora-secondary-text">' + App.ui.escapeHtml(correo) + "</span>" : ""
    ].join("");
  }

  function renderReservacion(registro) {
    const codigo = registro.codigo_reservacion || "";
    const idReservacion = registro.id_reservacion ? "#" + registro.id_reservacion : "-";

    return [
      '<strong class="bitacora-primary-text">' + App.ui.escapeHtml(codigo || idReservacion) + "</strong>",
      codigo && registro.id_reservacion
        ? '<span class="bitacora-secondary-text">ID ' + App.ui.escapeHtml(registro.id_reservacion) + "</span>"
        : ""
    ].join("");
  }

  function renderRows(registros) {
    if (!Array.isArray(registros) || registros.length === 0) {
      return renderStatusRow("No hay registros en la bitácora.", "Ajusta el rango de fechas o vuelve cuando existan movimientos auditados.");
    }

    return registros.map(function (registro) {
      const accion = registro.accion || "-";

      return [
        "<tr>",
        "<td>" + App.ui.escapeHtml(formatDateTime(registro.fecha)) + "</td>",
        "<td>" + renderUsuario(registro) + "</td>",
        '<td><span class="' + getBadgeClass(accion) + '">' + App.ui.escapeHtml(accion) + "</span></td>",
        "<td>" + renderReservacion(registro) + "</td>",
        '<td class="bitacora-description-cell">' + App.ui.escapeHtml(registro.descripcion || "-") + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function buildQuery(elements) {
    const params = new URLSearchParams();

    if (elements.fechaDesde && elements.fechaDesde.value) {
      params.set("fecha_desde", elements.fechaDesde.value);
    }

    if (elements.fechaHasta && elements.fechaHasta.value) {
      params.set("fecha_hasta", elements.fechaHasta.value);
    }

    const query = params.toString();

    return query ? "?" + query : "";
  }

  async function loadBitacora() {
    const currentRequestId = requestId + 1;
    requestId = currentRequestId;

    const elements = getElements();

    if (!elements.tbody) {
      return;
    }

    elements.tbody.innerHTML = renderStatusRow("Cargando bitácora", "Consultando registros reales del backend.");
    elements.message.textContent = "";
    elements.message.className = "form-message bitacora-message";
    setLoading(elements, true);

    try {
      const response = await App.api.apiFetch("/api/bitacora" + buildQuery(elements));

      if (currentRequestId !== requestId || window.location.hash !== "#/bitacora") {
        return;
      }

      elements.tbody.innerHTML = renderRows(response && response.datos);
      elements.message.textContent = response && typeof response.total === "number"
        ? response.total + " registros encontrados."
        : "";
      elements.message.className = "form-message bitacora-message is-info";
    } catch (error) {
      if (currentRequestId !== requestId || window.location.hash !== "#/bitacora") {
        return;
      }

      const message = getMensajeError(error);

      elements.tbody.innerHTML = renderStatusRow("No se pudo cargar la bitácora", message);
      elements.message.textContent = message;
      elements.message.className = "form-message bitacora-message is-error";
    } finally {
      if (currentRequestId === requestId && window.location.hash === "#/bitacora") {
        setLoading(elements, false);
      }
    }
  }

  App.pages.bitacora = {
    adminOnly: true,
    title: "Bitácora",
    subtitle: "Registro de auditoría del sistema",
    render: function () {
      return [
        '<section class="page bitacora-page">',
        '<form class="filter-bar bitacora-filter-bar" id="bitacora-filtros">',
        '<label class="field" for="bitacora-fecha-desde"><span class="field-label">Fecha desde</span><input class="input" id="bitacora-fecha-desde" name="fecha_desde" type="date"></label>',
        '<label class="field" for="bitacora-fecha-hasta"><span class="field-label">Fecha hasta</span><input class="input" id="bitacora-fecha-hasta" name="fecha_hasta" type="date"></label>',
        '<div class="bitacora-filter-actions">',
        '<button class="btn btn-primary" type="submit">Aplicar filtros</button>',
        '<button class="btn btn-ghost" id="bitacora-limpiar" type="button">Limpiar</button>',
        "</div>",
        '<p class="form-message bitacora-message" id="bitacora-message" aria-live="polite"></p>',
        "</form>",
        '<div class="table-container bitacora-table-container">',
        '<table class="data-table bitacora-table">',
        "<thead><tr>",
        '<th scope="col">Fecha / hora</th>',
        '<th scope="col">Usuario</th>',
        '<th scope="col">Acción</th>',
        '<th scope="col">Reservación</th>',
        '<th scope="col">Descripción / cambios</th>',
        "</tr></thead>",
        '<tbody id="bitacora-tbody">',
        renderStatusRow("Cargando bitácora", "Consultando registros reales del backend."),
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
        loadBitacora();
      });

      elements.limpiar.addEventListener("click", function () {
        elements.fechaDesde.value = "";
        elements.fechaHasta.value = "";
        loadBitacora();
      });

      loadBitacora();
    }
  };
})();
