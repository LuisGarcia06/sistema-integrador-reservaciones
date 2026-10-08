function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function getHeaderValue(headers = [], name) {
  return headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? '';
}

function parseDateFromMillis(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const millis = Number(value);

  if (!Number.isFinite(millis)) {
    return null;
  }

  const date = new Date(millis);
  return isValidDate(date) ? date : null;
}

function parseDateHeader(value) {
  if (!value) {
    return null;
  }

  const millis = Date.parse(value);

  if (!Number.isFinite(millis)) {
    return null;
  }

  const date = new Date(millis);
  return isValidDate(date) ? date : null;
}

function getGmailMessageSourceReceivedAt(message) {
  const internalDate = parseDateFromMillis(message?.internalDate);

  if (internalDate) {
    return internalDate;
  }

  return parseDateHeader(getHeaderValue(message?.payload?.headers ?? [], 'Date'));
}

function getSourceReceivedAtDiagnostics(message) {
  const dateHeader = getHeaderValue(message?.payload?.headers ?? [], 'Date');
  const internalDate = parseDateFromMillis(message?.internalDate);
  const headerDate = parseDateHeader(dateHeader);

  return {
    internalDateExists: message?.internalDate !== undefined && message?.internalDate !== null && message?.internalDate !== '',
    internalDateParseable: Boolean(internalDate),
    dateHeaderExists: Boolean(dateHeader),
    dateHeaderParseable: Boolean(headerDate),
    sourceReceivedAtValid: Boolean(internalDate || headerDate),
  };
}

function removeEmptyValues(value) {
  if (value instanceof Date) {
    return isValidDate(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map(removeEmptyValues)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((cleaned, [key, item]) => {
      const cleanedItem = removeEmptyValues(item);

      if (cleanedItem !== undefined) {
        cleaned[key] = cleanedItem;
      }

      return cleaned;
    }, {});
  }

  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}

function mapGetYourGuideEmailEvent({
  classification,
  parsedData = {},
  email_message_id,
  email_thread_id,
}) {
  const status = classification.event_type === 'cancellation'
    ? 'cancelled'
    : parsedData.status;
  const data = classification.event_type === 'modification'
    ? {
      activity_title: parsedData.activity_title,
      option_title: parsedData.option_title,
      date: parsedData.date,
      pax: parsedData.pax,
      tour_language: parsedData.tour_language,
      pickup_place: parsedData.pickup_place,
      changed_fields: parsedData.changed_fields,
    }
    : {
      tour: parsedData.tour,
      option: parsedData.option,
      activity_title: parsedData.activity_title,
      option_title: parsedData.option_title,
      date: parsedData.date,
      start_time: parsedData.start_time,
      pickup_time: parsedData.pickup_time,
      pax: parsedData.pax,
      customer_name: parsedData.customer_name,
      customer_email: parsedData.customer_email,
      customer_phone: parsedData.customer_phone,
      customer_language: parsedData.customer_language,
      tour_language: parsedData.tour_language,
      pickup_place: parsedData.pickup_place,
      price: parsedData.price,
      currency: parsedData.currency,
      changed_fields: parsedData.changed_fields,
    };

  return removeEmptyValues({
    provider: 'getyourguide',
    event_type: classification.event_type,
    urgent: Boolean(classification.urgent),
    external_booking_id: parsedData.external_booking_id,
    status,
    email_message_id,
    email_thread_id,
    data,
  });
}

function toGetYourGuideIntegrationEvent(parsedEvent, {
  source_subject,
  source_received_at,
} = {}) {
  const evento = removeEmptyValues({
    provider: parsedEvent.provider,
    external_event_id: parsedEvent.email_message_id,
    external_thread_id: parsedEvent.email_thread_id,
    external_booking_id: parsedEvent.external_booking_id,
    event_type: parsedEvent.event_type,
    urgent: Boolean(parsedEvent.urgent),
    source_subject,
    source_received_at,
  });

  return {
    ...evento,
    normalized_data: parsedEvent.data || {},
  };
}

function getEmailDeduplicationKey(event) {
  return event.email_message_id;
}

function getReservationIdentityKey(event) {
  if (!event.external_booking_id) {
    return undefined;
  }

  return `${event.provider}:${event.external_booking_id}`;
}

module.exports = {
  getEmailDeduplicationKey,
  getGmailMessageSourceReceivedAt,
  getReservationIdentityKey,
  getSourceReceivedAtDiagnostics,
  isValidDate,
  mapGetYourGuideEmailEvent,
  toGetYourGuideIntegrationEvent,
};
