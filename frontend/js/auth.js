(function () {
  const App = window.App = window.App || {};
  let token = null;
  let usuario = null;
  let mensajeSesion = "";
  let version = 0;
  let renovacion = null;
  let timer = null;
  const solicitudes = new Set();

  function esUsuarioVerificado(value) {
    return Boolean(value && ["Administrador", "Consulta"].includes(value.rol)
      && ["all", "selected"].includes(value.alcance_plataformas)
      && Array.isArray(value.platform_ids)
      && value.platform_ids.every(function (id) { return Number.isInteger(id) && id > 0; }));
  }

  function firma(value) {
    return JSON.stringify(value && [value.id_usuario, value.nombre, value.rol,
      value.alcance_plataformas, value.platform_ids.slice().sort(function (a, b) { return a - b; })]);
  }

  function invalidarDatosSesion() {
    version += 1;
    solicitudes.forEach(function (controller) { controller.abort(); });
    solicitudes.clear();
    Object.values(App.pages || {}).forEach(function (page) {
      if (typeof page.resetSession === "function") page.resetSession();
    });
    ["page-root", "sidebar", "app-header"].forEach(function (id) {
      const element = document.getElementById(id);
      if (element) element.innerHTML = "";
    });
    document.body.classList.remove("is-printing-reservacion");
  }

  function iniciarRenovacionPeriodica() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(function () { refrescarSesion().catch(function () {}); }, 30000);
  }

  function establecerSesion(nuevoToken, nuevoUsuario) {
    limpiarSesion();
    if (!nuevoToken || !esUsuarioVerificado(nuevoUsuario)) {
      mensajeSesion = "No fue posible verificar el alcance de la sesión.";
      if (App.router) App.router.navigate("login");
      throw new Error(mensajeSesion);
    }
    token = nuevoToken;
    usuario = Object.assign({}, nuevoUsuario, { platform_ids: nuevoUsuario.platform_ids.slice() });
    mensajeSesion = "";
    iniciarRenovacionPeriodica();
  }

  function limpiarSesion() {
    token = null;
    usuario = null;
    renovacion = null;
    if (timer) window.clearInterval(timer);
    timer = null;
    invalidarDatosSesion();
  }

  async function iniciarSesion(correo, password) {
    const respuesta = await App.api.apiFetch("/api/auth/login", {
      method: "POST", auth: false, body: { correo: correo, password: password }
    });
    establecerSesion(respuesta.token, respuesta.usuario);
    return respuesta;
  }

  function cerrarSesion() {
    limpiarSesion();
    mensajeSesion = "";
    if (App.router) App.router.navigate("login");
  }

  function refrescarSesion() {
    if (!token) return Promise.reject(new Error("No hay sesión activa"));
    if (renovacion) return renovacion;
    const revision = version;
    const promise = (async function () {
      try {
        const respuesta = await App.api.apiFetch("/api/auth/sesion", { verificarSesion: false });
        if (revision !== version) throw new Error("Sesión anterior");
        if (!esUsuarioVerificado(respuesta && respuesta.usuario)) throw new Error("Permisos no verificados");
        const actualizada = respuesta.usuario;
        const cambio = firma(usuario) !== firma(actualizada);
        if (cambio) invalidarDatosSesion();
        usuario = Object.assign({}, actualizada, { platform_ids: actualizada.platform_ids.slice() });
        if (cambio) window.dispatchEvent(new Event("permisosactualizados"));
        return obtenerUsuario();
      } catch (error) {
        if (revision === version) {
          limpiarSesion();
          mensajeSesion = "No fue posible verificar tus permisos. Inicia sesión nuevamente.";
          if (App.router) App.router.navigate("login");
        }
        throw error;
      } finally {
        if (renovacion === promise) renovacion = null;
      }
    })();
    renovacion = promise;
    return promise;
  }

  function obtenerUsuario() {
    return usuario ? Object.assign({}, usuario, { platform_ids: usuario.platform_ids.slice() }) : null;
  }
  function estaAutenticado() { return Boolean(token && esUsuarioVerificado(usuario)); }
  function esAdministrador() { return estaAutenticado() && usuario.rol === "Administrador"; }
  function esConsulta() { return estaAutenticado() && usuario.rol === "Consulta"; }
  function esConsultaRestringida() { return esConsulta() && usuario.alcance_plataformas === "selected"; }
  function puedeAccederPagina(route) {
    if (!estaAutenticado()) return false;
    if (esConsultaRestringida()) return ["dashboard", "reservaciones"].includes(route);
    return esAdministrador() || !["usuarios", "bitacora"].includes(route);
  }

  window.addEventListener("focus", function () { if (token) refrescarSesion().catch(function () {}); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && token) refrescarSesion().catch(function () {});
  });

  App.auth = {
    iniciarSesion: iniciarSesion, cerrarSesion: cerrarSesion, establecerSesion: establecerSesion,
    limpiarSesion: limpiarSesion, obtenerToken: function () { return token; }, obtenerUsuario: obtenerUsuario,
    estaAutenticado: estaAutenticado, esAdministrador: esAdministrador, esConsulta: esConsulta,
    esConsultaRestringida: esConsultaRestringida, puedeAccederPagina: puedeAccederPagina,
    refrescarSesion: refrescarSesion, obtenerVersionSesion: function () { return version; },
    registrarSolicitud: function (controller) { solicitudes.add(controller); return function () { solicitudes.delete(controller); }; },
    establecerMensajeSesion: function (mensaje) { mensajeSesion = mensaje || ""; },
    consumirMensajeSesion: function () { const mensaje = mensajeSesion; mensajeSesion = ""; return mensaje; }
  };
})();
