(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.usuarios = {
    title: "Usuarios",
    subtitle: "Base visual para administración de usuarios",
    render: function () {
      return [
        '<section class="page">',
        '<div class="filter-bar">',
        '<label class="field"><span class="field-label">Búsqueda</span><input class="input" type="search" placeholder="Buscar usuarios" disabled></label>',
        '<label class="field"><span class="field-label">Rol</span><select class="input" disabled><option>Todos</option></select></label>',
        '<button class="btn btn-primary" type="button" disabled>Nuevo usuario</button>',
        "</div>",
        App.ui.table(
          ["Nombre", "Correo", "Rol", "Estado", "Último ingreso", "Acciones"],
          "Sin usuarios cargados",
          "La administración de usuarios se conectará en una fase posterior."
        ),
        "</section>"
      ].join("");
    }
  };
})();
