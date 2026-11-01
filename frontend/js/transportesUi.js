(function () {
  const App = window.App = window.App || {};

  // Presentación derivada del API. Nunca identifica una unidad por la PK del transporte.
  function describir(transporte, operacion) {
    const data = transporte || {};
    const grupo = Number((operacion || {}).numero_grupo || data.numero_grupo);
    const tieneVehiculo = data.id_vehiculo !== null && data.id_vehiculo !== undefined;
    const capacidad = Number(data.capacidad);
    const limite = tieneVehiculo
      ? (data.capacidad !== null && data.capacidad !== undefined && capacidad > 0 && Number.isFinite(capacidad) ? Math.min(12, capacidad) : null)
      : 12;
    const rawPax = data.total_pax_activos;
    const pax = rawPax !== null && rawPax !== undefined && rawPax !== "" && Number.isFinite(Number(rawPax)) && Number(rawPax) >= 0
      ? Number(rawPax) : null;
    const paxTexto = pax === null ? "PAX por consultar" : (limite === null ? pax + " PAX · Capacidad por consultar" : pax + "/" + limite + " PAX");
    const vehiculo = tieneVehiculo ? (data.vehiculo || "Vehículo por consultar") : "Vehículo pendiente";
    const id = data.id_transporte_operacion;

    return {
      principal: [(grupo === 1 || grupo === 2) ? "Grupo " + grupo : "Grupo por consultar", vehiculo, paxTexto].join(" · "),
      secundaria: id === null || id === undefined ? "Transporte por consultar" : "Transporte #" + id,
      paxTexto: paxTexto,
      completo: pax !== null && limite !== null && pax >= limite
    };
  }

  function controlesPendiente(idReservacion, isLoading, admin, transportesOperacion, options) {
    const canAssign = admin && transportesOperacion.length > 0;
    const actionCell = canAssign
      ? [
        '<div class="reservas-action-group">',
        '<label class="field reservas-select-field" for="reservas-asignar-' + App.ui.escapeHtml(idReservacion) + '">',
        '<span class="field-label">Transporte</span>',
        '<select class="input" id="reservas-asignar-' + App.ui.escapeHtml(idReservacion) + '" data-reserva-select="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        options,
        "</select>",
        "</label>",
        '<button class="btn btn-primary" type="button" data-assign-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Asignar",
        "</button>",
        "</div>"
      ].join("")
      : (admin ? '<span class="card-text">Primero crea un transporte.</span>' : "");
    return actionCell;
  }
  function controlesAsignada(idReservacion, idTransporte, isLoading, admin, transportesOperacion, options) {
    const otrosTransportes = transportesOperacion.filter(function (item) {
      return Number(item.id_transporte_operacion) !== idTransporte;
    });
    const moveControls = otrosTransportes.length > 0
      ? [
        '<label class="field reservas-select-field" for="reservas-mover-' + App.ui.escapeHtml(idReservacion) + '">',
        '<span class="field-label">Destino</span>',
        '<select class="input" id="reservas-mover-' + App.ui.escapeHtml(idReservacion) + '" data-reserva-select="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        options,
        "</select>",
        "</label>",
        '<button class="btn" type="button" data-move-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Mover",
        "</button>"
      ].join("")
      : "";
    const actionCell = admin
      ? [
        '<div class="reservas-action-group">',
        moveControls,
        '<button class="btn btn-ghost" type="button" data-unassign-reserva="' + App.ui.escapeHtml(idReservacion) + '"' + (isLoading ? " disabled" : "") + ">",
        isLoading ? "Guardando..." : "Quitar asignación",
        "</button>",
        "</div>"
      ].join("")
      : "";
    return actionCell;
  }
  function leerDestino(idReservacion) {
    const select = Array.prototype.find.call(
      document.querySelectorAll("[data-reserva-select]"),
      function (element) {
        return String(element.dataset.reservaSelect) === String(idReservacion);
      }
    );

    if (!select || !select.value) {
      return null;
    }

    const idTransporte = Number(select.value);

    return Number.isInteger(idTransporte) && idTransporte > 0 ? idTransporte : null;
  }

  App.transportesUi = { describir, controlesPendiente, controlesAsignada, leerDestino };
})();
