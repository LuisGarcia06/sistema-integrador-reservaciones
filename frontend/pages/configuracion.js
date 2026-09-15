(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const EMPTY_VALUE = "—";
  const CATALOG_TOURS = "tours";
  const CATALOG_GUIAS = "guias";
  const CATALOG_OPERADORES = "operadores";
  const CATALOG_VEHICULOS = "vehiculos";
  const CATALOG_PAISES = "paises";
  const CATALOG_PLATAFORMAS = "plataformas";
  const FORM_CREATE = "create";
  const FORM_EDIT = "edit";

  const catalogos = {
    tours: {
      key: CATALOG_TOURS,
      label: "Tours",
      single: "tour",
      endpoint: "/api/tours",
      idField: "id_tour",
      statusField: "activo",
      writable: true,
      emptyTitle: "No hay tours registrados.",
      emptyText: "Crea tours para usarlos en reservaciones y operaciones.",
      newLabel: "Nuevo tour",
      columns: ["Nombre", "Descripción", "Estado", "Acciones"]
    },
    guias: {
      key: CATALOG_GUIAS,
      label: "Guías",
      single: "guía",
      endpoint: "/api/guias",
      idField: "id_guia",
      statusField: "estado",
      writable: true,
      emptyTitle: "No hay guías registrados.",
      emptyText: "Crea guías para asignarlos a operaciones.",
      newLabel: "Nuevo guía",
      columns: ["Nombre", "Estado", "Acciones"]
    },
    operadores: {
      key: CATALOG_OPERADORES,
      label: "Operadores",
      single: "operador",
      endpoint: "/api/operadores",
      idField: "id_operador",
      statusField: "estado",
      writable: true,
      emptyTitle: "No hay operadores registrados.",
      emptyText: "Crea operadores para asignarlos a transportes.",
      newLabel: "Nuevo operador",
      columns: ["Nombre", "Estado", "Acciones"]
    },
    vehiculos: {
      key: CATALOG_VEHICULOS,
      label: "Vehículos",
      single: "vehículo",
      endpoint: "/api/vehiculos",
      idField: "id_vehiculo",
      statusField: "estado",
      writable: true,
      emptyTitle: "No hay vehículos registrados.",
      emptyText: "Crea vehículos para asignarlos a transportes.",
      newLabel: "Nuevo vehículo",
      columns: ["Identificador", "Placas", "Color", "Capacidad", "Estado", "Acciones"]
    },
    paises: {
      key: CATALOG_PAISES,
      label: "Países",
      single: "país",
      endpoint: "/api/paises",
      idField: "id_pais",
      writable: false,
      emptyTitle: "No hay países registrados.",
      emptyText: "Catálogo administrado de forma controlada.",
      columns: ["ID", "Nombre"]
    },
    plataformas: {
      key: CATALOG_PLATAFORMAS,
      label: "Plataformas",
      single: "plataforma",
      endpoint: "/api/plataformas",
      idField: "id_plataforma",
      writable: false,
      emptyTitle: "No hay plataformas registradas.",
      emptyText: "Catálogo interno administrado de forma controlada.",
      columns: ["ID", "Nombre"]
    }
  };

  const catalogOrder = [
    CATALOG_TOURS,
    CATALOG_GUIAS,
    CATALOG_OPERADORES,
    CATALOG_VEHICULOS,
    CATALOG_PAISES,
    CATALOG_PLATAFORMAS
  ];

  let activeCatalogKey = CATALOG_TOURS;
  let records = [];
  let searchText = "";
  let loadRequestId = 0;
  let loading = false;
  let saving = false;
  let selectedRecord = null;
  let selectedMode = FORM_CREATE;

  function isAdmin() {
    return Boolean(App.auth && App.auth.esAdministrador && App.auth.esAdministrador());
  }

  function escapeHtml(value) {
    return App.ui.escapeHtml(value === null || value === undefined || value === "" ? EMPTY_VALUE : value);
  }

  function getConfig() {
    return catalogos[activeCatalogKey];
  }

  function getArrayResponse(response) {
    return Array.isArray(response && response.datos) ? response.datos : [];
  }

  function getRecordId(record, config) {
    return record && record[config.idField] !== null && record[config.idField] !== undefined
      ? String(record[config.idField])
      : "";
  }

  function getStatusValue(record, config) {
    return Boolean(record && config.statusField && record[config.statusField] === true);
  }

  function getStatusBadge(record, config) {
    if (!config.statusField) {
      return "";
    }

    const active = getStatusValue(record, config);

    return '<span class="' + (active ? "badge" : "badge-neutral") + '">' +
      (active ? "Activo" : "Inactivo") +
      "</span>";
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

  function setMessage(text, type) {
    const element = document.getElementById("catalogos-message");

    if (!element) {
      return;
    }

    element.textContent = text || "";
    element.className = "form-message catalogos-message" + (type ? " " + type : "");
  }

  function setFormMessage(text, type) {
    const element = document.getElementById("catalogo-form-message");

    if (!element) {
      return;
    }

    element.textContent = text || "";
    element.className = "form-message" + (type ? " " + type : "");
  }

  function setSaving(isSaving) {
    saving = isSaving;

    document.querySelectorAll("#catalogo-form input, #catalogo-form textarea, #catalogo-form button").forEach(function (control) {
      control.disabled = isSaving;
    });

    const submit = document.getElementById("catalogo-submit");

    if (submit) {
      submit.textContent = isSaving ? "Guardando..." : "Guardar";
    }
  }

  function renderTabs() {
    return catalogOrder.map(function (key) {
      const config = catalogos[key];
      const active = key === activeCatalogKey;

      return [
        '<button class="btn catalogos-tab' + (active ? " is-active" : "") + '" type="button" data-catalog-tab="' + App.ui.escapeHtml(key) + '" aria-pressed="' + String(active) + '">',
        escapeHtml(config.label),
        "</button>"
      ].join("");
    }).join("");
  }

  function updateTabs() {
    document.querySelectorAll("[data-catalog-tab]").forEach(function (button) {
      const active = button.dataset.catalogTab === activeCatalogKey;

      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderToolbar(config) {
    return [
      '<div class="catalogos-toolbar">',
      '<label class="field catalogos-search-field" for="catalogos-search">',
      '<span class="field-label">Buscar</span>',
      '<input class="input" id="catalogos-search" type="search" maxlength="120" value="' + App.ui.escapeHtml(searchText) + '" placeholder="Buscar en ' + App.ui.escapeHtml(config.label.toLowerCase()) + '">',
      "</label>",
      config.writable && isAdmin()
        ? '<button class="btn btn-primary" id="catalogos-new" type="button">' + escapeHtml(config.newLabel) + "</button>"
        : "",
      "</div>"
    ].join("");
  }

  function renderLoading(config) {
    return [
      '<tr><td colspan="' + config.columns.length + '">',
      App.ui.emptyState("Cargando " + config.label.toLowerCase(), "Consultando datos reales del backend."),
      "</td></tr>"
    ].join("");
  }

  function renderError(config, message) {
    return [
      '<tr><td colspan="' + config.columns.length + '">',
      App.ui.emptyState("No se pudo cargar el catálogo", message),
      "</td></tr>"
    ].join("");
  }

  function recordMatches(record, config) {
    const text = searchText.trim().toLowerCase();

    if (!text) {
      return true;
    }

    const valuesByCatalog = {
      tours: [record.nombre, record.descripcion],
      guias: [record.nombre],
      operadores: [record.nombre],
      vehiculos: [record.identificador, record.placas, record.color, record.capacidad],
      paises: [record.id_pais, record.nombre],
      plataformas: [record.id_plataforma, record.nombre]
    };

    return (valuesByCatalog[config.key] || []).some(function (value) {
      return String(value === null || value === undefined ? "" : value).toLowerCase().includes(text);
    });
  }

  function getFilteredRecords(config) {
    return records.filter(function (record) {
      return recordMatches(record, config);
    });
  }

  function renderActions(record, config) {
    if (!config.writable || !isAdmin()) {
      return "";
    }

    const id = getRecordId(record, config);
    const active = getStatusValue(record, config);

    return [
      '<div class="catalogos-row-actions">',
      '<button class="btn" type="button" data-catalog-action="edit" data-id="' + App.ui.escapeHtml(id) + '">Editar</button>',
      '<button class="btn btn-ghost" type="button" data-catalog-action="toggle" data-id="' + App.ui.escapeHtml(id) + '">',
      active ? "Desactivar" : "Activar",
      "</button>",
      "</div>"
    ].join("");
  }

  function renderRow(record, config) {
    if (config.key === CATALOG_TOURS) {
      return [
        "<tr>",
        "<td><strong>" + escapeHtml(record.nombre) + "</strong></td>",
        "<td>" + escapeHtml(record.descripcion) + "</td>",
        "<td>" + getStatusBadge(record, config) + "</td>",
        "<td>" + renderActions(record, config) + "</td>",
        "</tr>"
      ].join("");
    }

    if (config.key === CATALOG_GUIAS || config.key === CATALOG_OPERADORES) {
      return [
        "<tr>",
        "<td><strong>" + escapeHtml(record.nombre) + "</strong></td>",
        "<td>" + getStatusBadge(record, config) + "</td>",
        "<td>" + renderActions(record, config) + "</td>",
        "</tr>"
      ].join("");
    }

    if (config.key === CATALOG_VEHICULOS) {
      return [
        "<tr>",
        "<td><strong>" + escapeHtml(record.identificador) + "</strong></td>",
        "<td>" + escapeHtml(record.placas) + "</td>",
        "<td>" + escapeHtml(record.color) + "</td>",
        "<td>" + escapeHtml(record.capacidad) + "</td>",
        "<td>" + getStatusBadge(record, config) + "</td>",
        "<td>" + renderActions(record, config) + "</td>",
        "</tr>"
      ].join("");
    }

    return [
      "<tr>",
      "<td>" + escapeHtml(getRecordId(record, config)) + "</td>",
      "<td><strong>" + escapeHtml(record.nombre) + "</strong></td>",
      "</tr>"
    ].join("");
  }

  function renderTable(config, rowsOverride) {
    const visibleRecords = getFilteredRecords(config);
    const header = config.columns.map(function (column) {
      return '<th scope="col">' + escapeHtml(column) + "</th>";
    }).join("");
    let body = rowsOverride;

    if (!body) {
      body = visibleRecords.length
        ? visibleRecords.map(function (record) {
          return renderRow(record, config);
        }).join("")
        : [
          '<tr><td colspan="' + config.columns.length + '">',
          App.ui.emptyState(config.emptyTitle, searchText.trim() ? "Ajusta la búsqueda para consultar otros registros." : config.emptyText),
          "</td></tr>"
        ].join("");
    }

    return [
      '<div class="table-container catalogos-table-container">',
      '<table class="data-table catalogos-table">',
      "<thead><tr>" + header + "</tr></thead>",
      '<tbody id="catalogos-tbody">' + body + "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function renderCatalogPanel(rowsOverride) {
    const config = getConfig();
    const readonlyNote = config.writable
      ? ""
      : '<p class="card-text catalogos-readonly-note">Catálogo administrado de forma controlada.</p>';

    return [
      '<section class="catalogos-panel" aria-labelledby="catalogos-title">',
      '<div class="catalogos-panel-header">',
      "<div>",
      '<p class="field-label">Catálogos</p>',
      '<h2 id="catalogos-title">' + escapeHtml(config.label) + "</h2>",
      readonlyNote,
      "</div>",
      renderToolbar(config),
      "</div>",
      '<p class="form-message catalogos-message" id="catalogos-message" role="status" aria-live="polite"></p>',
      renderTable(config, rowsOverride),
      '<div id="catalogos-dialog-host"></div>',
      "</section>"
    ].join("");
  }

  function renderPage(rowsOverride) {
    const host = document.getElementById("catalogos-host");

    if (!host) {
      return;
    }

    host.innerHTML = renderCatalogPanel(rowsOverride);
    updateTabs();
  }

  function setLoading(isLoading) {
    loading = isLoading;

    document.querySelectorAll("[data-catalog-tab], #catalogos-new, #catalogos-search").forEach(function (control) {
      control.disabled = isLoading;
    });
  }

  async function loadCatalog() {
    const config = getConfig();
    const activeRequestId = loadRequestId + 1;

    loadRequestId = activeRequestId;
    records = [];
    renderPage(renderLoading(config));
    bindCatalogEvents();
    setLoading(true);

    try {
      const response = await App.api.apiFetch(config.endpoint);

      if (activeRequestId !== loadRequestId) {
        return;
      }

      records = getArrayResponse(response);
      renderPage();
      bindCatalogEvents();
      setMessage(records.length + " registros consultados.", "is-info");
    } catch (error) {
      if (activeRequestId !== loadRequestId) {
        return;
      }

      const message = getBackendMessage(error, "No fue posible cargar el catálogo.");

      records = [];
      renderPage(renderError(config, message));
      bindCatalogEvents();
      setMessage(message, "is-error");
    } finally {
      if (activeRequestId === loadRequestId) {
        setLoading(false);
      }
    }
  }

  function findRecord(id) {
    const config = getConfig();

    return records.find(function (record) {
      return getRecordId(record, config) === String(id);
    });
  }

  function closeDialog() {
    if (saving) {
      return;
    }

    selectedRecord = null;
    selectedMode = FORM_CREATE;

    const host = document.getElementById("catalogos-dialog-host");

    if (host) {
      host.innerHTML = "";
    }
  }

  function checkboxField(id, label, checked) {
    return [
      '<label class="field catalogos-checkbox-field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<span class="catalogos-checkbox-control">',
      '<input id="' + App.ui.escapeHtml(id) + '" type="checkbox"' + (checked ? " checked" : "") + ">",
      '<span>Activo</span>',
      "</span>",
      "</label>"
    ].join("");
  }

  function textField(id, label, value, attrs) {
    return [
      '<label class="field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<input class="input" id="' + App.ui.escapeHtml(id) + '" value="' + App.ui.escapeHtml(value || "") + '" ' + (attrs || 'type="text"') + '>',
      "</label>"
    ].join("");
  }

  function textareaField(id, label, value) {
    return [
      '<label class="field catalogos-full-field" for="' + App.ui.escapeHtml(id) + '">',
      '<span class="field-label">' + App.ui.escapeHtml(label) + "</span>",
      '<textarea class="input catalogos-textarea" id="' + App.ui.escapeHtml(id) + '">' + App.ui.escapeHtml(value || "") + "</textarea>",
      "</label>"
    ].join("");
  }

  function renderFormFields(config, record) {
    const isCreate = selectedMode === FORM_CREATE;

    if (config.key === CATALOG_TOURS) {
      return [
        textField("catalogo-nombre", "Nombre *", record && record.nombre, 'type="text" maxlength="150"'),
        textareaField("catalogo-descripcion", "Descripción", record && record.descripcion),
        checkboxField("catalogo-activo", "Estado", isCreate ? true : getStatusValue(record, config))
      ].join("");
    }

    if (config.key === CATALOG_GUIAS || config.key === CATALOG_OPERADORES) {
      return [
        textField("catalogo-nombre", "Nombre *", record && record.nombre, 'type="text" maxlength="120"'),
        checkboxField("catalogo-activo", "Estado", isCreate ? true : getStatusValue(record, config))
      ].join("");
    }

    if (config.key === CATALOG_VEHICULOS) {
      return [
        textField("catalogo-identificador", "Identificador *", record && record.identificador, 'type="text" maxlength="50"'),
        textField("catalogo-placas", "Placas", record && record.placas, 'type="text" maxlength="20"'),
        textField("catalogo-color", "Color", record && record.color, 'type="text" maxlength="50"'),
        textField("catalogo-capacidad", "Capacidad *", record && record.capacidad, 'type="number" min="1" max="12" step="1"'),
        checkboxField("catalogo-activo", "Estado", isCreate ? true : getStatusValue(record, config))
      ].join("");
    }

    return "";
  }

  function renderDialog(config, mode, record) {
    const title = mode === FORM_EDIT
      ? "Editar " + config.single
      : "Nuevo " + config.single;

    return [
      '<div class="catalogos-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="catalogo-form-title">',
      '<form class="card catalogos-form" id="catalogo-form" novalidate>',
      '<div class="catalogos-form-header">',
      "<div>",
      '<h2 id="catalogo-form-title">' + escapeHtml(title) + "</h2>",
      '<p class="card-text">Los cambios se aplican al catálogo operativo.</p>',
      "</div>",
      '<button class="btn btn-ghost" id="catalogo-close" type="button" aria-label="Cerrar formulario">Cerrar</button>',
      "</div>",
      '<input type="hidden" id="catalogo-id" value="' + App.ui.escapeHtml(record ? getRecordId(record, config) : "") + '">',
      '<div class="catalogos-form-grid">',
      renderFormFields(config, record),
      "</div>",
      '<p class="form-message" id="catalogo-form-message" role="status" aria-live="polite"></p>',
      '<div class="catalogos-form-actions">',
      '<button class="btn" id="catalogo-cancel" type="button">Cancelar</button>',
      '<button class="btn btn-primary" id="catalogo-submit" type="submit">Guardar</button>',
      "</div>",
      "</form>",
      "</div>"
    ].join("");
  }

  function openDialog(mode, record) {
    const config = getConfig();
    const host = document.getElementById("catalogos-dialog-host");

    if (!host || !config.writable || !isAdmin() || loading || saving) {
      return;
    }

    selectedRecord = mode === FORM_EDIT ? record : null;
    selectedMode = mode;
    host.innerHTML = renderDialog(config, mode, record);
    bindDialogEvents();

    const first = host.querySelector("input:not([type='hidden']), textarea");

    if (first) {
      first.focus();
    }
  }

  function valueOf(id) {
    const element = document.getElementById(id);
    return element ? element.value : "";
  }

  function checkedOf(id) {
    const element = document.getElementById(id);
    return element ? element.checked : false;
  }

  function textOrNull(value) {
    const text = String(value || "").trim();
    return text || null;
  }

  function buildPayload(config) {
    const errores = [];
    let payload = {};

    if (config.key === CATALOG_TOURS) {
      payload = {
        nombre: valueOf("catalogo-nombre").trim(),
        descripcion: valueOf("catalogo-descripcion").trim(),
        activo: checkedOf("catalogo-activo")
      };

      if (!payload.nombre) {
        errores.push("Ingresa el nombre del tour.");
      }
    }

    if (config.key === CATALOG_GUIAS || config.key === CATALOG_OPERADORES) {
      payload = {
        nombre: valueOf("catalogo-nombre").trim(),
        estado: checkedOf("catalogo-activo")
      };

      if (!payload.nombre) {
        errores.push("Ingresa el nombre.");
      }
    }

    if (config.key === CATALOG_VEHICULOS) {
      const capacidad = Number(valueOf("catalogo-capacidad"));

      payload = {
        identificador: valueOf("catalogo-identificador").trim(),
        placas: textOrNull(valueOf("catalogo-placas")),
        color: textOrNull(valueOf("catalogo-color")),
        capacidad: capacidad,
        estado: checkedOf("catalogo-activo")
      };

      if (!payload.identificador) {
        errores.push("Ingresa el identificador.");
      }

      if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 12) {
        errores.push("La capacidad debe ser un entero entre 1 y 12.");
      }
    }

    return {
      errores: errores,
      payload: payload
    };
  }

  function normalizeValue(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number(value);
    }

    return value;
  }

  function getChangedPayload(payload) {
    if (!selectedRecord) {
      return payload;
    }

    const changed = {};

    Object.keys(payload).forEach(function (field) {
      if (normalizeValue(payload[field]) !== normalizeValue(selectedRecord[field])) {
        changed[field] = payload[field];
      }
    });

    return changed;
  }

  async function submitForm(event) {
    event.preventDefault();

    const config = getConfig();

    if (!config.writable || !isAdmin() || saving) {
      return;
    }

    const formData = buildPayload(config);

    if (formData.errores.length > 0) {
      setFormMessage(formData.errores.join(" "), "is-error");
      return;
    }

    const payload = selectedMode === FORM_EDIT
      ? getChangedPayload(formData.payload)
      : formData.payload;

    if (selectedMode === FORM_EDIT && Object.keys(payload).length === 0) {
      setFormMessage("No hay cambios por guardar.", "is-info");
      return;
    }

    setFormMessage("", "");
    setSaving(true);

    try {
      if (selectedMode === FORM_EDIT) {
        await App.api.apiFetch(config.endpoint + "/" + encodeURIComponent(getRecordId(selectedRecord, config)), {
          method: "PATCH",
          body: payload
        });
      } else {
        await App.api.apiFetch(config.endpoint, {
          method: "POST",
          body: payload
        });
      }

      const successMessage = selectedMode === FORM_EDIT
        ? "Registro actualizado correctamente."
        : "Registro creado correctamente.";

      setSaving(false);
      closeDialog();
      await loadCatalog();
      setMessage(successMessage, "is-info");
    } catch (error) {
      setFormMessage(getBackendMessage(error, "No fue posible guardar el registro."), "is-error");
      setSaving(false);
    }
  }

  async function toggleStatus(record) {
    const config = getConfig();

    if (!config.writable || !isAdmin() || !config.statusField || saving || loading) {
      return;
    }

    const active = getStatusValue(record, config);
    const target = !active;
    const action = target ? "activar" : "desactivar";

    if (!target && !window.confirm("El registro dejará de estar disponible para nuevas asignaciones, pero se conservará en información histórica.")) {
      return;
    }

    const body = {};
    body[config.statusField] = target;
    setLoading(true);
    setMessage("", "");

    try {
      await App.api.apiFetch(config.endpoint + "/" + encodeURIComponent(getRecordId(record, config)), {
        method: "PATCH",
        body: body
      });
      await loadCatalog();
      setMessage("Registro " + (target ? "activado" : "desactivado") + " correctamente.", "is-info");
    } catch (error) {
      setMessage(getBackendMessage(error, "No fue posible " + action + " el registro."), "is-error");
    } finally {
      setLoading(false);
    }
  }

  function bindDialogEvents() {
    const form = document.getElementById("catalogo-form");
    const close = document.getElementById("catalogo-close");
    const cancel = document.getElementById("catalogo-cancel");

    if (form) {
      form.addEventListener("submit", submitForm);
    }

    [close, cancel].forEach(function (button) {
      if (button) {
        button.addEventListener("click", closeDialog);
      }
    });
  }

  function bindCatalogEvents() {
    document.querySelectorAll("[data-catalog-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        const key = button.dataset.catalogTab;

        if (!catalogos[key] || key === activeCatalogKey || loading) {
          return;
        }

        activeCatalogKey = key;
        searchText = "";
        records = [];
        closeDialog();
        updateTabs();
        loadCatalog();
      });
    });

    const search = document.getElementById("catalogos-search");

    if (search) {
      search.addEventListener("input", function () {
        searchText = search.value;
        renderPage();
        bindCatalogEvents();
      });
    }

    const newButton = document.getElementById("catalogos-new");

    if (newButton) {
      newButton.addEventListener("click", function () {
        openDialog(FORM_CREATE, null);
      });
    }

    const tbody = document.getElementById("catalogos-tbody");

    if (tbody) {
      tbody.addEventListener("click", function (event) {
        const button = event.target.closest ? event.target.closest("[data-catalog-action]") : null;

        if (!button) {
          return;
        }

        const record = findRecord(button.dataset.id);

        if (!record) {
          setMessage("Registro no encontrado en el listado actual.", "is-error");
          return;
        }

        if (button.dataset.catalogAction === "edit") {
          openDialog(FORM_EDIT, record);
        }

        if (button.dataset.catalogAction === "toggle") {
          toggleStatus(record);
        }
      });
    }
  }

  App.pages.configuracion = {
    title: "Configuración",
    subtitle: "Catálogos operativos del sistema",
    render: function () {
      return [
        '<section class="page catalogos-page">',
        '<div class="catalogos-tabs" role="tablist" aria-label="Catálogos operativos">',
        renderTabs(),
        "</div>",
        '<div id="catalogos-host">',
        renderCatalogPanel(renderLoading(getConfig())),
        "</div>",
        "</section>"
      ].join("");
    },
    afterRender: function () {
      activeCatalogKey = CATALOG_TOURS;
      records = [];
      searchText = "";
      loadRequestId += 1;
      loading = false;
      saving = false;
      selectedRecord = null;
      selectedMode = FORM_CREATE;

      bindCatalogEvents();
      loadCatalog();
    }
  };
})();
