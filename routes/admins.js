const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Role = require('../models/Role');

const router = express.Router();


const normalizePermissions = (input) => {
  if (Array.isArray(input)) return input.filter(Boolean);
  if (input === undefined || input === null) return [];
  return String(input)
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
};

/* -------------------------------------------------------------------------- */
/*                                Role management                             */
/* -------------------------------------------------------------------------- */

/**
 * GET /admins
 * Fetch all admins with their role relations.
 */
router.get('/', async (_req, res) => {
  try {
    const admins = await Admin.findAll({ include: [{ model: Role, as: 'roleRelation' }] });
    res.json({ success: true, data: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load admins', error: error.message });
  }
});

/**
 * GET /admins/roles
 * Retrieve all available roles.
 */
router.get('/roles', async (_req, res) => {
  try {
    const roles = await Role.findAll();
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load roles', error: error.message });
  }
});

/**
 * POST /admins/roles
 * Create a new role with optional permissions (defaults to wildcard).
 */
router.post('/roles', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const slug = (req.body.slug || '').trim();
    const permissions = normalizePermissions(req.body.permissions);
    if (!name || !slug) return res.status(400).json({ success: false, message: 'Name and slug are required' });

    const existing = await Role.findOne({ where: { slug } });
    if (existing) return res.status(409).json({ success: false, message: 'Role slug already exists' });

    const role = await Role.create({
      name,
      slug,
      permissions: permissions.length ? permissions : ['*']
    });

    res.status(201).json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create role', error: error.message });
  }
});

/**
 * PUT /admins/roles/:id
 * Update an existing role’s name and permissions.
 */
router.put('/roles/:id', async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const normalized = permissions === undefined ? role.permissions : normalizePermissions(permissions);

    await role.update({
      name: name ? name.trim() : role.name,
      permissions: normalized
    });

    res.json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
  }
});

/**
 * DELETE /admins/roles/:id
 * Delete a role if it is not attached to any admin.
 */
router.delete('/roles/:id', async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const adminsUsingRole = await Admin.count({ where: { role_id: role.id } });
    if (adminsUsingRole) {
      return res.status(400).json({ success: false, message: 'Cannot delete role in use by admins' });
    }

    await role.destroy();
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete role', error: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                               Admin management                             */
/* -------------------------------------------------------------------------- */

/**
 * POST /admins
 * Create a new admin tied to a role.
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;
    if (!name || !email || !password || !role_id) {
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, password: hashed, role: 'admin', role_id });
    res.status(201).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create admin', error: error.message });
  }
});

/**
 * PUT /admins/:id
 * Update admin fields (name, email, role, status).
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, email, role_id, is_active } = req.body;
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    await admin.update({
      name: name ?? admin.name,
      email: email ?? admin.email,
      role_id: role_id ?? admin.role_id,
      is_active: typeof is_active === 'boolean' ? is_active : admin.is_active
    });
    res.json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update admin', error: error.message });
  }
});

/**
 * DELETE /admins/:id
 * Soft-delete (deactivate) an admin.
 */
router.delete('/:id', async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    await admin.update({ is_active: false });
    res.json({ success: true, message: 'Admin deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete admin', error: error.message });
  }
});

module.exports = router;
