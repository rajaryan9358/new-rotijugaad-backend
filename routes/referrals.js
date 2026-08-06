const express = require('express');
const Sequelize = require('sequelize');
const { Op, col, fn } = Sequelize;
const Referral = require('../models/Referral');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');

const router = express.Router();

const formatUserName = (user) => (user?.name ? user.name : null);

const resolveEntityInfo = (userId, userType, employeeMap, employerMap) => {
  const normalized = (userType || '').toString().toLowerCase();
  if (normalized.includes('employer')) {
    const employer = employerMap.get(userId);
    if (employer) return { id: employer.id, type: 'employer' };
  }
  const employee = employeeMap.get(userId);
  if (employee) return { id: employee.id, type: 'employee' };
  if (normalized.includes('employer')) return { id: null, type: 'employer' };
  return { id: null, type: 'employee' };
};

router.get('/', async (req, res) => {
  const rawPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawPageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 5), 200);
  const sortField = (req.query.sortField || 'created_at').toString().toLowerCase();
  const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const searchTerm = (req.query.search || '').trim().toLowerCase();
  const exportFlag = String(req.query.export || '').toLowerCase() === 'true';
  const limit = exportFlag ? undefined : rawPageSize;
  const offset = limit ? (rawPage - 1) * limit : undefined;

  const where = {};
  if (req.query.user_type) {
    where.user_type = req.query.user_type;
  }

  const searchConditions = [];
  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    searchConditions.push(Sequelize.where(fn('LOWER', col('Referral.referral_code')), { [Op.like]: pattern }));
    searchConditions.push(Sequelize.where(fn('LOWER', col('Referrer.name')), { [Op.like]: pattern }));
    searchConditions.push(Sequelize.where(fn('LOWER', col('User.name')), { [Op.like]: pattern }));
  }
  if (searchConditions.length) {
    where[Op.and] = [
      ...(where[Op.and] || []),
      { [Op.or]: searchConditions }
    ];
  }

  const sortableColumns = {
    id: col('Referral.id'),
    referral_code: col('Referral.referral_code'),
    contact_credit: col('Referral.contact_credit'),
    interest_credit: col('Referral.interest_credit'),
    created_at: col('Referral.created_at'),
    referrer: col('Referrer.name'),
    user: col('User.name'),
  };
  const orderColumn = sortableColumns[sortField] || col('Referral.created_at');

  try {
    const { rows, count } = await Referral.findAndCountAll({
      where,
      include: [
        { model: User, as: 'Referrer', attributes: ['id', 'name', 'user_type'] },
        { model: User, as: 'User', attributes: ['id', 'name', 'user_type'] },
      ],
      order: [[orderColumn, sortDir]],
      distinct: true,
      limit,
      offset,
    });

    const userIds = new Set();
    rows.forEach((row) => {
      if (row.referral_id) userIds.add(row.referral_id);
      if (row.user_id) userIds.add(row.user_id);
    });

    const employees = userIds.size
      ? await Employee.findAll({
          where: { user_id: [...userIds] },
          attributes: ['id', 'user_id'],
          paranoid: false,
        })
      : [];
    const employers = userIds.size
      ? await Employer.findAll({
          where: { user_id: [...userIds] },
          attributes: ['id', 'user_id'],
          paranoid: false,
        })
      : [];

    const employeeMap = new Map(employees.map((emp) => [emp.user_id, emp]));
    const employerMap = new Map(employers.map((emp) => [emp.user_id, emp]));

    const payload = rows.map((row) => {
      const referral = row.get({ plain: true });
      const referrerEntity = resolveEntityInfo(
        referral.referral_id,
        referral.Referrer?.user_type || referral.referrer_user_type || referral.user_type,
        employeeMap,
        employerMap
      );
      const userEntity = resolveEntityInfo(
        referral.user_id,
        referral.User?.user_type || referral.user_user_type || referral.user_type,
        employeeMap,
        employerMap
      );
      return {
        ...referral,
        referrer_name: formatUserName(referral.Referrer) || null,
        user_name: formatUserName(referral.User) || null,
        referrer_user_type: referral.Referrer?.user_type || referral.referrer_user_type || null,
        user_user_type: referral.User?.user_type || referral.user_user_type || referral.user_type,
        referrer_entity_id: referrerEntity.id,
        referrer_entity_type: referrerEntity.type,
        user_entity_id: userEntity.id,
        user_entity_type: userEntity.type,
      };
    });

    const total = typeof count === 'number' ? count : 0;
    const meta = {
      page: limit ? rawPage : 1,
      pageSize: limit ?? payload.length,
      total,
      totalPages: limit ? Math.max(Math.ceil(total / limit) || 1, 1) : 1,
    };

    res.json({ success: true, data: payload, meta });
  } catch (error) {
    console.error('[referrals] list error', error);
    res.status(500).json({ success: false, message: 'Unable to fetch referrals' });
  }
});

module.exports = router;
