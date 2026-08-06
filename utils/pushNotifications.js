const fs = require('fs');
const path = require('path');

let admin;

function requireFirebaseAdmin() {
  if (admin) return admin;
  // Lazy require so backend can still boot without firebase-admin in some envs.
  // eslint-disable-next-line global-require
  admin = require('firebase-admin');
  return admin;
}

function getServiceAccountPath() {
  const fromEnv = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (fromEnv) return path.resolve(fromEnv);

  return path.join(
    __dirname,
    'rotijugaad-firebase-adminsdk-w9dyi-502a6964ca.json'
  );
}

function initFirebaseAdmin() {
  const fb = requireFirebaseAdmin();

  if (fb.apps && fb.apps.length) {
    return fb.app();
  }

  const jsonPath = getServiceAccountPath();
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const serviceAccount = JSON.parse(raw);

  return fb.initializeApp({
    credential: fb.credential.cert(serviceAccount),
  });
}

function normalizeToken(token) {
  const t = String(token || '').trim();
  return t || null;
}

function normalizeTokens(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];
  const out = [];
  const seen = new Set();

  for (const token of list) {
    const t = normalizeToken(token);
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }

  return out;
}

function normalizeData(data) {
  if (!data || typeof data !== 'object') return undefined;

  const out = {};
  Object.entries(data).forEach(([k, v]) => {
    const key = String(k || '').trim();
    if (!key) return;
    if (v === undefined || v === null) return;
    out[key] = String(v);
  });

  return Object.keys(out).length ? out : undefined;
}

async function sendSingleNotification({ title, message, token, data }) {
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  const tok = normalizeToken(token);
  if (!t) throw new Error('title is required');
  if (!m) throw new Error('message is required');
  if (!tok) throw new Error('token is required');

  initFirebaseAdmin();
  const fb = requireFirebaseAdmin();

  const payload = {
    token: tok,
    notification: { title: t, body: m },
    data: normalizeData(data),
  };

  const messageId = await fb.messaging().send(payload);
  return { messageId };
}

async function sendMultipleNotification({ title, message, tokens, data }) {
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  const tokenList = normalizeTokens(tokens);
  if (!t) throw new Error('title is required');
  if (!m) throw new Error('message is required');
  if (!tokenList.length) throw new Error('tokens are required');

  initFirebaseAdmin();
  const fb = requireFirebaseAdmin();

  // FCM multicast limit is 500 tokens per request.
  const chunks = [];
  for (let i = 0; i < tokenList.length; i += 500) {
    chunks.push(tokenList.slice(i, i + 500));
  }

  const result = {
    requested: tokenList.length,
    successCount: 0,
    failureCount: 0,
    responses: [],
  };

  const normalizedData = normalizeData(data);

  for (const chunk of chunks) {
    // sendEachForMulticast returns per-token responses (success/failure)
    // eslint-disable-next-line no-await-in-loop
    const r = await fb.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title: t, body: m },
      data: normalizedData,
    });

    result.successCount += r.successCount || 0;
    result.failureCount += r.failureCount || 0;

    // Keep a lightweight error summary (avoid logging tokens)
    const errors = (r.responses || [])
      .map((resp, idx) => (resp.success ? null : {
        index: idx,
        error: resp.error ? String(resp.error.message || resp.error) : 'Unknown error',
        code: resp.error?.code || null,
      }))
      .filter(Boolean);

    if (errors.length) {
      console.error('[pushNotifications] FCM failures:', JSON.stringify(errors));
    }

    result.responses.push({
      requested: chunk.length,
      successCount: r.successCount || 0,
      failureCount: r.failureCount || 0,
      errors,
    });
  }

  return result;
}

module.exports = {
  initFirebaseAdmin,
  sendSingleNotification,
  sendMultipleNotification,
};
