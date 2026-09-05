const obtenerTurno = (horaInicio) => {
    const hora = typeof horaInicio === 'string'
        ? horaInicio.slice(0, 5)
        : '';

    return hora <= '12:00' ? 'Mañana' : 'Tarde';
};

module.exports = {
    obtenerTurno
};
