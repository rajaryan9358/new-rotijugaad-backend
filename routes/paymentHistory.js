const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// dynamic model loading with fallbacks (handles missing exports)
const models = require('../models');
const PaymentHistory = models.PaymentHistory || require('../models/PaymentHistory');
const Employee = models.Employee || require('../models/Employee');
const Employer = models.Employer || require('../models/Employer');
const EmployeeSubscriptionPlan = models.EmployeeSubscriptionPlan || require('../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = models.EmployerSubscriptionPlan || require('../models/EmployerSubscriptionPlan');
const User = models.User || require('../models/User');

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
    const sortableFields = new Set(['id', 'created_at', 'price_total', 'expiry_at', 'status']);
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const { user_type, plan_id, status, user_id, expiry_status } = req.query;

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

    const searchRaw = (req.query.search || '').trim();
    if (searchRaw) {
      const like = { [Op.like]: `%${searchRaw}%` };
      const clauses = [{ order_id: like }, { payment_id: like }];
      const numeric = Number(searchRaw);
      if (!Number.isNaN(numeric)) clauses.push({ id: numeric });

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
 * GET /api/payment-history/:id
 * Retrieve detailed payment history entry information.
 */
router.get('/:id', async (req, res) => {
  try {
    if (!PaymentHistory) {
      return res.status(500).json({ success:false, message:'PaymentHistory model not loaded' });
    }
    const row = await PaymentHistory.findByPk(req.params.id, { paranoid:true });
    if (!row) return res.status(404).json({ success:false, message:'Not found' });

    let plan = null;
    if (row.user_type === 'employee' && EmployeeSubscriptionPlan) {
      plan = await EmployeeSubscriptionPlan.findByPk(row.plan_id);
    } else if (row.user_type === 'employer' && EmployerSubscriptionPlan) {
      plan = await EmployerSubscriptionPlan.findByPk(row.plan_id);
    }

    let entity = null;
    if (row.user_type === 'employee' && Employee) {
      entity = await Employee.findByPk(row.user_id, { paranoid: true });
    } else if (row.user_type === 'employer' && Employer) {
      entity = await Employer.findByPk(row.user_id, { paranoid: true });
    }

    const user = entity?.user_id && User
      ? await User.findByPk(entity.user_id, { paranoid: true })
      : null;

    row.setDataValue('plan', plan);
    row.setDataValue('entity', entity);
    row.setDataValue('user', user);

    res.json({ success:true, data: row });
  } catch (e) {
    console.error('[payment-history] detail error:', e);
    if (isMigrationMissing(e.message)) {
      return res.status(500).json({ success:false, message:'Pending migration: payment_histories table missing' });
    }
    res.status(500).json({ success:false, message:e.message });
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
