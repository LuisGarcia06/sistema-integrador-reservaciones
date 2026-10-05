const DEFAULT_BASE_URL = 'https://demo.fareharbor.com/api/external/v1';

class FareHarborConfigError extends Error {
    constructor(message, missing = []) {
        super(message);
        this.name = 'FareHarborConfigError';
        this.code = 'FAREHARBOR_CONFIG_ERROR';
        this.missing = missing;
    }
}

class FareHarborApiError extends Error {
    constructor(message, { status = null, code = 'FAREHARBOR_API_ERROR', details = null } = {}) {
        super(message);
        this.name = 'FareHarborApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

const quitarSlashFinal = (value = '') => value.replace(/\/+$/, '');

const crearConfig = (env = process.env) => {
    const config = {
        baseUrl: quitarSlashFinal(env.FAREHARBOR_BASE_URL || ''),
        appKey: env.FAREHARBOR_APP_KEY,
        userKey: env.FAREHARBOR_USER_KEY,
        companyShortname: env.FAREHARBOR_COMPANY_SHORTNAME
    };

    const missing = [];

    if (!config.baseUrl) missing.push('FAREHARBOR_BASE_URL');
    if (!config.appKey) missing.push('FAREHARBOR_APP_KEY');
    if (!config.userKey) missing.push('FAREHARBOR_USER_KEY');

    if (missing.length > 0) {
        throw new FareHarborConfigError('Configuracion incompleta de FareHarbor', missing);
    }

    return config;
};

const leerJsonSeguro = async (response) => {
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
};

const crearMensajeError = (status) => {
    if (status === 400) return 'Solicitud invalida para FareHarbor';
    if (status === 403) return 'FareHarbor rechazo las credenciales o permisos';
    if (status === 404) return 'Recurso de FareHarbor no encontrado';
    if (status === 429) return 'Limite de solicitudes de FareHarbor alcanzado';
    if (status >= 500) return 'FareHarbor no esta disponible temporalmente';

    return 'Error al consultar FareHarbor';
};

const requestFareHarbor = async (path, { env = process.env, fetchImpl = global.fetch } = {}) => {
    const config = crearConfig(env);

    if (typeof fetchImpl !== 'function') {
        throw new FareHarborConfigError('No hay cliente HTTP disponible para FareHarbor');
    }

    let response;

    try {
        response = await fetchImpl(`${config.baseUrl}${path}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-FareHarbor-API-App': config.appKey,
                'X-FareHarbor-API-User': config.userKey
            }
        });
    } catch (error) {
        throw new FareHarborApiError('Error de red al consultar FareHarbor', {
            code: 'FAREHARBOR_NETWORK_ERROR',
            details: error.message
        });
    }

    const data = await leerJsonSeguro(response);

    if (!response.ok) {
        throw new FareHarborApiError(crearMensajeError(response.status), {
            status: response.status,
            details: data
        });
    }

    return data;
};

const probarConexion = (options = {}) => requestFareHarbor('/companies/', options);

const obtenerReserva = (shortname, bookingUuid, options = {}) => {
    if (!shortname) {
        throw new FareHarborConfigError('Falta shortname de FareHarbor', ['FAREHARBOR_COMPANY_SHORTNAME']);
    }

    if (!bookingUuid) {
        throw new FareHarborConfigError('Falta UUID de booking de FareHarbor');
    }

    const encodedShortname = encodeURIComponent(shortname);
    const encodedBookingUuid = encodeURIComponent(bookingUuid);

    return requestFareHarbor(`/companies/${encodedShortname}/bookings/${encodedBookingUuid}/`, options);
};

module.exports = {
    FareHarborApiError,
    FareHarborConfigError,
    crearConfig,
    obtenerReserva,
    probarConexion
};

