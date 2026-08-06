const express = require('express');
const { cashfreeWebhook, getPaymentInvoicePdf } = require('./payments.controller');

const router = express.Router();

// POST /api/app/payments/cashfree/webhook
router.post('/cashfree/webhook', cashfreeWebhook);

// GET /api/app/payments/invoice/:paymentHistoryId
router.get('/invoice/:paymentHistoryId', getPaymentInvoicePdf);

module.exports = router;
