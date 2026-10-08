const {
  classifyGetYourGuideEmailSubject,
} = require('./getyourguideEmailClassifier');
const { mapGetYourGuideEmailEvent } = require('./getyourguide.mapper');

const FIELD_ALIASES = {
  tour: ['Actividad', 'Tour', 'Producto'],
  option: ['Opcion', 'Opción', 'Variante', 'Tour variant', 'Option'],
  date: ['Fecha', 'Fecha de la actividad', 'Dia de la actividad', 'Día de la actividad'],
  start_time: ['Hora de inicio', 'Inicio', 'Start time', 'Hora', 'Horario', 'Hora de la actividad'],
  pax: ['Participantes', 'PAX', 'Personas', 'Viajeros', 'Numero de participantes', 'Número de participantes'],
  customer_name: ['Cliente', 'Cliente principal', 'Nombre del cliente', 'Viajero principal', 'Main customer', 'Lead traveler'],
  customer_email: ['Email del cliente', 'Correo del cliente', 'Correo electronico', 'Correo electrónico', 'Email'],
  customer_phone: ['Telefono del cliente', 'Teléfono del cliente', 'Telefono', 'Teléfono'],
  customer_language: ['Idioma del cliente'],
  tour_language: ['Idioma del tour', 'Idioma de la actividad', 'Idioma del tour Nuevo', 'Idioma de la actividad Nuevo'],
  pickup_place: ['Lugar de recogida', 'Pickup', 'Punto de recogida', 'Lugar de recogida especifico', 'Lugar de recogida específico', 'Lugar de recogida Nuevo', 'Nuevo lugar de recogida'],
  price: ['Precio', 'Importe total', 'Total', 'Importe'],
  currency: ['Moneda', 'Currency'],
};

const HTML_CLASS_FIELDS = {
  activity_title: 'activity-title',
  option_title: 'activity-option-title',
};

const CUSTOMER_BLOCK_FIELDS = new Set(['customer_email', 'customer_phone', 'customer_language']);

function normalizeLabel(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const LABEL_TO_FIELD = Object.entries(FIELD_ALIASES).reduce((labels, [field, aliases]) => {
  aliases.forEach((label) => {
    labels[normalizeLabel(label)] = field;
  });

  return labels;
}, {});

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizarTextoHtml(value) {
  return stripHtml(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function hasHtmlClass(attributes, className) {
  const match = String(attributes || '').match(/\bclass\s*=\s*["']([^"']+)["']/i);

  if (!match) {
    return false;
  }

  return match[1].split(/\s+/).includes(className);
}

function extractFirstElementTextByClass(html, className) {
  if (!html) {
    return undefined;
  }

  const elementPattern = /<([a-zA-Z0-9]+)\b([^>]*)>/g;
  let match;

  while ((match = elementPattern.exec(html)) !== null) {
    if (!hasHtmlClass(match[2], className)) {
      continue;
    }

    const closingPattern = new RegExp(`</${match[1]}\\s*>`, 'i');
    const remainingHtml = html.slice(elementPattern.lastIndex);
    const closingMatch = closingPattern.exec(remainingHtml);

    if (!closingMatch) {
      continue;
    }

    const text = normalizarTextoHtml(remainingHtml.slice(0, closingMatch.index));

    if (text) {
      return text;
    }
  }

  return undefined;
}

function parseGetYourGuideHtmlFields(html) {
  return Object.entries(HTML_CLASS_FIELDS).reduce((fields, [field, className]) => {
    const value = extractFirstElementTextByClass(html, className);

    if (value) {
      fields[field] = value;
    }

    return fields;
  }, {});
}

function normalizeBody(email) {
  return stripHtml(email.text || email.body || email.html || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function findExternalBookingId(...values) {
  const combined = values.filter(Boolean).join('\n');
  const match = combined.match(/\bGYG[A-Z0-9-]+\b/i);

  return match ? match[0].toUpperCase() : undefined;
}

function parseLineValue(line) {
  const match = line.match(/^([^:：]+)[:：]\s*(.+)$/);

  if (!match) {
    return undefined;
  }

  return {
    label: match[1].trim(),
    value: match[2].trim(),
  };
}

function normalizePax(value) {
  if (!value) {
    return undefined;
  }

  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function normalizeInlineText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCustomerName(value) {
  const cleaned = normalizeInlineText(value)
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();

  return cleaned || undefined;
}

function cleanPickupPlace(value) {
  const cleaned = normalizeInlineText(value)
    .replace(/\s+Abrir en Google Maps\s*$/i, '')
    .trim();

  return cleaned || undefined;
}

const CUSTOMER_INLINE_NEXT_LABEL = '(?:Tel[eé]fono|Idioma|Idioma del tour|Idioma de la actividad|Fecha|Actividad|Tour|Producto|Opcion|Opción|Participantes|PAX|Lugar de recogida|Pickup|Punto de recogida|Precio|Total|Importe|Email|Correo)';
const CUSTOMER_PHONE_PATTERN = new RegExp(`\\bTel[eé]fono\\s*:\\s*(.*?)(?=\\s+\\b${CUSTOMER_INLINE_NEXT_LABEL}\\b\\s*:|$)`, 'i');
const CUSTOMER_LANGUAGE_PATTERN = new RegExp(`\\bIdioma\\s*:\\s*(.*?)(?=\\s+\\b${CUSTOMER_INLINE_NEXT_LABEL}\\b\\s*:|$)`, 'i');
const CUSTOMER_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CUSTOMER_EMAIL_GLOBAL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;

function parseCustomerPrincipalBlock(value) {
  const text = normalizeInlineText(value);

  if (!text) {
    return {};
  }

  const customerData = {};
  const emailMatch = text.match(CUSTOMER_EMAIL_PATTERN);
  const phoneMatch = text.match(CUSTOMER_PHONE_PATTERN);
  const languageMatch = text.match(CUSTOMER_LANGUAGE_PATTERN);

  if (emailMatch) {
    customerData.customer_email = emailMatch[0];
  }

  if (phoneMatch) {
    customerData.customer_phone = normalizeInlineText(phoneMatch[1]);
  }

  if (languageMatch) {
    customerData.customer_language = normalizeInlineText(languageMatch[1]);
  }

  const name = cleanCustomerName(
    text
      .replace(CUSTOMER_PHONE_PATTERN, ' ')
      .replace(CUSTOMER_LANGUAGE_PATTERN, ' ')
      .replace(CUSTOMER_EMAIL_GLOBAL_PATTERN, ' '),
  );

  if (name) {
    customerData.customer_name = name;
  }

  return customerData;
}

function applyCustomerPrincipalBlock(parsedData, value) {
  const customerData = parseCustomerPrincipalBlock(value);

  Object.entries(customerData).forEach(([field, fieldValue]) => {
    applyParsedField(parsedData, field, fieldValue);
  });
}

function normalizeMoney(value) {
  if (!value) {
    return {
      price: undefined,
      currency: undefined,
    };
  }

  const text = String(value).replace(',', '.');
  const amountMatch = text.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  const currencyMatch = text.match(/\b([A-Z]{3})\b/);

  return {
    price: amountMatch ? Number(amountMatch[1]) : undefined,
    currency: currencyMatch ? currencyMatch[1] : undefined,
  };
}

function applyParsedField(parsedData, field, value) {
  if (!value) {
    return;
  }

  if (field === 'pax') {
    const pax = normalizePax(value);
    if (pax !== undefined) {
      parsedData.pax = pax;
    }
    return;
  }

  if (field === 'price') {
    const money = normalizeMoney(value);
    if (money.price !== undefined) {
      parsedData.price = money.price;
    }
    if (money.currency !== undefined && parsedData.currency === undefined) {
      parsedData.currency = money.currency;
    }
    return;
  }

  if (field === 'pickup_place') {
    const pickupPlace = cleanPickupPlace(value);
    if (pickupPlace) {
      parsedData.pickup_place = pickupPlace;
    }
    return;
  }

  parsedData[field] = value;
}

function parseChangedFieldLine(line) {
  const match = line.match(/^([^:：]+)[:：]\s*(?:antes|anterior)\s*=\s*(.*?)\s*(?:ahora|nuevo)\s*=\s*(.+)$/i)
    || line.match(/^([^:：]+)[:：]\s*(.*?)\s*(?:->|→)\s*(.+)$/);

  if (!match) {
    return undefined;
  }

  const field = LABEL_TO_FIELD[normalizeLabel(match[1])];

  if (!field) {
    return undefined;
  }

  return {
    field,
    previous_value: match[2].trim(),
    new_value: match[3].trim(),
  };
}

function getFieldForLabel(label) {
  return LABEL_TO_FIELD[normalizeLabel(label)];
}

function parseAdjacentLineValue(lines, index) {
  const field = getFieldForLabel(lines[index]);

  if (!field) {
    return undefined;
  }

  const value = lines[index + 1];

  if (!value || getFieldForLabel(value)) {
    return undefined;
  }

  return {
    field,
    value,
  };
}

function getLineField(line) {
  const lineValue = parseLineValue(line);

  if (lineValue) {
    return getFieldForLabel(lineValue.label);
  }

  return getFieldForLabel(line);
}

function shouldStopCustomerBlock(line) {
  const field = getLineField(line);

  return Boolean(field && !CUSTOMER_BLOCK_FIELDS.has(field));
}

function collectCustomerPrincipalBlock(lines, index) {
  const values = [];
  let lastIndex = index;

  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex];

    if (shouldStopCustomerBlock(line)) {
      break;
    }

    values.push(line);
    lastIndex = nextIndex;
  }

  return {
    value: values.join('\n'),
    lastIndex,
  };
}

function getNormalizedBodyLines(body) {
  return body.split('\n').map((line) => line.trim()).filter(Boolean);
}

function getCustomerNameDiagnosticsFromBody(body) {
  const lines = getNormalizedBodyLines(body);
  let labelDetected = false;
  let candidateFound = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineValue = parseLineValue(line);

    if (lineValue && getFieldForLabel(lineValue.label) === 'customer_name') {
      labelDetected = true;
      if (lineValue.value) {
        candidateFound = true;
      }
      continue;
    }

    if (getFieldForLabel(line) === 'customer_name') {
      labelDetected = true;
      const value = lines[index + 1];
      if (value && !getFieldForLabel(value)) {
        candidateFound = true;
      }
    }
  }

  return {
    customerLabelDetected: labelDetected,
    customerValueCandidateFound: candidateFound,
  };
}

function getCustomerNameDiagnostics(email) {
  const body = normalizeBody(email);
  const event = parseGetYourGuideEmail(email);
  const diagnostics = getCustomerNameDiagnosticsFromBody(body);

  return {
    ...diagnostics,
    customerNamePresent: Boolean(event.data?.customer_name),
    parsedDataKeys: Object.keys(event.data || {}).sort(),
  };
}

function parseGetYourGuideEmailFields(body, eventType) {
  const parsedData = {};
  const changedFields = [];
  const lines = getNormalizedBodyLines(body);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const changedField = eventType === 'modification'
      ? parseChangedFieldLine(line)
      : undefined;

    if (changedField) {
      changedFields.push(changedField);
      applyParsedField(parsedData, changedField.field, changedField.new_value);
      continue;
    }

    const adjacentValue = parseAdjacentLineValue(lines, index);

    if (adjacentValue) {
      if (eventType === 'modification') {
        const adjacentChangedField = parseChangedFieldLine(`${line}: ${adjacentValue.value}`);

        if (adjacentChangedField) {
          changedFields.push(adjacentChangedField);
          applyParsedField(parsedData, adjacentChangedField.field, adjacentChangedField.new_value);
          index += 1;
          continue;
        }
      }

      if (adjacentValue.field === 'customer_name') {
        const customerBlock = collectCustomerPrincipalBlock(lines, index);
        applyCustomerPrincipalBlock(parsedData, customerBlock.value || adjacentValue.value);
        index = Math.max(index, customerBlock.lastIndex);
        continue;
      }

      applyParsedField(parsedData, adjacentValue.field, adjacentValue.value);
      index += 1;
      continue;
    }

    const lineValue = parseLineValue(line);

    if (!lineValue) {
      continue;
    }

    const field = getFieldForLabel(lineValue.label);

    if (!field) {
      continue;
    }

    if (field === 'customer_name') {
      applyCustomerPrincipalBlock(parsedData, lineValue.value);
      continue;
    }

    applyParsedField(parsedData, field, lineValue.value);
  }

  if (changedFields.length > 0) {
    parsedData.changed_fields = changedFields;
  }

  return parsedData;
}

function parseGetYourGuideEmail(email) {
  const subject = email.subject || '';
  const classification = classifyGetYourGuideEmailSubject(subject);
  const body = normalizeBody(email);
  const htmlFields = parseGetYourGuideHtmlFields(email.html);
  const parsedData = {
    ...parseGetYourGuideEmailFields(body, classification.event_type),
    ...htmlFields,
  };

  parsedData.external_booking_id = findExternalBookingId(subject, body);

  if (classification.event_type === 'cancellation') {
    parsedData.status = 'cancelled';
  }

  return mapGetYourGuideEmailEvent({
    classification,
    parsedData,
    email_message_id: email.email_message_id,
    email_thread_id: email.email_thread_id,
  });
}

module.exports = {
  findExternalBookingId,
  getCustomerNameDiagnostics,
  parseGetYourGuideEmail,
  parseGetYourGuideHtmlFields,
};
