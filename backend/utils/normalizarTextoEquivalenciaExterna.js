function normalizarTextoEquivalenciaExterna(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’`´]/g, '')
        .replace(/[^a-z0-9ñ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    normalizarTextoEquivalenciaExterna,
};