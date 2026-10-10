const crearBookingFareHarborSanitizado = (sobrescrituras = {}) => ({
    pk: 10001,
    uuid: '11111111-2222-4333-8444-555555555555',
    display_id: 'FH-TEST-001',
    status: 'booked',
    created_at: '2026-10-10T09:00:00-0500',
    customer_count: 2,
    availability: {
        pk: 70001,
        start_at: '2026-10-12T08:00:00-0500',
        end_at: '2026-10-12T12:00:00-0500',
        item: {
            pk: 77,
            name: 'Tour Sian Kaan',
            headline: 'Tour corto'
        }
    },
    contact: {
        name: 'Cliente Demo',
        phone: '+520000000000',
        normalized_phone: '+520000000000',
        email: 'cliente.demo@example.test'
    },
    customers: [
        {
            customer_type_rate: {
                customer_type: {
                    pk: 1,
                    singular: 'Adult',
                    plural: 'Adults'
                }
            }
        },
        {
            customer_type_rate: {
                customer_type: {
                    pk: 1,
                    singular: 'Adult',
                    plural: 'Adults'
                }
            }
        }
    ],
    pickup: null,
    lodging: null,
    arrival: null,
    invoice_price: '100.00',
    receipt_total: '100.00',
    amount_paid: '100.00',
    company: {
        currency: 'mxn'
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
