jest.mock('../services/reservaciones.service', () => ({
    crearReservacionConDb: jest.fn(),
}));

const reservacionesService = require('../services/reservaciones.service');
const {
    aplicarNuevaReservaFareHarbor,
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

function crearDbPoolAplicacion({
    evento = crearEventoFareHarbor(),
    eventosBooking = null,
    linkExistente = null,
    equivalencia = null,
    pais = { id_pais: 5, nombre: 'No especificado' },
    plataforma = { id_plataforma: 1, nombre: 'FareHarbor' },
    tour = { id_tour: 70, nombre: 'Kayak Tour' },
    tourActivo = true,
    fallaInsertLink = null,
    marcarAplicadoDevuelveFila = true,
} = {}) {
    const client = {
        queries: [],
        query: jest.fn(async (query, values = []) => {
            const sql = String(query);
            client.queries.push(sql);

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: evento ? [evento] : [] };
            }

            if (/FROM eventos_integracion[\s\S]+WHERE provider = \$1[\s\S]+external_booking_id = \$2[\s\S]+FOR UPDATE/i.test(sql)) {
                return { rows: eventosBooking || (evento ? [evento] : []) };
            }

            if (/FROM reservas_integracion_link[\s\S]+WHERE provider = \$1/i.test(sql)) {
                return { rows: linkExistente ? [linkExistente] : [] };
            }

            if (/FROM paises[\s\S]+WHERE nombre = \$1/i.test(sql)) {
                return { rows: pais && values[0] === 'No especificado' ? [pais] : [] };
            }

            if (/FROM plataformas[\s\S]+WHERE nombre = \$1/i.test(sql)) {
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

            if (/FROM tours[\s\S]+activo = TRUE/i.test(sql)) {
                return { rows: tourActivo && tour && Number(values[0]) === Number(tour.id_tour) ? [tour] : [] };
            }

            if (/FROM tours/i.test(sql)) {
                return { rows: tour && Number(values[0]) === Number(tour.id_tour) ? [tour] : [] };
            }

            if (/INSERT INTO reservas_integracion_link/i.test(sql)) {
                if (fallaInsertLink) {
                    throw fallaInsertLink;
                }

                return {
                    rows: [{
                        id_reserva_integracion_link: 77,
                        provider: values[0],
                        external_booking_id: values[1],
                        id_reservacion: values[2],
                    }],
                };
            }

            if (/UPDATE eventos_integracion[\s\S]+application_status/i.test(sql)) {
                return {
                    rows: marcarAplicadoDevuelveFila
                        ? [{
                            id_evento_integracion: values[2],
                            review_status: 'approved',
                            application_status: 'applied',
                            applied_by: values[1],
                        }]
                        : [],
                };
            }

            throw new Error(`Query no soportado en apply FH: ${sql}`);
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

function crearEventoFareHarborAplicable(overrides = {}) {
    return crearEventoFareHarbor({
        review_status: 'approved',
        application_status: 'not_applied',
        ...overrides,
    });
}

describe('fareharborApplication.service FH-3B1 apply', () => {
    beforeEach(() => {
        reservacionesService.crearReservacionConDb.mockResolvedValue({
            id_reservacion: 45,
            codigo: 'RSV-20270101-FH123',
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('apply exitoso sin equivalencia usa completar manual, crea reserva link y marca applied', async () => {
        const evento = crearEventoFareHarborAplicable({
            normalized_data: {
                pickup: { pickup: null },
            },
        });
        const { pool, client } = crearDbPoolAplicacion({ evento, equivalencia: null });

        const resultado = await aplicarNuevaReservaFareHarbor(10, 9, {
            id_tour: 70,
            turno: 'Mañana',
            pickup_place: 'Lobby manual',
            pickup_time: '08:00',
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            client,
            expect.objectContaining({
                fecha: '2027-03-15',
                id_tour: 70,
                id_pais: 5,
                id_plataforma: 1,
                nombre_cliente: 'Persona Sintetica',
                pax: 3,
                ninos: 1,
                pickup_place: 'Lobby manual',
                pickup_time: '08:00',
                turno: 'Mañana',
                precio_total: 3760,
                deposito: 1000,
                saldo: 2760,
                tipo_cambio: null,
                metodo_pago: null,
                estado: 'Pendiente',
            }),
            9
        );
        expect(client.queries.some((query) => /INSERT INTO reservas_integracion_link/i.test(query))).toBe(true);
        expect(client.queries.some((query) => /UPDATE eventos_integracion[\s\S]+application_status/i.test(query))).toBe(true);
        expect(client.queries).toContain('COMMIT');
    });

    test('apply exitoso con equivalencia exacta usa tour y turno derivados y rechaza override', async () => {
        const evento = crearEventoFareHarborAplicable();
        const { pool } = crearDbPoolAplicacion({
            evento,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        });

        const ok = await aplicarNuevaReservaFareHarbor(10, 9, {}, pool);
        expect(ok.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ id_tour: 70, turno: 'Mañana' }),
            9
        );

        const contradiccion = await aplicarNuevaReservaFareHarbor(10, 9, { id_tour: 71 }, crearDbPoolAplicacion({
            evento,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(contradiccion.tipo).toBe('override_prohibido');
    });

    test('categoria desconocida exige ninos manual y valida rango', async () => {
        const evento = crearEventoFareHarborAplicable({
            normalized_data: {
                customers: {
                    total: 2,
                    by_category: [{ customer_type_pk: 9, singular: 'Youth', plural: 'Youth', count: 2 }],
                },
            },
        });

        const faltante = await aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(faltante.tipo).toBe('faltan_datos');
        expect(faltante.missingFields).toContain('ninos');

        const invalido = await aplicarNuevaReservaFareHarbor(10, 9, { ninos: 3 }, crearDbPoolAplicacion({
            evento,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(invalido.tipo).toBe('datos_invalidos');

        const manual = await aplicarNuevaReservaFareHarbor(10, 9, { ninos: 2 }, crearDbPoolAplicacion({
            evento,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(manual.tipo).toBe('aplicado');
    });

    test('pickup derivado no usa availability.start_at y pickup manual completa faltantes', async () => {
        const conPickup = await aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(conPickup.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenLastCalledWith(
            expect.any(Object),
            expect.objectContaining({ pickup_time: '08:30' }),
            9
        );

        const sinPickup = crearEventoFareHarborAplicable({ normalized_data: { pickup: { pickup: null } } });
        const faltante = await aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: sinPickup,
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);
        expect(faltante.tipo).toBe('faltan_datos');
        expect(faltante.missingFields).toEqual(expect.arrayContaining(['pickup_place', 'pickup_time']));
    });

    test('dinero bloquea moneda no MXN, paid mayor que total y overflow', async () => {
        const casos = [
            [{ money: { currency: 'usd' } }, 'moneda_no_soportada'],
            [{ money: { receipt_total: '100000', amount_paid: '100001', currency: 'mxn' } }, 'dinero_inconsistente'],
            [{ money: { receipt_total: '10000000000', amount_paid: '0', currency: 'mxn' } }, 'dinero_overflow'],
        ];

        for (const [normalizedOverride, tipo] of casos) {
            const resultado = await aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
                evento: crearEventoFareHarborAplicable({ normalized_data: normalizedOverride }),
                equivalencia: { id_tour: 70, turno: 'Mañana' },
            }).pool);

            expect(resultado.tipo).toBe(tipo);
            expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
            reservacionesService.crearReservacionConDb.mockClear();
        }
    });

    test('rechaza fecha pax dinero y otros campos derivados enviados por frontend', async () => {
        const resultado = await aplicarNuevaReservaFareHarbor(10, 9, {
            fecha: '2027-03-15',
            pax: 4,
            precio_total: 1,
        }, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        }).pool);

        expect(resultado.tipo).toBe('completar_invalido');
        expect(resultado.errores).toEqual(expect.arrayContaining([
            'El campo completar.fecha no esta permitido para FareHarbor',
            'El campo completar.pax no esta permitido para FareHarbor',
            'El campo completar.precio_total no esta permitido para FareHarbor',
        ]));
        expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
    });

    test('bloquea pending, already applied, link existente y snapshot viejo', async () => {
        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarbor({ review_status: 'pending_review', application_status: 'not_applied' }),
        }).pool)).resolves.toMatchObject({ tipo: 'no_aprobado' });

        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable({ application_status: 'applied' }),
        }).pool)).resolves.toMatchObject({ tipo: 'ya_aplicado' });

        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            linkExistente: { id_reserva_integracion_link: 1, provider: 'fareharbor', external_booking_id: 'fh-booking-preview', id_reservacion: 45 },
        }).pool)).resolves.toMatchObject({ tipo: 'ya_vinculado' });

        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable({ id_evento_integracion: 10 }),
            eventosBooking: [
                crearEventoFareHarborAplicable({ id_evento_integracion: 11, source_received_at: new Date('2027-03-15T12:00:00Z') }),
                crearEventoFareHarborAplicable({ id_evento_integracion: 10, source_received_at: new Date('2027-03-15T11:00:00Z') }),
            ],
        }).pool)).resolves.toMatchObject({ tipo: 'snapshot_obsoleto' });
    });

    test('rollback si falla crearReservacionConDb o su bitacora interna', async () => {
        const fallo = new Error('fallo bitacora sintetico');
        reservacionesService.crearReservacionConDb.mockRejectedValueOnce(fallo);
        const db = crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            equivalencia: { id_tour: 70, turno: 'Mañana' },
        });

        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, db.pool)).rejects.toThrow('fallo bitacora sintetico');
        expect(db.client.queries).toContain('ROLLBACK');
        expect(db.client.queries.some((query) => /INSERT INTO reservas_integracion_link/i.test(query))).toBe(false);
        expect(db.client.queries.some((query) => /UPDATE eventos_integracion[\s\S]+application_status/i.test(query))).toBe(false);
    });
    test('rollback si falla link o marcar applied', async () => {
        const unique = new Error('duplicate link');
        unique.code = '23505';
        unique.constraint = 'uq_reservas_integracion_link_provider_booking';
        const falloLink = crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            equivalencia: { id_tour: 70, turno: 'Mañana' },
            fallaInsertLink: unique,
        });

        const link = await aplicarNuevaReservaFareHarbor(10, 9, {}, falloLink.pool);
        expect(link.tipo).toBe('ya_vinculado');
        expect(falloLink.client.queries).toContain('ROLLBACK');

        const falloApplied = crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable(),
            equivalencia: { id_tour: 70, turno: 'Mañana' },
            marcarAplicadoDevuelveFila: false,
        });
        const applied = await aplicarNuevaReservaFareHarbor(10, 9, {}, falloApplied.pool);
        expect(applied.tipo).toBe('ya_aplicado');
        expect(falloApplied.client.queries).toContain('ROLLBACK');
    });

    test('modification y cancellation FareHarbor siguen bloqueados por service', async () => {
        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable({ event_type: 'modification' }),
        }).pool)).resolves.toMatchObject({ tipo: 'event_type_no_soportado' });

        await expect(aplicarNuevaReservaFareHarbor(10, 9, {}, crearDbPoolAplicacion({
            evento: crearEventoFareHarborAplicable({ event_type: 'cancellation' }),
        }).pool)).resolves.toMatchObject({ tipo: 'event_type_no_soportado' });
    });
});