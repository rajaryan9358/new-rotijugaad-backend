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

const Log = models.Log || require('../models/Log');
const getAdminId = require('../utils/getAdminId');
const { authenticate } = require('../middleware/auth');

const safeCreateLog = async (payload) => {
  try {
    if (!Log) return;
    await Log.create(payload);
  } catch (e) {
    // never break main flows for logging
  }
};

// Called-entity enrichment models
const Job = models.Job || require('../models/Job');
const JobProfile = models.JobProfile || require('../models/JobProfile');
const BusinessCategory = models.BusinessCategory || require('../models/BusinessCategory');
const State = models.State || require('../models/State');
const City = models.City || require('../models/City');

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

let _employeesHasJobProfileId; // cached boolean
const employeesHasJobProfileId = async () => {
  if (typeof _employeesHasJobProfileId === 'boolean') return _employeesHasJobProfileId;
  try {
    const desc = await sequelize.getQueryInterface().describeTable('employees');
    _employeesHasJobProfileId = !!desc?.job_profile_id;
  } catch {
    _employeesHasJobProfileId = false;
  }
  return _employeesHasJobProfileId;
};

const enrichCalledEntities = async (rows) => {
  if (!Array.isArray(rows) || !rows.length) return;

  // user_type=employee => called_id is job_id
  const jobIds = new Set();
  // user_type=employer => called_id is employee_id
  const calledEmployeeIds = new Set();

  rows.forEach(r => {
    const type = r.user_type;
    const calledId = toInt(r.called_id);
    if (!calledId) return;
    if (type === 'employee') jobIds.add(calledId);
    if (type === 'employer') calledEmployeeIds.add(calledId);
  });

  // ---- employee-call rows: Job -> Employer -> (BusinessCategory, User.mobile) + JobProfile
  let jobsMap = new Map();
  let jobProfilesMap = new Map();
  let employersMap = new Map();
  let businessCategoryMap = new Map();
  let employerUsersMap = new Map();

  if (Job && jobIds.size) {
    const jobs = await Job.findAll({ where: { id: [...jobIds] }, paranoid: true });
    jobsMap = new Map(jobs.map(j => [j.id, j]));

    const jobProfileIds = new Set(jobs.map(j => j.job_profile_id).filter(Boolean));
    const employerIds = new Set(jobs.map(j => j.employer_id).filter(Boolean));

    if (JobProfile && jobProfileIds.size) {
      const jps = await JobProfile.findAll({ where: { id: [...jobProfileIds] }, paranoid: true });
      jobProfilesMap = new Map(jps.map(jp => [jp.id, jp]));
    }

    if (Employer && employerIds.size) {
      const emrs = await Employer.findAll({ where: { id: [...employerIds] }, paranoid: true });
      employersMap = new Map(emrs.map(e => [e.id, e]));

      const bcIds = new Set(emrs.map(e => e.business_category_id).filter(Boolean));
      const employerUserIds = new Set(emrs.map(e => e.user_id).filter(Boolean));

      if (BusinessCategory && bcIds.size) {
        const bcs = await BusinessCategory.findAll({ where: { id: [...bcIds] }, paranoid: true });
        businessCategoryMap = new Map(bcs.map(bc => [bc.id, bc]));
      }

      if (User && employerUserIds.size) {
        const us = await User.findAll({ where: { id: [...employerUserIds] }, paranoid: true });
        employerUsersMap = new Map(us.map(u => [u.id, u]));
      }
    }
  }

  // ---- employer-call rows: Employee -> User.mobile + preferred State/City + JobProfile
  let calledEmployeesMap = new Map();
  let calledEmployeeUsersMap = new Map();
  let calledEmployeeJobProfilesMap = new Map();
  let statesMap = new Map();
  let citiesMap = new Map();

  const includeEmpJobProfileId = await employeesHasJobProfileId();

  if (Employee && calledEmployeeIds.size) {
    const emps = await Employee.findAll({
      where: { id: [...calledEmployeeIds] },
      paranoid: true,
      // IMPORTANT: prevent selecting missing column; only include if it exists in DB
      attributes: includeEmpJobProfileId
        ? { include: ['job_profile_id'] }
        : { exclude: ['job_profile_id'] }
    });

    calledEmployeesMap = new Map(emps.map(e => [e.id, e]));

    const calledUserIds = new Set(emps.map(e => e.user_id).filter(Boolean));
    const empJobProfileIds = includeEmpJobProfileId
      ? new Set(emps.map(e => e.job_profile_id).filter(Boolean))
      : new Set();
    const preferredStateIds = new Set(emps.map(e => e.preferred_state_id).filter(Boolean));
    const preferredCityIds = new Set(emps.map(e => e.preferred_city_id).filter(Boolean));

    if (User && calledUserIds.size) {
      const us = await User.findAll({ where: { id: [...calledUserIds] }, paranoid: true });
      calledEmployeeUsersMap = new Map(us.map(u => [u.id, u]));
    }

    if (JobProfile && empJobProfileIds.size) {
      const jps = await JobProfile.findAll({ where: { id: [...empJobProfileIds] }, paranoid: true });
      calledEmployeeJobProfilesMap = new Map(jps.map(jp => [jp.id, jp]));
    }

    if (State && preferredStateIds.size) {
      const ss = await State.findAll({
        where: { id: [...preferredStateIds] },
        // State model is not paranoid in this codebase; avoid filtering on deleted_at
        attributes: ['id', 'state_english', 'state_hindi']
      });
      statesMap = new Map(ss.map(s => [s.id, s]));
    }

    if (City && preferredCityIds.size) {
      const cs = await City.findAll({
        where: { id: [...preferredCityIds] },
        // City model is not paranoid in this codebase; avoid filtering on deleted_at
        attributes: ['id', 'city_english', 'city_hindi', 'state_id']
      });
      citiesMap = new Map(cs.map(c => [c.id, c]));
    }
  }

  rows.forEach(r => {
    const type = r.user_type;
    const calledId = toInt(r.called_id);

    if (type === 'employee' && calledId) {
      const job = jobsMap.get(calledId) || null;
      const employer = job?.employer_id ? (employersMap.get(job.employer_id) || null) : null;
      const employerUser = employer?.user_id ? (employerUsersMap.get(employer.user_id) || null) : null;
      const jobProfile = job?.job_profile_id ? (jobProfilesMap.get(job.job_profile_id) || null) : null;
      const bc = employer?.business_category_id ? (businessCategoryMap.get(employer.business_category_id) || null) : null;

      r.setDataValue('called_job', job);
      r.setDataValue('called_job_profile', jobProfile);
      r.setDataValue('called_employer', employer);
      r.setDataValue('called_employer_user', employerUser);
      r.setDataValue('called_business_category', bc);
    }

    if (type === 'employer' && calledId) {
      const emp = calledEmployeesMap.get(calledId) || null;
      const empUser = emp?.user_id ? (calledEmployeeUsersMap.get(emp.user_id) || null) : null;
      const empJobProfile = (includeEmpJobProfileId && emp?.job_profile_id)
        ? (calledEmployeeJobProfilesMap.get(emp.job_profile_id) || null)
        : null;
      const prefState = emp?.preferred_state_id ? (statesMap.get(emp.preferred_state_id) || null) : null;
      const prefCity = emp?.preferred_city_id ? (citiesMap.get(emp.preferred_city_id) || null) : null;

      r.setDataValue('called_employee', emp);
      r.setDataValue('called_employee_user', empUser);
      r.setDataValue('called_employee_job_profile', empJobProfile);
      r.setDataValue('preferred_state', prefState);
      r.setDataValue('preferred_city', prefCity);
    }
  });
};

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
    const sortableFields = new Set(['id', 'created_at', 'read_at', 'called_id', 'user_type']); // <-- add user_type
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const where = {};
    const userType = (req.query.user_type || '').toLowerCase();
    if (userType) where.user_type = userType;
    if (req.query.call_experience_id) where.call_experience_id = parseInt(req.query.call_experience_id, 10);
    if (req.query.called_id) where.called_id = parseInt(req.query.called_id, 10);

    // created date range filter (inclusive)
    const createdFrom = parseDateOnlyStart(req.query.created_from || req.query.created_date_start);
    const createdTo = parseDateOnlyEnd(req.query.created_to || req.query.created_date_end);
    if (createdFrom || createdTo) {
      where.created_at = {};
      if (createdFrom) where.created_at[Op.gte] = createdFrom;
      if (createdTo) where.created_at[Op.lte] = createdTo;
    }

    const readStatus = (req.query.read_status || '').toLowerCase();
    if (readStatus === 'read') where.read_at = { [Op.ne]: null };
    if (readStatus === 'unread') where.read_at = { [Op.is]: null };

    const search = (req.query.search || '').trim();
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [{ review: like }];
      if (!Number.isNaN(Number(search))) {
        where[Op.or].push(
          { id: Number(search) },
          { user_id: Number(search) },
          { called_id: Number(search) }
        );
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
      const emps = await Employee.findAll({
        where: { id: [...employeeIds] },
        paranoid: true,
        // be explicit: don't select job_profile_id until migration exists
        attributes: { exclude: ['job_profile_id'] }
      });
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

    await enrichCalledEntities(rows);

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
    await enrichCalledEntities([row]);
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
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const row = await CallHistory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success:false, message:'Not found' });
    let didMarkRead = false;
    if (!row.read_at) {
      await row.update({ read_at: new Date() });
      didMarkRead = true;
    }

    if (didMarkRead) {
      const adminId = getAdminId(req);
      const isEmployee = String(row.user_type || '').toLowerCase() === 'employee';
      const redirectTo = isEmployee ? `/employees/${row.user_id}` : `/employers/${row.user_id}`;
      const category = isEmployee ? 'employee call experience' : 'employer call experience';

      let userLabel = null;
      let calledLabel = null;
      try {
        if (isEmployee) {
          const emp = Employee ? await Employee.findByPk(row.user_id, { attributes: ['name'], paranoid: false }) : null;
          userLabel = emp?.name || null;

          const job = Job && row.called_id ? await Job.findByPk(row.called_id, { attributes: ['employer_id'], paranoid: false }) : null;
          const employer = Employer && job?.employer_id ? await Employer.findByPk(job.employer_id, { attributes: ['name', 'organization_name'], paranoid: false }) : null;
          calledLabel = employer ? (employer.name || employer.organization_name || null) : null;
        } else {
          const employer = Employer ? await Employer.findByPk(row.user_id, { attributes: ['name', 'organization_name'], paranoid: false }) : null;
          userLabel = employer ? (employer.name || employer.organization_name || null) : null;

          const calledEmp = Employee && row.called_id ? await Employee.findByPk(row.called_id, { attributes: ['name'], paranoid: false }) : null;
          calledLabel = calledEmp?.name || null;
        }
      } catch {
        // ignore lookup failures
      }

      await safeCreateLog({
        category: 'call history',
        type: 'update',
        redirect_to: '/call-history',
        log_text: `Call history marked read: ${isEmployee ? 'employee' : 'employer'}=${userLabel || row.user_id} called=${calledLabel || '-'}`,
        rj_employee_id: adminId,
      });


      await safeCreateLog({
        category,
        type: 'update',
        redirect_to: redirectTo,
        log_text: `Call history marked read: ${isEmployee ? 'employee' : 'employer'}=${userLabel || row.user_id} called=${calledLabel || '-'}`,
        rj_employee_id: adminId,
      });

      // Also record under employee logs for Employee Detail visibility
      if (isEmployee) {
        await safeCreateLog({
          category: 'employee',
          type: 'update',
          redirect_to: redirectTo,
          log_text: `Employee call experience marked read: employee=${userLabel || row.user_id} employer=${calledLabel || '-'}`,
          rj_employee_id: adminId,
        });
      } else {
        await safeCreateLog({
          category: 'employer',
          type: 'update',
          redirect_to: redirectTo,
          log_text: `Employer call experience marked read: employer=${userLabel || row.user_id} employee=${calledLabel || '-'}`,
          rj_employee_id: adminId,
        });
      }
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

    const adminId = getAdminId(req);
    await safeCreateLog({
      category: 'call history',
      type: 'delete',
      redirect_to: '/call-history',
      log_text: `Deleted call history: #${row.id} ${row.user_type}#${row.user_id} called_id=${row.called_id || '-'} call_experience_id=${row.call_experience_id || '-'}`,
      rj_employee_id: adminId,
    });

    res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error('[call-history] delete error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

module.exports = router;

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
