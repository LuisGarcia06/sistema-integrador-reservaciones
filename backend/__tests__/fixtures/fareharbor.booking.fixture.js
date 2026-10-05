const crearBookingFareHarborSanitizado = (sobrescrituras = {}) => ({
    pk: 10001,
    uuid: '11111111-2222-4333-8444-555555555555',
    display_id: 'FH-TEST-001',
    status: 'booked',
    contact: {
        name: 'Cliente Demo',
        phone: '+520000000000',
        email: 'cliente.demo@example.test'
    },
    ...sobrescrituras
});

const crearPayloadWebhookFareHarborSanitizado = (sobrescriturasBooking = {}) => ({
    booking: crearBookingFareHarborSanitizado(sobrescriturasBooking)
});

module.exports = {
    crearBookingFareHarborSanitizado,
    crearPayloadWebhookFareHarborSanitizado
};
