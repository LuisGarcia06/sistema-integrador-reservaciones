// Ejecutor independiente de Electron. El control de publicación nunca gobierna Gmail.
const sync = require('./getyourguideGmailSync.service');
const estado = require('../../services/integracionSyncEstado.service');
const { registrarEventoIntegracion } = require('../../services/eventosIntegracion.service');
const { verifyPostgres } = require('../../config/desktopPostgres');
const { createPriorityCapture, isYield, codeFor } = require('./getyourguideRecentSync.service');
const LOCK = [0x475947, 0x53594e43];

function createContinuousSync({ db, identity, getGmailClient, verify = verifyPostgres,
    syncService = sync, stateService = estado, register = registrarEventoIntegracion,
    now = () => Date.now(), recentBudgetMs = 45000, historicalBudgetMs = 20000 }) {
    let gmail;
    const priority = createPriorityCapture({ syncService, stateService, now, recentBudgetMs });
    return async function runOnce() {
        const guard = await db.connect();
        let locked = false;
        let state;
        try {
            locked = (await guard.query('SELECT pg_try_advisory_lock($1::int,$2::int) AS locked', LOCK)).rows[0]?.locked;
            if (!locked) return { busy: true };
            // Cursor y eventos usan la conexión que posee el bloqueo. Si se pierde,
            // no se puede avanzar el cursor desde otra conexión mientras otro worker entra.
            const workDb = { query: guard.query.bind(guard), connect: async () => ({
                query: guard.query.bind(guard), release() {}
            }) };
            await verify(workDb, identity);
            gmail ||= await getGmailClient();
            state = await stateService.obtenerEstadoSync({ provider: 'getyourguide', source: 'gmail' }, workDb);
            // Sin cursor previo: recuperar todos los mensajes válidos paginadamente.
            // El target se fija antes del listado para recuperar también llegadas concurrentes.
            if (!state) {
                const historyId = (await gmail.users.getProfile({ userId: 'me' })).data.historyId;
                await guard.query('BEGIN');
                try {
                    await stateService.guardarBaselineSync({ lastHistoryId: historyId }, guard);
                    state = await stateService.iniciarRecoverySync({ recoveryTargetHistoryId: historyId }, guard);
                    await guard.query('COMMIT');
                } catch (error) { await guard.query('ROLLBACK'); throw error; }
            }
            const persist = event => register({ ...event, review_status: 'pending_review' }, workDb);
            const recent = await priority.capture(gmail, state, workDb, persist);
            if (recent.backoff) return { backoff: true };
            state = recent.historical;
            let historical = { completed: true };
            if (state.recovery_active) {
                try {
                    const deadline = now() + historicalBudgetMs;
                    historical = await syncService.ejecutarRecovery(gmail, state, { db: workDb,
                        syncEstado: stateService,
                        env: { GYG_GMAIL_QUOTA_BACKOFF_MS: '60000' }, logger: { log() {} }, registrarEvento: persist,
                        procesarMensajes: (_gmail, ids) => priority.processIds(gmail, ids, workDb, persist, { deadline }) });
                } catch (error) {
                    if (isYield(error)) historical = { yielded: true };
                    else {
                        const code = codeFor(error);
                        if (Number(error?.response?.status ?? error?.code) === 400 && state.recovery_page_token) {
                            await stateService.iniciarRecoverySync({ recoveryTargetHistoryId: state.recovery_target_history_id }, workDb);
                        }
                        await stateService.registrarErrorSync({ errorCode: code }, workDb);
                        historical = { error: code };
                    }
                }
            }
            return { recent: { priority: recent.priority, incremental: recent.incremental, checkedAt: recent.checkedAt },
                historical, quotaLimited: historical.quotaLimited };
        } catch (error) {
            if (isYield(error)) return { recent: { yielded: true }, historical: { deferred: true } };
            gmail = null;
            const code = codeFor(error);
            if (locked) await priority.recordFailure(error, guard).catch(() => {});
            // Solo categorías fijas: ni tokens, cuerpos de correo ni errores SQL.
            if (locked) await stateService.registrarErrorSync({ errorCode: code }, guard).catch(() => {});
            throw Object.assign(Error(code), { code });
        } finally {
            let broken = false;
            if (locked) {
                try { await guard.query('SELECT pg_advisory_unlock($1::int,$2::int)', LOCK); }
                catch { broken = true; }
            }
            guard.release(broken);
        }
    };
}

module.exports = { createContinuousSync };
