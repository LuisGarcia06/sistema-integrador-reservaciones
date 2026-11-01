const path = require('node:path'), { Readable } = require('node:stream');
const S = require('../../scripts/preRelease03RestoreSafety.cjs');
const dir = path.join(S.ROOT, '.access-scope-lab/pre-release-03-restore/run-test-12345678');
const good = { dir, data: path.join(dir, 'data'), database: 'pre_release_03_restore_12345678', host: '127.0.0.1', port: 56291, owner: 'pr03_restore_owner', app: 'pr03_restore_app' };
test('destino exige directorio/roles/base nuevos y rechaza principal, DEV y laboratorio anterior', () => {
  expect(S.validarDestino(good)).toBe(good);
  for (const bad of [{ port: 5432 }, { port: 55473 }, { database: 'sian_kaan_reservaciones' }, { database: 'sian_kaan_reservaciones_dev' }, { host: 'localhost' }, { data: path.join(S.ROOT, '.access-scope-lab/pre-release-03-lab20261017-pg18/data') }, { owner: 'postgres' }]) expect(() => S.validarDestino({ ...good, ...bad })).toThrow('DESTINO_DE_RESTAURACION_NO_AUTORIZADO');
});
test('huella de COPY compara todo el contenido sin depender del orden ni divulgar filas', async () => {
  const first = await S.consumirCopy(Readable.from(['COPY public.usuarios (id_usuario, nombre) FROM stdin;\n1\tPersona ficticia A\n2\tTexto\\ncon salto\n\\.\n']));
  const second = await S.consumirCopy(Readable.from(['COPY public.usuarios (id_usuario, nombre) FROM stdin;\n2\tTexto\\ncon salto\n1\tPersona ficticia A\n\\.\n']));
  expect(first).toEqual(second); expect(first.tables.usuarios.count).toBe(2);
  expect(JSON.stringify(first)).not.toContain('Persona ficticia'); expect(JSON.stringify(first)).not.toContain('con salto');
});
test('COPY truncado o duplicado detiene la comparación', async () => {
  await expect(S.consumirCopy(Readable.from(['COPY public.usuarios (id_usuario) FROM stdin;\n1\n']))).rejects.toThrow('COPY_INCOMPLETO');
  await expect(S.consumirCopy(Readable.from(['COPY public.usuarios (id_usuario) FROM stdin;\n1\n\\.\nCOPY public.usuarios (id_usuario) FROM stdin;\n']))).rejects.toThrow('COPY_DUPLICADO');
});
test('entorno no hereda destinos PostgreSQL ni credenciales, intérpretes o configuración privada', () => {
  const e = S.env(); for (const key of ['DB_HOST', 'DB_NAME', 'PGPASSWORD', 'PGHOST', 'PGSERVICE', 'APP_CONFIG_PATH', 'NODE_OPTIONS', 'JWT_SECRET']) expect(e[key]).toBeUndefined();
});
test('compara la representación equivalente de CHECK ACCESS-SCOPE sin aceptar valores distintos', () => {
  const base = { table_name: 'usuarios', name: 'chk_usuarios_alcance_plataformas', type: 'c', validated: true };
  const original = { ...base, definition: "CHECK (((alcance_plataformas)::text = ANY ((ARRAY['all'::character varying, 'selected'::character varying])::text[])))" };
  const restored = { ...base, definition: "CHECK (((alcance_plataformas)::text = ANY (ARRAY[('all'::character varying)::text, ('selected'::character varying)::text])))" };
  expect(S.canon(restored)).toEqual(S.canon(original));
  expect(S.canon({ ...restored, definition: restored.definition.replace("'selected'", "'otro'") })).not.toEqual(S.canon(original));
});
