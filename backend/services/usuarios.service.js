const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { ROLES } = require('../constants/roles');
const { validarDatosActualizacionUsuario } = require('../validators/usuarios.validator');

const BCRYPT_SALT_ROUNDS = 12;
const MENSAJE_AUTO_DESACTIVACION = 'No puedes desactivar tu propia cuenta de Administrador.';
const MENSAJE_AUTO_DEGRADACION = 'No puedes cambiar tu propio rol de Administrador.';
const MENSAJE_ULTIMO_ADMIN = 'No se puede desactivar o cambiar el rol del último Administrador activo.';

const camposActualizables = [
    'nombre',
    'correo',
    'id_rol',
    'estado',
    'alcance_plataformas'
];

const columnasUsuarioPublico = `
    u.id_usuario,
    u.nombre,
    u.correo,
    u.id_rol,
    r.nombre AS rol,
    u.estado,
    u.alcance_plataformas,
    ARRAY(
        SELECT upv.id_plataforma
        FROM usuario_plataformas_visibles upv
        WHERE upv.id_usuario = u.id_usuario
        ORDER BY upv.id_plataforma
    ) AS platform_ids
`;

const obtenerUsuarios = async () => {
    const query = `
        SELECT
            ${columnasUsuarioPublico}
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        ORDER BY
            u.estado DESC,
            u.nombre ASC,
            u.id_usuario ASC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerRoles = async () => {
    const query = `
        SELECT
            id_rol,
            nombre
        FROM roles
        ORDER BY
            nombre ASC,
            id_rol ASC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerRolPorIdConDb = async (db, idRol) => {
    const query = `
        SELECT
            id_rol,
            nombre
        FROM roles
        WHERE id_rol = $1
        LIMIT 1
    `;

    const result = await db.query(query, [idRol]);

    return result.rows[0];
};

const obtenerUsuarioPorIdConDb = async (db, idUsuario, bloquear = false) => {
    const query = `
        SELECT
            ${columnasUsuarioPublico}
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        WHERE u.id_usuario = $1
        LIMIT 1
        ${bloquear ? 'FOR UPDATE OF u' : ''}
    `;

    const result = await db.query(query, [idUsuario]);

    return result.rows[0];
};

const obtenerUsuarioPorId = async (idUsuario) => obtenerUsuarioPorIdConDb(pool, idUsuario);

const hashearPassword = (password) => bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

const crearErrorReglaNegocio = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 409;
    return error;
};

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const esAdministradorActivo = (usuario) => (
    Boolean(usuario) &&
    usuario.estado === true &&
    usuario.rol === ROLES.ADMINISTRADOR
);

const esMismoUsuario = (idUsuario, usuarioAutenticado) => (
    Boolean(usuarioAutenticado) &&
    Number(idUsuario) === Number(usuarioAutenticado.id_usuario)
);

const obtenerAdministradoresActivosConBloqueo = async (db) => {
    const query = `
        SELECT
            u.id_usuario
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        WHERE r.nombre = $1
          AND u.estado = true
        ORDER BY
            u.id_usuario ASC
        FOR UPDATE OF u
    `;

    const result = await db.query(query, [ROLES.ADMINISTRADOR]);

    return result.rows;
};

const construirEstadoFinalUsuario = (usuarioActual, campos, rolActualizado) => {
    const rolFinal = tieneCampo(campos, 'id_rol')
        ? rolActualizado.nombre
        : usuarioActual.rol;
    const estadoFinal = tieneCampo(campos, 'estado')
        ? campos.estado
        : usuarioActual.estado;

    return {
        rol: rolFinal,
        estado: estadoFinal
    };
};

const validarProteccionAdministradores = (
    idUsuario,
    usuarioActual,
    campos,
    usuarioAutenticado,
    rolActualizado,
    administradoresActivos
) => {
    const estadoFinal = construirEstadoFinalUsuario(usuarioActual, campos, rolActualizado);
    const eraAdministradorActivo = esAdministradorActivo(usuarioActual);
    const sigueAdministradorActivo = (
        estadoFinal.estado === true &&
        estadoFinal.rol === ROLES.ADMINISTRADOR
    );
    const reduceAdministradoresActivos = eraAdministradorActivo && !sigueAdministradorActivo;

    if (esMismoUsuario(idUsuario, usuarioAutenticado) && usuarioActual.rol === ROLES.ADMINISTRADOR) {
        if (tieneCampo(campos, 'estado') && campos.estado === false) {
            throw crearErrorReglaNegocio(MENSAJE_AUTO_DESACTIVACION);
        }

        if (tieneCampo(campos, 'id_rol') && estadoFinal.rol !== ROLES.ADMINISTRADOR) {
            throw crearErrorReglaNegocio(MENSAJE_AUTO_DEGRADACION);
        }
    }

    if (!reduceAdministradoresActivos) {
        return;
    }

    if (administradoresActivos.length <= 1) {
        throw crearErrorReglaNegocio(MENSAJE_ULTIMO_ADMIN);
    }
};

const crearErrorAlcance = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 400;
    return error;
};

const prepararAlcanceUsuario = async (db, campos, rolFinal, usuarioActual = null) => {
    const tieneModo = tieneCampo(campos, 'alcance_plataformas');
    const tieneIds = tieneCampo(campos, 'platform_ids');
    const esConsulta = rolFinal === ROLES.CONSULTA;

    if (!esConsulta) {
        if (tieneModo || tieneIds) {
            throw crearErrorAlcance('El alcance solo se configura para usuarios Consulta');
        }
        return null;
    }

    if ((!usuarioActual || usuarioActual.rol === ROLES.ADMINISTRADOR) && !tieneModo) {
        throw crearErrorAlcance('Debe definir explícitamente el alcance final del usuario Consulta');
    }

    if (!tieneModo && !tieneIds) {
        return null;
    }

    const configuracion = {};
    if (tieneModo) configuracion.alcance_plataformas = campos.alcance_plataformas;
    if (tieneIds) configuracion.platform_ids = campos.platform_ids;
    const validacion = validarDatosActualizacionUsuario(configuracion);
    if (validacion.errores.length) throw crearErrorAlcance(validacion.errores.join('. '));

    const modo = tieneModo ? campos.alcance_plataformas : usuarioActual.alcance_plataformas;
    const ids = tieneIds ? validacion.camposActualizacion.platform_ids : [];
    if (!['all', 'selected'].includes(modo)) throw crearErrorAlcance('Alcance inválido');
    if (modo === 'all' && ids.length) throw crearErrorAlcance('all no admite asignaciones seleccionadas');

    if (ids.length) {
        const result = await db.query(
            'SELECT id_plataforma FROM plataformas WHERE id_plataforma = ANY($1::int[]) ORDER BY id_plataforma FOR KEY SHARE',
            [ids]
        );
        if (result.rows.length !== ids.length) throw crearErrorAlcance('Una o más plataformas no existen');
    }
    return { alcance_plataformas: modo, platform_ids: ids };
};

const guardarPlataformasUsuario = async (db, idUsuario, ids) => {
    await db.query('DELETE FROM usuario_plataformas_visibles WHERE id_usuario = $1', [idUsuario]);
    if (ids.length) {
        await db.query(
            'INSERT INTO usuario_plataformas_visibles (id_usuario, id_plataforma) SELECT $1, unnest($2::int[])',
            [idUsuario, ids]
        );
    }
};

const crearUsuario = async (usuario) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const rol = await obtenerRolPorIdConDb(client, usuario.id_rol);

        if (!rol) {
            const error = new Error('Rol no encontrado');
            error.statusCode = 400;
            throw error;
        }

        const alcance = await prepararAlcanceUsuario(client, usuario, rol.nombre);
        const passwordHash = await hashearPassword(usuario.password);
        const query = `
            INSERT INTO usuarios (
                id_rol,
                nombre,
                correo,
                password,
                estado,
                alcance_plataformas
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id_usuario
        `;
        const result = await client.query(query, [
            usuario.id_rol,
            usuario.nombre,
            usuario.correo,
            passwordHash,
            usuario.estado,
            alcance ? alcance.alcance_plataformas : 'all'
        ]);

        if (alcance) await guardarPlataformasUsuario(client, result.rows[0].id_usuario, alcance.platform_ids);
        const usuarioCreado = await obtenerUsuarioPorIdConDb(client, result.rows[0].id_usuario);

        await client.query('COMMIT');

        return usuarioCreado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const obtenerCambiosUsuario = (usuarioActual, campos) => (
    Object.keys(campos).filter((campo) => usuarioActual[campo] !== campos[campo])
);

const actualizarUsuarioConDb = async (db, idUsuario, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idUsuario);

    const query = `
        UPDATE usuarios
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_usuario = $${values.length}
        RETURNING
            id_usuario
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarUsuarioParcial = async (idUsuario, campos, usuarioAutenticado) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const requiereProteccionAdministradores = tieneCampo(campos, 'estado') || tieneCampo(campos, 'id_rol');
        let usuarioActual = await obtenerUsuarioPorIdConDb(client, idUsuario, !requiereProteccionAdministradores);

        if (!usuarioActual) {
            await client.query('COMMIT');
            return null;
        }

        let rolActualizado = null;

        if (Object.prototype.hasOwnProperty.call(campos, 'id_rol')) {
            rolActualizado = await obtenerRolPorIdConDb(client, campos.id_rol);

            if (!rolActualizado) {
                const error = new Error('Rol no encontrado');
                error.statusCode = 400;
                throw error;
            }
        }

        if (
            requiereProteccionAdministradores &&
            esMismoUsuario(idUsuario, usuarioAutenticado) &&
            usuarioActual.rol === ROLES.ADMINISTRADOR
        ) {
            const estadoFinal = construirEstadoFinalUsuario(usuarioActual, campos, rolActualizado);

            if (tieneCampo(campos, 'estado') && campos.estado === false) {
                throw crearErrorReglaNegocio(MENSAJE_AUTO_DESACTIVACION);
            }

            if (tieneCampo(campos, 'id_rol') && estadoFinal.rol !== ROLES.ADMINISTRADOR) {
                throw crearErrorReglaNegocio(MENSAJE_AUTO_DEGRADACION);
            }
        }

        if (requiereProteccionAdministradores) {
            const administradoresActivos = await obtenerAdministradoresActivosConBloqueo(client);
            usuarioActual = await obtenerUsuarioPorIdConDb(client, idUsuario, true);

            if (!usuarioActual) {
                await client.query('COMMIT');
                return null;
            }

            validarProteccionAdministradores(
                idUsuario,
                usuarioActual,
                campos,
                usuarioAutenticado,
                rolActualizado,
                administradoresActivos
            );
        }

        const rolFinal = construirEstadoFinalUsuario(usuarioActual, campos, rolActualizado).rol;
        const alcance = await prepararAlcanceUsuario(client, campos, rolFinal, usuarioActual);
        const camposGuardables = Object.fromEntries(Object.entries(campos).filter(([campo]) => camposActualizables.includes(campo)));
        if (alcance) camposGuardables.alcance_plataformas = alcance.alcance_plataformas;
        const camposConCambios = obtenerCambiosUsuario(usuarioActual, camposGuardables);

        if (camposConCambios.length === 0 && !alcance) {
            await client.query('COMMIT');
            return usuarioActual;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = camposGuardables[campo];
        });

        if (camposConCambios.length) await actualizarUsuarioConDb(client, idUsuario, camposActualizados);
        if (alcance) await guardarPlataformasUsuario(client, idUsuario, alcance.platform_ids);

        const usuarioActualizado = await obtenerUsuarioPorIdConDb(client, idUsuario);

        await client.query('COMMIT');

        return usuarioActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const actualizarPasswordUsuario = async (idUsuario, password) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const usuarioActual = await obtenerUsuarioPorIdConDb(client, idUsuario, true);

        if (!usuarioActual) {
            await client.query('COMMIT');
            return null;
        }

        const passwordHash = await hashearPassword(password);
        const query = `
            UPDATE usuarios
            SET
                password = $1
            WHERE id_usuario = $2
            RETURNING
                id_usuario
        `;

        await client.query(query, [passwordHash, idUsuario]);

        const usuarioActualizado = await obtenerUsuarioPorIdConDb(client, idUsuario);

        await client.query('COMMIT');

        return usuarioActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    BCRYPT_SALT_ROUNDS,
    obtenerUsuarios,
    obtenerRoles,
    obtenerUsuarioPorId,
    crearUsuario,
    actualizarUsuarioParcial,
    actualizarPasswordUsuario
};
