const {
    obtenerDiffModificationFareHarbor,
} = require('../integrations/fareharbor/fareharborModificationDiff.service');
const { normalizarTextoEquivalenciaExterna } = require('../utils/normalizarTextoEquivalenciaExterna');

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

function crearNormalizedData(overrides = {}) {
    const base = {
        external_booking_id: 'fh-booking-mod',
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
        },
        money: {
            receipt_total: '376000',
            amount_paid: '100000',
            currency: 'mxn',
        },
    };

    return mergeDeep(base, overrides);
}

function crearEvento(overrides = {}) {
    return {
        id_evento_integracion: 20,
        provider: 'fareharbor',
        external_event_id: 'fh:booking:new',
        external_booking_id: 'fh-booking-mod',
        event_type: 'modification',
        review_status: 'pending_review',
        application_status: 'not_applied',
        normalized_data: crearNormalizedData(),
        source_received_at: new Date('2027-03-01T12:00:00Z'),
        created_at: new Date('2027-03-01T12:00:00Z'),
        ...overrides,
    };
}

function crearBaseline(overrides = {}) {
    return crearEvento({
        id_evento_integracion: 10,
        external_event_id: 'fh:booking:baseline',
        event_type: 'new_booking',
        application_status: 'applied',
        source_received_at: new Date('2027-02-28T12:00:00Z'),
        created_at: new Date('2027-02-28T12:00:00Z'),
        ...overrides,
    });
}

function crearReservacion(overrides = {}) {
    return {
        id_reservacion: 45,
        fecha: new Date('2027-03-15T00:00:00Z'),
        id_tour: 70,
        nombre_cliente: 'Persona Sintetica',
        telefono_cliente: '+520000000000',
        pax: 3,
        ninos: 1,
        pickup_place: 'Lobby sintetico',
        pickup_time: '08:30:00',
        turno: 'Mañana',
        precio_total: '3760.00',
        deposito: '1000.00',
        saldo: '2760.00',
        estado: 'Pendiente',
        id_transporte_operacion: null,
        ...overrides,
    };
}

function crearDbFake({
    evento = crearEvento(),
    baseline = crearBaseline(),
    reservacion = crearReservacion(),
    link = { provider: 'fareharbor', external_booking_id: 'fh-booking-mod', id_reservacion: 45 },
    equivalencias = {
        'Kayak|Ages 12+ - Kayak Adventure': { id_equivalencia_tour_externo: 1, provider: 'fareharbor', id_tour: 70, turno: 'Mañana' },
    },
    newerEvent = null,
} = {}) {
    const db = {
        query: jest.fn(async (query, values = []) => {
            const sql = String(query);

            if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql)) {
                throw new Error(`Escritura inesperada en diff FareHarbor: ${sql}`);
            }

            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+LIMIT 1/i.test(sql)) {
                return {
                    rows: evento && Number(evento.id_evento_integracion) === Number(values[0]) ? [evento] : [],
                };
            }

            if (/FROM eventos_integracion[\s\S]+application_status = \$4[\s\S]+ORDER BY/i.test(sql)) {
                return {
                    rows: baseline ? [baseline] : [],
                };
            }

            if (/FROM eventos_integracion[\s\S]+COALESCE\(\$3::timestamp/i.test(sql)) {
                return {
                    rows: newerEvent ? [{ id_evento_integracion: newerEvent.id_evento_integracion }] : [],
                };
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
                    rows: reservacion && Number(reservacion.id_reservacion) === Number(values[0]) ? [reservacion] : [],
                };
            }

            if (/FROM equivalencias_tours_externos/i.test(sql)) {
                const requestedKey = Object.keys(equivalencias).find((item) => (
                    item
                        .split('|')
                        .map((part) => normalizarTextoEquivalenciaExterna(part))
                        .join('|') === `${values[1]}|${values[2]}`
                ));
                const equivalencia = requestedKey ? equivalencias[requestedKey] : null;

                return { rows: equivalencia ? [equivalencia] : [] };
            }

            throw new Error(`Query no soportado en prueba: ${sql}`);
        }),
    };

    return db;
}

const obtenerDiff = async (db, opciones = {}) => {
    const resultado = await obtenerDiffModificationFareHarbor(20, db, opciones);

    expect(resultado.tipo).toBe('preview');
    return resultado.fareharbor_modification_diff;
};

describe('fareharborModificationDiff.service FH-MOD-02', () => {
    test('requiere link y baseline aplicado sin escribir datos', async () => {
        const sinLink = await obtenerDiff(crearDbFake({ link: null }));
        expect(sinLink.blocking_issues).toContain('sin_reservacion_vinculada');
        expect(sinLink.id_reservacion).toBeNull();

        const sinBaseline = await obtenerDiff(crearDbFake({ baseline: null }));
        expect(sinBaseline.baseline_status).toBe('missing');
        expect(sinBaseline.blocking_issues).toContain('baseline_aplicado_faltante');
        expect(sinBaseline.id_reservacion).toBe(45);
    });

    test('snapshot viejo queda no accionable con aviso controlado', async () => {
        const diff = await obtenerDiff(crearDbFake({
            newerEvent: crearEvento({ id_evento_integracion: 21 }),
        }));

        expect(diff.current_event.is_latest_snapshot).toBe(false);
        expect(diff.blocking_issues).toContain('Existe un snapshot FareHarbor más reciente para este booking.');
        expect(diff.actionable).toBe(false);
    });

    test('fecha externa cambiada limpia e interna divergida se distinguen', async () => {
        const clean = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    availability: { start_at: '2027-03-16T06:00:00-0500' },
                }),
            }),
        }));
        const fecha = clean.changes.find((change) => change.field === 'fecha');

        expect(fecha).toEqual(expect.objectContaining({
            baseline_external: '2027-03-15',
            internal_current: '2027-03-15',
            fareharbor_new: '2027-03-16',
            external_changed: true,
            internal_diverged_from_baseline: false,
            conflict: false,
        }));

        const divergido = await obtenerDiff(crearDbFake({
            reservacion: crearReservacion({ fecha: new Date('2027-03-14T00:00:00Z') }),
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    availability: { start_at: '2027-03-16T06:00:00-0500' },
                }),
            }),
        }));

        expect(divergido.changes.find((change) => change.field === 'fecha')).toEqual(expect.objectContaining({
            internal_diverged_from_baseline: true,
            conflict: true,
            proposed_action: 'manual',
        }));
    });

    test('tour y turno por equivalencia cambian; baseline manual queda conflicto', async () => {
        const diff = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    availability: {
                        item: {
                            name: 'Canales',
                            headline: 'Tour tarde',
                        },
                    },
                }),
            }),
            equivalencias: {
                'Kayak|Ages 12+ - Kayak Adventure': { id_equivalencia_tour_externo: 1, provider: 'fareharbor', id_tour: 70, turno: 'Mañana' },
                'Canales|Tour tarde': { id_equivalencia_tour_externo: 2, provider: 'fareharbor', id_tour: 71, turno: 'Tarde' },
            },
        }));

        expect(diff.changes.find((change) => change.field === 'id_tour')).toEqual(expect.objectContaining({
            baseline_external: 70,
            fareharbor_new: 71,
            source: 'equivalence',
        }));
        expect(diff.changes.find((change) => change.field === 'turno')).toEqual(expect.objectContaining({
            baseline_external: 'Mañana',
            fareharbor_new: 'Tarde',
        }));

        const manual = await obtenerDiff(crearDbFake({
            baseline: crearBaseline({
                normalized_data: crearNormalizedData({
                    availability: { item: { name: null, headline: null } },
                }),
            }),
            evento: crearEvento(),
        }));

        expect(manual.changes.find((change) => change.field === 'id_tour')).toEqual(expect.objectContaining({
            baseline_external: null,
            conflict: true,
            reason: 'baseline_tour_manual_or_unknown',
        }));
    });

    test('pax calcula delta y transporte asignado exige validacion operativa', async () => {
        const diff = await obtenerDiff(crearDbFake({
            reservacion: crearReservacion({ id_transporte_operacion: 77 }),
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    customers: { total: 5 },
                }),
            }),
        }));
        const pax = diff.changes.find((change) => change.field === 'pax');

        expect(pax).toEqual(expect.objectContaining({
            baseline_external: 3,
            fareharbor_new: 5,
            delta_pax: 2,
            requires_capacity_validation: true,
        }));
        expect(diff.reservation_context.assigned_to_transport).toBe(true);
        expect(diff.blocking_issues).toContain('La reservación tiene transporte asignado; los cambios operativos requieren revisión manual y validación de capacidad.');
    });

    test('ninos deriva Adult/Child y categoria desconocida queda manual', async () => {
        const diff = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    customers: {
                        total: 4,
                        by_category: [
                            { singular: 'Adult', plural: 'Adults', count: 2 },
                            { singular: 'Child', plural: 'Children', count: 2 },
                        ],
                    },
                }),
            }),
        }));

        expect(diff.changes.find((change) => change.field === 'ninos')).toEqual(expect.objectContaining({
            baseline_external: 1,
            fareharbor_new: 2,
            source: 'fareharbor_categories',
        }));

        const desconocida = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    customers: {
                        by_category: [{ singular: 'Youth', plural: 'Youth', count: 1 }],
                    },
                }),
            }),
        }));

        expect(desconocida.warnings).toContain('Categoría de pasajero FareHarbor no reconocida para calcular niños.');
        expect(desconocida.changes.find((change) => change.field === 'ninos')).toEqual(expect.objectContaining({
            conflict: true,
            proposed_action: 'manual',
            reason: 'unknown_customer_category',
        }));
    });

    test('pickup externo limpio y baseline ausente quedan diferenciados', async () => {
        const clean = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    pickup: { pickup: { display_text: 'Lobby nuevo', time: '09:00' } },
                }),
            }),
        }));

        expect(clean.changes.find((change) => change.field === 'pickup_place')).toEqual(expect.objectContaining({
            baseline_external: 'Lobby sintetico',
            internal_current: 'Lobby sintetico',
            fareharbor_new: 'Lobby nuevo',
            conflict: false,
        }));

        const manual = await obtenerDiff(crearDbFake({
            baseline: crearBaseline({
                normalized_data: crearNormalizedData({ pickup: { pickup: null } }),
            }),
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    pickup: { pickup: { display_text: 'Lobby nuevo', time: '09:00' } },
                }),
            }),
        }));

        expect(manual.changes.find((change) => change.field === 'pickup_place')).toEqual(expect.objectContaining({
            baseline_external: null,
            conflict: true,
            reason: 'baseline_pickup_manual_or_unknown',
        }));
    });

    test('contacto y dinero se muestran como cambios read-only con conflicto monetario interno', async () => {
        const diff = await obtenerDiff(crearDbFake({
            reservacion: crearReservacion({ precio_total: '3700.00' }),
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    contact: {
                        name: 'Persona Sintetica Nueva',
                        normalized_phone: '+529999999999',
                    },
                    money: {
                        receipt_total: '400000',
                        amount_paid: '150000',
                    },
                }),
            }),
        }));

        expect(diff.changes.find((change) => change.field === 'nombre_cliente')).toEqual(expect.objectContaining({
            fareharbor_new: 'Persona Sintetica Nueva',
        }));
        expect(diff.changes.find((change) => change.field === 'telefono_cliente')).toEqual(expect.objectContaining({
            fareharbor_new: '+529999999999',
        }));
        expect(diff.changes.find((change) => change.field === 'money_group')).toEqual(expect.objectContaining({
            internal_diverged_from_baseline: true,
            conflict: true,
            proposed_action: 'manual',
        }));
    });

    test('money no MXN y paid mayor total agregan blocking issues', async () => {
        const usd = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    money: { currency: 'usd' },
                }),
            }),
        }));
        expect(usd.blocking_issues).toContain('current money: moneda FareHarbor no MXN.');

        const inconsistente = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    money: { receipt_total: '100000', amount_paid: '100001' },
                }),
            }),
        }));
        expect(inconsistente.blocking_issues).toContain('current money: el importe pagado supera el total.');
    });

    test.each([
        ['Cancelada', 'cancelada'],
        ['Completada', 'completada'],
    ])('reservacion %s agrega blocking issue', async (estado, texto) => {
        const diff = await obtenerDiff(crearDbFake({
            reservacion: crearReservacion({ estado }),
        }));

        expect(diff.blocking_issues.some((issue) => issue.includes(texto))).toBe(true);
    });

    test('actividad iniciada agrega bloqueo temporal', async () => {
        const diff = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    availability: { start_at: '2026-10-11T06:00:00-0500' },
                }),
            }),
        }), { now: new Date('2026-10-11T11:00:00Z') });

        expect(diff.blocking_issues).toContain('La actividad FareHarbor ya inició y no puede modificarse como reservación operativa.');
    });

    test('booked y rebooked son contexto; status desconocido genera warning', async () => {
        const rebooked = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    booking: { status: 'rebooked' },
                }),
            }),
        }));
        expect(rebooked.warnings).not.toContain('Estado FareHarbor no reconocido para modificación.');

        const unknown = await obtenerDiff(crearDbFake({
            evento: crearEvento({
                normalized_data: crearNormalizedData({
                    booking: { status: 'mystery' },
                }),
            }),
        }));
        expect(unknown.warnings).toContain('Estado FareHarbor no reconocido para modificación.');
    });

    test('sin cambios relevantes conserva changes vacio y has_relevant_changes false', async () => {
        const diff = await obtenerDiff(crearDbFake());

        expect(diff.changes).toEqual([]);
        expect(diff.has_relevant_changes).toBe(false);
        expect(diff.actionable).toBe(false);
    });

    test('providers o event_type no soportados devuelven resultado controlado', async () => {
        await expect(obtenerDiffModificationFareHarbor(20, crearDbFake({
            evento: crearEvento({ provider: 'getyourguide' }),
        }))).resolves.toHaveProperty('tipo', 'provider_no_soportado');

        await expect(obtenerDiffModificationFareHarbor(20, crearDbFake({
            evento: crearEvento({ event_type: 'new_booking' }),
        }))).resolves.toHaveProperty('tipo', 'event_type_no_soportado');
    });
});
