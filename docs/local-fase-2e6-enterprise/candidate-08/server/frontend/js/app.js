(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const start = function () { window.App.layout.renderLayout(); window.App.router.init(); };
    if (window.App.unified?.active) window.App.unified.ready.then(start).catch(function () { document.getElementById("page-root").textContent="No fue posible verificar los componentes de la aplicación. Cierra esta ventana."; });
    else start();
  });
})();
