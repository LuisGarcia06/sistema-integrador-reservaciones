'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const H = require('../../scripts/windows-installers/payload.cjs');
describe('Integridad de distribución Windows separada del perfil 026', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctsk-2e7-unit-'));
    fs.writeFileSync(path.join(root, 'runtime.exe'), 'runtime');
    fs.mkdirSync(path.join(root, 'app'));
    fs.writeFileSync(path.join(root, 'app', 'main.js'), 'app');
    fs.writeFileSync(path.join(root, 'distribution-inventory.json'), JSON.stringify({
      protocol: 'ctsk-windows-candidate-2e7-v1', side: 'client',
      productionAuthorized: false, scope: 'synthetic-acceptance-only', files: H.tree(root)
    }));
  });
  // Solo archivos creados por esta prueba; nunca laboratorios previos.
  afterEach(() => {
    const resolved = fs.realpathSync(root);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('ctsk-2e7-unit-')) throw Error('TEST_CLEANUP_PATH');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  test('valida runtime y aplicación completos', () => expect(H.verify(root, 'client').files).toHaveLength(2));
  test.each(['runtime.exe', 'app/main.js'])('rechaza alteración de %s', file => {
    fs.appendFileSync(path.join(root, file), 'tampered');
    expect(() => H.verify(root, 'client')).toThrow('PAYLOAD_INTEGRITY');
  });
  test('rechaza un archivo extra incluso fuera de la aplicación', () => {
    fs.writeFileSync(path.join(root, 'unexpected.dll'), 'x');
    expect(() => H.verify(root, 'client')).toThrow('PAYLOAD_INTEGRITY');
  });
  test('rechaza runtime faltante', () => {
    fs.unlinkSync(path.join(root, 'runtime.exe'));
    expect(() => H.verify(root, 'client')).toThrow('PAYLOAD_INTEGRITY');
  });
  test('rechaza intercambio servidor/cliente', () => expect(() => H.verify(root, 'server')).toThrow('PAYLOAD_INTEGRITY'));
  test.each([{ productionAuthorized: true }, { scope: 'enterprise' }, { protocol: 'unknown' }])('rechaza promoción silenciosa %j', change => {
    const file = path.join(root, 'distribution-inventory.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file)), ...change }));
    expect(() => H.verify(root, 'client')).toThrow('PAYLOAD_INTEGRITY');
  });
});
describe('Solicitudes de mantenimiento sin selección de bases existentes', () => {
  const { validateRequest, main } = require('../../scripts/windows-installers/maintenance.cjs');
  const p = name => path.join(os.tmpdir(), name);
  const request = () => ({ action: 'init', scope: 'synthetic-acceptance-only', directory: p('new'),
    authority: p('authority.json'), authorityKey: p('authority-key.pem'), certificate: p('certificate.pem'), tlsKey: p('tls.pem') });
  test('acepta únicamente archivos externos explícitos', () => expect(validateRequest(request()).action).toBe('init'));
  test.each(['host', 'database', 'password', 'port'])('rechaza parámetro de destino heredado %s', key => {
    expect(() => validateRequest({ ...request(), [key]: 'existing' })).toThrow('MAINTENANCE_REQUEST');
  });
  test('rechaza ámbito empresarial', () => expect(() => validateRequest({ ...request(), scope: 'enterprise' })).toThrow('MAINTENANCE_REQUEST'));
  test('rechaza rutas relativas', () => expect(() => validateRequest({ ...request(), authority: './authority.json' })).toThrow('MAINTENANCE_PATH'));
  test('sin declaración explícita de laboratorio no carga plan ni conecta PostgreSQL', async () => {
    await expect(main(['request.json'])).rejects.toThrow('MAINTENANCE_ISOLATED_LAB_REQUIRED');
  });
});
