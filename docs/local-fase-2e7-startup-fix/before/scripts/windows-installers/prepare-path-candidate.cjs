'use strict';
// Derivación futura: nunca modifica fuentes históricas ni candidate-01..04.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const R = require('../../shared/release026');
const root = path.resolve(__dirname, '../..');
const release = process.argv[2];
if (!/^2e7-candidate-\d{2}$/.test(release || '') || Number(release.slice(-2)) < 5) throw Error('NEW_RELEASE_REQUIRED');
const source = path.join(root, 'docs/local-fase-2e6-enterprise/candidate-08');
const out = path.join(root, 'dist/windows-2e7/sources-' + release);
fs.mkdirSync(out);
const previous = JSON.parse(fs.readFileSync(path.join(source, 'archives.json')));
const archives = {}, changes = [];
const zip = path.join(root, 'dist/windows-2e7/audit-tools/7zip-26.05/7z.exe');
for (const side of ['server', 'client']) {
  assert.equal(R.inventory(path.join(source, side)).digest, previous[side].inventoryDigest);
  const dest = path.join(out, side);
  fs.cpSync(path.join(source, side), dest, { recursive: true, errorOnExist: true, force: false });
  if (side === 'server') {
    const files = ['scripts/enterprise026Provision.cjs', 'shared/windowsProcess.js', 'backend/config/windowsConfigAcl.js'];
    if (Number(release.slice(-2)) >= 5) files.push('shared/postgresExperimentalContract.js', 'backend/config/enterprise026Policy.js');
    for (const file of files) {
      fs.copyFileSync(path.join(root, file), path.join(dest, file)); changes.push({ side, file });
    }
    const rows = R.tree(dest), original = R.inventory(path.join(source, side));
    const changed = rows.filter(row => original.files.find(x => x.file === row.file)?.sha256 !== row.sha256);
    assert.deepEqual(changed.map(x => x.file).sort(), changes.map(x => x.file).sort());
    fs.writeFileSync(path.join(dest, 'release-inventory.json'), JSON.stringify({ protocol:'ctsk-release026-v1', side, files:rows }, null, 2));
  } else {
    fs.copyFileSync(path.join(root,'backend/config/windowsConfigAcl.js'),path.join(dest,'electron/windowsConfigAcl.js'));
    changes.push({side,file:'electron/windowsConfigAcl.js'});
    fs.writeFileSync(path.join(dest,'release-inventory.json'),JSON.stringify({protocol:'ctsk-release026-v1',side,files:R.tree(dest)},null,2));
  }
  const inventory = R.inventory(dest), file = path.join(out, side + '-candidate026.zip');
  cp.execFileSync(zip, ['a', '-tzip', file, '.'], { cwd:dest, windowsHide:true, stdio:'pipe' });
  cp.execFileSync(zip, ['t', file], { windowsHide:true, stdio:'pipe' });
  archives[side] = { file, bytes:fs.statSync(file).size, sha256:R.sha(fs.readFileSync(file)), inventoryDigest:inventory.digest, files:inventory.files.length+1 };
}
fs.writeFileSync(path.join(out, 'archives.json'), JSON.stringify(archives,null,2),{flag:'wx'});
fs.writeFileSync(path.join(out, 'derivation.json'), JSON.stringify({release,source:'candidate-08',changes,productionAuthorized:false,liveAcceptance:false},null,2),{flag:'wx'});
console.log(out);
