const { execFileSync } = require('node:child_process');

function runScenario(name) {
  const code = `
    import {
      buscarNuevoGetYourGuideNewBooking,
      existeEventoIntegracion,
    } from './scripts/probarPersistenciaGetYourGuide.mjs';

    function encodeBase64Url(value) {
      return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/g, '');
    }

    function crearMensajeGmail({
      id,
      subject = 'Reserva - S1 - GYGTEST001',
      body = 'Actividad\\nTour Sanitizado\\nFecha\\n2027-01-15\\nParticipantes\\n2',
    } = {}) {
      return {
        id,
        threadId: 'thread-' + id,
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'GetYourGuide <do-not-reply@notification.getyourguide.com>' },
            { name: 'Subject', value: subject },
          ],
          body: {
            data: encodeBase64Url(body),
          },
        },
      };
    }

    async function main() {
      const scenario = ${JSON.stringify(name)};

      if (scenario === 'skip_registered') {
        const mensajes = {
          registrado: crearMensajeGmail({ id: 'registrado', subject: 'Reserva - S1 - GYGREG001' }),
          nuevo: crearMensajeGmail({ id: 'nuevo', subject: 'Reserva - S2 - GYGNEW001' }),
        };
        const existeCalls = [];
        const resultado = await buscarNuevoGetYourGuideNewBooking({
          gmail: {},
          db: {},
          buscarMensajes: async () => [{ id: 'registrado' }, { id: 'nuevo' }],
          obtenerMensaje: async (_gmail, id) => ({ data: mensajes[id] }),
          existeEvento: async (_db, messageId) => {
            existeCalls.push(messageId);
            return messageId === 'registrado';
          },
        });

        return { resultado, existeCalls };
      }

      if (scenario === 'ignore_non_new') {
        const mensajes = {
          mod: crearMensajeGmail({ id: 'mod', subject: 'Cambio en los detalles de la reserva: GYGMOD001' }),
          can: crearMensajeGmail({ id: 'can', subject: 'Se ha cancelado una reserva - GYGCAN001' }),
          unk: crearMensajeGmail({ id: 'unk', subject: 'Aviso GetYourGuide GYGUNK001' }),
          nuevo: crearMensajeGmail({ id: 'nuevo', subject: 'Reserva - S1 - GYGNEW002' }),
        };
        const existeCalls = [];
        const resultado = await buscarNuevoGetYourGuideNewBooking({
          gmail: {},
          db: {},
          buscarMensajes: async () => [{ id: 'mod' }, { id: 'can' }, { id: 'unk' }, { id: 'nuevo' }],
          obtenerMensaje: async (_gmail, id) => ({ data: mensajes[id] }),
          existeEvento: async (_db, messageId) => {
            existeCalls.push(messageId);
            return false;
          },
        });

        return { resultado, existeCalls };
      }

      if (scenario === 'limit') {
        const ids = Array.from({ length: 60 }, (_, index) => 'msg-' + (index + 1));
        let obtenerMensajeCalls = 0;
        let existeCalls = 0;
        const resultado = await buscarNuevoGetYourGuideNewBooking({
          gmail: {},
          db: {},
          maxCandidates: 50,
          buscarMensajes: async () => ids.map((id) => ({ id })),
          obtenerMensaje: async (_gmail, id) => {
            obtenerMensajeCalls += 1;
            return { data: crearMensajeGmail({ id, subject: 'Reserva - S1 - GYG' + id.replace(/[^0-9]/g, '').padStart(3, '0') }) };
          },
          existeEvento: async () => {
            existeCalls += 1;
            return true;
          },
        });

        return { resultado, obtenerMensajeCalls, existeCalls };
      }

      if (scenario === 'default_search_function') {
        const listCalls = [];
        const gmail = {
          users: {
            messages: {
              list: async (params) => {
                listCalls.push(params);
                return { data: { messages: [{ id: 'nuevo' }] } };
              },
            },
          },
        };
        const resultado = await buscarNuevoGetYourGuideNewBooking({
          gmail,
          db: {},
          obtenerMensaje: async () => ({ data: crearMensajeGmail({ id: 'nuevo', subject: 'Reserva - S1 - GYGNEW004' }) }),
          existeEvento: async () => false,
        });

        return { resultado, listCalls };
      }

      if (scenario === 'no_insert') {
        const queries = [];
        const db = {
          query: async (query, values) => {
            queries.push({ query, values });
            return { rows: [] };
          },
        };
        const resultado = await buscarNuevoGetYourGuideNewBooking({
          gmail: {},
          db,
          buscarMensajes: async () => [{ id: 'nuevo' }],
          obtenerMensaje: async () => ({ data: crearMensajeGmail({ id: 'nuevo', subject: 'Reserva - S1 - GYGNEW003' }) }),
        });

        return { resultado, queries };
      }

      if (scenario === 'exists_query') {
        const calls = [];
        const db = {
          query: async (query, values) => {
            calls.push({ query, values });
            return { rows: [{ ok: 1 }] };
          },
        };
        const exists = await existeEventoIntegracion(db, 'gmail-message-id');
        return { exists, calls };
      }

      throw new Error('Escenario no soportado: ' + scenario);
    }

    main()
      .then((result) => console.log('@@RESULT@@' + JSON.stringify(result)))
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const line = output.split(/\r?\n/).find((item) => item.startsWith('@@RESULT@@'));

  if (!line) {
    throw new Error(`No se encontro resultado JSON en salida:\n${output}`);
  }

  return JSON.parse(line.slice('@@RESULT@@'.length));
}

describe('probarPersistenciaGetYourGuide buscar-nuevo', () => {
  test('salta un message ID ya registrado y encuentra el siguiente no registrado', () => {
    const { resultado, existeCalls } = runScenario('skip_registered');

    expect(resultado).toEqual(expect.objectContaining({
      found: true,
      gmailMessageId: 'nuevo',
      eventType: 'new_booking',
      urgent: false,
    }));
    expect(resultado.parsedDataKeys).toEqual(expect.arrayContaining(['date', 'pax', 'tour']));
    expect(existeCalls).toEqual(['registrado', 'nuevo']);
  });

  test('ignora modification, cancellation y unknown antes de buscar duplicados', () => {
    const { resultado, existeCalls } = runScenario('ignore_non_new');

    expect(resultado.found).toBe(true);
    expect(resultado.gmailMessageId).toBe('nuevo');
    expect(existeCalls).toEqual(['nuevo']);
  });

  test('respeta el limite maximo de candidatos', () => {
    const { resultado, obtenerMensajeCalls, existeCalls } = runScenario('limit');

    expect(resultado).toEqual({ found: false });
    expect(obtenerMensajeCalls).toBe(50);
    expect(existeCalls).toBe(50);
  });

  test('usa la funcion real de busqueda por defecto sin ReferenceError', () => {
    const { resultado, listCalls } = runScenario('default_search_function');

    expect(resultado.found).toBe(true);
    expect(resultado.gmailMessageId).toBe('nuevo');
    expect(listCalls).toEqual([expect.objectContaining({
      userId: 'me',
      q: 'from:do-not-reply@notification.getyourguide.com',
      maxResults: 50,
    })]);
  });

  test('consulta solo SELECT y no inserta datos', () => {
    const { resultado, queries } = runScenario('no_insert');

    expect(resultado.found).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0].query).toMatch(/SELECT 1/);
    expect(queries[0].query).not.toMatch(/INSERT|UPDATE|DELETE/i);
  });

  test('existeEventoIntegracion consulta por provider y external_event_id', () => {
    const { exists, calls } = runScenario('exists_query');

    expect(exists).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toMatch(/external_event_id = \$2/);
    expect(calls[0].values).toEqual(['getyourguide', 'gmail-message-id']);
  });
});