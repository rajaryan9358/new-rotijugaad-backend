const express = require('express');
const router = express.Router();

const Sequelize = require('sequelize');
const { Op } = Sequelize;
const { sequelize } = require('../config/db');

const models = require('../models');
const EmployeeContact = models.EmployeeContact || require('../models/EmployeeContact');
const EmployerContact = models.EmployerContact || require('../models/EmployerContact');
const Employee = models.Employee || require('../models/Employee');
const Employer = models.Employer || require('../models/Employer');
const User = models.User || require('../models/User');
const Job = models.Job || require('../models/Job');
const JobProfile = models.JobProfile || require('../models/JobProfile');
const EmployeeJobProfile = models.EmployeeJobProfile || require('../models/EmployeeJobProfile');
const State = models.State || require('../models/State');
const City = models.City || require('../models/City');

const toInt = (value, fallback = null) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const parseDateOnlyStart = (s) => {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseDateOnlyEnd = (s) => {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const quoteIdentifier = (identifier) => {
  const qi = sequelize?.getQueryInterface?.();
  if (qi?.quoteIdentifier) return qi.quoteIdentifier(identifier);
  return identifier;
};

const addCreatedAtFilter = (where, req) => {
  const createdFrom = parseDateOnlyStart(req.query.created_from || req.query.created_date_start);
  const createdTo = parseDateOnlyEnd(req.query.created_to || req.query.created_date_end);
  if (!createdFrom && !createdTo) return;
  where.created_at = {};
  if (createdFrom) where.created_at[Op.gte] = createdFrom;
  if (createdTo) where.created_at[Op.lte] = createdTo;
};

const addEmployeeSearch = (where, search) => {
  if (!search) return;
  const like = `%${String(search).trim().toLowerCase()}%`;
  const mobileLike = `%${String(search).trim()}%`;
  const escapedLike = sequelize.escape(like);
  const escapedMobileLike = sequelize.escape(mobileLike);
  const contactsAlias = quoteIdentifier('EmployeeContact');
  const ref = (col) => `${contactsAlias}.${quoteIdentifier(col)}`;
  const numeric = Number(search);

  where[Op.or] = [
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.id = ${ref('employee_id')}
          AND (
            LOWER(COALESCE(e.name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(u.name, '')) LIKE ${escapedLike}
            OR COALESCE(u.mobile, '') LIKE ${escapedMobileLike}
          )
      )
    `), true),
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employers em
        LEFT JOIN users u ON u.id = em.user_id
        WHERE em.id = ${ref('employer_id')}
          AND (
            LOWER(COALESCE(em.name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(em.organization_name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(u.name, '')) LIKE ${escapedLike}
            OR COALESCE(u.mobile, '') LIKE ${escapedMobileLike}
          )
      )
    `), true),
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM jobs j
        LEFT JOIN job_profiles jp ON jp.id = j.job_profile_id
        WHERE j.id = ${ref('job_id')}
          AND (
            LOWER(COALESCE(j.job_designation_english, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(j.job_designation_hindi, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(jp.profile_english, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(jp.profile_hindi, '')) LIKE ${escapedLike}
          )
      )
    `), true),
  ];

  if (!Number.isNaN(numeric)) {
    where[Op.or].push(
      { id: numeric },
      { employee_id: numeric },
      { employer_id: numeric },
      { job_id: numeric },
    );
  }
};

const addEmployerSearch = (where, search) => {
  if (!search) return;
  const like = `%${String(search).trim().toLowerCase()}%`;
  const mobileLike = `%${String(search).trim()}%`;
  const escapedLike = sequelize.escape(like);
  const escapedMobileLike = sequelize.escape(mobileLike);
  const contactsAlias = quoteIdentifier('EmployerContact');
  const ref = (col) => `${contactsAlias}.${quoteIdentifier(col)}`;
  const numeric = Number(search);

  where[Op.or] = [
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employers em
        LEFT JOIN users u ON u.id = em.user_id
        WHERE em.id = ${ref('employer_id')}
          AND (
            LOWER(COALESCE(em.name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(em.organization_name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(u.name, '')) LIKE ${escapedLike}
            OR COALESCE(u.mobile, '') LIKE ${escapedMobileLike}
          )
      )
    `), true),
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.id = ${ref('employee_id')}
          AND (
            LOWER(COALESCE(e.name, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(u.name, '')) LIKE ${escapedLike}
            OR COALESCE(u.mobile, '') LIKE ${escapedMobileLike}
          )
      )
    `), true),
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employee_job_profiles ejp
        LEFT JOIN job_profiles jp ON jp.id = ejp.job_profile_id
        WHERE ejp.employee_id = ${ref('employee_id')}
          AND (
            LOWER(COALESCE(jp.profile_english, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(jp.profile_hindi, '')) LIKE ${escapedLike}
          )
      )
    `), true),
    sequelize.where(sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM employees e
        LEFT JOIN cities c ON c.id = e.city_id
        LEFT JOIN states s ON s.id = e.state_id
        WHERE e.id = ${ref('employee_id')}
          AND (
            LOWER(COALESCE(c.city_english, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(c.city_hindi, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(s.state_english, '')) LIKE ${escapedLike}
            OR LOWER(COALESCE(s.state_hindi, '')) LIKE ${escapedLike}
          )
      )
    `), true),
  ];

  if (!Number.isNaN(numeric)) {
    where[Op.or].push(
      { id: numeric },
      { employee_id: numeric },
      { employer_id: numeric },
    );
  }
};

async function listEmployeeUnlocks({ where, fetchAll, page, limit, sortField, sortDir }) {
  const queryOptions = {
    where,
    order: [[sortField, sortDir]],
    paranoid: false,
  };

  let rows;
  let total;
  if (fetchAll) {
    rows = await EmployeeContact.findAll(queryOptions);
    total = rows.length;
  } else {
    queryOptions.limit = limit;
    queryOptions.offset = (page - 1) * limit;
    const result = await EmployeeContact.findAndCountAll(queryOptions);
    rows = result.rows;
    total = result.count;
  }

  const employeeIds = [...new Set(rows.map((row) => row.employee_id).filter(Boolean))];
  const employerIds = [...new Set(rows.map((row) => row.employer_id).filter(Boolean))];
  const jobIds = [...new Set(rows.map((row) => row.job_id).filter(Boolean))];

  const [employees, employers, jobs] = await Promise.all([
    employeeIds.length
      ? Employee.findAll({
          where: { id: employeeIds },
          attributes: ['id', 'name'],
          include: [{ model: User, as: 'User', attributes: ['id', 'name', 'mobile'], required: false, paranoid: false }],
          paranoid: false,
        })
      : [],
    employerIds.length
      ? Employer.findAll({
          where: { id: employerIds },
          attributes: ['id', 'name', 'organization_name', 'organization_type', 'verification_status', 'kyc_status'],
          include: [{ model: User, as: 'User', attributes: ['id', 'name', 'mobile'], required: false, paranoid: false }],
          paranoid: false,
        })
      : [],
    jobIds.length
      ? Job.findAll({
          where: { id: jobIds },
          attributes: ['id', 'status', 'job_designation_english', 'job_designation_hindi'],
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'], required: false }],
          paranoid: false,
        })
      : [],
  ]);

  const employeeMap = new Map(employees.map((row) => [row.id, row]));
  const employerMap = new Map(employers.map((row) => [row.id, row]));
  const jobMap = new Map(jobs.map((row) => [row.id, row]));

  const data = rows.map((row) => {
    const employee = employeeMap.get(row.employee_id);
    const employer = employerMap.get(row.employer_id);
    const job = jobMap.get(row.job_id);
    const orgType = (employer?.organization_type || '').toString().trim().toLowerCase();
    const organizationName = (orgType === 'domestic' || orgType === 'household') ? 'Household' : (employer?.organization_name || '-');

    return {
      id: row.id,
      user_type: 'employee',
      employee_id: row.employee_id,
      employee_name: employee?.name || employee?.User?.name || '-',
      employee_mobile: employee?.User?.mobile || null,
      employer_id: row.employer_id,
      employer_name: employer?.name || employer?.User?.name || '-',
      organization_name: organizationName,
      employer_mobile: employer?.User?.mobile || null,
      job_id: row.job_id || null,
      job_profile: job?.JobProfile?.profile_english || job?.JobProfile?.profile_hindi || '-',
      job_designation: job?.job_designation_english || job?.job_designation_hindi || null,
      job_status: job?.status || null,
      verification_status: employer?.verification_status || null,
      kyc_status: employer?.kyc_status || null,
      call_experience_id: row.call_experience_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    };
  });

  return { rows: data, total };
}

async function listEmployerUnlocks({ where, fetchAll, page, limit, sortField, sortDir }) {
  const queryOptions = {
    where,
    order: [[sortField, sortDir]],
    paranoid: false,
  };

  let rows;
  let total;
  if (fetchAll) {
    rows = await EmployerContact.findAll(queryOptions);
    total = rows.length;
  } else {
    queryOptions.limit = limit;
    queryOptions.offset = (page - 1) * limit;
    const result = await EmployerContact.findAndCountAll(queryOptions);
    rows = result.rows;
    total = result.count;
  }

  const employeeIds = [...new Set(rows.map((row) => row.employee_id).filter(Boolean))];
  const employerIds = [...new Set(rows.map((row) => row.employer_id).filter(Boolean))];

  const [employees, employers, employeeJobProfiles] = await Promise.all([
    employeeIds.length
      ? Employee.findAll({
          where: { id: employeeIds },
          attributes: ['id', 'name', 'verification_status', 'kyc_status', 'state_id', 'city_id'],
          include: [
            { model: User, as: 'User', attributes: ['id', 'name', 'mobile'], required: false, paranoid: false },
            { model: City, as: 'City', attributes: ['id', 'city_english', 'city_hindi'], required: false },
            { model: State, as: 'State', attributes: ['id', 'state_english', 'state_hindi'], required: false },
          ],
          paranoid: false,
        })
      : [],
    employerIds.length
      ? Employer.findAll({
          where: { id: employerIds },
          attributes: ['id', 'name', 'organization_name', 'organization_type'],
          include: [{ model: User, as: 'User', attributes: ['id', 'name', 'mobile'], required: false, paranoid: false }],
          paranoid: false,
        })
      : [],
    employeeIds.length
      ? EmployeeJobProfile.findAll({
          where: { employee_id: employeeIds },
          attributes: ['employee_id', 'job_profile_id'],
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'], required: false }],
          paranoid: false,
          order: [['id', 'ASC']],
        })
      : [],
  ]);

  const employeeMap = new Map(employees.map((row) => [row.id, row]));
  const employerMap = new Map(employers.map((row) => [row.id, row]));
  const profilesMap = new Map();

  employeeJobProfiles.forEach((row) => {
    const key = row.employee_id;
    const label = row.JobProfile?.profile_english || row.JobProfile?.profile_hindi || null;
    if (!key || !label) return;
    const existing = profilesMap.get(key) || [];
    if (!existing.includes(label)) existing.push(label);
    profilesMap.set(key, existing);
  });

  const data = rows.map((row) => {
    const employee = employeeMap.get(row.employee_id);
    const employer = employerMap.get(row.employer_id);
    const orgType = (employer?.organization_type || '').toString().trim().toLowerCase();
    const organizationName = (orgType === 'domestic' || orgType === 'household') ? 'Household' : (employer?.organization_name || '-');

    return {
      id: row.id,
      user_type: 'employer',
      employer_id: row.employer_id,
      employer_name: employer?.name || employer?.User?.name || '-',
      organization_name: organizationName,
      employer_mobile: employer?.User?.mobile || null,
      employee_id: row.employee_id,
      employee_name: employee?.name || employee?.User?.name || '-',
      employee_mobile: employee?.User?.mobile || null,
      employee_job_profiles: profilesMap.get(row.employee_id) || [],
      current_city: employee?.City?.city_english || employee?.City?.city_hindi || null,
      current_state: employee?.State?.state_english || employee?.State?.state_hindi || null,
      verification_status: employee?.verification_status || null,
      kyc_status: employee?.kyc_status || null,
      call_experience_id: row.call_experience_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    };
  });

  return { rows: data, total };
}

router.get('/', async (req, res) => {
  try {
    const userType = String(req.query.user_type || 'employee').trim().toLowerCase();
    if (!['employee', 'employer'].includes(userType)) {
      return res.status(400).json({ success: false, message: 'Invalid user_type' });
    }

    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInt(req.query.limit, 25), 1), 100);
    const sortableFields = new Set(['id', 'created_at', 'updated_at', 'employee_id', 'employer_id', 'job_id']);
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const search = String(req.query.search || '').trim();

    const where = {};
    addCreatedAtFilter(where, req);

    let result;
    if (userType === 'employee') {
      addEmployeeSearch(where, search);
      result = await listEmployeeUnlocks({ where, fetchAll, page, limit, sortField, sortDir });
    } else {
      addEmployerSearch(where, search);
      result = await listEmployerUnlocks({ where, fetchAll, page, limit, sortField, sortDir });
    }

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? result.rows.length : limit,
        total: result.total,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((result.total || 1) / limit), 1),
      },
    });
  } catch (error) {
    console.error('[contact-unlocks] list error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
