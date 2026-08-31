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
    const currentToken = shouldAttachAuth && App.auth ? App.auth.obtenerToken() : null;
    const requestHadJwt = Boolean(currentToken);
    const fetchOptions = {
      method: requestOptions.method || "GET",
      headers: headers,
      credentials: "omit"
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

    let response;

    try {
      response = await fetch(path, fetchOptions);
    } catch (error) {
      throw createNetworkError();
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      if (response.status === 401 && requestHadJwt && App.auth) {
        App.auth.limpiarSesion();
        App.auth.establecerMensajeSesion("Tu sesión terminó. Inicia sesión nuevamente.");

        if (App.router && window.location.hash !== "#/login") {
          App.router.navigate("login");
        }
      }

      throw createHttpError(response, data);
    }

    return data;
  }

  App.api = {
    apiFetch: apiFetch
  };
})();
