const models = require('../models');

const PaymentHistory = models.PaymentHistory || require('../models/PaymentHistory');
const Employee = models.Employee || require('../models/Employee');
const Employer = models.Employer || require('../models/Employer');
const EmployeeSubscriptionPlan =
  models.EmployeeSubscriptionPlan || require('../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan =
  models.EmployerSubscriptionPlan || require('../models/EmployerSubscriptionPlan');

const { generateInvoiceHtml, numberToWordsInr } = require('./invoice');

const PDFDocument = require('pdfkit');
const https = require('https');
const httpMod = require('http');

const LOGO_URL =
  'https://storage.googleapis.com/rotijugaad-data/static/admin/roti_jugaad_logo.png';

const safeFileToken = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);

function fetchImageBuffer(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : httpMod;
    const req = mod.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return (
    `${String(dt.getDate()).padStart(2, '0')}/` +
    `${String(dt.getMonth() + 1).padStart(2, '0')}/` +
    `${dt.getFullYear()}`
  );
}

async function buildInvoicePdfBuffer(data) {
  const logoBuffer = await fetchImageBuffer(LOGO_URL).catch(() => null);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `Invoice ${data.inv_number || ''}` },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 40;
    const W = doc.page.width - M * 2; // ~515 pt

    function hr() {
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y).strokeColor('#000').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
    }

    function addLogo() {
      if (!logoBuffer) return;
      try {
        const lw = 80;
        const logoY = doc.y;
        doc.image(logoBuffer, M + (W - lw) / 2, logoY, { fit: [lw, lw] });
        doc.y = logoY + lw + 10;
      } catch (_) {}
    }

    // Draw label on the left and value right-aligned on the same baseline.
    function priceLine(label, value) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).text(label, M, y);
      doc.font('Helvetica').fontSize(10).text(String(value), M, y, { width: W, align: 'right' });
      doc.y = y + 16;
    }

    // ── PAGE 1 ───────────────────────────────────────────────────────────────
    addLogo();

    doc.font('Helvetica-Bold').fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(14).text('ROTI JUGAAD', { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).text(
      '1st Floor, Basera Guest House, Saharanpur-247001 (UP)',
      { align: 'center' }
    );
    doc.moveDown(0.7);

    // Invoice date (left) + invoice number (right) on same line
    const hdrY = doc.y;
    doc.font('Helvetica').fontSize(10)
       .text(`Invoice Date: ${fmtDate(data.inv_date)}`, M, hdrY);
    doc.font('Helvetica').fontSize(10)
       .text(`Invoice Number: ${data.inv_number || ''}`, M, hdrY, { width: W, align: 'right' });
    doc.y = hdrY + 18;
    doc.moveDown(0.3);

    hr();

    doc.font('Helvetica-Bold').fontSize(10).text('Organization: ', { continued: true });
    doc.font('Helvetica').text(String(data.organization || '—'));
    doc.font('Helvetica-Bold').text('Name: ', { continued: true });
    doc.font('Helvetica').text(String(data.name || '—'));
    doc.font('Helvetica-Bold').text('Bill to/Ship to Address: ', { continued: true });
    doc.font('Helvetica').text(String(data.address || '—'));
    doc.font('Helvetica-Bold').text('Salesperson: ', { continued: true });
    doc.font('Helvetica').text('Online');
    doc.moveDown(0.4);

    hr();

    // ── Subscription table ────────────────────────────────────────────────────
    const tY = doc.y;
    const rH  = 30;
    const cX  = [M, M + 36, M + 36 + W * 0.43, M + 36 + W * 0.43 + (W - 36) * 0.285];
    const cW  = [
      36,
      W * 0.43,
      (W - 36) * 0.285,
      W - 36 - W * 0.43 - (W - 36) * 0.285,
    ];

    doc.rect(M, tY, W, rH).stroke();
    ['S.No.', 'Product Subscription', 'Subscription\nStart Date', 'Subscription\nEnd Date']
      .forEach((h, i) => {
        if (i > 0) doc.moveTo(cX[i], tY).lineTo(cX[i], tY + rH).stroke();
        doc.font('Helvetica-Bold').fontSize(8.5)
           .text(h, cX[i] + 3, tY + (h.includes('\n') ? 3 : 9), {
             width: cW[i] - 6,
             align: 'center',
           });
      });

    const dY = tY + rH;
    doc.rect(M, dY, W, rH).stroke();
    [
      '1',
      String(data.subscription_name || ''),
      fmtDate(data.subscription_start),
      fmtDate(data.subscription_end),
    ].forEach((v, i) => {
      if (i > 0) doc.moveTo(cX[i], dY).lineTo(cX[i], dY + rH).stroke();
      doc.font('Helvetica').fontSize(9)
         .text(v, cX[i] + 3, dY + 10, { width: cW[i] - 6, align: 'center' });
    });

    doc.y = dY + rH + 16;

    // ── Pricing ───────────────────────────────────────────────────────────────
    priceLine('List Price INR',    String(data.list_price    || '0.00'));
    priceLine('Discount INR',      String(data.discount      || '0.00'));
    priceLine('Amount INR',        String(data.amount        || '0.00'));
    priceLine('Invoice Total INR', String(data.invoice_total || '0.00'));
    priceLine('Total (In words)',  String(data.total_word    || ''));

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(13).text('For ROTI JUGAAD', { align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('Authorised Signatory', { align: 'right' });
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Please note the following');
    doc.moveDown(0.25);
    [
      'This invoice is recognized subject to realization of payment/confirmation.',
      'Refer term and conditions attached in the next page.',
      'All disputes subject to Saharanpur Jurisdiction only.',
      'This is computer generated invoice.',
    ].forEach((note) => {
      doc.font('Helvetica-Bold').fontSize(9.5)
         .text(`•  ${note}`, M + 8, doc.y, { width: W - 8 });
      doc.moveDown(0.2);
    });

    doc.moveDown(0.5);
    const fY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('Customer Support', M, fY);
    doc.y = fY + 15;
    doc.font('Helvetica-Bold').text('Email: ', { continued: true }).font('Helvetica').text('rotijugaad@gmail.com');

    doc.font('Helvetica-Bold').fontSize(10).text(
      'Billing/Head Office\nRoti Jugaad\n1st Floor, Basera Guest House\nSaharanpur - 247001\nUttar Pradesh, India',
      M + W / 2 + 10,
      fY,
      { width: W / 2 - 10 }
    );

    // ── PAGE 2: Terms & Conditions ────────────────────────────────────────────
    doc.addPage();
    addLogo();

    doc.font('Helvetica-Bold').fontSize(18).text('Terms and Conditions', { align: 'center' });
    doc.moveDown(0.8);

    [
      'The complete Terms & Conditions (TnC) in relation to the product/services offered & accepted by the customer, and in relation to the general TnC on portal usage are available on the application (portal) for which services have been subscribed.',
      'The payment released against the invoice deems confirmation & acceptance to all the terms & conditions, as amended from time to time.',
      "The usage of the portal and its associated services constitue a binding agreement with Roti Jugaad and customer's agreement to abide by the same.",
      'The content on the portal is the property of Roti Jugaad or its content suppliers or customers. Roti Jugaad further reserves its right to post the data on the portal or on such other affiliated sites and publications as Roti Jugaad may deem fit and proper at no extra cost to the subscriber/user.',
      'Roti Jugaad reserves its right to reject any insertion or information/data provided by the subscriber without assigning any reason either before uploading or after uploading the vacancy details, but in such an eventuality, any amount so paid for shall be refunded to the subscriber on a pro-rata basis at the sole discretion of Roti Jugaad.',
      'Engaging in any conduct prohibited by law or usage of services in any manner so as to impair the interests and functioning of Roti Jugaad. or its Users may result in withdrawal of Service. If your Cheque is returned dishonored or in case of a charge back on an online transaction (including credit card payment), services will be immediately deactivated. In case of cheques dishonored, the reactiviation would be done only on payment of an additional Rs 500 per instance of dishonor.',
      'Roti Jugaad does not gaurantee (i) the quality or quantity of response to any of its services (ii) server uptime or applications working properly. All is on a best effort basis and liability is limited to refund of amount paid on pro-rated basis only. Roti Jugaad undertakes no liability for free services.',
      'The service is neither re-saleable nor transferable by the Subscriber to any other person, corporate body, firm or individual.',
      'Refund, if any shall be admissible at the sole discretion of Roti Jugaad.',
      'Laws of India as applicable shall govern. Courts in Saharanpur will have exclusive Jurisdiction in case of any dispute.',
    ].forEach((item) => {
      doc.font('Helvetica-Bold').fontSize(10)
         .text(`•  ${item}`, M + 8, doc.y, { width: W - 8 });
      doc.moveDown(0.45);
    });

    doc.end();
  });
}

const sendInvoicePdfForPaymentHistoryRow = async (row, res) => {
  let plan = null;
  if (row.user_type === 'employee' && EmployeeSubscriptionPlan) {
    plan = await EmployeeSubscriptionPlan.findByPk(row.plan_id, { paranoid: true });
  } else if (row.user_type === 'employer' && EmployerSubscriptionPlan) {
    plan = await EmployerSubscriptionPlan.findByPk(row.plan_id, { paranoid: true });
  }

  let entity = null;
  if (row.user_type === 'employee' && Employee) {
    entity = await Employee.findByPk(row.user_id, { paranoid: true });
  } else if (row.user_type === 'employer' && Employer) {
    entity = await Employer.findByPk(row.user_id, { paranoid: true });
  }

  const invoiceNumber = row.invoice_number || `INV-${row.id}`;
  const invDate = row.created_at || new Date();

  const planName =
    plan?.plan_name_english ||
    plan?.plan_name_hindi ||
    (row.plan_id ? `Plan #${row.plan_id}` : 'Subscription');
  const subsStart = row.created_at || new Date();
  const subsEnd = row.expiry_at || row.created_at || new Date();

  const listPrice = Number(plan?.plan_price ?? row.price_total ?? 0);
  const invoiceTotal = Number(row.price_total ?? 0);
  const discount = Math.max(0, Number((listPrice - invoiceTotal).toFixed(2)));

  const organization =
    row.user_type === 'employer' ? entity?.organization_name || '—' : '—';
  const name = entity?.name || '—';
  const address = row.user_type === 'employer' ? entity?.address || '—' : '—';

  const invoiceData = {
    Order_ID: row.order_id || '',
    inv_date: invDate,
    inv_number: invoiceNumber,
    name,
    address,
    subscription_name: planName,
    subscription_start: subsStart,
    subscription_end: subsEnd,
    list_price: listPrice.toFixed(2),
    discount: discount.toFixed(2),
    amount: invoiceTotal.toFixed(2),
    invoice_total: invoiceTotal.toFixed(2),
    organization,
    total_word: numberToWordsInr(invoiceTotal),
  };

  try {
    const pdfBuffer = await buildInvoicePdfBuffer(invoiceData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="invoice-${safeFileToken(invoiceNumber)}.pdf"`,
    );
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error('[invoicePdf] pdfkit error:', e);
    // Last resort HTML fallback (only if pdfkit itself throws)
    const html = generateInvoiceHtml(invoiceData);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
};

const sendInvoicePdfByPaymentHistoryId = async (paymentHistoryId, res) => {
  if (!PaymentHistory) {
    return res
      .status(500)
      .json({ success: false, message: 'PaymentHistory model not loaded' });
  }

  const id = Number(paymentHistoryId);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid id' });
  }

  const row = await PaymentHistory.findByPk(id, { paranoid: true });
  if (!row) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  return sendInvoicePdfForPaymentHistoryRow(row, res);
};

module.exports = {
  sendInvoicePdfForPaymentHistoryRow,
  sendInvoicePdfByPaymentHistoryId,
};
