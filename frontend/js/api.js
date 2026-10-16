(function () {
  const App = window.App = window.App || {};

  function createHttpError(response, data) {
    const error = new Error("HTTP " + response.status);
    error.status = response.status;
    error.data = data;
    error.isNetworkError = false;
    return error;
  }

  function createNetworkError() {
    const error = new Error("Network request failed");
    error.status = 0;
    error.data = null;
    error.isNetworkError = true;
    return error;
  }

  async function parseResponse(response) {
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    return text ? { mensaje: text } : null;
  }

  async function apiFetch(path, options) {
    const requestOptions = options || {};
    const headers = new Headers(requestOptions.headers || {});
    const shouldAttachAuth = requestOptions.auth !== false;
    const revision = App.auth ? App.auth.obtenerVersionSesion() : 0;
    const staleError = function () { const error = new Error('Respuesta de una sesión anterior'); error.isStaleSession = true; return error; };
    if (shouldAttachAuth && requestOptions.verificarSesion !== false && App.auth && App.auth.estaAutenticado()) {
      await App.auth.refrescarSesion();
      if (revision !== App.auth.obtenerVersionSesion()) throw staleError();
    }
    const currentToken = shouldAttachAuth && App.auth ? App.auth.obtenerToken() : null;
    const requestHadJwt = Boolean(currentToken);
    const fetchOptions = {
      method: requestOptions.method || "GET",
      headers: headers,
      credentials: "omit",
      cache: "no-store"
    };

    headers.set("Accept", "application/json");

    if (requestHadJwt) {
      headers.set("Authorization", "Bearer " + currentToken);
    }

    if (requestOptions.body !== undefined) {
      headers.set("Content-Type", "application/json");
      fetchOptions.body = typeof requestOptions.body === "string"
        ? requestOptions.body
        : JSON.stringify(requestOptions.body);
    }

    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    const unregister = App.auth ? App.auth.registrarSolicitud(controller) : function () {};
    let response;

    try {
      response = await fetch(path, fetchOptions);
      const data = await parseResponse(response);
      if (App.auth && revision !== App.auth.obtenerVersionSesion()) throw staleError();
      return await finishResponse(response, data);
    } catch (error) {
      if (error.isStaleSession || (App.auth && revision !== App.auth.obtenerVersionSesion())) throw staleError();
      if (error.status !== undefined) throw error;
      throw createNetworkError();
    } finally {
      unregister();
    }

    async function finishResponse(response, data) {
      if (!response.ok) {
        if (response.status === 401 && requestHadJwt && App.auth) {
          App.auth.limpiarSesion();
          App.auth.establecerMensajeSesion("Tu sesión terminó. Inicia sesión nuevamente.");
          if (App.router && window.location.hash !== "#/login") App.router.navigate("login");
        }
        throw createHttpError(response, data);
      }
      return data;
    }
  }

  App.api = {
    apiFetch: apiFetch
  };
})();
