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

  // Esperar la imagen local y su decodificacion antes de capturar o imprimir.
  async function waitForPrintAssets(root) {
    if (!root || !root.isConnected || !root.innerHTML.trim()) {
      throw new Error("El documento de impresión ya no está disponible.");
    }
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(function (image) {
      return new Promise(function (resolve, reject) {
        const timeout = window.setTimeout(function () { finish(new Error('No se pudo cargar el logotipo de impresión.')); }, 8000);
        function finish(error) {
          window.clearTimeout(timeout);
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
          if (error) reject(error); else resolve();
        }
        async function loaded() {
          try {
            if (!image.naturalWidth || !image.naturalHeight) return failed();
            if (typeof image.decode === 'function') await image.decode();
            finish();
          } catch (error) { failed(); }
        }
        function failed() { finish(new Error('No se pudo cargar el logotipo de impresión.')); }
        if (image.complete) loaded();
        else {
          image.addEventListener('load', loaded, { once: true });
          image.addEventListener('error', failed, { once: true });
        }
      });
    }));
    if (!root.isConnected || !root.innerHTML.trim()) throw new Error('El documento de impresión cambió.');
  }

  App.ui = {
    escapeHtml: escapeHtml,
    emptyState: emptyState,
    table: table,
    placeholder: placeholder,
    waitForPrintAssets: waitForPrintAssets
  };
})();
