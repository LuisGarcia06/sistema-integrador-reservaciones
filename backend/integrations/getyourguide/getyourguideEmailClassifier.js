const UNKNOWN_CLASSIFICATION = {
  event_type: 'unknown',
  urgent: false,
};

function normalizeSubject(subject) {
  return String(subject || '').trim().replace(/\s+/g, ' ');
}

function classifyGetYourGuideEmailSubject(subject) {
  const normalizedSubject = normalizeSubject(subject);

  if (/^Urgente: nueva reserva recibida\s+-\s+.+/i.test(normalizedSubject)) {
    return {
      event_type: 'new_booking',
      urgent: true,
    };
  }

  if (/^Reserva\s+-\s+.+/i.test(normalizedSubject)) {
    return {
      event_type: 'new_booking',
      urgent: false,
    };
  }

  if (/^Cambio en los detalles de la reserva:\s+.+/i.test(normalizedSubject)) {
    return {
      event_type: 'modification',
      urgent: false,
    };
  }

  if (/^Se ha cancelado una reserva\s+-\s+.+/i.test(normalizedSubject)) {
    return {
      event_type: 'cancellation',
      urgent: false,
    };
  }

  return { ...UNKNOWN_CLASSIFICATION };
}

module.exports = {
  classifyGetYourGuideEmailSubject,
};
