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

  App.transportesUi = { describir: describir };
})();
