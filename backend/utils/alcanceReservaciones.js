const validarAlcanceReservaciones = (alcance) => {
    if (
        !alcance
        || typeof alcance.all !== 'boolean'
        || (alcance.all === false && (
            !Array.isArray(alcance.platform_ids)
            || alcance.platform_ids.some((id) => !Number.isInteger(id) || id <= 0)
        ))
    ) {
        const error = new Error('Alcance de reservaciones no autorizado');
        error.statusCode = 403;
        throw error;
    }
};

// Columna controlada por el backend; los IDs siempre van como parametro pg.
const construirFiltroAlcanceReservaciones = (alcance, columna, values) => {
    validarAlcanceReservaciones(alcance);

    if (!['id_plataforma', 'r.id_plataforma'].includes(columna)) {
        throw new Error('Columna de alcance no permitida');
    }

    if (alcance.all) {
        return '';
    }

    values.push([...alcance.platform_ids]);
    return `${columna} = ANY($${values.length}::int[])`;
};

module.exports = {
    validarAlcanceReservaciones,
    construirFiltroAlcanceReservaciones
};
