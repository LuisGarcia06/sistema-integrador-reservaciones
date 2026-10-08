const {
    ACCION_APPROVE,
    ACCION_DISMISS,
    REVIEW_STATUS_APPROVED,
    REVIEW_STATUS_DISMISSED,
    REVIEW_STATUS_PENDING,
    UNIQUE_EVENT_CONSTRAINT,
    construirValoresInsertEventoIntegracion,
    limpiarSecretos,
    normalizarEventoIntegracion,
    listarEventosIntegracion,
    obtenerEventoIntegracion,
    registrarEventoIntegracion,
    revisarEventoIntegracion
} = require('../services/eventosIntegracion.service');

const crearEventoBase = (sobrescrituras = {}) => ({
    provider: 'getyourguide',
    external_event_id: 'gmail-message-001',
    external_thread_id: 'gmail-thread-001',
    external_booking_id: 'GYGABC123',
    event_type: 'new_booking',
    urgent: false,
    normalized_data: {
        tour: 'Tour Sian Kaan',
        date: '2027-01-15',
        pax: 2,
    },
    source_subject: 'Reserva - STEST001 - GYGABC123',
    ...sobrescrituras,
});

function crearFilaEvento(evento, id = 1) {
    return {
        id_evento_integracion: id,
        provider: evento.provider,
        external_event_id: evento.external_event_id,
        external_thread_id: evento.external_thread_id,
        external_booking_id: evento.external_booking_id,
        event_type: evento.event_type,
        urgent: evento.urgent,
        review_status: evento.review_status,
        normalized_data: evento.normalized_data,
        source_subject: evento.source_subject,
        source_received_at: evento.source_received_at,
        created_at: new Date('2027-01-01T00:00:00Z'),
        updated_at: new Date('2027-01-01T00:00:00Z'),
    };
}

function crearDbMemoria({ simularCarreraUnique = false, ocultarExistenteEnPrimerSelect = false } = {}) {
    const filas = [];
    let consultasSelectIdentidad = 0;
    const db = {
        filas,
        query: jest.fn(async (query, values) => {
            if (/SELECT[\s\S]+FROM eventos_integracion[\s\S]+WHERE provider = \$1[\s\S]+external_event_id = \$2/i.test(query)) {
                consultasSelectIdentidad += 1;

                if (ocultarExistenteEnPrimerSelect && consultasSelectIdentidad === 1) {
                    return { rows: [] };
                }

                const [provider, externalEventId] = values;
                return {
                    rows: filas.filter((fila) => (
                        fila.provider === provider && fila.external_event_id === externalEventId
                    )),
                };
            }

            if (/INSERT INTO eventos_integracion/i.test(query)) {
                const [
                    provider,
                    externalEventId,
                    externalThreadId,
                    externalBookingId,
                    eventType,
                    urgent,
                    reviewStatus,
                    normalizedData,
                    sourceSubject,
                    sourceReceivedAt,
                ] = values;

                const existente = filas.find((fila) => (
                    fila.provider === provider && fila.external_event_id === externalEventId
                ));

                if (simularCarreraUnique) {
                    const error = new Error('duplicate key value violates unique constraint');
                    error.code = '23505';
                    error.constraint = UNIQUE_EVENT_CONSTRAINT;
                    throw error;
                }

                if (existente) {
                    return { rows: [] };
                }

                const fila = crearFilaEvento({
                    provider,
                    external_event_id: externalEventId,
                    external_thread_id: externalThreadId,
                    external_booking_id: externalBookingId,
                    event_type: eventType,
                    urgent,
                    review_status: reviewStatus,
                    normalized_data: JSON.parse(normalizedData),
                    source_subject: sourceSubject,
                    source_received_at: sourceReceivedAt,
                }, filas.length + 1);

                filas.push(fila);

                return { rows: [fila] };
            }

            throw new Error(`Query no soportado en prueba: ${query}`);
        }),
    };

    return db;
}

describe('eventosIntegracion.service', () => {
    test('inserta un evento nuevo como pending_review', async () => {
        const db = crearDbMemoria();
        const resultado = await registrarEventoIntegracion(crearEventoBase(), db);

        expect(resultado.duplicate).toBe(false);
        expect(resultado.event.provider).toBe('getyourguide');
        expect(resultado.event.review_status).toBe(REVIEW_STATUS_PENDING);
    });

    test('devuelve duplicate=true para mismo provider y external_event_id', async () => {
        const db = crearDbMemoria();
        const evento = crearEventoBase();

        await registrarEventoIntegracion(evento, db);
        const duplicado = await registrarEventoIntegracion(evento, db);

        expect(duplicado.duplicate).toBe(true);
        expect(db.filas).toHaveLength(1);
    });

    test('permite mismo external_booking_id con distinto external_event_id', async () => {
        const db = crearDbMemoria();

        const primero = await registrarEventoIntegracion(crearEventoBase({
            external_event_id: 'gmail-message-new',
            external_booking_id: 'GYGMISMA123',
        }), db);
        const segundo = await registrarEventoIntegracion(crearEventoBase({
            external_event_id: 'gmail-message-modification',
            external_booking_id: 'GYGMISMA123',
            event_type: 'modification',
        }), db);

        expect(primero.duplicate).toBe(false);
        expect(segundo.duplicate).toBe(false);
        expect(db.filas).toHaveLength(2);
    });

    test('permite modification de la misma reserva como evento diferente', async () => {
        const db = crearDbMemoria();
        const resultado = await registrarEventoIntegracion(crearEventoBase({
            external_event_id: 'gmail-message-modification',
            event_type: 'modification',
        }), db);

        expect(resultado.duplicate).toBe(false);
        expect(resultado.event.event_type).toBe('modification');
    });

    test('permite cancellation de la misma reserva como evento diferente', async () => {
        const db = crearDbMemoria();
        const resultado = await registrarEventoIntegracion(crearEventoBase({
            external_event_id: 'gmail-message-cancellation',
            event_type: 'cancellation',
            normalized_data: { status: 'cancelled' },
        }), db);

        expect(resultado.duplicate).toBe(false);
        expect(resultado.event.event_type).toBe('cancellation');
    });

    test('conserva event_type y urgent', async () => {
        const db = crearDbMemoria();
        const resultado = await registrarEventoIntegracion(crearEventoBase({
            event_type: 'new_booking',
            urgent: true,
        }), db);

        expect(resultado.event.event_type).toBe('new_booking');
        expect(resultado.event.urgent).toBe(true);
    });

    test('normalized_data conserva solo campos suministrados', () => {
        const evento = normalizarEventoIntegracion(crearEventoBase({
            normalized_data: {
                tour: 'Tour Sian Kaan',
                pax: 2,
            },
        }));

        expect(evento.normalized_data).toEqual({
            tour: 'Tour Sian Kaan',
            pax: 2,
        });
        expect(evento.normalized_data).not.toHaveProperty('pickup_place');
    });

    test('modificacion no convierte datos ausentes en null', () => {
        const evento = normalizarEventoIntegracion(crearEventoBase({
            event_type: 'modification',
            normalized_data: {
                changed_fields: [
                    { field: 'pax', previous_value: '2', new_value: '3' },
                ],
                pax: 3,
            },
        }));

        expect(evento.normalized_data).toEqual({
            changed_fields: [
                { field: 'pax', previous_value: '2', new_value: '3' },
            ],
            pax: 3,
        });
        expect(evento.normalized_data).not.toHaveProperty('date');
        expect(evento.normalized_data).not.toHaveProperty('customer_name');
    });

    test('rechaza contrato legacy con data sin normalized_data', () => {
        const eventoLegacy = {
            provider: 'getyourguide',
            external_event_id: 'gmail-message-legacy',
            external_booking_id: 'GYGLEGACY123',
            event_type: 'new_booking',
            urgent: false,
            data: { tour: 'Tour legacy' },
        };

        expect(() => normalizarEventoIntegracion(eventoLegacy)).toThrow('normalized_data');
    });

    test('source_received_at valido llega correctamente al INSERT', async () => {
        const db = crearDbMemoria();
        const sourceReceivedAt = new Date('2027-06-15T10:30:00.000Z');

        await registrarEventoIntegracion(crearEventoBase({ source_received_at: sourceReceivedAt }), db);

        const llamadaInsert = db.query.mock.calls.find(([query]) => /INSERT INTO eventos_integracion/i.test(query));
        expect(llamadaInsert[1][9]).toBe(sourceReceivedAt);
        expect(db.filas[0].source_received_at).toBe(sourceReceivedAt);
    });

    test('source_received_at invalido se normaliza a null y no produce NaN', () => {
        const evento = normalizarEventoIntegracion(crearEventoBase({
            source_received_at: new Date('fecha-invalida'),
        }));

        expect(evento.source_received_at).toBeNull();
        expect(JSON.stringify(evento)).not.toMatch(/NaN/);
    });
    test('envia normalized_data como JSONB exacto al INSERT', async () => {
        const db = crearDbMemoria();
        const normalizedData = {
            tour: 'Tour Sian Kaan',
            date: '2027-01-15',
            pax: 2,
            pickup_place: 'Hotel Prueba',
        };

        await registrarEventoIntegracion(crearEventoBase({ normalized_data: normalizedData }), db);

        const llamadaInsert = db.query.mock.calls.find(([query]) => /INSERT INTO eventos_integracion/i.test(query));
        const jsonbEnviado = JSON.parse(llamadaInsert[1][7]);

        expect(jsonbEnviado).toEqual(normalizedData);
        expect(Object.keys(jsonbEnviado)).toHaveLength(4);
        expect(db.filas[0].normalized_data).toEqual(normalizedData);
    });

    test('construye parametro SQL JSONB no vacio desde normalized_data sanitizado', () => {
        const eventoNormalizado = normalizarEventoIntegracion(crearEventoBase({
            normalized_data: {
                tour: 'Tour Sian Kaan',
                date: '2027-01-15',
                pax: 2,
            },
        }));
        const values = construirValoresInsertEventoIntegracion(eventoNormalizado);
        const jsonbEnviado = JSON.parse(values[7]);

        expect(jsonbEnviado).toEqual({
            tour: 'Tour Sian Kaan',
            date: '2027-01-15',
            pax: 2,
        });
        expect(Object.keys(jsonbEnviado)).toHaveLength(3);
    });
    test('maneja violacion UNIQUE de PostgreSQL como duplicate=true', async () => {
        const db = crearDbMemoria({ simularCarreraUnique: true, ocultarExistenteEnPrimerSelect: true });
        const existente = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase()), 1);
        db.filas.push(existente);

        const resultado = await registrarEventoIntegracion(crearEventoBase(), db);

        expect(resultado.duplicate).toBe(true);
        expect(resultado.event.external_event_id).toBe('gmail-message-001');
    });

    test('propaga errores PostgreSQL que no son duplicados controlados', async () => {
        const db = crearDbMemoria();
        const error = new Error('fallo postgres');
        error.code = '08006';
        db.query.mockImplementationOnce(async () => ({ rows: [] }));
        db.query.mockImplementationOnce(async () => { throw error; });

        await expect(registrarEventoIntegracion(crearEventoBase(), db)).rejects.toThrow('fallo postgres');
    });

    test('secretos OAuth nunca forman parte del evento persistido', async () => {
        const db = crearDbMemoria();
        const resultado = await registrarEventoIntegracion(crearEventoBase({
            normalized_data: {
                tour: 'Tour Sian Kaan',
                access_token: 'token-secreto',
                nested: {
                    refresh_token: 'refresh-secreto',
                    client_secret: 'client-secret-secreto',
                    visible: 'dato operativo',
                },
            },
        }), db);

        expect(resultado.event.normalized_data).toEqual({
            tour: 'Tour Sian Kaan',
            nested: {
                visible: 'dato operativo',
            },
        });
    });

    test('limpiarSecretos remueve secretos en arreglos anidados', () => {
        expect(limpiarSecretos({
            changed_fields: [
                { field: 'tour', new_value: 'Tour', access_token: 'no' },
            ],
        })).toEqual({
            changed_fields: [
                { field: 'tour', new_value: 'Tour' },
            ],
        });
    });
});

    test('lista eventos pending_review por defecto con paginacion', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase()), 1);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 1 }] })
                .mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await listarEventosIntegracion({ review_status: REVIEW_STATUS_PENDING }, { page: 1, limit: 25 }, db);

        expect(resultado.data).toEqual([fila]);
        expect(resultado.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
        expect(db.query.mock.calls[0][1]).toEqual([REVIEW_STATUS_PENDING]);
        expect(db.query.mock.calls[1][1]).toEqual([REVIEW_STATUS_PENDING, 25, 0]);
    });

    test('lista pendientes operativos aplicando corte configurable de Dashboard', async () => {
        const originalCutoff = process.env.INTEGRATION_DASHBOARD_CUTOFF_AT;
        process.env.INTEGRATION_DASHBOARD_CUTOFF_AT = '2026-10-08T00:00:00.000Z';
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 0 }] }),
        };

        try {
            await listarEventosIntegracion({
                review_status: REVIEW_STATUS_APPROVED,
                operational_only: true,
            }, { page: 1, limit: 25 }, db);
        } finally {
            if (originalCutoff === undefined) {
                delete process.env.INTEGRATION_DASHBOARD_CUTOFF_AT;
            } else {
                process.env.INTEGRATION_DASHBOARD_CUTOFF_AT = originalCutoff;
            }
        }

        expect(db.query.mock.calls[0][0]).toMatch(/COALESCE\(source_received_at, created_at\) >= \$2/);
        expect(db.query.mock.calls[0][1][0]).toBe(REVIEW_STATUS_APPROVED);
        expect(db.query.mock.calls[0][1][1]).toEqual(new Date('2026-10-08T00:00:00.000Z'));
    });

    test('lista aplicando filtros provider, event_type y urgent', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 0 }] }),
        };

        await listarEventosIntegracion({
            review_status: REVIEW_STATUS_PENDING,
            provider: 'getyourguide',
            event_type: 'modification',
            urgent: true,
        }, { page: 1, limit: 25 }, db);

        expect(db.query.mock.calls[0][1]).toEqual([
            REVIEW_STATUS_PENDING,
            'getyourguide',
            'modification',
            true,
        ]);
    });

    test('calcula paginacion con page y limit', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase()), 51);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 75 }] })
                .mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await listarEventosIntegracion({ review_status: REVIEW_STATUS_PENDING }, { page: 2, limit: 50 }, db);

        expect(resultado.pagination).toEqual({ page: 2, limit: 50, total: 75, totalPages: 2 });
        expect(db.query.mock.calls[1][1]).toEqual([REVIEW_STATUS_PENDING, 50, 50]);
    });

    test('obtiene detalle existente e inexistente', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase()), 1);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [fila] })
                .mockResolvedValueOnce({ rows: [] }),
        };

        await expect(obtenerEventoIntegracion(1, db)).resolves.toEqual(fila);
        await expect(obtenerEventoIntegracion(999, db)).resolves.toBeNull();
    });

    test('aprueba un evento pending_review y conserva reviewed_by, reviewed_at y review_note', async () => {
        const fila = {
            ...crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
                review_status: REVIEW_STATUS_APPROVED,
            })), 1),
            reviewed_by: 7,
            reviewed_at: new Date('2027-02-01T10:00:00Z'),
            review_note: 'Revision correcta',
        };
        const db = {
            query: jest.fn().mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_APPROVE,
            idUsuario: 7,
            nota: 'Revision correcta',
        }, db);

        expect(resultado.tipo).toBe('revisado');
        expect(resultado.event.review_status).toBe(REVIEW_STATUS_APPROVED);
        expect(resultado.event.reviewed_by).toBe(7);
        expect(resultado.event.reviewed_at).toBeInstanceOf(Date);
        expect(resultado.event.review_note).toBe('Revision correcta');
        expect(db.query.mock.calls[0][1]).toEqual([
            REVIEW_STATUS_APPROVED,
            7,
            'Revision correcta',
            1,
            REVIEW_STATUS_PENDING,
        ]);
    });

    test('descarta un evento pending_review', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
            review_status: REVIEW_STATUS_DISMISSED,
            reviewed_by: 8,
            reviewed_at: new Date('2027-02-01T11:00:00Z'),
            review_note: 'No aplica',
        })), 2);
        const db = {
            query: jest.fn().mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await revisarEventoIntegracion({
            idEventoIntegracion: 2,
            accion: ACCION_DISMISS,
            idUsuario: 8,
            nota: 'No aplica',
        }, db);

        expect(resultado.tipo).toBe('revisado');
        expect(resultado.event.review_status).toBe(REVIEW_STATUS_DISMISSED);
    });

    test('revision de evento ya aprobado devuelve ya_revisado sin modificarlo', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
            review_status: REVIEW_STATUS_APPROVED,
            reviewed_by: 7,
        })), 1);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_DISMISS,
            idUsuario: 8,
            nota: 'Intento tardio',
        }, db);

        expect(resultado.tipo).toBe('ya_revisado');
        expect(resultado.event.review_status).toBe(REVIEW_STATUS_APPROVED);
    });

    test('revision de evento ya descartado devuelve ya_revisado', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
            review_status: REVIEW_STATUS_DISMISSED,
            reviewed_by: 7,
        })), 1);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [fila] }),
        };

        const resultado = await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_APPROVE,
            idUsuario: 8,
        }, db);

        expect(resultado.tipo).toBe('ya_revisado');
        expect(resultado.event.review_status).toBe(REVIEW_STATUS_DISMISSED);
    });

    test('revision de evento inexistente devuelve no_encontrado', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] }),
        };

        const resultado = await revisarEventoIntegracion({
            idEventoIntegracion: 999,
            accion: ACCION_APPROVE,
            idUsuario: 8,
        }, db);

        expect(resultado.tipo).toBe('no_encontrado');
    });

    test('actualizacion concurrente solo permite una revision', async () => {
        const filaAprobada = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
            review_status: REVIEW_STATUS_APPROVED,
            reviewed_by: 7,
            reviewed_at: new Date('2027-02-01T10:00:00Z'),
        })), 1);
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [filaAprobada] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [filaAprobada] }),
        };

        const primera = await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_APPROVE,
            idUsuario: 7,
        }, db);
        const segunda = await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_DISMISS,
            idUsuario: 8,
        }, db);

        expect(primera.tipo).toBe('revisado');
        expect(segunda.tipo).toBe('ya_revisado');
    });

    test('las acciones de revision no consultan ni modifican reservaciones', async () => {
        const fila = crearFilaEvento(normalizarEventoIntegracion(crearEventoBase({
            review_status: REVIEW_STATUS_APPROVED,
            reviewed_by: 7,
        })), 1);
        const db = {
            query: jest.fn().mockResolvedValueOnce({ rows: [fila] }),
        };

        await revisarEventoIntegracion({
            idEventoIntegracion: 1,
            accion: ACCION_APPROVE,
            idUsuario: 7,
        }, db);

        const consultas = db.query.mock.calls.map(([query]) => query);
        expect(consultas.some((query) => /reservaciones/i.test(query))).toBe(false);
    });

