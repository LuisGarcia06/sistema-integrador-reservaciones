const camposNumericos = [
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio'
];

const camposEnteros = [
    'id_tour',
    'id_pais',
    'id_plataforma',
    'pax',
    'ninos'
];

const camposFecha = [
    'fecha'
];

const camposHora = [
    'pickup_time'
];

const textoSinValor = 'sin valor';

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const esSinValor = (valor) => valor === null || valor === undefined;

const normalizarFecha = (valor) => {
    if (esSinValor(valor)) {
        return null;
    }

    if (valor instanceof Date) {
        return valor.toISOString().slice(0, 10);
    }

    return String(valor).slice(0, 10);
};

const normalizarHora = (valor) => {
    if (esSinValor(valor)) {
        return null;
    }

    const partes = String(valor).split(':');
    const hora = partes[0] || '00';
    const minuto = partes[1] || '00';
    const segundo = partes[2] || '00';

    return `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:${segundo.padStart(2, '0')}`;
};

const normalizarNumero = (valor) => {
    if (esSinValor(valor)) {
        return null;
    }

    const numero = Number(valor);

    return Number.isFinite(numero) ? numero : valor;
};

const normalizarValorParaComparacion = (campo, valor) => {
    if (camposFecha.includes(campo)) {
        return normalizarFecha(valor);
    }

    if (camposHora.includes(campo)) {
        return normalizarHora(valor);
    }

    if (camposNumericos.includes(campo) || camposEnteros.includes(campo)) {
        return normalizarNumero(valor);
    }

    if (esSinValor(valor)) {
        return null;
    }

    return String(valor);
};

const formatearValor = (campo, valor) => {
    if (esSinValor(valor)) {
        return textoSinValor;
    }

    if (camposFecha.includes(campo)) {
        return normalizarFecha(valor);
    }

    if (camposHora.includes(campo)) {
        return normalizarHora(valor);
    }

    return String(valor);
};

const obtenerCambiosReservacion = (reservacionActual, camposPropuestos) => {
    const cambios = [];

    Object.keys(camposPropuestos).forEach((campo) => {
        if (!tieneCampo(reservacionActual, campo)) {
            return;
        }

        const valorAnterior = reservacionActual[campo];
        const valorNuevo = camposPropuestos[campo];
        const valorAnteriorNormalizado = normalizarValorParaComparacion(campo, valorAnterior);
        const valorNuevoNormalizado = normalizarValorParaComparacion(campo, valorNuevo);

        if (valorAnteriorNormalizado === valorNuevoNormalizado) {
            return;
        }

        cambios.push({
            campo,
            valorAnterior,
            valorNuevo
        });
    });

    return cambios;
};

const obtenerCamposActualizacionDesdeCambios = (cambios) => (
    cambios.reduce((campos, cambio) => {
        campos[cambio.campo] = cambio.valorNuevo;
        return campos;
    }, {})
);

const generarDescripcionCambios = (cambios) => (
    cambios
        .map((cambio) => (
            `${cambio.campo}: ${formatearValor(cambio.campo, cambio.valorAnterior)} -> ${formatearValor(cambio.campo, cambio.valorNuevo)}`
        ))
        .join('; ')
);

module.exports = {
    obtenerCambiosReservacion,
    obtenerCamposActualizacionDesdeCambios,
    generarDescripcionCambios,
    normalizarValorParaComparacion
};
