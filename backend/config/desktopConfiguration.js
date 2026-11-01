// Solo el entrypoint privado puede inicializar esta instancia, antes de importar rutas.
let config;
function initialize(value) {
    if (config) throw new Error('CONFIG_ALREADY_INITIALIZED');
    config = Object.freeze({ ...value });
    if(config.APP_ENVIRONMENT==='enterprise026')require('./enterprise026Policy').approveRuntimeCopy(config,value);
    process.env.JWT_SECRET = config.JWT_SECRET;
    process.env.JWT_EXPIRES_IN = config.JWT_EXPIRES_IN || '8h';
    process.env.GYG_GMAIL_SYNC_ENABLED = 'false';
    if (config.INTEGRATION_DASHBOARD_CUTOFF_AT) process.env.INTEGRATION_DASHBOARD_CUTOFF_AT = config.INTEGRATION_DASHBOARD_CUTOFF_AT;
}
module.exports = { initialize, get: () => config };
