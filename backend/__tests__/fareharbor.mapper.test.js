const {
    FareHarborPayloadInvalidoError,
    crearPayloadFingerprint,
    normalizarBooking,
    normalizarPayloadWebhookFareHarbor
} = require('../integrations/fareharbor/fareharbor.mapper');
const {
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

const crearCustomer = ({ pk, singular, plural }) => ({
    customer_type_rate: {
        customer_type: {
            pk,
            singular,
            plural
        }
    },
    name: 'No debe persistirse',
    email: 'cliente@example.test'
});

describe('fareharbor.mapper', () => {
    test('normaliza un booking de FareHarbor a snapshot minimo', () => {
        const payload = crearPayloadWebhookFareHarborSanitizado();
        const normalizado = normalizarPayloadWebhookFareHarbor(payload);

        expect(normalizado).toEqual({
            provider: 'fareharbor',
            external_booking_id: payload.booking.uuid,
            booking_key: payload.booking.uuid,
            status: 'booked',
            payload_fingerprint: expect.any(String),
            external_event_id: expect.stringMatching(/^fh:11111111-2222-4333-8444-555555555555:[a-f0-9]{64}$/),
            normalized_data: {
                schema_version: 1,
                external_booking_id: payload.booking.uuid,
                booking: {
                    uuid: payload.booking.uuid,
                    pk: 10001,
                    display_id: 'FH-TEST-001',
                    status: 'booked',
                    created_at: '2026-10-10T09:00:00-0500'
                },
                availability: {
                    pk: 70001,
                    start_at: '2026-10-12T08:00:00-0500',
                    end_at: '2026-10-12T12:00:00-0500',
                    item: {
                        pk: 77,
                        name: 'Tour Sian Kaan',
                        headline: 'Tour corto'
                    }
                },
                customers: {
                    total: 2,
                    by_category: [
                        {
                            customer_type_pk: 1,
                            singular: 'Adult',
                            plural: 'Adults',
                            count: 2
                        }
                    ]
                },
                contact: {
                    name: 'Cliente Demo',
                    normalized_phone: '+520000000000'
                },
                pickup: {
                    pickup: null,
                    lodging: null,
                    arrival: null
                },
                money: {
                    invoice_price: '100.00',
                    receipt_total: '100.00',
                    amount_paid: '100.00',
                    currency: 'mxn'
                },
                fingerprint: expect.any(String)
            }
        });
        expect(normalizado.payload_fingerprint).toBe(normalizado.normalized_data.fingerprint);
    });

    test('booking.uuid es requerido', () => {
        expect(() => normalizarPayloadWebhookFareHarbor({
            booking: {
                uuid: '   '
            }
        })).toThrow(FareHarborPayloadInvalidoError);
    });

    test('normaliza strings con trim de forma determinista', () => {
        const snapshot = normalizarBooking({
            uuid: ' 11111111-2222-4333-8444-555555555555 ',
            status: ' booked ',
            contact: {
                name: ' Cliente Demo ',
                normalized_phone: ' +520000000000 '
            }
        });

        expect(snapshot.external_booking_id).toBe('11111111-2222-4333-8444-555555555555');
        expect(snapshot.booking.status).toBe('booked');
        expect(snapshot.contact.name).toBe('Cliente Demo');
        expect(snapshot.contact.normalized_phone).toBe('+520000000000');
    });

    test('conserva customer_count sin interpretar ninos', () => {
        const snapshot = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customer_count: 3
        });

        expect(snapshot.customers.total).toBe(3);
    });

    test('agrupa categoria Adult', () => {
        const snapshot = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customers: [
                crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' }),
                crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' })
            ]
        });

        expect(snapshot.customers.by_category).toEqual([
            {
                customer_type_pk: 1,
                singular: 'Adult',
                plural: 'Adults',
                count: 2
            }
        ]);
    });

    test('agrupa categorias Adult y Child con fixture sintetico', () => {
        const snapshot = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customers: [
                crearCustomer({ pk: 2, singular: 'Child', plural: 'Children' }),
                crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' }),
                crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' })
            ]
        });

        expect(snapshot.customers.by_category).toEqual([
            {
                customer_type_pk: 1,
                singular: 'Adult',
                plural: 'Adults',
                count: 2
            },
            {
                customer_type_pk: 2,
                singular: 'Child',
                plural: 'Children',
                count: 1
            }
        ]);
    });

    test('cambiar orden de customers produce mismo snapshot y fingerprint', () => {
        const customers = [
            crearCustomer({ pk: 2, singular: 'Child', plural: 'Children' }),
            crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' }),
            crearCustomer({ pk: 1, singular: 'Adult', plural: 'Adults' })
        ];
        const snapshotA = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customers
        });
        const snapshotB = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customers: [...customers].reverse()
        });

        expect(snapshotA).toEqual(snapshotB);
        expect(crearPayloadFingerprint(snapshotA)).toBe(crearPayloadFingerprint(snapshotB));
    });

    test('cambiar pax produce fingerprint diferente', () => {
        const base = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customer_count: 2
        });
        const cambiado = normalizarBooking({
            uuid: '11111111-2222-4333-8444-555555555555',
            customer_count: 3
        });

        expect(crearPayloadFingerprint(base)).not.toBe(crearPayloadFingerprint(cambiado));
    });

    test('cambiar item produce fingerprint diferente', () => {
        const base = normalizarBooking(crearPayloadWebhookFareHarborSanitizado().booking);
        const cambiado = normalizarBooking(crearPayloadWebhookFareHarborSanitizado({
            availability: {
                pk: 70001,
                start_at: '2026-10-12T08:00:00-0500',
                end_at: '2026-10-12T12:00:00-0500',
                item: {
                    pk: 88,
                    name: 'Tour Alterno',
                    headline: 'Tour alterno'
                }
            }
        }).booking);

        expect(crearPayloadFingerprint(base)).not.toBe(crearPayloadFingerprint(cambiado));
    });

    test('cambiar fecha produce fingerprint diferente', () => {
        const base = normalizarBooking(crearPayloadWebhookFareHarborSanitizado().booking);
        const cambiado = normalizarBooking(crearPayloadWebhookFareHarborSanitizado({
            availability: {
                pk: 70001,
                start_at: '2026-10-13T08:00:00-0500',
                end_at: '2026-10-13T12:00:00-0500',
                item: {
                    pk: 77,
                    name: 'Tour Sian Kaan',
                    headline: 'Tour corto'
                }
            }
        }).booking);

        expect(crearPayloadFingerprint(base)).not.toBe(crearPayloadFingerprint(cambiado));
    });

    test('cambiar contact.name produce fingerprint diferente', () => {
        const base = normalizarBooking(crearPayloadWebhookFareHarborSanitizado().booking);
        const cambiado = normalizarBooking(crearPayloadWebhookFareHarborSanitizado({
            contact: {
                name: 'Cliente Cambiado',
                normalized_phone: '+520000000000',
                email: 'otro@example.test'
            }
        }).booking);

        expect(crearPayloadFingerprint(base)).not.toBe(crearPayloadFingerprint(cambiado));
    });

    test('cambiar note solamente no cambia fingerprint', () => {
        const base = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado());
        const cambiado = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado({
            note: 'Nota que no se persiste'
        }));

        expect(base.payload_fingerprint).toBe(cambiado.payload_fingerprint);
    });

    test('cambiar email solamente no cambia fingerprint', () => {
        const base = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado());
        const cambiado = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado({
            contact: {
                name: 'Cliente Demo',
                normalized_phone: '+520000000000',
                email: 'nuevo@example.test'
            }
        }));

        expect(base.payload_fingerprint).toBe(cambiado.payload_fingerprint);
    });

    test('payments irrelevantes no cambian fingerprint', () => {
        const base = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado());
        const cambiado = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado({
            payments: [
                {
                    pk: 1,
                    card_last_four: '4242',
                    token: 'tok_test'
                }
            ]
        }));

        expect(base.payload_fingerprint).toBe(cambiado.payload_fingerprint);
    });

    test('no aparecen email, note, payments ni raw en normalized_data', () => {
        const evento = normalizarPayloadWebhookFareHarbor(crearPayloadWebhookFareHarborSanitizado({
            contact: {
                name: 'Cliente Demo',
                normalized_phone: '+520000000000',
                email: 'cliente.demo@example.test'
            },
            note: 'Nota privada',
            note_safe_html: '<p>Nota privada</p>',
            payments: [
                {
                    token: 'tok_test'
                }
            ]
        }));
        const texto = JSON.stringify(evento.normalized_data);

        expect(texto).not.toContain('cliente.demo@example.test');
        expect(texto).not.toContain('Nota privada');
        expect(texto).not.toContain('tok_test');
        expect(evento.normalized_data).not.toHaveProperty('raw');
        expect(evento.normalized_data).not.toHaveProperty('payments');
    });
});
