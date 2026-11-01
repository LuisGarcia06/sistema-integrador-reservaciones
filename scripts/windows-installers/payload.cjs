'use strict';
// Inventario exterior: también cubre runtime, licencias y herramientas de inicio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function tree(root) {
  const rows = [];
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw Error('PAYLOAD_REPARSE_POINT');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && file !== 'distribution-inventory.json') {
        const bytes = fs.readFileSync(path.join(root, file));
        rows.push({ file, bytes: bytes.length, sha256: sha(bytes) });
      } else if (!entry.isFile()) throw Error('PAYLOAD_FILE_TYPE');
    }
  }
  walk('');
  return rows.sort((a, b) => a.file.localeCompare(b.file, 'en'));
}
function verify(root, expectedSide) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'distribution-inventory.json')));
  if (manifest.protocol !== 'ctsk-windows-candidate-2e7-v1' || manifest.side !== expectedSide ||
      manifest.productionAuthorized !== false || manifest.scope !== 'synthetic-acceptance-only' ||
      JSON.stringify(manifest.files) !== JSON.stringify(tree(root))) throw Error('PAYLOAD_INTEGRITY');
  return manifest;
}
function machine(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw Error('PE_HEADER');
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.readUInt32LE(pe) !== 0x4550) throw Error('PE_HEADER');
  return bytes.readUInt16LE(pe + 4);
}
module.exports = { sha, tree, verify, machine };
