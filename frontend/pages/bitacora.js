(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.bitacora = {
    title: "Bitácora",
    subtitle: "Registro de auditoría del sistema",
    render: function () {
      return [
        '<section class="page">',
        '<div class="filter-bar">',
        '<label class="field"><span class="field-label">Búsqueda</span><input class="input" type="search" placeholder="Buscar eventos" disabled></label>',
        '<label class="field"><span class="field-label">Acción</span><select class="input" disabled><option>Todas</option></select></label>',
        "</div>",
        App.ui.table(
          ["Fecha y hora", "Usuario", "Reservación", "Cliente", "Acción", "Detalles"],
          "Sin eventos cargados",
          "La tabla queda preparada para la auditoría real."
        ),
        "</section>"
      ].join("");
    }
  };
})();
