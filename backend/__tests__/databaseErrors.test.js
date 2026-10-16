const { EventEmitter } = require('node:events');

describe('Errores de conexiones PostgreSQL inactivas', () => {
    let pool;
    let log;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock('pg', () => ({ Pool: class PoolDePrueba extends EventEmitter {} }));
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        log = jest.spyOn(console, 'error').mockImplementation(() => {});
        pool = require('../config/database');
    });

    afterEach(() => {
        log.mockRestore();
        jest.dontMock('pg');
        jest.dontMock('dotenv');
    });

    test('cierre del servidor no genera evento error sin manejar ni vuelca credenciales', () => {
        const error = Object.assign(new Error('Detalle sensible sintetico'), {
            code: '57P01',
            client: { password: 'SoloPruebaNoPublicar' }
        });
        expect(() => pool.emit('error', error)).not.toThrow();
        expect(log).toHaveBeenCalledWith('Conexion PostgreSQL inactiva interrumpida.', '57P01');
        expect(JSON.stringify(log.mock.calls)).not.toContain('SoloPruebaNoPublicar');
        expect(JSON.stringify(log.mock.calls)).not.toContain('Detalle sensible sintetico');
    });

    test('error de red sin codigo conserva registro seguro', () => {
        expect(() => pool.emit('error', new Error('Conexion finalizada'))).not.toThrow();
        expect(log).toHaveBeenCalledWith('Conexion PostgreSQL inactiva interrumpida.', 'PG_CONNECTION_ERROR');
    });
});
