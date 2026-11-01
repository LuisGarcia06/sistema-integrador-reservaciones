// Fase 2C.1: activación SOLO desde configuración privada de clúster desechable.
// No hay variable de bypass, bloqueo de sesión, reintento ni cambio de esquema.
const KEY = Object.freeze([1129599827, 201]);
const guarded = new WeakSet();
function isOperationalLab(config = require('./desktopConfiguration').get()) {
    if (!['standalone-development','revision-schema-lab','revision-api-lab','command-api-lab','audit-api-lab','admin-audit-api-lab','user-audit-api-lab','credential-security-api-lab','administrative-frontend023-lab','first-access023-lab','unified023-lab'].includes(config?.APP_ENVIRONMENT)) return false;
    if (config.APP_ENVIRONMENT === 'administrative-frontend023-lab' && config.DB_SCHEMA_VERSION !== '023') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'unified023-lab' && config.DB_SCHEMA_VERSION !== '023') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'first-access023-lab' && config.DB_SCHEMA_VERSION !== '023') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'credential-security-api-lab' && config.DB_SCHEMA_VERSION !== '023') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'user-audit-api-lab' && config.DB_SCHEMA_VERSION !== '022') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'admin-audit-api-lab' && config.DB_SCHEMA_VERSION !== '022') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'audit-api-lab' && config.DB_SCHEMA_VERSION !== '021') throw Error('OPERATIONAL_LAB_CONFIG');
    if (config.APP_ENVIRONMENT === 'command-api-lab' && config.DB_SCHEMA_VERSION !== '020') throw Error('OPERATIONAL_LAB_CONFIG');
    if (['revision-schema-lab','revision-api-lab'].includes(config.APP_ENVIRONMENT) && config.DB_SCHEMA_VERSION !== '019') throw Error('OPERATIONAL_LAB_CONFIG');
    const P = require('./standalonePolicy');
    if (config.DB_HOST !== 'localhost' || config.DB_USER !== 'ctsk_standalone_runtime' ||
        !/^ctsk_standalone_[a-f0-9]{12}_test$/.test(config.DB_NAME || '') || !P.validPort(Number(config.DB_PORT)) ||
        !/^\d{19,20}$/.test(config.DB_CLUSTER_ID || '') || config.DB_CLUSTER_ID === P.PROTECTED_CLUSTER ||
        config.DB_SERVER_VERSION !== '18.3' || config.GYG_GMAIL_SYNC_ENABLED !== 'false') throw Error('OPERATIONAL_LAB_CONFIG');
    return true;
}
function classify(error) {
    if (['55P03','40P01'].includes(error.code)) {
        error.operationalLab = true; error.statusCode = 409;
        error.message = 'Otra operación impidió completar la transacción. Consulta el estado actual antes de intentar guardar nuevamente.';
    }
    return error;
}
function protectClient(client) {
    if (guarded.has(client)) return;
    guarded.add(client);
    const raw = client.query.bind(client);
    let tail = Promise.resolve();
    let failedBegin = null;
    client.query = function(...input) {
        const args = [...input];
        let callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        if (!callback && typeof args[0]?.callback === 'function') {
            callback = args[0].callback; args[0] = {...args[0]}; delete args[0].callback;
        }
        const text = String(typeof args[0] === 'string' ? args[0] : args[0]?.text || '').trim();
        // Encolar también el API callback: un UPDATE no puede adelantarse al candado del BEGIN.
        const task = tail.then(async () => {
            try {
                if (failedBegin) {
                    if (!/^ROLLBACK(?:\s+WORK|\s+TRANSACTION)?\s*;?$/i.test(text)) throw failedBegin;
                    const result = await raw(...args); failedBegin = null; return result;
                }
                if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(text)) {
                    if (/^(?:BEGIN(?:\s+WORK|\s+TRANSACTION)?|START\s+TRANSACTION)\s+READ\s+ONLY\s*;?$/i.test(text)) return await raw(...args);
                    if (!/^(?:BEGIN(?:\s+WORK|\s+TRANSACTION)?|START\s+TRANSACTION)\s*;?$/i.test(text)) throw Error('OPERATIONAL_BEGIN_REQUIRED');
                    const result = await raw(...args);
                    try {
                        await raw('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
                        await raw("SET LOCAL lock_timeout = '2000ms'");
                        await raw('SELECT pg_advisory_xact_lock($1::int,$2::int)', KEY);
                        return result;
                    } catch (error) { await raw('ROLLBACK').catch(() => {}); throw error; }
                }
                return await raw(...args);
            } catch (error) {
                const classified = classify(error);
                if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(text)) failedBegin = classified;
                throw classified;
            }
        });
        tail = task.then(() => undefined, () => undefined);
        if (callback) { void task.then(result => callback(null,result), error => callback(error)); return; }
        return task;
    };
}
function install(pool, config) {
    if (isOperationalLab(config)) pool.on('connect', protectClient);
}
async function creation(pool, work) {
    if (!isOperationalLab()) return work(pool);
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const result = await work(db);
        await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
}
module.exports = {KEY,isOperationalLab,protectClient,install,creation};
