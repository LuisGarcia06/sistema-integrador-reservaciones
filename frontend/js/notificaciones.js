(function () {
  const App = window.App = window.App || {};
  const INTERVAL = 60000, MAX_RECORDS = 3000, RETENTION = 180 * 86400000;
  const PROVIDERS = { getyourguide: 'GetYourGuide', fareharbor: 'FareHarbor' };
  const TYPES = { new_booking: 'Alta', modification: 'Modificación', cancellation: 'Cancelación' };
  let userId = null, epoch = 0, leaderEpoch = 0, timer = null, timeout = null, toastTimer = null;
  let request = null, controller = null, lockAbort = null, releaseLeader = null, channel = null;
  let leader = false, summary = null, error = '', failures = 0, opened = false, page = 1;
  let storageKey = '', records = null, storageWarning = false, toast = '', target = null;
  const deferredSeen = new Set();

  function allowed() { return Boolean(App.auth && App.auth.estaAutenticado() && !App.auth.esConsultaRestringida()); }
  function current(id, revision) { return allowed() && userId === id && epoch === revision; }
  function emptyRecords() { return { version: 1, initialized: false, floor: 0, seen: [], announced: [] }; }
  function readRecords() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!value) return records || emptyRecords();
      if (value.version !== 1 || !Array.isArray(value.seen) || !Array.isArray(value.announced)) return emptyRecords();
      const valid = pairs => pairs.filter(p => Array.isArray(p) && Number.isSafeInteger(p[0]) && p[0] > 0
        && Number.isFinite(p[1]) && p[1] > Date.now() - RETENTION).slice(-MAX_RECORDS);
      const expired = value.announced.filter(p => Array.isArray(p) && Number.isSafeInteger(p[0]) && p[1] <= Date.now() - RETENTION);
      return { version: 1, initialized: value.initialized === true, floor: Math.max(Number(value.floor) || 0, ...expired.map(p => p[0])),
        seen: valid(value.seen), announced: valid(value.announced) };
    } catch (_) { storageWarning = true; return records || emptyRecords(); }
  }
  function compact(value) {
    for (const key of ['seen', 'announced']) {
      const sorted = value[key].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const removed = sorted.splice(0, Math.max(0, sorted.length - MAX_RECORDS));
      if (key === 'announced' && removed.length) value.floor = Math.max(value.floor, ...removed.map(p => p[0]));
    }
    return value;
  }
  function persist(value) {
    records = compact(value);
    try { localStorage.setItem(storageKey, JSON.stringify(records)); }
    catch (_) { storageWarning = true; }
  }
  function isValid(value) {
    return value && /^[a-f0-9]{24}$/.test(value.environment_id) && Array.isArray(value.events)
      && value.counts && ['pending','actionable','requires_archive','requires_schedule_review'].every(k => Number.isSafeInteger(value.counts[k]) && value.counts[k] >= 0)
      && value.counts.pending === value.events.length && new Set(value.events.map(e => e.id_evento_integracion)).size === value.events.length
      && value.counts.pending === value.counts.actionable + value.counts.requires_archive + value.counts.requires_schedule_review
      && value.events.every(e => Number.isSafeInteger(e.id_evento_integracion) && e.id_evento_integracion > 0
        && PROVIDERS[e.provider] && TYPES[e.event_type] && ['pending_review', 'approved'].includes(e.review_status)
        && ['actionable', 'requires_archive', 'requires_schedule_review'].includes(e.attention));
  }
  function publish(type, data) { if (channel) channel.postMessage({ type: type, data: data }); }
  async function accept(value, announce) {
    if (!allowed() || !isValid(value)) throw Error('Resumen inválido');
    const revision = epoch, actor = userId;
    summary = value; error = ''; failures = 0;
    const key = 'ctsk.notifications.v1.' + value.environment_id + '.' + userId;
    if (key !== storageKey) { storageKey = key; records = null; page = 1; }
    await navigator.locks.request(storageKey + '.records', async function () {
      if (!current(actor, revision) || key !== storageKey) return;
      const value = readRecords(), known = new Set(value.announced.map(p => p[0]));
      const hasDeferred = deferredSeen.size > 0;
      deferredSeen.forEach(id => { if (!value.seen.some(p => p[0] === id)) value.seen.push([id, Date.now()]); });
      deferredSeen.clear();
      const seen = new Set(value.seen.map(p => p[0]));
      const incoming = summary.events.filter(e => !known.has(e.id_evento_integracion)
        && e.id_evento_integracion > value.floor && !seen.has(e.id_evento_integracion));
      const first = !value.initialized;
      if (announce || first) {
        summary.events.forEach(e => { if (!known.has(e.id_evento_integracion) && e.id_evento_integracion > value.floor) value.announced.push([e.id_evento_integracion, Date.now()]); });
        value.initialized = true; persist(value);
      } else if (hasDeferred) persist(value);
      else records = value;
      if (announce && !first && incoming.length) {
        const names = Array.from(new Set(incoming.map(e => PROVIDERS[e.provider]))).join(' y ');
        toast = incoming.length + (incoming.length === 1 ? ' evento nuevo · ' : ' eventos nuevos · ') + names;
        window.clearTimeout(toastTimer); toastTimer = window.setTimeout(function () { toast = ''; render(); }, 8000);
      }
    });
    if (!current(actor, revision)) return;
    render(); window.dispatchEvent(new Event('integracionesactualizadas'));
  }
  function schedule() {
    window.clearTimeout(timer);
    if (leader && allowed() && !document.hidden) timer = window.setTimeout(refresh, Math.min(INTERVAL * Math.pow(2, failures), 300000));
  }
  function refresh() {
    if (!allowed() || document.hidden) return Promise.resolve();
    if (!leader) { publish('refresh'); return Promise.resolve(); }
    if (request) return request;
    window.clearTimeout(timer);
    const revision = epoch, ownership = leaderEpoch, actor = userId;
    controller = new AbortController();
    const activeController = controller;
    timeout = window.setTimeout(function () { activeController.abort(); }, 15000);
    request = (async function () {
      try {
        const response = await App.api.apiFetch('/api/eventos-integracion/resumen', { signal: activeController.signal });
        if (!current(actor, revision) || ownership !== leaderEpoch || document.hidden) return;
        await accept(response.datos, true);
        if (current(actor, revision) && ownership === leaderEpoch) publish('summary', summary);
      } catch (e) {
        if (!current(actor, revision) || ownership !== leaderEpoch || document.hidden) return;
        if (e.status === 403) {
          // Fallo cerrado: nada del resumen anterior permanece visible.
          resetSession(); App.auth.refrescarSesion().catch(function () {}); return;
        }
        failures += 1; error = 'No se pudo actualizar. Se conserva la última consulta.';
        render(); publish('error');
      } finally {
        if (revision === epoch && ownership === leaderEpoch) {
          window.clearTimeout(timeout); timeout = null; request = null; controller = null; schedule();
        }
      }
    })();
    return request;
  }
  function pause() {
    leaderEpoch += 1;
    window.clearTimeout(timer); window.clearTimeout(timeout); timer = timeout = null;
    if (controller) controller.abort(); controller = null; request = null;
    if (lockAbort) lockAbort.abort(); lockAbort = null;
    if (releaseLeader) releaseLeader(); releaseLeader = null; leader = false;
  }
  function join() {
    if (!allowed() || document.hidden || lockAbort) return;
    if (!navigator.locks || !window.BroadcastChannel) { error = 'La coordinación de avisos no está disponible.'; render(); return; }
    const revision = epoch, actor = userId;
    lockAbort = new AbortController();
    publish('snapshot');
    navigator.locks.request('ctsk.notifications.leader.' + userId, { signal: lockAbort.signal }, async function () {
      if (!current(actor, revision) || document.hidden) return;
      leader = true;
      const held = new Promise(resolve => { releaseLeader = resolve; });
      await refresh(); await held;
    }).catch(function (e) { if (e.name !== 'AbortError' && current(actor, revision)) { error = 'No fue posible coordinar los avisos.'; render(); } });
  }
  function resetSession() {
    epoch += 1; pause();
    if (channel) channel.close(); channel = null;
    window.clearTimeout(toastTimer); toastTimer = null;
    userId = null; summary = records = null; storageKey = ''; error = toast = ''; target = null;
    deferredSeen.clear();
    failures = 0; opened = false; page = 1; storageWarning = false; render();
  }
  function start() {
    if (!allowed()) { resetSession(); return; }
    const id = App.auth.obtenerUsuario().id_usuario;
    if (userId === id) { render(); join(); return; }
    resetSession(); userId = id;
    if (window.BroadcastChannel) {
      channel = new BroadcastChannel('ctsk.notifications.user.' + id);
      channel.onmessage = async function (message) {
        if (!allowed() || userId !== id || document.hidden) return;
        const msg = message.data || {}, revision = epoch;
        if (msg.type === 'refresh' && leader) refresh();
        if (msg.type === 'snapshot' && leader && summary) publish('summary', summary);
        if (msg.type === 'error') { error = 'No se pudo actualizar. Se conserva la última consulta.'; render(); }
        if (msg.type === 'summary' && !leader && isValid(msg.data)) {
          try { await App.auth.refrescarSesion(); if (current(id, revision)) await accept(msg.data, false); } catch (_) { /* Sesión invalidada por auth. */ }
        }
      };
    }
    render(); join();
  }
  function unseen() { const seen = new Set((records && records.seen || []).map(p => p[0])); return summary ? summary.events.filter(e => !seen.has(e.id_evento_integracion)).length : null; }
  function status(event) {
    if (event.attention === 'requires_archive') return 'Actividad iniciada · Requiere archivo';
    if (event.attention === 'requires_schedule_review') return 'Revisar horario';
    return event.review_status === 'approved' ? 'Aprobado · Sin aplicar' : 'Pendiente de revisión';
  }
  function render() {
    const live = document.getElementById('notification-live');
    const announcement = allowed() && userId !== null ? toast : '';
    if (live && live.textContent !== announcement) live.textContent = announcement;
    const host = document.getElementById('notificaciones-root');
    if (!host) return;
    if (!allowed() || userId === null) { host.innerHTML = ''; return; }
    const escape = App.ui.escapeHtml, count = unseen();
    const previousFocus = host.contains(document.activeElement) ? document.activeElement.id : '';
    const seen = new Set((records && records.seen || []).map(p => p[0]));
    const events = summary ? summary.events : [], pages = Math.max(1, Math.ceil(events.length / 10));
    page = Math.min(page, pages);
    host.innerHTML = '<button class="btn btn-ghost notification-trigger" id="notification-toggle" type="button" aria-haspopup="dialog" aria-controls="notification-panel" aria-expanded="' + opened + '" aria-label="Avisos: ' + (count === null ? 'por consultar' : count + ' eventos nuevos sin ver') + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg> Avisos <span class="notification-badge">' + (count === null ? '—' : count) + '</span></button>'
      + (opened ? '<section id="notification-panel" class="notification-panel" role="dialog" aria-labelledby="notification-title"><div class="notification-heading"><h2 id="notification-title">Reservaciones externas</h2><button id="notification-close" class="btn btn-ghost" type="button" aria-label="Cerrar avisos">Cerrar</button></div>'
        + '<p class="notification-totals">' + (summary ? summary.counts.pending + ' pendientes · ' + count + ' sin ver' : 'Consultando pendientes…') + '</p>'
        + '<button id="notification-center" class="btn btn-primary" type="button">Abrir Centro de Avisos</button>'
        + (summary ? '<p class="notification-help">' + summary.counts.actionable + ' accionables · ' + summary.counts.requires_archive + ' requieren archivo' + (summary.counts.requires_schedule_review ? ' · ' + summary.counts.requires_schedule_review + ' horarios por revisar' : '') + '</p>' : '')
        + (error ? '<p class="notification-error" role="status">' + escape(error) + '</p>' : '')
        + (storageWarning ? '<p class="notification-error">Historial local no disponible; los vistos se conservan solo en esta sesión.</p>' : '')
        + '<div class="notification-list">' + (events.length ? events.slice((page - 1) * 10, page * 10).map(e => '<button type="button" class="notification-item" id="notification-event-' + e.id_evento_integracion + '" data-notification-event="' + e.id_evento_integracion + '"><span><strong>' + PROVIDERS[e.provider] + ' · ' + TYPES[e.event_type] + '</strong><small>' + status(e) + '</small><small>Evento #' + e.id_evento_integracion + '</small></span><span class="notification-read">' + (seen.has(e.id_evento_integracion) ? 'Visto' : 'Sin ver') + '</span></button>').join('')
          : '<p class="notification-empty">' + (summary ? 'Sin pendientes ni novedades.' : 'Esperando la consulta del sistema.') + '</p>') + '</div>'
        + '<div class="notification-footer"><button id="notification-refresh" class="btn btn-ghost" type="button">Actualizar</button><small>' + (summary ? 'Última consulta: ' + escape(new Date(summary.generated_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })) : 'Sin consulta confirmada') + '</small></div>'
        + (pages > 1 ? '<div class="notification-footer"><button id="notification-prev" class="btn btn-ghost"' + (page === 1 ? ' disabled' : '') + '>Anterior</button><small>Página ' + page + ' de ' + pages + '</small><button id="notification-next" class="btn btn-ghost"' + (page === pages ? ' disabled' : '') + '>Siguiente</button></div>' : '') + '</section>' : '')
      ;
    host.querySelector('#notification-toggle').onclick = function () { opened = !opened; render(); document.getElementById(opened ? 'notification-close' : 'notification-toggle').focus(); };
    if (opened) {
      const panel = host.querySelector('#notification-panel'), anchor = host.querySelector('#notification-toggle').getBoundingClientRect();
      const top = Math.min(anchor.bottom + 8, window.innerHeight - 160);
      panel.style.position = 'fixed'; panel.style.top = top + 'px'; panel.style.left = Math.max(12, Math.min(anchor.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 12)) + 'px';
      panel.style.right = 'auto'; panel.style.maxHeight = (window.innerHeight - top - 16) + 'px';
      host.querySelector('#notification-close').onclick = close;
      host.querySelector('#notification-refresh').onclick = refresh;
      host.querySelector('#notification-center').onclick = function () {
        opened = false; render();
        if (window.location.hash === '#/dashboard') document.getElementById('dashboard-integration-section')?.scrollIntoView({ behavior: 'smooth' });
        else App.router.navigate('dashboard');
      };
      host.querySelectorAll('[data-notification-event]').forEach(button => { button.onclick = function () { openEvent(Number(button.dataset.notificationEvent)); }; });
      const prev = host.querySelector('#notification-prev'), next = host.querySelector('#notification-next');
      if (prev) prev.onclick = function () { page -= 1; render(); };
      if (next) next.onclick = function () { page += 1; render(); };
    }
    if (previousFocus && document.getElementById(previousFocus)) document.getElementById(previousFocus).focus({ preventScroll: true });
  }
  function close() { opened = false; render(); document.getElementById('notification-toggle')?.focus(); }
  async function openEvent(id) {
    if (!allowed()) return;
    const actor = userId, revision = epoch;
    try {
      await App.auth.refrescarSesion();
      if (!current(actor, revision)) return;
      target = { id: id, actor: actor, revision: revision }; opened = false; render();
      if (window.location.hash === '#/dashboard') onRouteRendered('dashboard');
      else App.router.navigate('dashboard');
    } catch (_) { /* Auth limpia los datos al fallar la verificación. */ }
  }
  function onRouteRendered(route) {
    if (route !== 'dashboard' || !target || !current(target.actor, target.revision)) return;
    const id = target.id; target = null;
    App.pages.dashboard.openNotificationEvent(id);
  }
  async function markSeen(id) {
    id = Number(id);
    if (!allowed() || !Number.isSafeInteger(id) || id <= 0) return;
    // El llamador solo llega aquí tras mostrar un detalle fresco y pendiente.
    if (!storageKey) { if (deferredSeen.size < MAX_RECORDS) deferredSeen.add(id); return; }
    const revision = epoch, actor = userId, key = storageKey;
    await navigator.locks.request(key + '.records', function () {
      if (!current(actor, revision) || key !== storageKey) return;
      const value = readRecords(); value.seen = value.seen.filter(p => p[0] !== Number(id));
      value.seen.push([Number(id), Date.now()]); persist(value); render();
    });
  }
  window.addEventListener('permisosactualizados', start);
  window.addEventListener('focus', function () { if (allowed()) { start(); refresh(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (allowed()) { start(); refresh(); } });
  window.addEventListener('storage', function (e) { if (e.key === storageKey && allowed()) { records = readRecords(); render(); } });
  window.addEventListener('resize', function () { if (opened) window.requestAnimationFrame(function () { if (opened) render(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && opened) close(); });
  window.addEventListener('pagehide', resetSession);
  App.notificaciones = { start: start, resetSession: resetSession, render: render, refresh: refresh,
    markSeen: markSeen, onRouteRendered: onRouteRendered, obtenerResumen: function () { return summary; } };
})();
