const express = require('express');
const router = express.Router();

const models = require('../models');
const CallHistory = models.CallHistory || require('../models/CallHistory');
const User = models.User || require('../models/User');
const Employee = models.Employee || require('../models/Employee');
const Employer = models.Employer || require('../models/Employer');
const EmployeeCallExperience = models.EmployeeCallExperience || require('../models/EmployeeCallExperience');
const EmployerCallExperience = models.EmployerCallExperience || require('../models/EmployerCallExperience');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * GET /call-history
 * List call histories with optional filters (user_type, call_experience_id, limit).
 */
router.get('/', async (req, res) => {
  try {
    if (!CallHistory) {
      return res.status(500).json({ success: false, message: 'CallHistory model not loaded' });
    }

    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitParam || 25, 1), 100);
    const sortableFields = new Set(['id', 'created_at', 'read_at']);
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const where = {};
    const userType = (req.query.user_type || '').toLowerCase();
    if (userType) where.user_type = userType;
    if (req.query.call_experience_id) where.call_experience_id = parseInt(req.query.call_experience_id, 10);

    const readStatus = (req.query.read_status || '').toLowerCase();
    if (readStatus === 'read') where.read_at = { [Op.ne]: null };
    if (readStatus === 'unread') where.read_at = { [Op.is]: null };

    const search = (req.query.search || '').trim();
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [{ review: like }];
      if (!Number.isNaN(Number(search))) {
        where[Op.or].push({ id: Number(search) }, { user_id: Number(search) });
      }

      const qi = sequelize?.getQueryInterface?.();
      const quoteIdentifier = qi?.quoteIdentifier?.bind(qi);
      const quote = (identifier) => (quoteIdentifier ? quoteIdentifier(identifier) : identifier);
      const callHistoryAlias = quote('CallHistory');
      const columnRef = (col) => `${callHistoryAlias}.${quote(col)}`;

      const escapeLike = (value) => value.replace(/[%_]/g, '\\$&');
      const normalizedLike = `%${escapeLike(search.toLowerCase())}%`;
      const mobileLike = `%${escapeLike(search)}%`;
      const likeLiteral = sequelize.escape(normalizedLike);
      const mobileLiteral = sequelize.escape(mobileLike);

      const employeeLiteral = sequelize.literal(`
        EXISTS (
          SELECT 1
          FROM employees e
          LEFT JOIN users u ON u.id = e.user_id
          WHERE e.id = ${columnRef('user_id')}
            AND ${columnRef('user_type')} = 'employee'
            AND (
              LOWER(COALESCE(u.name, '')) LIKE ${likeLiteral}
              OR LOWER(COALESCE(e.name, '')) LIKE ${likeLiteral}
              OR u.mobile LIKE ${mobileLiteral}
            )
        )`);
      const employerLiteral = sequelize.literal(`
        EXISTS (
          SELECT 1
          FROM employers em
          LEFT JOIN users u ON u.id = em.user_id
          WHERE em.id = ${columnRef('user_id')}
            AND ${columnRef('user_type')} = 'employer'
            AND (
              LOWER(COALESCE(u.name, '')) LIKE ${likeLiteral}
              OR LOWER(COALESCE(em.name, '')) LIKE ${likeLiteral}
              OR LOWER(COALESCE(em.organization_name, '')) LIKE ${likeLiteral}
              OR u.mobile LIKE ${mobileLiteral}
            )
        )`);

      where[Op.or].push(sequelize.where(employeeLiteral, true));
      where[Op.or].push(sequelize.where(employerLiteral, true));
    }

    const queryOptions = { where, order: [[sortField, sortDir]], paranoid: true };
    let rows;
    let total;
    if (fetchAll) {
      rows = await CallHistory.findAll(queryOptions);
      total = rows.length;
    } else {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
      const result = await CallHistory.findAndCountAll(queryOptions);
      rows = result.rows;
      total = result.count;
    }

    const employeeIds = new Set();
    const employerIds = new Set();
    const employeeExpIds = new Set();
    const employerExpIds = new Set();
    rows.forEach(r => {
      if (r.user_type === 'employee') {
        employeeIds.add(r.user_id);
        if (r.call_experience_id) employeeExpIds.add(r.call_experience_id);
      } else if (r.user_type === 'employer') {
        employerIds.add(r.user_id);
        if (r.call_experience_id) employerExpIds.add(r.call_experience_id);
      }
    });

    let employeeMap = new Map();
    const userIds = new Set();
    if (Employee && employeeIds.size) {
      const emps = await Employee.findAll({ where: { id: [...employeeIds] }, paranoid: true });
      employeeMap = new Map(emps.map(e => {
        if (e.user_id) userIds.add(e.user_id);
        return [e.id, e];
      }));
    }

    let employerMap = new Map();
    if (Employer && employerIds.size) {
      const emrs = await Employer.findAll({ where: { id: [...employerIds] }, paranoid: true });
      employerMap = new Map(emrs.map(e => {
        if (e.user_id) userIds.add(e.user_id);
        return [e.id, e];
      }));
    }

    let usersMap = new Map();
    if (User && userIds.size) {
      const users = await User.findAll({ where: { id: [...userIds] }, paranoid: true });
      usersMap = new Map(users.map(u => [u.id, u]));
    }

    const employeeExpMap = (EmployeeCallExperience && employeeExpIds.size)
      ? new Map((await EmployeeCallExperience.findAll({
          where: { id: [...employeeExpIds] },
          paranoid: true
        })).map(exp => [exp.id, exp]))
      : new Map();

    const employerExpMap = (EmployerCallExperience && employerExpIds.size)
      ? new Map((await EmployerCallExperience.findAll({
          where: { id: [...employerExpIds] },
          paranoid: true
        })).map(exp => [exp.id, exp]))
      : new Map();

    rows.forEach(r => {
      const entity = r.user_type === 'employee'
        ? employeeMap.get(r.user_id) || null
        : r.user_type === 'employer'
          ? employerMap.get(r.user_id) || null
          : null;
      const user = entity?.user_id ? usersMap.get(entity.user_id) || null : null;
      const experience = r.user_type === 'employee'
        ? employeeExpMap.get(r.call_experience_id) || null
        : r.user_type === 'employer'
          ? employerExpMap.get(r.call_experience_id) || null
          : null;
      r.setDataValue('entity', entity);
      r.setDataValue('user', user);
      r.setDataValue('experience', experience);
      const profileId = entity?.id || r.user_id || null;
      if (profileId !== null) {
        r.setDataValue('user_id', profileId);
      }
      r.setDataValue('user_mobile', user?.mobile || null);
      const entityName =
        entity?.name ||
        entity?.organization_name ||
        (entity?.first_name && entity?.last_name ? `${entity.first_name} ${entity.last_name}` : null) ||
        user?.name ||
        null;
      r.setDataValue('user_name', entityName);
    });

    res.json({
      success: true,
      data: rows,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? rows.length : limit,
        total,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((total || 1) / limit), 1)
      }
    });
  } catch (e) {
    console.error('[call-history] list error:', e);
    if (/Unknown column|doesn\'t exist|does not exist|relation .* does not exist/i.test(e.message)) {
      return res.status(500).json({ success:false, message:'Pending migration: call_histories table missing' });
    }
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * GET /call-history/:id
 * Fetch detailed call history info including linked entity, user, and experience.
 */
router.get('/:id', async (req, res) => {
  try {
    const row = await CallHistory.findByPk(req.params.id, { paranoid:true });
    if (!row) return res.status(404).json({ success:false, message:'Not found' });
    let entity = null;
    if (row.user_type === 'employee' && Employee) {
      entity = await Employee.findByPk(row.user_id, { paranoid: true });
    } else if (row.user_type === 'employer' && Employer) {
      entity = await Employer.findByPk(row.user_id, { paranoid: true });
    }
    let experience = null;
    if (row.user_type === 'employee' && row.call_experience_id && EmployeeCallExperience) {
      experience = await EmployeeCallExperience.findByPk(row.call_experience_id);
    } else if (row.user_type === 'employer' && row.call_experience_id && EmployerCallExperience) {
      experience = await EmployerCallExperience.findByPk(row.call_experience_id);
    }
    const user = entity?.user_id && User
      ? await User.findByPk(entity.user_id, { paranoid: true })
      : null;
    row.setDataValue('entity', entity);
    row.setDataValue('user', user);
    row.setDataValue('experience', experience);
    row.setDataValue('user_mobile', user?.mobile || null);
    const entityName =
      entity?.name ||
      entity?.organization_name ||
      (entity?.first_name && entity?.last_name ? `${entity.first_name} ${entity.last_name}` : null) ||
      user?.name ||
      null;
    row.setDataValue('user_name', entityName);
    res.json({ success:true, data: row });
  } catch (e) {
    console.error('[call-history] detail error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * PUT /call-history/:id/read
 * Mark a call history record as read by setting read_at.
 */
router.put('/:id/read', async (req, res) => {
  try {
    const row = await CallHistory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success:false, message:'Not found' });
    if (!row.read_at) {
      await row.update({ read_at: new Date() });
    }
    res.json({ success:true, data: row });
  } catch (e) {
    console.error('[call-history] read error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * DELETE /call-history/:id
 * Soft delete a call history record.
 */
router.delete('/:id', async (req, res) => {
  try {
    const row = await CallHistory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success:false, message:'Not found' });
    await row.destroy();
    res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error('[call-history] delete error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

module.exports = router;
