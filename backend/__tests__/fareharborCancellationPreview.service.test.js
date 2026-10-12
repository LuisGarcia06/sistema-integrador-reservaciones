const {
    RESOLUTION_CANCEL_RESERVATION,
    RESOLUTION_LINK_BROKEN,
    RESOLUTION_RECONCILE_ALREADY_CANCELLED,
    RESOLUTION_RESOLVE_WITHOUT_LINK,
    obtenerDiffCancellationFareHarbor,
} = require('../integrations/fareharbor/fareharborCancellationPreview.service');

function crearEvento(overrides = {}) {
    return {
        id_evento_integracion: 130,
        provider: 'fareharbor',
        external_event_id: 'fh:booking:cancelled',
        external_booking_id: 'fh-booking-cancel',
        event_type: 'cancellation',
        review_status: 'pending_review',
        application_status: 'not_applied',
        normalized_data: {
            external_booking_id: 'fh-booking-cancel',
            booking: {
                display_id: 'FH-CAN-001',
                status: 'cancelled',
            },
        },
        source_received_at: new Date('2027-03-10T12:00:00.000Z'),
        created_at: new Date('2027-03-10T12:00:01.000Z'),
        ...overrides,
    };
}

function crearReservacion(overrides = {}) {
    return {
        id_reservacion: 45,
        codigo: 'RSV-FH-CAN',
        fecha: new Date('2027-03-15T00:00:00.000Z'),
        id_tour: 70,
        turno: 'Mañana',
        estado: 'Pendiente',
        id_transporte_operacion: null,
        ultima_actualizacion: new Date('2027-03-01T13:00:00.000Z'),
        ...overrides,
    };
}

function crearDbFake({
    evento = crearEvento(),
    latest = evento,
    link = null,
    reservacion = null,
} = {}) {
    return {
        query: jest.fn(async (query, values = []) => {
            const sql = String(query);

            if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql)) {
                throw new Error(`Escritura inesperada en preview cancellation: ${sql}`);
            }

            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+LIMIT 1/i.test(sql)) {
                return {
                    rows: evento && Number(evento.id_evento_integracion) === Number(values[0]) ? [evento] : [],
                };
            }

            if (/FROM eventos_integracion[\s\S]+external_booking_id = \$2[\s\S]+ORDER BY/i.test(sql)) {
                return { rows: latest ? [latest] : [] };
            }

            if (/FROM reservas_integracion_link/i.test(sql)) {
                if (
                    link
                    && link.provider === values[0]
                    && link.external_booking_id === values[1]
                ) {
                    return { rows: [link] };
                }

                return { rows: [] };
            }

            if (/FROM reservaciones/i.test(sql)) {
                return {
                    rows: reservacion && Number(reservacion.id_reservacion) === Number(values[0])
                        ? [reservacion]
                        : [],
                };
            }

            throw new Error(`Query no soportado en prueba: ${sql}`);
        }),
    };
}

async function obtenerPreview(db) {
    const resultado = await obtenerDiffCancellationFareHarbor(130, db);

    expect(resultado.tipo).toBe('preview');
    return resultado.fareharbor_cancellation_preview;
}

describe('fareharborCancellationPreview.service FH-CANCEL-03A', () => {
    test('sin link devuelve resolve_without_link sin requerir motivo ni escribir datos', async () => {
        const db = crearDbFake();
        const preview = await obtenerPreview(db);

        expect(preview).toEqual(expect.objectContaining({
            type: 'fareharbor_cancellation_preview',
            external_booking_id: 'fh-booking-cancel',
            booking_status: 'cancelled',
            resolution_mode: RESOLUTION_RESOLVE_WITHOUT_LINK,
            requires_motivo_cancelacion: false,
            reservation_context: null,
            blocking_issues: [],
        }));
        expect(preview.current_event).toEqual(expect.objectContaining({
            id_evento_integracion: 130,
            latest_snapshot_id: 130,
            is_latest_snapshot: true,
        }));
        expect(preview.cancellation_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(db.query.mock.calls.every(([query]) => /^\s*SELECT\b/i.test(query))).toBe(true);
    });

    test('link activo devuelve cancel_reservation con contexto seguro y warning de transporte', async () => {
        const preview = await obtenerPreview(crearDbFake({
            link: {
                id_reserva_integracion_link: 1,
                provider: 'fareharbor',
                external_booking_id: 'fh-booking-cancel',
                id_reservacion: 45,
            },
            reservacion: crearReservacion({ id_transporte_operacion: 77 }),
        }));
        const serialized = JSON.stringify(preview);

        expect(preview.resolution_mode).toBe(RESOLUTION_CANCEL_RESERVATION);
        expect(preview.requires_motivo_cancelacion).toBe(true);
        expect(preview.reservation_context).toEqual(expect.objectContaining({
            id_reservacion: 45,
            codigo: 'RSV-FH-CAN',
            id_tour: 70,
            turno: 'Mañana',
            estado: 'Pendiente',
            id_transporte_operacion: 77,
            assigned_to_transport: true,
        }));
        expect(preview.warnings).toContain('La reservación tiene transporte asignado. La cancelación estará sujeta a reglas operativas de capacidad al aplicarse.');
        expect(serialized).not.toMatch(/nombre_cliente|telefono_cliente|pickup_place|pickup_time|Cliente privado/i);
    });

    test('reservacion ya cancelada devuelve reconcile_already_cancelled sin motivo', async () => {
        const preview = await obtenerPreview(crearDbFake({
            link: {
                id_reserva_integracion_link: 1,
                provider: 'fareharbor',
                external_booking_id: 'fh-booking-cancel',
                id_reservacion: 45,
            },
            reservacion: crearReservacion({ estado: 'Cancelada' }),
        }));

        expect(preview.resolution_mode).toBe(RESOLUTION_RECONCILE_ALREADY_CANCELLED);
        expect(preview.requires_motivo_cancelacion).toBe(false);
        expect(preview.blocking_issues).toEqual([]);
    });

    test('link roto queda bloqueado y no se convierte en resolve_without_link', async () => {
        const preview = await obtenerPreview(crearDbFake({
            link: {
                id_reserva_integracion_link: 1,
                provider: 'fareharbor',
                external_booking_id: 'fh-booking-cancel',
                id_reservacion: 999,
            },
            reservacion: null,
        }));

        expect(preview.resolution_mode).toBe(RESOLUTION_LINK_BROKEN);
        expect(preview.reservation_context).toEqual({ id_reservacion: 999 });
        expect(preview.blocking_issues).toContain('reservacion_vinculada_no_encontrada');
    });

    test('event_type cancellation exige booking.status cancelled y snapshot latest', async () => {
        const evento = crearEvento({
            normalized_data: {
                external_booking_id: 'fh-booking-cancel',
                booking: { status: 'booked' },
            },
        });
        const latest = crearEvento({
            id_evento_integracion: 131,
            source_received_at: new Date('2027-03-10T13:00:00.000Z'),
        });
        const preview = await obtenerPreview(crearDbFake({ evento, latest }));

        expect(preview.booking_status).toBe('booked');
        expect(preview.current_event.is_latest_snapshot).toBe(false);
        expect(preview.current_event.latest_snapshot_id).toBe(131);
        expect(preview.blocking_issues).toEqual(expect.arrayContaining([
            'booking.status FareHarbor no confirma una cancelación.',
            'Existe un snapshot FareHarbor más reciente para este booking.',
        ]));
    });

    test('fingerprint es determinista y cambia con latest, estado, ultima_actualizacion y resolution_mode', async () => {
        const link = {
            id_reserva_integracion_link: 1,
            provider: 'fareharbor',
            external_booking_id: 'fh-booking-cancel',
            id_reservacion: 45,
        };
        const original = await obtenerPreview(crearDbFake({
            link,
            reservacion: crearReservacion(),
        }));
        const mismo = await obtenerPreview(crearDbFake({
            link,
            reservacion: crearReservacion(),
        }));
        const latestDiferente = await obtenerPreview(crearDbFake({
            latest: crearEvento({ id_evento_integracion: 131 }),
            link,
            reservacion: crearReservacion(),
        }));
        const estadoDiferente = await obtenerPreview(crearDbFake({
            link,
            reservacion: crearReservacion({ estado: 'Cancelada' }),
        }));
        const timestampDiferente = await obtenerPreview(crearDbFake({
            link,
            reservacion: crearReservacion({ ultima_actualizacion: new Date('2027-03-01T14:00:00.000Z') }),
        }));
        const sinLink = await obtenerPreview(crearDbFake());

        expect(mismo.cancellation_fingerprint).toBe(original.cancellation_fingerprint);
        expect(latestDiferente.cancellation_fingerprint).not.toBe(original.cancellation_fingerprint);
        expect(estadoDiferente.cancellation_fingerprint).not.toBe(original.cancellation_fingerprint);
        expect(timestampDiferente.cancellation_fingerprint).not.toBe(original.cancellation_fingerprint);
        expect(sinLink.cancellation_fingerprint).not.toBe(original.cancellation_fingerprint);
    });

    test('providers o event_type no soportados devuelven resultado controlado', async () => {
        await expect(obtenerDiffCancellationFareHarbor(130, crearDbFake({
            evento: crearEvento({ provider: 'getyourguide' }),
        }))).resolves.toHaveProperty('tipo', 'provider_no_soportado');

        await expect(obtenerDiffCancellationFareHarbor(130, crearDbFake({
            evento: crearEvento({ event_type: 'modification' }),
        }))).resolves.toHaveProperty('tipo', 'event_type_no_soportado');
    });
});
