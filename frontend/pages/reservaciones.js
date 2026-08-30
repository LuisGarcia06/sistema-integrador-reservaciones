(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.reservaciones = {
    title: "Reservaciones",
    subtitle: "Listado base para consultas y operaciones",
    render: function () {
      return [
        '<section class="page">',
        '<div class="filter-bar">',
        '<label class="field"><span class="field-label">Búsqueda</span><input class="input" type="search" placeholder="Buscar reservaciones" disabled></label>',
        '<label class="field"><span class="field-label">Estado</span><select class="input" disabled><option>Todos</option></select></label>',
        '<label class="field"><span class="field-label">Plataforma</span><select class="input" disabled><option>Todas</option></select></label>',
        '<button class="btn btn-primary" type="button" disabled>Nueva reservación</button>',
        "</div>",
        App.ui.table(
          ["Código", "Cliente", "Tour", "Fecha", "Hora", "PAX", "Plataforma", "Estado", "Acciones"],
          "Sin reservaciones cargadas",
          "La tabla queda preparada para integrarse con datos reales."
        ),
        "</section>"
      ].join("");
    }
  };
})();
