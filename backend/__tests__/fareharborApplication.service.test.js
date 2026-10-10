const {
    calcularNinos,
    construirPreviewNuevaReservaFareHarborConDb,
    convertirDinero,
    extraerFechaActividad,
} = require('../integrations/fareharbor/fareharborApplication.service');

function mergeDeep(base, overrides) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return overrides === undefined ? base : overrides;
    }

    return Object.keys(overrides).reduce((resultado, key) => {
        const value = overrides[key];

        if (
            value
            && typeof value === 'object'
            && !Array.isArray(value)
            && base[key]
            && typeof base[key] === 'object'
            && !Array.isArray(base[key])
        ) {
            resultado[key] = mergeDeep(base[key], value);
        } else {
            resultado[key] = value;
        }

        return resultado;
    }, { ...base });
}

function crearEventoFareHarbor(overrides = {}) {
    const base = {
        id_evento_integracion: 10,
        provider: 'fareharbor',
        external_booking_id: 'fh-booking-preview',
        event_type: 'new_booking',
        normalized_data: {
            booking: {
                status: 'booked',
            },
            availability: {
                start_at: '2027-03-15T06:00:00-0500',
                end_at: '2027-03-15T11:00:00-0500',
                item: {
                    pk: 636130,
                    name: 'Kayak',
                    headline: 'Ages 12+ - Kayak Adventure',
                },
            },
            customers: {
                total: 3,
                by_category: [
                    { customer_type_pk: 1, singular: 'Adult', plural: 'Adults', count: 2 },
                    { customer_type_pk: 2, singular: 'Child', plural: 'Children', count: 1 },
                ],
            },
            contact: {
                name: 'Persona Sintetica',
                normalized_phone: '+520000000000',
            },
            pickup: {
                pickup: {
                    display_text: 'Lobby sintetico',
                    name: 'Hotel sintetico',
                    time: '08:30',
                },
                lodging: null,
                arrival: null,
            },
            money: {
                receipt_total: '376000',
                amount_paid: '100000',
                invoice_price_display: '$3,760.00 MXN',
                receipt_total_display: '$3,760.00 MXN',
                amount_paid_display: '$1,000.00 MXN',
                currency: 'mxn',
            },
        },
    };

    return mergeDeep(base, overrides);
}

function crearDbPreview({
    equivalencia = null,
    pais = { id_pais: 5, nombre: 'No especificado' },
    plataforma = { id_plataforma: 1, nombre: 'FareHarbor' },
    tour = { id_tour: 70, nombre: 'Kayak Tour' },
} = {}) {
    return {
        queries: [],
        query: jest.fn(async (query, values) => {
            const sql = String(query);

            if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql)) {
                throw new Error(`Escritura inesperada en preview: ${sql}`);
            }

            if (/FROM paises/i.test(sql)) {
                return { rows: pais && values[0] === 'No especificado' ? [pais] : [] };
            }

            if (/FROM plataformas/i.test(sql)) {
                return { rows: plataforma && values[0] === 'FareHarbor' ? [plataforma] : [] };
            }

            if (/FROM equivalencias_tours_externos/i.test(sql)) {
                if (!equivalencia) {
                    return { rows: [] };
                }

                return {
                    rows: [{
                        id_equivalencia_tour_externo: equivalencia.id_equivalencia_tour_externo || 33,
                        provider: 'fareharbor',
                        id_tour: equivalencia.id_tour,
                        turno: equivalencia.turno,
                    }],
                };
            }

            if (/FROM tours/i.test(sql)) {
                return { rows: tour && Number(values[0]) === Number(tour.id_tour) ? [tour] : [] };
            }

            throw new Error(`Query no soportado: ${sql}`);
        }),
    };
}

describe('fareharborApplication.service FH-3A preview', () => {
    test('deriva activity_title, option_title e item_pk desde textos reales FareHarbor', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor());

        expect(resultado.external).toEqual(expect.objectContaining({
            activity_title: 'Kayak',
            option_title: 'Ages 12+ - Kayak Adventure',
            item_pk: 636130,
        }));
        expect(resultado.external.option_title).not.toBe('default');
        expect(resultado.external.activity_title).not.toMatch(/^item_pk:/);
    });

    test('si no hay headline option_title queda null y no inventa default', async () => {
        const evento = crearEventoFareHarbor({
            normalized_data: {
                availability: {
                    headline: null,
                    item: { headline: null },
                },
            },
        });
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), evento);

        expect(resultado.external.option_title).toBeNull();
        expect(resultado.sources.tour.source).toBe('manual');
        expect(resultado.missing_fields).toEqual(expect.arrayContaining(['id_tour', 'turno']));
    });

    test('equivalencia FareHarbor exacta deriva id_tour y turno', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview({
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }), crearEventoFareHarbor());

        expect(resultado.sources.tour).toEqual(expect.objectContaining({
            source: 'equivalence',
            id_tour: 70,
            nombre_tour: 'Kayak Tour',
            turno: 'Mañana',
        }));
        expect(resultado.missing_fields).not.toContain('id_tour');
        expect(resultado.missing_fields).not.toContain('turno');
    });

    test('sin equivalencia exacta no hace fuzzy ni asigna Kayak Tour', async () => {
        const db = crearDbPreview({ equivalencia: null });
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(db, crearEventoFareHarbor());

        expect(resultado.sources.tour.source).toBe('manual');
        expect(resultado.reservation_candidate.id_tour).toBeNull();
        expect(resultado.reservation_candidate.turno).toBeNull();
        expect(resultado.missing_fields).toEqual(expect.arrayContaining(['id_tour', 'turno']));
        expect(db.query.mock.calls.some(([query]) => /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(query))).toBe(false);
    });

    test('extrae fecha YYYY-MM-DD sin desplazar timezone', () => {
        expect(extraerFechaActividad('2026-10-11T06:00:00-0500')).toBe('2026-10-11');
    });

    test('pax se deriva de customers.total y conserva categorias seguras', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor());

        expect(resultado.reservation_candidate.pax).toBe(3);
        expect(resultado.external.categories).toEqual([
            { customer_type_pk: 1, singular: 'Adult', plural: 'Adults', count: 2 },
            { customer_type_pk: 2, singular: 'Child', plural: 'Children', count: 1 },
        ]);
    });

    test('reglas Adult y Child derivan ninos de forma estructurada', () => {
        expect(calcularNinos([{ singular: 'Adult', plural: 'Adults', count: 2 }], 2)).toEqual(expect.objectContaining({
            ninos: 0,
            children_source: 'derived',
        }));
        expect(calcularNinos([
            { singular: 'Adult', plural: 'Adults', count: 2 },
            { singular: 'Child', plural: 'Children', count: 1 },
        ], 3)).toEqual(expect.objectContaining({
            ninos: 1,
            children_source: 'derived',
        }));
        expect(calcularNinos([{ singular: 'Child', plural: 'Children', count: 2 }], 2)).toEqual(expect.objectContaining({
            ninos: 2,
            children_source: 'derived',
        }));
    });

    test('categoria desconocida deja ninos manual y missing_fields', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor({
            normalized_data: {
                customers: {
                    total: 1,
                    by_category: [{ customer_type_pk: 9, singular: 'Youth', plural: 'Youth', count: 1 }],
                },
            },
        }));

        expect(resultado.reservation_candidate.ninos).toBeNull();
        expect(resultado.sources.children.source).toBe('manual');
        expect(resultado.missing_fields).toContain('ninos');
    });

    test('contacto deriva nombre y telefono opcional', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor());

        expect(resultado.reservation_candidate.nombre_cliente).toBe('Persona Sintetica');
        expect(resultado.reservation_candidate.telefono_cliente).toBe('+520000000000');
        expect(resultado.missing_fields).not.toContain('nombre_cliente');
    });

    test('nombre ausente queda manual y telefono no es obligatorio', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor({
            normalized_data: {
                contact: { name: ' ', normalized_phone: null },
            },
        }));

        expect(resultado.reservation_candidate.nombre_cliente).toBeNull();
        expect(resultado.reservation_candidate.telefono_cliente).toBeNull();
        expect(resultado.missing_fields).toContain('nombre_cliente');
        expect(resultado.missing_fields).not.toContain('telefono_cliente');
    });

    test('resuelve pais No especificado y plataforma FareHarbor por nombre', async () => {
        const resultado = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor());

        expect(resultado.reservation_candidate.id_pais).toBe(5);
        expect(resultado.reservation_candidate.pais).toBe('No especificado');
        expect(resultado.reservation_candidate.id_plataforma).toBe(1);
        expect(resultado.reservation_candidate.plataforma).toBe('FareHarbor');
    });

    test('pickup usa display_text, name fallback y time valido sin usar availability.start_at', async () => {
        const conDisplay = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor());
        const conName = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor({
            normalized_data: {
                pickup: { pickup: { display_text: null, name: 'Hotel fallback', time: '09:15:00' } },
            },
        }));
        const sinPickup = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview(), crearEventoFareHarbor({
            normalized_data: { pickup: { pickup: null } },
        }));

        expect(conDisplay.reservation_candidate.pickup_place).toBe('Lobby sintetico');
        expect(conDisplay.reservation_candidate.pickup_time).toBe('08:30');
        expect(conName.reservation_candidate.pickup_place).toBe('Hotel fallback');
        expect(conName.reservation_candidate.pickup_time).toBe('09:15:00');
        expect(sinPickup.reservation_candidate.pickup_time).toBeNull();
        expect(sinPickup.missing_fields).toEqual(expect.arrayContaining(['pickup_place', 'pickup_time']));
    });

    test('dinero MXN convierte unidad minima con decimal seguro', () => {
        expect(convertirDinero({
            money: { receipt_total: '376000', amount_paid: '100000', currency: 'mxn' },
        })).toEqual(expect.objectContaining({
            precio_total: '3760.00',
            deposito: '1000.00',
            saldo: '2760.00',
            money_ready: true,
        }));
        expect(convertirDinero({
            money: { receipt_total: '376000', amount_paid: '376000', currency: 'mxn' },
        })).toEqual(expect.objectContaining({
            saldo: '0.00',
            money_ready: true,
        }));
    });

    test('dinero bloquea paid mayor que total, moneda no MXN y valores fuera de NUMERIC', () => {
        expect(convertirDinero({
            money: { receipt_total: '100000', amount_paid: '100001', currency: 'mxn' },
        })).toEqual(expect.objectContaining({
            money_ready: false,
            money_issue: 'El importe pagado supera el total de la reserva.',
        }));
        expect(convertirDinero({
            money: { receipt_total: '100000', amount_paid: '100000', currency: 'usd' },
        })).toEqual(expect.objectContaining({
            money_ready: false,
            money_issue: 'Moneda FareHarbor no soportada todavía para aplicación.',
        }));
        expect(convertirDinero({
            money: { receipt_total: '10000000000', amount_paid: '0', currency: 'mxn' },
        })).toEqual(expect.objectContaining({
            money_ready: false,
            money_issue: 'Importes FareHarbor exceden la capacidad NUMERIC(10,2).',
        }));
    });

    test('ready_to_apply depende de campos faltantes y money_ready', async () => {
        const manual = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview({ equivalencia: null }), crearEventoFareHarbor());
        const completo = await construirPreviewNuevaReservaFareHarborConDb(crearDbPreview({
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }), crearEventoFareHarbor());

        expect(manual.ready_to_apply).toBe(false);
        expect(manual.missing_fields).toEqual(expect.arrayContaining(['id_tour', 'turno']));
        expect(completo.money_ready).toBe(true);
        expect(completo.ready_to_apply).toBe(true);
    });

    test('preview solo ejecuta SELECT y no INSERT UPDATE DELETE', async () => {
        const db = crearDbPreview({ equivalencia: { id_tour: 70, turno: 'Mañana' } });

        await construirPreviewNuevaReservaFareHarborConDb(db, crearEventoFareHarbor());

        const consultas = db.query.mock.calls.map(([query]) => String(query));
        expect(consultas.length).toBeGreaterThan(0);
        expect(consultas.every((query) => /^\s*SELECT\b/i.test(query))).toBe(true);
    });
});
