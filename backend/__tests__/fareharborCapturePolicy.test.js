const { captureAllowed } = require('../../scripts/integrations/fareharborCapturePolicy.cjs');
const now = Date.parse('2026-10-20T21:00:00Z');
const authorized = { mode: 'continuous', supervisedRealEventsAuthorized: true, cloudCaptureUnknownAuthorized: true,
    autoApplyUserId: null, cloudFullCaptureConfirmedDisabled: false, cloudCaptureEvidence: { status: 'not_confirmed' },
    authorizationRecordedAt: new Date(now - 1000).toISOString() };
test('estado desconocido: solo la autorización explícita supervisada permite recibir eventos sin autoaplicar', () => {
    expect(captureAllowed(authorized, now)).toBe(true);
    expect(authorized.cloudFullCaptureConfirmedDisabled).toBe(false);
    expect(authorized.cloudCaptureEvidence.status).toBe('not_confirmed');
    for (const change of [{ supervisedRealEventsAuthorized: false }, { cloudCaptureUnknownAuthorized: false },
        { autoApplyUserId: 1 }, { mode: 'trial' }, { authorizationRecordedAt: '' },
        { authorizationRecordedAt: new Date(now + 1).toISOString() }]) {
        expect(captureAllowed({ ...authorized, ...change }, now)).toBe(false);
    }
});
test('captura detectada activa: ninguna autorización permite publicarla', () => {
    expect(captureAllowed({ ...authorized, cloudFullCaptureDetectedActive: true }, now)).toBe(false);
    expect(captureAllowed({ cloudFullCaptureDetectedActive: true, cloudFullCaptureConfirmedDisabled: true,
        cloudCaptureEvidence: { status: 'confirmed_disabled', source: 'synthetic_support_evidence' } }, now)).toBe(false);
});
test('confirmación documentada: conserva el contrato anterior sin inventar evidencia', () => {
    expect(captureAllowed({}, now)).toBe(false);
    expect(captureAllowed({ cloudFullCaptureConfirmedDisabled: true, cloudCaptureEvidence: { status: 'confirmed_disabled', source: 'synthetic_support_evidence' } }, now)).toBe(true);
    expect(captureAllowed({ cloudFullCaptureConfirmedDisabled: true, cloudCaptureEvidence: { status: 'not_confirmed' } }, now)).toBe(false);
});
