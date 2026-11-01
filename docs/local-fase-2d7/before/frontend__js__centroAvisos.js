(function () {
  const App = window.App = window.App || {};
  const esc = value => App.ui.escapeHtml(value == null ? '' : String(value));
  const types = { new_booking: 'Nueva reservación', modification: 'Modificación', cancellation: 'Cancelación' };
  const statuses = { pending_review: 'Pendiente de revisión', approved: 'Aprobado', dismissed: 'Descartado' };
  let filters = { tab: 'prioritarios', page: 1, limit: 25, archived: 'active', sort:'service' };
  const tabOrders = {prioritarios:'service',pendientes:'newest',historico:'newest'};
  let result = { data: [], pagination: {} }, loading = false, error = '', version = 0;
  let historyVersion = 0, date = '', openEvent, pending = null, notice = '';
  const histories = new Map();
  function select(name, label, options) {
    return '<label class="field"><span>' + label + '</span><select name="' + name + '">' + options.map(([value, text]) => '<option value="' + value + '"' + (String(filters[name] || '') === value ? ' selected' : '') + '>' + text + '</option>').join('') + '</select></label>';
  }
  function render(message) {
    if (message !== undefined) notice = message;
    return '<section class="card stack dashboard-section" id="dashboard-integration-section">' +
      '<div class="card-header"><div><h2>Centro de Avisos</h2><p class="card-text">Revisión manual de reservaciones externas. Los servicios pasados conservan sus eventos y opciones de revisión.</p></div><button class="btn btn-ghost" id="centro-refresh">Actualizar avisos</button></div>' +
      (notice ? '<p class="form-message is-info" role="status">' + esc(notice) + '</p>' : '') + '<div class="centro-tabs" role="group" aria-label="Secciones de avisos">' + [['prioritarios','Prioritarios'],['pendientes','Pendientes'],['historico','Histórico']].map(([id,label]) => '<button type="button" class="btn' + (filters.tab === id ? ' btn-primary' : '') + '" data-centro-tab="' + id + '" aria-pressed="' + (filters.tab === id) + '">' + label + '</button>').join('') + '</div>' +
      '<p class="card-text">Fecha y horarios del tour separados de la recepción. Sin fecha reconocible: consultar Pendientes. Aprobado no significa aplicado.</p>' +
      '<form id="centro-filters" class="centro-filters"><label class="field centro-search"><span>Código o cliente</span><input name="q" maxlength="120" value="' + esc(filters.q) + '" placeholder="Buscar reservación externa"></label>' +
      select('provider','Plataforma',[['','Todas'],['fareharbor','FareHarbor'],['getyourguide','GetYourGuide']]) +
      select('event_type','Tipo',[['','Todos'],...Object.entries(types)]) +
      select('review_status','Revisión',[['','Todos'],...Object.entries(statuses)]) +
      '<label class="field"><span>Servicio desde</span><input type="date" name="from" value="' + esc(filters.from) + '"></label><label class="field"><span>Servicio hasta</span><input type="date" name="to" value="' + esc(filters.to) + '"></label>' +
      select('archived','Archivo',[['active','Sin archivar'],['all','Todos'],['archived','Archivados']]) +
      select('urgent','Urgencia',[['','Todas'],['true','Hoy y mañana'],['false','Otras fechas / sin fecha']]) +
      select('sort','Ordenar por',[['newest','Más recientes primero'],['oldest','Más antiguas primero'],['service','Fecha y hora del tour más próxima']]) +
      select('limit','Grupos por página',[['25','25'],['50','50'],['100','100']]) +
      '<div class="dashboard-actions"><button class="btn btn-primary" type="submit">Buscar</button><button class="btn" id="centro-clear" type="button">Limpiar filtros</button></div></form>' +
      '<div id="centro-results" aria-live="polite">' + renderResults() + '</div></section>';
  }
  function serviceDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Fecha del tour sin determinar';
    return new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  }
  function clock(value) {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) return '';
    const hour=Number(value.slice(0,2));return String(hour%12||12).padStart(2,'0')+value.slice(2,5)+' '+(hour<12?'a. m.':'p. m.');
  }
  function received(value) {
    if (!value) return 'No disponible';
    const d = new Date(value); if (!Number.isFinite(d.getTime())) return 'No disponible';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Cancun',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
    const hour=Number(parts.hour);return parts.day+'/'+parts.month+'/'+parts.year+', '+String(hour%12||12).padStart(2,'0')+':'+parts.minute+':'+parts.second+' '+(hour<12?'a. m.':'p. m.');
  }
  function tourInfo(event) {
    return '<div class="centro-tour"><div class="centro-tour-date"><small>FECHA DEL TOUR</small><strong>'+esc(event.date_conflict?'Fecha por verificar':serviceDate(event.service_date))+'</strong></div>'+
      '<div><small>INICIO / SALIDA DEL TOUR</small><strong>'+esc(clock(event.service_time)||'Hora por confirmar')+'</strong></div>'+
      '<div><small>HORA DE PICKUP</small><strong>'+esc(clock(event.pickup_time)||'Pickup por confirmar')+'</strong></div></div>'+
      (event.date_conflict||event.time_conflict||event.time_unverified||event.pickup_conflict?'<p class="centro-warning">Información por verificar: fechas u horarios incompatibles o no confiables. Consulta el historial.</p>':'')+
      (event.schedule_from_previous?'<small class="centro-schedule-note">Fecha del último evento con datos de servicio válidos; el evento más reciente no aporta fecha válida.</small>':'')+
      (event.chronology_unverified?'<small class="centro-schedule-note">'+(event.provider==='fareharbor'?'Fecha original del cambio externo no disponible; secuencia según recepción del webhook.':'Cronología externa por verificar: falta la fecha original.')+'</small>':'');
  }
  function originalTimestamp(event) {
    if (event.provider==='fareharbor') return '<span>Recepción del webhook: '+esc(received(event.source_received_at))+'</span><span>Fecha original del evento externo: No disponible</span>';
    return '<span>Mensaje / evento externo original: '+esc(received(event.source_received_at))+'</span>';
  }
  function groupCard(g) {
    const labels={today:'HOY',tomorrow:'MAÑANA',upcoming:'PRÓXIMAMENTE'};
    const original=originalTimestamp(g);
    return '<details class="centro-group" data-centro-group="'+g.id_evento_integracion+'"><summary><div class="centro-group-content"><div class="centro-group-heading"><strong>'+esc(g.external_booking_id||'Evento #'+g.id_evento_integracion)+'</strong><span>'+esc(g.provider==='fareharbor'?'FareHarbor':'GetYourGuide')+'</span>'+
      (labels[g.proximity]?'<span class="badge '+(g.proximity==='upcoming'?'badge-neutral':'badge-warning')+'">'+labels[g.proximity]+'</span>':'')+'</div>'+tourInfo(g)+
      '<div class="centro-receipt"><strong>Recibida en el sistema: '+esc(received(g.last_received_at))+'</strong>'+
      (g.event_count>1?'<span>Primera recepción: '+esc(received(g.first_received_at))+'</span>':'')+original+'</div>'+
      '<div class="centro-group-state"><span class="badge badge-neutral">'+esc(types[g.event_type])+'</span><span>'+esc(statuses[g.review_status])+(g.application_status==='applied'?' · Aplicado':' · Sin aplicar')+(g.archived_at?' · Archivado':'')+'</span><span>'+esc(g.event_count)+' eventos · '+esc(g.pendientes)+' pendientes</span>'+
      (g.historical_recovered?'<span class="badge badge-neutral">Incluye mensaje histórico recuperado</span>':'')+'</div></div></summary><div class="centro-history" id="centro-history-'+g.id_evento_integracion+'"></div></details>';
  }
  function renderResults() {
    if (error) return '<p class="form-message is-error">' + esc(error) + '</p>';
    if (loading && !result.data.length) return '<p role="status">Consultando avisos…</p>';
    const pagination = result.pagination;
    return '<p class="card-text">' + esc(pagination.total || 0) + ' reservaciones externas · Página ' + esc(pagination.page || 1) + ' de ' + esc(pagination.totalPages || 1) + (loading ? ' · Actualizando…' : '') + '</p>' +
      (result.data.length ? result.data.map(groupCard).join('') : '<p class="card-text">No hay avisos que coincidan con esta sección y sus filtros.</p>') +
      '<div class="dashboard-actions"><button class="btn" data-centro-page="-1"' + (filters.page <= 1 || loading ? ' disabled' : '') + '>Anterior</button><button class="btn" data-centro-page="1"' + (filters.page >= (pagination.totalPages || 1) || loading ? ' disabled' : '') + '>Siguiente</button></div>';
  }
  function bindResults() {
    document.querySelectorAll('[data-centro-page]').forEach(b => b.addEventListener('click', () => { filters.page += Number(b.dataset.centroPage); load({}); }));
    document.querySelectorAll('[data-centro-group]').forEach(d => d.addEventListener('toggle', () => { if (d.open) loadHistory(d.dataset.centroGroup, histories.get(d.dataset.centroGroup)?.pagination.page || 1); }));
  }
  function paintResults() {
    const host = document.getElementById('centro-results');
    if (!host) return;
    const expanded = Array.from(host.querySelectorAll('details[open]')).map(d => d.dataset.centroGroup);
    host.innerHTML = renderResults(); bindResults();
    for (const id of expanded) { const d = host.querySelector('[data-centro-group="' + id + '"]'); if (d) d.open = true; }
  }
  function bind(options) {
    date = options.date; openEvent = options.openEvent;
    const form = document.getElementById('centro-filters'); if (!form) return;
    form.addEventListener('submit', e => { e.preventDefault(); const next = { tab: filters.tab, page: 1 }; for (const [k,v] of new FormData(form)) if (v) next[k] = v; filters = next; tabOrders[filters.tab]=filters.sort; load({}); });
    form.elements.sort.addEventListener('change',()=>form.requestSubmit());
    document.querySelectorAll('[data-centro-tab]').forEach(b => b.addEventListener('click', () => {
      filters.tab = b.dataset.centroTab; filters.page = 1;
      filters.sort=tabOrders[filters.tab];
      if (filters.tab === 'historico') filters.archived = 'all'; else filters.archived = 'active';
      filters.urgent = ''; remount(); load({});
    }));
    document.getElementById('centro-clear').addEventListener('click', () => { filters = { tab: filters.tab, page: 1, limit: 25, sort:tabOrders[filters.tab],archived: filters.tab === 'historico' ? 'all' : 'active' }; remount(); load({}); });
    document.getElementById('centro-refresh').addEventListener('click', () => load({}));
    bindResults();
  }
  function remount() { const el = document.getElementById('dashboard-integration-section'); if (el) { el.outerHTML = render(); bind({ date, openEvent }); } }
  function load(options) {
    const query = new URLSearchParams(Object.entries({ ...filters, date }).filter(([,value]) => value !== undefined && value !== null && value !== ''));
    const key = query.toString(); if (pending?.key === key) return pending.promise;
    const active = ++version; loading = !options.silent; error = ''; if (!options.silent) paintResults();
    const promise = App.api.apiFetch('/api/eventos-integracion/centro?' + key).then(data => {
      if (active !== version || !document.getElementById('centro-results')) return;
      result = data;
      if (filters.page > 1 && filters.page > (data.pagination.totalPages || 1)) { filters.page = Math.max(1,data.pagination.totalPages); pending = null; return load(options); }
    }).catch(err => { if (active === version && !err.isStaleSession) error = err.data?.mensaje || 'No fue posible consultar los avisos.'; })
      .finally(() => { if (active === version) { loading = false; paintResults(); } if (pending?.promise === promise) pending = null; });
    pending = { key, promise }; return promise;
  }
  async function loadHistory(id, page) {
    const active = historyVersion, listVersion = version;
    const host = document.getElementById('centro-history-' + id); if (!host) return;
    host.textContent = 'Cargando historial…';
    try {
      const response = await App.api.apiFetch('/api/eventos-integracion/centro/' + encodeURIComponent(id) + '/historial?page=' + page + '&limit=25');
      if (active !== historyVersion || listVersion !== version || !host.isConnected) return;
      histories.set(id,response);
      host.innerHTML = response.data.map(e => '<article class="centro-event"><div><strong>Evento #' + e.id_evento_integracion + ' · ' + esc(types[e.event_type]) + '</strong>'+tourInfo(e)+'<p>'+esc(statuses[e.review_status])+(e.archived_at?' · Archivado':'')+(e.application_status==='applied'?' · Aplicado':' · Sin aplicar')+'</p><div class="centro-receipt"><span>Recepción en PostgreSQL: '+esc(received(e.created_at))+'</span>'+originalTimestamp(e)+'</div></div><button class="btn" data-centro-review="' + e.id_evento_integracion + '">Consultar evento</button></article>').join('') +
        '<div class="dashboard-actions"><button class="btn" data-history-page="' + (page-1) + '"' + (page <= 1 ? ' disabled' : '') + '>Anterior</button><span>Historial ' + page + ' / ' + (response.pagination.totalPages || 1) + '</span><button class="btn" data-history-page="' + (page+1) + '"' + (page >= response.pagination.totalPages ? ' disabled' : '') + '>Siguiente</button></div>';
      host.querySelectorAll('[data-centro-review]').forEach(b => b.addEventListener('click', () => openEvent(b.dataset.centroReview)));
      host.querySelectorAll('[data-history-page]').forEach(b => b.addEventListener('click', () => loadHistory(id,Number(b.dataset.historyPage))));
    } catch (err) { if (active === historyVersion && host.isConnected) host.textContent = 'No fue posible cargar el historial. Cierra y vuelve a expandir el grupo.'; }
  }
  App.centroAvisos = { render, bind, load,
    show: function (tab, urgent, unreviewed) { filters.tab = tab || 'pendientes'; filters.sort=tabOrders[filters.tab];filters.page = 1; filters.urgent = urgent ? 'true' : undefined; filters.q = ''; filters.from = undefined; filters.to = undefined; filters.provider = undefined; filters.event_type = undefined; filters.review_status = unreviewed ? 'pending_review' : undefined; filters.archived = 'active'; remount(); load({}); document.getElementById('dashboard-integration-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    reset: function () { version++; historyVersion++; pending = null; Object.assign(tabOrders,{prioritarios:'service',pendientes:'newest',historico:'newest'});filters = { tab: 'prioritarios', page: 1, limit: 25, archived: 'active',sort:'service' }; result = { data: [], pagination: {} }; histories.clear(); loading = false; error = ''; notice = ''; }
  };
})();
