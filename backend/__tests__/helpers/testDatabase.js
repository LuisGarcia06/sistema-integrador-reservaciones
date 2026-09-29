const bcrypt = require('bcryptjs');
const pool = require('../../config/database');

const MAIN_DATABASE_NAME = 'sian_kaan_reservaciones';
const TEST_PASSWORD = 'PasswordCP044!';

const assertTestDatabaseName = (databaseName, source) => {
    if (!databaseName || typeof databaseName !== 'string') {
        throw new Error(`${source} no está configurado`);
    }

    if (databaseName === MAIN_DATABASE_NAME) {
        throw new Error(`${source} no puede ser ${MAIN_DATABASE_NAME}`);
    }

    if (!databaseName.endsWith('_test')) {
        throw new Error(`${source} debe terminar en _test`);
    }
};

const assertSafeEnvironment = () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV debe ser exactamente test');
    }

    assertTestDatabaseName(process.env.DB_NAME, 'DB_NAME');
};

const obtenerCurrentDatabase = async (client) => {
    const result = await client.query('SELECT current_database() AS database_name');

    return result.rows[0]?.database_name;
};

const assertSafeConnection = async (client) => {
    const currentDatabase = await obtenerCurrentDatabase(client);

    assertTestDatabaseName(currentDatabase, 'current_database()');

    return currentDatabase;
};

const obtenerIdRol = async (client, nombre) => {
    const result = await client.query(
        'SELECT id_rol FROM roles WHERE nombre = $1 LIMIT 1',
        [nombre]
    );

    if (!result.rows[0]) {
        throw new Error(`No existe el rol requerido: ${nombre}`);
    }

    return result.rows[0].id_rol;
};

const obtenerIdPlataforma = async (client) => {
    const result = await client.query(
        `
            SELECT id_plataforma
            FROM plataformas
            WHERE nombre = $1
            LIMIT 1
        `,
        ['Externa']
    );

    if (result.rows[0]) {
        return result.rows[0].id_plataforma;
    }

    const fallback = await client.query(
        `
            SELECT id_plataforma
            FROM plataformas
            ORDER BY id_plataforma ASC
            LIMIT 1
        `
    );

    if (!fallback.rows[0]) {
        throw new Error('No existe una plataforma requerida para pruebas');
    }

    return fallback.rows[0].id_plataforma;
};

const limpiarDatosPrueba = async (client) => {
    await client.query(`
        TRUNCATE TABLE
            bitacora,
            reservaciones,
            transportes_operacion,
            operaciones_tour,
            usuarios,
            tours,
            paises,
            vehiculos,
            operadores,
            guias
        RESTART IDENTITY CASCADE
    `);
};

const insertarUsuario = async (client, { idRol, nombre, correo, passwordHash }) => {
    const result = await client.query(
        `
            INSERT INTO usuarios (
                id_rol,
                nombre,
                correo,
                password,
                estado
            )
            VALUES ($1, $2, $3, $4, TRUE)
            RETURNING id_usuario, nombre, correo, id_rol
        `,
        [idRol, nombre, correo, passwordHash]
    );

    return result.rows[0];
};

const prepararBaseDePruebas = async () => {
    assertSafeEnvironment();

    const client = await pool.connect();
    let transaccionIniciada = false;

    try {
        const currentDatabase = await assertSafeConnection(client);

        await client.query('BEGIN');
        transaccionIniciada = true;

        await limpiarDatosPrueba(client);

        const idRolAdministrador = await obtenerIdRol(client, 'Administrador');
        const idRolConsulta = await obtenerIdRol(client, 'Consulta');
        const idPlataforma = await obtenerIdPlataforma(client);
        const passwordHash = await bcrypt.hash(TEST_PASSWORD, 8);
        const administrador = await insertarUsuario(client, {
            idRol: idRolAdministrador,
            nombre: 'Administrador CP044',
            correo: 'admin.cp044@example.test',
            passwordHash
        });
        const consulta = await insertarUsuario(client, {
            idRol: idRolConsulta,
            nombre: 'Consulta CP044',
            correo: 'consulta.cp044@example.test',
            passwordHash
        });
        const tourResult = await client.query(
            `
                INSERT INTO tours (nombre, descripcion, activo)
                VALUES ($1, $2, TRUE)
                RETURNING id_tour, nombre
            `,
            ['Tour CP044', 'Tour controlado para pruebas API CP-044']
        );
        const paisResult = await client.query(
            `
                INSERT INTO paises (nombre)
                VALUES ($1)
                RETURNING id_pais, nombre
            `,
            ['País CP044']
        );

        await client.query('COMMIT');
        transaccionIniciada = false;

        return {
            currentDatabase,
            password: TEST_PASSWORD,
            usuarios: {
                administrador,
                consulta
            },
            catalogos: {
                id_tour: tourResult.rows[0].id_tour,
                id_pais: paisResult.rows[0].id_pais,
                id_plataforma: idPlataforma
            }
        };
    } catch (error) {
        if (transaccionIniciada) {
            await client.query('ROLLBACK');
        }

        throw error;
    } finally {
        client.release();
    }
};

const cerrarPool = async () => {
    await pool.end();
};

module.exports = {
    prepararBaseDePruebas,
    cerrarPool
};
