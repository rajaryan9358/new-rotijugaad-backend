const https = require('https');

// Static OTP bypass for test numbers: mobile → otp
const STATIC_OTP_NUMBERS = {
  '9358174783': '1234',
};
const STATIC_SESSION_PREFIX = 'STATIC_OTP__';

const DEFAULT_TWO_FACTOR_API_KEY = '30741216-ba46-11eb-8089-0200cd936042';
const DEFAULT_TEMPLATE = 'AUTOGEN3';
const DEFAULT_OTP_MESSAGE = 'OTP MESSAGE';
const DEFAULT_OTP_LENGTH = 4;

function getTwoFactorApiKey() {
  return (
    process.env.TWO_FACTOR_API_KEY ||
    process.env.TWOFACTOR_API_KEY ||
    DEFAULT_TWO_FACTOR_API_KEY
  );
}

function getOtpTemplateName() {
  return process.env.TWO_FACTOR_TEMPLATE || DEFAULT_TEMPLATE;
}

function getOtpMessageToken() {
  return process.env.TWO_FACTOR_OTP_MESSAGE || DEFAULT_OTP_MESSAGE;
}

function getExpectedOtpLength() {
  const parsed = Number.parseInt(process.env.TWO_FACTOR_OTP_LENGTH || '', 10);
  return Number.isInteger(parsed) && parsed >= 4 && parsed <= 6
    ? parsed
    : DEFAULT_OTP_LENGTH;
}

async function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { Accept: 'application/json' } },
      (response) => {
        let body = '';

        response.on('data', (chunk) => {
          body += chunk;
        });

        response.on('end', () => {
          let payload = null;
          try {
            payload = body ? JSON.parse(body) : null;
          } catch (_error) {
            payload = null;
          }

          if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
            const message = payload?.Details || payload?.details || payload?.message || `HTTP ${response.statusCode}`;
            const error = new Error(message);
            error.statusCode = response.statusCode;
            error.payload = payload;
            reject(error);
            return;
          }

          resolve(payload);
        });
      }
    );

    request.on('error', reject);
  });
}

async function postFormJson(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
    };

    const request = https.request(options, (response) => {
      let responseBody = '';

      response.on('data', (chunk) => {
        responseBody += chunk;
      });

      response.on('end', () => {
        let payload = null;
        try {
          payload = responseBody ? JSON.parse(responseBody) : null;
        } catch (_error) {
          payload = null;
        }

        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          const message = payload?.Details || payload?.details || payload?.message || `HTTP ${response.statusCode}`;
          const error = new Error(message);
          error.statusCode = response.statusCode;
          error.payload = payload;
          reject(error);
          return;
        }

        resolve(payload);
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function sendTransactionalSms({ mobile, from, msg }) {
  const apiKey = getTwoFactorApiKey();
  const senderFrom = from || process.env.TWO_FACTOR_SENDER_ID || 'ROTIJG';
  const safeMobile = String(mobile || '').trim();

  const params = new URLSearchParams({
    module: 'TRANS_SMS',
    apikey: apiKey,
    to: safeMobile,
    from: senderFrom,
    msg,
  });

  const url = `https://2factor.in/API/R1/?${params.toString()}`;
  const payload = await requestJson(url);

  if (String(payload?.Status || '').toLowerCase() !== 'success') {
    throw new Error(payload?.Details || payload?.details || 'Failed to send transactional SMS');
  }

  return { raw: payload };
}

async function sendOtp(mobile, { template: templateOverride } = {}) {
  const safeMobile = String(mobile || '').trim();

  if (STATIC_OTP_NUMBERS[safeMobile]) {
    return {
      sessionId: `${STATIC_SESSION_PREFIX}${safeMobile}`,
      raw: null,
    };
  }

  const apiKey = getTwoFactorApiKey();
  const template = encodeURIComponent(templateOverride || getOtpTemplateName());
  const otpMessage = encodeURIComponent(getOtpMessageToken());

  const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(safeMobile)}/${template}/${otpMessage}`;
  const payload = await requestJson(url);

  if (String(payload?.Status || '').toLowerCase() !== 'success') {
    throw new Error(payload?.Details || 'Failed to send OTP');
  }

  const sessionId = String(payload?.Details || '').trim();
  if (!sessionId) {
    throw new Error('OTP session id not received');
  }

  return {
    sessionId,
    raw: payload,
  };
}

async function verifyOtp(sessionId, otp) {
  const safeSessionId = String(sessionId || '').trim();
  const safeOtp = String(otp || '').replace(/\D+/g, '').trim();

  if (safeSessionId.startsWith(STATIC_SESSION_PREFIX)) {
    const mobile = safeSessionId.slice(STATIC_SESSION_PREFIX.length);
    const expectedOtp = STATIC_OTP_NUMBERS[mobile];
    const matched = !!expectedOtp && safeOtp === expectedOtp;
    return {
      matched,
      details: matched ? 'OTP Matched' : 'OTP Mismatch',
      raw: null,
    };
  }

  const apiKey = getTwoFactorApiKey();
  const expectedOtpLength = getExpectedOtpLength();

  if (safeOtp.length !== expectedOtpLength) {
    return {
      matched: false,
      details: `OTP must be ${expectedOtpLength} digits`,
      raw: null,
    };
  }

  const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/VERIFY/${encodeURIComponent(safeSessionId)}/${encodeURIComponent(safeOtp)}`;
  let payload;

  try {
    payload = await requestJson(url);
  } catch (error) {
    const details = String(error?.payload?.Details || error?.message || '').trim();
    if (/length mismatch/i.test(details)) {
      return {
        matched: false,
        details: `OTP must be ${expectedOtpLength} digits`,
        raw: error?.payload || null,
      };
    }
    // Any other 2Factor API error (expired session, invalid session, etc.)
    return {
      matched: false,
      details: details || 'OTP verification failed',
      raw: error?.payload || null,
    };
  }

  const status = String(payload?.Status || '').toLowerCase();
  const details = String(payload?.Details || '').trim();
  const matched = status === 'success' && details.toLowerCase() === 'otp matched';

  return {
    matched,
    details,
    raw: payload,
  };
}

module.exports = {
  sendOtp,
  verifyOtp,
  sendTransactionalSms,
};