const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const models = require('../models');
const PaymentHistory = models.PaymentHistory || require('../models/PaymentHistory');
const { sendInvoicePdfForPaymentHistoryRow } = require('../utils/invoicePdf');

// INV-EMPLOYEE-{userId}-{timestamp} or INV-EMPLOYER-{userId}-{timestamp}
const INV_FULL_RE = /^INV-(EMPLOYEE|EMPLOYER)-(\d+)-(\d+)$/i;
// Legacy short form: INV-{id}
const INV_SHORT_RE = /^INV-(\d+)$/i;

/**
 * GET /invoice/:invoiceNumber
 * Public invoice PDF — no auth required.
 * Supports:
 *   INV-{id}
 *   INV-EMPLOYEE-{userId}-{timestamp}
 *   INV-EMPLOYER-{userId}-{timestamp}
 *   Any string stored in the invoice_number column
 */
router.get('/:invoiceNumber', async (req, res) => {
  try {
    const raw = String(req.params.invoiceNumber || '').trim();
    if (!raw) return res.status(400).json({ success: false, message: 'Invalid invoice number' });

    let row = null;

    // 1. Short numeric form: INV-{id}
    const shortMatch = raw.match(INV_SHORT_RE);
    if (shortMatch) {
      row = await PaymentHistory.findByPk(shortMatch[1], { paranoid: true });
    }

    // 2. Look up by invoice_number column (may not exist if migration is pending)
    if (!row) {
      try {
        row = await PaymentHistory.findOne({ where: { invoice_number: raw }, paranoid: true });
      } catch (_e) {
        // Column doesn't exist yet — fall through to format-based lookup
      }
    }

    // 3. Parse INV-{TYPE}-{userId}-{timestamp} and find the matching payment record
    if (!row) {
      const fullMatch = raw.match(INV_FULL_RE);
      if (fullMatch) {
        const userType = fullMatch[1].toLowerCase(); // 'employee' or 'employer'
        const userId = parseInt(fullMatch[2], 10);
        const ts = parseInt(fullMatch[3], 10);

        // Search within ±5 minutes of the embedded timestamp
        const tsDate = new Date(ts);
        const from = new Date(tsDate.getTime() - 5 * 60 * 1000);
        const to = new Date(tsDate.getTime() + 5 * 60 * 1000);

        row = await PaymentHistory.findOne({
          where: {
            user_type: userType,
            user_id: userId,
            created_at: { [Op.between]: [from, to] },
          },
          order: [['created_at', 'DESC']],
          paranoid: true,
        });

        // Wider fallback: any record for this user, most recent
        if (!row) {
          row = await PaymentHistory.findOne({
            where: { user_type: userType, user_id: userId },
            order: [['created_at', 'DESC']],
            paranoid: true,
          });
        }
      }
    }

    if (!row) return res.status(404).send('Invoice not found');

    return await sendInvoicePdfForPaymentHistoryRow(row, res);
  } catch (e) {
    console.error('[public-invoice] error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
