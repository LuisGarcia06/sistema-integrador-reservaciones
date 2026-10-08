const path = require('path');
const dotenv = require('dotenv');
const request = require('supertest');

const envPath = path.join(__dirname, '..', '..', '.env.test');

dotenv.config({ path: envPath });

process.env.APP_CONFIG_PATH = envPath;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const app = require('../server');
const pool = require('../config/database');
const { construirDatosEquivalenciaTourExterno } = require('../services/equivalenciasToursExternos.service');
const {
    prepararBaseDePruebas,
    cerrarPool
} = require('./helpers/testDatabase');

describe('API CP-044', () => {
    let contexto;
    let tokenAdministrador;
    let tokenConsulta;

    const crearPayloadReservacionValida = (sobrescrituras = {}) => ({
        fecha: '2027-01-15',
        id_tour: contexto.catalogos.id_tour,
        id_pais: contexto.catalogos.id_pais,
        id_plataforma: contexto.catalogos.id_plataforma,
        nombre_cliente: 'Cliente CP044',
        pax: 2,
        ninos: 0,
        pickup_place: 'Hotel CP044',
        pickup_time: '08:30',
        turno: 'Mañana',
        precio_total: 1000,
        deposito: 200,
        saldo: 800,
        tipo_cambio: 18,
        estado: 'Pendiente',
        ...sobrescrituras
    });

    const login = async (correo) => request(app)
        .post('/api/auth/login')
        .send({
            correo,
            password: contexto.password
        });

    beforeAll(async () => {
        contexto = await prepararBaseDePruebas();

        const [respuestaAdmin, respuestaConsulta] = await Promise.all([
            login(contexto.usuarios.administrador.correo),
            login(contexto.usuarios.consulta.correo)
        ]);

        tokenAdministrador = respuestaAdmin.body.token;
        tokenConsulta = respuestaConsulta.body.token;
    });

    afterAll(async () => {
        await cerrarPool();
    });

    test('GET / responde correctamente', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.text).toContain('API del Sistema Integrador de Reservaciones');
    });

    test('ruta inexistente devuelve 404', async () => {
        const response = await request(app).get('/api/ruta-inexistente-cp044');

        expect(response.status).toBe(404);
    });

    test('token inválido en endpoint protegido devuelve 401', async () => {
        const response = await request(app)
            .get('/api/reservaciones')
            .set('Authorization', 'Bearer token-invalido-cp044');

        expect(response.status).toBe(401);
    });

    test('login del Administrador de prueba funciona', async () => {
        const response = await login(contexto.usuarios.administrador.correo);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body.usuario).toHaveProperty('rol', 'Administrador');
    });

    test('login del usuario Consulta de prueba funciona', async () => {
        const response = await login(contexto.usuarios.consulta.correo);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body.usuario).toHaveProperty('rol', 'Consulta');
    });

    test('usuario Consulta no puede crear reservaciones', async () => {
        const response = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenConsulta}`)
            .send(crearPayloadReservacionValida());

        expect(response.status).toBe(403);
    });

    test('POST /api/reservaciones rechaza turno Noche', async () => {
        const response = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ turno: 'Noche' }));

        expect(response.status).toBe(400);
        expect(Array.isArray(response.body.errores)).toBe(true);
    });

    test('POST /api/reservaciones rechaza código manual', async () => {
        const response = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ codigo: 'CODIGO-MANUAL-CP044' }));

        expect(response.status).toBe(400);
        expect(Array.isArray(response.body.errores)).toBe(true);
    });

    test('POST /api/reservaciones rechaza ninos mayor que pax', async () => {
        const response = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ pax: 2, ninos: 3 }));

        expect(response.status).toBe(400);
        expect(Array.isArray(response.body.errores)).toBe(true);
    });

    test('GET /api/reservaciones con usuario autorizado devuelve estructura válida', async () => {
        const response = await request(app)
            .get('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('mensaje');
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('datos');
        expect(typeof response.body.total).toBe('number');
        expect(Array.isArray(response.body.datos)).toBe(true);
    });

    test('CP-046 POST /api/reservaciones acepta idioma válido y opcional', async () => {
        const responseConIdioma = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ idioma: ' Inglés ' }));

        expect(responseConIdioma.status).toBe(201);
        expect(responseConIdioma.body.datos).toHaveProperty('idioma', 'Inglés');

        const responseSinIdioma = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP046 sin idioma' }));

        expect(responseSinIdioma.status).toBe(201);
        expect(responseSinIdioma.body.datos).toHaveProperty('idioma', null);
    });

    test('CP-047 POST /api/reservaciones acepta notificado boolean y rechaza valores no booleanos', async () => {
        const responseBoolean = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ notificado: true }));

        expect(responseBoolean.status).toBe(201);
        expect(responseBoolean.body.datos).toHaveProperty('notificado', true);

        const responseString = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ notificado: 'true' }));

        expect(responseString.status).toBe(400);
        expect(Array.isArray(responseString.body.errores)).toBe(true);
    });

    test('CP-048 PATCH /api/reservaciones permite actualizar idioma y notificado', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP048' }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const patchResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ idioma: ' Francés ', notificado: true });

        expect(patchResponse.status).toBe(200);
        expect(patchResponse.body.datos).toHaveProperty('idioma', 'Francés');
        expect(patchResponse.body.datos).toHaveProperty('notificado', true);
    });

    test('CP-049 GET /api/reservaciones/:id devuelve idioma, notificado y motivo_cancelacion', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ idioma: 'Español', notificado: false }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const getResponse = await request(app)
            .get(`/api/reservaciones/${idReservacion}`)
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body.datos).toHaveProperty('idioma', 'Español');
        expect(getResponse.body.datos).toHaveProperty('notificado', false);
        expect(getResponse.body.datos).toHaveProperty('motivo_cancelacion', null);
    });

    test('CP-050 cancelar sin motivo o con cadena vacía devuelve 400', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP050' }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const sinMotivo = await request(app)
            .patch(`/api/reservaciones/${idReservacion}/cancelar`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({});

        expect(sinMotivo.status).toBe(400);

        const motivoVacio = await request(app)
            .patch(`/api/reservaciones/${idReservacion}/cancelar`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ motivo_cancelacion: '   ' });

        expect(motivoVacio.status).toBe(400);
    });

    test('CP-051 cancelar con motivo válido cambia estado y almacena motivo', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP051' }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const cancelResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}/cancelar`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ motivo_cancelacion: ' Cliente canceló por clima ' });

        expect(cancelResponse.status).toBe(200);
        expect(cancelResponse.body.datos).toHaveProperty('estado', 'Cancelada');
        expect(cancelResponse.body.datos).toHaveProperty('motivo_cancelacion', 'Cliente canceló por clima');
    });

    test('CP-052 no permite asignar motivo_cancelacion a una reservación no cancelada', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP052' }));

        expect(createResponse.status).toBe(201);
        expect(createResponse.body.datos).toHaveProperty('motivo_cancelacion', null);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const patchResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ motivo_cancelacion: 'Motivo arbitrario' });

        expect(patchResponse.status).toBe(400);
    });

    test('CP-052 PATCH general no permite cancelar cambiando estado directamente', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP052 estado' }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const patchResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ estado: 'Cancelada' });

        expect(patchResponse.status).toBe(400);
    });

    test('CP-053 permite corregir motivo_cancelacion en cancelada y audita el cambio', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({ nombre_cliente: 'Cliente CP053' }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const cancelResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}/cancelar`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ motivo_cancelacion: 'Motivo original de prueba' });

        expect(cancelResponse.status).toBe(200);
        expect(cancelResponse.body.datos).toHaveProperty('estado', 'Cancelada');
        expect(cancelResponse.body.datos).toHaveProperty('motivo_cancelacion', 'Motivo original de prueba');

        const bitacoraAntes = await request(app)
            .get('/api/bitacora')
            .set('Authorization', `Bearer ${tokenAdministrador}`);

        expect(bitacoraAntes.status).toBe(200);

        const entradasActualizacionAntes = bitacoraAntes.body.datos.filter((entrada) => (
            Number(entrada.id_reservacion) === Number(idReservacion) &&
            entrada.accion === 'MODIFICAR' &&
            String(entrada.descripcion || '').includes('motivo_cancelacion')
        ));

        const patchResponse = await request(app)
            .patch(`/api/reservaciones/${idReservacion}`)
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send({ motivo_cancelacion: 'Motivo corregido de prueba' });

        expect(patchResponse.status).toBe(200);
        expect(patchResponse.body.datos).toHaveProperty('estado', 'Cancelada');
        expect(patchResponse.body.datos).toHaveProperty('motivo_cancelacion', 'Motivo corregido de prueba');

        const bitacoraDespues = await request(app)
            .get('/api/bitacora')
            .set('Authorization', `Bearer ${tokenAdministrador}`);

        expect(bitacoraDespues.status).toBe(200);

        const entradasActualizacionDespues = bitacoraDespues.body.datos.filter((entrada) => (
            Number(entrada.id_reservacion) === Number(idReservacion) &&
            entrada.accion === 'MODIFICAR' &&
            String(entrada.descripcion || '').includes('motivo_cancelacion')
        ));

        expect(entradasActualizacionDespues.length).toBe(entradasActualizacionAntes.length + 1);
        expect(entradasActualizacionDespues.some((entrada) => (
            String(entrada.descripcion || '').includes('Motivo corregido de prueba')
        ))).toBe(true);
    });

    test('la suite usa la base de datos de prueba esperada', () => {
        expect(contexto.currentDatabase).toBe('sian_kaan_reservaciones_test');
    });

    test('GET /api/eventos-integracion/:id/diff calcula modification sin escribir reservacion evento ni bitacora', async () => {
        const createResponse = await request(app)
            .post('/api/reservaciones')
            .set('Authorization', `Bearer ${tokenAdministrador}`)
            .send(crearPayloadReservacionValida({
                nombre_cliente: 'Cliente Diff Modification',
                fecha: '2026-10-08',
                pax: 2,
                pickup_place: 'Lobby Actual',
                turno: 'Mañana',
                idioma: 'Español',
            }));

        expect(createResponse.status).toBe(201);

        const idReservacion = createResponse.body.datos.id_reservacion;
        const externalBookingId = `GYGDIFF${Date.now()}`;

        await pool.query(
            `
                INSERT INTO reservas_integracion_link (
                    provider,
                    external_booking_id,
                    id_reservacion
                )
                VALUES ($1, $2, $3)
            `,
            ['getyourguide', externalBookingId, idReservacion]
        );

        const eventoResult = await pool.query(
            `
                INSERT INTO eventos_integracion (
                    provider,
                    external_event_id,
                    external_thread_id,
                    external_booking_id,
                    event_type,
                    urgent,
                    review_status,
                    application_status,
                    normalized_data,
                    source_subject,
                    source_received_at,
                    created_at,
                    updated_at
                )
                VALUES (
                    $1, $2, $3, $4, 'modification',
                    FALSE, 'pending_review', 'not_applied',
                    $5::jsonb, $6, $7,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING id_evento_integracion
            `,
            [
                'getyourguide',
                `${externalBookingId}-event-001`,
                `${externalBookingId}-thread-001`,
                externalBookingId,
                JSON.stringify({
                    date: '2026-10-09',
                    pax: 3,
                    pickup_place: 'Lobby Nuevo',
                    tour_language: 'Inglés (Guía)',
                    activity_title: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
                    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                }),
                `Cambio controlado ${externalBookingId}`,
                new Date('2026-10-07T10:00:00.000Z'),
            ]
        );
        const idEvento = eventoResult.rows[0].id_evento_integracion;
        const reservacionAntes = await pool.query(
            'SELECT fecha, pax, pickup_place, id_tour, turno, idioma, estado FROM reservaciones WHERE id_reservacion = $1',
            [idReservacion]
        );
        const eventoAntes = await pool.query(
            'SELECT review_status, application_status, applied_at, applied_by FROM eventos_integracion WHERE id_evento_integracion = $1',
            [idEvento]
        );
        const bitacoraAntes = await pool.query(
            'SELECT COUNT(*)::int AS total FROM bitacora WHERE id_reservacion = $1',
            [idReservacion]
        );

        const response = await request(app)
            .get(`/api/eventos-integracion/${idEvento}/diff`)
            .set('Authorization', `Bearer ${tokenConsulta}`);

        expect(response.status).toBe(200);
        expect(response.body.datos).toEqual(expect.objectContaining({
            id_evento_integracion: idEvento,
            id_reservacion: idReservacion,
            aplicable: true,
            diff_has_changes: true,
            requiere_validacion_operativa: false,
        }));
        expect(response.body.datos.diff).toEqual(expect.objectContaining({
            fecha: { actual: '2026-10-08', nuevo: '2026-10-09', cambio: true },
            pax: { actual: 2, nuevo: 3, cambio: true },
            pickup_place: { actual: 'Lobby Actual', nuevo: 'Lobby Nuevo', cambio: true },
            id_tour: { actual: contexto.catalogos.id_tour, nuevo: 74, cambio: true },
            turno: { actual: 'Mañana', nuevo: 'Tarde', cambio: true },
            idioma: { actual: 'Español', nuevo: 'Inglés (Guía)', cambio: true },
        }));

        const reservacionDespues = await pool.query(
            'SELECT fecha, pax, pickup_place, id_tour, turno, idioma, estado FROM reservaciones WHERE id_reservacion = $1',
            [idReservacion]
        );
        const eventoDespues = await pool.query(
            'SELECT review_status, application_status, applied_at, applied_by FROM eventos_integracion WHERE id_evento_integracion = $1',
            [idEvento]
        );
        const bitacoraDespues = await pool.query(
            'SELECT COUNT(*)::int AS total FROM bitacora WHERE id_reservacion = $1',
            [idReservacion]
        );

        expect(reservacionDespues.rows[0]).toEqual(reservacionAntes.rows[0]);
        expect(eventoDespues.rows[0]).toEqual(eventoAntes.rows[0]);
        expect(bitacoraDespues.rows[0].total).toBe(bitacoraAntes.rows[0].total);
    });
    const insertarEquivalenciaTourExterno = (client, equivalencia) => client.query(
        `
            INSERT INTO equivalencias_tours_externos (
                provider,
                activity_title,
                option_title,
                activity_title_normalizado,
                option_title_normalizado,
                id_tour,
                turno,
                activo,
                notas
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
            equivalencia.provider,
            equivalencia.activity_title,
            equivalencia.option_title,
            equivalencia.activity_title_normalizado,
            equivalencia.option_title_normalizado,
            equivalencia.id_tour,
            equivalencia.turno,
            equivalencia.activo,
            equivalencia.notas,
        ]
    );

    test('equivalencias de tours externos rechaza id_tour inexistente por FK', async () => {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            const equivalencia = construirDatosEquivalenciaTourExterno({
                provider: 'getyourguide',
                activityTitle: 'Actividad con FK invalida CP044',
                optionTitle: 'Opcion con FK invalida CP044',
                idTour: 999999,
                turno: 'Tarde',
            });

            await expect(insertarEquivalenciaTourExterno(client, equivalencia))
                .rejects.toMatchObject({ code: '23503' });
        } finally {
            await client.query('ROLLBACK').catch(() => {});
            client.release();
        }
    });

    test('equivalencias de tours externos impide duplicado activo por DB', async () => {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            const equivalencia = construirDatosEquivalenciaTourExterno({
                provider: 'getyourguide',
                activityTitle: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
                optionTitle: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
                idTour: 74,
                turno: 'Tarde',
            });

            await expect(insertarEquivalenciaTourExterno(client, equivalencia))
                .rejects.toMatchObject({ code: '23505' });
        } finally {
            await client.query('ROLLBACK').catch(() => {});
            client.release();
        }
    });
});
