const {
    FareHarborApiError,
    FareHarborConfigError,
    obtenerReserva,
    probarConexion
} = require('../integrations/fareharbor/fareharbor.client');

const crearEnv = (sobrescrituras = {}) => ({
    FAREHARBOR_BASE_URL: 'https://demo.fareharbor.com/api/external/v1',
    FAREHARBOR_APP_KEY: 'APP_KEY_TEST',
    FAREHARBOR_USER_KEY: 'USER_KEY_TEST',
    FAREHARBOR_COMPANY_SHORTNAME: 'company_test',
    ...sobrescrituras
});

const crearFetch = ({ status = 200, body = { companies: [] } } = {}) => jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
});

describe('fareharbor.client', () => {
    test('probarConexion falla de forma controlada si falta configuracion', async () => {
        await expect(probarConexion({
            env: crearEnv({ FAREHARBOR_APP_KEY: '' }),
            fetchImpl: crearFetch()
        })).rejects.toMatchObject({
            name: 'FareHarborConfigError',
            code: 'FAREHARBOR_CONFIG_ERROR',
            missing: ['FAREHARBOR_APP_KEY']
        });
    });

    test('probarConexion usa GET /companies/ con headers oficiales', async () => {
        const fetchImpl = crearFetch();

        await probarConexion({ env: crearEnv(), fetchImpl });

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://demo.fareharbor.com/api/external/v1/companies/',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'X-FareHarbor-API-App': 'APP_KEY_TEST',
                    'X-FareHarbor-API-User': 'USER_KEY_TEST'
                })
            })
        );
    });

    test('obtenerReserva usa el endpoint oficial de booking por UUID', async () => {
        const bookingUuid = '11111111-2222-4333-8444-555555555555';
        const fetchImpl = crearFetch({ body: { booking: { uuid: bookingUuid } } });

        await obtenerReserva('company_test', bookingUuid, { env: crearEnv(), fetchImpl });

        expect(fetchImpl).toHaveBeenCalledWith(
            `https://demo.fareharbor.com/api/external/v1/companies/company_test/bookings/${bookingUuid}/`,
            expect.any(Object)
        );
    });

    test.each([
        [403, 'FareHarbor rechazo las credenciales o permisos'],
        [404, 'Recurso de FareHarbor no encontrado'],
        [429, 'Limite de solicitudes de FareHarbor alcanzado']
    ])('maneja error %s de FareHarbor', async (status, message) => {
        await expect(probarConexion({
            env: crearEnv(),
            fetchImpl: crearFetch({ status, body: { error: 'ERROR_TEST' } })
        })).rejects.toMatchObject({
            name: 'FareHarborApiError',
            status,
            message
        });
    });

    test('exporta errores tipados para manejo controlado', () => {
        expect(new FareHarborConfigError('test')).toBeInstanceOf(Error);
        expect(new FareHarborApiError('test')).toBeInstanceOf(Error);
    });
});
