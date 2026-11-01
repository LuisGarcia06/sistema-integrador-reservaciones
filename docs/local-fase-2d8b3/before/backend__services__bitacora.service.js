const pool = require('../config/database');

const columnasBitacora = `
    id_bitacora,
    id_usuario,
    id_reservacion,
    accion,
    descripcion,
    fecha
`;

const crearEntradaBitacora = async ({
    idUsuario,
    idReservacion,
    accion,
    descripcion
}, db = pool) => {
    const query = `
        INSERT INTO bitacora (
            id_usuario,
            id_reservacion,
            accion,
            descripcion,
            fecha
        )
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING
            ${columnasBitacora}
    `;

    const values = [
        idUsuario,
        idReservacion,
        accion,
        descripcion
    ];

    const result = await db.query(query, values);

    return result.rows[0];
};

const consultarBitacora = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (filtros.fecha_desde) {
        values.push(filtros.fecha_desde);
        condiciones.push(`b.fecha >= $${values.length}::date`);
    }

    if (filtros.fecha_hasta) {
        values.push(filtros.fecha_hasta);
        condiciones.push(`b.fecha < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            b.id_bitacora,
            b.id_usuario,
            u.nombre AS usuario,
            u.correo AS usuario_correo,
            b.id_reservacion,
            r.codigo AS codigo_reservacion,
            b.accion,
            b.descripcion,
            b.fecha
        FROM bitacora b
        INNER JOIN usuarios u
            ON u.id_usuario = b.id_usuario
        LEFT JOIN reservaciones r
            ON r.id_reservacion = b.id_reservacion
        ${where}
        ORDER BY b.fecha DESC, b.id_bitacora DESC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const auditoriaActiva = () => require('../validators/auditoria.validator').active();
const exigirMotivo = (db) => {
    const ctx = require('../config/revisionApiTransactions').auditContext(db);
    return require('../validators/auditoria.validator').motivo(ctx.motivo, true, ctx.hasMotivo);
};
const camposAuditoria = Object.freeze({
    operaciones: ['fecha','id_tour','turno','numero_grupo','hora_inicio','id_guia','estado'],
    transportes: ['id_operacion_tour','id_vehiculo','id_operador','observaciones_operador','estado'],
    daily: ['fecha','observaciones']
});
function fotoAuditoria(recurso, fila) {
    if (!fila) return null;
    const campos = camposAuditoria[recurso];
    if (!campos) throw Error('AUDIT_RESOURCE_INVALID');
    return Object.fromEntries(campos.map(campo => {
        let value = fila[campo];
        if (campo === 'fecha' && value instanceof Date) value = value.toISOString().slice(0,10);
        if (campo === 'hora_inicio' && typeof value === 'string') value = value.split('.')[0];
        return [campo, value];
    }));
}
async function registrarAuditoriaEstructurada({recurso, anterior, nuevo}, db) {
    const ctx = require('../config/revisionApiTransactions').auditContext(db);
    if (ctx.resource !== recurso) throw Error('AUDIT_RESOURCE_CONTEXT_MISMATCH');
    const referencia = {operaciones:'id_operacion_tour',transportes:'id_transporte_operacion',daily:'id_daily_observacion'}[recurso];
    if (!referencia || !Number.isInteger(nuevo?.[referencia])) throw Error('AUDIT_RESOURCE_INVALID');
    const antes = fotoAuditoria(recurso, anterior), despues = fotoAuditoria(recurso, nuevo);
    const reason = require('../validators/auditoria.validator').motivo(ctx.motivo, Boolean(anterior), ctx.hasMotivo);
    const result = await db.query(`INSERT INTO bitacora (
        id_usuario,id_reservacion,accion,descripcion,fecha,version_auditoria,origen,instante,
        usuario_nombre_snapshot,${referencia},valores_anteriores,valores_nuevos,motivo,comando_generacion,comando_clave
    ) VALUES ($1,NULL,$2,$3,CURRENT_TIMESTAMP,2,'HUMANO',CURRENT_TIMESTAMP,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
    RETURNING id_bitacora`, [ctx.actor.id,anterior?'MODIFICAR':'CREAR',
        `${recurso} ${anterior?'modificado':'creado'} #${nuevo[referencia]}`,ctx.actor.name,nuevo[referencia],
        antes===null?null:JSON.stringify(antes),JSON.stringify(despues),reason,ctx.generation,ctx.key]).catch(error => {
            error.auditoriaFallida = true;
            throw error;
        });
    return result.rows[0];
}

module.exports = {
    crearEntradaBitacora,
    consultarBitacora,
    auditoriaActiva, exigirMotivo, fotoAuditoria, registrarAuditoriaEstructurada
};
