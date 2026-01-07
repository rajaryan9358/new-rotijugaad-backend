const express = require('express');
const router = express.Router();
const {
  Employee,
  State,
  City,
  Qualification,
  Shift,
  EmployeeSubscriptionPlan,
  User,
  EmployeeJobProfile,
  JobProfile,
  Job,
  Employer,
  JobGender,
  JobExperience,
  Experience,
  JobQualification,
  JobShift,
  JobSkill,
  Skill,
  SelectedJobBenefit,
  JobBenefit
} = require('../models');
const EmployeeExperience = require('../models/EmployeeExperience');
const WorkNature = require('../models/WorkNature');
const EmployeeDocument = require('../models/EmployeeDocument'); // ensure present
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobInterest = require('../models/JobInterest');
const Wishlist = require('../models/Wishlist'); // add this line if not present
const EmployeeContact = require('../models/EmployeeContact'); // add if not present
const CallHistory = require('../models/CallHistory'); // add if not present
const EmployeeCallExperience = require('../models/EmployeeCallExperience'); // add if not present
const EmployerCallExperience = require('../models/EmployerCallExperience'); // new for mixed history lookups
const { deleteByEmployeeId } = require('../utils/deleteUserTransactional');
const Sequelize = require('sequelize');
const { Op, fn, col } = Sequelize;
const Referral = require('../models/Referral'); // added
const { sequelize } = require('../config/db'); // added
const Volunteer = require('../models/Volunteer'); // NEW: for assistant_code -> volunteer mapping
const EmployerReportReason = require('../models/EmployerReportReason'); // NEW (job report reasons)
const Report = require('../models/Report'); // NEW
const getAdminId = require('../utils/getAdminId');
const Admin = require('../models/Admin'); // NEW: join status_change_by -> admins.name
const Log = require('../models/Log');
const ManualCreditHistory = require('../models/ManualCreditHistory');

const { authenticate } = require('../middleware/auth');

// Add: normalize date helper
const normalizeDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
// NEW: treat date-only bounds as start-of-day and end-exclusive (next day start)
const startOfDay = (d) => {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endExclusiveOfDay = (d) => {
  if (!d) return null;
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
};
// Add: normalize integer helper
const normalizeIntOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
};


const normalizeDecimalOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const safeCreateLog = async (payload) => {
  try {
    await Log.create(payload);
  } catch (error) {
    console.error('[logs] failed to create log', error);
  }
};

const safeLog = async (req, { category, type, redirect_to, log_text }) => {
  return safeCreateLog({
    category,
    type,
    redirect_to: redirect_to || null,
    log_text: log_text || null,
    rj_employee_id: getAdminId(req),
  });
};

const safeCreateManualCreditHistory = async (payload) => {
  try {
    await ManualCreditHistory.create(payload);
  } catch (e) {
    // never break main flows for history writes
  }
};

const pickEmployeePayload = (body = {}) => ({
  name: (body.name ?? null) === '' ? null : body.name,
  dob: body.dob || null,
  gender: body.gender || null,
  state_id: normalizeIntOrNull(body.state_id),
  city_id: normalizeIntOrNull(body.city_id),
  preferred_state_id: normalizeIntOrNull(body.preferred_state_id),
  preferred_city_id: normalizeIntOrNull(body.preferred_city_id),
  qualification_id: normalizeIntOrNull(body.qualification_id),
  expected_salary: normalizeDecimalOrNull(body.expected_salary),
  expected_salary_frequency: body.expected_salary_frequency || null,
  preferred_shift_id: normalizeIntOrNull(body.preferred_shift_id),
  assistant_code: body.assistant_code || null,
  email: body.email || null,
  about_user: body.about_user || null,
  aadhar_number: body.aadhar_number || null,
  aadhar_verified_at: body.aadhar_verified_at || null,
  selfie_link: body.selfie_link || null,
  verification_status: body.verification_status || undefined,
  verification_at: body.verification_at || undefined,
  kyc_status: body.kyc_status || undefined,
  kyc_verification_at: body.kyc_verification_at || undefined,
  total_contact_credit: normalizeIntOrNull(body.total_contact_credit) ?? undefined,
  contact_credit: normalizeIntOrNull(body.contact_credit) ?? undefined,
  total_interest_credit: normalizeDecimalOrNull(body.total_interest_credit) ?? undefined,
  interest_credit: normalizeDecimalOrNull(body.interest_credit) ?? undefined,
  credit_expiry_at: body.credit_expiry_at || undefined,
  subscription_plan_id: normalizeIntOrNull(body.subscription_plan_id),
});

const employeeRedirect = (id) => `/employees/${id}`;


const buildUserInclude = () => ({
  model: User,
  as: 'User',
  attributes: [
    'id',
    'name',
    'mobile',
    'is_active',
    'deactivation_reason',
    'status_change_by', // NEW
    'last_active_at',
    'profile_completed_at',
    'created_at'
  ],
  include: [
    {
      model: Admin,
      as: 'StatusChangedBy', // must match User.belongsTo(... as)
      attributes: ['id', 'name'],
      required: false
    }
  ],
  paranoid: false,
  required: false
});

// IMPORTANT: build fresh include objects per request.
// We mutate include (e.g., userInclude.where/required) based on filters;
// reusing a shared object would leak filters across requests.
const buildBaseInclude = () => ([
  { model: State, as: 'State' },
  { model: City, as: 'City' },
  { model: State, as: 'PreferredState' },
  { model: City, as: 'PreferredCity' },
  { model: Qualification, as: 'Qualification' },
  { model: Shift, as: 'Shift' },
  { model: EmployeeSubscriptionPlan, as: 'SubscriptionPlan' },
  buildUserInclude()
]);

const ensureUserInclude = (includeList = []) => {
  let userInclude = includeList.find(item => item.as === 'User');
  if (!userInclude) {
    userInclude = buildUserInclude();
    includeList.push(userInclude);
  }
  return userInclude;
};


/**
 * GET /employees
 * List employees.
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSizeRaw = req.query.pageSize ?? req.query.limit;
    const pageSizeNum = parseInt(pageSizeRaw, 10);
    const pageSize = Math.min(Math.max(pageSizeNum || 25, 1), 500);
    const offset = (page - 1) * pageSize;

    const sortFieldRaw = (req.query.sortField || 'id').toString();
    const sortDir = (req.query.sortDir || 'asc').toString().toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const where = {};

    // filters
    const search = (req.query.search || '').toString().trim();
    const stateFilter = normalizeIntOrNull(req.query.stateFilter);
    const cityFilter = normalizeIntOrNull(req.query.cityFilter);
    const prefStateFilter = normalizeIntOrNull(req.query.prefStateFilter);
    const prefCityFilter = normalizeIntOrNull(req.query.prefCityFilter);
    const qualificationFilter = normalizeIntOrNull(req.query.qualificationFilter);
    const shiftFilter = normalizeIntOrNull(req.query.shiftFilter);
    const planFilter = normalizeIntOrNull(req.query.planFilter);

    const salaryFreqFilter = (req.query.salaryFreqFilter || '').toString().trim();
    const genderFilter = (req.query.genderFilter || '').toString().trim();
    const verificationFilter = (req.query.verificationFilter || '').toString().trim();
    const kycFilter = (req.query.kycFilter || '').toString().trim();
    const subscriptionStatusFilter = (req.query.subscriptionStatusFilter || '').toString().trim().toLowerCase();
    const statusFilter = (req.query.status || '').toString().trim().toLowerCase();
    const newFilter = (req.query.newFilter || '').toString().trim().toLowerCase();

    const jobProfileFilter = normalizeIntOrNull(req.query.jobProfileFilter);
    const workNatureFilter = normalizeIntOrNull(req.query.workNatureFilter);
    const workDurationFilter = (req.query.workDurationFilter || '').toString().trim();
    const workDurationFreqFilter = (req.query.workDurationFreqFilter || '').toString().trim();
    const assistantCode = (req.query.assistantCode || '').toString().trim();

    const createdFrom = normalizeDateOrNull(req.query.createdFrom || req.query.created_from);
    const createdTo = normalizeDateOrNull(req.query.createdTo || req.query.created_to);

    const kycVerifiedFrom = normalizeDateOrNull(req.query.kyc_verified_from);
    const kycVerifiedTo = normalizeDateOrNull(req.query.kyc_verified_to);

    if (stateFilter) where.state_id = stateFilter;
    if (cityFilter) where.city_id = cityFilter;
    if (prefStateFilter) where.preferred_state_id = prefStateFilter;
    if (prefCityFilter) where.preferred_city_id = prefCityFilter;
    if (qualificationFilter) where.qualification_id = qualificationFilter;
    if (shiftFilter) where.preferred_shift_id = shiftFilter;
    if (planFilter) where.subscription_plan_id = planFilter;
    if (salaryFreqFilter) where.expected_salary_frequency = salaryFreqFilter;
    if (genderFilter) where.gender = genderFilter;
    if (verificationFilter) where.verification_status = verificationFilter;
    if (kycFilter) where.kyc_status = kycFilter;
    if (assistantCode) where.assistant_code = assistantCode;

    if (createdFrom) {
      where.created_at = { ...(where.created_at || {}), [Op.gte]: startOfDay(createdFrom) };
    }
    if (createdTo) {
      where.created_at = { ...(where.created_at || {}), [Op.lt]: endExclusiveOfDay(createdTo) };
    }

    if (kycVerifiedFrom) {
      where.kyc_verification_at = { ...(where.kyc_verification_at || {}), [Op.gte]: startOfDay(kycVerifiedFrom) };
    }
    if (kycVerifiedTo) {
      where.kyc_verification_at = { ...(where.kyc_verification_at || {}), [Op.lt]: endExclusiveOfDay(kycVerifiedTo) };
    }

    if (subscriptionStatusFilter === 'active') {
      where.credit_expiry_at = { [Op.gte]: new Date() };
    } else if (subscriptionStatusFilter === 'expired') {
      where.credit_expiry_at = { [Op.lt]: new Date() };
    }

    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const numeric = parseInt(search, 10);
      const or = [
        { name: like },
        { email: like },
        { assistant_code: like },
        Sequelize.where(Sequelize.col('User.mobile'), like)
      ];
      if (!Number.isNaN(numeric)) or.push({ id: numeric });
      where[Op.or] = or;
    }

    const include = buildBaseInclude();

    // User filters (active/inactive + new)
    const userInclude = ensureUserInclude(include);
    const userWhere = {};
    if (statusFilter === 'active') userWhere.is_active = true;
    if (statusFilter === 'inactive') userWhere.is_active = false;
    if (newFilter === 'new') {
      userWhere.created_at = { [Op.gte]: new Date(Date.now() - 48 * 60 * 60 * 1000) };
    }
    if (Object.keys(userWhere).length) {
      userInclude.where = userWhere;
      userInclude.required = true;
    }

    // job profile filter via join table
    if (jobProfileFilter) {
      include.push({
        model: EmployeeJobProfile,
        as: 'EmployeeJobProfiles',
        attributes: ['employee_id', 'job_profile_id'],
        where: { job_profile_id: jobProfileFilter },
        required: true,
        paranoid: true
      });
    }

    // work nature filter via experiences
    if (workNatureFilter || workDurationFilter || workDurationFreqFilter) {
      const expWhere = {};
      if (workNatureFilter) expWhere.work_nature_id = workNatureFilter;
      if (workDurationFilter) expWhere.work_duration = workDurationFilter;
      if (workDurationFreqFilter) expWhere.work_duration_frequency = workDurationFreqFilter;

      const expRows = await EmployeeExperience.findAll({
        attributes: ['user_id'],
        where: expWhere,
        paranoid: true
      });
      const employeeIds = [...new Set(expRows.map(r => r.user_id).filter(Boolean))];
      if (!employeeIds.length) {
        return res.json({ success: true, data: [], meta: { page, pageSize, total: 0, totalPages: 1 } });
      }
      where.id = { ...(where.id || {}), [Op.in]: employeeIds };
    }

    const SORTABLE = new Set([
      'id',
      'name',
      'email',
      'assistant_code',
      'dob',
      'gender',
      'expected_salary',
      'verification_status',
      'kyc_status',
      'created_at',
      'credit_expiry_at',
      'is_active',
      'state',
      'city',
      'qualification',
      'shift'
    ]);

    const sortField = SORTABLE.has(sortFieldRaw) ? sortFieldRaw : 'id';

    const order = (() => {
      if (sortField === 'is_active') return [[{ model: User, as: 'User' }, 'is_active', sortDir], ['id', 'ASC']];
      if (sortField === 'state') return [[{ model: State, as: 'State' }, 'state_english', sortDir], ['id', 'ASC']];
      if (sortField === 'city') return [[{ model: City, as: 'City' }, 'city_english', sortDir], ['id', 'ASC']];
      if (sortField === 'qualification') return [[{ model: Qualification, as: 'Qualification' }, 'qualification_english', sortDir], ['id', 'ASC']];
      if (sortField === 'shift') return [[{ model: Shift, as: 'Shift' }, 'shift_english', sortDir], ['id', 'ASC']];
      return [[sortField, sortDir], ['id', 'ASC']];
    })();

    const result = await Employee.findAndCountAll({
      where,
      include,
      order,
      offset,
      limit: pageSize,
      distinct: true,
      paranoid: true
    });

    const rows = result.rows || [];

    // Build job_profiles_display + work_natures_display for list UI.
    const employeeIds = rows.map(r => r.id).filter(Boolean);
    const jobProfilesMap = new Map();
    const workNaturesMap = new Map();

    if (employeeIds.length) {
      const jpRows = await EmployeeJobProfile.findAll({
        where: { employee_id: employeeIds },
        include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'], required: false }],
        paranoid: true
      });
      for (const r of jpRows) {
        const list = jobProfilesMap.get(r.employee_id) || [];
        const label = r.JobProfile?.profile_english;
        if (label) list.push(label);
        jobProfilesMap.set(r.employee_id, list);
      }

      const expRows = await EmployeeExperience.findAll({
        where: { user_id: employeeIds },
        include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english'], required: false }],
        paranoid: true
      });
      for (const r of expRows) {
        const list = workNaturesMap.get(r.user_id) || [];
        const label = r.WorkNature?.nature_english;
        if (label) list.push(label);
        workNaturesMap.set(r.user_id, list);
      }
    }

    const data = rows.map((emp) => {
      const json = emp.toJSON();
      const jp = jobProfilesMap.get(emp.id) || [];
      const wn = workNaturesMap.get(emp.id) || [];
      return {
        ...json,
        job_profiles_display: jp.length ? [...new Set(jp)].join(', ') : null,
        work_natures_display: wn.length ? [...new Set(wn)].join(', ') : null
      };
    });

    const total = result.count || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize) || 1, 1);

    res.json({ success: true, data, meta: { page, pageSize, total, totalPages } });
  } catch (error) {
    console.error('[employees] list error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch employees' });
  }
});

/**
 * GET /employees/:id
 * Fetch single employee.
 */
router.get('/:id', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const include = buildBaseInclude();
    const employee = await Employee.findByPk(employeeId, { include, paranoid: true });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Add display helpers.
    const jpRows = await EmployeeJobProfile.findAll({
      where: { employee_id: employeeId },
      include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'], required: false }],
      paranoid: true
    });
    const jobProfiles = jpRows.map(r => r.JobProfile?.profile_english).filter(Boolean);

    const expRows = await EmployeeExperience.findAll({
      where: { user_id: employeeId },
      include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english'], required: false }],
      paranoid: true
    });
    const workNatures = expRows.map(r => r.WorkNature?.nature_english).filter(Boolean);

    const data = {
      ...employee.toJSON(),
      job_profiles_display: jobProfiles.length ? [...new Set(jobProfiles)].join(', ') : null,
      work_natures_display: workNatures.length ? [...new Set(workNatures)].join(', ') : null
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('[employees] getById error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch employee' });
  }
});

/**
 * POST /employees
 * Create an employee (and user if user_id not provided).
 * Performs User+Employee writes in a single transaction.
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const rawUserId = req.body?.user_id;
    const userId = rawUserId ? Number(rawUserId) : null;
    const name = (req.body?.name || '').toString().trim();
    const mobile = (req.body?.mobile || '').toString().trim();

    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    let createdEmployee = null;
    let createdUser = null;

    await sequelize.transaction(async (t) => {
      let user;
      if (userId) {
        user = await User.findByPk(userId, { transaction: t, paranoid: false });
        if (!user) {
          const err = new Error('User not found');
          err.status = 404;
          throw err;
        }

        const existingType = (user.user_type || '').toString().toLowerCase();
        if (user.profile_completed_at) {
          const err = new Error('Mobile already exist');
          err.status = 409;
          throw err;
        }
        if (existingType && existingType !== 'employee') {
          const err = new Error('Mobile already exist');
          err.status = 409;
          throw err;
        }
        if (user.deleted_at) {
          await user.restore({ transaction: t });
        }

        const existing = await Employee.findOne({ where: { user_id: user.id }, transaction: t, paranoid: false });
        if (existing) {
          const err = new Error('Employee record already exists for this user');
          err.status = 400;
          throw err;
        }
        const userUpdates = {};
        if (mobile && mobile !== user.mobile) userUpdates.mobile = mobile;
        if (name && (!user.name || !user.name.toString().trim())) userUpdates.name = name;
        if (!user.user_type) userUpdates.user_type = 'employee';
        if (Object.keys(userUpdates).length) await user.update(userUpdates, { transaction: t });
      } else {
        if (!mobile) {
          const err = new Error('Mobile is required');
          err.status = 400;
          throw err;
        }

        // Enforce: mobile must be unique unless the existing user is the same type
        // and has not completed their profile yet.
        user = await User.findOne({ where: { mobile }, transaction: t, paranoid: false });
        if (user) {
          const existingType = (user.user_type || '').toString().toLowerCase();
          const profileCompletedAt = user.profile_completed_at;

          if (profileCompletedAt) {
            const err = new Error('Mobile already exist');
            err.status = 409;
            throw err;
          }

          if (existingType && existingType !== 'employee') {
            const err = new Error('Mobile already exist');
            err.status = 409;
            throw err;
          }

          if (user.deleted_at) {
            await user.restore({ transaction: t });
          }

          const existingEmp = await Employee.findOne({ where: { user_id: user.id }, transaction: t, paranoid: false });
          if (existingEmp) {
            const err = new Error('Employee record already exists for this user');
            err.status = 400;
            throw err;
          }

          const userUpdates = {};
          if (!user.user_type) userUpdates.user_type = 'employee';
          if (name && (!user.name || !user.name.toString().trim())) userUpdates.name = name;
          if (Object.keys(userUpdates).length) await user.update(userUpdates, { transaction: t });
        } else {
          user = await User.create({ mobile, name, user_type: 'employee' }, { transaction: t });
          createdUser = user;
        }
      }

      // Stamp when the employee/employer profile is created (used to prevent re-using the same mobile once a profile exists)
      if (user && !user.profile_completed_at) {
        await user.update({ profile_completed_at: new Date() }, { transaction: t });
      }

      const empPayload = pickEmployeePayload(req.body);
      empPayload.name = name;

      createdEmployee = await Employee.create({
        ...empPayload,
        user_id: user.id,
      }, { transaction: t });
    });

    await safeLog(req, {
      category: 'employee',
      type: 'add',
      redirect_to: employeeRedirect(createdEmployee.id),
      log_text: `Employee created: #${createdEmployee.id} ${name}${mobile ? ` (${mobile})` : ''}`,
    });

    return res.status(201).json({ success: true, data: createdEmployee, meta: { user: createdUser ? { id: createdUser.id } : null } });
  } catch (error) {
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500;
    console.error('[employees:create] error', error);
    return res.status(status).json({ success: false, message: error.message || 'Failed to create employee' });
  }
});

/**
 * PUT /employees/:id
 * Update an employee (and optionally update linked user mobile/name).
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    let updatedEmployee;
    let beforeName;
    await sequelize.transaction(async (t) => {
      const employee = await Employee.findByPk(employeeId, { transaction: t, paranoid: false });
      if (!employee) {
        const err = new Error('Employee not found');
        err.status = 404;
        throw err;
      }

      beforeName = employee.name;
      // Stamp when the employee/employer profile is created (used to prevent re-using the same mobile once a profile exists)
      if (user && !user.profile_completed_at) {
        await user.update({ profile_completed_at: new Date() }, { transaction: t });
      }

      const empPayload = pickEmployeePayload(req.body);
      if (typeof req.body?.name === 'string' && req.body.name.trim()) empPayload.name = req.body.name.trim();
      await employee.update(empPayload, { transaction: t });
      const mobile = (req.body?.mobile || '').toString().trim();
      const name = (req.body?.name || '').toString().trim();
      const user = await User.findByPk(employee.user_id, { transaction: t, paranoid: false });
      if (user) {
        const userUpdates = {};

        if (mobile && mobile !== user.mobile) {
          const existingMobileUser = await User.findOne({ where: { mobile }, transaction: t, paranoid: false });
          if (existingMobileUser && existingMobileUser.id !== user.id) {
            const err = new Error('Mobile already exist');
            err.status = 409;
            throw err;
          }
          userUpdates.mobile = mobile;
        }

        if (name && name !== user.name) userUpdates.name = name;
        if (Object.keys(userUpdates).length) await user.update(userUpdates, { transaction: t });
      }

      updatedEmployee = employee;
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(updatedEmployee.id),
      log_text: `Employee updated: #${updatedEmployee.id} ${beforeName || '-'} → ${updatedEmployee.name || '-'}`,
    });

    return res.json({ success: true, data: updatedEmployee });
  } catch (error) {
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500;
    console.error('[employees:update] error', error);
    return res.status(status).json({ success: false, message: error.message || 'Failed to update employee' });
  }
});

const handleEmployeeStatusMutation = async (req, res, field, value, message) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const payload = { [field]: value };
    if (field === 'verification_status') {
      payload.verification_at = (value === 'verified' || value === 'rejected') ? new Date() : null;
    }
    if (field === 'kyc_status') {
      payload.kyc_verification_at = (value === 'verified' || value === 'rejected') ? new Date() : null;
    }

    await employee.update(payload);

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee ${field} set to ${value}: #${employee.id} ${employee.name || '-'}`,
    });

    return res.json({ success: true, message });
  } catch (error) {
    console.error(`[employees:${field}] error`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

router.post('/:id/approve', authenticate, (req, res) =>
  handleEmployeeStatusMutation(req, res, 'verification_status', 'verified', 'Verification marked as verified')
);
router.post('/:id/reject', authenticate, (req, res) =>
  handleEmployeeStatusMutation(req, res, 'verification_status', 'rejected', 'Verification rejected')
);
router.post('/:id/kyc/grant', authenticate, (req, res) =>
  handleEmployeeStatusMutation(req, res, 'kyc_status', 'verified', 'KYC marked as verified')
);
router.post('/:id/kyc/reject', authenticate, (req, res) =>
  handleEmployeeStatusMutation(req, res, 'kyc_status', 'rejected', 'KYC rejected')
);

router.post('/:id/change-subscription', authenticate, async (req, res) => {
  try {
    const { subscription_plan_id } = req.body || {};
    if (!subscription_plan_id) return res.status(400).json({ success: false, message: 'subscription_plan_id is required' });

    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const plan = await EmployeeSubscriptionPlan.findByPk(subscription_plan_id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const validityDays = Number(plan.plan_validity_days) || 0;
    const expiryAt = validityDays ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000) : null;

    await employee.update({
      subscription_plan_id: plan.id,
      total_contact_credit: Number(plan.contact_credits) || 0,
      total_interest_credit: Number(plan.interest_credits) || 0,
      contact_credit: 0,
      interest_credit: 0,
      credit_expiry_at: expiryAt,
    });

    await safeLog(req, {
      category: 'employee subscription',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee subscription changed: #${employee.id} plan=${plan.plan_name_english || plan.plan_name_hindi || plan.id}, expiry=${expiryAt ? expiryAt.toISOString() : '-'}`,
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee subscription changed (employee log): #${employee.id} plan=${plan.plan_name_english || plan.plan_name_hindi || plan.id}`,
    });

    return res.json({
      success: true,
      message: 'Subscription updated',
      data: {
        subscription_plan_id: plan.id,
        credit_expiry_at: expiryAt,
        total_contact_credit: employee.total_contact_credit,
        total_interest_credit: employee.total_interest_credit,
      },
    });
  } catch (error) {
    console.error('[employees:change-subscription] error', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/add-credits', authenticate, async (req, res) => {
  try {
    const contactDelta = Number(req.body?.contact_credits) || 0;
    const interestDelta = Number(req.body?.interest_credits) || 0;
    if (contactDelta <= 0 && interestDelta <= 0) return res.status(400).json({ success: false, message: 'Provide credits to add' });

    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const updatePayload = {
      total_contact_credit: Number(employee.total_contact_credit || 0) + Math.max(contactDelta, 0),
      total_interest_credit: Number(employee.total_interest_credit || 0) + Math.max(interestDelta, 0),
    };
    if (req.body?.credit_expiry_at) updatePayload.credit_expiry_at = req.body.credit_expiry_at;

    await employee.update(updatePayload);

    await safeCreateManualCreditHistory({
      user_type: 'employee',
      user_id: employee.id,
      contact_credit: Math.max(contactDelta, 0),
      interest_credit: Math.max(interestDelta, 0),
      ad_credit: 0,
      expiry_date: req.body?.credit_expiry_at || null,
      admin_id: getAdminId(req) || null,
    });

    await safeLog(req, {
      category: 'employee subscription',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee credits added: #${employee.id} +${Math.max(contactDelta, 0)} contact, +${Math.max(interestDelta, 0)} interest`,
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee credits updated (employee log): #${employee.id} +${Math.max(contactDelta, 0)} contact, +${Math.max(interestDelta, 0)} interest`,
    });

    return res.json({
      success: true,
      message: 'Credits updated',
      data: {
        total_contact_credit: employee.total_contact_credit,
        total_interest_credit: employee.total_interest_credit,
        credit_expiry_at: employee.credit_expiry_at,
      },
    });
  } catch (error) {
    console.error('[employees:add-credits] error', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});



/**
 * GET /employees/:id/recommended-jobs
 * Jobs recommended for an employee based on:
 * - Preferred state/city matching (if present)
 * - Gender matching (job gender 'any' matches all)
 * - Expected salary within job salary_min/salary_max (if employee expected salary present)
 * - Job profile matches any of employee's selected job profiles
 */
router.get('/:id/recommended-jobs', authenticate, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const employee = await Employee.findByPk(employeeId, {
      attributes: ['id', 'gender', 'expected_salary', 'preferred_state_id', 'preferred_city_id'],
      paranoid: true
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const profileRows = await EmployeeJobProfile.findAll({
      where: { employee_id: employeeId },
      attributes: ['job_profile_id'],
      paranoid: true
    });
    const jobProfileIds = profileRows.map(r => r.job_profile_id).filter(Boolean);
    if (!jobProfileIds.length) return res.json({ success: true, data: [] });

    const expectedSalary = employee.expected_salary === null || employee.expected_salary === undefined || employee.expected_salary === ''
      ? null
      : Number(employee.expected_salary);

    const where = {
      job_profile_id: { [Op.in]: jobProfileIds }
    };

    if (employee.preferred_state_id) where.job_state_id = employee.preferred_state_id;
    if (employee.preferred_city_id) where.job_city_id = employee.preferred_city_id;

    const and = [];

    // Include only active + expired (exclude inactive).
    // Expired means: status='expired' OR expired_at is non-null.
    and.push({
      [Op.or]: [
        { status: 'active', expired_at: { [Op.is]: null } },
        { [Op.or]: [{ status: 'expired' }, { expired_at: { [Op.not]: null } }] }
      ]
    });

    if (Number.isFinite(expectedSalary)) {
      and.push(Sequelize.literal(`(Job.salary_min IS NULL OR Job.salary_min <= ${sequelize.escape(expectedSalary)})`));
      and.push(Sequelize.literal(`(Job.salary_max IS NULL OR Job.salary_max >= ${sequelize.escape(expectedSalary)})`));
    }

    const gender = (employee.gender || '').toString().trim().toLowerCase();
    if (gender) {
      and.push(Sequelize.literal(`(
        NOT EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id)
        OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = 'any')
        OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = ${sequelize.escape(gender)})
      )`));
    }

    where[Op.and] = and;

    const jobs = await Job.findAll({
      where,
      attributes: [
        'id',
        'employer_id',
        'job_profile_id',
        'is_household',
        'interviewer_contact',
        'work_start_time',
        'work_end_time',
        'salary_min',
        'salary_max',
        'no_vacancy',
        'hired_total',
        'status',
        'verification_status',
        'job_state_id',
        'job_city_id',
        'created_at',
        'expired_at'
      ],
      include: [
        {
          model: Employer,
          as: 'Employer',
          attributes: ['id', 'name', 'organization_name', 'organization_type'],
          required: false,
          paranoid: false,
          include: [{ model: User, as: 'User', attributes: ['mobile'], required: false, paranoid: false }]
        },
        { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'], required: false },
        { model: JobGender, as: 'JobGenders', attributes: ['gender'], required: false },
        {
          model: JobExperience,
          as: 'JobExperiences',
          attributes: ['experience_id'],
          required: false,
          include: [{ model: Experience, as: 'Experience', attributes: ['title_english'], required: false }]
        },
        {
          model: JobQualification,
          as: 'JobQualifications',
          attributes: ['qualification_id'],
          required: false,
          include: [{ model: Qualification, as: 'Qualification', attributes: ['qualification_english'], required: false }]
        },
        {
          model: JobShift,
          as: 'JobShifts',
          attributes: ['shift_id'],
          required: false,
          include: [{ model: Shift, as: 'Shift', attributes: ['shift_english'], required: false }]
        },
        {
          model: JobSkill,
          as: 'JobSkills',
          attributes: ['skill_id'],
          required: false,
          include: [{ model: Skill, as: 'Skill', attributes: ['skill_english'], required: false }]
        },
        {
          model: SelectedJobBenefit,
          as: 'SelectedJobBenefits',
          attributes: ['benefit_id'],
          required: false,
          include: [{ model: JobBenefit, as: 'JobBenefit', attributes: ['benefit_english'], required: false }]
        },
        { model: State, as: 'JobState', attributes: ['state_english'], required: false },
        { model: City, as: 'JobCity', attributes: ['city_english'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: 200
    });

    const formatTime12h = (timeStr) => {
      if (!timeStr) return null;
      const s = String(timeStr);
      const parts = s.split(':');
      if (parts.length < 2) return s;
      let h = parseInt(parts[0], 10);
      const m = parts[1];
      if (Number.isNaN(h)) return s;
      const suffix = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${suffix}`;
    };

    const shiftTimingDisplay = (start, end) => {
      const a = formatTime12h(start);
      const b = formatTime12h(end);
      if (!a && !b) return null;
      if (a && b) return `${a} - ${b}`;
      return a || b;
    };

    const jobLife = (createdAt) => {
      if (!createdAt) return null;
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return null;
      const ms = Date.now() - d.getTime();
      const days = Math.max(Math.floor(ms / 86400000), 0);
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    };

    const data = jobs.map((job) => {
      const employer = job.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      const genders = (job.JobGenders || []).map(g => g.gender).filter(Boolean);
      const experiences = (job.JobExperiences || []).map(x => x.Experience?.title_english).filter(Boolean);
      const qualifications = (job.JobQualifications || []).map(x => x.Qualification?.qualification_english).filter(Boolean);
      const shifts = (job.JobShifts || []).map(x => x.Shift?.shift_english).filter(Boolean);
      const skills = (job.JobSkills || []).map(x => x.Skill?.skill_english).filter(Boolean);
      const benefits = (job.SelectedJobBenefits || []).map(x => x.JobBenefit?.benefit_english).filter(Boolean);

      return {
        job_id: job.id,
        employer_id: job.employer_id,
        employer_name: employer?.name || null,
        organization_name: employer?.organization_name || null,
        organization_type: employer?.organization_type || null,
        employer_phone: employerPhone,
        interviewer_contact: job.interviewer_contact || null,
        job_profile_id: job.job_profile_id || null,
        job_profile: job.JobProfile?.profile_english || null,
        shift_timing_display: shiftTimingDisplay(job.work_start_time, job.work_end_time),
        is_household: !!job.is_household,
        genders: genders.length ? Array.from(new Set(genders)).join(', ') : null,
        experiences: experiences.length ? Array.from(new Set(experiences)).join(', ') : null,
        qualifications: qualifications.length ? Array.from(new Set(qualifications)).join(', ') : null,
        shifts: shifts.length ? Array.from(new Set(shifts)).join(', ') : null,
        skills: skills.length ? Array.from(new Set(skills)).join(', ') : null,
        benefits: benefits.length ? Array.from(new Set(benefits)).join(', ') : null,
        verification_status: job.verification_status,
        no_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        job_state: job.JobState?.state_english || null,
        job_city: job.JobCity?.city_english || null,
        is_expired: job.status === 'expired' || !!job.expired_at,
        job_status: (job.status === 'expired' || !!job.expired_at) ? 'expired' : 'active',
        job_life: jobLife(job.created_at),
        created_at: job.created_at
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('[employees] recommended jobs error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch recommended jobs' });
  }
});

// Configure multer for certificate uploads
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'certificates');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cert-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const certificateUpload = multer({
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPG, PNG, GIF) and PDF files allowed'));
  }
});

/**
 * GET /employees/:id/documents
 * List all documents for a specific employee.
 */
router.get('/:id/documents', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const rows = await EmployeeDocument.findAll({
      where: { user_id: emp.id },
      order: [['id','ASC']],
      paranoid: true
    });
    res.json({ success:true, data: rows });
  } catch (e) {
    console.error('[employee documents] list error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

// upload / replace a document by type (resume|driving_license|other) // added
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive:true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, (req.query.type || 'doc') + '-' + suffix + path.extname(file.originalname));
  }
});
const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 5*1024*1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|pdf/.test(file.mimetype.toLowerCase());
    ok ? cb(null,true) : cb(new Error('Only image/PDF allowed'));
  }
});

/**
 * POST /employees/:id/documents/upload
 * Upload or replace a document for an employee.
 */
router.post('/:id/documents/upload', docUpload.single('file'), async (req, res) => {
  try {
    const type = (req.query.type || '').toLowerCase();
    if (!['resume','driving_license','other'].includes(type))
      return res.status(400).json({ success:false, message:'Invalid type (resume|driving_license|other)' });
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    if (!req.file) return res.status(400).json({ success:false, message:'No file uploaded' });

    const relPath = `/uploads/documents/${req.file.filename}`;
    let doc = await EmployeeDocument.findOne({ where:{ user_id: emp.id, document_type: type }, paranoid:false });
    const payload = {
      user_id: emp.id,
      document_type: type,
      document_name: req.file.originalname,
      document_size: req.file.size,
      document_link: relPath
    };
    if (doc) {
      if (doc.deleted_at) await doc.restore();
      await doc.update(payload);
    } else {
      doc = await EmployeeDocument.create(payload);
    }
    await safeLog(req, {
      category: 'document',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Employee document uploaded: #${emp.id} ${emp.name || "-"} type=${type === "resume" ? "Resume" : type === "driving_license" ? "Driving License" : type === "other" ? "Other" : type} title=${req.file?.originalname || "-"}`
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Employee document updated (employee log): #${emp.id} ${emp.name || "-"} type=${type === "resume" ? "Resume" : type === "driving_license" ? "Driving License" : type === "other" ? "Other" : type} title=${req.file?.originalname || "-"}`
    });
    res.json({ success:true, data: doc });
  } catch (e) {
    console.error('[employee documents] upload error:', e);
    res.status(500).json({ success:false, message:e.message });
  }


/**
 * DELETE /employees/:id/documents/:docId
 * Delete a document for an employee.
 */
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const docId = Number(req.params.docId);
    if (!employeeId || !docId) return res.status(400).json({ success: false, message: 'Invalid id' });

    const emp = await Employee.findByPk(employeeId, { paranoid: false });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const doc = await EmployeeDocument.findByPk(docId, { paranoid: false });
    if (!doc || Number(doc.user_id) != employeeId) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    await doc.destroy();

    await safeLog(req, {
      category: 'document',
      type: 'delete',
      redirect_to: employeeRedirect(employeeId),
      log_text: `Employee document deleted: #${employeeId} ${emp.name || "-"} type=${doc.document_type === "resume" ? "Resume" : doc.document_type === "driving_license" ? "Driving License" : doc.document_type === "other" ? "Other" : doc.document_type} title=${doc.document_name || "-"}`
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employeeId),
      log_text: `Employee document deleted (employee log): #${employeeId} ${emp.name || "-"} type=${doc.document_type === "resume" ? "Resume" : doc.document_type === "driving_license" ? "Driving License" : doc.document_type === "other" ? "Other" : doc.document_type} title=${doc.document_name || "-"}`
    });

    return res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    console.error('[employee documents] delete error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});
});

/**
 * DELETE /employees/:id
 * Soft delete an employee and mark the user as deleted.
 */
router.delete('/:id', async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const employeeId = Number(req.params.id);
    const employee = employeeId ? await Employee.findByPk(employeeId, { paranoid: false }) : null;
    await deleteByEmployeeId(req.params.id, { deletedByAdminId: adminId ? Number(adminId) : undefined });
    await safeLog(req, {
      category: 'employee',
      type: 'delete',
      redirect_to: '/employees',
      log_text: `Employee deleted: #${employeeId || req.params.id} ${employee?.name || '-'}`,
    });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    console.error('Employee delete error:', error);
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * GET /employees/:id/job-profiles
 * Fetch job profiles linked to an employee.
 */
router.get('/:id/job-profiles', async (req, res) => {
  try {
    if (!EmployeeJobProfile || !JobProfile) {
      return res.json({ success: true, data: [] });
    }
    const rows = await EmployeeJobProfile.findAll({
      where: { employee_id: req.params.id },
      include: [{ model: JobProfile, as: 'JobProfile' }],
      paranoid: true
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Employee job profiles fetch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /employees/:id/job-profiles
 * Replace employee job profiles (maximum three).
 */
router.post('/:id/job-profiles', authenticate, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (!employeeId || Number.isNaN(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    let incoming = req.body.job_profile_ids;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: 'job_profile_ids must be an array' });
    }
    const ids = [...new Set(incoming.map(n => parseInt(n)).filter(n => !Number.isNaN(n)))].slice(0, 3);
    if (ids.length === 0) {
      await EmployeeJobProfile.destroy({ where: { employee_id: employeeId } });
      await safeLog(req, {
        category: "employee",
        type: "update",
        redirect_to: employeeRedirect(employeeId),
        log_text: `Employee job profiles updated: #${employeeId} cleared`,
      });
      return res.json({ success: true, data: [] });
    }
    const foundProfiles = await JobProfile.findAll({ where: { id: ids }, paranoid: true });
    const foundSet = new Set(foundProfiles.map(p => p.id));
    const missing = ids.filter(id => !foundSet.has(id));
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Invalid job_profile_ids (not found): ${missing.join(', ')}` });
    }
    const { Op } = require('sequelize');

    // Fetch all (include soft-deleted) existing relations
    const existingAll = await EmployeeJobProfile.findAll({
      where: { employee_id: employeeId },
      paranoid: false
    });
    const activeSet = new Set(existingAll.filter(r => !r.deleted_at).map(r => r.job_profile_id));
    const softDeletedMap = new Map(
      existingAll.filter(r => !!r.deleted_at).map(r => [r.job_profile_id, r])
    );

    // Soft-delete relations not in new list (only those currently active)
    if (activeSet.size) {
      await EmployeeJobProfile.destroy({
        where: { employee_id: employeeId, job_profile_id: { [Op.notIn]: ids } }
      });
    }

    const needsUserId = !!EmployeeJobProfile.rawAttributes.user_id;

    // Ensure each requested ID is active: create or restore
    for (const jpId of ids) {
      if (activeSet.has(jpId)) continue; // already active
      if (softDeletedMap.has(jpId)) {
        // restore soft-deleted
        try {
          await softDeletedMap.get(jpId).restore();
        } catch (e) {
          console.warn('[employees/:id/job-profiles] restore failed, will recreate:', jpId, e.message);
          const payload = { employee_id: employeeId, job_profile_id: jpId };
          if (needsUserId) payload.user_id = employee.user_id;
          await EmployeeJobProfile.create(payload);
        }
      } else {
        const payload = { employee_id: employeeId, job_profile_id: jpId };
        if (needsUserId) payload.user_id = employee.user_id;
        try {
          await EmployeeJobProfile.create(payload);
        } catch (e) {
          if (e.name === 'SequelizeUniqueConstraintError') {
            console.warn('[employees/:id/job-profiles] duplicate skipped:', jpId);
          } else {
            throw e;
          }
        }
      }
    }

    // Return only active (paranoid) rows
    const rows = await EmployeeJobProfile.findAll({
      where: { employee_id: employeeId },
      include: [{ model: JobProfile, as: 'JobProfile' }],
      paranoid: true
    });
    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employeeId),
      log_text: `Employee job profiles updated: #${employeeId} -> [${foundProfiles.map(p => (p.profile_english || p.profile_hindi || p.id)).join(", ")}]`
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[employees/:id/job-profiles] update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/experiences
 * List work experiences for an employee.
 */
router.get('/:id/experiences', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const rows = await EmployeeExperience.findAll({
      where: { user_id: emp.id },
      order: [['id','ASC']],
      paranoid: true
    });
    res.json({ success:true, data: rows });
  } catch (e) {
    console.error('[experiences] list error', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * POST /employees/experiences/upload/certificate
 * Upload an experience certificate asset.
 */
router.post('/experiences/upload/certificate', certificateUpload.single('certificate'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const relativePath = `/uploads/certificates/${req.file.filename}`;
    res.json({ success: true, path: relativePath, url: relativePath });
  } catch (err) {
    console.error('[certificate upload] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /employees/:id/experiences
 * Create a new work experience entry.
 */
router.post('/:id/experiences', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const {
      previous_firm,
      work_duration,
      work_duration_frequency,
      document_type_id,
      work_nature_id,
      experience_certificate
    } = req.body || {};
    if (!previous_firm) {
      return res.status(400).json({ success:false, message:'previous_firm required' });
    }
    const exp = await EmployeeExperience.create({
      user_id: emp.id,
      previous_firm,
      work_duration: work_duration || null,
      work_duration_frequency: work_duration_frequency || null,
      document_type_id: document_type_id || null,
      work_nature_id: work_nature_id || null,
      experience_certificate: experience_certificate || null
    });
    await safeLog(req, {
      category: 'experience',
      type: 'add',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience created: employee #${emp.id} (${emp.name || '-'}) firm=${previous_firm}`,
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience created (employee log): employee #${emp.id} firm=${previous_firm}`,
    });
    res.status(201).json({ success:true, data: exp });
  } catch (e) {
    console.error('[experiences] create error', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * PUT /employees/:id/experiences/:expId
 * Update a specific experience record.
 */
router.put('/:id/experiences/:expId', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const exp = await EmployeeExperience.findByPk(req.params.expId);
    if (!exp || exp.user_id !== emp.id) {
      return res.status(404).json({ success:false, message:'Experience not found' });
    }
    const payload = { ...req.body };
    ['previous_firm','work_duration','work_duration_frequency','experience_certificate'].forEach(f=>{
      if (payload[f] === '') payload[f] = null;
    });
    await exp.update(payload);
    await safeLog(req, {
      category: 'experience',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience updated: employee #${emp.id} (${emp.name || '-'}) firm=${exp.previous_firm || '-'}`,
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience updated (employee log): employee #${emp.id} (${emp.name || '-'}) firm=${exp.previous_firm || '-'}`,
    });
    res.json({ success:true, data: exp });
  } catch (e) {
    console.error('[experiences] update error', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * DELETE /employees/:id/experiences/:expId
 * Delete a specific experience record.
 */
router.delete('/:id/experiences/:expId', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const exp = await EmployeeExperience.findByPk(req.params.expId);
    if (!exp || exp.user_id !== emp.id) {
      return res.status(404).json({ success:false, message:'Experience not found' });
    }
    await exp.destroy();
    await safeLog(req, {
      category: 'experience',
      type: 'delete',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience deleted: employee #${emp.id} (${emp.name || '-'}) firm=${exp.previous_firm || '-'}`,
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(emp.id),
      log_text: `Experience deleted (employee log): employee #${emp.id} (${emp.name || '-'}) firm=${exp.previous_firm || '-'}`,
    });
    res.json({ success:true, message:'Deleted' });
  } catch (e) {
    console.error('[experiences] delete error', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * GET /employees/:id/applications
 * List sent and received job interests for an employee.
 */
router.get('/:id/applications', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    // employees table -> employee KYC status
    const emp = await Employee.findByPk(employeeId, { attributes: ['id', 'kyc_status'], paranoid: false });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // job_interests (base)
    const interests = await JobInterest.findAll({
      where: {
        [Op.or]: [
          { sender_type: 'employee', sender_id: emp.id },
          { sender_type: 'employer', receiver_id: emp.id }
        ]
      },
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    if (!interests.length) {
      return res.json({ success: true, data: { sent: [], received: [] } });
    }

    const jobIds = [...new Set(interests.map(i => i.job_id).filter(Boolean))];
    const employerIds = [...new Set(
      interests
        .map(i => (i.sender_type === 'employee' ? i.receiver_id : (i.sender_type === 'employer' ? i.sender_id : null)))
        .filter(Boolean)
    )];

    // join with Job to get job status (+ other job fields the UI already uses)
    const jobs = jobIds.length
      ? await Job.findAll({
          where: { id: jobIds },
          include: [
            { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'] },
            { model: State, as: 'JobState', attributes: ['state_english'] },
            { model: City, as: 'JobCity', attributes: ['city_english'] }
          ],
          paranoid: false
        })
      : [];
    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    // join Employer -> User to get employer phone
    const employers = employerIds.length
      ? await Employer.findAll({
          where: { id: employerIds },
          attributes: ['id', 'name', 'organization_name'],
          include: [{ model: User, as: 'User', attributes: ['mobile'], required: false, paranoid: false }],
          paranoid: false
        })
      : [];
    const employersMap = {};
    employers.forEach(e => { employersMap[e.id] = e; });

    const sent = [];
    const received = [];

    for (const i of interests) {
      const job = jobsMap[i.job_id];
      const employerId =
        i.sender_type === 'employee'
          ? i.receiver_id
          : (i.sender_type === 'employer' ? i.sender_id : null);
      const employer = employerId ? employersMap[employerId] : null;

      // keep behavior: if job/employer missing, skip row
      if (!job || !employer) continue;

      const vacancyLeft = (Number(job.no_vacancy || 0) - Number(job.hired_total || 0));

      const row = {
        id: i.id,
        job_id: job.id,
        job_profile: job.JobProfile?.profile_english || '',
        employer_id: employer.id,
        employer_name: employer.name,
        organization_name: employer.organization_name,
        employer_phone: employer.User?.mobile || null, // NEW (via join)

        job_state: job.JobState?.state_english || '',
        job_city: job.JobCity?.city_english || '',
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        total_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        vacancy_left: vacancyLeft,

        employee_kyc_status: emp.kyc_status || null, // NEW (employees table)
        job_status: job.status || null,              // NEW

        status: i.status === 'pending' ? 'Active' : i.status,
        applied_at: i.created_at,
        received_at: i.created_at
      };

      if (i.sender_type === 'employee') sent.push(row);
      else if (i.sender_type === 'employer') received.push(row);
    }

    res.json({ success: true, data: { sent, received } });
  } catch (e) {
    console.error('[employee applications] error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /employees/:id/hired-jobs
 * List hired jobs associated with an employee.
 */
router.get('/:id/hired-jobs', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const interests = await JobInterest.findAll({
      where: {
        status: 'hired',
        [require('sequelize').Op.or]: [
          { sender_type: 'employee', sender_id: emp.id },
          { sender_type: 'employer', receiver_id: emp.id }
        ]
      },
      order: [['updated_at', 'DESC']],
      paranoid: true
    });

    const jobIds = [...new Set(interests.map(i => i.job_id))];
    const employerIds = [...new Set(
      interests.map(i =>
        i.sender_type === 'employee'
          ? i.receiver_id
          : (i.sender_type === 'employer' ? i.sender_id : null)
      ).filter(Boolean)
    )];

    const jobs = await Job.findAll({
      where: { id: jobIds },
      include: [
        { model: require('../models/JobProfile'), as: 'JobProfile', attributes: ['id', 'profile_english'] },
        { model: State, as: 'JobState', attributes: ['state_english'] },
        { model: City, as: 'JobCity', attributes: ['city_english'] }
      ],
      paranoid: false
    });
    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    // CHANGED: include Employer.kyc_status + Employer.User.mobile (phone)
    const employers = await Employer.findAll({
      where: { id: employerIds },
      attributes: ['id', 'name', 'organization_name', 'kyc_status'],
      include: [{ model: User, as: 'User', attributes: ['mobile'], required: false, paranoid: false }],
      paranoid: false
    });
    const employersMap = {};
    employers.forEach(e => { employersMap[e.id] = e; });

    const hired = [];
    for (const i of interests) {
      const job = jobsMap[i.job_id];
      const employerId = i.sender_type === 'employee' ? i.receiver_id : (i.sender_type === 'employer' ? i.sender_id : null);
      const employer = employerId ? employersMap[employerId] : null;
      if (!job || !employer) continue;

      const vacancyLeft = (job.no_vacancy || 0) - (job.hired_total || 0);

      hired.push({
        id: i.id,
        job_id: job.id,
        job_profile: job.JobProfile?.profile_english || '',
        employer_id: employer.id,
        employer_name: employer.name,
        organization_name: employer.organization_name,

        // NEW
        employer_phone: employer.User?.mobile || null,
        employer_kyc_status: employer.kyc_status || null,
        job_status: job.status || null,

        job_state: job.JobState?.state_english || '',
        job_city: job.JobCity?.city_english || '',
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        total_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        vacancy_left: vacancyLeft,
        status: i.status,
        hired_at: i.updated_at,
        otp: i.otp || null,
      });
    }

    res.json({ success: true, data: hired });
  } catch (e) {
    console.error('[employee hired-jobs] error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /employees/:id/wishlist
 * Fetch wishlist jobs for an employee.
 */
router.get('/:id/wishlist', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Find all wishlist entries for this employee
    const wishlistRows = await Wishlist.findAll({
      where: { employee_id: emp.id },
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    const jobIds = wishlistRows.map(w => w.job_id);
    if (!jobIds.length) return res.json({ success: true, data: [] });

    // Fetch jobs and related info
    const JobProfile = require('../models/JobProfile');
    const jobs = await Job.findAll({
      where: { id: jobIds },
      include: [
        { model: JobProfile, as: 'JobProfile', attributes: ['profile_english'] },
        { model: Employer, as: 'Employer', attributes: ['id', 'name'] },
        { model: State, as: 'JobState', attributes: ['state_english'] },
        { model: City, as: 'JobCity', attributes: ['city_english'] }
      ],
      paranoid: false
    });

    // Map jobId to job for quick lookup
    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    // Compose result
    const data = wishlistRows.map(w => {
      const job = jobsMap[w.job_id];
      if (!job) return null;
      const vacancyLeft = (job.no_vacancy || 0) - (job.hired_total || 0);
      return {
        id: w.id,
        job_id: job.id,
        job_profile: job.JobProfile?.profile_english || '',
        employer_id: job.Employer?.id,
        employer_name: job.Employer?.name,
        job_state: job.JobState?.state_english || '',
        job_city: job.JobCity?.city_english || '',
        work_start_time: job.work_start_time,
        work_end_time: job.work_end_time,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        no_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        vacancy_left: vacancyLeft,
        status: job.status,
        created_at: w.created_at
      };
    }).filter(Boolean);

    res.json({ success: true, data });
  } catch (e) {
    console.error('[employee wishlist] error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /employees/:id/credit-history
 * Review contact and interest credit usage.
 */
router.get('/:id/credit-history', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    // CONTACT credits
    const contacts = await EmployeeContact.findAll({
      where: { employee_id: employeeId },
      paranoid: false,
      order: [['created_at', 'DESC']]
    });

    const employerIds = [...new Set(contacts.map(c => c.employer_id).filter(Boolean))];
    const callExperienceIds = [...new Set(contacts.map(c => c.call_experience_id).filter(Boolean))];

    const employers = employerIds.length
      ? await Employer.findAll({
          where: { id: employerIds },
          include: [{ model: User, as: 'User', attributes: ['id', 'mobile'], required: false, paranoid: false }],
          paranoid: false
        })
      : [];
    const employerMap = {};
    employers.forEach(e => { employerMap[e.id] = e; });

    const callHistories = callExperienceIds.length
      ? await CallHistory.findAll({
          where: {
            call_experience_id: callExperienceIds,
            user_type: 'employee'
          },
          paranoid: false
        })
      : [];

    const callHistoryMap = {};
    const employeeExpIds = new Set();
    const employerExpIds = new Set();

    callHistories.forEach(ch => {
      callHistoryMap[ch.id] = ch;
      if (ch.call_experience_id) {
        if (ch.user_type === 'employee') employeeExpIds.add(ch.call_experience_id);
        else if (ch.user_type === 'employer') employerExpIds.add(ch.call_experience_id);
      }
    });

    const employeeExpMap = {};
    if (employeeExpIds.size && EmployeeCallExperience) {
      const exps = await EmployeeCallExperience.findAll({ where: { id: [...employeeExpIds] }, paranoid: false });
      exps.forEach(exp => { employeeExpMap[exp.id] = exp; });
    }

    const employerExpMap = {};
    if (employerExpIds.size && EmployerCallExperience) {
      const exps = await EmployerCallExperience.findAll({ where: { id: [...employerExpIds] }, paranoid: false });
      exps.forEach(exp => { employerExpMap[exp.id] = exp; });
    }

    const getCallExperienceLabel = (history) => {
      if (!history?.call_experience_id) return '-';
      if (history.user_type === 'employee') {
        const exp = employeeExpMap[history.call_experience_id];
        return exp?.experience_english || exp?.experience_hindi || '-';
      }
      if (history.user_type === 'employer') {
        const exp = employerExpMap[history.call_experience_id];
        return exp?.experience_english || exp?.experience_hindi || '-';
      }
      return '-';
    };

    const contactData = contacts.map(c => {
      const employer = employerMap[c.employer_id];
      const user = employer?.User;
      const callHistory = c.call_experience_id ? callHistoryMap[c.call_experience_id] : null;
      const experienceLabel = getCallExperienceLabel(callHistory, c.call_experience_id);

      return {
        type: 'contact',
        amount: c.closing_credit ?? '-',
        employer_id: c.employer_id,
        employer_name: employer?.name ?? '-',
        verification_status: employer?.verification_status ?? '-',
        kyc_status: employer?.kyc_status ?? '-',
        mobile: user?.mobile ?? '-',
        call_experience: experienceLabel,
        review: callHistory?.review || '-',
        date: c.created_at,
      };
    });

    // INTEREST credits (based on job_interests sent by this employee)
    const interests = await JobInterest.findAll({
      where: {
        sender_type: 'employee',
        sender_id: employeeId
      },
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    const interestJobIds = [...new Set(interests.map(i => i.job_id).filter(Boolean))];
    const interestEmployerIds = [...new Set(interests.map(i => i.receiver_id).filter(Boolean))];

    const jobs = interestJobIds.length
      ? await Job.findAll({
          where: { id: interestJobIds },
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'], required: false }],
          paranoid: false
        })
      : [];
    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    const interestEmployers = interestEmployerIds.length
      ? await Employer.findAll({
          where: { id: interestEmployerIds },
          attributes: ['id', 'name', 'organization_name'],
          include: [{ model: User, as: 'User', attributes: ['mobile'], required: false, paranoid: false }],
          paranoid: false
        })
      : [];
    const interestEmployersMap = {};
    interestEmployers.forEach(e => { interestEmployersMap[e.id] = e; });

    const interestData = interests.map(i => {
      const job = jobsMap[i.job_id];
      const employer = interestEmployersMap[i.receiver_id];
      if (!job || !employer) return null;

      return {
        type: 'interest',
        amount: 1,

        job_id: job.id,
        employer_id: employer.id,

        job_profile: job.JobProfile?.profile_english || '-',
        employer_name: employer.name || '-',
        organization_name: employer.organization_name || '-',
        employer_mobile: employer.User?.mobile || null,
        employer_phone: employer.User?.mobile || null,

        job_status: job.status || null,
        job_interest_status: i.status || null,

        created_at: i.created_at,
        date: i.created_at,
      };
    }).filter(Boolean);

    res.json({ success: true, data: [...contactData, ...interestData] });
  } catch (err) {
    console.error('[employees/:id/credit-history] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/manual-credit-history
 * List manual credits added by admins.
 */
router.get('/:id/manual-credit-history', authenticate, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const rows = await ManualCreditHistory.findAll({
      where: { user_type: 'employee', user_id: employeeId },
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    const adminIds = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
    const admins = adminIds.length
      ? await Admin.findAll({ where: { id: adminIds }, attributes: ['id', 'name'], paranoid: false })
      : [];
    const adminMap = new Map(admins.map((a) => [a.id, a.name]));

    const data = rows.map((r) => ({
      id: r.id,
      user_type: r.user_type,
      user_id: r.user_id,
      contact_credit: r.contact_credit,
      interest_credit: r.interest_credit,
      ad_credit: r.ad_credit,
      expiry_date: r.expiry_date,
      admin_id: r.admin_id,
      admin_name: r.admin_id ? (adminMap.get(r.admin_id) || null) : null,
      created_at: r.created_at,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/manual-credit-history] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/call-experiences
 * Fetch call experiences logged for the employee.
 */
router.get('/:id/call-experiences', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const Employee = require('../models/Employee');
    const CallHistory = require('../models/CallHistory');
    const EmployeeCallExperience = require('../models/EmployeeCallExperience');
    const EmployeeContact = require('../models/EmployeeContact');
        
    const emp = await Employee.findByPk(employeeId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Fetch call histories for this employee as user
    const callHistories = await CallHistory.findAll({
      where: { user_type: 'employee', user_id: employeeId },
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    // Collect call_experience_ids
    const callExperienceIds = callHistories.map(ch => ch.call_experience_id).filter(Boolean);

    // Fetch call experience names
    let callExperienceMap = {};
    if (callExperienceIds.length) {
      const callExperiences = await EmployeeCallExperience.findAll({
        where: { id: callExperienceIds },
        paranoid: false
      });
      callExperienceMap = {};
      callExperiences.forEach(exp => { callExperienceMap[exp.id] = exp; });
    }

    // Fetch employee contacts for this employee and these call_experience_ids
    let contactsMap = {};
    if (callExperienceIds.length) {
      const contacts = await EmployeeContact.findAll({
        where: {
          employee_id: employeeId,
          call_experience_id: callExperienceIds
        },
        paranoid: false
      });
      contactsMap = {};
      contacts.forEach(c => { contactsMap[`${c.call_experience_id}`] = c; });
    }

    // Collect employer_ids and job_ids from contacts
    const employerIds = [];
    const jobIds = [];
    Object.values(contactsMap).forEach(c => {
      if (c.employer_id) employerIds.push(c.employer_id);
      if (c.job_id) jobIds.push(c.job_id);
    });

    // Fetch employers and jobs
    let employerMap = {};
    if (employerIds.length) {
      const employers = await Employer.findAll({
        where: { id: employerIds },
        attributes: ['id', 'name'],
        paranoid: false
      });
      employerMap = {};
      employers.forEach(e => { employerMap[e.id] = e; });
    }
    let jobMap = {};
    if (jobIds.length) {
      const jobs = await Job.findAll({
        where: { id: jobIds },
        attributes: ['id', 'job_profile_id'],
        include: [
          { model: require('../models/JobProfile'), as: 'JobProfile', attributes: ['profile_english'] }
        ],
        paranoid: false
      });
      jobMap = {};
      jobs.forEach(j => { jobMap[j.id] = j; });
    }

    // Compose result
    const data = callHistories.map(ch => {
      const callExp = ch.call_experience_id ? callExperienceMap[ch.call_experience_id] : null;
      const contact = ch.call_experience_id ? contactsMap[`${ch.call_experience_id}`] : null;
      const employer = contact && contact.employer_id ? employerMap[contact.employer_id] : null;
      const job = contact && contact.job_id ? jobMap[contact.job_id] : null;
      return {
        id: ch.id,
        call_experience_id: ch.call_experience_id,
        call_experience: callExp ? (callExp.experience_english || callExp.experience_hindi) : '-',
        review: ch.review,
        read_at: ch.read_at,
        created_at: ch.created_at,
        employer_id: employer?.id,
        employer_name: employer?.name,
        job_id: job?.id,
        job_name: job?.JobProfile?.profile_english || '-'
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/call-experiences] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/call-reviews
 * List employer call reviews received by the employee.
 */
router.get('/:id/call-reviews', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const Employee = require('../models/Employee');
    const EmployerContact = require('../models/EmployerContact');
    const CallHistory = require('../models/CallHistory');
    const EmployerCallExperience = require('../models/EmployerCallExperience');
    
    const emp = await Employee.findByPk(employeeId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Contacts where this employee was contacted by employers
    const contacts = await EmployerContact.findAll({
      where: { employee_id: employeeId },
      paranoid: false
    });
    if (!contacts.length) return res.json({ success: true, data: [] });

    const callHistoryIds = [...new Set(contacts.map(c => c.call_experience_id).filter(Boolean))];
    const employerIds = [...new Set(contacts.map(c => c.employer_id).filter(Boolean))];

    const histories = callHistoryIds.length
      ? await CallHistory.findAll({
          where: { user_type: 'employer', id: callHistoryIds },
          order: [['created_at', 'DESC']],
          paranoid: true
        })
      : [];

    const expIds = [...new Set(histories.map(h => h.call_experience_id).filter(Boolean))];
    let expMap = {};
    if (expIds.length && EmployerCallExperience) {
      const exps = await EmployerCallExperience.findAll({ where: { id: expIds }, paranoid: false });
      exps.forEach(e => { expMap[e.id] = e; });
    }

    // NEW: build employerMap (was missing)
    const employerMap = {};
    if (employerIds.length) {
      const employers = await Employer.findAll({
        where: { id: employerIds },
        attributes: ['id', 'name'],
        paranoid: false
      });
      employers.forEach(e => { employerMap[e.id] = e; });
    }

    const contactsMap = new Map(contacts.map(c => [c.call_experience_id, c]));

    const data = histories.map(h => {
      const contact = contactsMap.get(h.id);
      const employer = contact ? employerMap[contact.employer_id] : null;
      const exp = expMap[h.call_experience_id];
      return {
        id: h.id,
        call_experience_id: h.id,
        call_experience: exp ? (exp.experience_english || exp.experience_hindi) : '-',
        review: h.review,
        read_at: h.read_at,
        created_at: h.created_at,
        employer_id: employer?.id,
        employer_name: employer?.name || '-'
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/call-reviews] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /employees/:id/activate
 * Activate an employee and their linked user.
 */
router.post('/:id/activate', authenticate, async (req, res) => {
	try {
		const employeeId = Number(req.params.id);
		if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

		const employee = await Employee.findByPk(employeeId);
		if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

		const user = await User.findByPk(employee.user_id, { paranoid: false });
		if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

		await user.update({
      is_active: true,
      deactivation_reason: null,
      status_change_by: getAdminId(req),
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee activated: #${employee.id} ${employee.name || '-'}`,
    });

		return res.json({ success: true, message: 'Employee activated', data: { user_id: user.id, employee_id: employee.id } });
	} catch (error) {
		console.error('[employees:activate] error', error);
		return res.status(500).json({ success: false, message: error.message || 'Activate failed' });
	}
});

/**
 * POST /employees/:id/deactivate  { deactivation_reason }
 */
router.post('/:id/deactivate', authenticate, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const reason = (req.body?.deactivation_reason || '').toString().trim();
    if (!reason) return res.status(400).json({ success: false, message: 'deactivation_reason is required' });

    const employee = await Employee.findByPk(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const user = await User.findByPk(employee.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

    await user.update({
      is_active: false,
      deactivation_reason: reason,
      status_change_by: getAdminId(req),
    });

    await safeLog(req, {
      category: 'employee',
      type: 'update',
      redirect_to: employeeRedirect(employee.id),
      log_text: `Employee deactivated: #${employee.id} ${employee.name || '-'} (reason=${reason})`,
    });

    return res.json({ success: true, message: 'Employee deactivated', data: { user_id: user.id, employee_id: employee.id } });
  } catch (error) {
    console.error('[employees:deactivate] error', error);
    return res.status(500).json({ success: false, message: error.message || 'Deactivate failed' });
  }
});

/**
 * GET /employees/:id/referrals
 * List referrals for an employee.
 */
router.get('/:id/referrals', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const userId = employee.user_id;
    if (!userId) {
      return res.json({ success: true, data: [] });
    }
    const rows = await Referral.findAll({
      where: { referral_id: userId },
      order: [['created_at', 'DESC']]
    });
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    
    // CHANGED: fetch User records (with mobile) instead of just names
    const users = userIds.length
      ? await User.findAll({
          where: { id: userIds },
          attributes: ['id', 'name', 'mobile'], // NEW: include mobile
          paranoid: false
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const data = rows.map(row => {
      const plain = row.get ? row.get({ plain: true }) : row;
      const user = userMap.get(plain.user_id);
      return {
        ...plain,
        user_name: plain.user_name || user?.name || '-',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 user_mobile: user?.mobile || null // NEW
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/referrals] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/voilations-reported
 * GET /employees/:id/violations-reported
 * List violation reports filed BY this employee (kept both spellings for compatibility).
 *
 * If report_type is 'job':
 * - report_id is job_id
 * - join jobs -> employer_id -> employers.name
 * - include jobs.status as job_status
 */
const listEmployeeViolationsReported = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const emp = await Employee.findByPk(employeeId, { attributes: ['id'], paranoid: false });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const reports = await Report.findAll({
      where: { user_id: employeeId, report_type: 'job' },
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    if (!reports.length) {
      return res.json({ success: true, data: [] });
    }

    const jobIds = [...new Set(reports.map(r => r.report_id).filter(Boolean))];
    const reasonIds = [...new Set(reports.map(r => r.reason_id).filter(Boolean))];

    const jobs = jobIds.length
      ? await Job.findAll({
          where: { id: jobIds },
          attributes: ['id', 'employer_id', 'status', 'job_profile_id'],
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'] }],
          paranoid: false
        })
      : [];
    const jobMap = new Map(jobs.map(j => [j.id, j]));

    const employerIds = [...new Set(jobs.map(j => j.employer_id).filter(Boolean))];
    const employers = employerIds.length
      ? await Employer.findAll({
          where: { id: employerIds },
          attributes: ['id', 'name'],
          paranoid: false
        })
      : [];
    const employerMap = new Map(employers.map(e => [e.id, e]));

    const reasons = reasonIds.length
      ? await EmployerReportReason.findAll({
          where: { id: reasonIds },
          attributes: ['id', 'reason_english', 'reason_hindi'],
          paranoid: false
        })
      : [];
    const reasonMap = new Map(reasons.map(r => [r.id, r]));

    const data = reports.map(r => {
      const job = jobMap.get(r.report_id) || null;
      const employer = job?.employer_id ? (employerMap.get(job.employer_id) || null) : null;
      const reason = reasonMap.get(r.reason_id) || null;

      return {
        id: r.id,
        report_type: r.report_type,

        job_id: r.report_id,
        job_name: job?.JobProfile?.profile_english || '-',   // UI expects job_name
        job_status: job?.status || null,                     // NEW

        employer_id: employer?.id || job?.employer_id || null,
        employer_name: employer?.name || '-',                // UI expects employer_name

        reason_english: reason?.reason_english || '-',
        reason_hindi: reason?.reason_hindi || '',
        description: r.description || '',
        read_at: r.read_at,
        created_at: r.created_at
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/violations-reported] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// NEW: expose both spellings (frontend currently tries both)
router.get('/:id/voilations-reported', listEmployeeViolationsReported);
router.get('/:id/violations-reported', listEmployeeViolationsReported);

// NOTE: Vacancies in jobs UI is displayed as hired_total/no_vacancy (handled in /jobs routes + admin-web Jobs pages).
// NOTE: employer/interviewer phone search + 12h shift timing are handled in backend/routes/jobs.js.
// NOTE: shift timing / interviewer contact columns are implemented under /jobs listing, not employee routes.


// ✅ MUST be before any routes that read req.body
router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ✅ MOVE these UP here (must be defined before route handlers reference them)
async function fetchEmployeeWithUser(id) {
  const employeeId = parseInt(id, 10);
  if (!employeeId || Number.isNaN(employeeId)) return null;

 

  return Employee.findByPk(employeeId, {
    include: [{ model: User, as: 'User', paranoid: false }],
    paranoid: false
  });
}

async function ensureEmployeeUser(employee) {
  if (!employee) return null;
  if (employee.User) return employee.User;
  if (!employee.user_id) return null;
  return User.findByPk(employee.user_id, { paranoid: false });
}

// ✅ module.exports must be last
module.exports = router;
