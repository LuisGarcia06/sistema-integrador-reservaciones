const config = {
    APP_ENVIRONMENT: 'principal', DB_HOST: 'localhost', DB_PORT: '5432', DB_NAME: 'sian_kaan_reservaciones',
    DB_USER: 'ctsk_runtime', DB_PASSWORD: 'PASSWORD_SOLO_FICTICIO_03A', JWT_SECRET: 'JWT_SOLO_FICTICIO_03A_'.repeat(3),
    DB_CLUSTER_ID: '7632825987452064788', DB_SERVER_VERSION: '18.3', DB_SCHEMA_VERSION: '017', GYG_GMAIL_SYNC_ENABLED: 'false'
};
const identity = { database: config.DB_NAME, username: config.DB_USER, port: 5432, address: '127.0.0.1',
    schema: 'public', version: '180003', cluster_allowed: true };
function schema() {
    return {
        tables: ['roles','usuarios','tours','paises','plataformas','usuario_plataformas_visibles','vehiculos','operadores','guias',
            'operaciones_tour','transportes_operacion','reservaciones','daily_observaciones','eventos_integracion',
            'reservas_integracion_link','equivalencias_tours_externos','integracion_sync_estado','bitacora'],
        scope_column: 1, scope_links: 3,
        scope_constraints: [{ name: 'chk_usuarios_alcance_plataformas', definition: "CHECK (((alcance_plataformas)::text = ANY (ARRAY[('all'::character varying)::text, ('selected'::character varying)::text])))" }],
        columns: [['archived_at','timestamp without time zone'],['archived_by','integer'],['archive_reason','text']]
            .map(([name,type]) => ({name,type,nullable:true,default:null})),
        constraints: [
            {name:'fk_eventos_integracion_archived_by', type:'f', validated:true, deferrable:false, definition:'FOREIGN KEY (archived_by) REFERENCES usuarios(id_usuario)'},
            {name:'chk_eventos_integracion_archivo', type:'c', validated:true, deferrable:false,
                definition: "CHECK ((((archived_at IS NULL) AND (archived_by IS NULL) AND (archive_reason IS NULL)) OR ((archived_at IS NOT NULL) AND (archived_by IS NOT NULL) AND (archive_reason IS NOT NULL) AND ((char_length(archive_reason) >= 1) AND (char_length(archive_reason) <= 500)) AND (archive_reason ~ '[^[:space:]]'::text) AND ((application_status)::text = 'not_applied'::text) AND ((review_status)::text = ANY ((ARRAY['pending_review'::character varying, 'approved'::character varying])::text[])))))" }
        ], indexes: [{name:'idx_eventos_integracion_archived_at',valid:true,ready:true,unique:false,
            definition:'CREATE INDEX idx_eventos_integracion_archived_at ON public.eventos_integracion USING btree (archived_at DESC, id_evento_integracion DESC) WHERE (archived_at IS NOT NULL)'}]
    };
}
function fakePool({ row = identity, cluster = config.DB_CLUSTER_ID, unsafe = false, metadata = schema(), error } = {}) {
    const calls = []; let released = false;
    const db = { async query(sql) {
        calls.push(sql);
        if (!/^SELECT|^BEGIN READ ONLY$|^ROLLBACK$/.test(sql)) throw Error('SQL_NO_LECTURA_BLOQUEADO');
        if (error) throw Error('ERROR_FICTICIO_NO_PUBLICAR_' + config.DB_PASSWORD);
        if (sql.includes('current_database() AS database')) return {rows:[row]};
        if (sql.includes('system_identifier::text')) return {rows:[{cluster}]};
        if (sql.includes('AS unsafe')) return {rows:[{unsafe}]};
        if (sql.includes('AS scope_links')) return {rows:[metadata]};
        return {rows:[]};
    }, release() { released = true; } };
    return {calls, get released() { return released; }, connect: async () => db, end: async () => {}};
}
module.exports = { config, identity, schema, fakePool };
