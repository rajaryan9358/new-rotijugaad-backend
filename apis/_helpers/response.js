const MEDIA_FIELD_NAMES = new Set([
  'image',
  'image_url',
  'profile_image',
  'selfie_link',
  'document_link',
  'logo_link',
  'experience_certificate',
  'url',
]);

const RELATIVE_MEDIA_PATH_REGEX = /^(?:\/)?uploads\//i;
const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getRequestOrigin(req) {
  const envBaseUrl = stripTrailingSlash(
    process.env.API_PUBLIC_BASE_URL
    || process.env.BACKEND_BASE_URL
    || process.env.PUBLIC_BASE_URL
  );
  if (envBaseUrl) return envBaseUrl;

  // if (process.env.NODE_ENV !== 'production') {
  //   return stripTrailingSlash(process.env.TEST_BACKEND_BASE_URL || 'http://192.168.1.5:5001');
  // }

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req?.get?.('host') || req?.headers?.host || '';
  const proto = forwardedProto || req?.protocol || 'https';

  return host ? `${proto}://${host}` : '';
}

function toAbsoluteMediaUrl(req, value) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed || ABSOLUTE_URL_REGEX.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (!RELATIVE_MEDIA_PATH_REGEX.test(trimmed)) {
    return trimmed;
  }

  const origin = getRequestOrigin(req);
  if (!origin) return trimmed;

  return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function normalizeMediaFields(req, value, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMediaFields(req, item, parentKey));
  }

  if (value && typeof value === 'object') {
    const plainValue = typeof value.toJSON === 'function' ? value.toJSON() : value;

    if (!plainValue || typeof plainValue !== 'object' || Array.isArray(plainValue)) {
      return normalizeMediaFields(req, plainValue, parentKey);
    }

    const output = {};

    for (const [key, nestedValue] of Object.entries(plainValue)) {
      if (typeof nestedValue === 'string' && MEDIA_FIELD_NAMES.has(key)) {
        output[key] = toAbsoluteMediaUrl(req, nestedValue);
      } else {
        output[key] = normalizeMediaFields(req, nestedValue, key);
      }
    }

    return output;
  }

  if (typeof value === 'string' && MEDIA_FIELD_NAMES.has(parentKey)) {
    return toAbsoluteMediaUrl(req, value);
  }

  return value;
}

function sendApiResponse(res, { ok, code, message, data = null }) {
  // Mobile API convention: always return HTTP 200, encode outcome in payload.
  return res.status(200).json({
    status: ok ? 'success' : 'failed',
    code,
    message,
    data: normalizeMediaFields(res?.req, data),
  });
}

function isTruthyEnv(value) {
  return String(value || '').toLowerCase() === 'true';
}

module.exports = {
  sendApiResponse,
  isTruthyEnv,
  getRequestOrigin,
};
