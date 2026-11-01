// Transicion exclusiva de la tarea GYG. Respaldo obligatorio; rollback de codigo,
// nunca de datos. No crea ni aplica reservaciones internas.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
delete process.env.PSModulePath;
const root = path.resolve(__dirname, '../..');
const dir = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/getyourguide');
const runtime = path.join(dir, 'runtime'), configFile = path.join(dir, 'continuous.json');
const reportFile = path.join(dir, 'priority-deployment.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const files = ['backend/integrations/getyourguide/getyourguideContinuous.service.js',
    'backend/integrations/getyourguide/getyourguideRecentSync.service.js',
    'backend/integrations/getyourguide/getyourguideGmailSync.service.js',
    'backend/services/integracionSyncEstado.service.js', 'scripts/integrations/getyourguideContinuous.cjs'];
const report = { startedAt: new Date().toISOString(), phase: 'PREPARING', result: 'PENDING' };
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
function ps(script) {
    const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop';" + script, 'utf16le').toString('base64')],
        { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    if (result.status !== 0) throw Error('GYG_WINDOWS_TASK_OPERATION_FAILED');
    return result.stdout.trim();
}
const taskSnapshot = () => JSON.parse(ps(`$s=New-Object -ComObject Schedule.Service;$s.Connect();$f=$s.GetFolder('\');
@('CommunityTours-GetYourGuideContinuous','CommunityTours-FareHarborContinuous')|ForEach-Object {$t=$f.GetTask($_);
[pscustomobject]@{name=$_;state=[int]$t.State;xml=$t.Xml;lastRun=$t.LastRunTime.ToUniversalTime().ToString('o')}}|ConvertTo-Json -Depth 3`));
async function main() {
    const config = JSON.parse(fs.readFileSync(configFile));
    if (!config.enabled || config.intervalMs !== 120000) throw Error('GYG_CONFIG_INVALID');
    const checkpointBackup = JSON.parse(fs.readFileSync(path.join(dir, 'priority-backup.json')));
    const verified = JSON.parse(fs.readFileSync(path.join(checkpointBackup.directory, 'verification.json')));
    if (checkpointBackup.status !== 'VERIFIED' || verified.status !== 'VERIFIED' || !verified.independentSha256Matched
        || hash(checkpointBackup.file) !== checkpointBackup.sha256 || verified.sha256 !== checkpointBackup.sha256) throw Error('GYG_VERIFIED_BACKUP_REQUIRED');
    for (const [relative, digest] of Object.entries(config.sourceHashes)) {
        if (!path.resolve(runtime, relative).startsWith(runtime + path.sep) || hash(path.join(runtime, relative)) !== digest) throw Error('GYG_EXISTING_SOURCE_CHANGED');
    }
    const acl = require('../../backend/config/windowsConfigAcl').checkAcl;
    acl(configFile); acl(checkpointBackup.file);
    const stage = path.join(dir, 'deployments', 'priority-' + new Date().toISOString().replace(/[-:.]/g, ''));
    fs.mkdirSync(stage, { recursive: true });
    fs.copyFileSync(configFile, path.join(stage, 'continuous.previous.json'));
    for (const relative of files) {
        const next = path.join(stage, 'next', relative), prior = path.join(stage, 'previous', relative), current = path.join(runtime, relative);
        fs.mkdirSync(path.dirname(next), { recursive: true }); fs.mkdirSync(path.dirname(prior), { recursive: true });
        if (fs.existsSync(current)) fs.copyFileSync(current, prior);
        fs.copyFileSync(path.join(root, relative), next); acl(next);
        const syntax = cp.spawnSync(config.nodeExecutable, ['--check', next], { windowsHide: true, stdio: 'ignore' });
        if (syntax.status !== 0) throw Error('GYG_STAGE_SYNTAX_FAILED');
        config.sourceHashes[relative] = hash(next);
    }
    const beforeTasks = taskSnapshot();
    if (beforeTasks.find(t => t.name === 'CommunityTours-GetYourGuideContinuous').state !== 4) throw Error('GYG_EXPECTED_RUNNING_TASK');
    const fhConfig = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/fareharbor/continuous.json');
    const fhBefore = hash(fhConfig), credentialsBefore = hash(path.join(dir, 'oauth/credentials.json'));
    const postgres = require('../../backend/config/desktopPolicy').readConfig(config.postgresConfigPath).config;
    require('../../backend/config/desktopConfiguration').initialize(postgres);
    const db = require('../../backend/config/database');
    await require('../../backend/config/desktopPostgres').verifyPostgres(db, { ...postgres, DB_HOST: '127.0.0.1' });
    const guard = await db.connect(); let locked = false, stopped = false;
    try {
        report.backup = checkpointBackup.directory; report.runtimeBackup = stage;
        report.phase = 'WAITING_FOR_IDLE_WORKER'; save();
        const lockDeadline = Date.now() + 150000;
        while (Date.now() < lockDeadline) {
            locked = (await guard.query('SELECT pg_try_advisory_lock($1::int,$2::int) locked', [0x475947, 0x53594e43])).rows[0].locked;
            if (locked) break; await wait(1000);
        }
        if (!locked) throw Error('GYG_IDLE_WINDOW_UNAVAILABLE');
        report.checkpointBefore = (await guard.query("SELECT recovery_active,recovery_page_token IS NOT NULL AS has_page,last_history_id,recovery_target_history_id FROM integracion_sync_estado WHERE provider=$1 AND source=$2", ['getyourguide','gmail'])).rows[0];
        report.phase = 'TRANSITIONING_GYG_ONLY'; save();
        ps("Stop-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous'"); stopped = true;
        for (let i = 0; i < 30; i++) { if (taskSnapshot().find(t => t.name === 'CommunityTours-GetYourGuideContinuous').state !== 4) break; await wait(250); }
        if (taskSnapshot().find(t => t.name === 'CommunityTours-GetYourGuideContinuous').state === 4) throw Error('GYG_OLD_TASK_STILL_RUNNING');
        for (const relative of files) fs.copyFileSync(path.join(stage, 'next', relative), path.join(runtime, relative));
        const temporary = configFile + '.priority.tmp'; fs.writeFileSync(temporary, JSON.stringify(config, null, 2));
        fs.renameSync(temporary, configFile);
        await guard.query('SELECT pg_advisory_unlock($1::int,$2::int)', [0x475947, 0x53594e43]); locked = false;
        report.startedNewAt = new Date().toISOString();
        ps("Start-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous'");
        report.phase = 'VERIFYING_NEW_WORKER'; save();
        const deadline = Date.now() + 180000;
        let status;
        while (Date.now() < deadline) {
            await wait(2000);
            try { status = JSON.parse(fs.readFileSync(path.join(dir, 'continuous-status.json'))); } catch { continue; }
            if (status.version === 2 && Date.parse(status.updatedAt) > Date.parse(report.startedNewAt)
                && status.code === 'GYG_SYNC_OK' && status.recent?.checkedAt) break;
        }
        if (!(status?.version === 2 && status.code === 'GYG_SYNC_OK' && status.recent?.checkedAt
            && Date.parse(status.updatedAt) > Date.parse(report.startedNewAt))) throw Error('GYG_NEW_WORKER_NOT_READY');
        const afterTasks = taskSnapshot();
        report.taskDefinitionsUnchanged = beforeTasks.every(before => afterTasks.find(after => after.name === before.name)?.xml === before.xml);
        report.fareharborConfigurationUnchanged = hash(fhConfig) === fhBefore;
        report.oauthCredentialsUnchanged = hash(path.join(dir, 'oauth/credentials.json')) === credentialsBefore;
        if (!report.taskDefinitionsUnchanged || !report.fareharborConfigurationUnchanged || !report.oauthCredentialsUnchanged) throw Error('GYG_DEPLOY_INVARIANT_CHANGED');
        report.status = status; report.result = 'GYG_PRIORITY_DEPLOYED'; report.phase = 'COMPLETE';
    } catch (error) {
        report.result = /^GYG_[A-Z_]+$/.test(error.message) ? error.message : 'GYG_PRIORITY_DEPLOY_FAILED';
        if (stopped) {
            try {
                ps("if((Get-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous').State -eq 'Running'){Stop-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous'}");
                for (const relative of files) { const prior = path.join(stage, 'previous', relative); if (fs.existsSync(prior)) fs.copyFileSync(prior, path.join(runtime, relative)); }
                fs.copyFileSync(path.join(stage, 'continuous.previous.json'), configFile);
                if (locked) { await guard.query('SELECT pg_advisory_unlock($1::int,$2::int)', [0x475947, 0x53594e43]); locked = false; }
                ps("Start-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous'");
                report.rollback = 'PREVIOUS_CODE_RESTARTED_NO_DATA_ROLLBACK';
            } catch { report.rollback = 'GYG_ROLLBACK_REQUIRES_ATTENTION'; }
        }
    } finally {
        if (locked) await guard.query('SELECT pg_advisory_unlock($1::int,$2::int)', [0x475947, 0x53594e43]).catch(() => {});
        guard.release(); await db.end(); report.finishedAt = new Date().toISOString(); save();
    }
    console.log(JSON.stringify(report)); if (report.result !== 'GYG_PRIORITY_DEPLOYED') process.exitCode = 1;
}
main().catch(error => { report.result = /^GYG_[A-Z_]+$/.test(error.message) ? error.message : 'GYG_PRIORITY_PREDEPLOY_FAILED'; save(); console.error(report.result); process.exitCode = 1; });
