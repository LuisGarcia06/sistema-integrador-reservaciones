(function () {
  'use strict';
  const App = window.App, legacy = App.revisionLab;
  const PROTOCOL = 'ctsk-command-api-v1';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const tickets = new WeakMap(), copy = legacy.copy;
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function blocked(message) { return Object.assign(new Error(message), { status: 0, kind: 'blocked' }); }
  function classify(error) {
    error.code = error.data?.resultado?.codigo || error.code || error.data?.codigo;
    if (error.code === 'CLAVE_IDEMPOTENCIA_REUTILIZADA') error.kind = 'key-reuse';
    else if (error.code === 'CONTEXTO_OPERATIVO_CAMBIO') error.kind = 'context';
    else if (['55P03', '40P01'].includes(error.code)) error.kind = 'lock';
    else if (error.status === 412) error.kind = 'record';
    else if (['PRECONDICION_INVALIDA', 'CLIENTE_INCOMPATIBLE', 'GENERACION_INCOMPATIBLE'].includes(error.code)) error.kind = 'protocol';
    return error;
  }
  function message(error) {
    if (error.kind === 'key-reuse') return 'La clave corresponde a otra intención. El comando original necesita conciliación: consulta su resultado; no se guardará con otra clave.';
    if (error.kind === 'lock') return 'La espera por un bloqueo terminó sin resultado concluyente. Consulta el comando original; no se repetirá el guardado.';
    if (error.kind === 'unknown') return 'No hay evidencia concluyente del resultado. El comando original sigue sin conciliar; no se habilita otro guardado.';
    if (error.kind === 'protocol') return 'La respuesta no coincide con el protocolo, generación o comando esperado. Conserva el sobre y consulta su resultado original.';
    if (error.code === 'NEGOCIO_RECHAZADO') return 'El servidor registró un rechazo de validación de negocio. Tu propuesta se conserva para revisión explícita.';
    return legacy.message(error);
  }
  async function call(url, options) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try { return await App.api.apiFetch(url, { ...options, responseMetadata: true, signal: controller.signal }); }
    finally { window.clearTimeout(timer); }
  }
  function validateHeaders(headers, generation) {
    if (!headers || headers.protocol !== PROTOCOL || headers.generation !== generation) throw Object.assign(blocked('Contrato de respuesta incompatible.'), { kind: 'protocol' });
  }
  function guard(url, options) {
    const method = (options.method || 'GET').toUpperCase();
    if (['GET', 'HEAD'].includes(method)) return;
    if (method === 'POST' && ['/api/auth/login', '/api/precondiciones'].includes(url)) return;
    const command = tickets.get(options.revisionTicket); tickets.delete(options.revisionTicket);
    if (!command || options.auth === false || method !== command.method || url !== command.url || JSON.stringify(options.body) !== command.bodyJson) throw blocked('No hay una intención confirmada para esta escritura.');
    const headers = new Headers(options.headers);
    for (const [name, value] of Object.entries(command.headers)) if (headers.get(name) !== value) throw blocked('El sobre confirmado cambió.');
    if (command.sessionVersion !== App.auth.obtenerVersionSesion() || command.userId !== App.auth.obtenerUsuario()?.id_usuario) throw blocked('El comando pertenece a otra identidad o sesión.');
  }
  class CommandSession extends legacy.EditSession {
    constructor(method, url, { comparisonRead = false } = {}) {
      super(method, url); this.userId = App.auth.obtenerUsuario()?.id_usuario;
      if (comparisonRead && (method !== 'PATCH' || !/^\/api\/reservaciones\/[1-9][0-9]*$/.test(url))) throw blocked('Comparación de lectura no disponible para esta ruta.');
      this.comparisonRead = comparisonRead;
      this.command = null; this.receipt = null; this.replayed = false; this.recovering = false;
    }
    assertIdentity() { super.assertIdentity(); if (this.userId !== App.auth.obtenerUsuario()?.id_usuario) throw blocked('Identidad de edición anterior.'); }
    async snapshot() {
      this.assertIdentity();
      const response = await call('/api/precondiciones', { method: 'POST', headers: { 'X-CTSK-Protocol': PROTOCOL }, body: { metodo: this.method, ruta: this.url, datos: {} } });
      this.assertIdentity(); const value = response.data;
      if (!value || !UUID.test(value.generacion || '') || value.metodo !== this.method || value.ruta !== this.url || typeof value.etag !== 'string' || typeof value.contexto !== 'string'
        || (value.revision !== null && typeof value.revision !== 'string') || this.original && this.original.generacion !== value.generacion) throw Object.assign(blocked('Foto de laboratorio incompatible.'), { kind: 'protocol' });
      validateHeaders(response.headers, value.generacion); return freeze(copy(value));
    }
    setProposal(value) {
      this.assertIdentity(); if (this.state !== 'ready' || this.command) throw blocked('La intención enviada es inmutable. Consulta o revisa el resultado antes de otra edición.');
      this.proposal = copy(value);
    }
    hasUnresolved() { return Boolean(this.command && !['confirmado', 'rechazado'].includes(this.receipt?.comando.estado)); }
    parseReceipt(data, headers, status) {
      validateHeaders(headers, this.command.generation);
      if (!data || data.comando?.clave !== this.command.key || data.comando.generacion !== this.command.generation || !['confirmado', 'rechazado'].includes(data.comando.estado)
        || typeof data.resultado?.codigo !== 'string' || !Array.isArray(data.resultado.referencias) || !Array.isArray(data.ids_bitacora) || !data.ids_bitacora.every(Number.isSafeInteger)
        || data.comando.estado === 'confirmado' && status !== 200 || data.comando.estado === 'rechazado' && !(status >= 400 && status <= 499)) throw Object.assign(blocked('Recibo incompatible.'), { kind: 'protocol' });
      return freeze(copy(data));
    }
    async accept(data, headers, status) {
      const receipt = this.parseReceipt(data, headers, status); this.receipt = receipt; this.replayed = headers.replayed === 'true'; this.recoveryError = null;
      if (receipt.comando.estado === 'confirmado') { this.state = 'confirmed'; this.error = null; return receipt; }
      this.error = classify(Object.assign(new Error('Rechazo durable'), { status, data: receipt }));
      this.state = status === 412 || this.error.kind === 'context' ? 'conflict' : 'rejected';
      try { this.current = this.comparisonRead ? freeze({ datos: copy(await this.readRepresentation()) }) : await this.snapshot(); } catch (e) { this.current = null; this.readError = e; }
      this.assertIdentity();
      return receipt;
    }
    async submit(confirm) {
      this.assertIdentity(); if (this.state !== 'ready' || this.command) throw blocked('El comando original debe resolverse antes de otro guardado.');
      this.state = 'confirming';
      let approved;
      try { approved = await confirm(copy(this.proposal), this.original); } catch (e) { this.state = 'ready'; throw e; }
      this.assertIdentity(); if (!approved) { this.state = 'ready'; return false; }
      const key = window.crypto.randomUUID(); if (!UUID.test(key)) { this.state = 'blocked'; throw blocked('UUID segura no disponible.'); }
      const headers = { 'X-CTSK-Protocol': PROTOCOL, 'X-CTSK-Data-Generation': this.original.generacion, 'Idempotency-Key': key, 'If-Match': this.original.etag, 'If-Operational-Match': this.original.contexto };
      this.command = freeze({ key, generation: this.original.generacion, userId: this.userId, sessionVersion: this.sessionVersion,
        method: this.method, url: this.url, body: copy(this.proposal), bodyJson: JSON.stringify(this.proposal), etag: this.original.etag, context: this.original.contexto, protocol: PROTOCOL, headers });
      this.state = 'submitting'; const ticket = {}; tickets.set(ticket, this.command);
      try {
        const response = await call(this.command.url, { method: this.command.method, headers: this.command.headers, body: this.command.body, revisionTicket: ticket });
        this.assertIdentity(); return await this.accept(response.data, response.headers, response.status);
      } catch (raw) {
        tickets.delete(ticket); if (this.state === 'disposed') throw raw;
        const error = classify(raw); this.error = error;
        if (error.data?.comando) {
          try { await this.accept(error.data, error.responseMetadata, error.status); } catch (invalid) { if (this.state === 'disposed') throw invalid; this.state = 'uncertain'; this.error = invalid; }
        } else { this.state = [401, 403].includes(error.status) || error.isStaleSession ? 'forbidden' : error.kind === 'key-reuse' ? 'keyConflict' : 'uncertain'; }
        throw this.error;
      }
    }
    async recover() {
      this.assertIdentity(); if (!this.command || this.recovering) throw blocked('No hay un comando consultable o hay una consulta en curso.');
      this.recovering = true;
      try {
        const response = await call('/api/comandos/' + this.command.key, { headers: { 'X-CTSK-Protocol': PROTOCOL, 'X-CTSK-Data-Generation': this.command.generation } });
        this.assertIdentity(); const receipt = await this.accept(response.data, response.headers, response.data?.http_status_original); this.recovered = true; return receipt;
      } catch (raw) {
        if (this.state === 'disposed') throw raw;
        const error = classify(raw); this.recoveryError = error;
        if ([401, 403].includes(error.status) || error.isStaleSession) { this.receipt = this.current = null; this.state = 'forbidden'; }
        else if (error.status === 404) { this.receipt = null; this.state = 'uncertain'; this.recoveryError = Object.assign(error, { kind: 'unknown' }); }
        else if (error.kind === 'protocol') { this.receipt = this.current = null; this.state = 'uncertain'; }
        // Una lectura fallida no transforma la incertidumbre en permiso para escribir.
        else if (!this.receipt) this.state = 'uncertain';
        throw this.recoveryError;
      } finally { this.recovering = false; }
    }
    async prepare(choice, confirmDiscard) {
      this.assertIdentity();
      if (!['conflict', 'rejected'].includes(this.state) || this.receipt?.comando.estado !== 'rechazado' || !['review', 'current'].includes(choice)) throw blocked('Un resultado desconocido no permite preparar otra intención.');
      if (choice === 'current' && !await confirmDiscard()) return false;
      const fresh = await this.snapshot(); this.original = fresh; this.current = null;
      if (choice === 'current') this.proposal = {};
      this.command = this.receipt = null; this.error = this.recoveryError = this.readError = null; this.state = 'ready'; return true;
    }
    async inspectCurrent() {
      this.assertIdentity(); if (this.receipt?.comando.estado !== 'confirmado') throw blocked('Primero consulta un recibo confirmado.');
      return this.readRepresentation();
    }
    async readRepresentation() {
      this.assertIdentity();
      const match = /^\/api\/(reservaciones|operaciones|transportes|vehiculos|guias|operadores|tours|usuarios|eventos-integracion)\/(\d+)/.exec(this.command.url);
      const url = this.command.method === 'PUT' ? this.command.url : match ? '/api/' + match[1] + '/' + match[2] : null;
      if (!url) throw blocked('Lectura actual no disponible.');
      try {
        const response = await call(url, {}); this.assertIdentity(); validateHeaders(response.headers, this.original.generacion); return response.data;
      } catch (e) {
        if (this.state !== 'disposed' && [401, 403].includes(e.status)) { this.receipt = this.current = null; this.state = 'forbidden'; }
        throw e;
      }
    }
    dispose() { super.dispose(); this.command = this.receipt = null; this.error = this.recoveryError = this.current = null; }
  }
  App.commandLab = { PROTOCOL, CommandSession, message, supported: legacy.supported };
  // Solo la página explícita nueva instala este adaptador; el perfil anterior no lo carga.
  App.revisionLab = { ...legacy, PROTOCOL, EditSession: CommandSession, guard, message };
})();
