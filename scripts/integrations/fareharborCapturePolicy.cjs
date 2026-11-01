// La autorización de un estado desconocido no acredita que la captura esté desactivada.
function captureAllowed(config = {}, now = Date.now()) {
    if (config.cloudFullCaptureDetectedActive === true) return false;
    const evidence = config.cloudCaptureEvidence;
    if (config.cloudFullCaptureConfirmedDisabled === true && evidence?.status === 'confirmed_disabled'
        && typeof evidence.source === 'string' && evidence.source.length > 0) return true;
    return config.mode === 'continuous' && config.supervisedRealEventsAuthorized === true
        && config.cloudCaptureUnknownAuthorized === true && config.autoApplyUserId === null
        && config.cloudFullCaptureConfirmedDisabled === false && evidence?.status === 'not_confirmed'
        && Number.isFinite(Date.parse(config.authorizationRecordedAt))
        && Date.parse(config.authorizationRecordedAt) <= now;
}
module.exports = { captureAllowed };
