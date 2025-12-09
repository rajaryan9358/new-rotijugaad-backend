const express = require('express');
const router = express.Router();
const { Employee, State, City, Qualification, Shift, EmployeeSubscriptionPlan, User, EmployeeJobProfile, JobProfile } = require('../models');
const EmployeeExperience = require('../models/EmployeeExperience');
const EmployeeDocument = require('../models/EmployeeDocument'); // ensure present
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobInterest = require('../models/JobInterest');
const Job = require('../models/Job');
const Employer = require('../models/Employer');
const Wishlist = require('../models/Wishlist'); // add this line if not present
const EmployeeContact = require('../models/EmployeeContact'); // add if not present
const CallHistory = require('../models/CallHistory'); // add if not present
const EmployeeCallExperience = require('../models/EmployeeCallExperience'); // add if not present
const EmployerCallExperience = require('../models/EmployerCallExperience'); // new for mixed history lookups
const markUserAsDeleted = require('../utils/markUserAsDeleted');
const Sequelize = require('sequelize');
const { Op, fn, col } = Sequelize;
const Referral = require('../models/Referral'); // added
const { sequelize } = require('../config/db'); // added

// Add: normalize date helper
const normalizeDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
// Add: normalize integer helper
const normalizeIntOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
};


const baseInclude = [
  { model: State, as: 'State' },
  { model: City, as: 'City' },
  { model: State, as: 'PreferredState' },
  { model: City, as: 'PreferredCity' },
  { model: Qualification, as: 'Qualification' },
  { model: Shift, as: 'Shift' },
  { model: EmployeeSubscriptionPlan, as: 'SubscriptionPlan' },
  { model: User, as: 'User', attributes: ['id', 'is_active', 'last_active_at', 'created_at'], paranoid: false }
];

const ensureUserInclude = (includeList = []) => {
  let userInclude = includeList.find(item => item.as === 'User');
  if (!userInclude) {
    userInclude = { model: User, as: 'User', attributes: ['id', 'is_active', 'last_active_at', 'created_at'], paranoid: false };
    includeList.push(userInclude);
  }
  return userInclude;
};

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
    res.json({ success:true, data: doc });
  } catch (e) {
    console.error('[employee documents] upload error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * DELETE /employees/:id/documents/:docId
 * Remove a specific document belonging to an employee.
 */
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success:false, message:'Employee not found' });
    const doc = await EmployeeDocument.findByPk(req.params.docId);
    if (!doc || doc.user_id !== emp.id)
      return res.status(404).json({ success:false, message:'Document not found' });
    await doc.destroy();
    res.json({ success:true, message:'Document deleted' });
  } catch (e) {
    console.error('[employee documents] delete error:', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

/**
 * GET /employees
 * Fetch all employees with their basic associations.
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);
    const sortField = (req.query.sortField || 'id').toString().toLowerCase();
    const sortDir = (req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const search = (req.query.search || '').toString().trim().toLowerCase();
    const subscriptionStatusFilter = (req.query.subscriptionStatusFilter || '').toLowerCase();
    const statusFilter = (req.query.status || '').toLowerCase();
    const newFilter = (req.query.newFilter || '').toLowerCase();

    const parseId = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };
    const parseNumberOrNull = (value) => { // added
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };

    const include = baseInclude.map(item => ({ ...item }));
    const whereClause = {};
    const andConditions = [];

    const stateId = parseId(req.query.stateFilter);
    if (stateId !== null) whereClause.state_id = stateId;
    const cityId = parseId(req.query.cityFilter);
    if (cityId !== null) whereClause.city_id = cityId;
    const prefStateId = parseId(req.query.prefStateFilter);
    if (prefStateId !== null) whereClause.preferred_state_id = prefStateId;
    const prefCityId = parseId(req.query.prefCityFilter);
    if (prefCityId !== null) whereClause.preferred_city_id = prefCityId;
    const qualificationId = parseId(req.query.qualificationFilter);
    if (qualificationId !== null) whereClause.qualification_id = qualificationId;
    const shiftId = parseId(req.query.shiftFilter);
    if (shiftId !== null) whereClause.preferred_shift_id = shiftId;
    const planId = parseId(req.query.planFilter);
    if (planId !== null) whereClause.subscription_plan_id = planId;

    if (req.query.salaryFreqFilter) {
      whereClause.expected_salary_frequency = req.query.salaryFreqFilter.toLowerCase();
    }
    if (req.query.genderFilter) {
      whereClause.gender = req.query.genderFilter.toLowerCase();
    }
    if (req.query.verificationFilter) {
      whereClause.verification_status = req.query.verificationFilter.toLowerCase();
    }
    if (req.query.kycFilter) {
      whereClause.kyc_status = req.query.kycFilter.toLowerCase();
    }

    // new filters
    const jobProfileId = parseId(req.query.jobProfileFilter);
    if (jobProfileId !== null) {
      andConditions.push(Sequelize.literal(
        `EXISTS (SELECT 1 FROM employee_job_profiles ejp WHERE ejp.employee_id = Employee.id AND ejp.deleted_at IS NULL AND ejp.job_profile_id = ${sequelize.escape(jobProfileId)})`
      ));
    }

    const workNatureId = parseId(req.query.workNatureFilter);
    const workDurationFilter = parseNumberOrNull(req.query.workDurationFilter);
    const workDurationFreqFilter = (req.query.workDurationFreqFilter || '').trim().toLowerCase();
    if (workNatureId !== null || workDurationFilter !== null || workDurationFreqFilter) {
      const conds = ['ex.user_id = Employee.id', 'ex.deleted_at IS NULL'];
      if (workNatureId !== null) conds.push(`ex.work_nature_id = ${sequelize.escape(workNatureId)}`);
      if (workDurationFilter !== null) conds.push(`ex.work_duration = ${sequelize.escape(workDurationFilter)}`);
      if (workDurationFreqFilter) conds.push(`LOWER(ex.work_duration_frequency) = ${sequelize.escape(workDurationFreqFilter)}`);
      andConditions.push(Sequelize.literal(
        `EXISTS (SELECT 1 FROM employee_experiences ex WHERE ${conds.join(' AND ')})`
      ));
    }

    if (req.query.createdAt) {
      const date = new Date(req.query.createdAt);
      if (!Number.isNaN(date.getTime())) {
        whereClause.created_at = {
          [Op.gte]: date,
          [Op.lt]: new Date(date.getTime() + 24 * 60 * 60 * 1000) // next day
        };
      }
    }

    if (newFilter === 'new') {
      const newSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
      andConditions.push(Sequelize.where(col('User.created_at'), { [Op.gte]: newSince }));
      const userInclude = ensureUserInclude(include);
      userInclude.required = true;
    }

    if (subscriptionStatusFilter === 'active') {
      andConditions.push({
        [Op.or]: [
          { credit_expiry_at: null },
          { credit_expiry_at: { [Op.gt]: new Date() } }
        ]
      });
    } else if (subscriptionStatusFilter === 'expired') {
      andConditions.push({
        credit_expiry_at: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.lte]: new Date() }
          ]
        }
      });
    }

    if (search) {
      const pattern = `%${search}%`;
      const searchConditions = [
        Sequelize.where(fn('LOWER', col('Employee.name')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('Employee.email')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('State.state_english')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('City.city_english')), { [Op.like]: pattern })
      ];
      const numericId = Number(search);
      if (!Number.isNaN(numericId)) searchConditions.push({ id: numericId });
      andConditions.push({ [Op.or]: searchConditions });
    }

    if (andConditions.length) {
      whereClause[Op.and] = (whereClause[Op.and] || []).concat(andConditions);
    }

    const sortableColumns = {
      id: col('Employee.id'),
      name: col('Employee.name'),
      email: col('Employee.email'),
      dob: col('Employee.dob'),
      gender: col('Employee.gender'),
      expected_salary: col('Employee.expected_salary'),
      verification_status: col('Employee.verification_status'),
      kyc_status: col('Employee.kyc_status'),
      created_at: col('Employee.created_at'),
      state: col('State.state_english'),
      city: col('City.city_english'),
      qualification: col('Qualification.qualification_english'),
      shift: col('Shift.shift_english')
    };
    const orderColumn = sortableColumns[sortField] || sortableColumns.id;

    if (['active', 'inactive'].includes(statusFilter)) {
      const userInclude = ensureUserInclude(include);
      userInclude.where = { ...(userInclude.where || {}), is_active: statusFilter === 'active' };
      userInclude.required = true;
    }

    const { rows, count } = await Employee.findAndCountAll({
      where: whereClause,
      include,
      order: [[orderColumn, sortDir]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      paranoid: true,
      distinct: true
    });

    // attach job profile & work nature displays
    const employeeIds = rows.map(r => r.id);
    if (employeeIds.length) {
      const jpRows = await EmployeeJobProfile.findAll({
        where: { employee_id: employeeIds },
        include: [{ model: JobProfile, as: 'JobProfile', attributes: ['profile_english'] }],
        paranoid: true
      });
      const jpMap = new Map();
      jpRows.forEach(r => {
        const list = jpMap.get(r.employee_id) || [];
        if (r.JobProfile?.profile_english) list.push(r.JobProfile.profile_english);
        jpMap.set(r.employee_id, list);
      });

      const expRows = await EmployeeExperience.findAll({
        where: { user_id: employeeIds },
        include: [{ model: require('../models/WorkNature'), as: 'WorkNature', attributes: ['nature_english'] }],
        paranoid: true
      });
      const expMap = new Map();
      expRows.forEach(r => {
        const list = expMap.get(r.user_id) || [];
        const nature = r.WorkNature?.nature_english || '-';
        const dur = r.work_duration ? `${r.work_duration}${r.work_duration_frequency ? ` ${r.work_duration_frequency}` : ''}` : '';
        list.push(`${nature}${dur ? ` (${dur})` : ''}`);
        expMap.set(r.user_id, list);
      });

      rows.forEach(r => {
        r.setDataValue('job_profiles_display', (jpMap.get(r.id) || []).join(', ') || '-');
        r.setDataValue('work_natures_display', (expMap.get(r.id) || []).join(', ') || '-');
      });
    }

    res.json({
      success: true,
      data: rows,
      meta: {
        page,
        pageSize,
        total: count,
        totalPages: Math.max(Math.ceil(count / pageSize), 1)
      }
    });
  } catch (err) {
    console.error('[Employees list] error:', err.message);
    if (/Unknown column/.test(err.message)) {
      return res.status(500).json({ success: false, message: 'Pending migration: add document columns.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id
 * Fetch a single employee with associations.
 */
router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, {
      include: baseInclude,
      paranoid: true
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const jpRows = await EmployeeJobProfile.findAll({ // added
      where: { employee_id: employee.id },
      include: [{ model: JobProfile, as: 'JobProfile', attributes: ['profile_english'] }],
      paranoid: true
    });
    const jpNames = jpRows.map(r => r.JobProfile?.profile_english).filter(Boolean);
    employee.setDataValue('job_profiles_display', jpNames.join(', ') || '-');

    const expRows = await EmployeeExperience.findAll({ // added
      where: { user_id: employee.id },
      include: [{ model: require('../models/WorkNature'), as: 'WorkNature', attributes: ['nature_english'] }],
      paranoid: true
    });
    const expNames = expRows.map(r => {
      const nature = r.WorkNature?.nature_english || '-';
      const dur = r.work_duration ? `${r.work_duration}${r.work_duration_frequency ? ` ${r.work_duration_frequency}` : ''}` : '';
      return `${nature}${dur ? ` (${dur})` : ''}`;
    }).filter(Boolean);
    employee.setDataValue('work_natures_display', expNames.join(', ') || '-');

    res.json({ success: true, data: employee });
  } catch (err) {
    console.error('[Employee detail] error:', err.message);
    if (/Unknown column/.test(err.message)) {
      return res.status(500).json({ success: false, message: 'Pending migration: add document columns.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /employees
 * Create a new employee (and user if necessary).
 */
router.post('/', async (req, res) => {
  try {
    console.log('[EMPLOYEE CREATE] req.body:', req.body); // debug log
    const fail = (message, status = 400) => {
      const err = new Error(message);
      err.status = status;
      throw err;
    };

    const rawUserId = req.body?.user_id;
    const normalizedUserId = (() => {
      if (rawUserId === undefined || rawUserId === null) return null;
      const trimmed = typeof rawUserId === 'string' ? rawUserId.trim() : rawUserId;
      if (trimmed === '' || trimmed === false) return null;
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? null : parsed;
    })();
    const mobileInput = (req.body?.mobile || '').trim();
    let nameInput = (req.body?.name || '').trim();
    const email = req.body?.email || null;
    const wantsNewUser = !normalizedUserId;

    if (wantsNewUser && (!mobileInput || !nameInput)) {
      return res.status(400).json({ success: false, message: 'Required: mobile, name' });
    }

    // Optional: check duplicate employee email (if provided)
    if (email) {
      const existingEmailEmp = await Employee.findOne({ where: { email }, paranoid: false });
      if (existingEmailEmp && !existingEmailEmp.deleted_at) {
        return res.status(409).json({ success: false, message: 'An employee with this email already exists.' });
      }
    }

    let user;
    try {
      if (wantsNewUser) {
        user = await User.findOne({ where: { mobile: mobileInput }, paranoid: false });
        if (user && user.deleted_at) await user.restore();
        if (!user) {
          user = await User.create({
            mobile: mobileInput,
            name: nameInput,
            user_type: 'employee',
            is_active: true
          });
        }
      } else {
        const targetUserId = normalizedUserId;
        if (!targetUserId) fail('Invalid user_id');
        user = await User.findByPk(targetUserId, { paranoid: false });
        if (!user) fail('User not found', 404);
        if (user.deleted_at) await user.restore();
        if (!nameInput) nameInput = user.name || '';
      }
    } catch (userErr) {
      console.error('[EMPLOYEE CREATE] user resolve error:', userErr);
      const status = userErr.status || 500;
      return res.status(status).json({ success: false, message: userErr.message || 'Failed to resolve user' });
    }

    if (!nameInput) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    if ((user.user_type || '').toLowerCase() !== 'employee') {
      await user.update({ user_type: 'employee' });
    }

    // If user exists, check if employee already exists for this user
    const existingEmp = await Employee.findOne({ where: { user_id: user.id }, paranoid: false });
    if (existingEmp) {
      if (existingEmp.deleted_at) {
        await existingEmp.restore();
        return res.status(409).json({ success: false, message: 'Employee record for this mobile already existed and was restored. Please retry.' });
      }
      return res.status(409).json({ success: false, message: 'An employee for this mobile already exists.' });
    }

    // Create employee
    const empPayload = {
      ...req.body,
      user_id: user.id,
      name: nameInput
    };
    delete empPayload.mobile; // not a field in Employee
    // sanitize credit_expiry_at
    if ('credit_expiry_at' in empPayload) {
      empPayload.credit_expiry_at = normalizeDateOrNull(empPayload.credit_expiry_at);
    }
    // sanitize subscription_plan_id
    if ('subscription_plan_id' in empPayload) {
      empPayload.subscription_plan_id = normalizeIntOrNull(empPayload.subscription_plan_id);
    }
    const emp = await Employee.create(empPayload);
    res.status(201).json({ success: true, data: emp });
  } catch (error) {
    console.error('Employee create error:', error);
    // Provide clearer duplicate messages
    if (error.name === 'SequelizeUniqueConstraintError') {
      const fields = Object.keys(error.fields || {});
      const field = fields[0];
      const msg = field === 'email'
        ? 'An employee with this email already exists.'
        : 'Duplicate value for a unique field.';
      return res.status(409).json({ success: false, message: msg });
    }
    const status = /unique/i.test(error.message) ? 409 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employees/:id
 * Update employee details and linked user info.
 */
router.put('/:id', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const payload = { ...req.body };
    delete payload.mobile;
    if ('credit_expiry_at' in payload) {
      payload.credit_expiry_at = normalizeDateOrNull(payload.credit_expiry_at);
    }
    // sanitize subscription_plan_id when provided
    if ('subscription_plan_id' in payload) {
      payload.subscription_plan_id = normalizeIntOrNull(payload.subscription_plan_id);
    }

    const requestedUserId = payload.user_id ?? emp.user_id;

    let targetUser = await User.findByPk(requestedUserId, { paranoid: false });
    if (!targetUser) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }
    if (targetUser.deleted_at) await targetUser.restore();

    if (requestedUserId !== emp.user_id) {
      const existingEmp = await Employee.findOne({
        where: { user_id: requestedUserId },
        paranoid: false
      });
      if (existingEmp && existingEmp.id !== emp.id) {
        return res.status(409).json({ success: false, message: 'Another employee already uses this user.' });
      }
      payload.user_id = requestedUserId;
    }

    if (req.body.mobile !== undefined) {
      const newMobile = String(req.body.mobile || '').trim();
      if (!newMobile) {
        return res.status(400).json({ success: false, message: 'Mobile cannot be empty' });
      }
      if (newMobile !== String(targetUser.mobile || '').trim()) {
        const duplicate = await User.findOne({
          where: { mobile: newMobile },
          paranoid: false
        });
        if (duplicate && duplicate.id !== targetUser.id) {
          return res.status(409).json({ success: false, message: 'Mobile already exists.' });
        }
        await targetUser.update({ mobile: newMobile });
      }
    }

    if (req.body.name !== undefined) {
      const trimmedName = String(req.body.name || '').trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      if (trimmedName !== targetUser.name) {
        await targetUser.update({ name: trimmedName });
      }
      payload.name = trimmedName;
    }

    await emp.update(payload);
    res.json({ success: true, data: emp });
  } catch (error) {
    console.error('Employee update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employees/:id
 * Soft delete an employee and mark the user as deleted.
 */
router.delete('/:id', async (req, res) => {
  try {
    const emp = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const user = await User.findByPk(emp.user_id, { paranoid: false });

    await emp.destroy();
    await markUserAsDeleted(user);

    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    console.error('Employee delete error:', error);
    res.status(500).json({ success: false, message: error.message });
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
router.post('/:id/job-profiles', async (req, res) => {
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
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Fetch all job interests where this employee is sender or receiver
    const interests = await JobInterest.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { sender_type: 'employee', sender_id: emp.id },
          { sender_type: 'employer', receiver_id: emp.id }
        ]
      },
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    // Collect job and employer IDs
    const jobIds = [...new Set(interests.map(i => i.job_id))];
    const employerIds = [...new Set(
      interests.map(i =>
        i.sender_type === 'employee'
          ? i.receiver_id
          : (i.sender_type === 'employer' ? i.sender_id : null)
      ).filter(Boolean)
    )];

    // Fetch jobs and employers in bulk
    const jobs = await Job.findAll({
      where: { id: jobIds },
      include: [
        { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'] },
        { model: State, as: 'JobState', attributes: ['state_english'] },
        { model: City, as: 'JobCity', attributes: ['city_english'] }
      ],
      paranoid: false
    });
    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    const employers = await Employer.findAll({
      where: { id: employerIds },
      attributes: ['id', 'name', 'organization_name'],
      paranoid: false
    });
    const employersMap = {};
    employers.forEach(e => { employersMap[e.id] = e; });

    // Compose sent and received arrays
    const sent = [];
    const received = [];
    for (const i of interests) {
      const job = jobsMap[i.job_id];
      const employerId = i.sender_type === 'employee' ? i.receiver_id : (i.sender_type === 'employer' ? i.sender_id : null);
      const employer = employerId ? employersMap[employerId] : null;
      if (!job || !employer) continue;

      const vacancyLeft = (job.no_vacancy || 0) - (job.hired_total || 0);

      const row = {
        id: i.id,
        job_id: job.id,
        job_profile: job.JobProfile?.profile_english || '',
        employer_id: employer.id,
        employer_name: employer.name,
        organization_name: employer.organization_name,
        job_state: job.JobState?.state_english || '',
        job_city: job.JobCity?.city_english || '',
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        total_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        vacancy_left: vacancyLeft,
        status: i.status === 'pending' ? 'Active' : i.status,
        otp: i.otp || null,
        applied_at: i.created_at,
        received_at: i.created_at
      };

      if (i.sender_type === 'employee') {
        sent.push(row);
      } else if (i.sender_type === 'employer') {
        received.push(row);
      }
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

    // Find all JobInterest rows where employee is sender or receiver and status is 'hired'
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

    // Collect job and employer IDs
    const jobIds = [...new Set(interests.map(i => i.job_id))];
    const employerIds = [...new Set(
      interests.map(i =>
        i.sender_type === 'employee'
          ? i.receiver_id
          : (i.sender_type === 'employer' ? i.sender_id : null)
      ).filter(Boolean)
    )];

    // Fetch jobs and employers in bulk
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

    const employers = await Employer.findAll({
      where: { id: employerIds },
      attributes: ['id', 'name', 'organization_name'],
      paranoid: false
    });
    const employersMap = {};
    employers.forEach(e => { employersMap[e.id] = e; });

    // Compose hired jobs array
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
    const employeeId = parseInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    // Fetch employee_contacts for this employee
    const contacts = await EmployeeContact.findAll({
      where: { employee_id: employeeId },
      paranoid: false,
      order: [['created_at', 'DESC']]
    });

    // If no contacts, return empty
    if (!contacts.length) return res.json({ success: true, data: [] });

    // Collect employer_ids and call_experience_ids
    const employerIds = contacts.map(c => c.employer_id);
    const callExperienceIds = contacts.map(c => c.call_experience_id).filter(Boolean);

    // Fetch employers and their users
    const Employer = require('../models/Employer');
    const User = require('../models/User');
    const employers = await Employer.findAll({
      where: { id: employerIds },
      include: [
        { model: User, as: 'User', attributes: ['id', 'mobile'] }
      ],
      paranoid: false
    });
    const employerMap = {};
    employers.forEach(e => { employerMap[e.id] = e; });

    // Fetch call histories for these contacts (user_type: employee)
    const callHistories = await CallHistory.findAll({
      where: {
        call_experience_id: callExperienceIds,
        user_type: 'employee'
      },
      paranoid: false
    });
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

    // Placeholder for interest credits (empty for now)
    const interestData = []; // You can implement logic for interest credits if needed

    res.json({ success: true, data: [...contactData, ...interestData] });
  } catch (err) {
    console.error('[employees/:id/credit-history] error:', err);
    res.status(500).json({ success: false, message: err.message });
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
    const Employer = require('../models/Employer');
    const Job = require('../models/Job');

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
    const Employer = require('../models/Employer');

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
    const contactsMap = new Map(contacts.map(c => [c.call_experience_id, c]));

    // Compose rows
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
    console.error('[employees/:id/call-reviews] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employees/:id/voilations-reported
 * List violation reports filed by employers against this employee.
 */
router.get('/:id/voilations-reported', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee id' });

    const employee = await Employee.findByPk(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const Report = require('../models/Report');
    const EmployeeReportReason = require('../models/EmployeeReportReason');
    const Employer = require('../models/Employer');
    const Job = require('../models/Job');
    const JobProfile = require('../models/JobProfile');

    const reports = await Report.findAll({
      where: { report_type: 'job', user_id: employeeId },
      order: [['created_at', 'DESC']],
      paranoid: false
    });
    if (!reports.length) return res.json({ success: true, data: [] });

    const employerIds = [...new Set(reports.map(r => r.user_id).filter(Boolean))];
    const reasonIds = [...new Set(reports.map(r => r.reason_id).filter(Boolean))];
    const jobIds = [...new Set(reports.map(r => r.report_id).filter(Boolean))];

    const employers = employerIds.length
      ? await Employer.findAll({ where: { id: employerIds }, attributes: ['id', 'name'], paranoid: false })
      : [];
    const employerMap = new Map(employers.map(e => [e.id, e]));

    const reasons = reasonIds.length
      ? await EmployeeReportReason.findAll({ where: { id: reasonIds }, attributes: ['id', 'reason_english', 'reason_hindi'], paranoid: false })
      : [];
    const reasonMap = new Map(reasons.map(r => [r.id, r]));

    let jobMap = new Map();
    if (jobIds.length) {
      const jobs = await Job.findAll({
        where: { id: jobIds },
        include: [{ model: JobProfile, as: 'JobProfile', attributes: ['profile_english'] }],
        paranoid: false
      });
      jobMap = new Map(jobs.map(j => [j.id, j]));
    }

    const data = reports.map(r => {
      const employer = employerMap.get(r.user_id);
      const reason = reasonMap.get(r.reason_id);
      const job = jobMap.get(r.report_id); // use report_id (job id) to resolve job info
      return {
        id: r.id,
        employer_id: employer?.id || null,
        employer_name: employer?.name || '-',
        reason_english: reason?.reason_english || '-',
        reason_hindi: reason?.reason_hindi || '',
        description: r.description || '',
        job_id: job?.id || r.report_id || null,
        job_name: job?.JobProfile?.profile_english || '-',
        created_at: r.created_at,
        read_at: r.read_at
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/voilations-reported] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==============================
// ========== NEW CODE ==========
// ==============================

// Helper to fetch employee with user (non-paranoid)
const fetchEmployeeWithUser = async (employeeId) => {
  return Employee.findByPk(employeeId, {
    include: [{ model: User, as: 'User', paranoid: false }],
    paranoid: false
  });
};

// Ensure employee user exists and restore if deleted
const ensureEmployeeUser = async (employee) => {
  if (employee?.User) return employee.User;
  const user = await User.findByPk(employee.user_id, { paranoid: false });
  if (user?.deleted_at) await user.restore();
  return user;
};

const handleEmployeeStatusMutation = async (req, res, field, value, message) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    await employee.update({ [field]: value });
    res.json({ success: true, message });
  } catch (error) {
    console.error(`[employees:${field}] error`, error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /employees/:id/activate
 * Activate an employee and their linked user.
 */
router.post('/:id/activate', async (req, res) => {
	try {
		const employee = await fetchEmployeeWithUser(req.params.id);
		if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
		const user = await ensureEmployeeUser(employee);
		if (!user) return res.status(404).json({ success: false, message: 'User not found' });
		await user.update({ is_active: true });
		res.json({ success: true, message: 'Employee activated' });
	} catch (error) {
		console.error('[employees:activate] error', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

router.post('/:id/deactivate', async (req, res) => {
	try {
		const employee = await fetchEmployeeWithUser(req.params.id);
		if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
		const user = await ensureEmployeeUser(employee);
		if (!user) return res.status(404).json({ success: false, message: 'User not found' });
		await user.update({ is_active: false });
		res.json({ success: true, message: 'Employee deactivated' });
	} catch (error) {
		console.error('[employees:deactivate] error', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

router.post('/:id/approve', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const user = await User.findByPk(employee.user_id, { paranoid: false });
    if (user && user.deleted_at) await user.restore();
    await employee.update({ is_approved: true });
    res.json({ success: true, message: 'Employee approved' });
  } catch (error) {
    console.error('[employees:approve] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    await employee.update({ is_approved: false });
    res.json({ success: true, message: 'Employee rejected' });
  } catch (error) {
    console.error('[employees:reject] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- new: employee KYC grant/reject ---
router.post('/:id/kyc/grant', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    await employee.update({ kyc_status: 'verified' });
    res.json({ success: true, message: 'KYC marked as verified' });
  } catch (error) {
    console.error('[employees:kyc/grant] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/kyc/reject', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    await employee.update({ kyc_status: 'rejected' });
    res.json({ success: true, message: 'KYC rejected' });
  } catch (error) {
    console.error('[employees:kyc/reject] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- new: change subscription ---
router.post('/:id/change-subscription', async (req, res) => {
  try {
    const { subscription_plan_id } = req.body || {};
    if (!subscription_plan_id) {
      return res.status(400).json({ success: false, message: 'subscription_plan_id is required' });
    }
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
      credit_expiry_at: expiryAt
    });

    res.json({
      success: true,
      message: 'Subscription updated',
      data: {
        subscription_plan_id: plan.id,
        credit_expiry_at: expiryAt,
        total_contact_credit: employee.total_contact_credit,
        total_interest_credit: employee.total_interest_credit
      }
    });
  } catch (error) {
    console.error('[employees:change-subscription] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- new: add credits ---
router.post('/:id/add-credits', async (req, res) => {
  try {
    const contactDelta = Number(req.body?.contact_credits) || 0;
    const interestDelta = Number(req.body?.interest_credits) || 0;
    if (contactDelta <= 0 && interestDelta <= 0) {
      return res.status(400).json({ success: false, message: 'Provide credits to add' });
    }

    const employee = await Employee.findByPk(req.params.id, { paranoid: false });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const updatePayload = {
      total_contact_credit: Number(employee.total_contact_credit || 0) + Math.max(contactDelta, 0),
      total_interest_credit: Number(employee.total_interest_credit || 0) + Math.max(interestDelta, 0)
    };
    if (req.body?.credit_expiry_at) {
      updatePayload.credit_expiry_at = normalizeDateOrNull(req.body.credit_expiry_at);
    }

    await employee.update(updatePayload);

    res.json({
      success: true,
      message: 'Credits updated',
      data: {
        total_contact_credit: employee.total_contact_credit,
        total_interest_credit: employee.total_interest_credit,
        credit_expiry_at: employee.credit_expiry_at
      }
    });
  } catch (error) {
    console.error('[employees:add-credits] error', error);
    res.status(500).json({ success: false, message: error.message });
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
    const users = userIds.length
      ? await User.findAll({
          where: { id: userIds },
          attributes: ['id', 'name'],
          paranoid: false
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));
    const data = rows.map(row => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        ...plain,
        user_name: plain.user_name || userMap.get(plain.user_id) || plain.user_name || '-'
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[employees/:id/referrals] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
