const {
  classifyGetYourGuideEmailSubject,
} = require('../getyourguideEmailClassifier');
const {
  getEmailDeduplicationKey,
  getGmailMessageSourceReceivedAt,
  getReservationIdentityKey,
  getSourceReceivedAtDiagnostics,
  toGetYourGuideIntegrationEvent,
} = require('../getyourguide.mapper');
const {
  findExternalBookingId,
  getCustomerNameDiagnostics,
  parseGetYourGuideEmail,
  parseGetYourGuideHtmlFields,
} = require('../getyourguideEmailParser');

const newBookingFixture = require('../__fixtures__/new-booking.json');
const urgentBookingFixture = require('../__fixtures__/urgent-booking.json');
const modificationFixture = require('../__fixtures__/modification.json');
const cancellationFixture = require('../__fixtures__/cancellation.json');

function createGmailTimestampMessage({ internalDate, dateHeader } = {}) {
  const headers = [];

  if (dateHeader !== undefined) {
    headers.push({ name: 'Date', value: dateHeader });
  }

  return {
    internalDate,
    payload: { headers },
  };
}

test('source_received_at usa internalDate valido como string de milisegundos', () => {
  const receivedAt = getGmailMessageSourceReceivedAt(createGmailTimestampMessage({
    internalDate: '1800000000000',
  }));

  expect(receivedAt).toEqual(new Date(1800000000000));
});

test('source_received_at usa internalDate valido como numero', () => {
  const receivedAt = getGmailMessageSourceReceivedAt(createGmailTimestampMessage({
    internalDate: 1800000000000,
  }));

  expect(receivedAt).toEqual(new Date(1800000000000));
});

test('source_received_at usa Date header valido si internalDate es invalido', () => {
  const receivedAt = getGmailMessageSourceReceivedAt(createGmailTimestampMessage({
    internalDate: 'no-es-milisegundos',
    dateHeader: 'Tue, 15 Jun 2027 10:30:00 +0000',
  }));

  expect(receivedAt).toEqual(new Date('2027-06-15T10:30:00.000Z'));
});

test('source_received_at queda null si internalDate y Date header son invalidos', () => {
  const message = createGmailTimestampMessage({
    internalDate: 'no-es-milisegundos',
    dateHeader: 'fecha-invalida',
  });

  expect(getGmailMessageSourceReceivedAt(message)).toBeNull();
  expect(getSourceReceivedAtDiagnostics(message)).toEqual({
    internalDateExists: true,
    internalDateParseable: false,
    dateHeaderExists: true,
    dateHeaderParseable: false,
    sourceReceivedAtValid: false,
  });
});

test('source_received_at nunca produce timestamp con NaN', () => {
  const sourceReceivedAt = getGmailMessageSourceReceivedAt(createGmailTimestampMessage({
    internalDate: '999999999999999999999',
    dateHeader: 'fecha-invalida',
  }));
  const event = parseGetYourGuideEmail(newBookingFixture);
  const persistible = toGetYourGuideIntegrationEvent(event, { source_received_at: sourceReceivedAt });

  expect(sourceReceivedAt).toBeNull();
  expect(JSON.stringify(persistible)).not.toMatch(/NaN/);
});
test('clasifica reserva nueva', () => {
  expect(classifyGetYourGuideEmailSubject('Reserva - GYG123456789')).toEqual({
    event_type: 'new_booking',
    urgent: false,
  });
});

test('clasifica reserva urgente', () => {
  expect(classifyGetYourGuideEmailSubject('Urgente: nueva reserva recibida - GYG987654321')).toEqual({
    event_type: 'new_booking',
    urgent: true,
  });
});

test('clasifica modificacion', () => {
  expect(classifyGetYourGuideEmailSubject('Cambio en los detalles de la reserva: GYG123456789')).toEqual({
    event_type: 'modification',
    urgent: false,
  });
});

test('clasifica cancelacion', () => {
  expect(classifyGetYourGuideEmailSubject('Se ha cancelado una reserva - GYG123456789')).toEqual({
    event_type: 'cancellation',
    urgent: false,
  });
});

test('rechaza asunto no soportado aunque mencione GetYourGuide', () => {
  expect(classifyGetYourGuideEmailSubject('Recordatorio GetYourGuide para revisar el panel')).toEqual({
    event_type: 'unknown',
    urgent: false,
  });
});

test('extrae external_booking_id GYG', () => {
  expect(findExternalBookingId('Reserva - GYG123456789', 'Referencia interna: STEST001'))
    .toBe('GYG123456789');
});

test('no usa STEST001 como external_booking_id', () => {
  expect(findExternalBookingId('Reserva - ejemplo', 'Referencia interna: STEST001'))
    .toBeUndefined();
});

test('parsea pares etiqueta valor sin dos puntos', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-adjacent-001',
    email_thread_id: 'fixture-gyg-thread-adjacent-001',
    subject: 'Reserva - GYGADJ001',
    text: [
      'Actividad',
      'Tour Sian Kaan Sanitizado',
      'Fecha',
      '2027-01-15',
      'Hora de inicio',
      '08:30',
      'Participantes',
      '2 adultos',
      'Lugar de recogida',
      'Hotel Sanitizado',
      'Precio',
      '250.00 USD',
    ].join('\n'),
  });

  expect(event.data).toEqual(expect.objectContaining({
    tour: 'Tour Sian Kaan Sanitizado',
    date: '2027-01-15',
    start_time: '08:30',
    pax: 2,
    pickup_place: 'Hotel Sanitizado',
    price: 250,
    currency: 'USD',
  }));
});

test('no inventa valores faltantes al parsear pares etiqueta valor', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-partial-adjacent-001',
    email_thread_id: 'fixture-gyg-thread-partial-adjacent-001',
    subject: 'Reserva - GYGPARTIAL001',
    text: [
      'Actividad',
      'Tour Sian Kaan Sanitizado',
      'Fecha',
      '2027-01-15',
    ].join('\n'),
  });

  expect(event.data).toEqual({
    tour: 'Tour Sian Kaan Sanitizado',
    date: '2027-01-15',
  });
  expect(event.data).not.toHaveProperty('pax');
  expect(event.data).not.toHaveProperty('pickup_place');
});test('extrae titulos desde clases HTML reales de GetYourGuide', () => {
  const html = `
    <html><body>
      <div class="activity activity-title">Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an</div>
      <div class="activity activity-option-title">Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía</div>
    </body></html>
  `;

  expect(parseGetYourGuideHtmlFields(html)).toEqual({
    activity_title: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
  });
});

test('titulos HTML llegan a normalized_data sin cambiar datos operativos existentes', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-html-title-001',
    email_thread_id: 'fixture-gyg-thread-html-title-001',
    subject: 'Reserva - GYGHTMLTITLE001',
    html: `
      <html><body>
        <div class="activity activity-title">Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an</div>
        <div class="activity activity-option-title">Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía</div>
      </body></html>
    `,
    text: [
      'Referencia: GYGHTMLTITLE001',
      'Fecha: 7 de febrero de 2027',
      'Participantes: 2 adultos',
      'Lugar de recogida: Hotel Sanitizado',
      'Precio: 6760 MXN',
    ].join('\n'),
  });
  const persistible = toGetYourGuideIntegrationEvent(event);

  expect(persistible.normalized_data).toEqual(expect.objectContaining({
    activity_title: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
    option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
    date: '7 de febrero de 2027',
    pax: 2,
    pickup_place: 'Hotel Sanitizado',
    price: 6760,
    currency: 'MXN',
  }));
});

test('ausencia de clases activity-title no rompe el parser', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-no-html-title-001',
    email_thread_id: 'fixture-gyg-thread-no-html-title-001',
    subject: 'Reserva - GYGNOHTMLTITLE001',
    html: '<html><body><p>Reserva sin bloque de actividad</p></body></html>',
    text: [
      'Referencia: GYGNOHTMLTITLE001',
      'Fecha: 2027-01-15',
      'Participantes: 2 adultos',
      'Precio: 250.00 USD',
    ].join('\n'),
  });

  expect(event.data).toEqual(expect.objectContaining({
    date: '2027-01-15',
    pax: 2,
    price: 250,
    currency: 'USD',
  }));
  expect(event.data).not.toHaveProperty('activity_title');
  expect(event.data).not.toHaveProperty('option_title');
});
test('parsea customer_name con etiqueta Cliente principal en linea separada', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-customer-principal-001',
    email_thread_id: 'fixture-gyg-thread-customer-principal-001',
    subject: 'Reserva - GYGCUSTOMER001',
    text: [
      'Cliente principal',
      'Cliente Sanitizado',
      'Actividad',
      'Tour Sian Kaan Sanitizado',
      'Fecha',
      '2027-01-15',
    ].join('\n'),
  });

  expect(event.data.customer_name).toBe('Cliente Sanitizado');
  expect(event.data.tour).toBe('Tour Sian Kaan Sanitizado');
  expect(event.data.date).toBe('2027-01-15');
});

test('separa bloque Cliente principal completo sin contaminar customer_name', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-customer-block-001',
    email_thread_id: 'fixture-gyg-thread-customer-block-001',
    subject: 'Reserva - GYGCUSTOMERBLOCK001',
    text: [
      'Cliente principal',
      'Cliente Prueba GYG',
      'customer-test123@reply.getyourguide.com',
      'Teléfono: +15555550123',
      'Idioma: Inglés',
      'Idioma del tour',
      'Inglés (Guía)',
      'Fecha',
      '7 de febrero de 2027',
    ].join('\n'),
  });

  expect(event.data.customer_name).toBe('Cliente Prueba GYG');
  expect(event.data.customer_email).toBe('customer-test123@reply.getyourguide.com');
  expect(event.data.customer_phone).toBe('+15555550123');
  expect(event.data.customer_language).toBe('Inglés');
  expect(event.data.tour_language).toBe('Inglés (Guía)');
  expect(event.data.date).toBe('7 de febrero de 2027');
  expect(event.data.customer_name).not.toContain('@reply.getyourguide.com');
  expect(event.data.customer_name).not.toContain('Teléfono');
  expect(event.data.customer_name).not.toContain('Idioma');
});

test('separa bloque Cliente principal en una sola linea', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-customer-inline-001',
    email_thread_id: 'fixture-gyg-thread-customer-inline-001',
    subject: 'Reserva - GYGCUSTOMERINLINE001',
    text: [
      'Cliente principal: Cliente Prueba GYG customer-test123@reply.getyourguide.com Teléfono: +15555550123 Idioma: Inglés',
      'Idioma del tour: Inglés (Guía)',
    ].join('\n'),
  });

  expect(event.data.customer_name).toBe('Cliente Prueba GYG');
  expect(event.data.customer_email).toBe('customer-test123@reply.getyourguide.com');
  expect(event.data.customer_phone).toBe('+15555550123');
  expect(event.data.customer_language).toBe('Inglés');
  expect(event.data.tour_language).toBe('Inglés (Guía)');
});

test('bloque Cliente principal no inventa telefono ni idioma ausentes', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-customer-partial-001',
    email_thread_id: 'fixture-gyg-thread-customer-partial-001',
    subject: 'Reserva - GYGCUSTOMERPARTIAL001',
    text: [
      'Cliente principal',
      'Cliente Prueba GYG',
      'customer-test123@reply.getyourguide.com',
      'Actividad',
      'Tour Sian Kaan Sanitizado',
    ].join('\n'),
  });

  expect(event.data.customer_name).toBe('Cliente Prueba GYG');
  expect(event.data.customer_email).toBe('customer-test123@reply.getyourguide.com');
  expect(event.data).not.toHaveProperty('customer_phone');
  expect(event.data).not.toHaveProperty('customer_language');
  expect(event.data.tour).toBe('Tour Sian Kaan Sanitizado');
});

test('normalized_data conserva datos separados del cliente', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-customer-normalized-001',
    email_thread_id: 'fixture-gyg-thread-customer-normalized-001',
    subject: 'Reserva - GYGCUSTOMERNORM001',
    text: [
      'Cliente principal',
      'Cliente Prueba GYG',
      'customer-test123@reply.getyourguide.com',
      'Teléfono: +15555550123',
      'Idioma: Inglés',
      'Idioma del tour',
      'Inglés (Guía)',
    ].join('\n'),
  });
  const persistible = toGetYourGuideIntegrationEvent(event);

  expect(persistible.normalized_data).toEqual(expect.objectContaining({
    customer_name: 'Cliente Prueba GYG',
    customer_email: 'customer-test123@reply.getyourguide.com',
    customer_phone: '+15555550123',
    customer_language: 'Inglés',
    tour_language: 'Inglés (Guía)',
  }));
});
test('parsea customer_name con etiqueta Lead traveler con dos puntos', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-lead-traveler-001',
    email_thread_id: 'fixture-gyg-thread-lead-traveler-001',
    subject: 'Reserva - GYGLEAD001',
    text: [
      'Lead traveler: Cliente Sanitizado',
      'Tour language: Español',
    ].join('\n'),
  });

  expect(event.data.customer_name).toBe('Cliente Sanitizado');
});

test('diagnostica etiqueta y candidato customer_name sin exponer valores', () => {
  const diagnostics = getCustomerNameDiagnostics({
    email_message_id: 'fixture-gyg-message-customer-diagnostic-001',
    email_thread_id: 'fixture-gyg-thread-customer-diagnostic-001',
    subject: 'Reserva - GYGDIAG001',
    text: [
      'Main customer',
      'Cliente Sanitizado',
      'Fecha',
      '2027-01-15',
    ].join('\n'),
  });

  expect(diagnostics).toEqual({
    customerLabelDetected: true,
    customerValueCandidateFound: true,
    customerNamePresent: true,
    parsedDataKeys: ['customer_name', 'date'],
  });
  expect(JSON.stringify(diagnostics)).not.toContain('Cliente Sanitizado');
});

test('no inventa customer_name desde nombre de tour o firma', () => {
  const event = parseGetYourGuideEmail({
    email_message_id: 'fixture-gyg-message-no-customer-001',
    email_thread_id: 'fixture-gyg-thread-no-customer-001',
    subject: 'Reserva - GYGNOCLIENT001',
    text: [
      'Actividad',
      'Tour Sian Kaan Sanitizado',
      'Community Tours Sian Kaan',
      'Equipo de reservas',
    ].join('\n'),
  });

  expect(event.data.tour).toBe('Tour Sian Kaan Sanitizado');
  expect(event.data).not.toHaveProperty('customer_name');
});
test('parsea datos de una nueva reserva', () => {
  const event = parseGetYourGuideEmail(newBookingFixture);

  expect(event.provider).toBe('getyourguide');
  expect(event.event_type).toBe('new_booking');
  expect(event.external_booking_id).toBe('GYG123456789');
  expect(event.urgent).toBe(false);
  expect(event.data.tour).toBe("Tour Sian Ka'an Sanitizado");
  expect(event.data.option).toBe('Opción privada sanitizada');
  expect(event.data.date).toBe('2026-11-12');
  expect(event.data.start_time).toBe('08:30');
  expect(event.data.pax).toBe(4);
  expect(event.data.customer_name).toBe('Cliente Sanitizado');
  expect(event.data.customer_email).toBe('cliente.sanitizado@example.test');
  expect(event.data.customer_phone).toBe('+52 000 000 0000');
  expect(event.data.customer_language).toBe('Español');
  expect(event.data.tour_language).toBe('Español');
  expect(event.data.pickup_place).toBe('Hotel Sanitizado');
  expect(event.data.price).toBe(320.5);
  expect(event.data.currency).toBe('USD');
});

test('source_received_at tecnico no altera normalized_data.date operativo', () => {
  const event = parseGetYourGuideEmail(newBookingFixture);
  const sourceReceivedAt = new Date('2027-06-15T10:30:00.000Z');
  const persistible = toGetYourGuideIntegrationEvent(event, { source_received_at: sourceReceivedAt });

  expect(persistible.source_received_at).toBe(sourceReceivedAt);
  expect(persistible.normalized_data.date).toBe('2026-11-12');
});
test('convierte data del parser a normalized_data para persistencia', () => {
  const event = parseGetYourGuideEmail(newBookingFixture);
  const persistible = toGetYourGuideIntegrationEvent(event, {
    source_subject: event.subject,
    source_received_at: new Date('2027-01-01T00:00:00Z'),
  });

  expect(persistible).toEqual(expect.objectContaining({
    provider: 'getyourguide',
    external_event_id: 'fixture-gyg-message-new-001',
    external_thread_id: 'fixture-gyg-thread-booking-001',
    external_booking_id: 'GYG123456789',
    event_type: 'new_booking',
    urgent: false,
  }));
  expect(persistible.normalized_data).toEqual(event.data);
  expect(persistible.normalized_data).toEqual(expect.objectContaining({
    tour: "Tour Sian Ka'an Sanitizado",
    date: '2026-11-12',
    pax: 4,
    pickup_place: 'Hotel Sanitizado',
    price: 320.5,
    currency: 'USD',
  }));
  expect(persistible).not.toHaveProperty('data');
  expect(persistible).not.toHaveProperty('email_message_id');
});
test('parsea reserva urgente', () => {
  const event = parseGetYourGuideEmail(urgentBookingFixture);

  expect(event.event_type).toBe('new_booking');
  expect(event.urgent).toBe(true);
  expect(event.external_booking_id).toBe('GYG987654321');
});

test('una modificacion parcial no borra campos ausentes', () => {
  const event = parseGetYourGuideEmail(modificationFixture);

  expect(event.event_type).toBe('modification');
  expect(event.external_booking_id).toBe('GYG123456789');
  expect(event.data.pax).toBe(5);
  expect(event.data.pickup_place).toBe('Lobby Sanitizado');
  expect(event.data.date).toBeUndefined();
  expect(event.data.customer_email).toBeUndefined();
  expect(event.data.changed_fields).toEqual([
    {
      field: 'pax',
      previous_value: '4',
      new_value: '5',
    },
    {
      field: 'pickup_place',
      previous_value: 'Hotel Sanitizado',
      new_value: 'Lobby Sanitizado',
    },
  ]);
});

test('la modificacion persistible conserva solo campos parciales presentes', () => {
  const event = parseGetYourGuideEmail(modificationFixture);
  const persistible = toGetYourGuideIntegrationEvent(event);

  expect(persistible.event_type).toBe('modification');
  expect(persistible.normalized_data).toEqual({
    pax: 5,
    pickup_place: 'Lobby Sanitizado',
    changed_fields: [
      {
        field: 'pax',
        previous_value: '4',
        new_value: '5',
      },
      {
        field: 'pickup_place',
        previous_value: 'Hotel Sanitizado',
        new_value: 'Lobby Sanitizado',
      },
    ],
  });
  expect(persistible.normalized_data).not.toHaveProperty('date');
  expect(persistible.normalized_data).not.toHaveProperty('customer_name');
});
test('una cancelacion produce status cancelled', () => {
  const event = parseGetYourGuideEmail(cancellationFixture);

  expect(event.event_type).toBe('cancellation');
  expect(event.status).toBe('cancelled');
  expect(event.external_booking_id).toBe('GYG123456789');
  expect(event.data.tour).toBe("Tour Sian Ka'an Sanitizado");
  expect(event.data.customer_name).toBe('Cliente Sanitizado');
  expect(event.data.date).toBe('2026-11-12');
  expect(event.data.start_time).toBe('08:30');
});

test('dos correos diferentes con el mismo external_booking_id son eventos distintos', () => {
  const newBooking = parseGetYourGuideEmail(newBookingFixture);
  const modification = parseGetYourGuideEmail(modificationFixture);

  expect(getReservationIdentityKey(newBooking)).toBe('getyourguide:GYG123456789');
  expect(getReservationIdentityKey(modification)).toBe('getyourguide:GYG123456789');
  expect(newBooking.email_message_id).not.toBe(modification.email_message_id);
  expect(newBooking.event_type).not.toBe(modification.event_type);
});

test('el mismo email_message_id puede identificarse como correo repetido', () => {
  const firstEvent = parseGetYourGuideEmail(newBookingFixture);
  const repeatedEvent = parseGetYourGuideEmail({
    ...newBookingFixture,
    subject: 'Reserva - GYG123456789',
  });

  expect(getEmailDeduplicationKey(firstEvent)).toBe('fixture-gyg-message-new-001');
  expect(getEmailDeduplicationKey(firstEvent)).toBe(getEmailDeduplicationKey(repeatedEvent));
});
