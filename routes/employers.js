const express = require('express');
const router = express.Router();
const Sequelize = require('sequelize');
const { Op, fn, col, literal } = Sequelize;

const Employer = require('../models/Employer');
const BusinessCategory = require('../models/BusinessCategory');
const State = require('../models/State');
const City = require('../models/City');
const EmployerSubscriptionPlan = require('../models/EmployerSubscriptionPlan');
const User = require('../models/User');
const models = require('../models');
const Job = models.Job;
const JobInterest = models.JobInterest;
const Employee = models.Employee;
const JobProfile = models.JobProfile;
const EmployeeJobProfile = models.EmployeeJobProfile;
const EmployerContact = require('../models/EmployerContact');
const CallHistory = require('../models/CallHistory');
const EmployerCallExperience = require('../models/EmployerCallExperience');
const markUserAsDeleted = require('../utils/markUserAsDeleted');
const Referral = require('../models/Referral'); // added


// include definitions
const baseInclude = [
  { model: State, as: 'State' },
  { model: City, as: 'City' },
  { model: EmployerSubscriptionPlan, as: 'SubscriptionPlan' },
  { model: User, as: 'User' },
  {
    model: BusinessCategory,
    as: 'BusinessCategory',
    attributes: ['id', 'category_english', 'category_hindi'],
    required: false,
  },
];

const ensureUserInclude = (includeList = []) => {
  let userInclude = includeList.find((inc) => inc.as === 'User');
  if (!userInclude) {
    userInclude = { model: User, as: 'User', paranoid: false };
    includeList.push(userInclude);
  }
  return userInclude;
};

/**
 * GET /employers
 * List all employers with related entities.
 */
router.get('/', async (req, res) => {
  try {
    const fetchAll = ['true', '1'].includes(String(req.query.all || '').toLowerCase());
    const parseIntSafe = (value) => {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    };

    const page = Math.max(parseIntSafe(req.query.page) || 1, 1);
    const rawLimit = parseIntSafe(req.query.limit);
    const limit = fetchAll ? undefined : Math.min(Math.max(rawLimit || 25, 1), 200);
    const offset = limit ? (page - 1) * limit : undefined;

    const where = {};
    const andConditions = [];

    const stateId = parseIntSafe(req.query.state_id);
    if (stateId !== undefined) where.state_id = stateId;

    const cityId = parseIntSafe(req.query.city_id);
    if (cityId !== undefined) where.city_id = cityId;

    const planId = parseIntSafe(req.query.subscription_plan_id);
    if (planId !== undefined) where.subscription_plan_id = planId;

    const categoryId = parseIntSafe(req.query.category_id);
    const categoryName = (req.query.category || '').trim();

    const verificationStatus = (req.query.verification_status || '').trim();
    if (verificationStatus) where.verification_status = verificationStatus;

    const kycStatus = (req.query.kyc_status || '').trim();
    if (kycStatus) where.kyc_status = kycStatus;

    const searchTerm = (req.query.search || '').trim();
    if (searchTerm) {
      const lowered = searchTerm.toLowerCase();
      const pattern = `%${lowered}%`;
      const searchConditions = [
        Sequelize.where(fn('LOWER', col('Employer.name')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('Employer.organization_name')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('Employer.email')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('State.state_english')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('City.city_english')), { [Op.like]: pattern })
      ];
      if (/^\d+$/.test(searchTerm)) searchConditions.push({ id: Number(searchTerm) });
      andConditions.push({ [Op.or]: searchConditions });
    }

    const subscriptionStatus = (req.query.subscription_status || '').toLowerCase();
    const newFilter = (req.query.newFilter || '').toLowerCase();

    const include = baseInclude.map((assoc) => ({ ...assoc }));
    const forceInclude = (alias, condition) => {
      const idx = include.findIndex((inc) => inc.as === alias);
      if (idx >= 0) {
        include[idx] = {
          ...include[idx],
          where: { ...(include[idx].where || {}), ...condition },
          required: true
        };
      }
    };

    if (newFilter === 'new') {
      const newSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
      andConditions.push(Sequelize.where(col('User.created_at'), { [Op.gte]: newSince }));
      const userInclude = ensureUserInclude(include);
      userInclude.required = true;
    }

    if (subscriptionStatus === 'active' || subscriptionStatus === 'expired') {
      const expiryExpr = literal('Employer.credit_expiry_at');
      if (subscriptionStatus === 'active') {
        andConditions.push({
          [Op.or]: [
            Sequelize.where(expiryExpr, { [Op.is]: null }),
            Sequelize.where(expiryExpr, { [Op.gt]: new Date() })
          ]
        });
      } else {
        andConditions.push({
          [Op.and]: [
            Sequelize.where(expiryExpr, { [Op.not]: null }),
            Sequelize.where(expiryExpr, { [Op.lte]: new Date() })
          ]
        });
      }
    }

    if (andConditions.length) where[Op.and] = andConditions;

    if (categoryId !== undefined) forceInclude('BusinessCategory', { id: categoryId });
    else if (categoryName) forceInclude('BusinessCategory', { category_english: categoryName });

    const activeStatus = (req.query.active_status || '').toLowerCase();
    if (activeStatus === 'active' || activeStatus === 'inactive') {
      const userInclude = ensureUserInclude(include);
      userInclude.where = { ...(userInclude.where || {}), is_active: activeStatus === 'active' };
      userInclude.required = true;
    }

    const sortable = new Set(['id','name','organization_type','organization_name','email','address','verification_status','kyc_status','created_at']);
    const requestedSortField = (req.query.sortField || '').trim();
    const requestedSortDir = (req.query.sortDir || '').toLowerCase();
    const sortDir = requestedSortDir === 'desc' ? 'DESC' : 'ASC';
    const sortField = ['businessCategoryName', 'is_active'].includes(requestedSortField)
      ? requestedSortField
      : (sortable.has(requestedSortField) ? requestedSortField : 'id');

    let order;
    if (sortField === 'businessCategoryName') {
      order = [[literal('BusinessCategory.category_english'), sortDir]];
    } else if (sortField === 'is_active') {
      order = [[literal('User.is_active'), sortDir]];
    } else {
      order = [[sortField, sortDir]];
    }

    const queryOptions = { where, include, order, distinct: true };
    if (limit) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      queryOptions.subQuery = false;
    }

    const { rows, count } = await Employer.findAndCountAll(queryOptions);
    const total = typeof count === 'number' ? count : count.length;
    const totalPages = limit ? Math.max(Math.ceil(total / limit), 1) : 1;

    res.json({
      success: true,
      data: rows,
      meta: {
        page: limit ? page : 1,
        limit: limit || rows.length,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error('[employers] list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employers/:id
 * Retrieve employer details by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const row = await Employer.findByPk(req.params.id, {
      include: baseInclude,
      paranoid: true,
    });
    if (!row)
      return res.status(404).json({ success: false, message: 'Employer not found' });
    res.json({ success: true, data: row });
  } catch (e) {
    console.error('[employers] detail error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /employers
 * Create a new employer (and user if needed).
 */
router.post('/', async (req, res) => {
  const fail = (message, status = 400) => {
    const err = new Error(message);
    err.status = status;
    throw err;
  };

  try {
    const rawUserId = req.body?.user_id;
    const mobileInput = (req.body?.mobile || '').trim();
    const nameInput = (req.body?.name || '').trim();
    const wantsNewUser = !rawUserId || Number(rawUserId) <= 0;

    if (!nameInput) fail('name is required');
    let finalUser;

    try {
      if (!wantsNewUser) {
        const targetUserId = Number(rawUserId);
        if (!targetUserId) fail('Invalid user_id', 400);
        finalUser = await User.findByPk(targetUserId, { paranoid: false });
        if (!finalUser) fail('Provided user_id not found', 400);
        if (finalUser.deleted_at) await finalUser.restore();
      } else {
        if (!mobileInput) fail('mobile is required when user is not pre-selected');
        finalUser = await User.findOne({ where: { mobile: mobileInput }, paranoid: false });
        if (finalUser) {
          if (finalUser.deleted_at) await finalUser.restore();
        } else {
          finalUser = await User.create({
            mobile: mobileInput,
            name: nameInput,
            user_type: 'employer',
            is_active: true
          });
        }
      }
    } catch (userError) {
      console.error('[employers] user resolve/create error:', userError);
      return res.status(userError.status || 500).json({
        success: false,
        message: userError.message || 'Failed to resolve user'
      });
    }

    if ((finalUser.user_type || '').toLowerCase() !== 'employer') {
      await finalUser.update({ user_type: 'employer' });
    }

    const existingEmployer = await Employer.findOne({
      where: { user_id: finalUser.id },
      paranoid: false
    });
    if (existingEmployer) {
      if (existingEmployer.deleted_at) {
        await existingEmployer.restore();
        return res.status(409).json({
          success: false,
          message: 'Employer already existed and was restored. Please retry.'
        });
      }
      return res.status(409).json({
        success: false,
        message: 'An employer for this user already exists.'
      });
    }

    const existingEmployee = await Employee.findOne({
      where: { user_id: finalUser.id },
      paranoid: false
    });
    if (existingEmployee && !existingEmployee.deleted_at) {
      return res.status(409).json({
        success: false,
        message: 'An employee profile already exists for this user.'
      });
    }

    if (nameInput && finalUser.name !== nameInput) {
      await finalUser.update({ name: nameInput });
    }

    const payload = { ...req.body, name: nameInput };
    delete payload.mobile;
    delete payload.user_id;

    const emp = await Employer.create({ ...payload, user_id: finalUser.id });

    res.status(201).json({ success: true, data: emp });
  } catch (e) {
    console.error('[employers] create error:', e);
    const status = e.status || (/unique/i.test(e.message) ? 409 : 500);
    res.status(status).json({ success: false, message: e.message });
  }
});

/**
 * PUT /employers/:id
 * Update employer and linked user information.
 */
router.put('/:id', async (req, res) => {
  try {
    const emp = await Employer.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employer not found' });

    const user = await User.findByPk(emp.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });
    if (user.deleted_at) await user.restore();

    const payload = { ...req.body };
    const nameInput = typeof payload.name === 'string' ? payload.name.trim() : undefined;
    if (nameInput !== undefined) {
      if (!nameInput) return res.status(400).json({ success: false, message: 'name cannot be empty' });
      payload.name = nameInput;
    } else {
      delete payload.name;
    }

    const mobileInput = typeof req.body.mobile === 'string' ? req.body.mobile.trim() : undefined;
    const userUpdates = {};
    if (nameInput && nameInput !== user.name) userUpdates.name = nameInput;

    if (mobileInput !== undefined && mobileInput !== user.mobile) {
      if (!mobileInput) return res.status(400).json({ success: false, message: 'mobile cannot be empty' });
      const duplicateUser = await User.findOne({
        where: { mobile: mobileInput },
        paranoid: false
      });
      if (duplicateUser && duplicateUser.id !== user.id) {
        return res.status(409).json({ success: false, message: 'Mobile already exists' });
      }
      userUpdates.mobile = mobileInput;
    }

    delete payload.mobile;
    delete payload.user_id;

    await emp.update(payload);
    if (Object.keys(userUpdates).length) await user.update(userUpdates);

    res.json({ success: true, data: emp });
  } catch (e) {
    console.error('[employers] update error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * DELETE /employers/:id
 * Soft delete an employer and mark the user as deleted.
 */
router.delete('/:id', async (req, res) => {
  try {
    const emp = await Employer.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employer not found' });
    const user = await User.findByPk(emp.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

    await emp.destroy();
    await markUserAsDeleted(user);

    res.json({ success: true, message: 'Employer deleted' });
  } catch (e) {
    console.error('[employers] delete error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /employers/:id/request-deletion
 * Flag an employer user for deletion.
 */
router.post('/:id/request-deletion', async (req, res) => {
  try {
    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const user = await User.findByPk(employer.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

    if (user.delete_pending) {
      return res.json({
        success: true,
        message: 'Deletion already requested',
        data: { delete_requested_at: user.delete_requested_at }
      });
    }

    await user.update({
      delete_pending: true,
      delete_requested_at: new Date()
    });

    res.json({ success: true, message: 'Deletion request recorded' });
  } catch (error) {
    console.error('[employers:request-deletion] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// placeholders
/**
 * GET /employers/:id/jobs
 * Placeholder endpoint for employer jobs.
 */
router.get('/:id/jobs', (req, res) => res.json({ success: true, data: [] }));
/**
 * GET /employers/:id/applicants
 * List applicants who interacted with the employer’s jobs.
 */
router.get('/:id/applicants', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    // Get all jobs for this employer
    const jobs = await Job.findAll({
      where: { employer_id: employerId },
      attributes: ['id', 'job_profile_id'],
      paranoid: false
    });
    const jobIds = jobs.map(j => j.id);
    if (!jobIds.length) return res.json({ success: true, data: [] });

    // Map jobId to job_profile_id for later
    const jobProfileIdMap = {};
    jobs.forEach(j => { jobProfileIdMap[j.id] = j.job_profile_id; });

    // Get all job_interests for these jobs
    const interests = await JobInterest.findAll({
      where: { job_id: jobIds },
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    // Collect employee IDs and job IDs
    const employeeIds = [];
    interests.forEach(i => {
      if (i.sender_type === 'employee') employeeIds.push(i.sender_id);
      else if (i.sender_type === 'employer') employeeIds.push(i.receiver_id);
    });

    // Get all employees in bulk
    let employeesMap = {};
    if (employeeIds.length) {
      const employees = await Employee.findAll({
        where: { id: employeeIds },
        include: [
          { model: State, as: 'PreferredState', attributes: ['state_english'] },
          { model: City, as: 'PreferredCity', attributes: ['city_english'] },
          {
            model: EmployeeJobProfile,
            as: 'EmployeeJobProfiles',
            required: false,
            include: [{ model: JobProfile, as: 'JobProfile', attributes: ['profile_english', 'profile_hindi'] }]
          }
        ],
        paranoid: false
      });
      employeesMap = {};
      employees.forEach(emp => {
        let jobProfiles = [];
        if (Array.isArray(emp.EmployeeJobProfiles)) {
          jobProfiles = emp.EmployeeJobProfiles
            .filter(ejp => !ejp.deleted_at && ejp.JobProfile)
            .map(ejp => ({
              profile_english: ejp.JobProfile.profile_english,
              profile_hindi: ejp.JobProfile.profile_hindi
            }));
        }
        employeesMap[emp.id] = {
          id: emp.id,
          name: emp.name,
          verification_status: emp.verification_status,
          kyc_status: emp.kyc_status,
          expected_salary: emp.expected_salary,
          PreferredState: emp.PreferredState,
          PreferredCity: emp.PreferredCity,
          JobProfiles: jobProfiles
        };
      });
    }

    // Get all job profiles for job_profile_id
    const jobProfileIds = [...new Set(jobs.map(j => j.job_profile_id).filter(Boolean))];
    let jobProfilesMap = {};
    if (jobProfileIds.length) {
      const jobProfiles = await JobProfile.findAll({
        where: { id: jobProfileIds },
        attributes: ['id', 'profile_english', 'profile_hindi'],
        paranoid: false
      });
      jobProfilesMap = {};
      jobProfiles.forEach(jp => { jobProfilesMap[jp.id] = jp; });
    }

    // Compose response
    const data = interests.map(i => {
      let employee_id = i.sender_type === 'employee' ? i.sender_id : i.receiver_id;
      let employee = employee_id && employeesMap[employee_id] ? employeesMap[employee_id] : undefined;
      const job_id = i.job_id;
      const job_profile_id = jobProfileIdMap[job_id];
      const jobProfile = job_profile_id && jobProfilesMap[job_profile_id] ? jobProfilesMap[job_profile_id] : undefined;

      return {
        id: i.id,
        sender_id: i.sender_id,
        sender_type: i.sender_type,
        receiver_id: i.receiver_id,
        status: i.status,
        otp: i.otp,
        applied_at: i.created_at,
        updated_at: i.updated_at,
        name: employee?.name || undefined,
        employee,
        job_id,
        job_profile: jobProfile?.profile_english || jobProfile?.profile_hindi || '-',
        job_name: jobProfile?.profile_english || jobProfile?.profile_hindi || '-'
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/applicants] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * GET /employers/:id/credit-history
 * Show credit usage history for an employer.
 */
router.get('/:id/credit-history', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    // Fetch employer_contacts for this employer
    const contacts = await EmployerContact.findAll({
      where: { employer_id: employerId },
      paranoid: false,
      order: [['created_at', 'DESC']]
    });

    if (!contacts.length) return res.json({ success: true, data: [] });

    // Collect employee_ids and call_experience_ids
    const employeeIds = contacts.map(c => c.employee_id);
    const callExperienceIds = contacts.map(c => c.call_experience_id).filter(Boolean);

    // Fetch employees and their users
    const employees = await Employee.findAll({
      where: { id: employeeIds },
      include: [
        { model: User, as: 'User', attributes: ['id', 'mobile'] }
      ],
      paranoid: false
    });
    const employeeMap = {};
    employees.forEach(e => { employeeMap[e.id] = e; });

    // Fetch call histories for these contacts (user_type: employer)
    const callHistories = await CallHistory.findAll({
      where: {
        call_experience_id: callExperienceIds,
        user_type: 'employer'
      },
      paranoid: false
    });
    const callHistoryMap = {};
    const experienceIds = [...new Set(callHistories.map(ch => ch.call_experience_id).filter(Boolean))];
    callHistories.forEach(ch => { callHistoryMap[ch.id] = ch; });
    let experienceMap = {};
    if (experienceIds.length && EmployerCallExperience) {
      const experiences = await EmployerCallExperience.findAll({
        where: { id: experienceIds },
        paranoid: false
      });
      experiences.forEach(exp => { experienceMap[exp.id] = exp; });
    }
    const data = contacts.map(c => {
      const callHistory = c.call_experience_id ? callHistoryMap[c.call_experience_id] : null;
      const experience = callHistory?.call_experience_id ? experienceMap[callHistory.call_experience_id] : null;
      return {
        type: 'contact',
        amount: c.closing_credit ?? '-',
        employee_id: c.employee_id, // <-- include employee_id here
        employee_name: emp?.name ?? '-',
        verification_status: emp?.verification_status ?? '-',
        kyc_status: emp?.kyc_status ?? '-',
        mobile: user?.mobile ?? '-',
        call_experience: experience?.experience_english ?? '-',
        review: callHistory?.review || '-',
        date: c.created_at,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/credit-history] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * GET /employers/:id/subscription-history
 * Placeholder subscription history endpoint.
 */
router.get('/:id/subscription-history', (req, res) => res.json({ success: true, data: [] }));
/**
 * GET /employers/:id/call-experiences
 * Fetch call experiences logged for an employer.
 */
router.get('/:id/call-experiences', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const Employer = require('../models/Employer');
    const CallHistory = require('../models/CallHistory');
    const EmployerCallExperience = require('../models/EmployerCallExperience');
    const EmployerContact = require('../models/EmployerContact');
    const Employee = require('../models/Employee');

    const emp = await Employer.findByPk(employerId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employer not found' });

    // CHANGED: use employerId (CallHistory stores employer id, not user_id)
    const histories = await CallHistory.findAll({
      where: { user_type: 'employer', user_id: employerId }, // reverted
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    const historyIds = histories.map(h => h.id);
    let expMap = {};
    if (historyIds.length) {
      const exps = await EmployerCallExperience.findAll({
        where: { id: historyIds },
        paranoid: false
      });
      exps.forEach(e => { expMap[e.id] = e; });
    }

    let contactsMap = {};
    if (historyIds.length) {
      const contacts = await EmployerContact.findAll({
        where: { employer_id: employerId, call_experience_id: historyIds },
        paranoid: false
      });
      contacts.forEach(c => { contactsMap[c.call_experience_id] = c; });
    }

    const employeeIds = [...new Set(Object.values(contactsMap).map(c => c.employee_id).filter(Boolean))];
    let employeeMap = {};
    if (employeeIds.length) {
      const employees = await Employee.findAll({
        where: { id: employeeIds },
        attributes: ['id', 'name'],
        paranoid: false
      });
      employees.forEach(e => { employeeMap[e.id] = e; });
    }

    const data = histories.map(h => {
      const contact = h.call_experience_id ? contactsMap[h.call_experience_id] : null;
      const employee = contact ? employeeMap[contact.employee_id] : null;
      const exp = h.call_experience_id ? expMap[h.call_experience_id] : null;
      return {
        id: h.id,
        call_experience_id: h.call_experience_id,
        call_experience: exp ? (exp.experience_english || exp.experience_hindi) : '-',
        review: h.review,
        read_at: h.read_at,
        created_at: h.created_at,
        employee_id: employee?.id,
        employee_name: employee?.name || '-'
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/call-experiences] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * GET /employers/:id/voilation-reports
 * Retrieve reports made against this employer’s jobs.
 */
router.get('/:id/voilation-reports', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const Report = require('../models/Report');
    const EmployerReportReason = require('../models/EmployerReportReason'); // changed from EmployeeReportReason

    // Get all jobs for this employer
    const jobs = await Job.findAll({
      where: { employer_id: employerId },
      attributes: ['id'],
      paranoid: false
    });
    const jobIds = jobs.map(j => j.id);
    if (!jobIds.length) return res.json({ success: true, data: [] });

    // Get all reports for these jobs (report_type='job')
    const reports = await Report.findAll({
      where: {
        report_type: 'job',
        report_id: jobIds
      },
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    if (!reports.length) return res.json({ success: true, data: [] });

    // Collect user_ids (employee IDs), report_ids (job IDs), and reason_ids
    const employeeIds = [...new Set(reports.map(r => r.user_id))];
    const reportJobIds = [...new Set(reports.map(r => r.report_id))];
    const reasonIds = [...new Set(reports.map(r => r.reason_id))];

    // Fetch employees (reporters)
    let employeesMap = {};
    if (employeeIds.length) {
      const employees = await Employee.findAll({
        where: { id: employeeIds },
        attributes: ['id', 'name'],
        paranoid: false
      });
      employeesMap = {};
      employees.forEach(e => { employeesMap[e.id] = e; });
    }

    // Fetch jobs (reported entities)
    let jobsMap = {};
    if (reportJobIds.length) {
      const jobsData = await Job.findAll({
        where: { id: reportJobIds },
        include: [
          { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'] }
        ],
        paranoid: false
      });
      jobsMap = {};
      jobsData.forEach(j => { jobsMap[j.id] = j; });
    }

    // Fetch employer report reasons (changed from employee report reasons)
    let reasonsMap = {};
    if (reasonIds.length) {
      const reasons = await EmployerReportReason.findAll({
        where: { id: reasonIds },
        attributes: ['id', 'reason_english', 'reason_hindi'],
        paranoid: false
      });
      reasonsMap = {};
      reasons.forEach(r => { reasonsMap[r.id] = r; });
    }

    // Compose response
    const data = reports.map(r => {
      const employee = employeesMap[r.user_id] || null;
      const job = jobsMap[r.report_id] || null;
      const reason = reasonsMap[r.reason_id] || null;

      return {
        id: r.id,
        user_id: r.user_id,
        employee_name: employee?.name || '-',
        job_id: r.report_id,
        job_profile: job?.JobProfile?.profile_english || '-',
        reason_english: reason?.reason_english || '-',
        reason_hindi: reason?.reason_hindi || '',
        description: r.description || '',
        read_at: r.read_at,
        created_at: r.created_at,
        // Include full objects for frontend convenience
        user: employee ? { id: employee.id, name: employee.name } : null,
        reported_entity: job ? {
          id: job.id,
          JobProfile: job.JobProfile || null
        } : null,
        reason: reason ? {
          id: reason.id,
          reason_english: reason.reason_english,
          reason_hindi: reason.reason_hindi
        } : null
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/voilation-reports] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employers/:id/call-reviews
 * Fetch reviews employees left after calls with the employer.
 */
router.get('/:id/call-reviews', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const Employer = require('../models/Employer');
    const EmployeeContact = require('../models/EmployeeContact');
    const CallHistory = require('../models/CallHistory');
    const EmployeeCallExperience = require('../models/EmployeeCallExperience');
    const Employee = require('../models/Employee');
    const Job = require('../models/Job');
    const JobProfile = require('../models/JobProfile');

    const emp = await Employer.findByPk(employerId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employer not found' });

    // Contacts where this employer contacted employees (source for received reviews)
    const contacts = await EmployeeContact.findAll({
      where: { employer_id: employerId },
      paranoid: false
    });
    if (!contacts.length) return res.json({ success: true, data: [] });

    const callExperienceIds = [...new Set(contacts.map(c => c.call_experience_id).filter(Boolean))];
    const employeeIds = [...new Set(contacts.map(c => c.employee_id).filter(Boolean))];
    const jobIds = [...new Set(contacts.map(c => c.job_id).filter(Boolean))];

    const histories = callExperienceIds.length
      ? await CallHistory.findAll({
          where: { user_type: 'employee', id: callExperienceIds },
          order: [['created_at', 'DESC']],
          paranoid: true
        })
      : [];

    const expIds = [...new Set(histories.map(h => h.call_experience_id).filter(Boolean))];
    let expMap = {};
    if (expIds.length) {
      const exps = await EmployeeCallExperience.findAll({ where: { id: expIds }, paranoid: false });
      exps.forEach(e => { expMap[e.id] = e; });
    }
    const contactsMap = new Map(contacts.map((c) => [c.call_experience_id, c]));

    let employeeMap = {};
    if (employeeIds.length) {
      const employees = await Employee.findAll({
        where: { id: employeeIds },
        attributes: ['id','name'],
        paranoid: false
      });
      employees.forEach(e => { employeeMap[e.id] = e; });
    }

    let jobMap = {};
    if (jobIds.length) {
      const jobs = await Job.findAll({
        where: { id: jobIds },
        include: [
          { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english'] }
        ],
        paranoid: false
      });
      jobs.forEach(j => { jobMap[j.id] = j; });
    }

    // Compose rows
    const data = histories.map(h => {
      const contact = contactsMap.get(h.id);
      const employee = contact ? employeeMap[contact.employee_id] : null;
      const job = contact ? jobMap[contact.job_id] : null;
      const exp = expMap[h.call_experience_id];
      return {
        id: h.id,
        call_experience_id: h.id,
        call_experience: exp ? (exp.experience_english || exp.experience_hindi) : '-',
        review: h.review,
        read_at: h.read_at,
        created_at: h.created_at,
        employee_id: employee?.id,
        employee_name: employee?.name || '-',
        job_id: job?.id,
        job_name: job?.JobProfile?.profile_english || job?.JobProfile?.profile_hindi || '-'
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/call-reviews] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const fetchEmployerWithUser = (id) =>
  Employer.findByPk(id, {
    include: [{ model: User, as: 'User', paranoid: false }],
    paranoid: false,
  });

const ensureEmployerUser = async (employer) => {
  if (employer?.User) return employer.User;
  const user = await User.findByPk(employer.user_id, { paranoid: false });
  if (user?.deleted_at) await user.restore();
  return user;
};

const handleEmployerStatusMutation = async (req, res, field, value, message) => {
  try {
    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });
    await employer.update({ [field]: value });
    res.json({ success: true, message });
  } catch (error) {
    console.error(`[employers:${field}] error`, error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /employers/:id/activate
 * Activate an employer’s user account.
 */
router.post('/:id/activate', async (req, res) => {
  try {
    const employer = await fetchEmployerWithUser(req.params.id);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });
    const user = await ensureEmployerUser(employer);
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });
    await user.update({ is_active: true });
    res.json({ success: true, message: 'Employer activated' });
  } catch (error) {
    console.error('[employers:activate] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employers/:id/deactivate
 * Deactivate an employer’s user account.
 */
router.post('/:id/deactivate', async (req, res) => {
  try {
    const employer = await fetchEmployerWithUser(req.params.id);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });
    const user = await ensureEmployerUser(employer);
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });
    await user.update({ is_active: false });
    res.json({ success: true, message: 'Employer deactivated' });
  } catch (error) {
    console.error('[employers:deactivate] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employers/:id/approve
 * Mark an employer’s verification status as verified.
 */
router.post('/:id/approve', (req, res) =>
  handleEmployerStatusMutation(req, res, 'verification_status', 'verified', 'Verification marked as verified')
);

/**
 * POST /employers/:id/reject
 * Mark an employer’s verification as rejected.
 */
router.post('/:id/reject', (req, res) =>
  handleEmployerStatusMutation(req, res, 'verification_status', 'rejected', 'Verification rejected')
);

/**
 * POST /employers/:id/kyc/grant
 * Approve KYC for an employer.
 */
router.post('/:id/kyc/grant', (req, res) =>
  handleEmployerStatusMutation(req, res, 'kyc_status', 'verified', 'KYC marked as verified')
);

/**
 * POST /employers/:id/kyc/reject
 * Reject KYC for an employer.
 */
router.post('/:id/kyc/reject', (req, res) =>
  handleEmployerStatusMutation(req, res, 'kyc_status', 'rejected', 'KYC rejected')
);

/**
 * POST /employers/:id/change-subscription
 * Switch an employer to a different subscription plan.
 */
router.post('/:id/change-subscription', async (req, res) => {
  try {
    const { subscription_plan_id } = req.body || {};
    if (!subscription_plan_id) {
      return res.status(400).json({ success: false, message: 'subscription_plan_id is required' });
    }
    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const plan = await EmployerSubscriptionPlan.findByPk(subscription_plan_id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const validityDays = Number(plan.plan_validity_days) || 0;
    const expiryAt = validityDays
      ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)
      : null;

    await employer.update({
      subscription_plan_id: plan.id,
      total_contact_credit: Number(plan.contact_credits) || 0,
      total_interest_credit: Number(plan.interest_credits) || 0,
      total_ad_credit: Number(plan.ad_credits) || 0,
      contact_credit: 0,
      interest_credit: 0,
      ad_credit: 0,
      credit_expiry_at: expiryAt,
    });

    res.json({
      success: true,
      message: 'Subscription updated',
      data: {
        subscription_plan_id: plan.id,
        credit_expiry_at: expiryAt,
        total_contact_credit: employer.total_contact_credit,
        total_interest_credit: employer.total_interest_credit,
        total_ad_credit: employer.total_ad_credit,
      },
    });
  } catch (error) {
    console.error('[employers:change-subscription] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employers/:id/add-credits
 * Add credits to an employer account.
 */
router.post('/:id/add-credits', async (req, res) => {
  try {
    const contactDelta = Number(req.body?.contact_credits) || 0;
    const interestDelta = Number(req.body?.interest_credits) || 0;
    const adDelta = Number(req.body?.ad_credits) || 0;
    if (contactDelta <= 0 && interestDelta <= 0 && adDelta <= 0) {
      return res.status(400).json({ success: false, message: 'Provide credits to add' });
    }

    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const updatePayload = {
      total_contact_credit: Number(employer.total_contact_credit || 0) + Math.max(contactDelta, 0),
      total_interest_credit: Number(employer.total_interest_credit || 0) + Math.max(interestDelta, 0),
      total_ad_credit: Number(employer.total_ad_credit || 0) + Math.max(adDelta, 0),
    };

    if (req.body?.credit_expiry_at) {
      updatePayload.credit_expiry_at = req.body.credit_expiry_at;
    }

    await employer.update(updatePayload);

    res.json({
      success: true,
      message: 'Credits updated',
      data: {
        total_contact_credit: employer.total_contact_credit,
        total_interest_credit: employer.total_interest_credit,
        total_ad_credit: employer.total_ad_credit,
        credit_expiry_at: employer.credit_expiry_at,
      },
    });
  } catch (error) {
    console.error('[employers:add-credits] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
/**
 * GET /employers/:id/voilations-reported
 * List violation reports filed by this employer against employees.
 */
router.get('/:id/voilations-reported', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const employer = await Employer.findByPk(employerId);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const Report = require('../models/Report');
    const EmployeeReportReason = require('../models/EmployeeReportReason');

    const reports = await Report.findAll({
      where: { report_type: 'employee', user_id: employerId },
      order: [['created_at', 'DESC']],
      paranoid: false
    });
    if (!reports.length) return res.json({ success: true, data: [] });

    const employeeIds = [...new Set(reports.map(r => r.report_id))];
    const reasonIds = [...new Set(reports.map(r => r.reason_id))];

    const employees = employeeIds.length
      ? await Employee.findAll({
          where: { id: employeeIds },
          attributes: ['id', 'name'],
          paranoid: false
        })
      : [];
    const employeeMap = {};
    employees.forEach(emp => { employeeMap[emp.id] = emp; });

    const reasonMap = {};
    if (reasonIds.length) {
      const reasons = await EmployeeReportReason.findAll({
        where: { id: reasonIds },
        attributes: ['id', 'reason_english', 'reason_hindi'],
        paranoid: false
      });
      reasons.forEach(reason => { reasonMap[reason.id] = reason; });
    }

    const data = reports.map(r => {
      const employee = employeeMap[r.report_id];
      const reason = reasonMap[r.reason_id];
      return {
        id: r.id,
        employee_id: r.report_id,
        employee_name: employee?.name || '-',
        reason_english: reason?.reason_english || '-',
        reason_hindi: reason?.reason_hindi || '',
        description: r.description || '',
        created_at: r.created_at,
        read_at: r.read_at
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/voilations-reported] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * GET /employers/:id/referrals
 */
router.get('/:id/referrals', async (req, res) => {
  try {
    const employer = await Employer.findByPk(req.params.id);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });
    const userId = employer.user_id;
    if (!userId) return res.json({ success: true, data: [] });

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

    const employerMap = {};
    if (userIds.length) {
      const employers = await Employer.findAll({
        where: { user_id: userIds },
        attributes: ['id', 'user_id'],
        paranoid: false
      });
      employers.forEach(emp => { employerMap[emp.user_id] = emp.id; });
    }

    const employeeMap = {};
    if (userIds.length) {
      const employees = await Employee.findAll({
        where: { user_id: userIds },
        attributes: ['id', 'user_id'],
        paranoid: false
      });
      employees.forEach(emp => { employeeMap[emp.user_id] = emp.id; });
    }

    const data = rows.map(row => {
      const plain = row.get ? row.get({ plain: true }) : row;
      const resolvedEmployerId = employerMap[plain.user_id];
      const resolvedEmployeeId = employeeMap[plain.user_id];
      const fallbackType = (plain.user_type || plain.user_entity_type || '').toString().toLowerCase();
      const resolvedType = resolvedEmployerId
        ? 'employer'
        : resolvedEmployeeId
          ? 'employee'
          : fallbackType || 'employee';
      const resolvedId = resolvedEmployerId || resolvedEmployeeId || plain.user_entity_id || plain.user_id;
      return {
        ...plain,
        user_name: plain.user_name || userMap.get(plain.user_id) || '-',
        resolved_target_id: resolvedId,
        resolved_target_type: resolvedType
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/referrals] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
