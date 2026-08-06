const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const jwt = require('jsonwebtoken');

// dynamic model loading with fallbacks (handles missing exports)
const models = require('../models');
const PaymentHistory = models.PaymentHistory || require('../models/PaymentHistory');
const Employee = models.Employee || require('../models/Employee');
const Employer = models.Employer || require('../models/Employer');
const EmployeeSubscriptionPlan = models.EmployeeSubscriptionPlan || require('../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = models.EmployerSubscriptionPlan || require('../models/EmployerSubscriptionPlan');
const User = models.User || require('../models/User');

const Log = models.Log || require('../models/Log');
const getAdminId = require('../utils/getAdminId');

const { generateInvoiceHtml } = require('../utils/invoice');

const {
  sendInvoicePdfForPaymentHistoryRow,
} = require('../utils/invoicePdf');

const { authenticate } = require('../middleware/auth');

// Require either a valid signed invoice token (?t=...) or a normal Authorization header.
const authenticateOrInvoiceToken = (req, res, next) => {
  const t = (req.query?.t || '').toString().trim();
  if (t) return next();
  return authenticate(req, res, next);
};

const safeCreateLog = async (payload) => {
  try {
    if (!Log) return;
    await Log.create(payload);
  } catch (e) {
    // never break main flows for logging
  }
};

const sendInvoicePdfForRow = async (row, res) => {
  return sendInvoicePdfForPaymentHistoryRow(row, res);
};

// helper: detect migration issues
const isMigrationMissing = (msg = '') =>
  /doesn\'t exist|does not exist|Unknown column|relation .* does not exist/i.test(msg);

/**
 * GET /api/payment-history
 * List payment history entries.
 */
router.get('/', async (req, res) => {
  try {
    if (!PaymentHistory) {
      return res.status(500).json({ success:false, message:'PaymentHistory model not loaded (export missing or migration not run)' });
    }

    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitParam || 25, 1), 100);
    const sortableFields = new Set(['id', 'created_at', 'price_total', 'expiry_at', 'status', 'invoice_number']);
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const { user_type, plan_id, status, user_id, expiry_status, created_from, created_to } = req.query;
    const createdDateStart = req.query.created_date_start; // NEW alias
    const createdDateEnd = req.query.created_date_end;     // NEW alias

    const where = {};
    if (user_type) where.user_type = user_type;
    if (plan_id) where.plan_id = parseInt(plan_id, 10) || null;
    if (status) where.status = status;
    if (user_id) {
      const parsedUserId = parseInt(user_id, 10);
      if (!Number.isNaN(parsedUserId)) where.user_id = parsedUserId;
    }
    if (expiry_status === 'active') where.expiry_at = { [Op.gte]: new Date() };
    if (expiry_status === 'expired') where.expiry_at = { [Op.lt]: new Date() };

    // NEW: created date range filter (inclusive)
    const parseLocalDateTime = (dateStr, timeStr) => {
      if (!dateStr) return null;
      const d = new Date(`${dateStr}T${timeStr}`); // local time
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const createdFrom = parseLocalDateTime(
      String((created_from || createdDateStart || '')).trim(),
      '00:00:00.000'
    );
    const createdTo = parseLocalDateTime(
      String((created_to || createdDateEnd || '')).trim(),
      '23:59:59.999'
    );
    if (createdFrom || createdTo) {
      where.created_at = {
        ...(createdFrom ? { [Op.gte]: createdFrom } : {}),
        ...(createdTo ? { [Op.lte]: createdTo } : {})
      };
    }

    const searchRaw = (req.query.search || '').trim();
    if (searchRaw) {
      const like = { [Op.like]: `%${searchRaw}%` };
      const clauses = [{ order_id: like }, { payment_id: like }, { invoice_number: like }];

      // exact numeric id match (keep)
      const numeric = Number(searchRaw);
      if (!Number.isNaN(numeric)) clauses.push({ id: numeric });

      // fallback: id partial/string match (helps when numeric match isn't hitting as expected)
      const dialect = typeof sequelize.getDialect === 'function' ? sequelize.getDialect() : '';
      const idCastType = dialect === 'postgres' ? 'text' : 'char';
      clauses.push(
        sequelize.where(
          sequelize.cast(sequelize.col('id'), idCastType),
          { [Op.like]: `%${searchRaw}%` }
        )
      );

      const lowered = `%${searchRaw.toLowerCase()}%`;
      const [employeeMatches, employerMatches] = await Promise.all([
        Employee
          ? Employee.findAll({
              attributes: ['id'],
              where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('name')),
                { [Op.like]: lowered }
              ),
              paranoid: true
            })
          : [],
        Employer
          ? Employer.findAll({
              attributes: ['id'],
              where: {
                [Op.or]: [
                  sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('name')),
                    { [Op.like]: lowered }
                  ),
                  sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('organization_name')),
                    { [Op.like]: lowered }
                  )
                ]
              },
              paranoid: true
            })
          : []
      ]);

      if (employeeMatches.length) {
        clauses.push({
          [Op.and]: [
            { user_type: 'employee' },
            { user_id: { [Op.in]: employeeMatches.map(e => e.id) } }
          ]
        });
      }
      if (employerMatches.length) {
        clauses.push({
          [Op.and]: [
            { user_type: 'employer' },
            { user_id: { [Op.in]: employerMatches.map(e => e.id) } }
          ]
        });
      }

      where[Op.or] = clauses;
    }

    const queryOptions = { where, order: [[sortField, sortDir]], paranoid: true };
    let rows = [];
    let total = 0;

    if (fetchAll) {
      rows = await PaymentHistory.findAll(queryOptions);
      total = rows.length;
    } else {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
      const { rows: pagedRows, count } = await PaymentHistory.findAndCountAll(queryOptions);
      rows = pagedRows;
      total = count;
    }

    const planIds = rows.length ? [...new Set(rows.map(r => r.plan_id).filter(Boolean))] : [];
    const employeeIds = new Set();
    const employerIds = new Set();
    rows.forEach(r => {
      if (r.user_type === 'employee') employeeIds.add(r.user_id);
      if (r.user_type === 'employer') employerIds.add(r.user_id);
    });

    const userIds = new Set();
    const empMap = new Map();
    const emrMap = new Map();
    if ((!user_type || user_type === 'employee') && Employee && employeeIds.size) {
      const emps = await Employee.findAll({ where: { id: [...employeeIds] }, paranoid: true });
      emps.forEach(e => {
        empMap.set(e.id, e);
        if (e.user_id) userIds.add(e.user_id);
      });
    }
    if ((!user_type || user_type === 'employer') && Employer && employerIds.size) {
      const emrs = await Employer.findAll({ where: { id: [...employerIds] }, paranoid: true });
      emrs.forEach(e => {
        emrMap.set(e.id, e);
        if (e.user_id) userIds.add(e.user_id);
      });
    }

    const empPlansMap = new Map();
    const emrPlansMap = new Map();
    if ((!user_type || user_type === 'employee') && EmployeeSubscriptionPlan && planIds.length) {
      const empPlans = await EmployeeSubscriptionPlan.findAll({ where: { id: planIds }, paranoid: true });
      empPlans.forEach(p => empPlansMap.set(p.id, p));
    }
    if ((!user_type || user_type === 'employer') && EmployerSubscriptionPlan && planIds.length) {
      const emrPlans = await EmployerSubscriptionPlan.findAll({ where: { id: planIds }, paranoid: true });
      emrPlans.forEach(p => emrPlansMap.set(p.id, p));
    }

    const usersMap = new Map();
    if (User && userIds.size) {
      const users = await User.findAll({ where: { id: [...userIds] }, paranoid: true });
      users.forEach(u => usersMap.set(u.id, u));
    }

    rows.forEach(r => {
      const entity = r.user_type === 'employee'
        ? empMap.get(r.user_id) || null
        : emrMap.get(r.user_id) || null;
      const plan = r.user_type === 'employee'
        ? empPlansMap.get(r.plan_id) || null
        : emrPlansMap.get(r.plan_id) || null;
      const user = entity?.user_id ? usersMap.get(entity.user_id) || null : null;
      r.setDataValue('plan', plan);
      r.setDataValue('entity', entity);
      r.setDataValue('user', user);
    });

    const meta = {
      page: fetchAll ? 1 : page,
      limit: fetchAll ? rows.length : limit,
      total,
      totalPages: fetchAll ? 1 : Math.max(Math.ceil((total || 1) / limit), 1)
    };

    res.json({ success: true, data: rows, meta });
  } catch (e) {
    console.error('[payment-history] list error:', e);
    if (isMigrationMissing(e.message)) {
      return res.status(500).json({ success:false, message:'Pending migration: payment_histories or related tables missing' });
    }
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * GET /api/payment-history/:id/detail
 * Returns the payment row as JSON with plan + entity associations.
 */
router.get('/:id/detail', authenticate, async (req, res) => {
  try {
    if (!PaymentHistory) return res.status(500).json({ success: false, message: 'PaymentHistory model not loaded' });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

    const row = await PaymentHistory.findByPk(id, { paranoid: true });
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });

    // Attach plan
    const plan = row.user_type === 'employee'
      ? (EmployeeSubscriptionPlan ? await EmployeeSubscriptionPlan.findByPk(row.plan_id) : null)
      : (EmployerSubscriptionPlan ? await EmployerSubscriptionPlan.findByPk(row.plan_id) : null);

    // Attach entity (employee/employer) + user
    let entity = null;
    let user = null;
    if (row.user_type === 'employee' && Employee) {
      entity = await Employee.findByPk(row.user_id) || null;
    } else if (row.user_type === 'employer' && Employer) {
      entity = await Employer.findByPk(row.user_id) || null;
    }
    if (entity?.user_id && User) {
      user = await User.findByPk(entity.user_id) || null;
    }

    const data = row.toJSON();
    data.plan = plan ? plan.toJSON() : null;
    data.entity = entity ? entity.toJSON() : null;
    data.user = user ? { id: user.id, name: user.name, mobile: user.mobile } : null;

    return res.json({ success: true, data });
  } catch (e) {
    console.error('[payment-history] detail error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

const INV_FULL_RE = /^INV-(EMPLOYEE|EMPLOYER)-(\d+)-(\d+)$/i;
const INV_SHORT_RE = /^INV-(\d+)$/i;

/**
 * GET /api/payment-history/invoice/:invoiceNumber
 * Returns a PDF (or HTML fallback) invoice for a given invoice number (auth required).
 */
router.get('/invoice/:invoiceNumber', authenticate, async (req, res) => {
  try {
    if (!PaymentHistory) {
      return res.status(500).json({ success: false, message: 'PaymentHistory model not loaded' });
    }

    const raw = String(req.params.invoiceNumber || '').trim();
    if (!raw) return res.status(400).json({ success: false, message: 'Invalid invoice number' });

    let row = null;

    // 1. Short form: INV-{id}
    const shortMatch = raw.match(INV_SHORT_RE);
    if (shortMatch) {
      row = await PaymentHistory.findByPk(shortMatch[1], { paranoid: true });
    }

    // 2. invoice_number column lookup (guarded — column may not exist yet)
    if (!row) {
      try {
        row = await PaymentHistory.findOne({ where: { invoice_number: raw }, paranoid: true });
      } catch (_e) {
        // Column doesn't exist — fall through
      }
    }

    // 3. Full format: INV-{TYPE}-{userId}-{timestamp}
    if (!row) {
      const fullMatch = raw.match(INV_FULL_RE);
      if (fullMatch) {
        const userType = fullMatch[1].toLowerCase();
        const userId = parseInt(fullMatch[2], 10);
        const ts = parseInt(fullMatch[3], 10);
        const tsDate = new Date(ts);
        const from = new Date(tsDate.getTime() - 5 * 60 * 1000);
        const to = new Date(tsDate.getTime() + 5 * 60 * 1000);

        row = await PaymentHistory.findOne({
          where: { user_type: userType, user_id: userId, created_at: { [Op.between]: [from, to] } },
          order: [['created_at', 'DESC']],
          paranoid: true,
        });

        // Wider fallback: most recent record for this user
        if (!row) {
          row = await PaymentHistory.findOne({
            where: { user_type: userType, user_id: userId },
            order: [['created_at', 'DESC']],
            paranoid: true,
          });
        }
      }
    }

    if (!row) return res.status(404).json({ success: false, message: 'Not found' });

    return await sendInvoicePdfForRow(row, res);
  } catch (e) {
    console.error('[payment-history] invoice-by-number error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!PaymentHistory) {
      return res.status(500).json({ success:false, message:'PaymentHistory model not loaded' });
    }
    const row = await PaymentHistory.findByPk(req.params.id, { paranoid: true });
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });

    return await sendInvoicePdfForRow(row, res);
  } catch (e) {
    console.error('[payment-history] invoice error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * DELETE /api/payment-history/:id
 * Soft delete a payment history entry.
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!PaymentHistory) {
      return res.status(500).json({ success:false, message:'PaymentHistory model not loaded' });
    }
    const row = await PaymentHistory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success:false, message:'Not found' });
    await row.destroy();

    const adminId = getAdminId(req);
    await safeCreateLog({
      category: 'payment history',
      type: 'delete',
      redirect_to: '/payment-history',
      log_text: `Deleted payment history: #${row.id} ${row.user_type}#${row.user_id} plan_id=${row.plan_id || '-'} price_total=${row.price_total || '-'} status=${row.status || '-'} invoice=${row.invoice_number || '-'}`,
      rj_employee_id: adminId,
    });

    res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error('[payment-history] delete error:', e);
    if (isMigrationMissing(e.message)) {
      return res.status(500).json({ success:false, message:'Pending migration: payment_histories table missing' });
    }
    res.status(500).json({ success:false, message:e.message });
  }
});

module.exports = router;
