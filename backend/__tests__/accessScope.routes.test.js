const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/operaciones.service', () => ({
    obtenerOperaciones: jest.fn(async () => []),
    obtenerOperacionPorId: jest.fn(async () => ({ id_operacion_tour: 7 })),
    obtenerOperacionesSugeridas: jest.fn(async () => ({
        fecha: '2027-01-15', total_salidas_detectadas: 1, reservaciones_sin_turno: 19,
        datos: [{ id_tour: 501, tour: 'Tour global', turno: 'Mañana', pax_total: 40,
            total_reservaciones: 20, grupos_necesarios: 2, excede_capacidad: true,
            pax_excedente: 16, grupos: [{ numero_grupo: 1, preparado: true }] }]
    }))
}));
jest.mock('../services/daily.service', () => ({
    consultarDailyPorFecha: jest.fn(async () => ({ datos: [], observaciones: 'NOTA GLOBAL' })),
    consultarDailyOperativoPorFecha: jest.fn(async () => ({ operaciones: [], reservaciones_sin_asignar: [] })),
    obtenerObservacionesPorFecha: jest.fn(async () => 'NOTA GLOBAL')
}));
jest.mock('../services/transportes.service', () => ({
    obtenerTransportes: jest.fn(async () => []),
    obtenerTransportePorId: jest.fn(async () => ({ id_transporte_operacion: 7 }))
}));
jest.mock('../services/eventosIntegracion.service', () => ({
    listarEventosIntegracion: jest.fn(async () => ({ data: [], pagination: { total: 0 } })),
    obtenerEventoIntegracion: jest.fn(async () => ({ provider: 'otro', event_type: 'new_booking' }))
}));
jest.mock('../integrations/getyourguide/getyourguideModificationDiff.service', () => ({
    obtenerDiffModificationGetYourGuide: jest.fn(async () => ({ tipo: 'preview', preview: { diff: 'GLOBAL' } }))
}));
jest.mock('../services/guias.service', () => ({
    obtenerGuias: jest.fn(async () => []), obtenerGuiaPorId: jest.fn(async () => ({ id_guia: 7 }))
}));
jest.mock('../services/operadores.service', () => ({
    obtenerOperadores: jest.fn(async () => []), obtenerOperadorPorId: jest.fn(async () => ({ id_operador: 7 }))
}));
jest.mock('../services/vehiculos.service', () => ({
    obtenerVehiculos: jest.fn(async () => []), obtenerVehiculoPorId: jest.fn(async () => ({ id_vehiculo: 7 }))
}));
jest.mock('../services/usuarios.service', () => ({
    obtenerUsuarios: jest.fn(async () => []), obtenerRoles: jest.fn(async () => []),
    obtenerUsuarioPorId: jest.fn(async () => ({ id_usuario: 7 }))
}));
jest.mock('../services/bitacora.service', () => ({ consultarBitacora: jest.fn(async () => []) }));

const pool = require('../config/database');
const operacionesService = require('../services/operaciones.service');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const reservacionesService = require('../services/reservaciones.service');
const dashboardService = require('../services/dashboard.service');
const plataformasService = require('../services/plataformas.service');
const { construirFiltroAlcanceReservaciones } = require('../utils/alcanceReservaciones');

const FECHA = '2027-01-15';
const SECRET = 'access-scope-03a-secret-sintetico';
const IDS_PERMITIDOS = [17, 83];
const PLATAFORMAS = [
    { id_plataforma: 17, nombre: 'Plataforma A' },
    { id_plataforma: 83, nombre: 'Plataforma B' },
    { id_plataforma: 99, nombre: 'Plataforma oculta' }
];
const RESERVACIONES = [
    ...Array.from({ length: 30 }, (_valor, i) => ({
        id_reservacion: i + 1, codigo: `VISIBLE-${i + 1}`, nombre_cliente: `Cliente visible ${i + 1}`,
        fecha: i === 0 ? '2020-01-05' : FECHA, id_plataforma: i % 2 ? 83 : 17,
        plataforma: i % 2 ? 'Plataforma B' : 'Plataforma A',
        id_tour: i % 2 ? 502 : 501, tour: i % 2 ? 'Tour B' : 'Tour A',
        turno: 'Mañana', estado: i === 1 ? 'Cancelada' : 'Pendiente', pax: 2,
        fecha_registro: `2027-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`
    })),
    ...Array.from({ length: 12 }, (_valor, i) => ({
        id_reservacion: 101 + i, codigo: `OCULTA-${i + 1}`, nombre_cliente: 'Cliente privado',
        fecha: FECHA, id_plataforma: 99, plataforma: 'Plataforma oculta', id_tour: 503,
        tour: 'Tour solo oculto', turno: 'Mañana', estado: 'Pendiente', pax: 10,
        fecha_registro: '2028-01-01T10:00:00Z'
    }))
];

// Este driver aislado evalua los predicados y parametros del SQL REAL enviado
// por los servicios. Si falta el filtro SQL, devuelve tambien las filas ocultas.
// No carga el pool pg, no conecta a DB y rechaza toda sentencia de escritura.
function filtrarReservaciones(sql, values) {
    let rows = [...RESERVACIONES];
    const scope = sql.match(/(?:r\.)?id_plataforma = ANY\(\$(\d+)::int\[\]\)/);
    if (scope) rows = rows.filter((row) => values[Number(scope[1]) - 1].includes(row.id_plataforma));
    for (const match of sql.matchAll(/\b(?:r\.)?(id_reservacion|id_plataforma|id_tour|codigo|nombre_cliente|fecha|turno|estado)\s*(>=|<=|=|ILIKE)\s*\$(\d+)/g)) {
        const [, field, op, index] = match;
        const value = values[Number(index) - 1];
        rows = rows.filter((row) => {
            if (op === '>=') return row[field] >= value;
            if (op === '<=') return row[field] <= value;
            if (op === 'ILIKE') return row[field].toLowerCase().includes(value.replaceAll('%', '').toLowerCase());
            return row[field] === value;
        });
    }
    const states = sql.match(/r\.estado = ANY\(\$(\d+)::varchar\[\]\)/);
    if (states) rows = rows.filter((row) => values[Number(states[1]) - 1].includes(row.estado));
    return rows;
}

function crearApp() {
    const app = express();
    app.use(express.json());
    for (const name of ['reservaciones', 'dashboard', 'plataformas', 'paises', 'tours', 'daily',
        'operaciones', 'transportes', 'eventosIntegracion', 'guias', 'operadores', 'vehiculos', 'usuarios', 'bitacora']) {
        const prefix = name === 'eventosIntegracion' ? 'eventos-integracion' : name;
        app.use('/api/' + prefix, require('../routes/' + name + '.routes'));
    }
    return app;
}

const LECTURAS_OPERATIVAS = [
    '/api/daily?fecha=' + FECHA, '/api/daily/operativo?fecha=' + FECHA,
    '/api/daily/observaciones?fecha=' + FECHA, '/api/operaciones', '/api/operaciones/7',
    '/api/operaciones/sugeridas?fecha=' + FECHA, '/api/transportes', '/api/transportes/7',
    '/api/eventos-integracion', '/api/eventos-integracion/7', '/api/eventos-integracion/7/diff',
    '/api/guias', '/api/guias/7', '/api/operadores', '/api/operadores/7', '/api/vehiculos', '/api/vehiculos/7', '/api/tours/7'
];

let app;
let usuarios;
let fallarPermisos;
let consoleError;
const token = (id = 3) => jwt.sign({ id_usuario: id, rol: 'Administrador', platform_ids: [99] }, SECRET);
const get = (url, id = 3) => request(app).get(url).set('Authorization', 'Bearer ' + token(id));
const queriesReservaciones = () => pool.query.mock.calls.filter(([sql]) => /FROM reservaciones\b/.test(sql));
const queriesAlcance = () => pool.query.mock.calls.filter(([sql]) => /AS platform_ids/.test(sql));

beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.JWT_SECRET = SECRET;
    fallarPermisos = false;
    usuarios = {
        1: { id_usuario: 1, rol: 'Administrador', estado: true, alcance_plataformas: 'selected', platform_ids: [] },
        2: { id_usuario: 2, rol: 'Consulta', estado: true, alcance_plataformas: 'all', platform_ids: [] },
        3: { id_usuario: 3, rol: 'Consulta', estado: true, alcance_plataformas: 'selected', platform_ids: [...IDS_PERMITIDOS] },
        4: { id_usuario: 4, rol: 'Consulta', estado: true, alcance_plataformas: 'selected', platform_ids: [] }
    };
    pool.query.mockImplementation(async (sql, values = []) => {
        if (!/^\s*SELECT/.test(sql)) throw new Error('La prueba prohíbe escrituras');
        if (/FROM usuarios u/.test(sql)) {
            if (/AS platform_ids/.test(sql) && fallarPermisos) {
                const error = new Error('Detalle SQL privado'); error.code = '42703'; throw error;
            }
            return { rows: usuarios[values[0]] ? [{ ...usuarios[values[0]] }] : [] };
        }
        if (/FROM reservaciones\b/.test(sql)) {
            let rows = filtrarReservaciones(sql, values);
            if (/AS reservaciones_vigentes/.test(sql)) return { rows: [{ reservaciones_vigentes: rows.length, pax_vigentes: rows.reduce((sum, row) => sum + row.pax, 0) }] };
            if (/GROUP BY r.id_tour/.test(sql)) {
                const groups = new Map();
                rows.forEach((row) => {
                    const group = groups.get(row.id_tour) || { id_tour: row.id_tour, tour: row.tour, total: 0 };
                    group.total += 1; groups.set(row.id_tour, group);
                });
                return { rows: [...groups.values()] };
            }
            if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total: rows.length }] };
            rows.sort((a, b) => b.fecha_registro.localeCompare(a.fecha_registro) || b.id_reservacion - a.id_reservacion);
            const limit = sql.match(/LIMIT (\d+|\$\d+)/);
            const offset = sql.match(/OFFSET \$(\d+)/);
            const start = offset ? values[Number(offset[1]) - 1] : 0;
            if (limit) {
                const count = limit[1].startsWith('$') ? values[Number(limit[1].slice(1)) - 1] : Number(limit[1]);
                rows = rows.slice(start, start + count);
            }
            return { rows: rows.map((row) => ({ ...row })) };
        }
        if (/FROM plataformas\b/.test(sql)) {
            const match = sql.match(/id_plataforma = ANY\(\$(\d+)::int\[\]\)/);
            return { rows: match ? PLATAFORMAS.filter((pl) => values[Number(match[1]) - 1].includes(pl.id_plataforma)) : PLATAFORMAS };
        }
        if (/FROM tours\b/.test(sql)) return { rows: [{ id_tour: 501, nombre: 'Tour general', descripcion: 'Catalogo', activo: true }] };
        if (/FROM paises\b/.test(sql)) return { rows: [{ id_pais: 8, nombre: 'Pais general' }] };
        if (/FROM operaciones_tour/.test(sql)) return { rows: [{ total: 7 }] };
        throw new Error('SQL inesperado en la prueba aislada: ' + sql);
    });
    app = crearApp();
});

afterEach(() => consoleError.mockRestore());

describe('ACCESS-SCOPE-03A: Reservaciones y Dashboard con servicios reales', () => {
    test.each([1, 2])('usuario %s con acceso completo conserva listado y Dashboard global', async (id) => {
        const listed = await get('/api/reservaciones', id);
        expect(listed.status).toBe(200); expect(listed.body.total).toBe(42);
        const dashboard = await get('/api/dashboard/resumen?fecha=' + FECHA, id);
        expect(dashboard.status).toBe(200);
        expect(dashboard.body.metricas).toEqual({ reservaciones_vigentes: 40, pax_vigentes: 176, grupos_preparados: 7, grupos_pendientes: 1 });
        expect(dashboard.body.alertas.salidas_con_exceso_capacidad).toBe(1);
        expect(operacionesService.obtenerOperacionesSugeridas).toHaveBeenCalled();
    });

    test('Consulta selected ignora el rol y plataformas del JWT y solo recibe sus plataformas de DB', async () => {
        const response = await get('/api/reservaciones');
        expect(response.status).toBe(200); expect(response.body.total).toBe(30);
        expect(response.body.datos.every((row) => IDS_PERMITIDOS.includes(row.id_plataforma))).toBe(true);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(queriesAlcance()).toHaveLength(1);
    });

    test.each(['/api/reservaciones', '/api/reservaciones?page=1&limit=25&include_resumen_tours=1'])('selected vacio devuelve cero filas y totales en %s', async (url) => {
        const response = await get(url, 4);
        expect(response.status).toBe(200);
        if (response.body.pagination) {
            expect(response.body.data).toEqual([]);
            expect(response.body.pagination).toMatchObject({ total: 0, totalPages: 0 });
            expect(response.body.meta.resumen_tours).toEqual([]);
        } else expect(response.body).toMatchObject({ total: 0, datos: [] });
    });

    test.each([
        'codigo=OCULTA-1', 'nombre=privado', 'id_plataforma=99',
        'fecha=' + FECHA + '&nombre=privado',
        'fecha_desde=2027-01-01&fecha_hasta=2027-01-31&id_tour=503',
        'estado=Pendiente&turno=Ma%C3%B1ana&id_plataforma=99',
        'nombre=%25&codigo=OCULTA-1'
    ])('la busqueda %s no evade el alcance', async (query) => {
        const response = await get('/api/reservaciones?' + query);
        expect(response.status).toBe(200); expect(response.body).toMatchObject({ total: 0, datos: [] });
    });

    test('filtros permitidos combinados y fechas historicas siguen funcionando', async () => {
        const response = await get('/api/reservaciones?codigo=VISIBLE-1&nombre=visible&fecha_desde=2019-01-01&fecha_hasta=2020-12-31&id_tour=501&id_plataforma=17&estado=Pendiente&turno=Ma%C3%B1ana');
        expect(response.status).toBe(200); expect(response.body.total).toBe(1);
        expect(response.body.datos[0].id_reservacion).toBe(1);
    });

    test.each(['platform_ids=99', 'all=true', 'scope=all'])('permisos enviados en query %s se rechazan', async (query) => {
        const response = await get('/api/reservaciones?' + query);
        expect(response.status).toBe(400); expect(queriesReservaciones()).toHaveLength(0);
    });

    test('ID oculto e inexistente producen exactamente el mismo 404', async () => {
        const hidden = await get('/api/reservaciones/101');
        const absent = await get('/api/reservaciones/9999');
        expect(hidden.status).toBe(404); expect(absent.status).toBe(404);
        expect(hidden.body).toEqual(absent.body);
        const visible = await get('/api/reservaciones/1');
        expect(visible.status).toBe(200); expect(visible.body.datos.id_reservacion).toBe(1);
    });

    test('paginacion, count y resumen de tours usan solo el conjunto autorizado antes de LIMIT', async () => {
        const first = await get('/api/reservaciones?page=1&limit=25&include_resumen_tours=1');
        const second = await get('/api/reservaciones?page=2&limit=25&include_resumen_tours=1');
        expect(first.status).toBe(200); expect(second.status).toBe(200);
        expect(first.body.pagination).toMatchObject({ total: 30, totalPages: 2 });
        expect(first.body.data).toHaveLength(25); expect(second.body.data).toHaveLength(5);
        expect(first.body.meta.resumen_tours).toEqual(expect.arrayContaining([{ id_tour: 501, tour: 'Tour A', total: 15 }, { id_tour: 502, tour: 'Tour B', total: 15 }]));
        expect(first.body.meta.resumen_tours.some((group) => group.id_tour === 503)).toBe(false);
        expect([...first.body.data, ...second.body.data].every((row) => IDS_PERMITIDOS.includes(row.id_plataforma))).toBe(true);
        expect(queriesAlcance()).toHaveLength(2);
        for (const [sql, values] of queriesReservaciones()) {
            expect(sql).toContain('r.id_plataforma = ANY($1::int[])');
            expect(values[0]).toEqual(IDS_PERMITIDOS);
            if (sql.includes('LIMIT')) expect(sql.indexOf('ANY')).toBeLessThan(sql.indexOf('LIMIT'));
        }
    });

    test('una pagina fuera de rango conserva solo el total autorizado', async () => {
        const response = await get('/api/reservaciones?page=3&limit=25');
        expect(response.status).toBe(200); expect(response.body.data).toEqual([]);
        expect(response.body.pagination).toMatchObject({ total: 30, totalPages: 2 });
    });

    test.each([3, 4])('Dashboard restringido de usuario %s devuelve vista parcial sin consultas operativas', async (id) => {
        const response = await get('/api/dashboard/resumen?fecha=' + FECHA, id);
        expect(response.status).toBe(200);
        expect(response.body.alcance_parcial).toBe(true);
        expect(response.body.metricas).toEqual(id === 3 ? { reservaciones_vigentes: 28, pax_vigentes: 56 } : { reservaciones_vigentes: 0, pax_vigentes: 0 });
        expect(response.body.alertas).toEqual({}); expect(response.body.salidas_hoy).toEqual([]);
        expect(response.body.reservaciones_recientes).toHaveLength(id === 3 ? 10 : 0);
        expect(response.body.reservaciones_recientes.every((row) => IDS_PERMITIDOS.includes(row.id_plataforma))).toBe(true);
        expect(JSON.stringify(response.body)).not.toMatch(/ocult|privado|NOTA GLOBAL/);
        expect(operacionesService.obtenerOperacionesSugeridas).not.toHaveBeenCalled();
        expect(pool.query.mock.calls.some(([sql]) => /FROM operaciones_tour/.test(sql))).toBe(false);
        expect(queriesAlcance()).toHaveLength(1);
    });

    test.each(['/api/tours', '/api/paises', '/api/plataformas'])('catalogo indispensable %s sigue permitido', async (url) => {
        const response = await get(url);
        expect(response.status).toBe(200);
        if (url === '/api/plataformas') expect(response.body.datos).toEqual(PLATAFORMAS.slice(0, 2));
    });

    test('catalogo de plataformas vacio no revela nombres ni conteos globales', async () => {
        const response = await get('/api/plataformas', 4);
        expect(response.status).toBe(200); expect(response.body).toMatchObject({ total: 0, datos: [] });
    });
});

describe('ACCESS-SCOPE-03A: modulos y escrituras', () => {
    test.each([...LECTURAS_OPERATIVAS, '/api/usuarios', '/api/usuarios/roles', '/api/usuarios/7', '/api/bitacora'])('Consulta selected recibe 403 en %s', async (url) => {
        const response = await get(url);
        expect(response.status).toBe(403); expect(queriesReservaciones()).toHaveLength(0);
    });

    test.each(LECTURAS_OPERATIVAS)('Administrador y Consulta all conservan lectura de %s', async (url) => {
        expect((await get(url, 1)).status).toBe(200);
        expect((await get(url, 2)).status).toBe(200);
    });

    test.each(['/api/usuarios', '/api/bitacora'])('Consulta all conserva prohibicion existente de %s', async (url) => {
        expect((await get(url, 2)).status).toBe(403);
        expect((await get(url, 1)).status).toBe(200);
    });

    test.each([
        ['post', '/api/reservaciones'], ['patch', '/api/reservaciones/1'],
        ['patch', '/api/reservaciones/1/cancelar'], ['patch', '/api/reservaciones/1/transporte'],
        ['put', '/api/daily/observaciones?fecha=' + FECHA], ['post', '/api/operaciones'],
        ['patch', '/api/operaciones/7'], ['post', '/api/transportes'], ['patch', '/api/transportes/7'],
        ['post', '/api/eventos-integracion/7/aplicar'], ['patch', '/api/eventos-integracion/7/revision'],
        ['post', '/api/usuarios'], ['patch', '/api/usuarios/7'], ['patch', '/api/usuarios/7/password'],
        ['post', '/api/plataformas'], ['post', '/api/tours'], ['post', '/api/paises']
    ])('Consulta selected no puede escribir mediante %s %s', async (method, url) => {
        const response = await request(app)[method](url).set('Authorization', 'Bearer ' + token()).send({});
        expect(response.status).toBe(403); expect(pool.connect).not.toHaveBeenCalled();
        expect(queriesAlcance()).toHaveLength(0);
    });

    test('Administrador conserva autorizacion de escritura; validacion sigue activa', async () => {
        const response = await request(app).post('/api/reservaciones').set('Authorization', 'Bearer ' + token(1)).send({});
        expect(response.status).toBe(400); expect(queriesAlcance()).toHaveLength(0);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('HEAD tampoco permite leer metadatos de modulos excluidos', async () => {
        expect((await request(app).head('/api/daily?fecha=' + FECHA).set('Authorization', 'Bearer ' + token())).status).toBe(403);
        expect((await request(app).head('/api/reservaciones/101').set('Authorization', 'Bearer ' + token())).status).toBe(404);
    });

    test('parametros de pantalla y headers no habilitan un modulo excluido', async () => {
        const response = await get('/api/daily?fecha=' + FECHA + '&scope=all').set('Referer', '/app/#/reservaciones').set('X-Scope', 'all');
        expect(response.status).toBe(403);
    });
});

describe('ACCESS-SCOPE-03A: denegacion segura y cambios entre solicitudes', () => {
    test.each([1, 2, 3])('fallo de PostgreSQL al resolver alcance bloquea usuario %s', async (id) => {
        fallarPermisos = true;
        const response = await get('/api/reservaciones', id);
        expect(response.status).toBe(500); expect(response.body).toEqual({ mensaje: 'Error al resolver permisos' });
        expect(queriesReservaciones()).toHaveLength(0);
    });

    test('rol y alcance cambian aunque se reutilice el mismo token', async () => {
        expect((await get('/api/daily?fecha=' + FECHA)).status).toBe(403);
        usuarios[3].alcance_plataformas = 'all';
        expect((await get('/api/daily?fecha=' + FECHA)).status).toBe(200);
        expect((await get('/api/reservaciones')).body.total).toBe(42);
        usuarios[3].rol = 'Administrador'; usuarios[3].alcance_plataformas = 'selected';
        expect((await get('/api/usuarios')).status).toBe(200);
        usuarios[3].rol = 'Consulta'; usuarios[3].platform_ids = [];
        expect((await get('/api/reservaciones')).body.total).toBe(0);
        expect((await get('/api/usuarios')).status).toBe(403);
        usuarios[3].estado = false;
        expect((await get('/api/reservaciones')).status).toBe(403);
    });

    test('revocar plataformas se reconoce en la siguiente lectura de detalle', async () => {
        expect((await get('/api/reservaciones/1')).status).toBe(200);
        usuarios[3].platform_ids = [83];
        expect((await get('/api/reservaciones/1')).status).toBe(404);
    });

    test('usuario inexistente, rol desconocido y ausencia de modo nunca conceden all', async () => {
        expect((await get('/api/reservaciones', 999)).status).toBe(401);
        usuarios[3].rol = 'Desconocido';
        expect((await get('/api/reservaciones')).status).toBe(403);
        usuarios[3].rol = 'Consulta'; delete usuarios[3].alcance_plataformas;
        expect((await get('/api/reservaciones')).status).toBe(403);
    });

    test('sin autenticacion no se consultan permisos ni reservaciones', async () => {
        expect((await request(app).get('/api/reservaciones')).status).toBe(401);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('los servicios publicos rechazan un alcance ausente antes de consultar DB', async () => {
        await expect(reservacionesService.obtenerReservaciones({})).rejects.toMatchObject({ statusCode: 403 });
        await expect(reservacionesService.obtenerReservacionesPaginadas({}, { page: 1, limit: 25 }, { incluirResumenTours: true })).rejects.toMatchObject({ statusCode: 403 });
        await expect(reservacionesService.obtenerReservacionPorId(1)).rejects.toMatchObject({ statusCode: 403 });
        await expect(dashboardService.obtenerResumenDashboard(FECHA)).rejects.toMatchObject({ statusCode: 403 });
        await expect(plataformasService.obtenerPlataformas()).rejects.toMatchObject({ statusCode: 403 });
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('el constructor SQL no acepta columnas arbitrarias ni alcance mal formado', () => {
        expect(() => construirFiltroAlcanceReservaciones({ all: true }, 'id_plataforma OR true', [])).toThrow();
        expect(() => construirFiltroAlcanceReservaciones({ all: 'true' }, 'id_plataforma', [])).toThrow();
        expect(() => construirFiltroAlcanceReservaciones({ all: false }, 'id_plataforma', [])).toThrow();
    });

    test('el alcance se resuelve una vez aunque se encadenen autorizaciones en la solicitud', async () => {
        const duplicateApp = express();
        const router = express.Router();
        router.get('/', autenticarUsuario, autorizarRoles('Administrador', 'Consulta'), autorizarRoles('Administrador', 'Consulta'), (_req, res) => res.json({ ok: true }));
        duplicateApp.use('/api/reservaciones', router);
        const response = await request(duplicateApp).get('/api/reservaciones').set('Authorization', 'Bearer ' + token());
        expect(response.status).toBe(200); expect(queriesAlcance()).toHaveLength(1);
    });
});
