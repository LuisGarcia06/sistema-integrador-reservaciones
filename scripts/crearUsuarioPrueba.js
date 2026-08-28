// Herramienta local de desarrollo: crea/actualiza un usuario de prueba.
// No contiene contrasenas y no sustituye un CRUD administrativo de usuarios.

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const usuariosPruebaPorRol = {
    Administrador: {
        nombre: 'Usuario Prueba',
        correo: 'prueba@empresa.com',
        estado: true
    },
    Consulta: {
        nombre: 'Usuario Consulta Prueba',
        correo: 'consulta.prueba@empresa.com',
        estado: true
    }
};

const rolesPermitidos = Object.keys(usuariosPruebaPorRol);

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const solicitarPassword = () => new Promise((resolve) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    rl.stdoutMuted = false;
    rl._writeToOutput = function escribirSalida(stringToWrite) {
        if (rl.stdoutMuted && stringToWrite !== '\n' && stringToWrite !== '\r\n') {
            rl.output.write('*');
            return;
        }

        rl.output.write(stringToWrite);
    };

    rl.question('Contraseña temporal para el usuario de prueba: ', (password) => {
        rl.close();
        resolve(password);
    });

    rl.stdoutMuted = true;
});

const obtenerRolSolicitado = () => {
    const rol = process.argv[2] || 'Administrador';

    if (!rolesPermitidos.includes(rol)) {
        console.error(`Rol inválido. Use uno de: ${rolesPermitidos.join(', ')}`);
        return null;
    }

    return rol;
};

const obtenerIdRol = async (rol) => {
    const result = await pool.query(
        `
            SELECT id_rol
            FROM roles
            WHERE nombre = $1
            LIMIT 1
        `,
        [rol]
    );

    return result.rows[0]?.id_rol || null;
};

const guardarUsuarioPrueba = async (usuarioPrueba, idRol, passwordHash) => {
    const result = await pool.query(
        `
            INSERT INTO usuarios (
                id_rol,
                nombre,
                correo,
                password,
                estado
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (correo)
            DO UPDATE SET
                id_rol = EXCLUDED.id_rol,
                nombre = EXCLUDED.nombre,
                password = EXCLUDED.password,
                estado = EXCLUDED.estado
            RETURNING (xmax = 0) AS creado
        `,
        [
            idRol,
            usuarioPrueba.nombre,
            usuarioPrueba.correo,
            passwordHash,
            usuarioPrueba.estado
        ]
    );

    return result.rows[0].creado;
};

const main = async () => {
    const rol = obtenerRolSolicitado();

    if (!rol) {
        process.exitCode = 1;
        return;
    }

    const password = await solicitarPassword();

    if (typeof password !== 'string' || password.trim() === '') {
        console.error('La contraseña no puede estar vacía');
        process.exitCode = 1;
        return;
    }

    const idRol = await obtenerIdRol(rol);

    if (!idRol) {
        console.error(`No existe el rol ${rol}. No se creó el usuario de prueba.`);
        process.exitCode = 1;
        return;
    }

    const usuarioPrueba = usuariosPruebaPorRol[rol];
    const passwordHash = await bcrypt.hash(password, 12);
    const creado = await guardarUsuarioPrueba(usuarioPrueba, idRol, passwordHash);

    console.log(
        creado
            ? `Usuario de prueba ${rol} creado correctamente`
            : `Usuario de prueba ${rol} actualizado correctamente`
    );
};

main()
    .catch((error) => {
        console.error('No se pudo preparar el usuario de prueba');
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
