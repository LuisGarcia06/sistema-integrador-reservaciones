(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  const COLUMN_COUNT = 5;
  const FORM_MODE_CREATE = "create";
  const FORM_MODE_EDIT = "edit";
  const FORM_MODE_PASSWORD = "password";

  let requestId = 0;
  let usuarios = [];
  let roles = [];
  let submitLoading = false;
  let actionLoadingId = null;
  let selectedUsuario = null;

  function getElements() {
    return {
      filtroTexto: document.getElementById("usuarios-busqueda"),
      filtroRol: document.getElementById("usuarios-rol"),
      filtroEstado: document.getElementById("usuarios-estado"),
      limpiar: document.getElementById("usuarios-limpiar"),
      nuevo: document.getElementById("usuarios-nuevo"),
      tbody: document.getElementById("usuarios-tbody"),
      message: document.getElementById("usuarios-message"),
      dialogHost: document.getElementById("usuarios-dialog-host")
    };
  }

  function getArrayResponse(response) {
    return response && Array.isArray(response.datos) ? response.datos : [];
  }

  function getUsuarioId(usuario) {
    return Number(usuario && usuario.id_usuario);
  }

  function getUsuarioAutenticado() {
    return App.auth && App.auth.obtenerUsuario ? App.auth.obtenerUsuario() : null;
  }

  function isOwnUsuario(usuario) {
    const autenticado = getUsuarioAutenticado();

    return Boolean(autenticado && usuario && Number(autenticado.id_usuario) === getUsuarioId(usuario));
  }

  function isOwnAdminUsuario(usuario) {
    return Boolean(isOwnUsuario(usuario) && App.auth && App.auth.esAdministrador && App.auth.esAdministrador());
  }

  function getRoleNameById(idRol) {
    const id = Number(idRol);
    const rol = roles.find(function (item) {
      return Number(item.id_rol) === id;
    });

    return rol ? rol.nombre : "";
  }

  function escapeValue(value) {
    if (value === null || value === undefined || value === "") {
      return App.ui.escapeHtml("-");
    }

    return App.ui.escapeHtml(value);
  }

  function getMensajeError(error, fallback) {
    if (error && error.status === 403) {
      return "No tienes permisos para administrar usuarios.";
    }

    if (error && error.status === 404) {
      return "Usuario no encontrado.";
    }

    if (error && error.status === 409) {
      return error.data && error.data.mensaje
        ? error.data.mensaje
        : "Ya existe un usuario con ese correo.";
    }

    if (error && error.data && error.data.mensaje) {
      return error.data.mensaje;
    }

    if (error && error.isNetworkError) {
      return "No se pudo conectar con el servidor.";
    }

    return fallback || "No se pudo completar la operación.";
  }

  function setMessage(text, type) {
    const message = document.getElementById("usuarios-message");

    if (!message) {
      return;
    }

    message.textContent = text || "";
    message.className = "form-message usuarios-message" + (type ? " " + type : "");
  }

  function setLoading(isLoading) {
    const elements = getElements();

    [
      elements.filtroTexto,
      elements.filtroRol,
      elements.filtroEstado,
      elements.limpiar,
      elements.nuevo
    ].forEach(function (control) {
      if (control) {
        control.disabled = isLoading || Boolean(actionLoadingId);
      }
    });

    document.querySelectorAll("[data-usuarios-action]").forEach(function (button) {
      button.disabled = isLoading || Boolean(actionLoadingId);
    });
  }

  function renderStatusRow(title, text) {
    return [
      '<tr><td colspan="' + COLUMN_COUNT + '">',
      App.ui.emptyState(title, text),
      "</td></tr>"
    ].join("");
  }

  function renderRoleOptions(selectedValue, includeAll) {
    const selected = selectedValue === null || selectedValue === undefined ? "" : String(selectedValue);
    const options = includeAll
      ? ['<option value="">Todos</option>']
      : ['<option value="">Selecciona un rol</option>'];

    roles.forEach(function (rol) {
      const value = String(rol.id_rol);
      options.push(
        '<option value="' + App.ui.escapeHtml(value) + '"' + (selected === value ? " selected" : "") + ">" +
        App.ui.escapeHtml(rol.nombre) +
        "</option>"
      );
    });

    return options.join("");
  }

  function getEstadoBadgeClass(estado) {
    return estado ? "badge" : "badge badge-neutral";
  }

  function renderRows(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return renderStatusRow("No hay usuarios para mostrar.", "Ajusta los filtros o crea un usuario nuevo.");
    }

    return data.map(function (usuario) {
      const idUsuario = getUsuarioId(usuario);
      const estadoActivo = usuario.estado === true;
      const estadoTexto = estadoActivo ? "Activo" : "Inactivo";
      const toggleText = estadoActivo ? "Desactivar" : "Activar";
      const disableOwnAdminToggle = isOwnAdminUsuario(usuario) && estadoActivo;

      return [
        "<tr>",
        "<td><strong>" + escapeValue(usuario.nombre) + "</strong></td>",
        "<td>" + escapeValue(usuario.correo) + "</td>",
        "<td>" + escapeValue(usuario.rol) + "</td>",
        '<td><span class="' + getEstadoBadgeClass(estadoActivo) + '">' + App.ui.escapeHtml(estadoTexto) + "</span></td>",
        '<td><div class="usuarios-row-actions">',
        '<button class="btn" type="button" data-usuarios-action="edit" data-id="' + App.ui.escapeHtml(idUsuario) + '">Editar</button>',
        '<button class="btn" type="button" data-usuarios-action="password" data-id="' + App.ui.escapeHtml(idUsuario) + '">Cambiar contraseña</button>',
        '<button class="btn btn-ghost" type="button" data-usuarios-action="toggle" data-id="' + App.ui.escapeHtml(idUsuario) + '"' + (disableOwnAdminToggle ? ' disabled title="No puedes desactivar tu propia cuenta de Administrador."' : "") + ">" + App.ui.escapeHtml(toggleText) + "</button>",
        "</div></td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function enforceOwnAdminRowControls() {
    const usuarioAutenticado = getUsuarioAutenticado();

    if (!usuarioAutenticado || !App.auth || !App.auth.esAdministrador()) {
      return;
    }

    document.querySelectorAll('[data-usuarios-action="toggle"]').forEach(function (button) {
      if (Number(button.dataset.id) !== Number(usuarioAutenticado.id_usuario)) {
        return;
      }

      button.disabled = true;
      button.title = "No puedes desactivar tu propia cuenta de Administrador.";
    });
  }

  function findUsuario(idUsuario) {
    const id = Number(idUsuario);

    return usuarios.find(function (usuario) {
      return getUsuarioId(usuario) === id;
    }) || null;
  }

  function getFilteredUsuarios() {
    const textoInput = document.getElementById("usuarios-busqueda");
    const rolInput = document.getElementById("usuarios-rol");
    const estadoInput = document.getElementById("usuarios-estado");
    const texto = textoInput ? textoInput.value.trim().toLowerCase() : "";
    const idRol = rolInput ? rolInput.value : "";
    const estado = estadoInput ? estadoInput.value : "";

    return usuarios.filter(function (usuario) {
      const nombre = String(usuario.nombre || "").toLowerCase();
      const correo = String(usuario.correo || "").toLowerCase();
      const rol = String(usuario.rol || "").toLowerCase();

      if (texto && !nombre.includes(texto) && !correo.includes(texto) && !rol.includes(texto)) {
        return false;
      }

      if (idRol && String(usuario.id_rol) !== idRol) {
        return false;
      }

      if (estado === "activo" && usuario.estado !== true) {
        return false;
      }

      if (estado === "inactivo" && usuario.estado !== false) {
        return false;
      }

      return true;
    });
  }

  function renderUsuarios() {
    const elements = getElements();

    if (!elements.tbody) {
      return;
    }

    const filtrados = getFilteredUsuarios();

    elements.tbody.innerHTML = renderRows(filtrados);
    enforceOwnAdminRowControls();
    setLoading(false);

    if (usuarios.length > 0) {
      setMessage(filtrados.length + " de " + usuarios.length + " usuarios visibles.", "is-info");
    }
  }

  function renderRoleFilter() {
    const filtroRol = document.getElementById("usuarios-rol");

    if (filtroRol) {
      filtroRol.innerHTML = renderRoleOptions("", true);
    }
  }

  async function loadUsuarios() {
    const currentRequestId = requestId + 1;
    requestId = currentRequestId;

    const elements = getElements();

    if (!elements.tbody) {
      return;
    }

    elements.tbody.innerHTML = renderStatusRow("Cargando usuarios", "Consultando usuarios y roles reales del backend.");
    setMessage("", "");
    setLoading(true);

    try {
      const responses = await Promise.all([
        App.api.apiFetch("/api/usuarios"),
        App.api.apiFetch("/api/usuarios/roles")
      ]);

      if (currentRequestId !== requestId || window.location.hash !== "#/usuarios") {
        return;
      }

      usuarios = getArrayResponse(responses[0]);
      roles = getArrayResponse(responses[1]);
      renderRoleFilter();
      renderUsuarios();
    } catch (error) {
      if (currentRequestId !== requestId || window.location.hash !== "#/usuarios") {
        return;
      }

      const message = getMensajeError(error, "No se pudieron cargar los usuarios.");

      elements.tbody.innerHTML = renderStatusRow("No se pudo cargar usuarios", message);
      setMessage(message, "is-error");
    } finally {
      if (currentRequestId === requestId && window.location.hash === "#/usuarios") {
        setLoading(false);
      }
    }
  }

  function closeDialog() {
    if (submitLoading) {
      return;
    }

    selectedUsuario = null;

    const host = document.getElementById("usuarios-dialog-host");

    if (host) {
      host.innerHTML = "";
    }
  }

  function renderEstadoSelect(id, selectedValue, disabled) {
    const activo = selectedValue !== false;

    return [
      '<select class="input" id="' + App.ui.escapeHtml(id) + '" name="estado"' + (disabled ? ' disabled aria-describedby="usuarios-proteccion-propia"' : "") + '">',
      '<option value="true"' + (activo ? " selected" : "") + ">Activo</option>",
      '<option value="false"' + (!activo ? " selected" : "") + ">Inactivo</option>",
      "</select>"
    ].join("");
  }

  function renderUserDialog(mode, usuario) {
    const isEdit = mode === FORM_MODE_EDIT;
    const isPassword = mode === FORM_MODE_PASSWORD;
    const isOwnAdminEdit = isEdit && isOwnAdminUsuario(usuario);
    const disabledOwnAdminAttr = isOwnAdminEdit ? ' disabled aria-describedby="usuarios-proteccion-propia"' : "";
    const title = isEdit ? "Editar usuario" : (isPassword ? "Cambiar contraseña" : "Nuevo usuario");
    const formContent = isPassword
      ? [
        '<label class="field" for="usuario-password-nueva"><span class="field-label">Nueva contraseña</span><input class="input" id="usuario-password-nueva" name="password" type="password" autocomplete="new-password"></label>',
        '<label class="field" for="usuario-password-confirmar"><span class="field-label">Confirmar contraseña</span><input class="input" id="usuario-password-confirmar" type="password" autocomplete="new-password"></label>'
      ].join("")
      : [
        '<label class="field" for="usuario-nombre"><span class="field-label">Nombre</span><input class="input" id="usuario-nombre" name="nombre" type="text" maxlength="100" value="' + App.ui.escapeHtml(isEdit && usuario ? usuario.nombre : "") + '"></label>',
        '<label class="field" for="usuario-correo"><span class="field-label">Correo</span><input class="input" id="usuario-correo" name="correo" type="email" maxlength="100" autocomplete="off" value="' + App.ui.escapeHtml(isEdit && usuario ? usuario.correo : "") + '"></label>',
        '<label class="field" for="usuario-rol"><span class="field-label">Rol</span><select class="input" id="usuario-rol" name="id_rol"' + disabledOwnAdminAttr + ">" + renderRoleOptions(isEdit && usuario ? usuario.id_rol : "", false) + "</select></label>",
        '<label class="field" for="usuario-estado"><span class="field-label">Estado</span>' + renderEstadoSelect("usuario-estado", isEdit && usuario ? usuario.estado : true, isOwnAdminEdit) + "</label>",
        isEdit ? "" : '<label class="field usuarios-password-field" for="usuario-password"><span class="field-label">Contraseña</span><input class="input" id="usuario-password" name="password" type="password" autocomplete="new-password"></label>'
      ].join("");

    return [
      '<div class="usuarios-dialog-backdrop" id="usuarios-dialog" role="dialog" aria-modal="true" aria-labelledby="usuarios-dialog-title">',
      '<form class="card usuarios-form" id="usuarios-form" novalidate autocomplete="off">',
      '<div class="usuarios-form-header">',
      "<div>",
      '<h2 id="usuarios-dialog-title">' + App.ui.escapeHtml(title) + "</h2>",
      isPassword && usuario ? '<p class="card-text">' + App.ui.escapeHtml(usuario.nombre) + "</p>" : "",
      isOwnAdminEdit ? '<p class="card-text" id="usuarios-proteccion-propia">Tu cuenta de Administrador conserva rol y estado activos.</p>' : "",
      "</div>",
      '<button class="btn btn-ghost" id="usuarios-close" type="button" aria-label="Cerrar formulario">Cerrar</button>',
      "</div>",
      '<input type="hidden" id="usuarios-form-mode" value="' + App.ui.escapeHtml(mode) + '">',
      '<input type="hidden" id="usuarios-form-id" value="' + App.ui.escapeHtml(usuario ? getUsuarioId(usuario) : "") + '">',
      '<div class="usuarios-form-grid">',
      formContent,
      "</div>",
      '<p class="form-message" id="usuarios-form-message" role="status" aria-live="polite"></p>',
      '<div class="usuarios-form-actions">',
      '<button class="btn" id="usuarios-cancel" type="button">Cancelar</button>',
      '<button class="btn btn-primary" id="usuarios-submit" type="submit">Guardar</button>',
      "</div>",
      "</form>",
      "</div>"
    ].join("");
  }

  function openDialog(mode, usuario) {
    const host = document.getElementById("usuarios-dialog-host");

    if (!host || submitLoading || actionLoadingId) {
      return;
    }

    selectedUsuario = usuario || null;
    host.innerHTML = renderUserDialog(mode, usuario);
    bindFormEvents();

    const firstInput = host.querySelector("input:not([type='hidden']), select");

    if (firstInput) {
      firstInput.focus();
    }
  }

  function setFormMessage(text, type) {
    const message = document.getElementById("usuarios-form-message");

    if (!message) {
      return;
    }

    message.textContent = text || "";
    message.className = "form-message" + (type ? " " + type : "");
  }

  function setFormLoading(isLoading) {
    submitLoading = isLoading;

    document.querySelectorAll("#usuarios-form input, #usuarios-form select, #usuarios-form button").forEach(function (control) {
      control.disabled = isLoading;
    });

    const submit = document.getElementById("usuarios-submit");

    if (submit) {
      submit.textContent = isLoading ? "Guardando..." : "Guardar";
    }
  }

  function parseEstado(value) {
    return value === "true";
  }

  function buildUsuarioPayload(mode) {
    const errores = [];
    const nombreInput = document.getElementById("usuario-nombre");
    const correoInput = document.getElementById("usuario-correo");
    const rolInput = document.getElementById("usuario-rol");
    const estadoInput = document.getElementById("usuario-estado");
    const passwordInput = document.getElementById("usuario-password");
    const payload = {};

    if (!nombreInput || !correoInput || !rolInput || !estadoInput) {
      return {
        errores: ["No se pudo leer el formulario."],
        payload: null
      };
    }

    payload.nombre = nombreInput.value.trim();
    payload.correo = correoInput.value.trim().toLowerCase();
    payload.id_rol = Number(rolInput.value);
    payload.estado = parseEstado(estadoInput.value);

    if (!payload.nombre) {
      errores.push("Ingresa el nombre.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo)) {
      errores.push("Ingresa un correo válido.");
    }

    if (!Number.isInteger(payload.id_rol) || payload.id_rol <= 0) {
      errores.push("Selecciona un rol.");
    }

    if (mode === FORM_MODE_CREATE) {
      payload.password = passwordInput ? passwordInput.value : "";

      if (payload.password.length < 8) {
        errores.push("La contraseña debe tener al menos 8 caracteres.");
      }
    }

    return {
      errores: errores,
      payload: payload
    };
  }

  function getChangedUsuarioPayload(payload) {
    if (!selectedUsuario) {
      return payload;
    }

    const changed = {};

    if (payload.nombre !== selectedUsuario.nombre) {
      changed.nombre = payload.nombre;
    }

    if (payload.correo !== selectedUsuario.correo) {
      changed.correo = payload.correo;
    }

    if (Number(payload.id_rol) !== Number(selectedUsuario.id_rol)) {
      changed.id_rol = payload.id_rol;
    }

    if (payload.estado !== selectedUsuario.estado) {
      changed.estado = payload.estado;
    }

    return changed;
  }

  function buildPasswordPayload() {
    const passwordInput = document.getElementById("usuario-password-nueva");
    const confirmarInput = document.getElementById("usuario-password-confirmar");
    const password = passwordInput ? passwordInput.value : "";
    const confirmar = confirmarInput ? confirmarInput.value : "";
    const errores = [];

    if (password.length < 8) {
      errores.push("La contraseña debe tener al menos 8 caracteres.");
    }

    if (password !== confirmar) {
      errores.push("La confirmación no coincide.");
    }

    return {
      errores: errores,
      payload: {
        password: password
      }
    };
  }

  async function submitUsuarioForm(event) {
    event.preventDefault();

    if (submitLoading) {
      return;
    }

    const modeInput = document.getElementById("usuarios-form-mode");
    const idInput = document.getElementById("usuarios-form-id");
    const mode = modeInput ? modeInput.value : "";
    const idUsuario = idInput ? Number(idInput.value) : null;
    const data = mode === FORM_MODE_PASSWORD ? buildPasswordPayload() : buildUsuarioPayload(mode);

    if (data.errores.length > 0) {
      setFormMessage(data.errores.join(" "), "is-error");
      return;
    }

    if (mode === FORM_MODE_EDIT && isOwnAdminUsuario(selectedUsuario)) {
      if (data.payload.estado === false) {
        setFormMessage("No puedes desactivar tu propia cuenta de Administrador.", "is-error");
        return;
      }

      if (getRoleNameById(data.payload.id_rol) !== "Administrador") {
        setFormMessage("No puedes cambiar tu propio rol de Administrador.", "is-error");
        return;
      }
    }

    const payload = mode === FORM_MODE_EDIT
      ? getChangedUsuarioPayload(data.payload)
      : data.payload;

    if (mode === FORM_MODE_EDIT && Object.keys(payload).length === 0) {
      setFormMessage("No hay cambios por guardar.", "is-info");
      return;
    }

    setFormMessage("", "");
    setFormLoading(true);

    try {
      if (mode === FORM_MODE_CREATE) {
        await App.api.apiFetch("/api/usuarios", {
          method: "POST",
          body: payload
        });
      } else if (mode === FORM_MODE_EDIT) {
        await App.api.apiFetch("/api/usuarios/" + encodeURIComponent(idUsuario), {
          method: "PATCH",
          body: payload
        });
      } else if (mode === FORM_MODE_PASSWORD) {
        await App.api.apiFetch("/api/usuarios/" + encodeURIComponent(idUsuario) + "/password", {
          method: "PATCH",
          body: payload
        });
      }

      setFormLoading(false);
      closeDialog();
      await loadUsuarios();
      setMessage("Usuario guardado correctamente.", "is-info");
    } catch (error) {
      setFormMessage(getMensajeError(error, "No se pudo guardar el usuario."), "is-error");
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleUsuario(usuario) {
    if (!usuario || actionLoadingId) {
      return;
    }

    const idUsuario = getUsuarioId(usuario);
    const nextEstado = usuario.estado !== true;

    if (!nextEstado && !window.confirm("¿Desactivar este usuario? No podrá iniciar sesión mientras esté inactivo.")) {
      return;
    }

    actionLoadingId = idUsuario;
    setLoading(true);
    setMessage("", "");

    try {
      await App.api.apiFetch("/api/usuarios/" + encodeURIComponent(idUsuario), {
        method: "PATCH",
        body: {
          estado: nextEstado
        }
      });

      await loadUsuarios();
      setMessage(nextEstado ? "Usuario activado correctamente." : "Usuario desactivado correctamente.", "is-info");
    } catch (error) {
      setMessage(getMensajeError(error, "No se pudo cambiar el estado del usuario."), "is-error");
    } finally {
      actionLoadingId = null;
      setLoading(false);
    }
  }

  function handleActionClick(event) {
    const button = event.target.closest ? event.target.closest("[data-usuarios-action]") : null;

    if (!button || submitLoading || actionLoadingId) {
      return;
    }

    const usuario = findUsuario(button.dataset.id);

    if (!usuario) {
      setMessage("Usuario no encontrado en el listado actual.", "is-error");
      return;
    }

    if (button.dataset.usuariosAction === "edit") {
      openDialog(FORM_MODE_EDIT, usuario);
      return;
    }

    if (button.dataset.usuariosAction === "password") {
      openDialog(FORM_MODE_PASSWORD, usuario);
      return;
    }

    if (button.dataset.usuariosAction === "toggle") {
      if (isOwnAdminUsuario(usuario) && usuario.estado === true) {
        setMessage("No puedes desactivar tu propia cuenta de Administrador.", "is-error");
        return;
      }

      toggleUsuario(usuario);
    }
  }

  function bindFormEvents() {
    const form = document.getElementById("usuarios-form");
    const close = document.getElementById("usuarios-close");
    const cancel = document.getElementById("usuarios-cancel");

    if (form) {
      form.addEventListener("submit", submitUsuarioForm);
    }

    [close, cancel].forEach(function (button) {
      if (button) {
        button.addEventListener("click", closeDialog);
      }
    });
  }

  function bindPageEvents() {
    const elements = getElements();

    [elements.filtroTexto, elements.filtroRol, elements.filtroEstado].forEach(function (control) {
      if (control) {
        control.addEventListener("input", renderUsuarios);
        control.addEventListener("change", renderUsuarios);
      }
    });

    if (elements.limpiar) {
      elements.limpiar.addEventListener("click", function () {
        if (elements.filtroTexto) {
          elements.filtroTexto.value = "";
        }

        if (elements.filtroRol) {
          elements.filtroRol.value = "";
        }

        if (elements.filtroEstado) {
          elements.filtroEstado.value = "";
        }

        renderUsuarios();
      });
    }

    if (elements.nuevo) {
      elements.nuevo.addEventListener("click", function () {
        openDialog(FORM_MODE_CREATE, null);
      });
    }

    if (elements.tbody) {
      elements.tbody.addEventListener("click", handleActionClick);
    }
  }

  App.pages.usuarios = {
    adminOnly: true,
    title: "Usuarios",
    subtitle: "Administración segura de cuentas y roles",
    render: function () {
      return [
        '<section class="page usuarios-page">',
        '<div class="filter-bar usuarios-filter-bar">',
        '<label class="field" for="usuarios-busqueda"><span class="field-label">Búsqueda</span><input class="input" id="usuarios-busqueda" type="search" placeholder="Nombre, correo o rol"></label>',
        '<label class="field" for="usuarios-rol"><span class="field-label">Rol</span><select class="input" id="usuarios-rol"><option value="">Todos</option></select></label>',
        '<label class="field" for="usuarios-estado"><span class="field-label">Estado</span><select class="input" id="usuarios-estado"><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></label>',
        '<div class="usuarios-filter-actions">',
        '<button class="btn btn-ghost" id="usuarios-limpiar" type="button">Limpiar</button>',
        '<button class="btn btn-primary" id="usuarios-nuevo" type="button">Nuevo usuario</button>',
        "</div>",
        '<p class="form-message usuarios-message" id="usuarios-message" role="status" aria-live="polite"></p>',
        "</div>",
        '<div class="table-container usuarios-table-container">',
        '<table class="data-table usuarios-table">',
        "<thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>",
        '<tbody id="usuarios-tbody">',
        renderStatusRow("Cargando usuarios", "Consultando usuarios y roles reales del backend."),
        "</tbody>",
        "</table>",
        "</div>",
        '<div id="usuarios-dialog-host"></div>',
        "</section>"
      ].join("");
    },
    afterRender: function () {
      requestId += 1;
      usuarios = [];
      roles = [];
      submitLoading = false;
      actionLoadingId = null;
      selectedUsuario = null;

      bindPageEvents();
      loadUsuarios();
    }
  };
})();
