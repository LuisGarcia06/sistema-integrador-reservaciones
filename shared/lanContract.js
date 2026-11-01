// Contrato público: no descubre equipos ni cambia adaptadores, DNS o firewall.
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const ENVIRONMENT = 'https-private-lan-lab', PROTOCOL = 2;
const fail = code => { throw Object.assign(Error(code), { code }); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = value => /^[a-f0-9]{64}$/.test(value || '');
const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value || '');
const forbiddenPorts = new Set([3000,3443,5432,55473,57593,57479,57512,57533,55432,65435,51621,53043,62415]);
const validPort = n => Number.isInteger(n) && n >= 1024 && n <= 65535 && !forbiddenPorts.has(n);
function exactKeys(object, keys) {
    if (!object || typeof object !== 'object' || Array.isArray(object) ||
        Object.keys(object).sort().join('|') !== [...keys].sort().join('|')) fail('LAN_CONFIG');
}
function privateAddress(value) {
    if (typeof value !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
    const a = value.split('.').map(Number);
    return a.every((v,i) => v <= 255 && String(v) === value.split('.')[i]) && a[3] > 0 && a[3] < 255 &&
        (a[0] === 10 || a[0] === 172 && a[1] >= 16 && a[1] <= 31 || a[0] === 192 && a[1] === 168);
}
function validateSnapshot(s) {
    exactKeys(s,['machine','adapter','address','prefix','category','gateways','dns','activeAdapters']);
    if (!hex(s.machine) || !uuid(s.adapter) || !privateAddress(s.address) || s.prefix !== 24 || s.category !== 'Private' ||
        !Array.isArray(s.gateways) || s.gateways.length || !Array.isArray(s.dns) || s.dns.length || s.activeAdapters !== 1) fail('LAN_NETWORK_NOT_ISOLATED');
    return s;
}
function validateTopology(t, now = Date.now()) {
    exactKeys(t,['version','networkId','topology','isolatedNetworkConfirmed','approvedBy','expiresAt','server','client']);
    if (t.version !== 1 || !uuid(t.networkId) || !['dedicated-disconnected-switch','internal-vm-network'].includes(t.topology) ||
        t.isolatedNetworkConfirmed !== true || typeof t.approvedBy !== 'string' || !t.approvedBy.trim() ||
        !Number.isFinite(Date.parse(t.expiresAt)) || Date.parse(t.expiresAt) <= now || Date.parse(t.expiresAt) > now + 7*86400000) fail('LAN_APPROVAL_REQUIRED');
    validateSnapshot(t.server); validateSnapshot(t.client);
    if (t.server.machine === t.client.machine || t.server.address === t.client.address ||
        t.server.address.split('.').slice(0,3).join('.') !== t.client.address.split('.').slice(0,3).join('.')) fail('LAN_TWO_HOSTS_REQUIRED');
    return t;
}
// Inventario local, sin sockets ni credenciales. Una firma/atestación física no se infiere de este inventario.
const INSPECT = `
$ErrorActionPreference='Stop'
$machine=(Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid
$hash=[Security.Cryptography.SHA256]::Create()
$id=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($machine)))).Replace('-','').ToLowerInvariant()
$adapters=@(Get-NetAdapter | Where-Object Status -eq 'Up')
if($adapters.Count -ne 1){throw 'LAN_SINGLE_ADAPTER_REQUIRED'}
$adapter=$adapters[0]
$ip=@(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 | Where-Object AddressState -eq 'Preferred')
if($ip.Count -ne 1){throw 'LAN_SINGLE_IPV4_REQUIRED'}
$profile=Get-NetConnectionProfile -InterfaceIndex $adapter.ifIndex
$gateway=@(Get-NetRoute -InterfaceIndex $adapter.ifIndex | Where-Object {$_.DestinationPrefix -in @('0.0.0.0/0','::/0')} | ForEach-Object NextHop)
$dns=@(Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex | ForEach-Object ServerAddresses)
[ordered]@{machine=$id;adapter=([string]$adapter.InterfaceGuid).Trim('{}').ToLowerInvariant();address=$ip[0].IPAddress;prefix=[int]$ip[0].PrefixLength;category=[string]$profile.NetworkCategory;gateways=$gateway;dns=$dns;activeAdapters=$adapters.Count}|ConvertTo-Json -Compress
`;
function inspectLocal() {
    if (process.platform !== 'win32') fail('LAN_WINDOWS_REQUIRED');
    const r = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(INSPECT,'utf16le').toString('base64')],
        {encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384});
    if (r.status !== 0) fail('LAN_INVENTORY_UNAVAILABLE');
    return JSON.parse(r.stdout.replace(/^\uFEFF/,''));
}
function verifyLocal(t, role, current = inspectLocal()) {
    validateTopology(t); validateSnapshot(current);
    if (!['server','client'].includes(role) || Object.keys(t[role]).some(k => JSON.stringify(t[role][k]) !== JSON.stringify(current[k]))) fail('LAN_NETWORK_CHANGED');
    return current;
}
function validateEndpoint(c) {
    if (c.version !== 1 || c.environment !== ENVIRONMENT || c.protocol !== PROTOCOL || !uuid(c.serverId) ||
        !hex(c.code) || !hex(c.clientCode) || !hex(c.caDigest) || !hex(c.publicKeyDigest) || !hex(c.tlsSpki) ||
        !privateAddress(c.address) || !validPort(c.port) || !/^[a-z][a-z0-9-]{0,40}\.ctsk-lab\.test$/.test(c.name || '') ||
        c.origin !== `https://${c.address}:${c.port}`) fail('LAN_ENDPOINT');
    validateTopology(c.network);
    if (c.address !== c.network.server.address) fail('LAN_ENDPOINT');
    return c;
}
function authorizeRequest(config, req) {
    // Sin proxy/forwarded headers: la IP efectiva procede exclusivamente del socket TLS.
    if (req.socket.remoteAddress !== config.network.client.address || req.socket.localAddress !== config.address ||
        req.headers.host !== `${config.address}:${config.port}` || !req.url.startsWith('/') || req.url.startsWith('//') ||
        /[\\%\x00-\x20\x7f]/.test(req.url.split('?')[0])) return false;
    let u; try { u = new URL(req.url,config.origin); } catch { return false; }
    if (u.origin !== config.origin || /(?:^|\/)\.{1,2}(?:\/|$)/.test(req.url.split('?')[0])) return false;
    return !/^\/api\/(?:integraciones|webhooks)(?:\/|$)/i.test(u.pathname);
}
function cleanClientEnvironment(source = process.env) {
    if (source.NODE_ENV && source.NODE_ENV !== 'production') fail('ENV_CONFLICT');
    for (const k of Object.keys(source)) if (/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|NODE_TLS_REJECT_UNAUTHORIZED$|ELECTRON_RUN_AS_NODE$|GYG_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|GOOGLE_|JWT_|INTEGRATION_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(k)) fail('ENV_CONFLICT');
}
module.exports = {ENVIRONMENT,PROTOCOL,INSPECT,sha,hex,uuid,fail,validPort,exactKeys,privateAddress,validateSnapshot,validateTopology,inspectLocal,verifyLocal,validateEndpoint,authorizeRequest,cleanClientEnvironment};
