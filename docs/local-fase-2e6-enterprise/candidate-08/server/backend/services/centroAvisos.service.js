const pool = require('../config/database');

// Proyección de lectura: ninguna clasificación cambia los eventos originales.
// PostgreSQL valida el calendario antes de convertir; una fecha ilegible sigue en Pendientes.
const FUENTE = `WITH extraidos AS (
 SELECT CASE WHEN external_event_id LIKE 'sync024:%' OR external_event_id LIKE 'sync024-alert:%' THEN normalized_data#>>'{integration024,kind}' END AS source_channel, id_evento_integracion, provider, external_booking_id, event_type, review_status,
 application_status, archived_at, source_received_at, created_at,
 CASE WHEN (provider='getyourguide' AND external_booking_id ~* '^GYG[A-Z0-9]{5,37}$')
   OR (provider='fareharbor' AND length(trim(external_booking_id))>0
       AND lower(external_booking_id)=lower(normalized_data#>>'{booking,uuid}'))
   THEN provider || ':' || lower(external_booking_id) ELSE 'evento:' || id_evento_integracion END AS grupo,
 CASE WHEN provider='getyourguide' THEN normalized_data->>'customer_name' END AS customer_name,
 CASE WHEN provider='fareharbor' THEN normalized_data#>>'{contact,name}' END AS fh_name,
 lower(regexp_replace(trim(normalized_data->>'date'), '\\s+', ' ', 'g')) AS texto_fecha,
 normalized_data#>>'{availability,start_at}' AS inicio,
 trim(normalized_data->>'start_time') AS hora_explicita,
 CASE WHEN provider='fareharbor' THEN normalized_data#>>'{pickup,pickup,time}'
      ELSE normalized_data->>'pickup_time' END AS pickup_texto
 FROM eventos_integracion WHERE aviso_publicado=true
 AND provider IN ('fareharbor','getyourguide')
 AND event_type IN ('new_booking','modification','cancellation')
), partes AS MATERIALIZED (
 SELECT *, regexp_match(texto_fecha, '^(\\d{1,2}) de ([a-z]+) de (\\d{4})(, ([01]?[0-9]|2[0-3]):[0-5][0-9])?$') AS es,
 regexp_match(texto_fecha, '^([a-z]+) (\\d{1,2}), (\\d{4})( (0?[1-9]|1[0-2]):[0-5][0-9] ?(am|pm))?$') AS en
 FROM extraidos
), candidatos AS MATERIALIZED (
 SELECT *, CASE
 WHEN texto_fecha ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN texto_fecha
 WHEN es IS NOT NULL THEN es[3] || '-' || lpad(array_position(ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],es[2])::text,2,'0') || '-' || lpad(es[1],2,'0')
 WHEN en IS NOT NULL THEN en[3] || '-' || lpad(array_position(ARRAY['january','february','march','april','may','june','july','august','september','october','november','december'],en[1])::text,2,'0') || '-' || lpad(en[2],2,'0') END AS fecha_candidata
 FROM partes
), horarios AS MATERIALIZED (
 SELECT *, CASE WHEN provider='fareharbor'
   THEN CASE WHEN inicio ~ '^\\d{4}-\\d{2}-\\d{2}T.*(Z|[+-][0-9]{2}:?[0-9]{2})$' AND pg_input_is_valid(inicio,'timestamp with time zone')
     THEN inicio::timestamptz AT TIME ZONE 'America/Cancun' END END AS inicio_local,
 CASE WHEN hora_explicita ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN hora_explicita::time END AS hora_normalizada,
 CASE WHEN es[4] IS NOT NULL THEN trim(substring(es[4] from 2))::time
      WHEN en[4] IS NOT NULL THEN trim(en[4])::time END AS hora_en_fecha,
 CASE WHEN trim(pickup_texto) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN trim(pickup_texto)::time END AS hora_pickup
 FROM candidatos
), eventos AS (
 SELECT id_evento_integracion,provider,external_booking_id,event_type,review_status,application_status,
 archived_at,source_received_at,created_at,grupo,customer_name,fh_name,source_channel,
 CASE WHEN provider='fareharbor' THEN inicio_local::date
 ELSE CASE WHEN pg_input_is_valid(fecha_candidata,'date') THEN fecha_candidata::date END END AS service_date,
 CASE WHEN provider='fareharbor' THEN inicio_local::time ELSE COALESCE(hora_normalizada,hora_en_fecha) END AS service_time,
 hora_pickup AS pickup_time,
 COALESCE(provider='getyourguide' AND hora_normalizada<>hora_en_fecha,false) AS time_conflict,
 COALESCE(provider='getyourguide' AND nullif(hora_explicita,'') IS NOT NULL AND hora_normalizada IS NULL,false) AS time_unverified,
 archived_at IS NULL AND review_status IN ('pending_review','approved') AND application_status='not_applied' AS necesita_atencion,
 source_received_at < created_at - interval '24 hours' AS recuperado
 FROM horarios
)`;

// Estado cronológico y recepción son independientes. Una recuperación tardía
// nunca sustituye por sí misma el servicio de un evento externo posterior.
const GRUPOS = `, ultimos AS MATERIALIZED (
 SELECT DISTINCT ON (grupo) * FROM eventos
 ORDER BY grupo,source_received_at DESC NULLS LAST,created_at DESC,id_evento_integracion DESC
), validos AS MATERIALIZED (
 SELECT DISTINCT ON (grupo) * FROM eventos WHERE service_date IS NOT NULL
 ORDER BY grupo,source_received_at DESC NULLS LAST,created_at DESC,id_evento_integracion DESC
), contradicciones AS MATERIALIZED (
 SELECT u.grupo,
 count(DISTINCT e.service_date)>1 AS date_conflict,
 count(DISTINCT e.service_time)>1 AS group_time_conflict,
 count(DISTINCT e.pickup_time)>1 AS pickup_conflict,
 bool_or(e.source_received_at IS NULL) AS chronology_unverified
 FROM ultimos u LEFT JOIN validos v USING(grupo) JOIN eventos e ON e.grupo=u.grupo AND
 (u.provider='fareharbor' OR e.source_received_at IS NOT DISTINCT FROM COALESCE(v.source_received_at,u.source_received_at) OR e.source_received_at IS NULL OR COALESCE(v.source_received_at,u.source_received_at) IS NULL)
 GROUP BY u.grupo
), actuales AS MATERIALIZED (
 SELECT u.id_evento_integracion,u.provider,u.external_booking_id,u.event_type,u.review_status,u.application_status,
 u.source_received_at,u.created_at,u.archived_at,u.customer_name,u.grupo,u.source_channel,
 CASE WHEN NOT COALESCE(c.date_conflict,false) THEN v.service_date END AS service_date,
 CASE WHEN NOT (COALESCE(c.date_conflict,false) OR COALESCE(c.group_time_conflict,false) OR COALESCE(v.time_conflict,u.time_conflict,false) OR COALESCE(v.time_unverified,u.time_unverified,false))
   THEN CASE WHEN v.id_evento_integracion IS NOT NULL THEN v.service_time ELSE u.service_time END END AS service_time,
 CASE WHEN NOT COALESCE(c.pickup_conflict,false) THEN u.pickup_time END AS pickup_time,
 COALESCE(c.pickup_conflict,false) AS pickup_conflict,
 COALESCE(c.date_conflict,false) AS date_conflict,
 (COALESCE(c.group_time_conflict,false) OR COALESCE(v.time_conflict,u.time_conflict,false)) AS time_conflict,
 COALESCE(v.time_unverified,u.time_unverified,false) AS time_unverified,
 v.id_evento_integracion AS schedule_event_id,
 (v.id_evento_integracion IS DISTINCT FROM u.id_evento_integracion AND v.id_evento_integracion IS NOT NULL) AS schedule_from_previous,
 (u.provider='fareharbor' OR u.source_received_at IS NULL OR COALESCE(c.chronology_unverified,false)) AS chronology_unverified
 FROM ultimos u LEFT JOIN validos v USING(grupo) LEFT JOIN contradicciones c USING(grupo)
)`;

function fechaCancun() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function validarConsulta(query = {}) {
    const allowed = ['tab','q','provider','event_type','review_status','from','to','date','page','limit','archived','urgent','sort'];
    if (Object.keys(query).some(k => !allowed.includes(k))) throw Object.assign(Error('Filtro no permitido'), { statusCode: 400 });
    const filters = { tab: 'prioritarios', date: fechaCancun(), page: 1, limit: 25, archived: 'active', ...query };
    filters.sort = query.sort || (filters.tab === 'prioritarios' ? 'service' : 'newest');
    const enums = { tab: ['prioritarios','pendientes','historico'], provider: ['fareharbor','getyourguide'],
        event_type: ['new_booking','modification','cancellation'], review_status: ['pending_review','approved','dismissed'], archived: ['active','archived','all'], urgent: ['true','false'], sort: ['newest','oldest','service'] };
    for (const [key, values] of Object.entries(enums)) if (filters[key] !== undefined && !values.includes(filters[key])) throw Object.assign(Error('Filtro ' + key + ' inválido'), { statusCode: 400 });
    for (const key of ['date','from','to']) if (filters[key] !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]) || !Number.isFinite(Date.parse(filters[key] + 'T00:00:00Z')) || new Date(filters[key] + 'T00:00:00Z').toISOString().slice(0,10) !== filters[key])) throw Object.assign(Error('Fecha inválida'), { statusCode: 400 });
    if (filters.from && filters.to && filters.from > filters.to) throw Object.assign(Error('Rango de fechas inválido'), { statusCode: 400 });
    for (const key of ['page','limit']) filters[key] = Number(filters[key]);
    if (!Number.isSafeInteger(filters.page) || filters.page < 1 || filters.page > 1000000 || ![25,50,100].includes(filters.limit)) throw Object.assign(Error('Paginación inválida'), { statusCode: 400 });
    if (filters.q !== undefined && (typeof filters.q !== 'string' || filters.q.trim().length > 120)) throw Object.assign(Error('Búsqueda inválida'), { statusCode: 400 });
    filters.q = filters.q?.trim();
    return filters;
}

function respuesta(result, filters) {
    const row = result.rows[0];
    return { data: row?.data || [], pagination: { page: filters.page, limit: filters.limit,
        total: Number(row?.total || 0), totalPages: Math.ceil(Number(row?.total || 0) / filters.limit) } };
}

async function listarCentro(filters, { includeFareHarborName = false } = {}, db = pool) {
    const values = [filters.date];
    const condiciones = [];
    const add = (value, expression) => { values.push(value); condiciones.push(expression.replace('?', '$' + values.length)); };
    if (filters.provider) add(filters.provider, 'e.provider=?');
    if (filters.event_type) add(filters.event_type, 'e.event_type=?');
    if (filters.review_status) add(filters.review_status, 'e.review_status=?');
    if (filters.archived === 'active') condiciones.push('e.archived_at IS NULL');
    if (filters.archived === 'archived') condiciones.push('e.archived_at IS NOT NULL');
    if (filters.q) {
        values.push('%' + filters.q.replace(/[\\%_]/g, '\\$&') + '%');
        const param = '$' + values.length;
        condiciones.push(`(e.external_booking_id ILIKE ${param} OR e.customer_name ILIKE ${param}${includeFareHarborName ? ` OR e.fh_name ILIKE ${param}` : ''})`);
    }
    if (filters.tab !== 'historico' && filters.archived === 'active') condiciones.push('e.necesita_atencion');
    const grupoCondiciones = [];
    if (filters.tab === 'prioritarios') grupoCondiciones.push('u.service_date >= $1::date');
    if (filters.tab === 'historico') grupoCondiciones.push('(u.service_date < $1::date OR (u.service_date IS NOT NULL AND s.recuperado))');
    if (filters.urgent === 'true') grupoCondiciones.push('s.pendientes>0 AND u.service_date BETWEEN $1::date AND $1::date+1');
    if (filters.urgent === 'false') grupoCondiciones.push('(u.service_date IS NULL OR u.service_date NOT BETWEEN $1::date AND $1::date+1)');
    if (filters.from) { values.push(filters.from); grupoCondiciones.push('u.service_date >= $' + values.length + '::date'); }
    if (filters.to) { values.push(filters.to); grupoCondiciones.push('u.service_date <= $' + values.length + '::date'); }
    values.push(filters.limit, (filters.page - 1) * filters.limit);
    const orders = {
        newest: 'last_received_at DESC NULLS LAST, id_evento_integracion DESC',
        oldest: 'last_received_at ASC NULLS LAST, id_evento_integracion ASC',
        service: 'service_date ASC NULLS LAST, service_time ASC NULLS LAST, last_received_at DESC NULLS LAST, id_evento_integracion DESC'
    };
    const order = orders[filters.sort || (filters.tab === 'prioritarios' ? 'service' : 'newest')];
    if (!order) throw Object.assign(Error('Orden inválido'), { statusCode:400 });
    const result = await db.query(`${FUENTE}${GRUPOS}, stats AS (
        SELECT e.grupo,count(*)::int event_count,count(*) FILTER (WHERE necesita_atencion)::int pendientes,
        bool_or(recuperado) recuperado, bool_or(${condiciones.join(' AND ') || 'true'}) coincide,
        min(created_at) AT TIME ZONE 'America/Cancun' AS first_received_at,
        max(created_at) AT TIME ZONE 'America/Cancun' AS last_received_at
        FROM eventos e GROUP BY e.grupo
    ), seleccion AS (
        SELECT u.id_evento_integracion,u.provider,u.external_booking_id,u.event_type,u.review_status,u.application_status,
        u.service_date::text,u.service_time::text,u.pickup_time::text,
        u.source_received_at AT TIME ZONE 'America/Cancun' AS source_received_at,
        u.created_at AT TIME ZONE 'America/Cancun' AS created_at,u.archived_at,s.event_count,s.pendientes,
        s.first_received_at,s.last_received_at,u.date_conflict,u.time_conflict,u.time_unverified,u.pickup_conflict,
        CASE WHEN u.source_channel='snapshot' THEN 'provider_query' WHEN u.source_channel='operational_alert' THEN 'system_alert' WHEN u.provider='fareharbor' THEN 'webhook_received' ELSE 'message_original' END AS source_timestamp_kind,
        u.schedule_event_id,u.schedule_from_previous,u.chronology_unverified,
        CASE WHEN u.service_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Cancun')::date THEN 'today'
             WHEN u.service_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Cancun')::date+1 THEN 'tomorrow'
             WHEN u.service_date>(CURRENT_TIMESTAMP AT TIME ZONE 'America/Cancun')::date+1 THEN 'upcoming' END AS proximity,
        s.recuperado AS historical_recovered, u.customer_name,
        (s.pendientes>0 AND u.service_date BETWEEN $1::date AND $1::date+1) AS urgent
        FROM actuales u JOIN stats s USING(grupo) WHERE s.coincide ${grupoCondiciones.length ? 'AND ' + grupoCondiciones.join(' AND ') : ''}
    ), pagina AS (
        SELECT * FROM seleccion ORDER BY ${order}
        LIMIT $${values.length - 1} OFFSET $${values.length}
    ) SELECT (SELECT count(*)::int FROM seleccion) total, COALESCE((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY ${order}) FROM pagina),'[]'::jsonb) data`, values);
    return respuesta(result, filters);
}

async function historialGrupo(id, filters, db = pool) {
    const result = await db.query(`${FUENTE}, seleccion AS (
        SELECT id_evento_integracion,provider,external_booking_id,event_type,review_status,application_status,
        service_date::text,CASE WHEN NOT time_conflict AND NOT time_unverified THEN service_time::text END AS service_time,
        pickup_time::text,time_conflict,time_unverified,
        CASE WHEN source_channel='snapshot' THEN 'provider_query' WHEN source_channel='operational_alert' THEN 'system_alert' WHEN provider='fareharbor' THEN 'webhook_received' ELSE 'message_original' END AS source_timestamp_kind,
        source_received_at AT TIME ZONE 'America/Cancun' AS source_received_at,
        created_at AT TIME ZONE 'America/Cancun' AS created_at,archived_at FROM eventos
        WHERE grupo=(SELECT grupo FROM eventos WHERE id_evento_integracion=$1)
    ), pagina AS (SELECT * FROM seleccion ORDER BY source_received_at DESC NULLS LAST,created_at DESC,id_evento_integracion DESC LIMIT $2 OFFSET $3)
    SELECT (SELECT count(*)::int FROM seleccion) total, COALESCE((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY source_received_at DESC NULLS LAST,created_at DESC,id_evento_integracion DESC) FROM pagina),'[]'::jsonb) data`, [id,filters.limit,(filters.page-1)*filters.limit]);
    return respuesta(result,filters);
}

async function obtenerIndicadores(date, db = pool) {
    const result = await db.query(`${FUENTE}${GRUPOS} SELECT
        count(*) FILTER (WHERE necesita_atencion)::int pendientes,
        count(*) FILTER (WHERE necesita_atencion AND actuales.service_date BETWEEN $1::date AND $1::date+1)::int urgentes,
        count(*) FILTER (WHERE necesita_atencion AND eventos.review_status='pending_review')::int sin_revisar,
        count(*) FILTER (WHERE necesita_atencion AND actuales.service_date<$1::date)::int historicos,
        count(*) FILTER (WHERE necesita_atencion AND actuales.service_date IS NULL)::int sin_fecha
        FROM eventos JOIN actuales USING(grupo)`, [date]);
    return result.rows[0];
}

module.exports = { validarConsulta, listarCentro, historialGrupo, obtenerIndicadores, fechaCancun };
