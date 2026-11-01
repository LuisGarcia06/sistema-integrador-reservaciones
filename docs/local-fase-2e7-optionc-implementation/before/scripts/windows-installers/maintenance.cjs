'use strict';
// Herramienta local separada. La autoridad y las claves siempre son archivos privados externos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function validateRequest(request) {
  const fields = {
    init: ['action', 'scope', 'directory', 'authority', 'authorityKey', 'certificate', 'tlsKey'],
    restore: ['action', 'scope', 'directory', 'authority', 'authorityKey', 'certificate', 'tlsKey', 'sourceServer', 'sourceAuthority', 'bundleDirectory'],
    bootstrap: ['action', 'scope', 'server', 'authority', 'authorityKey'],
    client: ['action', 'scope', 'server', 'authority', 'authorityKey', 'clientRoot', 'directory', 'ca'],
    backup: ['action', 'scope', 'server', 'authority', 'directory']
  };
  if (!request || request.scope !== 'synthetic-acceptance-only' || !fields[request.action] ||
      Object.keys(request).sort().join(',') !== fields[request.action].sort().join(',')) throw Error('MAINTENANCE_REQUEST');
  for (const key of fields[request.action].filter(k => !['action', 'scope'].includes(k))) {
    if (typeof request[key] !== 'string' || !path.isAbsolute(request[key]) || request[key].startsWith('\\\\')) throw Error('MAINTENANCE_PATH');
  }
  return request;
}
async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== '--isolated-lab') throw Error('MAINTENANCE_ISOLATED_LAB_REQUIRED');
  const base = path.resolve(__dirname, '..'), root = path.join(base, 'app');
  require('./payload.cjs').verify(base, 'server');
  const Q = require(path.join(root, 'scripts/enterprise026Provision.cjs'));
  const P = require(path.join(root, 'backend/config/enterprise026Policy.js'));
  const acl = require(path.join(root, 'backend/config/windowsConfigAcl.js')).checkAcl;
  process.env = Q.environment();
  const privateBytes = file => {
    if (!path.isAbsolute(file) || fs.realpathSync(file) !== file || file.startsWith('\\\\')) throw Error('MAINTENANCE_PATH');
    acl(file); return fs.readFileSync(file);
  };
  const request = validateRequest(JSON.parse(privateBytes(argv[1])));
  if (['init','restore'].includes(request.action)) throw Error('OPTION_C_PROVISIONING_UNVALIDATED');
  const authority = P.trust(JSON.parse(privateBytes(request.authority)));
  const key = request.authorityKey ? privateBytes(request.authorityKey).toString() : null;
  if (key) Q.signer(authority, key); // Antes de crear clúster o cambiar datos.
  if (['init', 'restore'].includes(request.action)) {
    const restoring = request.action === 'restore';
    const Backup = restoring ? require(path.join(root, 'scripts/enterprise026Backup.cjs')) : null;
    let sourcePlan, bundle, metadata;
    if (restoring) {
      sourcePlan = P.readPlan(request.sourceServer, request.sourceAuthority, root);
      bundle = { file: path.join(request.bundleDirectory, 'database.dump'),
        metadata: JSON.parse(privateBytes(path.join(request.bundleDirectory, 'backup.json'))) };
      privateBytes(bundle.file);
      metadata = Backup.validateArchive(bundle, sourcePlan.manifest.verificationKey);
      if (metadata.sourceCluster !== sourcePlan.manifest.cluster || metadata.sourceDatabase !== sourcePlan.manifest.database ||
          metadata.installationId !== sourcePlan.manifest.installationId || metadata.generation !== sourcePlan.manifest.dataGeneration ||
          metadata.commandKeyDigest !== P.sha(sourcePlan.commandKey) ||
          JSON.stringify(metadata.bootstrapOrigin) !== JSON.stringify(sourcePlan.manifest.bootstrapOrigin)) throw Error('MAINTENANCE_BACKUP_ORIGIN');
    }
    const certificate = privateBytes(request.certificate), privateKey = privateBytes(request.tlsKey);
    const cert = new crypto.X509Certificate(certificate);
    if (cert.checkIP('127.0.0.1') !== '127.0.0.1' || cert.ca || Date.parse(cert.validFrom) > Date.now() ||
        Date.parse(cert.validTo) <= Date.now() || !cert.checkPrivateKey(crypto.createPrivateKey(privateKey))) throw Error('MAINTENANCE_TLS');
    const created = await Q.provision({ directory: request.directory, root, authority, authorityKey: key, certificate, privateKey, restoreOnly: restoring });
    let db;
    try {
      db = new (require(path.join(root, 'node_modules/pg')).Client)({ host: '127.0.0.1',
        port: created.plan.manifest.pgPort, database: created.plan.manifest.database,
        user: P.SQL_PRINCIPAL, password: created.password, connectionTimeoutMillis: 5000 });
      await db.connect(); await P.maintenanceIdentity(db, created.plan);
      if (restoring) {
        await Backup.restore({ db, plan: created.plan, password: created.password, bundle, trustedAuthority: sourcePlan.manifest.verificationKey });
        created.s.manifest = { ...created.s.manifest, state: 'restored', dataGeneration: metadata.generation, bootstrapOrigin: metadata.bootstrapOrigin };
        created.s.commandKey = sourcePlan.commandKey;
        created.s.restorationReceipt = Q.signer(authority, key)({ purpose: 'ctsk-restoration026-v1',
          installationId: created.s.manifest.installationId, authEpoch: created.s.manifest.authEpoch,
          targetCluster: created.s.manifest.cluster, targetDatabase: created.s.manifest.database,
          generation: metadata.generation, commandKeyDigest: P.sha(sourcePlan.commandKey),
          sourceCluster: sourcePlan.manifest.cluster, archiveSha256: metadata.archiveSha256 });
        created.plan = Q.persist(created.s, authority, key);
        await require(path.join(root, 'scripts/enterprise026Supervisor.cjs')).verifyInitialized(db, created.plan);
        console.log('RESTORED_TO_NEW_CLUSTER_OLD_SESSION_REVOKED');
      } else {
        const t0 = await require(path.join(root, 'backend/services/cleanInstallationCertification.service.js')).inspect(db, created.plan);
        if (!t0.clean) throw Error('MAINTENANCE_T0_REJECTED');
        fs.writeFileSync(path.join(request.directory, 't0-installation026.json'), JSON.stringify(t0, null, 2), { flag: 'wx' });
        console.log('NEW_SYNTHETIC_INSTALLATION_T0_VERIFIED');
      }
    } finally {
      await db?.end(); Q.control(created.plan.manifest, 'stop'); created.password = null;
    }
    return;
  }
  let plan = P.readPlan(request.server, request.authority, root);
  if (request.action === 'client') {
    require('./payload.cjs').verify(request.clientRoot, 'client');
    const clientRoot = path.join(request.clientRoot, 'runtime/resources/app');
    const inv = P.inventory(clientRoot);
    if (inv.side !== 'client' || plan.manifest.state === 'empty' ||
        path.dirname(request.directory) !== fs.realpathSync(process.env.LOCALAPPDATA) ||
        fs.realpathSync(request.directory) !== request.directory || fs.readdirSync(request.directory).length) throw Error('MAINTENANCE_CLIENT_TARGET');
    const ca = privateBytes(request.ca).toString();
    if (!new crypto.X509Certificate(ca).ca || !new crypto.X509Certificate(fs.readFileSync(path.join(plan.manifest.directory, 'certificate.pem'))).verify(new crypto.X509Certificate(ca).publicKey)) throw Error('MAINTENANCE_CA');
    if (!plan.manifest.bootstrapOrigin || !['initialized','restored'].includes(plan.manifest.state)) throw Error('MAINTENANCE_BOOTSTRAP_REQUIRED');
    require('./client-enrollment.cjs').verifyServerState(plan,{policy:P,privateBytes});
    const current=P.readPlan(request.server,request.authority,root);
    if(current.digest!==plan.digest)throw Error('MAINTENANCE_SERVER_CHANGED');
    const m = plan.manifest, body = { purpose: 'ctsk-client-descriptor026-v1', directory: request.directory,
      clientDigest: inv.digest, installationId: m.installationId, authEpoch: m.authEpoch, generation: m.dataGeneration,
      origin: 'https://127.0.0.1:' + m.httpPort, code: m.code, tlsSpki: m.tlsSpki, verificationKey: m.verificationKey, ca };
    require('./client-enrollment.cjs').publish({directory:request.directory,authority,
      envelope:Q.signer(authority,key)(body),checkAcl:acl,sha:P.sha,sign:Q.signer(authority,key),authorize:P.authorized,
      validate:(file,trust)=>require(path.join(clientRoot,'electron/enterprise026ClientPolicy.js')).readClient(file,trust,clientRoot)});
    console.log('CLIENT026_DESCRIPTOR_CREATED_EXTERNAL'); return;
  }
  let db, started = false, capture, input;
  try {
    const m = plan.manifest;
    const maintenance = JSON.parse(privateBytes(path.join(m.directory, 'maintenance026.json')));
    if (maintenance.provisionId !== m.provisionId || maintenance.cluster !== m.cluster || maintenance.database !== m.database ||
        maintenance.port !== m.pgPort || maintenance.user !== P.SQL_PRINCIPAL) throw Error('MAINTENANCE_IDENTITY');
    if (!fs.existsSync(path.join(m.dataDirectory, 'postmaster.pid'))) { Q.control(m, 'start'); started = true; }
    db = new (require(path.join(root, 'node_modules/pg')).Client)({ host: '127.0.0.1', port: m.pgPort,
      database: m.database, user: P.SQL_PRINCIPAL, password: maintenance.password, connectionTimeoutMillis: 5000 });
    await db.connect(); await P.maintenanceIdentity(db, plan);
    if (request.action === 'bootstrap') {
      const B = require(path.join(root, 'backend/services/enterprise026Bootstrap.service.js'));
      await B.preflight(db, plan);
      capture = require(path.join(root, 'scripts/enterprise026Bootstrap.cjs')).localCapture();
      input = { nombre: await capture.ask('Nombre del primer Administrador: '), correo: await capture.ask('Correo: '),
        password: await capture.ask('Contraseña nueva (sin eco): ', true), confirmacion: await capture.ask('Confirmación (sin eco): ', true) };
      B.validateInput(input);
      if (await capture.ask('Escribe INICIALIZAR para confirmar: ') !== 'INICIALIZAR') throw Error('MAINTENANCE_CANCELLED');
      const attempt = crypto.randomUUID(), created = await B.initialize(db, plan, input, attempt);
      // Constancia durable antes de reinscripción: ante fallo, no repetir bootstrap.
      const body = { purpose: 'ctsk-bootstrap-completed026-v1', attempt, user: created.id_usuario,
        cluster: m.cluster, generation: m.dataGeneration, code: m.code, installationId: m.installationId };
      fs.writeFileSync(path.join(m.directory, 'bootstrap-completed026.json'), JSON.stringify(P.sign(plan.signingKey, body), null, 2), { flag: 'wx' });
      const row = await B.inspect(db, plan, attempt);
      if (row.id_usuario_inicial !== created.id_usuario) throw Error('MAINTENANCE_BOOTSTRAP_RECEIPT');
      const state = JSON.parse(privateBytes(request.server));
      state.manifest = { ...m, state: 'initialized', bootstrapOrigin: { attempt, user: created.id_usuario, cluster: m.cluster, code: m.code } };
      plan = Q.persist(state, authority, key);
      console.log('FIRST_ADMIN_CREATED_REENROLLMENT_COMPLETED');
    } else {
      if (m.state === 'empty') throw Error('MAINTENANCE_BOOTSTRAP_REQUIRED');
      await require(path.join(root, 'scripts/enterprise026Supervisor.cjs')).verifyInitialized(db, plan);
      await require(path.join(root, 'scripts/enterprise026Backup.cjs')).backup({ db, plan, password: maintenance.password, directory: request.directory });
      console.log('BACKUP026_CREATED_PRIVATE');
    }
    maintenance.password = null;
  } finally {
    if (input) { input.password = null; input.confirmacion = null; }
    capture?.close(); await db?.end();
    if (started && fs.existsSync(path.join(plan.manifest.dataDirectory, 'postmaster.pid'))) Q.control(plan.manifest, 'stop');
  }
}
if (require.main === module) main().catch(() => { console.error('MAINTENANCE026_REJECTED_REVIEW_PRIVATE_STATE'); process.exitCode = 1; });
module.exports = { main, validateRequest };
