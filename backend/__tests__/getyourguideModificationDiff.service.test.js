const {
    obtenerDiffModificationGetYourGuide,
} = require('../integrations/getyourguide/getyourguideModificationDiff.service');

const crearEvento = (sobrescrituras = {}) => ({
    id_evento_integracion: 1,
    provider: 'getyourguide',
    external_event_id: 'gmail-message-modification-001',
    external_booking_id: 'GYGMOD001',
    event_type: 'modification',
    review_status: 'pending_review',
    application_status: 'not_applied',
    normalized_data: {
        date: '2026-10-09',
        pax: 3,
        pickup_place: 'Lobby Nuevo',
        tour_language: 'Inglés (Guía)',
        activity_title: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
        option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
    },
    source_received_at: new Date('2026-10-07T10:00:00Z'),
    ...sobrescrituras,
});

const crearReservacion = (sobrescrituras = {}) => ({
    id_reservacion: 45,
    fecha: new Date('2026-10-08T00:00:00Z'),
    pax: 2,
    pickup_place: 'Lobby Actual',
    id_tour: 10,
    turno: 'Mañana',
    idioma: 'Español',
    estado: 'Pendiente',
    id_transporte_operacion: null,
    ...sobrescrituras,
});

function crearDbFake({
    evento = crearEvento(),
    reservacion = crearReservacion(),
    link = { provider: 'getyourguide', external_booking_id: 'GYGMOD001', id_reservacion: 45 },
    equivalencia = { id_equivalencia_tour_externo: 1, provider: 'getyourguide', id_tour: 74, turno: 'Tarde' },
    eventos = [],
} = {}) {
    const filasEventos = [evento, ...eventos].filter(Boolean);
    const db = {
        query: jest.fn(async (query, values) => {
            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+LIMIT 1/i.test(query)) {
                return {
                    rows: filasEventos.filter((fila) => Number(fila.id_evento_integracion) === Number(values[0])).slice(0, 1),
                };
            }

            if (/FROM reservas_integracion_link/i.test(query)) {
                if (
                    link &&
                    link.provider === values[0] &&
                    link.external_booking_id === values[1]
                ) {
                    return { rows: [link] };
                }

                return { rows: [] };
            }

            if (/FROM reservaciones/i.test(query)) {
                if (reservacion && Number(reservacion.id_reservacion) === Number(values[0])) {
                    return { rows: [reservacion] };
                }

                return { rows: [] };
            }

            if (/FROM equivalencias_tours_externos/i.test(query)) {
                return { rows: equivalencia ? [equivalencia] : [] };
            }

            if (/event_type IN \('modification', 'cancellation'\)/i.test(query)) {
                const [provider, externalBookingId, idEvento, applicationStatus, sourceReceivedAt] = values;
                const rows = filasEventos.filter((fila) => (
                    fila.provider === provider &&
                    fila.external_booking_id === externalBookingId &&
                    Number(fila.id_evento_integracion) !== Number(idEvento) &&
                    ['modification', 'cancellation'].includes(fila.event_type) &&
                    fila.application_status === applicationStatus &&
                    fila.source_received_at > sourceReceivedAt
                ));

                return { rows: rows.slice(0, 1) };
            }

            throw new Error(`Query no soportado en prueba: ${query}`);
        }),
    };

    return db;
}

describe('getyourguideModificationDiff.service', () => {
    test('calcula diff seguro con fecha, pax, pickup, idioma y tour/turno por equivalencia', async () => {
        const db = crearDbFake();

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.tipo).toBe('preview');
        expect(resultado.preview).toEqual(expect.objectContaining({
            id_evento_integracion: 1,
            id_reservacion: 45,
            aplicable: true,
            reason: null,
            diff_has_changes: true,
            requiere_validacion_operativa: false,
            warnings: [],
        }));
        expect(resultado.preview.diff).toEqual({
            fecha: { actual: '2026-10-08', nuevo: '2026-10-09', cambio: true },
            pax: { actual: 2, nuevo: 3, cambio: true },
            pickup_place: { actual: 'Lobby Actual', nuevo: 'Lobby Nuevo', cambio: true },
            id_tour: { actual: 10, nuevo: 74, cambio: true },
            turno: { actual: 'Mañana', nuevo: 'Tarde', cambio: true },
            idioma: { actual: 'Español', nuevo: 'Inglés (Guía)', cambio: true },
        });
        expect(db.query.mock.calls.some(([query]) => /^\s*(INSERT|UPDATE|DELETE)/i.test(query))).toBe(false);
    });

    test('valores iguales producen diff_has_changes false', async () => {
        const reservacion = crearReservacion({
            fecha: new Date('2026-10-09T00:00:00Z'),
            pax: 3,
            pickup_place: 'Lobby Nuevo',
            id_tour: 74,
            turno: 'Tarde',
            idioma: 'Inglés (Guía)',
        });
        const db = crearDbFake({ reservacion });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.diff_has_changes).toBe(false);
        expect(Object.values(resultado.preview.diff).every((campo) => campo.cambio === false)).toBe(true);
    });

    test('sin link no busca por datos alternativos y marca no aplicable', async () => {
        const db = crearDbFake({ link: null });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.aplicable).toBe(false);
        expect(resultado.preview.reason).toBe('sin_reservacion_vinculada');
        expect(resultado.preview.id_reservacion).toBeNull();
        expect(resultado.preview.diff).toEqual({});
    });

    test.each([
        ['Cancelada', 'reservacion_cancelada'],
        ['Completada', 'reservacion_completada'],
    ])('reservacion %s bloquea el preview aplicable', async (estado, reason) => {
        const db = crearDbFake({ reservacion: crearReservacion({ estado }) });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.aplicable).toBe(false);
        expect(resultado.preview.reason).toBe(reason);
    });

    test('equivalencia inexistente bloquea y no crea mapping', async () => {
        const db = crearDbFake({ equivalencia: null });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.aplicable).toBe(false);
        expect(resultado.preview.reason).toBe('equivalencia_tour_no_encontrada');
        expect(resultado.preview.warnings).toContain('equivalencia_tour_no_encontrada');
        expect(db.query.mock.calls.some(([query]) => /INSERT INTO equivalencias_tours_externos/i.test(query))).toBe(false);
    });

    test('evento mas nuevo ya aplicado bloquea evento viejo', async () => {
        const db = crearDbFake({
            eventos: [
                crearEvento({
                    id_evento_integracion: 2,
                    external_event_id: 'gmail-message-modification-002',
                    application_status: 'applied',
                    source_received_at: new Date('2026-10-08T10:00:00Z'),
                }),
            ],
        });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.aplicable).toBe(false);
        expect(resultado.preview.reason).toBe('evento_mas_nuevo_ya_aplicado');
    });

    test('transporte asignado y cambio fecha tour o turno requiere validacion operativa', async () => {
        const db = crearDbFake({
            reservacion: crearReservacion({ id_transporte_operacion: 77 }),
        });

        const resultado = await obtenerDiffModificationGetYourGuide(1, db);

        expect(resultado.preview.requiere_validacion_operativa).toBe(true);
    });

    test('otros providers o event_type no soportados devuelven resultado controlado', async () => {
        await expect(obtenerDiffModificationGetYourGuide(1, crearDbFake({
            evento: crearEvento({ provider: 'fareharbor' }),
        }))).resolves.toHaveProperty('tipo', 'provider_no_soportado');

        await expect(obtenerDiffModificationGetYourGuide(1, crearDbFake({
            evento: crearEvento({ event_type: 'new_booking' }),
        }))).resolves.toHaveProperty('tipo', 'event_type_no_soportado');
    });
});
