// Setup opcional para suites aisladas. Impide cualquier conexion real a pg,
// incluso si una prueba olvida inyectar su DB fake o mockear config/database.
// No utilizar para api.test.js, que requiere una base de pruebas verificada.
jest.mock('pg', () => ({
    Pool: class PoolAislado extends require('node:events').EventEmitter {
        async query() {
            throw new Error('PostgreSQL real bloqueado en pruebas aisladas');
        }

        async connect() {
            throw new Error('PostgreSQL real bloqueado en pruebas aisladas');
        }

        async end() {}
    }
}));
