'use strict';
// Evalúa propiedades declaradas, no la autenticidad del informe ni PostgreSQL.
const ALLOWED = new Set(['SeLockMemoryPrivilege', 'SeChangeNotifyPrivilege']);
const GROUP_SIDS = Object.freeze(['S-1-5-32-544', 'S-1-5-32-547']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
function sid(value) {
  if (typeof value !== 'string' || !/^S-1-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*)){1,15}$/.test(value)) return false;
  const parts = value.split('-').slice(2).map(Number);
  return parts[0] <= 281474976710655 && parts.slice(1).every(x => x <= 4294967295);
}
const reject = reason => ({ verified: false, reason, fullPostgresEquivalence: false });
function assess(report) {
  if (!record(report) || report.status !== 0 || report.error !== null || report.signal !== null || !record(report.child))
    return reject('NATIVE_PROBE_NOT_EXECUTED');
  const c = report.child;
  if (!keysAre(c, ['schemaVersion', 'user', 'privileges', 'privilegesComplete', 'groups', 'groupsComplete', 'hasRestrictions']) ||
      c.schemaVersion !== 1 || c.groupsComplete !== true || c.privilegesComplete !== true ||
      !sid(c.user) || !sid(report.expectedUserSid) || c.user !== report.expectedUserSid || !keysAre(c.groups, GROUP_SIDS))
    return reject('TOKEN_EVIDENCE_INCOMPLETE');
  if (c.hasRestrictions !== true) return reject('TOKEN_RESTRICTION_UNPROVEN');
  if (!Array.isArray(c.privileges) || c.privileges.length !== new Set(c.privileges).size ||
      Array.from(c.privileges).some(name => typeof name !== 'string' || !ALLOWED.has(name)))
    return reject('TOKEN_PRIVILEGE_NOT_EQUIVALENT');
  for (const group of GROUP_SIDS) {
    // null significa ausencia explícita tras enumeración completa; omisión es error.
    const attributes = c.groups[group];
    if (attributes !== null && (!Number.isInteger(attributes) || (attributes !== 16 && attributes !== 17)))
      return reject('TOKEN_GROUP_NOT_DENY_ONLY');
  }
  return { verified: true, reason: 'TOKEN_PROPERTIES_ONLY', fullPostgresEquivalence: false };
}
module.exports = { assess, GROUP_SIDS };
