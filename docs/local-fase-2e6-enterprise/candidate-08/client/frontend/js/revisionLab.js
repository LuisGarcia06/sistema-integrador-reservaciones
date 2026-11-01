(function () {
  'use strict';
  const App = window.App = window.App || {};
  const PROTOCOL = 'ctsk-revision-api-v1';
  const tickets = new WeakSet();
  function supported(method, url) {
    return method === 'PATCH' && /^\/api\/(reservaciones|operaciones|transportes|vehiculos|guias|operadores|tours|usuarios)\/[1-9][0-9]*$/.test(url)
      || method === 'PATCH' && /^\/api\/reservaciones\/[1-9][0-9]*\/(cancelar|transporte)$/.test(url)
      || method === 'PATCH' && /^\/api\/eventos-integracion\/[1-9][0-9]*\/(revision|archivo)$/.test(url)
      || method === 'POST' && /^\/api\/eventos-integracion\/[1-9][0-9]*\/aplicar$/.test(url)
      || method === 'PUT' && /^\/api\/daily\/observaciones\?fecha=\d{4}-\d\d-\d\d$/.test(url);
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function localError(message) { const e = new Error(message); e.status = 0; e.kind = 'blocked'; return e; }
  function guard(url, options) {
    const method = (options.method || 'GET').toUpperCase();
    if (['GET', 'HEAD'].includes(method)) return;
    if (method === 'POST' && ['/api/auth/login', '/api/precondiciones'].includes(url)) return;
    if (!tickets.has(options.revisionTicket)) throw localError('Acción bloqueada: falta una edición protegida.');
    tickets.delete(options.revisionTicket); // Un envío por autorización; jamás se reutiliza.
  }
  function message(error) {
    if (error.isStaleSession) return 'La sesión o sus permisos cambiaron. Abre una edición autorizada nueva.';
    if (error.isNetworkError || error.status >= 500) return 'Resultado incierto. La escritura puede haberse confirmado. Consulta el estado y la bitácora; no se reenviará automáticamente.';
    if (error.kind === 'record') return 'Otra persona modificó este registro (412). Tus cambios siguen en el formulario.';
    if (error.kind === 'context') return 'Cambió el contexto operativo (409): revisa relaciones, capacidad, asignaciones y permisos.';
    if (error.status === 409) return 'Conflicto de negocio (409). Revisa las dependencias antes de preparar otro intento.';
    if (error.kind === 'required') return 'Faltan precondiciones (428). El guardado está bloqueado; no hay reenvío.';
    if (error.kind === 'protocol') return 'Precondición o protocolo inválido (400). El guardado está bloqueado.';
    if ([401, 403, 404].includes(error.status)) return 'Sesión, permisos o acceso al registro no disponibles. No se consultarán datos sin autorización.';
    return [error.data?.mensaje || error.message, ...(error.data?.errores || [])].join(' ');
  }
  class EditSession {
    constructor(method, url) {
      if (!supported(method, url)) throw localError('Esta acción no tiene formulario adaptado y permanece bloqueada.');
      this.method = method; this.url = url; this.original = null; this.current = null;
      this.proposal = {}; this.state = 'opening'; this.sessionVersion = App.auth.obtenerVersionSesion();
    }
    assertIdentity() {
      if (this.state === 'disposed' || this.sessionVersion !== App.auth.obtenerVersionSesion()) throw localError('La edición pertenece a otra sesión o permisos.');
    }
    async snapshot() {
      this.assertIdentity();
      const value = await App.api.apiFetch('/api/precondiciones', {
        method: 'POST', headers: { 'X-CTSK-Protocol': PROTOCOL },
        body: { metodo: this.method, ruta: this.url, datos: {} }
      });
      this.assertIdentity();
      if (value.metodo !== this.method || value.ruta !== this.url || typeof value.etag !== 'string' || typeof value.contexto !== 'string'
        || (value.revision !== null && typeof value.revision !== 'string')) throw localError('Contrato de laboratorio incompatible.');
      return freeze(copy(value));
    }
    async open() { this.original = await this.snapshot(); this.state = 'ready'; return this; }
    setProposal(value) { this.assertIdentity(); if (['submitting', 'confirming'].includes(this.state)) throw localError('Envío en curso.'); this.proposal = copy(value); }
    async submit(confirm) {
      this.assertIdentity();
      if (this.state !== 'ready') throw localError('Revisa el conflicto o el resultado incierto antes de preparar otro intento.');
      this.state = 'confirming';
      let approved;
      try { approved = await confirm(copy(this.proposal), this.original); }
      catch (e) { this.state = 'ready'; throw e; }
      this.assertIdentity();
      if (!approved) { this.state = 'ready'; return false; }
      this.state = 'submitting';
      const ticket = {}; tickets.add(ticket);
      try {
        const result = await App.api.apiFetch(this.url, {
          method: this.method, body: copy(this.proposal), revisionTicket: ticket,
          headers: { 'X-CTSK-Protocol': PROTOCOL, 'If-Match': this.original.etag, 'If-Operational-Match': this.original.contexto }
        });
        this.assertIdentity(); this.state = 'saved'; return result;
      } catch (error) {
        tickets.delete(ticket);
        if (this.state === 'disposed') throw error;
        this.error = error; this.state = 'blocked';
        if ([412, 409].includes(error.status)) {
          this.state = 'conflict';
          try { this.current = await this.snapshot(); } catch (readError) { this.current = null; this.readError = readError; }
        } else if (error.isNetworkError || error.status >= 500) this.state = 'uncertain';
        else if (error.kind === 'business' && error.status === 400) this.state = 'ready';
        throw error;
      }
    }
    async prepare(choice, confirmDiscard) {
      this.assertIdentity();
      if (!['conflict', 'uncertain', 'blocked'].includes(this.state)) throw localError('No hay una revisión pendiente.');
      if (!['review', 'current'].includes(choice)) throw localError('Decisión inválida.');
      if (choice === 'current' && !await confirmDiscard()) return false;
      // Una decisión humana obtiene otra foto. Nunca escribe ni fusiona campos.
      const fresh = await this.snapshot();
      this.original = fresh; this.current = null; this.error = null; this.readError = null;
      if (choice === 'current') this.proposal = {};
      this.state = 'ready'; return true;
    }
    dispose() { this.state = 'disposed'; this.original = this.current = null; this.proposal = {}; }
  }
  App.revisionLab = { PROTOCOL, guard, EditSession, message, copy, supported };
})();
