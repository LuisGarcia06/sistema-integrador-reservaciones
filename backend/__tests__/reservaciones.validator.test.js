const {
    validarDatosReservacion,
    validarDatosActualizacionReservacion,
    validarCancelacionReservacion
} = require('../validators/reservaciones.validator');

const crearReservacionValida = (sobrescrituras = {}) => ({
    fecha: '2026-10-15',
    id_tour: 1,
    id_pais: 1,
    id_plataforma: 1,
    nombre_cliente: 'Cliente Prueba',
    pax: 2,
    pickup_place: 'Hotel Prueba',
    pickup_time: '08:30',
    turno: 'Mañana',
    precio_total: 1000,
    estado: 'Pendiente',
    ...sobrescrituras
});

describe('validarDatosReservacion', () => {
    test('acepta pax entero positivo', () => {
        const { errores, reservacion } = validarDatosReservacion(
            crearReservacionValida({ pax: 3 })
        );

        expect(errores).toHaveLength(0);
        expect(reservacion.pax).toBe(3);
    });

    test.each([
        ['pax = 0', 0],
        ['pax negativo', -1],
        ['pax decimal', 1.5],
        ['pax texto', 'dos']
    ])('rechaza %s', (_caso, pax) => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ pax })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('rechaza ninos mayor que pax', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ pax: 2, ninos: 3 })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test.each(['Mañana', 'Tarde'])('acepta turno %s', (turno) => {
        const { errores, reservacion } = validarDatosReservacion(
            crearReservacionValida({ turno })
        );

        expect(errores).toHaveLength(0);
        expect(reservacion.turno).toBe(turno);
    });

    test('rechaza turno Noche', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ turno: 'Noche' })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test.each([
        ['id_tour', 0],
        ['id_pais', -1],
        ['id_plataforma', 0]
    ])('rechaza %s no positivo', (campo, valor) => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ [campo]: valor })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('acepta montos numéricos válidos', () => {
        const { errores, reservacion } = validarDatosReservacion(
            crearReservacionValida({
                precio_total: '1500.50',
                deposito: 500,
                saldo: '1000.50',
                tipo_cambio: '18.25'
            })
        );

        expect(errores).toHaveLength(0);
        expect(reservacion.precio_total).toBe(1500.50);
        expect(reservacion.deposito).toBe(500);
        expect(reservacion.saldo).toBe(1000.50);
        expect(reservacion.tipo_cambio).toBe(18.25);
    });

    test('rechaza montos no numéricos', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({
                precio_total: 'total',
                deposito: 'deposito',
                saldo: 'saldo',
                tipo_cambio: 'tipo'
            })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('rechaza fecha inválida', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ fecha: '2026-02-30' })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('rechaza hora inválida', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ pickup_time: '25:00' })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('rechaza estado inicial distinto de Pendiente', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ estado: 'Confirmada' })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('acepta idioma opcional y aplica trim', () => {
        const { errores, reservacion } = validarDatosReservacion(
            crearReservacionValida({ idioma: ' Inglés ' })
        );

        expect(errores).toHaveLength(0);
        expect(reservacion.idioma).toBe('Inglés');
    });

    test('asigna notificado false cuando no se informa en creación', () => {
        const { errores, reservacion } = validarDatosReservacion(crearReservacionValida());

        expect(errores).toHaveLength(0);
        expect(reservacion.notificado).toBe(false);
    });

    test.each([true, false])('acepta notificado booleano %s', (notificado) => {
        const { errores, reservacion } = validarDatosReservacion(
            crearReservacionValida({ notificado })
        );

        expect(errores).toHaveLength(0);
        expect(reservacion.notificado).toBe(notificado);
    });

    test.each(['', '   ', 'x'.repeat(51)])('rechaza idioma inválido %#', (idioma) => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ idioma })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test.each(['true', 'false', null, 1])('rechaza notificado no booleano %#', (notificado) => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ notificado })
        );

        expect(errores.length).toBeGreaterThan(0);
    });

    test('rechaza motivo_cancelacion al crear una reservación pendiente', () => {
        const { errores } = validarDatosReservacion(
            crearReservacionValida({ motivo_cancelacion: 'Cliente no asistió' })
        );

        expect(errores.length).toBeGreaterThan(0);
    });
});

describe('validarDatosActualizacionReservacion', () => {
    test('acepta actualizar idioma y notificado', () => {
        const { errores, camposActualizacion } = validarDatosActualizacionReservacion({
            idioma: ' Español ',
            notificado: true
        });

        expect(errores).toHaveLength(0);
        expect(camposActualizacion).toEqual({
            idioma: 'Español',
            notificado: true
        });
    });

    test('acepta idioma null para eliminar información', () => {
        const { errores, camposActualizacion } = validarDatosActualizacionReservacion({
            idioma: null
        });

        expect(errores).toHaveLength(0);
        expect(camposActualizacion.idioma).toBeNull();
    });

    test.each(['true', null])('rechaza notificado inválido en actualización %#', (notificado) => {
        const { errores } = validarDatosActualizacionReservacion({ notificado });

        expect(errores.length).toBeGreaterThan(0);
    });

    test('acepta motivo_cancelacion no vacío y aplica trim', () => {
        const { errores, camposActualizacion } = validarDatosActualizacionReservacion({
            motivo_cancelacion: ' Cambio solicitado por cliente '
        });

        expect(errores).toHaveLength(0);
        expect(camposActualizacion.motivo_cancelacion).toBe('Cambio solicitado por cliente');
    });

    test.each(['', '   ', null])('rechaza motivo_cancelacion inválido %#', (motivo_cancelacion) => {
        const { errores } = validarDatosActualizacionReservacion({ motivo_cancelacion });

        expect(errores.length).toBeGreaterThan(0);
    });
});

describe('validarCancelacionReservacion', () => {
    test.each([{}, { motivo_cancelacion: '' }, { motivo_cancelacion: '   ' }, { motivo_cancelacion: null }])(
        'rechaza cancelación sin motivo válido %#',
        (payload) => {
            const { errores } = validarCancelacionReservacion(payload);

            expect(errores.length).toBeGreaterThan(0);
        }
    );

    test('acepta motivo de cancelación válido y aplica trim', () => {
        const { errores, cancelacion } = validarCancelacionReservacion({
            motivo_cancelacion: ' Cliente canceló por clima '
        });

        expect(errores).toHaveLength(0);
        expect(cancelacion.motivo_cancelacion).toBe('Cliente canceló por clima');
    });
});
