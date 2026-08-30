(function () {
  const App = window.App = window.App || {};
  App.pages = App.pages || {};

  App.pages.dashboard = {
    title: "Dashboard",
    subtitle: "Resumen visual del sistema",
    render: function () {
      return [
        '<section class="page">',
        '<div class="metric-grid">',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Reservaciones de hoy</p></article>',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Tours programados</p></article>',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Pendientes</p></article>',
        '<article class="card metric-card"><p class="metric-value">--</p><p class="metric-label">Cancelaciones</p></article>',
        "</div>",
        '<div class="dashboard-grid">',
        '<section class="card stack">',
        '<div class="card-header"><div><h2>Actividad reciente</h2><p class="card-text">Espacio reservado para el resumen operativo.</p></div><span class="badge">Temporal</span></div>',
        App.ui.emptyState("Sin datos conectados", "La actividad se integrará en una fase posterior."),
        "</section>",
        '<aside class="card stack">',
        '<div class="card-header"><div><h2>Acciones rápidas</h2><p class="card-text">Controles visuales preparados para futuras operaciones.</p></div></div>',
        '<button class="btn btn-primary" type="button" disabled>Nueva reservación</button>',
        '<button class="btn" type="button" disabled>Generar Daily</button>',
        "</aside>",
        "</div>",
        "</section>"
      ].join("");
    }
  };
})();
