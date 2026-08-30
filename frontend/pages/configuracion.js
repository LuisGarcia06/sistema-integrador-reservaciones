(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.configuracion = {
    title: "Configuración",
    subtitle: "Preferencias visuales y espacios de cuenta",
    render: function () {
      return [
        '<section class="page">',
        '<div class="settings-grid">',
        '<article class="card stack"><span class="badge">Cuenta</span><h2>Perfil</h2><p class="card-text">Espacio reservado para datos de usuario.</p><button class="btn" type="button" disabled>Editar</button></article>',
        '<article class="card stack"><span class="badge">Sistema</span><h2>Notificaciones</h2><p class="card-text">Espacio reservado para preferencias futuras.</p><button class="btn" type="button" disabled>Configurar</button></article>',
        '<article class="card stack"><span class="badge badge-warning">Seguridad</span><h2>Acceso</h2><p class="card-text">Espacio reservado para opciones de sesión.</p><button class="btn" type="button" disabled>Revisar</button></article>',
        "</div>",
        "</section>"
      ].join("");
    }
  };
})();
