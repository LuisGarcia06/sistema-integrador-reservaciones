const {fail}=require('./standalonePolicy');
const M=require('../models/comandos.model');
const BODY=`
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'COMMAND_IMMUTABLE' USING ERRCODE='42501';
    END IF;
    IF NEW.generacion_datos::text IS DISTINCT FROM obj_description(TG_RELID,'pg_class') THEN
        RAISE EXCEPTION 'COMMAND_GENERATION' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
END;
`;
const TYPES=['uuid','integer','uuid','smallint','character varying(5)','text','text','text','character(64)','character varying(10)','smallint','jsonb','jsonb','integer[]','timestamp with time zone'];
const CHECKS={
    chk_comandos_version_020:'CHECK ((version = 1))',
    chk_comandos_metodo_020:"CHECK (((metodo)::text = ANY ((ARRAY['POST'::character varying, 'PATCH'::character varying, 'PUT'::character varying])::text[])))",
    chk_comandos_ruta_020:"CHECK (((ruta ~~ '/api/%'::text) AND (length(ruta) <= 512)))",
    chk_comandos_huella_020:"CHECK ((huella ~ '^[a-f0-9]{64}$'::text))",
    chk_comandos_estado_020:"CHECK (((((estado)::text = 'confirmado'::text) AND (http_status = 200)) OR (((estado)::text = 'rechazado'::text) AND ((http_status >= 400) AND (http_status <= 499)))))",
    chk_comandos_resultado_020:"CHECK (((jsonb_typeof(resultado) = 'object'::text) AND (octet_length((resultado)::text) <= 16384)))",
    chk_comandos_alcance_020:"CHECK (((jsonb_typeof(alcance) = 'object'::text) AND (octet_length((alcance)::text) <= 8192)))"
};
const SQL=require('./revisionSchema').SQL.replace("c.conname LIKE '%revision%'","c.conname LIKE '%comandos%'");
const normal=s=>s.replace(/\r\n/g,'\n');
function validate(row,extra,generation){
    const reject=()=>fail('COMMAND_SCHEMA_INVALID');
    if(!row||row.replication_set!==false||row.tables?.length!==1||row.functions?.length!==1||row.triggers?.length!==1||row.checks?.length!==7)reject();
    const t=row.tables[0];
    if(t.table!=='comandos_idempotentes'||t.owner!=='ctsk_standalone_owner'||t.kind!=='r'||t.rules!==false||t.rls!==false||['insert','update','delete','truncate','trigger','references'].some(k=>t[k]!==false))reject();
    const names=[...M.FIELDS,'fecha_registro'];
    if(row.columns?.length!==names.length)reject();
    for(let i=0;i<names.length;i++){
        const c=row.columns.find(c=>c.name===names[i]);
        if(!c||c.type!==TYPES[i]||c.notnull!==(c.name!=='id_recurso')||c.default!==(c.name==='fecha_registro'?'CURRENT_TIMESTAMP':null)||c.identity!==''||c.generated!==''||!c.select||c.update||c.insert!==(c.name!=='fecha_registro'))reject();
    }
    for(const c of row.checks)if(c.type!=='c'||!c.validated||c.deferrable||CHECKS[c.name]!==c.definition)reject();
    const trigger=row.triggers[0],f=row.functions[0];
    if(trigger.name!=='ctsk_command_guard_020'||trigger.enabled!=='A'||trigger.type!==31||trigger.arguments!==0||trigger.when||trigger.constraint!=='0'||trigger.function!=='ctsk_guard_comando_020'||trigger.schema!=='public'||trigger.columns!==''||trigger.oldTable!==null||trigger.newTable!==null)reject();
    if(normal(f.body)!==BODY||f.owner!=='ctsk_standalone_owner'||f.definer||f.language!=='plpgsql'||f.arguments!==0||f.kind!=='f'||f.return!=='trigger'||f.volatile!=='v'||JSON.stringify(f.config)!=='["search_path=pg_catalog"]'||!f.execute||f.publicExecute)reject();
    if(extra.generation!==generation||extra.fsync!=='on'||extra.full_page_writes!=='on'||extra.synchronous_commit!=='on'||!extra.select||extra.public_access||extra.constraints?.length!==2||extra.indexes?.length!==2)reject();
    const expectedConstraints={pk_comandos_020:'PRIMARY KEY (generacion_datos, id_usuario, clave)',comandos_idempotentes_id_usuario_fkey:'FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)'};
    for(const c of extra.constraints)if(!c.validated||c.deferrable||expectedConstraints[c.name]!==c.definition)reject();
    const indexes={pk_comandos_020:'CREATE UNIQUE INDEX pk_comandos_020 ON public.comandos_idempotentes USING btree (generacion_datos, id_usuario, clave)',idx_comandos_usuario_fecha_020:'CREATE INDEX idx_comandos_usuario_fecha_020 ON public.comandos_idempotentes USING btree (id_usuario, fecha_registro)'};
    for(const i of extra.indexes)if(!i.valid||!i.ready||indexes[i.name]!==i.definition)reject();
}
const EXTRA=`SELECT obj_description('public.comandos_idempotentes'::regclass,'pg_class') generation,
current_setting('fsync') fsync,current_setting('full_page_writes') full_page_writes,current_setting('synchronous_commit') synchronous_commit,
has_table_privilege(current_user,'public.comandos_idempotentes','SELECT') AS select,
(EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.comandos_idempotentes'::regclass AND a.grantee=0)
 OR EXISTS(SELECT 1 FROM pg_attribute c,LATERAL aclexplode(c.attacl) a WHERE c.attrelid='public.comandos_idempotentes'::regclass AND a.grantee=0)) public_access,
(SELECT json_agg(json_build_object('name',conname,'validated',convalidated,'deferrable',condeferrable,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.comandos_idempotentes'::regclass AND contype IN ('p','f')) constraints,
(SELECT json_agg(json_build_object('name',c.relname,'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid))) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.comandos_idempotentes'::regclass) indexes`;
async function inspect(db){return {row:(await db.query(SQL,[['comandos_idempotentes'],'ctsk_guard_comando_020'])).rows[0],extra:(await db.query(EXTRA)).rows[0]};}
async function verifySchema(db,generation){const {row,extra}=await inspect(db);validate(row,extra,generation);}
module.exports={BODY,SQL,EXTRA,CHECKS,inspect,validate,verifySchema};
