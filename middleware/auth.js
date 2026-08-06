const jwt = require('jsonwebtoken');

// Fallback keeps local development functional when JWT_SECRET is not configured.
const JWT_SECRET = process.env.JWT_SECRET || 'rotijugaad-secret';

const authenticate = (req, res, next) => {
  // Short-circuit if Authorization header is missing or malformed.
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing bearer token' });
  }
  // Strip the "Bearer " prefix before verifying the token.
  const token = authHeader.substring(7);
  console.log('[auth] verifying token:', token);
  try {
    // Persist the verified payload so downstream middleware/controllers can authorize requests.
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    return next();
  } catch (error) {
    // Invalid or expired tokens are rejected with a 401.
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  // Guard routes that should only be accessible by super admins.
  if ((req.admin?.role || '').toLowerCase() !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super admin privileges required' });
  }
  return next();
};

const hasPermission = (permissions = [], permission) =>
  Array.isArray(permissions) && (permissions.includes('*') || permissions.includes(permission));

const requirePermission = (permission) => (req, res, next) => {
  const permissions = req.admin?.permissions || [];
  // Deny access when the caller lacks the specific permission or wildcard.
  if (!hasPermission(permissions, permission)) {
    return res.status(403).json({ success: false, message: 'Permission denied' });
  }
  return next();
};

module.exports = {
  authenticate,
  requireSuperAdmin,
  requirePermission,
  hasPermission,
};
