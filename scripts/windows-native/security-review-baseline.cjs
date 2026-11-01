'use strict';
// Solo lecturas y evidencia nueva. Nunca importa constructores ni inicia procesos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('../windows-installers/payload.cjs');
const I = require('../windows-setup/integrity.cjs');
const root = path.resolve(__dirname, '../..');
const evidence = path.join(root, 'docs/local-fase-2e7-security-review');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sources = ['scripts/windows-native/SecurityProbe.cs', 'scripts/windows-native/probe-contract.cjs',
  'scripts/windows-native/probe-contract.test.cjs', 'scripts/windows-native/build-probe.cjs',
  'backend/config/windowsConfigAcl.js', 'shared/windowsConfigAcl.js'];
function preservedArtifacts() {
  const results = [];
  const candidates = path.join(root, 'dist/windows-2e7');
  for (const release of fs.readdirSync(candidates).filter(x => /^2e7-candidate-\d{2}$/.test(x)).sort()) {
    const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e7', release + '-build-report.json')));
    for (const side of ['server', 'client']) {
      const dir = path.join(candidates, release, side);
      const inventory = H.verify(dir, side);
      const installer = report.installers[side];
      const actual = sha(fs.readFileSync(path.join(root, installer.file)));
      if (inventory.release !== release || actual !== installer.sha256 ||
          sha(fs.readFileSync(path.join(dir, 'distribution-inventory.json'))) !== report.payloads[side].inventorySha256)
        throw Error('PREVIOUS_ARTIFACT_CHANGED');
      results.push({ release, side, file: installer.file, sha256: actual,
        inventorySha256: report.payloads[side].inventorySha256, filesVerified: inventory.files.length });
    }
  }
  const setupRoot = path.join(root, 'dist/windows-setup');
  for (const name of fs.readdirSync(setupRoot).filter(x => /^026-setup-\d{2}$/.test(x)).sort()) {
    I.verify(path.join(setupRoot, name));
    const report = JSON.parse(fs.readFileSync(path.join(setupRoot, name + '-report.json')));
    const actual = sha(fs.readFileSync(report.file));
    if (actual !== report.sha256) throw Error('PREVIOUS_SETUP_CHANGED');
    results.push({ release: name, file: path.relative(root, report.file).replace(/\\/g, '/'), sha256: actual,
      inventorySha256: sha(fs.readFileSync(path.join(setupRoot, name, 'helper-inventory.json'))) });
  }
  for (const file of fs.readdirSync(path.join(root, 'docs/local-fase-2e7-native05')).sort()) {
    const relative = 'docs/local-fase-2e7-native05/' + file;
    results.push({ historicalEvidence: relative, sha256: sha(fs.readFileSync(path.join(root, relative))) });
  }
  return results;
}
if (require.main === module) {
  if (process.argv[2] === 'before') {
    fs.mkdirSync(evidence); // No sobrescribir evidencia de otra revisión.
    fs.mkdirSync(path.join(evidence, 'before'));
    const files = sources.map(file => {
      const bytes = fs.readFileSync(path.join(root, file));
      fs.writeFileSync(path.join(evidence, 'before', file.replace(/\//g, '__') + '.txt'), bytes, { flag: 'wx' });
      return { file, sha256: sha(bytes) };
    });
    fs.writeFileSync(path.join(evidence, 'baseline.json'), JSON.stringify({
      scope: 'synthetic-acceptance-only', productionAuthorized: false,
      sources: files, preserved: preservedArtifacts()
    }, null, 2), { flag: 'wx' });
    console.log('BASELINE_RECORDED');
  } else if (process.argv[2] === 'after') {
    const before = JSON.parse(fs.readFileSync(path.join(evidence, 'baseline.json')));
    const after = preservedArtifacts();
    if (JSON.stringify(before.preserved) !== JSON.stringify(after)) throw Error('PRESERVATION_FAILED');
    fs.writeFileSync(path.join(evidence, 'preservation.json'), JSON.stringify({
      unchanged: true, preserved: after, binariesExecuted: false, productionAuthorized: false
    }, null, 2), { flag: 'wx' });
    console.log('PREVIOUS_CANDIDATES_AND_QUARANTINE_EVIDENCE_UNCHANGED');
  } else throw Error('EXPECTED_BEFORE_OR_AFTER');
}
module.exports = { preservedArtifacts };
