const pool = require('../config/database');
const { crearEntradaBitacora } = require('./bitacora.service');
const PROVIDERS = ['fareharbor', 'getyourguide'];

function validarProvider(provider) {
    if (!PROVIDERS.includes(provider)) throw Object.assign(Error('Integración inválida'), { statusCode: 400 });
}

function comprobarFareHarbor(run = require('node:child_process').execFile) {
    return new Promise(resolve => {
        // El backend de Electron solo puede conectar a PostgreSQL. Consultar al
        // sistema operativo en lectura, sin abrir conexiones a proveedores ni
        // ampliar esa política de red. Comando fijo, sin entradas del usuario.
        const path = require('node:path');
        const allowed = require('../config/desktopPolicy').WINDOWS_ENV;
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
        const command = "$ErrorActionPreference='Stop'; try { if (@(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' }).Count -eq 1) { '1' } else { '0' } } catch { '0' }";
        run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
            ['-NoProfile', '-NonInteractive', '-Command', command],
            { env, windowsHide: true, timeout: 5000, maxBuffer: 1024 },
            (error, stdout) => resolve(!error && String(stdout).trim() === '1'));
    });
}

async function listarControles({ includeCounts = true } = {}, db = pool, probe = comprobarFareHarbor) {
    const result = await db.query(`SELECT provider, avisos_activados, updated_at
        FROM integracion_sync_estado WHERE source = 'publicacion' ORDER BY provider`);
    if (result.rows.length !== 2) throw Error('Controles de publicación no instalados');
    const sync = (await db.query(`SELECT last_successful_sync_at, last_error_at, last_error_code, updated_at,
        recovery_active, backoff_until FROM integracion_sync_estado
        WHERE provider = 'getyourguide' AND source = 'gmail'`)).rows[0];
    const counts = includeCounts ? (await db.query(`SELECT provider,
        count(*) FILTER (WHERE NOT aviso_publicado)::int AS acumulados,
        max(created_at) AS ultima_recepcion FROM eventos_integracion
        WHERE provider IN ('fareharbor','getyourguide') GROUP BY provider`)).rows : [];
    const fh = await probe();
    return result.rows.map(row => {
        const count = counts.find(c => c.provider === row.provider);
        const recent = sync?.updated_at && Date.now() - new Date(sync.updated_at).getTime() < 300000;
        const failed = sync?.last_error_at && (!sync.last_successful_sync_at || new Date(sync.last_error_at) >= new Date(sync.last_successful_sync_at));
        return { provider: row.provider, activado: row.avisos_activados, actualizado_en: row.updated_at,
            acumulados: includeCounts ? (count?.acumulados || 0) : null,
            ultima_recepcion: count?.ultima_recepcion || null,
            ultima_sincronizacion: row.provider === 'getyourguide' ? sync?.last_successful_sync_at || null : null,
            conexion: row.provider === 'fareharbor' ? (fh ? 'receptor_local_disponible' : 'receptor_no_disponible')
                : failed ? 'error' : recent ? (sync.recovery_active ? 'recuperando' : 'sincronizando') : 'sin_sincronizacion_reciente',
            error: row.provider === 'getyourguide' && failed ? 'GYG_SYNC_ERROR' : null };
    });
}

async function cambiarControl(provider, activado, idUsuario, db = pool) {
    validarProvider(provider);
    if (typeof activado !== 'boolean') throw Object.assign(Error('activado debe ser booleano'), { statusCode: 400 });
    const tx = await db.connect();
    try {
        await tx.query('BEGIN');
        // Mismo orden de bloqueo que el trigger; serializa receptores y otros controles.
        const previous = (await tx.query(`SELECT avisos_activados FROM integracion_sync_estado
            WHERE provider = $1 AND source = 'publicacion' FOR UPDATE`, [provider])).rows[0];
        if (!previous) throw Error('Control no instalado');
        let liberados = 0;
        if (previous.avisos_activados !== activado) {
            await tx.query(`UPDATE integracion_sync_estado SET avisos_activados = $2, updated_at = CURRENT_TIMESTAMP
                WHERE provider = $1 AND source = 'publicacion'`, [provider, activado]);
            if (activado) {
                const result = await tx.query(`UPDATE eventos_integracion SET aviso_publicado = true
                    WHERE provider = $1 AND aviso_publicado = false`, [provider]);
                liberados = result.rowCount;
            }
            await crearEntradaBitacora({ idUsuario, idReservacion: null,
                accion: activado ? 'INTEGRACION_ACTIVADA' : 'INTEGRACION_PAUSADA',
                descripcion: `${provider}: avisos ${activado ? 'activados' : 'pausados'}. Avisos liberados: ${liberados}. Recepción continua; revisión manual.` }, tx);
        }
        await tx.query('COMMIT');
        return { provider, activado, liberados };
    } catch (error) {
        await tx.query('ROLLBACK').catch(() => {}); throw error;
    } finally { tx.release(); }
}

module.exports = { listarControles, cambiarControl, validarProvider, comprobarFareHarbor };
