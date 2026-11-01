// Fuentes para un proceso receptor independiente. Importar no abre conexiones.
const { verifyPostgres } = require('../../backend/config/desktopPostgres');

function fail(code) {
    throw Object.assign(new Error(code), { code });
}

function createAdmission({ db, identity, enabled = false }) {
    if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') fail('INGRESS_DATABASE_REQUIRED');
    if (!identity || identity.DB_HOST !== '127.0.0.1' || identity.DB_PORT !== '5432'
        || identity.DB_NAME !== 'sian_kaan_reservaciones' || identity.DB_CLUSTER_ID !== '7632825987452064788'
        || identity.DB_SERVER_VERSION !== '18.3' || identity.DB_SCHEMA_VERSION !== '017'
        || !/^[a-z][a-z0-9_]{2,62}$/.test(identity.DB_USER || '') || /^(postgres|pg_)/.test(identity.DB_USER)) {
        fail('INGRESS_IDENTITY_REQUIRED');
    }
    // Copiar solo identidad, nunca contraseñas. No inicializar el backend de Electron.
    const expected = Object.freeze(Object.fromEntries([
        'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_CLUSTER_ID', 'DB_SERVER_VERSION', 'DB_SCHEMA_VERSION', 'DB_USER'
    ].map(key => [key, identity[key]])));
    return async () => {
        if (enabled !== true) fail('INGRESS_DISABLED');
        // Reutiliza identidad real, rol limitado, esquema y 017; no realiza DDL.
        await verifyPostgres(db, expected);
    };
}

module.exports = { createAdmission, fail };
