const pool = require('../config/database');
const { normalizarTextoEquivalenciaExterna } = require('../utils/normalizarTextoEquivalenciaExterna');

function construirDatosEquivalenciaTourExterno({
    provider,
    activityTitle,
    optionTitle,
    idTour,
    turno,
    activo = true,
    notas = null,
}) {
    return {
        provider: String(provider || '').trim(),
        activity_title: String(activityTitle || '').trim(),
        option_title: String(optionTitle || '').trim(),
        activity_title_normalizado: normalizarTextoEquivalenciaExterna(activityTitle),
        option_title_normalizado: normalizarTextoEquivalenciaExterna(optionTitle),
        id_tour: idTour,
        turno,
        activo,
        notas,
    };
}

async function resolverEquivalenciaTourExternoConDb(db, {
    provider,
    activityTitle,
    optionTitle,
} = {}) {
    const providerNormalizado = String(provider || '').trim();
    const activityTitleNormalizado = normalizarTextoEquivalenciaExterna(activityTitle);
    const optionTitleNormalizado = normalizarTextoEquivalenciaExterna(optionTitle);

    if (!providerNormalizado || !activityTitleNormalizado || !optionTitleNormalizado) {
        return null;
    }

    const result = await db.query(
        `
            SELECT
                id_equivalencia_tour_externo,
                provider,
                id_tour,
                turno
            FROM equivalencias_tours_externos
            WHERE LOWER(BTRIM(provider)) = LOWER(BTRIM($1))
              AND activity_title_normalizado = $2
              AND option_title_normalizado = $3
              AND activo = TRUE
        `,
        [providerNormalizado, activityTitleNormalizado, optionTitleNormalizado]
    );

    if (result.rows.length !== 1) {
        return null;
    }

    return {
        id_equivalencia_tour_externo: result.rows[0].id_equivalencia_tour_externo,
        provider: result.rows[0].provider,
        id_tour: result.rows[0].id_tour,
        turno: result.rows[0].turno,
    };
}

async function resolverEquivalenciaTourExterno(params, db = pool) {
    return resolverEquivalenciaTourExternoConDb(db, params);
}

module.exports = {
    construirDatosEquivalenciaTourExterno,
    resolverEquivalenciaTourExterno,
    resolverEquivalenciaTourExternoConDb,
};