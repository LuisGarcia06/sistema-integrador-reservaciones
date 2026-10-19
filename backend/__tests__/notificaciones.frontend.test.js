const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/js/notificaciones.js'), 'utf8');
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const snapshot = (ids = [1], environment = 'a'.repeat(24)) => ({ environment_id: environment, generated_at: new Date().toISOString(), counts: { pending: ids.length, actionable: ids.length, requires_archive: 0, requires_schedule_review: 0 }, events: ids.map(id => ({ id_evento_integracion: id, provider: id % 2 ? 'getyourguide' : 'fareharbor', event_type: 'new_booking', review_status: 'pending_review', attention: 'actionable' })) });
function profile() {
    const data = new Map(), contexts = [], queues = new Map(), channels = [];
    const locks = { request(name, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        return new Promise((resolve, reject) => {
            const q = queues.get(name) || []; queues.set(name, q);
            const task = { running: false, run() {
                task.running = true;
                Promise.resolve().then(() => cb({ name })).then(resolve, reject).finally(() => { q.shift(); if (q[0]) q[0].run(); });
            } };
            const abort = () => { if (!task.running) { const i = q.indexOf(task); if (i >= 0) q.splice(i, 1); reject(Object.assign(Error('Aborted'), { name: 'AbortError' })); } };
            if (opts.signal?.aborted) return abort();
            opts.signal?.addEventListener('abort', abort, { once: true });
            q.push(task); if (q.length === 1) task.run();
        });
    } };
    class Channel {
        constructor(name) { this.name = name; channels.push(this); }
        postMessage(message) { channels.filter(c => c !== this && c.name === this.name).forEach(c => Promise.resolve().then(() => c.onmessage?.({ data: JSON.parse(JSON.stringify(message)) }))); }
        close() { const i = channels.indexOf(this); if (i >= 0) channels.splice(i, 1); }
    }
    return { data, contexts, locks, Channel };
}
function windowContext(p, api, options = {}) {
    const handlers = new Map(); let actor = { id_usuario: options.id || 1, rol: 'Administrador', alcance_plataformas: options.scope || 'all' };
    const win = { addEventListener(name, fn) { const q = handlers.get(name) || []; q.push(fn); handlers.set(name, q); }, dispatchEvent(e) { (handlers.get(e.type) || []).forEach(fn => fn(e)); }, setTimeout, clearTimeout, location: { hash: '#/reservaciones' }, BroadcastChannel: p.Channel };
    const live = { textContent: '' };
    const doc = { hidden: options.hidden || false, getElementById(id) { return id === 'notification-live' ? live : null; }, addEventListener: win.addEventListener };
    const auth = { estaAutenticado: () => Boolean(actor), esConsultaRestringida: () => actor?.alcance_plataformas === 'selected', obtenerUsuario: () => actor, refrescarSesion: jest.fn(async () => actor) };
    const App = { auth, api: { apiFetch: api }, pages: { dashboard: {} }, router: {}, ui: {} }; win.App = App;
    const localStorage = { getItem: k => p.data.get(k) || null, setItem(k, v) { p.data.set(k, v); p.contexts.filter(c => c.win !== win).forEach(c => c.win.dispatchEvent({ type: 'storage', key: k })); } };
    vm.runInNewContext(source, { window: win, document: doc, navigator: { locks: p.locks }, BroadcastChannel: p.Channel, localStorage, AbortController, Event, Date, console });
    const context = { win, doc, App, live, change(value) { App.notificaciones.resetSession(); actor = value; if (actor) App.notificaciones.start(); }, cleanup() { App.notificaciones.resetSession(); } };
    p.contexts.push(context); return context;
}
let contexts;
beforeEach(() => { jest.useFakeTimers(); contexts = []; });
afterEach(async () => { contexts.forEach(c => c.cleanup()); await tick(); jest.useRealTimers(); });
function create(p, api, opts) { const c = windowContext(p, api, opts); contexts.push(c); c.App.notificaciones.start(); return c; }

test('primer acceso resume 73 históricos; vistos separados y polling único de 60 segundos', async () => {
    const p = profile(), api = jest.fn(async () => ({ datos: snapshot(Array.from({ length: 73 }, (_, i) => i + 1)) }));
    const c = create(p, api); await tick(); expect(api).toHaveBeenCalledTimes(1);
    expect(c.App.notificaciones.obtenerResumen().counts.pending).toBe(73);
    const key = [...p.data.keys()][0]; expect(JSON.parse(p.data.get(key)).announced).toHaveLength(73);
    await c.App.notificaciones.markSeen(7); expect(JSON.parse(p.data.get(key)).seen.map(p => p[0])).toEqual([7]);
    c.App.notificaciones.start(); c.App.notificaciones.start();
    await jest.advanceTimersByTimeAsync(59000); expect(api).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000); expect(api).toHaveBeenCalledTimes(2);
    expect(JSON.parse(p.data.get(key)).announced).toHaveLength(73);
});
test('error conserva datos y aplica backoff, recuperación vuelve al intervalo normal', async () => {
    let fail = false; const api = jest.fn(async () => { if (fail) throw Error('offline'); return { datos: snapshot() }; });
    const c = create(profile(), api); await tick(); fail = true; await c.App.notificaciones.refresh();
    expect(c.App.notificaciones.obtenerResumen().counts.pending).toBe(1);
    await jest.advanceTimersByTimeAsync(119000); expect(api).toHaveBeenCalledTimes(2);
    fail = false; await jest.advanceTimersByTimeAsync(1000); expect(api).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(60000); expect(api).toHaveBeenCalledTimes(4);
});
test('sin solicitudes simultáneas, pausa oculta y actualización al recuperar foco', async () => {
    let resolve; const api = jest.fn(() => new Promise(r => { resolve = r; }));
    const c = create(profile(), api); await tick(); c.App.notificaciones.refresh(); c.App.notificaciones.refresh(); expect(api).toHaveBeenCalledTimes(1);
    c.doc.hidden = true; c.win.dispatchEvent({ type: 'visibilitychange' });
    resolve({ datos: snapshot() }); await tick(); expect(c.App.notificaciones.obtenerResumen()).toBe(null);
    await jest.advanceTimersByTimeAsync(180000); expect(api).toHaveBeenCalledTimes(1);
    c.doc.hidden = false; c.win.dispatchEvent({ type: 'focus' }); await tick(); expect(api).toHaveBeenCalledTimes(2);
    resolve({ datos: snapshot() }); await tick(); expect(c.App.notificaciones.obtenerResumen().counts.pending).toBe(1);
});
test('salida y cambio de usuario descartan respuestas tardías y separan vistos', async () => {
    const p = profile(); let resolve; const api = jest.fn(() => new Promise(r => { resolve = r; }));
    const c = create(p, api); await tick(); c.change(null); resolve({ datos: snapshot() }); await tick();
    expect(c.App.notificaciones.obtenerResumen()).toBe(null); expect(p.data.size).toBe(0);
    c.change({ id_usuario: 2, rol: 'Consulta', alcance_plataformas: 'all' }); await tick(); resolve({ datos: snapshot() }); await tick();
    expect([...p.data.keys()][0]).toMatch(/\.2$/); await c.App.notificaciones.markSeen(1);
    c.change({ id_usuario: 3, rol: 'Administrador', alcance_plataformas: 'all' }); await tick(); resolve({ datos: snapshot() }); await tick();
    expect(JSON.parse(p.data.get([...p.data.keys()].find(k => k.endsWith('.3')))).seen).toEqual([]);
});
test('Consulta selected y revocación no consultan ni conservan resumen', async () => {
    const api = jest.fn(async () => ({ datos: snapshot() })); const c = create(profile(), api, { scope: 'selected' });
    await tick(); expect(api).not.toHaveBeenCalled();
    c.change({ id_usuario: 1, rol: 'Consulta', alcance_plataformas: 'all' }); await tick(); expect(api).toHaveBeenCalledTimes(1);
    c.change({ id_usuario: 1, rol: 'Consulta', alcance_plataformas: 'selected' }); await jest.advanceTimersByTimeAsync(180000);
    expect(c.App.notificaciones.obtenerResumen()).toBe(null); expect(api).toHaveBeenCalledTimes(1);
});
test('dos ventanas comparten un líder, un sondeo y vistos; otra asume al ocultar líder', async () => {
    const p = profile(), api = jest.fn(async () => ({ datos: snapshot([1, 2]) }));
    const a = create(p, api); await tick(); const b = create(p, api); await tick();
    expect(api).toHaveBeenCalledTimes(1); expect(b.App.notificaciones.obtenerResumen().counts.pending).toBe(2);
    await b.App.notificaciones.markSeen(2); expect(JSON.parse([...p.data.values()][0]).seen.map(p => p[0])).toEqual([2]);
    await jest.advanceTimersByTimeAsync(60000); expect(api).toHaveBeenCalledTimes(2);
    a.doc.hidden = true; a.win.dispatchEvent({ type: 'visibilitychange' }); await tick(); expect(api).toHaveBeenCalledTimes(3);
});
test('ambientes distintos y reapertura no mezclan vistos; solo guarda IDs/metadatos limitados', async () => {
    const p = profile(); let environment = 'a'.repeat(24);
    const api = jest.fn(async () => ({ datos: snapshot([1, 2], environment) })); const a = create(p, api); await tick(); await a.App.notificaciones.markSeen(2);
    a.cleanup(); await tick(); const b = create(p, api); await tick(); expect(JSON.parse(p.data.get([...p.data.keys()][0])).seen[0][0]).toBe(2);
    environment = 'b'.repeat(24); await b.App.notificaciones.refresh();
    expect(JSON.parse(p.data.get([...p.data.keys()].find(k => k.includes(environment)))).seen).toEqual([]);
    const values = [...p.data.values()].join(''); expect(values).not.toMatch(/token|provider|customer|nombre|phone|payload|precio/);
});
test('almacenamiento acotado para 3200 históricos; no repite avisos de entradas compactadas', async () => {
    const p = profile(), ids = Array.from({ length: 3200 }, (_, i) => i + 1), api = jest.fn(async () => ({ datos: snapshot(ids) }));
    const c = create(p, api); await tick(); await c.App.notificaciones.refresh();
    await jest.advanceTimersByTimeAsync(60000);
    const state = JSON.parse([...p.data.values()][0]); expect(state.announced).toHaveLength(3000); expect(state.floor).toBe(200);
    expect(state.seen).toEqual([]); expect(c.App.notificaciones.obtenerResumen().counts.pending).toBe(3200);
});
test('nuevo FH avisa una vez; refrescar y reabrir no repite ni marca visto', async () => {
    const p = profile(), ids = [1], api = jest.fn(async () => ({ datos: snapshot(ids) }));
    const a = create(p, api); await tick(); expect(a.live.textContent).toBe('');
    ids.push(2); await a.App.notificaciones.refresh(); expect(a.live.textContent).toContain('FareHarbor');
    await jest.advanceTimersByTimeAsync(8000); expect(a.live.textContent).toBe('');
    await a.App.notificaciones.refresh(); expect(a.live.textContent).toBe('');
    a.cleanup(); await tick(); const b = create(p, api); await tick(); expect(b.live.textContent).toBe('');
    const state = JSON.parse([...p.data.values()][0]); expect(state.seen).toEqual([]); expect(state.announced.map(p => p[0]).sort()).toEqual([1, 2]);
});
test('detalle abierto antes del primer resumen y nuevo ID todavía no listado conservan visto', async () => {
    const p = profile(); let resolve; const api = jest.fn(() => new Promise(r => { resolve = r; }));
    const c = create(p, api); await tick(); await c.App.notificaciones.markSeen(1);
    resolve({ datos: snapshot() }); await tick();
    await c.App.notificaciones.markSeen(9);
    expect(JSON.parse([...p.data.values()][0]).seen.map(p => p[0]).sort()).toEqual([1, 9]);
    c.change(null); expect(c.App.notificaciones.obtenerResumen()).toBe(null);
});
