(function () {
  const App = window.App = window.App || {};

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function emptyState(title, text) {
    return [
      '<div class="empty-state">',
      '<p class="empty-state-title">' + escapeHtml(title) + '</p>',
      '<p>' + escapeHtml(text) + '</p>',
      '</div>'
    ].join("");
  }

  function table(headers, emptyTitle, emptyText) {
    const headerCells = headers
      .map(function (header) {
        return "<th>" + escapeHtml(header) + "</th>";
      })
      .join("");

    return [
      '<div class="table-container">',
      '<table class="data-table">',
      "<thead><tr>" + headerCells + "</tr></thead>",
      '<tbody><tr><td colspan="' + headers.length + '">',
      emptyState(emptyTitle, emptyText),
      "</td></tr></tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function placeholder(title, text) {
    return [
      '<section class="placeholder-panel">',
      '<span class="placeholder-label">Sección no disponible</span>',
      "<h2>" + escapeHtml(title) + "</h2>",
      '<p class="card-text">' + escapeHtml(text) + "</p>",
      "</section>"
    ].join("");
  }

  App.ui = {
    escapeHtml: escapeHtml,
    emptyState: emptyState,
    table: table,
    placeholder: placeholder
  };
})();
