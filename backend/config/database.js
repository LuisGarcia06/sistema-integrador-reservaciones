const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('node:path');
const desktopConfig = require('./desktopConfiguration').get();

// Conservar exclusivamente las entradas protegidas existentes. Una variable APP_ heredada
// no habilita este camino en el arranque habitual ni en importaciones de servicios.
const protectedEntry = ['backendDevDb02.cjs', 'backendProdAccessTest.cjs'].some(name =>
    path.resolve(process.argv[1] || '') === path.resolve(__dirname, '../../scripts', name));
if (!desktopConfig && protectedEntry && process.env.APP_CONFIG_PATH) {
    dotenv.config({ path: process.env.APP_CONFIG_PATH });
}

const options = desktopConfig ? {
    host: '127.0.0.1', port: 5432, database: desktopConfig.DB_NAME,
    user: desktopConfig.DB_USER, password: desktopConfig.DB_PASSWORD,
    connectionTimeoutMillis: 5000, query_timeout: 5000,
    options: '-c search_path=public,pg_catalog -c statement_timeout=5000',
    application_name: 'ctsk-desktop-03a', max: 5
} : protectedEntry ? {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
} : { host: 'unconfigured.invalid', database: 'unconfigured', user: 'unconfigured', password: '' };
const pool = new Pool(options);
if (!desktopConfig && !protectedEntry) {
    pool.query = pool.connect = async () => { throw Object.assign(new Error('Configuración privada de arranque requerida.'), { code: 'PRIVATE_PARENT' }); };
}

// pg emite errores de conexiones inactivas fuera de las promesas de query.
// Mantener Express disponible; la siguiente consulta fallara o reconectara normalmente.
pool.on('error', (error) => {
    console.error('Conexion PostgreSQL inactiva interrumpida.', /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'PG_CONNECTION_ERROR');
});

module.exports = pool;


