const pool = require('../config/database');
const operacionesService = require('./operaciones.service');

const ESTADOS_RESERVACION_VIGENTE = [
    'Pendiente',
    'Confirmada',
    'Activa'
];

const normalizarFechaResultado = (fecha) => {
    if (fecha instanceof Date) {
        return fecha.toISOString().slice(0, 10);
    }

    return fecha;
};

const normalizarHoraResultado = (hora) => {
    if (typeof hora !== 'string') {
        return hora;
    }

    return hora.split('.')[0];
};

const consultarMetricasReservaciones = async (fecha) => {
    const query = `
        SELECT
            COUNT(*)::int AS reservaciones_vigentes,
            COALESCE(SUM(pax), 0)::int AS pax_vigentes
        FROM reservaciones
        WHERE fecha = $1
            AND estado = ANY($2::varchar[])
    `;

    const result = await pool.query(query, [fecha, ESTADOS_RESERVACION_VIGENTE]);

    return {
        reservaciones_vigentes: Number(result.rows[0]?.reservaciones_vigentes) || 0,
        pax_vigentes: Number(result.rows[0]?.pax_vigentes) || 0
    };
};

const consultarGruposPreparados = async (fecha) => {
    const query = `
        SELECT COUNT(*)::int AS total
        FROM operaciones_tour
        WHERE fecha = $1
    `;

    const result = await pool.query(query, [fecha]);

    return Number(result.rows[0]?.total) || 0;
};

const consultarReservacionesRecientes = async () => {
    const query = `
        SELECT
            r.id_reservacion,
            r.codigo,
            r.fecha,
            r.nombre_cliente,
            r.id_tour,
            t.nombre AS tour,
            r.turno,
            r.pax,
            r.id_plataforma,
            pl.nombre AS plataforma,
            r.vendedor,
            r.estado,
            r.fecha_registro
        FROM reservaciones r
        INNER JOIN tours t
            ON t.id_tour = r.id_tour
        INNER JOIN plataformas pl
            ON pl.id_plataforma = r.id_plataforma
        ORDER BY r.fecha_registro DESC, r.id_reservacion DESC
        LIMIT 10
    `;

    const result = await pool.query(query);

    return result.rows.map((reservacion) => ({
        ...reservacion,
        fecha: normalizarFechaResultado(reservacion.fecha),
        fecha_registro: normalizarFechaResultado(reservacion.fecha_registro),
        turno: reservacion.turno || null
    }));
};

const contarGruposPreparadosNecesarios = (grupos, gruposNecesarios) => {
    if (!Array.isArray(grupos) || gruposNecesarios <= 0) {
        return 0;
    }

    return grupos.filter((grupo) => (
        grupo &&
        grupo.preparado === true &&
        Number(grupo.numero_grupo) <= gruposNecesarios
    )).length;
};

const mapearSalidaDashboard = (salida) => {
    const gruposNecesarios = Number(salida.grupos_necesarios) || 0;
    const gruposPreparados = contarGruposPreparadosNecesarios(salida.grupos, gruposNecesarios);

    return {
        id_tour: salida.id_tour,
        tour: salida.tour,
        turno: salida.turno,
        pax_total: Number(salida.pax_total) || 0,
        total_reservaciones: Number(salida.total_reservaciones) || 0,
        grupos_necesarios: gruposNecesarios,
        grupos_preparados: gruposPreparados,
        grupos_pendientes: Math.max(gruposNecesarios - gruposPreparados, 0),
        excede_capacidad: Boolean(salida.excede_capacidad),
        pax_excedente: Number(salida.pax_excedente) || 0
    };
};

const construirSalidasDashboard = async (fecha) => {
    const sugeridas = await operacionesService.obtenerOperacionesSugeridas(fecha);
    const salidasHoy = sugeridas.datos.map(mapearSalidaDashboard);
    const gruposPendientes = salidasHoy.reduce(
        (total, salida) => total + salida.grupos_pendientes,
        0
    );
    const salidasConExcesoCapacidad = salidasHoy.filter((salida) => salida.excede_capacidad).length;

    return {
        reservaciones_sin_turno: Number(sugeridas.reservaciones_sin_turno) || 0,
        salidas_con_exceso_capacidad: salidasConExcesoCapacidad,
        grupos_pendientes: gruposPendientes,
        salidas_hoy: salidasHoy
    };
};

const obtenerResumenDashboard = async (fecha) => {
    const [
        metricasReservaciones,
        gruposPreparados,
        resumenSalidas,
        reservacionesRecientes
    ] = await Promise.all([
        consultarMetricasReservaciones(fecha),
        consultarGruposPreparados(fecha),
        construirSalidasDashboard(fecha),
        consultarReservacionesRecientes()
    ]);

    return {
        fecha,
        metricas: {
            reservaciones_vigentes: metricasReservaciones.reservaciones_vigentes,
            pax_vigentes: metricasReservaciones.pax_vigentes,
            grupos_preparados: gruposPreparados,
            grupos_pendientes: resumenSalidas.grupos_pendientes
        },
        alertas: {
            reservaciones_sin_turno: resumenSalidas.reservaciones_sin_turno,
            salidas_con_exceso_capacidad: resumenSalidas.salidas_con_exceso_capacidad
        },
        reservaciones_recientes: reservacionesRecientes,
        salidas_hoy: resumenSalidas.salidas_hoy
    };
};

module.exports = {
    ESTADOS_RESERVACION_VIGENTE,
    obtenerResumenDashboard
};
