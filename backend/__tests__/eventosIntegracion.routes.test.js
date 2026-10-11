const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../services/auth.service', () => ({
    obtenerUsuarioAutenticadoPorId: jest.fn(),
}));

jest.mock('../services/eventosIntegracion.service', () => {
    const actual = jest.requireActual('../services/eventosIntegracion.service');

    return {
        ...actual,
        listarEventosIntegracion: jest.fn(),
        obtenerEventoIntegracion: jest.fn(),
        obtenerEventoIntegracionCompleto: jest.fn(),
        revisarEventoIntegracion: jest.fn(),
    };
});


jest.mock('../integrations/getyourguide/getyourguideReservationApplication.service', () => ({
    aplicarNuevaReservaGetYourGuide: jest.fn(),
    obtenerPreviewNuevaReservaGetYourGuideConDb: jest.fn(),
}));

jest.mock('../integrations/getyourguide/getyourguideModificationDiff.service', () => ({
    obtenerDiffModificationGetYourGuide: jest.fn(),
}));

jest.mock('../integrations/fareharbor/fareharborApplication.service', () => ({
    aplicarNuevaReservaFareHarbor: jest.fn(),
    construirPreviewNuevaReservaFareHarborConDb: jest.fn(),
}));
const authService = require('../services/auth.service');
const eventosIntegracionService = require('../services/eventosIntegracion.service');
const {
    aplicarNuevaReservaGetYourGuide,
    obtenerPreviewNuevaReservaGetYourGuideConDb,
} = require('../integrations/getyourguide/getyourguideReservationApplication.service');
const { obtenerDiffModificationGetYourGuide } = require('../integrations/getyourguide/getyourguideModificationDiff.service');
const {
    aplicarNuevaReservaFareHarbor,
    construirPreviewNuevaReservaFareHarborConDb,
} = require('../integrations/fareharbor/fareharborApplication.service');
const eventosIntegracionRoutes = require('../routes/eventosIntegracion.routes');

const JWT_SECRET = 'secret-eventos-integracion-test';

function crearApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/eventos-integracion', eventosIntegracionRoutes);
    return app;
}

function crearToken(idUsuario) {
    return jwt.sign({ id_usuario: idUsuario }, JWT_SECRET);
}

function crearEvento(sobrescrituras = {}) {
    return {
        id_evento_integracion: 1,
        provider: 'getyourguide',
        external_event_id: 'gmail-message-001',
        external_thread_id: 'gmail-thread-001',
        external_booking_id: 'GYGABC123',
        event_type: 'new_booking',
        urgent: false,
        review_status: 'pending_review',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        normalized_data: { tour: 'Tour Sian Kaan' },
        source_subject: 'Reserva - STEST001 - GYGABC123',
        source_received_at: null,
        created_at: new Date('2027-01-01T00:00:00Z'),
        updated_at: new Date('2027-01-01T00:00:00Z'),
        ...sobrescrituras,
    };
}

describe('eventosIntegracion.routes', () => {
    let app;
    let tokenAdministrador;
    let tokenConsulta;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
    });

    beforeEach(() => {
        app = crearApp();
        tokenAdministrador = crearToken(1);
        tokenConsulta = crearToken(2);

        authService.obtenerUsuarioAutenticadoPorId.mockImplementation(async (idUsuario) => {
            if (Number(idUsuario) === 1) {
                return {
                    id_usuario: 1,
                    nombre: 'Administrador Test',
                    correo: 'admin@example.test',
                    id_rol: 1,
                    rol: 'Administrador',
                    estado: true,
                };
            }

            if (Number(idUsuario) === 2) {
                return {
                    id_usuario: 2,
                    nombre: 'Consulta Test',
                    correo: 'consulta@example.test',
                    id_rol: 2,
                    rol: 'Consulta',
                    estado: true,
                };
            }

            return null;
        });

        eventosIntegracionService.listarEventosIntegracion.mockResolvedValue({
            data: [crearEvento()],
            pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
            },
        });
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValue(crearEvento());
        eventosIntegracionService.obtenerEventoIntegracionCompleto.mockResolvedValue(crearEvento());
        aplicarNuevaReservaGetYourGuide.mockResolvedValue({
            tipo: 'aplicado',
            reservacion: { id_reservacion: 10, codigo: 'RSV-20270101-ABC123' },
            link: { external_booking_id: 'GYGABC123' },
        });
        obtenerPreviewNuevaReservaGetYourGuideConDb.mockResolvedValue({
            tipo: 'preview',
            reservationData: { id_pais: 987 },
            missingFields: ['pickup_time'],
            warnings: [],
            referencias: {
                pais: { id_pais: 987, nombre: 'No especificado' },
                tour: null,
            },
        });
        construirPreviewNuevaReservaFareHarborConDb.mockResolvedValue({
            tipo: 'preview',
            reservation_candidate: { id_tour: null, turno: null },
            missing_fields: ['id_tour', 'turno'],
            ready_to_apply: false,
        });
        aplicarNuevaReservaFareHarbor.mockResolvedValue({
            tipo: 'aplicado',
            reservacion: { id_reservacion: 20, codigo: 'RSV-20270101-FH123' },
            link: { external_booking_id: 'fh-booking-sintetico' },
            evento: { id_evento_integracion: 1, application_status: 'applied' },
        });
        obtenerDiffModificationGetYourGuide.mockResolvedValue({
            tipo: 'preview',
            preview: {
                id_evento_integracion: 1,
                id_reservacion: 10,
                aplicable: true,
                reason: null,
                diff_has_changes: true,
                requiere_validacion_operativa: false,
                diff: {
                    pax: { actual: 2, nuevo: 3, cambio: true },
                },
                warnings: [],
            },
        });
        eventosIntegracionService.revisarEventoIntegracion.mockResolvedValue({
            tipo: 'revisado',
            event: crearEvento({
                review_status: 'approved',
                reviewed_by: 1,
                reviewed_at: new Date('2027-01-01T01:00:00Z'),
            }),
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('usuario Consulta puede listar eventos', async () => {
        const response = await request(app)
            .get('/api/eventos-integracion')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(eventosIntegracionService.listarEventosIntegracion).toHaveBeenCalledWith(
            { review_status: 'pending_review' },
            { page: 1, limit: 25 }
        );
    });

    test('usuario Consulta puede listar pendientes operativos del Dashboard', async () => {
        const response = await request(app)
            .get('/api/eventos-integracion?review_status=approved&operational_only=true&limit=50')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(eventosIntegracionService.listarEventosIntegracion).toHaveBeenCalledWith(
            { review_status: 'approved', operational_only: true },
            { page: 1, limit: 50 }
        );
    });

    test('usuario Consulta puede consultar detalle', async () => {
        const response = await request(app)
            .get('/api/eventos-integracion/1')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body.datos).toHaveProperty('normalized_data');
        expect(response.body.datos.application_preview).toEqual(expect.objectContaining({
            tipo: 'preview',
            missingFields: ['pickup_time'],
        }));
        expect(obtenerPreviewNuevaReservaGetYourGuideConDb).toHaveBeenCalledWith(undefined, expect.objectContaining({
            id_evento_integracion: 1,
            event_type: 'new_booking',
        }), {});
    });

    test('usuario Consulta puede consultar diff read-only de modification', async () => {
        const response = await request(app)
            .get('/api/eventos-integracion/1/diff')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body.datos).toEqual(expect.objectContaining({
            id_evento_integracion: 1,
            id_reservacion: 10,
            aplicable: true,
            diff_has_changes: true,
        }));
        expect(response.body.datos.diff.pax).toEqual({ actual: 2, nuevo: 3, cambio: true });
        expect(obtenerDiffModificationGetYourGuide).toHaveBeenCalledWith(1);
    });

    test('diff de evento no soportado devuelve 409 controlado', async () => {
        obtenerDiffModificationGetYourGuide.mockResolvedValueOnce({ tipo: 'event_type_no_soportado' });

        const response = await request(app)
            .get('/api/eventos-integracion/1/diff')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('El diff de integracion no esta soportado para este evento');
    });

    test('detalle inexistente devuelve 404', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(null);

        const response = await request(app)
            .get('/api/eventos-integracion/999')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(404);
    });

    test('usuario Consulta no puede aprobar ni descartar', async () => {
        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenConsulta}`)
            .send({ accion: 'approve' });

        expect(response.status).toBe(403);
        expect(eventosIntegracionService.revisarEventoIntegracion).not.toHaveBeenCalled();
    });

    test('usuario Administrador puede aprobar', async () => {
        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'approve', nota: 'Validado' });

        expect(response.status).toBe(200);
        expect(eventosIntegracionService.revisarEventoIntegracion).toHaveBeenCalledWith({
            idEventoIntegracion: 1,
            accion: 'approve',
            idUsuario: 1,
            nota: 'Validado',
        });
    });

    test('usuario Administrador puede descartar', async () => {
        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'dismiss', nota: 'Duplicado operativo' });

        expect(response.status).toBe(200);
        expect(eventosIntegracionService.revisarEventoIntegracion).toHaveBeenCalledWith({
            idEventoIntegracion: 1,
            accion: 'dismiss',
            idUsuario: 1,
            nota: 'Duplicado operativo',
        });
    });

    test('accion invalida devuelve 400', async () => {
        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'apply' });

        expect(response.status).toBe(400);
        expect(eventosIntegracionService.revisarEventoIntegracion).not.toHaveBeenCalled();
    });

    test('revision de evento ya revisado devuelve 409', async () => {
        eventosIntegracionService.revisarEventoIntegracion.mockResolvedValueOnce({
            tipo: 'ya_revisado',
            event: crearEvento({ review_status: 'approved' }),
        });

        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'dismiss' });

        expect(response.status).toBe(409);
    });

    test('usuario Consulta no puede aplicar evento', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenConsulta}`)
            .send({ completar: { id_tour: 1 } });

        expect(response.status).toBe(403);
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('usuario Administrador puede aplicar evento approved new_booking', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { id_tour: 1, id_pais: 2, pickup_time: '08:30', turno: 'Mañana' } });

        expect(response.status).toBe(201);
        expect(response.body.datos).toEqual({
            id_reservacion: 10,
            codigo: 'RSV-20270101-ABC123',
            external_booking_id: 'GYGABC123',
        });
        expect(aplicarNuevaReservaGetYourGuide).toHaveBeenCalledWith(1, 1, {
            id_tour: 1,
            id_pais: 2,
            pickup_time: '08:30',
            turno: 'Mañana',
        });
    });

    test('aplicar GetYourGuide responde 409 cuando la fecha de actividad ya paso', async () => {
        aplicarNuevaReservaGetYourGuide.mockResolvedValueOnce({
            tipo: 'fecha_actividad_pasada',
        });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { id_tour: 1, id_pais: 2, pickup_time: '08:30', turno: 'Mañana' } });

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('La fecha de la actividad GetYourGuide ya pasó y no puede aplicarse como una reservación operativa.');
    });

    test('id_tour invalido en completar devuelve 400', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { id_tour: 'abc', pickup_time: '08:30', turno: 'Mañana' } });

        expect(response.status).toBe(400);
        expect(response.body.errores).toContain('El campo completar.id_tour debe ser un entero positivo');
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('turno invalido en completar devuelve 400', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { id_tour: 74, pickup_time: '08:30', turno: 'Noche' } });

        expect(response.status).toBe(400);
        expect(response.body.errores).toContain('El campo completar.turno debe ser Mañana o Tarde');
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('usuario Administrador puede enviar motivo_cancelacion para cancellation', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { motivo_cancelacion: 'Motivo operativo confirmado' } });

        expect(response.status).toBe(201);
        expect(aplicarNuevaReservaGetYourGuide).toHaveBeenCalledWith(1, 1, {
            motivo_cancelacion: 'Motivo operativo confirmado',
        });
    });

    test('motivo_cancelacion vacio devuelve 400', async () => {
        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { motivo_cancelacion: '   ' } });

        expect(response.status).toBe(400);
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('cancellation sin reservacion vinculada devuelve 409 controlado', async () => {
        aplicarNuevaReservaGetYourGuide.mockResolvedValueOnce({ tipo: 'reserva_no_vinculada' });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { motivo_cancelacion: 'Motivo operativo confirmado' } });

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('El evento de integracion no tiene reservacion vinculada');
    });

    test('modification no aplicable devuelve reason controlado', async () => {
        aplicarNuevaReservaGetYourGuide.mockResolvedValueOnce({
            tipo: 'modification_no_aplicable',
            reason: 'evento_mas_nuevo_ya_aplicado',
            warnings: [],
        });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: {} });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            mensaje: 'El evento de modificacion no puede aplicarse',
            reason: 'evento_mas_nuevo_ya_aplicado',
            warnings: [],
        });
    });

    test('aplicar con campos faltantes devuelve 422', async () => {
        aplicarNuevaReservaGetYourGuide.mockResolvedValueOnce({
            tipo: 'faltan_datos',
            missingFields: ['id_tour', 'id_pais'],
            warnings: [],
        });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: {} });

        expect(response.status).toBe(422);
        expect(response.body.missing_fields).toEqual(['id_tour', 'id_pais']);
    });

    test('aplicar modification o cancellation devuelve 409 desde el service', async () => {
        aplicarNuevaReservaGetYourGuide.mockResolvedValueOnce({ tipo: 'event_type_no_soportado' });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: {} });

        expect(response.status).toBe(409);
    });

    test('detalle FareHarbor admin incluye preview FH-3A sin exponer normalized_data', async () => {
        const eventoSeguro = crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            normalized_data: undefined,
            fareharbor_summary: {
                booking: { display_id: 'FH-SYN-001', status: 'booked' },
            },
        });
        const eventoCompleto = crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            normalized_data: { external_booking_id: 'fh-booking-sintetico' },
        });
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(eventoSeguro);
        eventosIntegracionService.obtenerEventoIntegracionCompleto.mockResolvedValueOnce(eventoCompleto);

        const response = await request(app)
            .get('/api/eventos-integracion/1')
            .set('Authorization', `Bearer ${tokenAdministrador}`);

        expect(response.status).toBe(200);
        expect(response.body.datos).not.toHaveProperty('normalized_data');
        expect(response.body.datos.fareharbor_application_preview).toEqual(expect.objectContaining({
            tipo: 'preview',
            missing_fields: ['id_tour', 'turno'],
        }));
        expect(construirPreviewNuevaReservaFareHarborConDb).toHaveBeenCalledWith(undefined, eventoCompleto);
        expect(obtenerPreviewNuevaReservaGetYourGuideConDb).not.toHaveBeenCalled();
    });

    test('detalle FareHarbor es read-only y no genera preview GetYourGuide', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            normalized_data: undefined,
            fareharbor_summary: {
                booking: { display_id: 'FH-SYN-001', status: 'booked' },
            },
        }));

        const response = await request(app)
            .get('/api/eventos-integracion/1')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body.datos.provider).toBe('fareharbor');
        expect(response.body.datos).toHaveProperty('fareharbor_summary');
        expect(response.body.datos).not.toHaveProperty('application_preview');
        expect(response.body.datos).not.toHaveProperty('fareharbor_application_preview');
        expect(obtenerPreviewNuevaReservaGetYourGuideConDb).not.toHaveBeenCalled();
        expect(construirPreviewNuevaReservaFareHarborConDb).not.toHaveBeenCalled();
    });

    test('diff FareHarbor devuelve 409 sin llamar servicio GetYourGuide', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'modification',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .get('/api/eventos-integracion/1/diff')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('La aplicacion de eventos FareHarbor aun no esta habilitada.');
        expect(obtenerDiffModificationGetYourGuide).not.toHaveBeenCalled();
    });

    test('revision FareHarbor new_booking permite aprobar con contrato existente', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'approve' });

        expect(response.status).toBe(200);
        expect(eventosIntegracionService.revisarEventoIntegracion).toHaveBeenCalledWith({
            idEventoIntegracion: 1,
            accion: 'approve',
            idUsuario: 1,
            nota: undefined,
        });
    });

    test('revision FareHarbor modification sigue bloqueada en FH-3B1', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'modification',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .patch('/api/eventos-integracion/1/revision')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ accion: 'approve' });

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('La aplicacion de eventos FareHarbor aun no esta habilitada.');
        expect(eventosIntegracionService.revisarEventoIntegracion).not.toHaveBeenCalled();
    });

    test('aplicar FareHarbor new_booking usa servicio FH-3B1 y no llama GetYourGuide', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { id_tour: 70, turno: 'Mañana', pickup_time: '08:30' } });

        expect(response.status).toBe(201);
        expect(response.body.datos).toEqual({
            id_reservacion: 20,
            codigo: 'RSV-20270101-FH123',
            external_booking_id: 'fh-booking-sintetico',
            id_evento_integracion: 1,
        });
        expect(aplicarNuevaReservaFareHarbor).toHaveBeenCalledWith(1, 1, {
            id_tour: 70,
            turno: 'Mañana',
            pickup_time: '08:30',
        });
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('aplicar FareHarbor rechaza campos derivados por backend', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: { fecha: '2027-01-01' } });

        expect(response.status).toBe(400);
        expect(response.body.errores).toContain('El campo completar.fecha no esta permitido para FareHarbor');
        expect(aplicarNuevaReservaFareHarbor).not.toHaveBeenCalled();
    });

    test('aplicar FareHarbor responde 409 cuando la actividad ya inicio', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'new_booking',
            fareharbor_summary: {},
        }));
        aplicarNuevaReservaFareHarbor.mockResolvedValueOnce({
            tipo: 'actividad_iniciada',
        });

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: {} });

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('La actividad FareHarbor ya inició y no puede aplicarse como reservación operativa.');
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });

    test('aplicar FareHarbor modification sigue bloqueada en FH-3B1', async () => {
        eventosIntegracionService.obtenerEventoIntegracion.mockResolvedValueOnce(crearEvento({
            provider: 'fareharbor',
            event_type: 'modification',
            fareharbor_summary: {},
        }));

        const response = await request(app)
            .post('/api/eventos-integracion/1/aplicar')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ completar: {} });

        expect(response.status).toBe(409);
        expect(response.body.mensaje).toBe('La aplicacion de eventos FareHarbor aun no esta habilitada.');
        expect(aplicarNuevaReservaFareHarbor).not.toHaveBeenCalled();
        expect(aplicarNuevaReservaGetYourGuide).not.toHaveBeenCalled();
    });
});


