const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Role = require('../models/Role');

const router = express.Router();
// Handles admin authentication and token issuance.

const JWT_SECRET = process.env.JWT_SECRET || 'rotijugaad-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

router.post('/login', async (req, res) => {
  /**
   * POST /auth/login
   * Request: { email, password }
   * Response: JWT token plus admin profile & permissions.
   */
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

    const admin = await Admin.findOne({
      where: { email },
      include: [{ model: Role, as: 'roleRelation' }]
    });
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const storedPassword = admin.password || '';
    const isBcryptHash = typeof storedPassword === 'string' && storedPassword.startsWith('$2');

    let authenticated = storedPassword === password;
    if (!authenticated && isBcryptHash) {
      authenticated = await bcrypt.compare(password, storedPassword).catch(() => false);
      if (authenticated) {
        await admin.update({ password });
      }
    }

    if (!authenticated) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const roleEntity = admin.roleRelation;
    const permissions = roleEntity?.permissions || [];
    const token = jwt.sign(
      { sub: admin.id, role: roleEntity?.slug || admin.role, permissions },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          role_details: roleEntity,
          permissions
        }
      }
    });
  } catch (error) {
    console.error('[auth/login]', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

module.exports = router;
