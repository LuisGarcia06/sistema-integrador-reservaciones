(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "--";
  const FORM_MODE_CREATE = "create";
  const FORM_MODE_EDIT = "edit";

  let operacionesRequestId = 0;
  let catalogosRequestId = 0;
  let currentFecha = "";
  let operaciones = [];
  let tours = [];
  let guias = [];
  let catalogosCargados = false;
  let catalogosLoading = false;
  let selectedOperacion = null;
  let submitLoading = false;

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

    return [
      "<tr>",
      "<td><strong>" + escapeHtml(formatTime(operacion && operacion.hora_inicio)) + "</strong></td>",
      '<td><span class="badge badge-neutral">' + escapeHtml(operacion && operacion.turno) + "</span></td>",
      "<td>" + escapeHtml(operacion && operacion.tour) + "</td>",
      "<td>" + escapeHtml(operacion && operacion.guia ? operacion.guia : "Sin guía asignada") + "</td>",
      '<td><span class="badge">' + escapeHtml(operacion && operacion.estado) + "</span></td>",
      isAdmin()
        ? '<td><button class="btn btn-ghost" type="button" data-edit-operacion="' + App.ui.escapeHtml(idOperacion) + '">Editar</button></td>'
        : "",
      "</tr>"
    ].join("");
  }

  function renderTable() {
    const headers = ["Hora", "Turno", "Tour", "Guía", "Estado"];
    const rows = operaciones.map(renderOperacionRow).join("");
    const headerCells = headers
      .concat(isAdmin() ? ["Acciones"] : [])
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

        if (createButton) {
          openForm(FORM_MODE_CREATE, null);
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
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const dateInput = document.getElementById("operaciones-fecha");
      const fecha = getLocalDateValue();

      operacionesRequestId += 1;
      catalogosRequestId += 1;
      currentFecha = "";
      operaciones = [];
      selectedOperacion = null;
      submitLoading = false;
      catalogosCargados = false;
      catalogosLoading = false;

      bindPageEvents();

      if (dateInput) {
        dateInput.value = fecha;
      }

      loadCatalogos();
      loadOperaciones(fecha);
    }
  };
})();
