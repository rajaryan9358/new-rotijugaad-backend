const {
  extractOrderId,
  syncSubscriptionPaymentByOrderId,
} = require('../../utils/cashfreeSubscriptionPayments');

const {
  sendInvoicePdfByPaymentHistoryId,
} = require('../../utils/invoicePdf');

const {
  notifySubscriptionPaymentStatus,
} = require('../../utils/systemNotifications');

async function cashfreeWebhook(req, res) {
  try {
    const orderId = extractOrderId(req.body || {});
    if (!orderId) {
      return res.status(200).json({ received: false, message: 'Order id not found' });
    }

    const result = await syncSubscriptionPaymentByOrderId(orderId, {
      webhookPayload: req.body || {},
      paymentSignature:
        req.headers['x-webhook-signature'] ||
        req.headers['x-cf-signature'] ||
        null,
    });

    try {
      const nextStatus = String(result?.next_status || result?.data?.payment_status || '')
        .trim()
        .toLowerCase();
      const shouldNotify =
        Boolean(result?.found) &&
        Boolean(result?.status_changed) &&
        (nextStatus === 'success' || nextStatus === 'failed');

      if (shouldNotify) {
        await notifySubscriptionPaymentStatus({
          userType: result?.data?.user_type,
          userId: result?.data?.user_id,
          outcome: nextStatus,
          orderId: result?.data?.order_id || orderId,
        });
      }
    } catch (notifyError) {
      console.error('[app/payments/cashfree/webhook][notify]', notifyError);
    }

    return res.status(200).json({
      received: true,
      synced: Boolean(result?.found),
      data: result?.data || null,
    });
  } catch (error) {
    console.error('[app/payments/cashfree/webhook]', error);
    return res.status(200).json({
      received: false,
      message: error.message || 'Failed to process webhook',
    });
  }
}

async function getPaymentInvoicePdf(req, res) {
  try {
    const paymentHistoryId = req.params?.paymentHistoryId;
    return await sendInvoicePdfByPaymentHistoryId(paymentHistoryId, res);
  } catch (error) {
    console.error('[app/payments/invoice]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate invoice',
    });
  }
}

module.exports = {
  cashfreeWebhook,
  getPaymentInvoicePdf,
};