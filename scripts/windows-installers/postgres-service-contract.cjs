'use strict';
// Preparación offline para revisión: NO ejecuta, registra ni controla servicios.
// La evidencia recibida no se autentica aquí. No integrar sin un lector nativo
// verificado y un vínculo firmado al plan/inventario; nunca autoriza instalación.
const path = require('node:path').win32;
const PG = require('../../shared/postgresExperimentalContract');
const SCOPE = 'synthetic-acceptance-only';
const BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const CMD = 'C:\\Windows\\System32\\cmd.exe';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const USER_SID = /^S-1-5-80-(?:\d+-){4}\d+$/;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
function fail(code) { throw Object.assign(Error(code), { code }); }
function requireCondition(value, code) { if (!value) fail(code); }
function createPlan(input) {
  requireCondition(exact(input, ['installationId', 'pgPort']) && typeof input.installationId === 'string' && UUID.test(input.installationId) &&
    Number.isInteger(input.pgPort) && input.pgPort >= 1024 && input.pgPort <= 65535 && input.pgPort !== 5432, 'PG_SERVICE_PLAN');
  const serviceName = 'CTSK026-' + input.installationId;
  const directory = path.join('C:\\ProgramData\\CommunityTours\\Acceptance026', input.installationId);
  const dataDirectory = path.join(directory, 'data');
  const initArgs = Object.freeze(['--pgdata=' + dataDirectory, '--username=ctsk_standalone_admin',
    '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + path.join(directory, 'private', 'init-password.tmp'), '--no-instructions']);
  const serviceArgs = Object.freeze(['runservice', '-N', serviceName, '-D', dataDirectory, '-w', '-t', '60']);
  return Object.freeze({ scope: SCOPE, productionAuthorized: false, installationId: input.installationId, pgPort: input.pgPort,
    postgresVersion: PG.VERSION, serverVersionNum: PG.SQL_VERSION_NUM,
    serviceName, serviceAccount: 'NT SERVICE\\' + serviceName, directory, dataDirectory,
    initdb: path.join(BIN, 'initdb.exe'), initArgs, serviceExecutable: path.join(BIN, 'pg_ctl.exe'), serviceArgs,
    postgres: path.join(BIN, 'postgres.exe'), comspec: CMD,
    architecture: 'official-exclusive-service-proposed', operationallyApproved: false });
}
function canonicalPlan(plan) {
  requireCondition(record(plan), 'PG_SERVICE_PLAN');
  const expected = createPlan({ installationId: plan.installationId, pgPort: plan.pgPort });
  requireCondition(exact(plan, Object.keys(expected)) && Object.keys(expected).every(key =>
    JSON.stringify(plan[key]) === JSON.stringify(expected[key])), 'PG_SERVICE_PLAN');
  return expected;
}
function reviewCmdContext(plan, evidence) {
  canonicalPlan(plan);
  requireCondition(exact(evidence, ['version', 'scope', 'productionAuthorized', 'principalSid', 'expectedPrincipalSid',
    'comspec', 'cmdSha256', 'enrolledCmdSha256', 'registry', 'registryReadComplete', 'registryAclStable', 'environment']), 'PG_CMD_EVIDENCE');
  requireCondition(evidence.version === 1 && evidence.scope === SCOPE && evidence.productionAuthorized === false &&
    typeof evidence.principalSid === 'string' && USER_SID.test(evidence.principalSid) &&
    evidence.principalSid === evidence.expectedPrincipalSid, 'PG_CMD_PRINCIPAL');
  requireCondition(evidence.comspec === CMD && sha(evidence.cmdSha256) &&
    evidence.cmdSha256 === evidence.enrolledCmdSha256, 'PG_CMD_IMAGE');
  requireCondition(evidence.registryReadComplete === true && evidence.registryAclStable === true &&
    exact(evidence.registry, ['machine64', 'machine32', 'principal64', 'principal32']) &&
    Object.values(evidence.registry).every(value => value === 'absent'), 'PG_CMD_AUTORUN_UNPROVEN');
  // No heredar el entorno del usuario/SCM; este es el entorno propuesto de initdb.
  const expectedEnv = { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: CMD,
    PATH: BIN + ';C:\\Windows\\System32', PGDATA: plan.dataDirectory,
    TEMP: path.join(plan.directory, 'private'), TMP: path.join(plan.directory, 'private') };
  requireCondition(exact(evidence.environment, Object.keys(expectedEnv)) && Object.keys(expectedEnv).every(key =>
    evidence.environment[key] === expectedEnv[key]), 'PG_CMD_ENVIRONMENT');
  return Object.freeze({ declaredContextAccepted: true, nativeContextVerified: false, operationallyApproved: false });
}
function reviewClusterBinding(plan, enrolled, observed) {
  canonicalPlan(plan);
  const keys = ['scope', 'productionAuthorized', 'installationId', 'serviceName', 'serviceAccount', 'serviceSid',
    'dataDirectory', 'systemIdentifier', 'database', 'pgPort', 'postgresImageSha256', 'postgresCreatedAt', 'postgresPid'];
  requireCondition(exact(enrolled, keys) && exact(observed, keys), 'PG_SERVICE_BINDING_INCOMPLETE');
  requireCondition(enrolled.scope === SCOPE && enrolled.productionAuthorized === false &&
    enrolled.installationId === plan.installationId && enrolled.serviceName === plan.serviceName &&
    enrolled.serviceAccount === plan.serviceAccount && USER_SID.test(enrolled.serviceSid) &&
    enrolled.dataDirectory === plan.dataDirectory && enrolled.pgPort === plan.pgPort &&
    typeof enrolled.systemIdentifier === 'string' && /^\d{19,20}$/.test(enrolled.systemIdentifier) &&
    enrolled.systemIdentifier !== '7632825987452064788' &&
    typeof enrolled.database === 'string' && /^ctsk_install_[a-f0-9]{24}$/.test(enrolled.database) &&
    sha(enrolled.postgresImageSha256) && typeof enrolled.postgresCreatedAt === 'string' && /^[a-f0-9]{16}$/.test(enrolled.postgresCreatedAt) &&
    Number.isInteger(enrolled.postgresPid) && enrolled.postgresPid > 0, 'PG_SERVICE_BINDING');
  requireCondition(keys.every(key => observed[key] === enrolled[key]), 'PG_SERVICE_IDENTITY_CHANGED');
  return Object.freeze({ declaredBindingAccepted: true, nativeIdentityVerified: false, operationallyApproved: false });
}
function reviewStopped(evidence) {
  requireCondition(exact(evidence, ['serviceState', 'postgresHandleSignaled', 'ownedProcessTreeEmpty',
    'pidFileAbsent', 'portReleased', 'cleanShutdownRecorded', 'identityRechecked']), 'PG_STOP_EVIDENCE');
  requireCondition(evidence.serviceState === 'stopped' && Object.entries(evidence).every(([key, value]) =>
    key === 'serviceState' || value === true), 'PG_STOP_UNPROVEN');
  return Object.freeze({ declaredStopAccepted: true, nativeStopVerified: false, operationallyApproved: false });
}
module.exports = { createPlan, reviewCmdContext, reviewClusterBinding, reviewStopped };
