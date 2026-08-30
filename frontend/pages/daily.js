(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.daily = {
    title: "Daily",
    subtitle: "Vista previa operativa del día",
    render: function () {
      return [
        '<section class="page">',
        '<div class="daily-toolbar">',
        '<label class="field"><span class="field-label">Fecha</span><input class="input" type="date" disabled></label>',
        '<div>',
        '<button class="btn" type="button" disabled>Exportar PDF</button> ',
        '<button class="btn" type="button" disabled>Imprimir</button>',
        "</div>",
        "</div>",
        '<div class="daily-layout">',
        '<section class="daily-main">',
        App.ui.placeholder("Contenido Daily", "Aquí se integrará la agenda diaria con fecha, reservaciones, estados y recogidas."),
        '<div class="timeline-placeholder">',
        '<article class="card timeline-slot"><h3>Bloque operativo</h3><p class="card-text">Estructura preparada para reservaciones del día.</p></article>',
        '<article class="card timeline-slot"><h3>Observaciones</h3><p class="card-text">Espacio reservado para notas operativas.</p></article>',
        "</div>",
        "</section>",
        '<aside class="daily-summary">',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Reservaciones</p></article>',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Turistas</p></article>',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Tours</p></article>',
        "</aside>",
        "</div>",
        "</section>"
      ].join("");
    }
  };
})();
