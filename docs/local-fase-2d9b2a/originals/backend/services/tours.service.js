const pool = require('../config/database');

const camposActualizables = [
    'nombre',
    'descripcion',
    'activo'
];

const columnasTour = `
    id_tour,
    nombre,
    descripcion,
    activo
`;

const obtenerTourPorIdConDb = async (db, idTour, bloquear = false) => {
    const query = `
        SELECT
            ${columnasTour}
        FROM tours
        WHERE id_tour = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idTour]);

    return result.rows[0];
};

const obtenerTours = async () => {
    const query = `
        SELECT
            ${columnasTour}
        FROM tours
        ORDER BY
            activo DESC,
            nombre ASC,
            id_tour ASC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerTourPorId = async (idTour) => {
    return obtenerTourPorIdConDb(pool, idTour);
};

const crearTour = async (tour) => {
    const query = `
        INSERT INTO tours (
            nombre,
            descripcion,
            activo
        )
        VALUES ($1, $2, $3)
        RETURNING
            id_tour
    `;

    const result = await pool.query(query, [tour.nombre, tour.descripcion, tour.activo]);

    return obtenerTourPorId(result.rows[0].id_tour);
};

const obtenerCambiosTour = (tourActual, campos) => (
    Object.keys(campos).filter((campo) => tourActual[campo] !== campos[campo])
);

const actualizarTourConDb = async (db, idTour, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idTour);

    const query = `
        UPDATE tours
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_tour = $${values.length}
        RETURNING
            id_tour
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarTourParcial = async (idTour, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const tourActual = await obtenerTourPorIdConDb(client, idTour, true);

        if (!tourActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosTour(tourActual, campos);

        if (camposConCambios.length === 0) {
            await client.query('COMMIT');
            return tourActual;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await actualizarTourConDb(client, idTour, camposActualizados);

        const tourActualizado = await obtenerTourPorIdConDb(client, idTour);

        await client.query('COMMIT');

        return tourActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerTours,
    obtenerTourPorId,
    crearTour,
    actualizarTourParcial
};
