(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.historial = {
    title: "Historial",
    subtitle: "Consulta histórica de reservaciones",
    render: function () {
      return [
        '<section class="page">',
        '<div class="filter-bar">',
        '<label class="field"><span class="field-label">Búsqueda</span><input class="input" type="search" placeholder="Buscar historial" disabled></label>',
        '<label class="field"><span class="field-label">Rango</span><select class="input" disabled><option>Seleccionar</option></select></label>',
        '<button class="btn" type="button" disabled>Aplicar filtros</button>',
        "</div>",
        App.ui.table(
          ["Código", "Cliente", "Tour", "Fecha", "Estado", "Total", "Acciones"],
          "Sin historial cargado",
          "La vista queda lista para mostrar consultas históricas reales."
        ),
        "</section>"
      ].join("");
    }
  };
})();
