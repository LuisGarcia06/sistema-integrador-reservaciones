const sync = require('./getyourguideGmailSync.service');
const state = require('../../services/integracionSyncEstado.service');
const SOURCE = 'gmail_recent';
const isYield = error => error?.code === 'GYG_SYNC_YIELD';
const codeFor = error => {
    const status = Number(error?.response?.status ?? error?.code);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? `GYG_SYNC_HTTP_${status}`
        : error?.code === 'INGRESS_OAUTH_AUTHORIZATION_REQUIRED' ? 'GYG_OAUTH_ERROR' : 'GYG_SYNC_ERROR';
};

function createPriorityCapture({ syncService = sync, stateService = state, now = () => Date.now(), recentBudgetMs = 45000 } = {}) {
    let quotaAttempts = 0;
    // Solo mensajes ajenos/desconocidos; deduplicacion valida siempre en PostgreSQL.
    const ignored = new Set();
    const remember = id => { ignored.add(id); if (ignored.size > 2000) ignored.delete(ignored.values().next().value); };
    async function processIds(gmail, ids, db, register, { metadataOnly = false, deadline } = {}) {
        const unique = [...new Set(ids)];
        const stored = unique.length ? (await db.query(`SELECT external_event_id FROM eventos_integracion
            WHERE provider=$1 AND external_event_id=ANY($2::text[])`, ['getyourguide', unique])).rows : [];
        const known = new Set(stored.map(row => row.external_event_id));
        const total = { messagesDetected: unique.length, messagesProcessed: 0, eventsRegistered: 0,
            duplicates: 0, unknownIgnored: 0, skipped: 0 };
        for (const id of unique) {
            if (known.has(id)) { total.messagesProcessed++; total.duplicates++; continue; }
            if (ignored.has(id)) { total.messagesProcessed++; total.skipped++; continue; }
            if (now() >= deadline) throw Object.assign(Error('GYG_SYNC_YIELD'), { code: 'GYG_SYNC_YIELD' });
            try {
                if (metadataOnly) {
                    const message = (await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From'] })).data;
                    const from = message?.payload?.headers?.find(h => h.name?.toLowerCase() === 'from')?.value;
                    if (!syncService.esRemitenteGetYourGuide(from)) { remember(id); total.messagesProcessed++; total.skipped++; continue; }
                }
                const partial = await syncService.procesarMensajeGetYourGuide(gmail, id, { registrarEvento: register, logger: { log() {} } });
                total.messagesProcessed++;
                total.eventsRegistered += partial.registered || 0;
                total.duplicates += partial.duplicate || 0;
                total.unknownIgnored += partial.unknown || 0;
                total.skipped += partial.skipped || 0;
                if (partial.unknown || partial.tipo === 'ignored_sender') remember(id);
            } catch (error) {
                if (!syncService.esMensajeNoEncontrado(error)) throw error;
                remember(id); total.messagesProcessed++; total.skipped++;
            }
        }
        return total;
    }
    async function capture(gmail, historical, db, register) {
        let recent = await stateService.obtenerEstadoSync({ provider: 'getyourguide', source: SOURCE }, db);
        if ([recent, historical].some(s => s?.backoff_until && new Date(s.backoff_until).getTime() > now())) return { backoff: true };
        if (!recent) {
            recent = await stateService.guardarCheckpointIncrementalSync({
                lastHistoryId: historical.recovery_target_history_id || historical.last_history_id
            }, db);
        }
        const deadline = now() + recentBudgetMs;
        // Esta primera pagina da prioridad inmediata incluso tras una interrupcion.
        // No es un limite de captura: History pagina TODOS los cambios restantes.
        const head = await gmail.users.messages.list({ userId: 'me', q: `from:${syncService.GYG_FROM_EMAIL}`, maxResults: 25 });
        const priority = await processIds(gmail, (head.data?.messages || []).map(m => m.id), db, register, { deadline });
        let incremental;
        try {
            const response = await gmail.users.history.list({ userId: 'me', startHistoryId: recent.last_history_id,
                historyTypes: ['messageAdded'], maxResults: 100, pageToken: recent.recovery_page_token || undefined });
            incremental = await processIds(gmail, syncService.extraerMessageIdsDeHistory(response.data?.history || []), db, register,
                { metadataOnly: true, deadline });
            const pageToken = response.data?.nextPageToken || null;
            const historyId = pageToken ? recent.last_history_id : response.data?.historyId;
            if (!historyId) throw Error('GYG_HISTORY_RESPONSE_INVALID');
            // Cursor solo despues de persistir la pagina completa. Al interrumpir se
            // repite la pagina y se omiten los IDs ya persistidos sin descargarlos.
            await stateService.guardarCheckpointIncrementalSync({ lastHistoryId: historyId, pageToken, completed: !pageToken }, db);
            await stateService.reflejarSyncRecienteExitoso(db);
        } catch (error) {
            if (syncService.esHistoryIdExpirado(error)) {
                const historyId = (await gmail.users.getProfile({ userId: 'me' })).data.historyId;
                await db.query('BEGIN');
                try {
                    // Solo un 404 de History exige cerrar un hueco con barrido completo.
                    historical = await stateService.iniciarRecoverySync({ recoveryTargetHistoryId: historyId }, db);
                    await stateService.guardarCheckpointIncrementalSync({ lastHistoryId: historyId }, db);
                    await db.query('COMMIT');
                } catch (failure) { await db.query('ROLLBACK'); throw failure; }
                incremental = { recoveringExpiredHistory: true };
            } else if (Number(error?.response?.status ?? error?.code) === 400 && recent.recovery_page_token) {
                await stateService.guardarCheckpointIncrementalSync({ lastHistoryId: recent.last_history_id }, db);
                throw error;
            } else throw error;
        }
        quotaAttempts = 0;
        return { priority, incremental, historical, checkedAt: new Date(now()).toISOString() };
    }
    async function recordFailure(error, db) {
        const code = codeFor(error);
        if (syncService.esErrorCuotaGmail(error)) {
            const ms = Math.max(syncService.obtenerRetryAfterMs(error, now()), Math.min(900000, 60000 * 2 ** Math.min(quotaAttempts++, 4)));
            await stateService.registrarBackoffIncrementalSync({ errorCode: code, backoffUntil: new Date(now() + ms) }, db);
        } else await stateService.registrarErrorSync({ provider: 'getyourguide', source: SOURCE, errorCode: code }, db);
    }
    return { capture, processIds, recordFailure };
}

module.exports = { createPriorityCapture, SOURCE, isYield, codeFor };
