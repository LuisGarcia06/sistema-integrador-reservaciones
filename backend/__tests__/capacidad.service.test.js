const {
    validarMaximoOperacion,
    validarCapacidadTransporte,
    validarMaximoTourTurno,
    obtenerPaxOperativoReservacion
} = require('../services/capacidad.service');

describe('reglas puras de capacidad', () => {
    test('validarMaximoOperacion no produce error con 12 pasajeros', () => {
        expect(validarMaximoOperacion(12)).toBeNull();
    });

    test('validarMaximoOperacion produce error con 13 pasajeros', () => {
        expect(validarMaximoOperacion(13)).toBeTruthy();
    });

    test('validarCapacidadTransporte dentro de capacidad válida no produce error', () => {
        const transporteOperacion = {
            id_vehiculo: 1,
            capacidad: 12
        };

        expect(validarCapacidadTransporte(transporteOperacion, 12)).toBeNull();
    });

    test('validarCapacidadTransporte produce error al superar 12 pasajeros', () => {
        const transporteOperacion = {
            id_vehiculo: 1,
            capacidad: 12
        };

        expect(validarCapacidadTransporte(transporteOperacion, 13)).toBeTruthy();
    });

    test('validarMaximoTourTurno no produce error con 24 pasajeros', () => {
        expect(validarMaximoTourTurno(24)).toBeNull();
    });

    test('validarMaximoTourTurno produce error con 25 pasajeros', () => {
        expect(validarMaximoTourTurno(25)).toBeTruthy();
    });

    test('obtenerPaxOperativoReservacion devuelve 0 para una reservación Cancelada', () => {
        const reservacion = {
            estado: 'Cancelada',
            pax: 5
        };

        expect(obtenerPaxOperativoReservacion(reservacion)).toBe(0);
    });

    test('obtenerPaxOperativoReservacion devuelve el PAX de una reservación operativa', () => {
        const reservacion = {
            estado: 'Pendiente',
            pax: 5
        };

        expect(obtenerPaxOperativoReservacion(reservacion)).toBe(5);
    });
});
