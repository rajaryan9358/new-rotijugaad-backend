const jwt = require('jsonwebtoken');

// Keep consistent with middleware/auth.js + routes/auth.js.
const JWT_SECRET = process.env.JWT_SECRET || 'rotijugaad-secret';

const toPositiveIntOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getBearerToken = (req) => {
  const authHeader = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7).trim() || null;
};

const extractAdminIdFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  return (
    toPositiveIntOrNull(payload.id) ||
    toPositiveIntOrNull(payload.sub) ||
    toPositiveIntOrNull(payload.admin_id) ||
    toPositiveIntOrNull(payload.adminId)
  );
};

/**
 * Extracts admin id from request context.
 *
 * Supports:
 * - auth middleware attaching req.admin / req.user
 *   (admin JWT payload uses `sub` as the admin id)
 * - explicit header fallback: x-admin-id
 * - Authorization bearer JWT fallback (verifies + extracts `sub`)
 */
module.exports = function getAdminId(req) {
  const headerCandidate =
    (req && typeof req.get === 'function' ? req.get('x-admin-id') : null) ||
    (req && req.headers ? (req.headers['x-admin-id'] || req.headers['x-adminid']) : null);

  const directCandidate =
    (req && req.admin && (req.admin.id ?? req.admin.sub ?? req.admin.admin_id ?? req.admin.adminId)) ||
    (req && req.user && req.user.id) ||
    (req && req.user && req.user.adminId) ||
    (req && req.user && req.user.admin_id) ||
    (req && req.adminId) ||
    (req && req.userId) ||
    (req && req.auth && req.auth.id) ||
    (req && req.decoded && (req.decoded.id ?? req.decoded.sub)) ||
    (req && req.tokenPayload && (req.tokenPayload.id ?? req.tokenPayload.sub)) ||
    headerCandidate;

  const directId = toPositiveIntOrNull(directCandidate);
  if (directId) return directId;

  // Fallback: decode the bearer token if present (useful when routes didn't run authenticate middleware).
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return extractAdminIdFromPayload(payload);
  } catch {
    return null;
  }
};
