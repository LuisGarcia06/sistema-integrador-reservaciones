'use strict';
// Solo contratos experimentales futuros. La versión no acredita procedencia,
// token, ACL ni autorización para ejecutar o aprovisionar PostgreSQL.
const VERSION = '18.6';
const SQL_VERSION_NUM = '180006';
const WINDOWS_FILE_VERSION = '18.0.6.0';
const TOOLS = Object.freeze(['postgres', 'pg_ctl', 'initdb', 'pg_dump', 'pg_restore', 'pg_controldata']);
function matchesToolVersion(tool, output) {
  if (!TOOLS.includes(tool) || typeof output !== 'string') return false;
  const expected = tool + ' (PostgreSQL) ' + VERSION;
  return output === expected || output === expected + '\n' || output === expected + '\r\n';
}
function matchesSqlVersion(value) { return value === SQL_VERSION_NUM; }
module.exports = Object.freeze({ VERSION, SQL_VERSION_NUM, WINDOWS_FILE_VERSION, TOOLS,
  matchesToolVersion, matchesSqlVersion, scope: 'synthetic-acceptance-only',
  productionAuthorized: false, operationallyApproved: false });
