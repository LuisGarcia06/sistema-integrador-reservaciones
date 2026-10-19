const { fail } = require('./desktopPolicy');
const TABLES = ['roles', 'usuarios', 'tours', 'paises', 'plataformas', 'usuario_plataformas_visibles',
    'vehiculos', 'operadores', 'guias', 'operaciones_tour', 'transportes_operacion', 'reservaciones',
    'daily_observaciones', 'eventos_integracion', 'reservas_integracion_link', 'equivalencias_tours_externos',
    'integracion_sync_estado', 'bitacora'];

const SCHEMA_SQL = `SELECT
 (SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)))
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=to_regclass('public.eventos_integracion') AND NOT a.attisdropped
 AND a.attname IN ('archived_at','archived_by','archive_reason')) AS columns,
 (SELECT json_agg(json_build_object('name',c.conname,'type',c.contype,'validated',c.convalidated,
 'deferrable',c.condeferrable,'definition',pg_get_constraintdef(c.oid)))
 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.eventos_integracion')
 AND c.conname IN ('fk_eventos_integracion_archived_by','chk_eventos_integracion_archivo')) AS constraints,
 (SELECT json_agg(json_build_object('name',ci.relname,'valid',i.indisvalid,'ready',i.indisready,
 'unique',i.indisunique,'definition',pg_get_indexdef(i.indexrelid)))
 FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_namespace n ON n.oid=ci.relnamespace
 WHERE n.nspname='public' AND i.indrelid=to_regclass('public.eventos_integracion')
 AND ci.relname='idx_eventos_integracion_archived_at') AS indexes,
 (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public') AS tables,
 (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios'
 AND column_name='alcance_plataformas' AND data_type='character varying' AND is_nullable='NO'
 AND column_default = '''selected''::character varying') AS scope_column,
 (SELECT json_agg(json_build_object('name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint
 WHERE conrelid=to_regclass('public.usuarios') AND convalidated AND conname='chk_usuarios_alcance_plataformas') AS scope_constraints,
 (SELECT count(*)::int FROM pg_constraint WHERE conrelid=to_regclass('public.usuario_plataformas_visibles')
 AND convalidated AND conname IN ('pk_usuario_plataformas_visibles','fk_usuario_plataformas_visibles_usuarios',
 'fk_usuario_plataformas_visibles_plataformas')) AS scope_links`;

const CHECK = "CHECK ((((archived_at IS NULL) AND (archived_by IS NULL) AND (archive_reason IS NULL)) OR ((archived_at IS NOT NULL) AND (archived_by IS NOT NULL) AND (archive_reason IS NOT NULL) AND ((char_length(archive_reason) >= 1) AND (char_length(archive_reason) <= 500)) AND (archive_reason ~ '[^[:space:]]'::text) AND ((application_status)::text = 'not_applied'::text) AND ((review_status)::text = ANY ((ARRAY['pending_review'::character varying, 'approved'::character varying])::text[])))))";
const SCOPE_CHECK = "CHECK (((alcance_plataformas)::text = ANY ((ARRAY['all'::character varying, 'selected'::character varying])::text[])))";
// Normalización acotada de casts VARCHAR/text equivalentes de PostgreSQL.
// Conserva paréntesis, operadores, literales y límites del CHECK.
function canonical(text) {
    return String(text).replace(/::character varying/g, '::text').replace(/\('((?:[^']|'')*)'::text\)::text/g, "'$1'::text")
        .replace(/\(ARRAY\[([^\]]+)\]\)::text\[\]/g, 'ARRAY[$1]')
        .replace(/REFERENCES public\.usuarios\(/g, 'REFERENCES usuarios(')
        .replace(/\s+(?=(?:[^']*'[^']*')*[^']*$)/g, '');
}
function validateSchema(row) {
    if (!row || JSON.stringify([...(row.tables || [])].sort()) !== JSON.stringify([...TABLES].sort()) ||
        row.scope_column !== 1 || row.scope_links !== 3 || row.scope_constraints?.length !== 1 ||
        canonical(row.scope_constraints[0].definition) !== canonical(SCOPE_CHECK)) fail('SCHEMA_INVALID');
    const columns = row.columns || [];
    for (const [name, type] of [['archived_at', 'timestamp without time zone'], ['archived_by', 'integer'], ['archive_reason', 'text']]) {
        const col = columns.find(c => c.name === name);
        if (!col || col.type !== type || col.nullable !== true || col.default !== null) fail('SCHEMA_INVALID');
    }
    if (columns.length !== 3 || row.constraints?.length !== 2 || row.indexes?.length !== 1) fail('SCHEMA_INVALID');
    const fk = row.constraints.find(c => c.name === 'fk_eventos_integracion_archived_by');
    const check = row.constraints.find(c => c.name === 'chk_eventos_integracion_archivo');
    if (!fk || fk.type !== 'f' || !fk.validated || fk.deferrable ||
        canonical(fk.definition) !== canonical('FOREIGN KEY (archived_by) REFERENCES usuarios(id_usuario)') ||
        !check || check.type !== 'c' || !check.validated || check.deferrable || canonical(check.definition) !== canonical(CHECK)) fail('SCHEMA_INVALID');
    const index = row.indexes[0];
    if (!index.valid || !index.ready || index.unique || canonical(index.definition) !== canonical('CREATE INDEX idx_eventos_integracion_archived_at ON public.eventos_integracion USING btree (archived_at DESC, id_evento_integracion DESC) WHERE (archived_at IS NOT NULL)')) fail('SCHEMA_INVALID');
}
async function verifySchema(db) { validateSchema((await db.query(SCHEMA_SQL)).rows[0]); }
module.exports = { TABLES, SCHEMA_SQL, CHECK, SCOPE_CHECK, canonical, validateSchema, verifySchema };
