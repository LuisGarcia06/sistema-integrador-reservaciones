const pool = require('../config/database');
const { ROLES } = require('../constants/roles');

const crearErrorAccesoDenegado = () => {
    const error = new Error('No autorizado para consultar reservaciones');
    error.statusCode = 403;
    return error;
};

// Integrado en las lecturas por ACCESS-SCOPE-03A. Requiere migracion 016
// y cierre de ACCESS-SCOPE-03B antes de habilitar usuarios en produccion.
// idUsuario debe provenir de req.usuario.id_usuario, nunca del body/query.
const obtenerAlcanceReservacionesUsuario = async (idUsuario) => {
    const id = typeof idUsuario === 'string' && /^\d+$/.test(idUsuario)
        ? Number(idUsuario)
        : idUsuario;

    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
        throw crearErrorAccesoDenegado();
    }

    // Una consulta obtiene rol, estado, modo y asignaciones en el mismo
    // snapshot. Sin cache: cada resolucion refleja los cambios confirmados.
    const query = `
        SELECT
            u.estado,
            u.alcance_plataformas,
            r.nombre AS rol,
            ARRAY(
                SELECT upv.id_plataforma
                FROM usuario_plataformas_visibles upv
                WHERE upv.id_usuario = u.id_usuario
                ORDER BY upv.id_plataforma ASC
            ) AS platform_ids
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        WHERE u.id_usuario = $1
        LIMIT 1
    `;

    // Los errores de PostgreSQL se propagan: nunca conceder all ni usar
    // un resultado anterior como alternativa a una consulta fallida.
    const result = await pool.query(query, [id]);
    const usuario = result.rows[0];

    if (!usuario || usuario.estado !== true) {
        throw crearErrorAccesoDenegado();
    }

    if (usuario.rol === ROLES.ADMINISTRADOR) {
        return { all: true };
    }

    if (usuario.rol !== ROLES.CONSULTA) {
        throw crearErrorAccesoDenegado();
    }

    if (usuario.alcance_plataformas === 'all') {
        return { all: true };
    }

    if (
        usuario.alcance_plataformas !== 'selected'
        || !Array.isArray(usuario.platform_ids)
        || usuario.platform_ids.some((idPlataforma) => (
            !Number.isInteger(idPlataforma) || idPlataforma <= 0
        ))
    ) {
        throw crearErrorAccesoDenegado();
    }

    return { all: false, platform_ids: [...usuario.platform_ids] };
};

module.exports = {
    obtenerAlcanceReservacionesUsuario
};
