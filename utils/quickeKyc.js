const https = require('https');

const QUICK_EKYC_BASE_URL = 'https://api.quickekyc.com/api/v1/aadhaar-v2';
const QUICK_EKYC_SANDBOX_BASE_URL = 'https://sandbox.quickekyc.com/api/v1/aadhaar-v2';
const DEFAULT_QUICK_EKYC_API_KEY = '24506740-88a3-4a65-b170-cd96b11acd5a';

function getQuickEkycApiKey() {
  return (
    process.env.QUICKEKYC_API_KEY ||
    process.env.QUICK_EKYC_API_KEY ||
    DEFAULT_QUICK_EKYC_API_KEY
  );
}

function getMessage(payload, fallback) {
  return (
    payload?.message ||
    payload?.Message ||
    payload?.details ||
    payload?.Details ||
    payload?.error ||
    payload?.error_message ||
    payload?.data?.message ||
    payload?.data?.details ||
    fallback
  );
}

function getRequestId(payload) {
  const candidates = [
    payload?.request_id,
    payload?.requestId,
    payload?.data?.request_id,
    payload?.data?.requestId,
    payload?.result?.request_id,
    payload?.result?.requestId,
  ];

  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }

  return null;
}

function hasFailureSignal(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.success === false || payload.ok === false || payload.error === true) return true;
  if (Array.isArray(payload.errors) && payload.errors.length) return true;
  if (payload.error_code || payload.errorCode) return true;

  const values = [
    payload.status,
    payload.Status,
    payload.message,
    payload.Message,
    payload.details,
    payload.Details,
    payload.data?.status,
    payload.data?.message,
    payload.data?.details,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return values.some((value) => /fail|error|invalid|incorrect|mismatch|expired|reject/.test(value));
}

function getBaseUrl() {
  if (process.env.QUICKEKYC_BASE_URL) return process.env.QUICKEKYC_BASE_URL;
  if (process.env.QUICKEKYC_SANDBOX === 'true') return QUICK_EKYC_SANDBOX_BASE_URL;
  return QUICK_EKYC_BASE_URL;
}

async function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const url = new URL(getBaseUrl().replace(/\/$/, '') + '/' + path.replace(/^\//, ''));

    const request = https.request(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let responseBody = '';

        response.on('data', (chunk) => {
          responseBody += chunk;
        });

        response.on('end', () => {
          let parsed = null;

          try {
            parsed = responseBody ? JSON.parse(responseBody) : null;
          } catch (_error) {
            parsed = null;
          }

          if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
            const error = new Error(getMessage(parsed, `HTTP ${response.statusCode}`));
            error.statusCode = response.statusCode;
            error.payload = parsed;
            reject(error);
            return;
          }

          resolve(parsed);
        });
      }
    );

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function generateAadhaarOtp(aadhaarNumber) {
  const apiKey = getQuickEkycApiKey();
  const baseUrl = getBaseUrl();
  console.log('[quickeKyc] generateAadhaarOtp url:', baseUrl + '/generate-otp', '| key:', apiKey);

  const payload = await postJson('/generate-otp', {
    key: apiKey,
    id_number: String(aadhaarNumber || '').trim(),
  });

  console.log('[quickeKyc] generateAadhaarOtp response:', JSON.stringify(payload));

  if (hasFailureSignal(payload)) {
    throw new Error(getMessage(payload, 'Failed to send Aadhaar OTP'));
  }

  const requestId = getRequestId(payload);
  if (!requestId) {
    throw new Error('Aadhaar request id not received');
  }

  return {
    requestId,
    raw: payload,
  };
}

async function verifyAadhaarOtp(requestId, otp) {
  const payload = await postJson('/submit-otp', {
    key: getQuickEkycApiKey(),
    request_id: String(requestId || '').trim(),
    otp: String(otp || '').trim(),
  });

  console.log('[quickeKyc] verifyAadhaarOtp response:', JSON.stringify(payload));

  const matched = !hasFailureSignal(payload);
  const fullName = String(payload?.data?.full_name || '').trim() || null;
  const dob = String(payload?.data?.dob || payload?.data?.date_of_birth || '').trim() || null;

  return {
    matched,
    fullName,
    dob,
    details: getMessage(payload, matched ? 'Aadhaar OTP verified successfully' : 'Aadhaar OTP verification failed'),
    raw: payload,
  };
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

module.exports = {
  generateAadhaarOtp,
  verifyAadhaarOtp,
  namesMatch,
};