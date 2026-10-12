jest.mock('../services/reservaciones.service', () => ({
    cancelarReservacionConDb: jest.fn(),
}));

jest.mock('../integrations/fareharbor/fareharborCancellationPreview.service', () => ({
    BOOKING_STATUS_CANCELLED: 'cancelled',
    EVENT_TYPE_CANCELLATION: 'cancellation',
    PROVIDER_FAREHARBOR: 'fareharbor',
    RESOLUTION_CANCEL_RESERVATION: 'cancel_reservation',
    RESOLUTION_LINK_BROKEN: 'link_broken',
    RESOLUTION_RECONCILE_ALREADY_CANCELLED: 'reconcile_already_cancelled',
    RESOLUTION_RESOLVE_WITHOUT_LINK: 'resolve_without_link',
    obtenerPreviewCancellationFareHarborConDb: jest.fn(),
}));

const reservacionesService = require('../services/reservaciones.service');
const {
    obtenerPreviewCancellationFareHarborConDb,
} = require('../integrations/fareharbor/fareharborCancellationPreview.service');
const {
    aplicarCancellationFareHarbor,
} = require('../integrations/fareharbor/fareharborCancellationApplication.service');

const FINGERPRINT = 'a'.repeat(64);

function crearEvento(overrides = {}) {
    return {
        id_evento_integracion: 130,
        provider: 'fareharbor',
        external_booking_id: 'fh-booking-cancel',
        event_type: 'cancellation',
        review_status: 'approved',
        application_status: 'not_applied',
        normalized_data: {
            external_booking_id: 'fh-booking-cancel',
            booking: { status: 'cancelled' },
        },
        source_received_at: new Date('2027-03-10T12:00:00Z'),
        created_at: new Date('2027-03-10T12:00:01Z'),
        ...overrides,
    };
}

function crearPreview(overrides = {}) {
    return {
        type: 'fareharbor_cancellation_preview',
        external_booking_id: 'fh-booking-cancel',
        booking_status: 'cancelled',
        resolution_mode: 'resolve_without_link',
        requires_motivo_cancelacion: false,
        reservation_context: null,
        current_event: {
            id_evento_integracion: 130,
            latest_snapshot_id: 130,
            is_latest_snapshot: true,
        },
        blocking_issues: [],
        warnings: [],
        cancellation_fingerprint: FINGERPRINT,
        ...overrides,
    };
}

function crearReservacion(overrides = {}) {
    return {
        id_reservacion: 45,
        codigo: 'RSV-FH-CAN',
        estado: 'Pendiente',
        motivo_cancelacion: null,
        ...overrides,
    };
}

function crearPoolFake({
    evento = crearEvento(),
    snapshots = null,
    link = null,
    lockedReservation = { id_reservacion: 45 },
    markApplied = true,
} = {}) {
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
                return {
                    rows: snapshots || (evento ? [{ id_evento_integracion: evento.id_evento_integracion }] : []),
                };
            }

            if (/FROM reservas_integracion_link/i.test(sql)) {
                return { rows: link ? [link] : [] };
            }

            if (/FROM reservaciones[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: lockedReservation ? [lockedReservation] : [] };
            }

            if (/UPDATE eventos_integracion[\s\S]+application_status = \$1/i.test(sql)) {
                return {
                    rows: markApplied ? [{
                        id_evento_integracion: evento.id_evento_integracion,
                        review_status: 'approved',
                        application_status: 'applied',
                        applied_at: new Date('2027-03-10T13:00:00Z'),
                        applied_by: values[1],
                    }] : [],
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

describe('fareharborCancellationApplication.service FH-CANCEL-03B', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview(),
        });
        reservacionesService.cancelarReservacionConDb.mockResolvedValue({
            reservacion: crearReservacion({ estado: 'Cancelada', motivo_cancelacion: 'Cliente cancela' }),
            yaEstabaCancelada: false,
        });
    });

    test('resolve_without_link marca applied sin crear reservacion, link ni bitacora', async () => {
        const { pool, client } = crearPoolFake();

        const resultado = await aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(resultado.resolutionMode).toBe('resolve_without_link');
        expect(resultado.noReservationLink).toBe(true);
        expect(resultado.reservacion).toBeNull();
        expect(resultado.link).toBeNull();
        expect(reservacionesService.cancelarReservacionConDb).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
    });

    test('apply exige approved y not_applied', async () => {
        const noAprobado = crearPoolFake({ evento: crearEvento({ review_status: 'pending_review' }) });
        await expect(aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, noAprobado.pool))
            .resolves.toHaveProperty('tipo', 'no_aprobado');
        expect(noAprobado.client.query).toHaveBeenCalledWith('ROLLBACK');

        const aplicado = crearPoolFake({ evento: crearEvento({ application_status: 'applied' }) });
        await expect(aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, aplicado.pool))
            .resolves.toHaveProperty('tipo', 'ya_aplicado');
        expect(aplicado.client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('fingerprint stale y snapshot no latest devuelven 409 semantico con rollback', async () => {
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValueOnce({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({ cancellation_fingerprint: 'b'.repeat(64) }),
        });
        const stale = crearPoolFake();

        await expect(aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, stale.pool))
            .resolves.toHaveProperty('tipo', 'fingerprint_obsoleto');
        expect(stale.client.query).toHaveBeenCalledWith('ROLLBACK');

        const noLatest = crearPoolFake({ snapshots: [{ id_evento_integracion: 131 }, { id_evento_integracion: 130 }] });
        await expect(aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, noLatest.pool))
            .resolves.toHaveProperty('tipo', 'snapshot_obsoleto');
        expect(noLatest.client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('booking.status distinto de cancelled bloquea antes de aplicar', async () => {
        const { pool, client } = crearPoolFake({
            evento: crearEvento({
                normalized_data: {
                    external_booking_id: 'fh-booking-cancel',
                    booking: { status: 'booked' },
                },
            }),
        });

        const resultado = await aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, pool);

        expect(resultado.tipo).toBe('event_blocked');
        expect(resultado.reason).toBe('booking_status_no_cancelled');
        expect(reservacionesService.cancelarReservacionConDb).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('cancel_reservation exige motivo y ejecuta dominio una sola vez', async () => {
        const link = { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-cancel', id_reservacion: 45 };
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({
                resolution_mode: 'cancel_reservation',
                requires_motivo_cancelacion: true,
                reservation_context: { id_reservacion: 45, codigo: 'RSV-FH-CAN', estado: 'Pendiente' },
            }),
        });

        const sinMotivo = crearPoolFake({ link });
        await expect(aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, sinMotivo.pool))
            .resolves.toHaveProperty('tipo', 'faltan_datos');
        expect(reservacionesService.cancelarReservacionConDb).not.toHaveBeenCalled();
        expect(sinMotivo.client.query).toHaveBeenCalledWith('ROLLBACK');

        const conMotivo = crearPoolFake({ link });
        const resultado = await aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
            motivo_cancelacion: 'Cliente cancela por clima',
        }, conMotivo.pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(resultado.resolutionMode).toBe('cancel_reservation');
        expect(reservacionesService.cancelarReservacionConDb).toHaveBeenCalledWith(
            conMotivo.client,
            45,
            7,
            'Cliente cancela por clima'
        );
        expect(conMotivo.client.query).toHaveBeenCalledWith('COMMIT');
    });

    test('reconcile_already_cancelled no llama cancelacion ni cambia motivo', async () => {
        const link = { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-cancel', id_reservacion: 45 };
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({
                resolution_mode: 'reconcile_already_cancelled',
                reservation_context: { id_reservacion: 45, codigo: 'RSV-FH-CAN', estado: 'Cancelada' },
            }),
        });
        const { pool, client } = crearPoolFake({ link });

        const resultado = await aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(resultado.alreadyCancelled).toBe(true);
        expect(reservacionesService.cancelarReservacionConDb).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    test('motivo innecesario en reconcile o resolve_without_link se rechaza', async () => {
        const resolve = crearPoolFake();
        await expect(aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
            motivo_cancelacion: 'No requerido',
        }, resolve.pool)).resolves.toMatchObject({
            tipo: 'datos_invalidos',
        });
        expect(resolve.client.query).toHaveBeenCalledWith('ROLLBACK');

        obtenerPreviewCancellationFareHarborConDb.mockResolvedValueOnce({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({
                resolution_mode: 'reconcile_already_cancelled',
                reservation_context: { id_reservacion: 45, estado: 'Cancelada' },
            }),
        });
        const reconcile = crearPoolFake({
            link: { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-cancel', id_reservacion: 45 },
        });
        await expect(aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
            motivo_cancelacion: 'No requerido',
        }, reconcile.pool)).resolves.toMatchObject({
            tipo: 'datos_invalidos',
        });
        expect(reconcile.client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('link_broken y blocking_issues bloquean sin convertir a resolve_without_link', async () => {
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValueOnce({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({
                resolution_mode: 'link_broken',
                reservation_context: { id_reservacion: 999 },
                blocking_issues: ['reservacion_vinculada_no_encontrada'],
            }),
        });
        const { pool, client } = crearPoolFake({
            link: { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-cancel', id_reservacion: 999 },
            lockedReservation: null,
        });

        const resultado = await aplicarCancellationFareHarbor(130, 7, { cancellation_fingerprint: FINGERPRINT }, pool);

        expect(resultado.tipo).toBe('event_blocked');
        expect(resultado.reason).toBe('reservacion_vinculada_no_encontrada');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('conflicto de dominio y fallo de mark applied hacen rollback completo', async () => {
        const link = { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-cancel', id_reservacion: 45 };
        obtenerPreviewCancellationFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            fareharbor_cancellation_preview: crearPreview({
                resolution_mode: 'cancel_reservation',
                requires_motivo_cancelacion: true,
                reservation_context: { id_reservacion: 45, estado: 'Pendiente' },
            }),
        });
        const error = new Error('No se puede cancelar la reservación porque el transporte con vehículo quedaría con menos de 2 pasajeros activos');
        error.statusCode = 400;
        reservacionesService.cancelarReservacionConDb.mockRejectedValueOnce(error);
        const conflicto = crearPoolFake({ link });

        await expect(aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
            motivo_cancelacion: 'Cliente cancela',
        }, conflicto.pool)).resolves.toMatchObject({
            tipo: 'domain_conflict',
            reason: error.message,
        });
        expect(conflicto.client.query).toHaveBeenCalledWith('ROLLBACK');

        reservacionesService.cancelarReservacionConDb.mockResolvedValueOnce({
            reservacion: crearReservacion({ estado: 'Cancelada' }),
            yaEstabaCancelada: false,
        });
        const markFalla = crearPoolFake({ link, markApplied: false });
        await expect(aplicarCancellationFareHarbor(130, 7, {
            cancellation_fingerprint: FINGERPRINT,
            motivo_cancelacion: 'Cliente cancela',
        }, markFalla.pool)).resolves.toHaveProperty('tipo', 'ya_aplicado');
        expect(markFalla.client.query).toHaveBeenCalledWith('ROLLBACK');
    });
});
