const { validarIdentidad, validarToc, childEnv, MAIN, CLUSTER, MIGRATION_HASH } = require('../../scripts/preRelease03ProdBackup.cjs');
const identity = { database: MAIN, username: 'postgres', address: '::1', port: 5432, cluster: CLUSTER, version: '18.3', readonly: 'on', schema: 'public' };
test('respaldo exige identidad historica y transaccion solo lectura', () => {
  expect(validarIdentidad(identity)).toBe(identity);
  for (const change of [{ database: 'sian_kaan_reservaciones_dev' }, { cluster: '7697702573746832088' }, { port: 55473 }, { readonly: 'off' }, { address: '127.0.0.2' }, { username: 'otro' }]) expect(() => validarIdentidad({ ...identity, ...change })).toThrow('IDENTIDAD_O_SOLO_LECTURA_NO_COINCIDE');
});
test('herramientas reciben entorno acotado y libpq solo lectura, sin credenciales en argumentos', () => {
  const env = childEnv('ficticio-no-es-credencial');
  expect(env.PGPASSWORD).toBe('ficticio-no-es-credencial');
  expect(env.PGOPTIONS).toContain('default_transaction_read_only=on');
  expect(env.DB_NAME).toBeUndefined(); expect(env.APP_CONFIG_PATH).toBeUndefined(); expect(env.NODE_OPTIONS).toBeUndefined();
  expect(childEnv().PGPASSWORD).toBeUndefined();
});
test('el indice debe cubrir tablas, datos, estados de secuencias y restricciones', () => {
  const inv = { tables: ['usuarios'], sequences: [{ name: 'usuarios_id_usuario_seq' }], indexes: [{ name: 'usuarios_pkey' }], constraints: [{ table_name: 'usuarios', name: 'usuarios_pkey', type: 'p' }] };
  const toc = '1; 1259 1 TABLE public usuarios postgres\n2; 0 1 TABLE DATA public usuarios postgres\n3; 1259 2 SEQUENCE public usuarios_id_usuario_seq postgres\n4; 0 0 SEQUENCE SET public usuarios_id_usuario_seq postgres\n5; 2606 3 CONSTRAINT public usuarios usuarios_pkey postgres\n';
  expect(validarToc(toc, inv)).toMatchObject({ tables: 1, tableData: 1, sequences: 1, sequenceSet: 1, constraints: 1 });
  expect(() => validarToc(toc.replace('TABLE DATA', 'OMITIDO'), inv)).toThrow('DUMP_TABLA_O_DATOS_AUSENTES');
  expect(() => validarToc(toc.replace('SEQUENCE SET', 'OMITIDO'), inv)).toThrow('DUMP_SECUENCIA_AUSENTE');
});
test('017 conserva el hash exacto acreditado en laboratorio; nunca se ejecuta desde la herramienta', () => {
  const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
  expect(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/017_archivo_eventos_integracion.sql'))).digest('hex')).toBe(MIGRATION_HASH);
});
