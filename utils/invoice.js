const escapeHtml = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatDmy = (dateLike) => {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};

// Minimal INR number-to-words (Indian system) for invoice totals.
const numberToWordsInr = (amount) => {
  const nRaw = Number(amount);
  if (!Number.isFinite(nRaw)) return '';

  const rupees = Math.floor(nRaw);
  const paise = Math.round((nRaw - rupees) * 100);

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (num) => {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return `${tens[t]}${o ? ' ' + ones[o] : ''}`.trim();
  };

  const threeDigits = (num) => {
    if (num === 0) return '';
    const h = Math.floor(num / 100);
    const r = num % 100;
    const hPart = h ? `${ones[h]} Hundred` : '';
    const rPart = r ? twoDigits(r) : '';
    return `${hPart}${hPart && rPart ? ' ' : ''}${rPart}`.trim();
  };

  const toIndianWords = (num) => {
    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    num = num % 10000000;
    const lakh = Math.floor(num / 100000);
    num = num % 100000;
    const thousand = Math.floor(num / 1000);
    num = num % 1000;
    const hundredPart = num; // 0-999

    const parts = [];
    if (crore) parts.push(`${twoDigits(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (hundredPart) parts.push(threeDigits(hundredPart));

    return parts.join(' ').trim();
  };

  const rupeesWords = `Rupees ${toIndianWords(rupees)}`.trim();
  const paiseWords = paise ? ` and Paise ${twoDigits(paise)}` : '';
  return `${rupeesWords}${paiseWords} Only`;
};

const generateInvoiceHtml = (data) => {
  const invoiceDate = formatDmy(data.inv_date);
  const subsStart = formatDmy(data.subscription_start);
  const subsEnd = formatDmy(data.subscription_end);

  const totalWord = data.total_word || numberToWordsInr(data.invoice_total);

  const invoiceNumber = escapeHtml(data.inv_number || '');
  const organization = escapeHtml(data.organization || '');
  const name = escapeHtml(data.name || '');
  const address = escapeHtml(data.address || '');

  const subsName = escapeHtml(data.subscription_name || '');

  const listPrice = escapeHtml(data.list_price ?? '');
  const discount = escapeHtml(data.discount ?? '');
  const amount = escapeHtml(data.amount ?? '');
  const invoiceTotal = escapeHtml(data.invoice_total ?? '');

  return `<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>Invoice</title>
  <style>
    *, body { margin: 0; padding: 0; }
    .mt-16 { margin-top: 16px; }
    .mt-8 { margin-top: 8px; }
    .mt-4 { margin-top: 4px; }
    table, th, td { border: 1px solid black; border-collapse: collapse; }
    th, td { padding: 20px; }
    @media print {
      .pagebreak { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div style='margin: 40px; text-align: center'>
    <img style='justify-content: center; align-items: center' src='https://storage.googleapis.com/rotijugaad-data/static/admin/roti_jugaad_logo.png' height='100px' alt='' />
    <h2 class='mt-8'>INVOICE</h2>
    <h3 class='mt-4'>ROTI JUGAAD</h3>
    <h4 class='mt-4'> 1<sup>st</sup> FLoor, Basera Guest House, Saharanpur-247001 (UP) </h4>

    <div class='mt-16' style='display: grid; grid-template-columns: auto auto'>
      <div style='grid-column: 1/2; text-align: start'><b>Invoice Date : </b>${escapeHtml(invoiceDate)}</div>
      <div style='grid-column: 2/2; text-align: end'><b>Invoice Number:</b>${invoiceNumber}</div>
    </div>

    <hr style='margin-top: 20px' />

    <div style='text-align: start'>
      <div class='mt-8'><b>Organization : </b>${organization}</div>
      <div class='mt-8'><b>Name: </b>${name}</div>
      <div class='mt-8'><b>Bill to/Ship to Address: </b>${address}</div>
      <div class='mt-8'><b>Salesperson: </b>Online</div>
    </div>

    <hr style='margin-top: 10px' />

    <table style='width: 100%; margin-top: 10px'>
      <thead>
        <th>S. No.</th>
        <th>Product Subscription</th>
        <th>Subscription Start Date</th>
        <th>Subscription End Date</th>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>${subsName}</td>
          <td>${escapeHtml(subsStart)}</td>
          <td>${escapeHtml(subsEnd)}</td>
        </tr>
      </tbody>
    </table>

    <div style='display: grid; grid-template-columns: auto auto; gap: 16px; margin-top: 20px;'>
      <div style='grid-column: 1/2; text-align: start'><b>List Price INR</b></div>
      <div style='grid-column: 2/2; text-align: end'>${listPrice}</div>

      <div style='grid-column: 1/2; text-align: start'><b>Discount INR</b></div>
      <div style='grid-column: 2/2; text-align: end'>${discount}</div>

      <div style='grid-column: 1/2; text-align: start'><b>Amount INR</b></div>
      <div style='grid-column: 2/2; text-align: end'>${amount}</div>

      <div style='grid-column: 1/2; text-align: start'><b>Invoice Total INR</b></div>
      <div style='grid-column: 2/2; text-align: end'>${invoiceTotal}</div>

      <div style='grid-column: 1/2; text-align: start'><b>Total (In words)</b></div>
      <div style='grid-column: 2/2; text-align: end'>${escapeHtml(totalWord)}</div>
    </div>

    <div style='text-align: end; margin-top: 20px; font-weight: 800; font-size: 18px;'>For ROTI JUGAAD</div>
    <div style='text-align: end; margin-top: 20px; font-weight: 800; font-size: 16px;'>Authorised Signatory</div>

    <div style='text-align: start; margin-top: 20px; font-weight: 800; font-size: 16px;'>Please note the following</div>
    <ul style='text-align: start; font-weight: 800'>
      <li style='margin-top: 8px'>This invoice is recognized subject to realization of payment/confirmation.</li>
      <li style='margin-top: 4px'>Refer term and conditions attached in the next page.</li>
      <li style='margin-top: 4px'>All disputes subject to Saharanpur Jurisdiction only.</li>
      <li style='margin-top: 4px'>This is computer generated invoice.</li>
    </ul>

    <div style='display: flex; flex-direction: row; justify-content: space-between; margin-top: 20px;'>
      <div style='text-align: start'>
        <b>Customer Support</b><br /><br /><b>Email:</b> rotijugaad@gmail.com
      </div>
      <div style='text-align: start'>
        <b>Billing/Head Office<br />Roti Jugaad<br />1st Floor, Basera Guest House<br />Saharanpur - 247001<br />Uttar Pradesh, India</b>
      </div>
    </div>
  </div>

  <div class='pagebreak'></div>

  <div style='margin: 40px; text-align: center'>
    <img style='justify-content: center; align-items: center' src='https://storage.googleapis.com/rotijugaad-data/static/admin/roti_jugaad_logo.png' height='100px' alt='' />
    <h2 style='margin-top: 20px;'>Terms and Conditions</h2>
    <ul style='text-align: start; font-weight: 800; margin-top: 30px; font-size: 17px;'>
      <li class='mt-4'>The complete Terms & Conditions (TnC) in relation to the product/services offered & accepted by the customer, and in relation to the general TnC on portal usage are available on the application (portal) for which services have been subscribed.</li>
      <li class='mt-4'>The payment released against the invoice deems confirmation & acceptance to all the terms & conditions, as amended from time to time.</li>
      <li class='mt-4'>The usage of the portal and its associated services constitue a binding agreement with Roti Jugaad and customer's agreement to abide by the same.</li>
      <li class='mt-4'>The content on the portal is the property of Roti Jugaad or its content suppliers or customers. Roti Jugaad further reserves its right to post the data on the portal or on such other affiliated sites and publications as Roti Jugaad may deem fit and proper at no extra cost to the subscriber/user.</li>
      <li class='mt-4'>Roti Jugaad reserves its right to reject any insertion or information/data provided by the subscriber without assigning any reason either before uploading or after uploading the vacancy details, but in such an eventuality, any amount so paid for shall be refunded to the subscriber on a pro-rata basis at the sole discretion of Roti Jugaad.</li>
      <li class='mt-4'>Engaging in any conduct prohibited by law or usage of services in any manner so as to impair the interests and functioning of Roti Jugaad. or its Users may result in withdrawal of Service. If your Cheque is returned dishonored or in case of a charge back on an online transaction (including credit card payment), services will be immediately deactivated. In case of cheques dishonored, the reactiviation would be done only on payment of an additional Rs 500 per instance of dishonor.</li>
      <li class='mt-4'>Roti Jugaad does not gaurantee (i) the quality or quantity of response to any of its services (ii) server uptime or applications working properly. All is on a best effort basis and liability is limited to refund of amount paid on pro-rated basis only. Roti Jugaad undertakes no liability for free services.</li>
      <li class='mt-4'>The service is neither re-saleable nor transferable by the Subscriber to any other person, corporate body, firm or individual.</li>
      <li class='mt-4'>Refund, if any shall be admissible at the sole discretion of Roti Jugaad.</li>
      <li class='mt-4'>Laws of India as applicable shall govern. Courts in Saharanpur will have exclusive Jurisdiction in case of any dispute.</li>
    </ul>
  </div>
</body>
</html>`;
};

module.exports = {
  generateInvoiceHtml,
  numberToWordsInr,
};
