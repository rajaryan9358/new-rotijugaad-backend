const express = require('express');
const router = express.Router();

const { Op } = require('sequelize');

const Log = require('../models/Log');
const Admin = require('../models/Admin');
const getAdminId = require('../utils/getAdminId');

const ALLOWED_CATEGORIES = new Set([
  'employee',
  'employer',
  'users',
  'pending deletion',
  'deleted users',
  'stories',
  'call history',
  'payment history',
  'voilation reports',
  'jobs',
  'hiring history',
  'employee subscription',
  'employee subscription plan',
  'employer subscription',
  'employer subscription plan',
  'plan benefits',
  'notification',
  'employee referrals',
  'employer referrals',
  'reviews',
  'admin',
  'roles',
  'setting',
  'logs',
  'state',
  'city',
  'skill',
  'qualification',
  'shift',
  'job profile',
  'document',
  'work nature',
  'business category',
  'experience',
  'referral credits',
  'volunteers',
  'salary types',
  'salary ranges',
  'distance',
  'employee call experience',
  'employee report reason',
  'employer call experience',
  'employer report reason',
  'vacancy numbers',
  'job benefits',
]);

const ALLOWED_TYPES = new Set(['add', 'update', 'delete', 'export']);

const toInt = (value, fallback) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * GET /api/logs/meta
 * Returns allowed categories and types (for UI filters).
 */
router.get('/meta', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        categories: Array.from(ALLOWED_CATEGORIES).sort(),
        types: Array.from(ALLOWED_TYPES).sort(),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/logs/admins
 * Returns admins for filtering logs by rj_employee_id.
 */
router.get('/admins', async (_req, res) => {
  try {
    const admins = await Admin.findAll({
      attributes: ['id', 'name', 'email'],
      order: [['id', 'ASC']],
    });
    return res.json({ success: true, data: admins });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/logs
 * Create a log entry.
 */
router.post('/', async (req, res) => {
  try {
    const { category, type, redirect_to, log_text, rj_employee_id } = req.body || {};

    if (!category || !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    if (!type || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ success: false, message: 'Invalid type' });
    }

    const created = await Log.create({
      category,
      type,
      redirect_to: redirect_to || null,
      log_text: log_text || null,
      rj_employee_id: rj_employee_id ?? getAdminId(req) ?? null,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/logs
 * List logs (descending) with pagination.
 * Query: category, type, rj_employee_id, created_from, created_to, page (1-based), limit
 */
router.get('/', async (req, res) => {
  try {
    const { category, type } = req.query || {};
    const rjEmployeeId = toInt(req.query?.rj_employee_id, null);
    const createdFrom = req.query?.created_from ? new Date(String(req.query.created_from)) : null;
    const createdTo = req.query?.created_to ? new Date(String(req.query.created_to)) : null;

    if (category && !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    if (type && !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ success: false, message: 'Invalid type' });
    }

    const createdFromValid = createdFrom && Number.isFinite(createdFrom.getTime());
    const createdToValid = createdTo && Number.isFinite(createdTo.getTime());
    const page = Math.max(1, toInt(req.query?.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query?.limit, 10)));
    const offset = (page - 1) * limit;

    const where = {};
    if (category) where.category = category;
    if (type) where.type = type;
    if (rjEmployeeId !== null) where.rj_employee_id = rjEmployeeId;

    if (createdFromValid || createdToValid) {
      where.created_at = {};
      if (createdFromValid) where.created_at[Op.gte] = createdFrom;
      if (createdToValid) where.created_at[Op.lte] = createdTo;
    }

    const result = await Log.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const rows = result.rows.map((row) => row.toJSON());

    const adminIds = Array.from(new Set(rows.map((r) => r.rj_employee_id).filter(Boolean)));
    let adminById = {};
    if (adminIds.length) {
      const admins = await Admin.findAll({
        where: { id: adminIds },
        attributes: ['id', 'name', 'email'],
      });
      adminById = Object.fromEntries(admins.map((a) => [a.id, a.toJSON()]));
    }

    const data = rows.map((r) => ({
      ...r,
      admin: r.rj_employee_id ? (adminById[r.rj_employee_id] || null) : null,
    }));

    const total = result.count;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      data,
      meta: { page, limit, total, totalPages },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
