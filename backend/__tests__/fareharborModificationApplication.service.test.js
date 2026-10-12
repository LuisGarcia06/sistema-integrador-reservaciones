jest.mock('../services/reservaciones.service', () => ({
    actualizarReservacionParcialConDb: jest.fn(),
}));

jest.mock('../integrations/fareharbor/fareharborModificationDiff.service', () => ({
    obtenerPreviewModificationFareHarborConDb: jest.fn(),
}));

const reservacionesService = require('../services/reservaciones.service');
const {
    obtenerPreviewModificationFareHarborConDb,
} = require('../integrations/fareharbor/fareharborModificationDiff.service');
const {
    aplicarModificationFareHarbor,
} = require('../integrations/fareharbor/fareharborModificationApplication.service');

const FINGERPRINT = 'a'.repeat(64);

function crearEvento(overrides = {}) {
    return {
        id_evento_integracion: 50,
        provider: 'fareharbor',
        external_booking_id: 'fh-booking-mod',
        event_type: 'modification',
        review_status: 'approved',
        application_status: 'not_applied',
        normalized_data: { external_booking_id: 'fh-booking-mod' },
        source_received_at: new Date('2027-03-01T12:00:00Z'),
        created_at: new Date('2027-03-01T12:00:00Z'),
        ...overrides,
    };
}

function crearReservacion(overrides = {}) {
    return {
        id_reservacion: 45,
        codigo: 'RSV-FH-MOD',
        fecha: new Date('2027-03-15T00:00:00Z'),
        id_tour: 70,
        nombre_cliente: 'Persona Sintetica',
        telefono_cliente: '+520000000000',
        pax: 3,
        ninos: 1,
        pickup_place: 'Lobby viejo',
        pickup_time: '08:30:00',
        turno: 'Mañana',
        precio_total: '3760.00',
        deposito: '1000.00',
        saldo: '2760.00',
        estado: 'Pendiente',
        id_transporte_operacion: null,
        ultima_actualizacion: new Date('2027-03-01T13:00:00Z'),
        ...overrides,
    };
}

function crearDiff(overrides = {}) {
    return {
        diff_fingerprint: FINGERPRINT,
        id_reservacion: 45,
        changes: [
            {
                field: 'pickup_place',
                baseline_external: 'Lobby viejo',
                internal_current: 'Lobby viejo',
                fareharbor_new: 'Lobby nuevo',
                external_changed: true,
                internal_diverged_from_baseline: false,
                conflict: false,
            },
        ],
        blocking_issues: [],
        ...overrides,
    };
}

function crearPoolFake({ evento = crearEvento(), reservacion = crearReservacion(), link = { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-mod', id_reservacion: 45 } } = {}) {
    const client = {
        query: jest.fn(async (query, values = []) => {
            const sql = String(query);

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: evento ? [evento] : [] };
            }

            if (/FROM eventos_integracion[\s\S]+external_booking_id = \$2[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: [{ id_evento_integracion: evento.id_evento_integracion }] };
            }

            if (/FROM reservas_integracion_link/i.test(sql)) {
                return { rows: link ? [link] : [] };
            }

            if (/FROM reservaciones[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: reservacion ? [reservacion] : [] };
            }

            if (/UPDATE eventos_integracion[\s\S]+application_status = \$1/i.test(sql)) {
                return {
                    rows: [{
                        id_evento_integracion: evento.id_evento_integracion,
                        review_status: 'approved',
                        application_status: 'applied',
                        applied_at: new Date('2027-03-01T15:00:00Z'),
                        applied_by: values[1],
                    }],
                };
            }

            throw new Error(`Query no soportado en test: ${sql}`);
        }),
        release: jest.fn(),
    };

    return {
        client,
        pool: {
            connect: jest.fn(async () => client),
        },
    };
}

describe('fareharborModificationApplication.service FH-MOD-03B', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        obtenerPreviewModificationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_modification_diff: crearDiff(),
        });
        reservacionesService.actualizarReservacionParcialConDb.mockResolvedValue({
            ...crearReservacion(),
            pickup_place: 'Lobby nuevo',
        });
    });

    test('aplica patch minimo y marca evento aplicado en la misma transaccion', async () => {
        const { pool, client } = crearPoolFake();

        const resultado = await aplicarModificationFareHarbor(50, 7, {
            diff_fingerprint: FINGERPRINT,
            decisions: { pickup_place: 'apply_external' },
            completar: {},
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(resultado.updatedFields).toEqual(['pickup_place']);
        expect(reservacionesService.actualizarReservacionParcialConDb).toHaveBeenCalledWith(
            client,
            45,
            { pickup_place: 'Lobby nuevo' },
            7
        );
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('rechaza fingerprint obsoleto y hace rollback antes de modificar reservacion', async () => {
        const { pool, client } = crearPoolFake();
        obtenerPreviewModificationFareHarborConDb.mockResolvedValueOnce({
            tipo: 'preview',
            fareharbor_modification_diff: crearDiff({ diff_fingerprint: 'b'.repeat(64) }),
        });

        const resultado = await aplicarModificationFareHarbor(50, 7, {
            diff_fingerprint: FINGERPRINT,
            decisions: { pickup_place: 'apply_external' },
            completar: {},
        }, pool);

        expect(resultado.tipo).toBe('diff_obsoleto');
        expect(reservacionesService.actualizarReservacionParcialConDb).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    });

    test('requiere decision explicita por cada grupo con cambio relevante', async () => {
        const { pool, client } = crearPoolFake();

        const resultado = await aplicarModificationFareHarbor(50, 7, {
            diff_fingerprint: FINGERPRINT,
            decisions: {},
            completar: {},
        }, pool);

        expect(resultado.tipo).toBe('datos_invalidos');
        expect(resultado.errores).toContain('decision.pickup_place es requerida');
        expect(reservacionesService.actualizarReservacionParcialConDb).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('money_group invalido permite keep_internal y bloquea apply_external', async () => {
        obtenerPreviewModificationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_modification_diff: crearDiff({
                changes: [
                    {
                        field: 'money_group',
                        baseline_external: { precio_total: '3760.00', deposito: '1000.00', saldo: '2760.00' },
                        internal_current: { precio_total: '3760.00', deposito: '1000.00', saldo: '2760.00' },
                        fareharbor_new: { precio_total: '100.00', deposito: '200.00', saldo: '-100.00' },
                    },
                ],
                blocking_issues: ['current money: el importe pagado supera el total.'],
            }),
        });

        const keep = crearPoolFake();
        const resultadoKeep = await aplicarModificationFareHarbor(50, 7, {
            diff_fingerprint: FINGERPRINT,
            decisions: { money_group: 'keep_internal' },
            completar: {},
        }, keep.pool);

        expect(resultadoKeep.tipo).toBe('aplicado');
        expect(resultadoKeep.noChangesApplied).toBe(true);
        expect(reservacionesService.actualizarReservacionParcialConDb).not.toHaveBeenCalled();
        expect(keep.client.query).toHaveBeenCalledWith('COMMIT');

        const apply = crearPoolFake();
        const resultadoApply = await aplicarModificationFareHarbor(50, 7, {
            diff_fingerprint: FINGERPRINT,
            decisions: { money_group: 'apply_external' },
            completar: {},
        }, apply.pool);

        expect(resultadoApply.tipo).toBe('decision_bloqueada');
        expect(resultadoApply.reason).toBe('money_fareharbor_invalido');
        expect(apply.client.query).toHaveBeenCalledWith('ROLLBACK');
    });
});