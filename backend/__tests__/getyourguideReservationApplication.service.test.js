jest.mock('../services/reservaciones.service', () => ({
    crearReservacionConDb: jest.fn(),
}));

const reservacionesService = require('../services/reservaciones.service');
const {
    aplicarNuevaReservaGetYourGuide,
    LINK_UNIQUE_CONSTRAINT,
} = require('../integrations/getyourguide/getyourguideReservationApplication.service');
const {
    mapGetYourGuideNewBookingToReservation,
    normalizarFechaEspanol,
    normalizarFechaGetYourGuide,
} = require('../integrations/getyourguide/getyourguideReservation.mapper');
const { ESTADO_INICIAL_RESERVACION } = require('../validators/reservaciones.validator');

function crearEvento(sobrescrituras = {}) {
    return {
        id_evento_integracion: 1,
        provider: 'getyourguide',
        external_booking_id: 'GYGABC123',
        event_type: 'new_booking',
        review_status: 'approved',
        application_status: 'not_applied',
        normalized_data: {
            date: '2027-01-15',
            pax: 2,
            customer_name: 'Cliente Prueba',
            customer_phone: '5551234567',
            pickup_place: 'Hotel Prueba',
            price: 1000,
        },
        ...sobrescrituras,
    };
}

function crearDbPoolFake({
    evento = crearEvento(),
    plataforma = { id_plataforma: 7, nombre: 'GetYourGuide' },
    linkExistente = null,
    tourExiste = true,
    paisExiste = true,
    fallaInsertLink = null,
    marcarAplicadoDevuelveFila = true,
    equivalenciaActiva = null,
} = {}) {
    const client = {
        queries: [],
        query: jest.fn(async (query, values = []) => {
            client.queries.push(query);

            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/FROM eventos_integracion[\s\S]+FOR UPDATE/i.test(query)) {
                return { rows: evento ? [evento] : [] };
            }

            if (/FROM plataformas/i.test(query)) {
                return { rows: plataforma ? [plataforma] : [] };
            }

            if (/FROM reservas_integracion_link[\s\S]+WHERE provider/i.test(query)) {
                return { rows: linkExistente ? [linkExistente] : [] };
            }

            if (/FROM equivalencias_tours_externos/i.test(query)) {
                return { rows: equivalenciaActiva ? [equivalenciaActiva] : [] };
            }

            if (/SELECT id_tour FROM tours/i.test(query)) {
                return { rows: tourExiste ? [{ id_tour: values[0] }] : [] };
            }

            if (/SELECT id_pais FROM paises/i.test(query)) {
                return { rows: paisExiste ? [{ id_pais: values[0] }] : [] };
            }

            if (/INSERT INTO reservas_integracion_link/i.test(query)) {
                if (fallaInsertLink) {
                    throw fallaInsertLink;
                }

                return {
                    rows: [{
                        id_reserva_integracion_link: 1,
                        provider: values[0],
                        external_booking_id: values[1],
                        id_reservacion: values[2],
                    }],
                };
            }

            if (/UPDATE eventos_integracion[\s\S]+application_status/i.test(query)) {
                return {
                    rows: marcarAplicadoDevuelveFila
                        ? [{ id_evento_integracion: values[2], application_status: 'applied', applied_by: values[1] }]
                        : [],
                };
            }

            throw new Error(`Query no soportado: ${query}`);
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

describe('getyourguideReservation.mapper', () => {

    test('normaliza fechas españolas reales de GetYourGuide a ISO', () => {
        expect(normalizarFechaEspanol('7 de febrero de 2027')).toBe('2027-02-07');
        expect(normalizarFechaEspanol('07 de febrero de 2027')).toBe('2027-02-07');
        expect(normalizarFechaEspanol('1 de enero de 2026')).toBe('2026-01-01');
        expect(normalizarFechaEspanol('31 de diciembre de 2027')).toBe('2027-12-31');
    });

    test('normaliza todos los meses españoles', () => {
        expect(normalizarFechaEspanol('1 de enero de 2027')).toBe('2027-01-01');
        expect(normalizarFechaEspanol('1 de febrero de 2027')).toBe('2027-02-01');
        expect(normalizarFechaEspanol('1 de marzo de 2027')).toBe('2027-03-01');
        expect(normalizarFechaEspanol('1 de abril de 2027')).toBe('2027-04-01');
        expect(normalizarFechaEspanol('1 de mayo de 2027')).toBe('2027-05-01');
        expect(normalizarFechaEspanol('1 de junio de 2027')).toBe('2027-06-01');
        expect(normalizarFechaEspanol('1 de julio de 2027')).toBe('2027-07-01');
        expect(normalizarFechaEspanol('1 de agosto de 2027')).toBe('2027-08-01');
        expect(normalizarFechaEspanol('1 de septiembre de 2027')).toBe('2027-09-01');
        expect(normalizarFechaEspanol('1 de octubre de 2027')).toBe('2027-10-01');
        expect(normalizarFechaEspanol('1 de noviembre de 2027')).toBe('2027-11-01');
        expect(normalizarFechaEspanol('1 de diciembre de 2027')).toBe('2027-12-01');
    });

    test('normaliza espacios adicionales y mayusculas/minusculas', () => {
        expect(normalizarFechaEspanol('  7   de   Febrero   de   2027  ')).toBe('2027-02-07');
        expect(normalizarFechaEspanol('7 de FEBRERO de 2027')).toBe('2027-02-07');
    });

    test('rechaza fechas españolas invalidas o incompletas', () => {
        expect(normalizarFechaEspanol('31 de febrero de 2027')).toBeNull();
        expect(normalizarFechaEspanol('32 de enero de 2027')).toBeNull();
        expect(normalizarFechaEspanol('0 de marzo de 2027')).toBeNull();
        expect(normalizarFechaEspanol('7 de foo de 2027')).toBeNull();
        expect(normalizarFechaEspanol('7 febrero 2027')).toBeNull();
    });

    test('mantiene compatibilidad con formato ISO seguro existente', () => {
        expect(normalizarFechaGetYourGuide('2027-01-15')).toBe('2027-01-15');
    });

    test('caso real con fecha española no queda como missing ni warning', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                date: '7 de febrero de 2027',
                pax: 2,
                customer_name: 'Cliente Prueba',
                pickup_place: 'Hotel Prueba',
                price: 1000,
            },
        }, {
            idPlataforma: 7,
            completar: {
                id_tour: 3,
                id_pais: 5,
                pickup_time: '08:30',
                turno: 'Mañana',
            },
        });

        expect(resultado.reservationData.fecha).toBe('2027-02-07');
        expect(resultado.missingFields).not.toContain('fecha');
        expect(resultado.warnings).not.toContain('date_no_tiene_formato_seguro');
    });

    test('start_time solo no genera pickup_time y si deriva turno', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                date: '2027-01-15',
                start_time: '09:00',
                pax: 2,
                customer_name: 'Cliente Prueba',
                pickup_place: 'Hotel Prueba',
                price: 1000,
            },
        }, {
            idPlataforma: 7,
            completar: { id_tour: 3, id_pais: 5 },
        });

        expect(resultado.reservationData).not.toHaveProperty('pickup_time');
        expect(resultado.reservationData).toHaveProperty('turno', 'Mañana');
        expect(resultado.missingFields).toContain('pickup_time');
    });

    test('pickup_time explicito si se conserva', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                pickup_time: '07:30',
                start_time: '13:00',
            },
        }, {
            idPlataforma: 7,
            completar: {},
        });

        expect(resultado.reservationData).toHaveProperty('pickup_time', '07:30');
        expect(resultado.reservationData).toHaveProperty('turno', 'Tarde');
    });

    test('turno no se deriva de pickup_time', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                pickup_time: '13:30',
            },
        }, {
            idPlataforma: 7,
            completar: {},
        });

        expect(resultado.reservationData).toHaveProperty('pickup_time', '13:30');
        expect(resultado.reservationData).not.toHaveProperty('turno');
        expect(resultado.missingFields).toContain('turno');
    });

    test('estado inicial reutiliza el valor real de reservaciones', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({ normalized_data: {} }, { idPlataforma: 7 });

        expect(resultado.reservationData.estado).toBe(ESTADO_INICIAL_RESERVACION);
        expect(resultado.reservationData.estado).toBe('Pendiente');
    });

    test('tour_language termina en idioma y customer_language no se usa para idioma', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                date: '2027-01-15',
                pax: 2,
                customer_name: 'Cliente Prueba GYG',
                customer_phone: '+15555550123',
                customer_language: 'Inglés',
                tour_language: 'Inglés (Guía)',
                pickup_place: 'Hotel Prueba',
                price: 1000,
            },
        }, {
            idPlataforma: 7,
            completar: {
                id_tour: 74,
                id_pais: 5,
                pickup_time: '08:30',
                turno: 'Tarde',
            },
        });

        expect(resultado.reservationData).toEqual(expect.objectContaining({
            nombre_cliente: 'Cliente Prueba GYG',
            telefono_cliente: '+15555550123',
            idioma: 'Inglés (Guía)',
        }));
    });

    test('solo customer_language no genera idioma automaticamente', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                customer_name: 'Cliente Prueba GYG',
                customer_phone: '+15555550123',
                customer_language: 'Inglés',
            },
        }, { idPlataforma: 7 });

        expect(resultado.reservationData).toEqual(expect.objectContaining({
            nombre_cliente: 'Cliente Prueba GYG',
            telefono_cliente: '+15555550123',
        }));
        expect(resultado.reservationData).not.toHaveProperty('idioma');
    });

    test('ausencia de tour_language mantiene idioma sin dato', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                customer_name: 'Cliente Prueba GYG',
                customer_phone: '+15555550123',
            },
        }, { idPlataforma: 7 });

        expect(resultado.reservationData).not.toHaveProperty('idioma');
    });

    test('completar manual de idioma sobrescribe tour_language', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                date: '2027-01-15',
                pax: 2,
                customer_name: 'Cliente Prueba GYG',
                tour_language: 'Inglés (Guía)',
                pickup_place: 'Hotel Prueba',
                price: 1000,
            },
        }, {
            idPlataforma: 7,
            completar: {
                id_tour: 74,
                id_pais: 5,
                pickup_time: '08:30',
                turno: 'Tarde',
                idioma: 'Español (Guía)',
            },
        });

        expect(resultado.reservationData).toHaveProperty('idioma', 'Español (Guía)');
    });
    test('no inventa ninos si GetYourGuide no lo informa explicitamente', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                pax: 2,
            },
        }, { idPlataforma: 7 });

        expect(resultado.reservationData).toHaveProperty('pax', 2);
        expect(resultado.reservationData).not.toHaveProperty('ninos');
    });
    test('reservationData solo usa campos permitidos y no inventa faltantes', () => {
        const resultado = mapGetYourGuideNewBookingToReservation({
            normalized_data: {
                date: '2027-01-15',
                pax: 2,
                customer_name: 'Cliente Prueba',
                pickup_place: 'Hotel Prueba',
                price: 1000,
                tour: 'Nombre externo',
            },
        }, {
            idPlataforma: 7,
            completar: { id_tour: 3, provider: 'otro' },
        });

        expect(resultado.reservationData).toEqual(expect.objectContaining({
            fecha: '2027-01-15',
            pax: 2,
            nombre_cliente: 'Cliente Prueba',
            pickup_place: 'Hotel Prueba',
            precio_total: 1000,
            id_tour: 3,
            id_plataforma: 7,
            estado: 'Pendiente',
        }));
        expect(resultado.reservationData).not.toHaveProperty('provider');
        expect(resultado.reservationData).not.toHaveProperty('id_pais');
        expect(resultado.missingFields).toContain('id_pais');
        expect(resultado.missingFields).toContain('pickup_time');
    });
});

describe('getyourguideReservationApplication.service', () => {
    beforeEach(() => {
        reservacionesService.crearReservacionConDb.mockResolvedValue({
            id_reservacion: 45,
            codigo: 'RSV-20270101-ABCDE12345',
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('evento approved new_booking valido crea reserva, link y marca aplicado', async () => {
        const { pool, client } = crearDbPoolFake();

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(resultado.reservacion.codigo).toMatch(/^RSV-/);
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            client,
            expect.objectContaining({ id_tour: 3, id_pais: 5, id_plataforma: 7 }),
            9
        );
        expect(client.queries).toContain('COMMIT');
        expect(client.queries.some((query) => /INSERT INTO reservas_integracion_link/i.test(query))).toBe(true);
    });

    test('pending_review no aplica', async () => {
        const { pool, client } = crearDbPoolFake({ evento: crearEvento({ review_status: 'pending_review' }) });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {}, pool);

        expect(resultado.tipo).toBe('no_aprobado');
        expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
        expect(client.queries).toContain('ROLLBACK');
    });

    test('dismissed no aplica', async () => {
        const { pool } = crearDbPoolFake({ evento: crearEvento({ review_status: 'dismissed' }) });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {}, pool);

        expect(resultado.tipo).toBe('no_aprobado');
    });

    test('modification y cancellation no aplican en esta fase', async () => {
        const modification = crearDbPoolFake({ evento: crearEvento({ event_type: 'modification' }) });
        const cancellation = crearDbPoolFake({ evento: crearEvento({ event_type: 'cancellation' }) });

        await expect(aplicarNuevaReservaGetYourGuide(1, 9, {}, modification.pool)).resolves.toHaveProperty('tipo', 'event_type_no_soportado');
        await expect(aplicarNuevaReservaGetYourGuide(1, 9, {}, cancellation.pool)).resolves.toHaveProperty('tipo', 'event_type_no_soportado');
    });

    test('external_booking_id faltante devuelve 422 conceptual', async () => {
        const { pool } = crearDbPoolFake({ evento: crearEvento({ external_booking_id: null }) });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {}, pool);

        expect(resultado).toEqual({ tipo: 'faltan_datos', missingFields: ['external_booking_id'] });
    });

    test('id_tour faltante impide crear reservacion', async () => {
        const { pool } = crearDbPoolFake();

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, { id_pais: 5, pickup_time: '08:30' }, pool);

        expect(resultado.tipo).toBe('faltan_datos');
        expect(resultado.missingFields).toEqual(expect.arrayContaining(['id_tour', 'turno']));
        expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
    });
    test('activity_title y option_title no resuelven id_tour automaticamente', async () => {
        const { pool } = crearDbPoolFake({
            evento: crearEvento({
                normalized_data: {
                    date: '7 de febrero de 2027',
                    pax: 2,
                    customer_name: 'Cliente Prueba',
                    pickup_place: 'Hotel Prueba',
                    price: 6760,
                    activity_title: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
                    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                },
            }),
        });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, { id_pais: 5, pickup_time: '08:30' }, pool);

        expect(resultado.tipo).toBe('faltan_datos');
        expect(resultado.missingFields).toEqual(expect.arrayContaining(['id_tour', 'turno']));
        expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
    });
    test('equivalencia activa resuelve id_tour y turno', async () => {
        const { pool } = crearDbPoolFake({
            evento: crearEvento({
                normalized_data: {
                    date: '7 de febrero de 2027',
                    pax: 2,
                    customer_name: 'Cliente Prueba',
                    pickup_place: 'Hotel Prueba',
                    price: 6760,
                    activity_title: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
                    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                },
            }),
            equivalenciaActiva: {
                id_equivalencia_tour_externo: 1,
                provider: 'getyourguide',
                id_tour: 74,
                turno: 'Tarde',
            },
        });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, { id_pais: 5, pickup_time: '08:30' }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id_tour: 74, turno: 'Tarde' }),
            9
        );
    });

    test('completar manual sobrescribe id_tour derivado', async () => {
        const { pool } = crearDbPoolFake({
            evento: crearEvento({
                normalized_data: {
                    date: '2027-01-15',
                    pax: 2,
                    customer_name: 'Cliente Prueba',
                    pickup_place: 'Hotel Prueba',
                    price: 1000,
                    activity_title: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
                    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                },
            }),
            equivalenciaActiva: {
                id_equivalencia_tour_externo: 1,
                provider: 'getyourguide',
                id_tour: 74,
                turno: 'Tarde',
            },
        });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id_tour: 3, turno: 'Tarde' }),
            9
        );
    });

    test('completar manual sobrescribe turno derivado', async () => {
        const { pool } = crearDbPoolFake({
            evento: crearEvento({
                normalized_data: {
                    date: '2027-01-15',
                    pax: 2,
                    customer_name: 'Cliente Prueba',
                    pickup_place: 'Hotel Prueba',
                    price: 1000,
                    activity_title: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
                    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                },
            }),
            equivalenciaActiva: {
                id_equivalencia_tour_externo: 1,
                provider: 'getyourguide',
                id_tour: 74,
                turno: 'Tarde',
            },
        });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado.tipo).toBe('aplicado');
        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id_tour: 74, turno: 'Mañana' }),
            9
        );
    });

    test('referencia interna inexistente devuelve referencia_invalida', async () => {
        const { pool } = crearDbPoolFake({ tourExiste: false });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 999,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado).toEqual({ tipo: 'referencia_invalida', campo: 'id_tour' });
    });

    test('plataforma GetYourGuide se resuelve por nombre sin hardcodear ID', async () => {
        const { pool } = crearDbPoolFake({ plataforma: { id_plataforma: 88, nombre: 'GetYourGuide' } });

        await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(reservacionesService.crearReservacionConDb).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id_plataforma: 88 }),
            9
        );
    });

    test('provider + external_booking_id existente no crea segunda reserva', async () => {
        const { pool } = crearDbPoolFake({ linkExistente: { id_reservacion: 45 } });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado.tipo).toBe('ya_vinculado');
        expect(reservacionesService.crearReservacionConDb).not.toHaveBeenCalled();
    });

    test('concurrencia por UNIQUE de link evita segunda reserva visible', async () => {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint = LINK_UNIQUE_CONSTRAINT;
        const { pool, client } = crearDbPoolFake({ fallaInsertLink: error });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado.tipo).toBe('ya_vinculado');
        expect(client.queries).toContain('ROLLBACK');
    });

    test('fallo al crear link hace rollback', async () => {
        const { pool, client } = crearDbPoolFake({ fallaInsertLink: new Error('fallo link') });

        await expect(aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool)).rejects.toThrow('fallo link');

        expect(client.queries).toContain('ROLLBACK');
    });

    test('fallo al marcar aplicado hace rollback completo', async () => {
        const { pool, client } = crearDbPoolFake({ marcarAplicadoDevuelveFila: false });

        const resultado = await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(resultado.tipo).toBe('ya_aplicado');
        expect(client.queries).toContain('ROLLBACK');
    });

    test('no toca Gmail ni consulta tabla reservaciones directamente', async () => {
        const { pool, client } = crearDbPoolFake();

        await aplicarNuevaReservaGetYourGuide(1, 9, {
            id_tour: 3,
            id_pais: 5,
            pickup_time: '08:30',
            turno: 'Mañana',
        }, pool);

        expect(client.queries.some((query) => /gmail|users\.messages/i.test(query))).toBe(false);
    });
});

