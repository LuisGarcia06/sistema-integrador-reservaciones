(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  function getLoginMessage(error) {
    if (!error || error.isNetworkError || error.status >= 500) {
      return "No fue posible iniciar sesión. Intenta nuevamente.";
    }

    if (error.status === 400) {
      return "Revisa los datos del formulario.";
    }

    if (error.status === 401) {
      return "Correo o contraseña incorrectos.";
    }

    if (error.status === 403) {
      return "Usuario inactivo.";
    }

    return "No fue posible iniciar sesión. Intenta nuevamente.";
  }

  function setMessage(element, message, type) {
    element.textContent = message;
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-info", type === "info");
  }

  function setLoading(button, isLoading) {
    button.disabled = isLoading;
    button.textContent = isLoading ? "Iniciando sesión..." : "Iniciar sesión";
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const correoInput = document.getElementById("login-correo");
    const passwordInput = document.getElementById("login-password");
    const message = document.getElementById("login-message");
    const submitButton = document.getElementById("login-submit");

    if (!correoInput || !passwordInput || !message || !submitButton) {
      return;
    }

    const correo = correoInput.value.trim();
    const password = passwordInput.value;

    if (!correo || !password) {
      setMessage(message, "Ingresa correo y contraseña.", "error");
      return;
    }

    setMessage(message, "", "");
    setLoading(submitButton, true);

    try {
      await App.auth.iniciarSesion(correo, password);
      passwordInput.value = "";
      App.router.navigate("dashboard");
    } catch (error) {
      passwordInput.value = "";
      setMessage(message, getLoginMessage(error), "error");
    } finally {
      setLoading(submitButton, false);
    }
  }

  function registerLoginEvents() {
    document.addEventListener("submit", function (event) {
      if (event.target && event.target.id === "login-form") {
        handleLoginSubmit(event);
      }
    });

    document.addEventListener("click", function (event) {
      const submitButton = event.target.closest ? event.target.closest("#login-submit") : null;

      if (submitButton) {
        handleLoginSubmit(event);
      }
    });
  }

  registerLoginEvents();

  App.pages.login = {
    title: "Iniciar sesión",
    subtitle: "",
    public: true,
    render: function () {
      return [
        '<section class="login-page" aria-labelledby="login-title">',
        '<div class="login-brand">',
        '<div class="brand-mark">SK</div>',
        '<div class="login-copy">',
        '<h1 id="login-title">Community Tours Sian Ka\'an</h1>',
        '<p class="card-text">Sistema Integrador de Reservaciones</p>',
        "</div>",
        "</div>",
        '<form class="card login-card login-form" id="login-form" novalidate>',
        '<label class="field" for="login-correo">',
        '<span class="field-label">Correo</span>',
        '<input class="input" id="login-correo" name="correo" type="email" autocomplete="username">',
        "</label>",
        '<label class="field" for="login-password">',
        '<span class="field-label">Contraseña</span>',
        '<input class="input" id="login-password" name="password" type="password" autocomplete="current-password">',
        "</label>",
        '<p class="form-message" id="login-message" role="status" aria-live="polite"></p>',
        '<button class="btn btn-primary" id="login-submit" type="submit">Iniciar sesión</button>',
        "</form>",
        "</section>"
      ].join("");
    },
    afterRender: function () {
      const correoInput = document.getElementById("login-correo");
      const message = document.getElementById("login-message");
      const mensajeSesion = App.auth.consumirMensajeSesion();

      if (mensajeSesion) {
        setMessage(message, mensajeSesion, "info");
      }

      correoInput.focus();
    }
  };
})();
