(function () {
  const App = window.App = window.App || {};
  let token = null;
  let usuario = null;
  let mensajeSesion = "";

  async function iniciarSesion(correo, password) {
    const respuesta = await App.api.apiFetch("/api/auth/login", {
      method: "POST",
      auth: false,
      body: {
        correo: correo,
        password: password
      }
    });

    establecerSesion(respuesta.token, respuesta.usuario);

    return respuesta;
  }

  function cerrarSesion() {
    limpiarSesion();
    mensajeSesion = "";

    if (App.router) {
      App.router.navigate("login");
    }
  }

  function establecerSesion(nuevoToken, nuevoUsuario) {
    token = nuevoToken || null;
    usuario = nuevoUsuario || null;
    mensajeSesion = "";
  }

  function limpiarSesion() {
    token = null;
    usuario = null;
  }

  function obtenerToken() {
    return token;
  }

  function obtenerUsuario() {
    return usuario ? Object.assign({}, usuario) : null;
  }

  function estaAutenticado() {
    return Boolean(token && usuario);
  }

  function esAdministrador() {
    return Boolean(usuario && usuario.rol === "Administrador");
  }

  function esConsulta() {
    return Boolean(usuario && usuario.rol === "Consulta");
  }

  function establecerMensajeSesion(mensaje) {
    mensajeSesion = mensaje || "";
  }

  function consumirMensajeSesion() {
    const mensaje = mensajeSesion;
    mensajeSesion = "";
    return mensaje;
  }

  App.auth = {
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    establecerSesion: establecerSesion,
    limpiarSesion: limpiarSesion,
    obtenerToken: obtenerToken,
    obtenerUsuario: obtenerUsuario,
    estaAutenticado: estaAutenticado,
    esAdministrador: esAdministrador,
    esConsulta: esConsulta,
    establecerMensajeSesion: establecerMensajeSesion,
    consumirMensajeSesion: consumirMensajeSesion
  };
})();
