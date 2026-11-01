'use strict';
// Se prueba la frontera Node y el texto de las reglas, nunca ACL reales ni PowerShell.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const files = ['backend/config/windowsConfigAcl.js', 'shared/windowsConfigAcl.js'];
const profiles = ['VMUser', 'VM User', 'VM Usuario Prueba', 'María Álvarez',
  "O'Connor & Á (Prueba) %PATH% ! ^ $ ` ;"];
function harness(file, result) {
  const module = { exports: {} }, calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, Buffer, process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } },
    require(id) {
      if (id === 'node:path') return path;
      if (id === 'node:child_process') return { spawnSync(exe, args, options) {
        calls.push({ exe, args, options }); return result;
      } };
      throw Error('UNEXPECTED_IMPORT');
    }
  });
  return { acl: module.exports, calls };
}
for (const file of files) {
  test(file + ': regresión original, status cero con error era aceptado', () => {
    const saved = 'before/' + file.replace(/\//g, '__') + '.txt';
    const original = fs.readFileSync(path.join(root, 'docs/local-fase-2e7-security-review', saved), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(original, { module, Buffer, process: { env: {} }, require });
    assert.doesNotThrow(() => module.exports.checkAcl('synthetic', {
      platform: 'win32', run: () => ({ status: 0, error: { code: 'ETIMEDOUT' } })
    }));
    assert.throws(() => harness(file, { status: 0, error: { code: 'ETIMEDOUT' } }).acl.checkAcl('synthetic'),
      error => error.code === 'CONFIG_ACL');
  });
  test(file + ': rechazo de resultado ausente, timeout, señal y estado ambiguo', () => {
    for (const result of [null, undefined, {}, { status: null }, { status: '0' }, { status: 4 },
      { status: 0, error: { code: 'ENOENT' } }, { status: 0, signal: 'SIGTERM' },
      { status: 3, error: { code: 'ETIMEDOUT' } }, { status: 3, signal: 'SIGTERM' }])
      assert.throws(() => harness(file, result).acl.checkAcl('synthetic'), error => error.code === 'CONFIG_ACL');
    assert.throws(() => harness(file, { status: 3 }).acl.checkAcl('synthetic'), error => error.code === 'CONFIG_MISSING');
  });
  test(file + ': plataforma ajena se rechaza antes del proceso', () => {
    const h = harness(file, { status: 0 });
    assert.throws(() => h.acl.checkAcl('synthetic', { platform: 'linux' }), error => error.code === 'CONFIG_ACL');
    assert.equal(h.calls.length, 0);
  });
  for (const profile of profiles) test(file + ': frontera de entrada literal ' + profile, () => {
    const h = harness(file, { status: 4 });
    const filename = 'C:\\Users\\' + profile + '\\AppData\\Local\\CommunityTours\\server026.json';
    assert.throws(() => h.acl.checkAcl(filename), error => error.code === 'CONFIG_ACL');
    assert.equal(h.calls.length, 1);
    const call = h.calls[0];
    assert.equal(call.options.input, filename);
    assert.equal(call.options.timeout, 15000);
    assert.ok(!call.args.some(arg => arg.includes(filename) || arg.includes(profile)));
    // La dependencia heredada sigue presente; esto NO certifica Restricted.
    assert.ok(call.args.includes('-EncodedCommand'));
  });
}
test('servidor y copia compartida conservan las mismas reglas ACL', () => {
  const scripts = files.map(file => harness(file, { status: 4 }).acl.SCRIPT
    .replace("[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)\n", ''));
  assert.equal(scripts[0], scripts[1]);
  const rules = scripts[0];
  for (const value of ['ReparsePoint', 'Access.Count -eq 0', 'GetOwner', '-notin $trusted',
    'InheritOnly', 'GetAccessRules($true,$true', '2032127', '852310', '852032',
    'S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'])
    assert.ok(rules.includes(value));
  assert.ok(!/Set-Acl|icacls|Bypass|Set-ExecutionPolicy/.test(rules));
});
