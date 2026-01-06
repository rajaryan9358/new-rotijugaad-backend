const express = require('express');
const router = express.Router();

const { Op } = require('sequelize');
const JobDay = require('../models/JobDay');
const models = require('../models');
const { sequelize } = require('../config/db');
const Job = models.Job;
const Employer = models.Employer;
const JobProfile = models.JobProfile;
const JobGender = models.JobGender;
const JobExperience = models.JobExperience;
const Experience = models.Experience;
const JobQualification = models.JobQualification;
const Qualification = models.Qualification;
const JobShift = models.JobShift;
const Shift = models.Shift;
const JobSkill = models.JobSkill;
const Skill = models.Skill;
const SelectedJobBenefit = models.SelectedJobBenefit;
const JobBenefit = models.JobBenefit;
const State = models.State;
const City = models.City;
const JobInterest = models.JobInterest;
const Employee = models.Employee;
const EmployeeJobProfile = models.EmployeeJobProfile;
const User = models.User || require('../models/User');


const Log = models.Log || require('../models/Log');
const getAdminId = require('../utils/getAdminId');

const safeCreateLog = async (payload) => {
  try {
    if (!Log) return;
    await Log.create(payload);
  } catch (e) {
    // never break main flows for logging
  }
};


// --- Ensure associations are defined ---
// --- REMOVE ALL ASSOCIATION SETUP FROM HERE ---
// --- End associations ---

const SORTABLE_FIELDS = new Set(['id','created_at','updated_at','salary_min','salary_max','employer_id','job_profile_id','status']);
const JOB_RECENCY_WINDOW_MS = 48 * 60 * 60 * 1000;

const normalizeInt = (v) => (v === undefined || v === null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const normalizeFloat = (v) => (v === undefined || v === null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const buildJobAttributes = (body = {}) => ({
  employer_id: normalizeInt(body.employer_id),
  job_profile_id: normalizeInt(body.job_profile_id),
  is_household: !!body.is_household,
  description_english: body.description_english,
  description_hindi: body.description_hindi,
  no_vacancy: normalizeInt(body.no_vacancy) || 1,
  interviewer_contact: body.interviewer_contact,
  interviewer_contact_otp: body.interviewer_contact_otp,
  job_address_english: body.job_address_english,
  job_address_hindi: body.job_address_hindi,
  job_state_id: normalizeInt(body.job_state_id),
  job_city_id: normalizeInt(body.job_city_id),
  other_benefit_english: body.other_benefit_english,
  other_benefit_hindi: body.other_benefit_hindi,
  salary_min: normalizeFloat(body.salary_min),
  salary_max: normalizeFloat(body.salary_max),
  work_start_time: body.work_start_time || null,
  work_end_time: body.work_end_time || null
});

// NEW: lightweight schema detection (memoized)
let _employersColsPromise = null;
const getEmployersCols = async () => {
  if (!_employersColsPromise) {
    _employersColsPromise = sequelize
      .getQueryInterface()
      .describeTable('employers')
      .catch(() => ({}));
  }
  return _employersColsPromise;
};

// NEW: pick an employer phone column that actually exists (expanded candidates)
const pickEmployerPhoneColumn = (cols = {}) => {
  const candidates = [
    'mobile', 'mobile_no', 'phone', 'phone_no',
    'contact', 'contact_number', 'contact_no',
    'contact_mobile', 'contact_phone'
  ];
  return candidates.find((c) => Object.prototype.hasOwnProperty.call(cols, c)) || null;
};

// CHANGED: build phone expr from either employers.<phoneCol> OR employers.user_id -> users.mobile
const buildEmployerPhoneExpr = ({ phoneCol, hasUserId }) => {
  if (phoneCol) {
    return `(SELECT e.\`${phoneCol}\` FROM employers e WHERE e.id = Job.employer_id LIMIT 1)`;
  }
  if (hasUserId) {
    return `(SELECT u.mobile FROM employers e JOIN users u ON u.id = e.user_id WHERE e.id = Job.employer_id LIMIT 1)`;
  }
  return null;
};

// NEW: date helpers (match backend/routes/employees.js semantics)
const normalizeDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
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

// NEW: resolve job profile name for logs
const getJobProfileLabel = async (jobProfileId) => {
  if (!jobProfileId || !JobProfile) return null;
  try {
    const jp = await JobProfile.findByPk(jobProfileId, {
      attributes: ['profile_english', 'profile_hindi'],
      paranoid: false,
    });
    return jp ? (jp.profile_english || jp.profile_hindi || null) : null;
  } catch {
    return null;
  }
};

/**
 * GET /jobs
 * Fetch a filtered list of jobs with related metadata.
 */
router.get('/', async (req, res) => {
  try {
    // Check for missing models/associations
    if (!Job) return res.status(500).json({ success: false, message: 'Job model missing' });
    if (!Employer) return res.status(500).json({ success: false, message: 'Employer model missing' });
    if (!JobProfile) return res.status(500).json({ success: false, message: 'JobProfile model missing' });
    if (!JobGender) return res.status(500).json({ success: false, message: 'JobGender model missing' });
    if (!JobExperience) return res.status(500).json({ success: false, message: 'JobExperience model missing' });
    if (!Experience) return res.status(500).json({ success: false, message: 'Experience model missing' });
    if (!JobQualification) return res.status(500).json({ success: false, message: 'JobQualification model missing' });
    if (!Qualification) return res.status(500).json({ success: false, message: 'Qualification model missing' });
    if (!JobShift) return res.status(500).json({ success: false, message: 'JobShift model missing' });
    if (!Shift) return res.status(500).json({ success: false, message: 'Shift model missing' });
    if (!JobSkill) return res.status(500).json({ success: false, message: 'JobSkill model missing' });
    if (!Skill) return res.status(500).json({ success: false, message: 'Skill model missing' });
    if (!SelectedJobBenefit) return res.status(500).json({ success: false, message: 'SelectedJobBenefit model missing' });
    if (!JobBenefit) return res.status(500).json({ success: false, message: 'JobBenefit model missing' });

    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = fetchAll ? undefined : Math.min(Math.max(limitParam || 25, 1), 200);
    const sortField = SORTABLE_FIELDS.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const searchRaw = (req.query.search || '').trim();
    const searchTerm = searchRaw.toLowerCase();
    const searchJoinsRequired = Boolean(searchTerm);

    const parseMulti = (v) => v ? String(v).split(',').filter(Boolean) : [];
    const toIntArray = (arr) => arr.map(n => parseInt(n, 10)).filter(Number.isFinite);
    const genderArr = parseMulti(req.query.gender);
    const experienceArr = toIntArray(parseMulti(req.query.experience));
    const qualificationArr = toIntArray(parseMulti(req.query.qualification));
    const shiftArr = toIntArray(parseMulti(req.query.shift));
    const skillArr = toIntArray(parseMulti(req.query.skill));
    const jobProfileArr = toIntArray(parseMulti(req.query.job_profile));
    const jobBenefitArr = toIntArray(parseMulti(req.query.job_benefit));
    const statusArr = parseMulti(req.query.status)
      .map(s => s.toLowerCase())
      .filter(s => ['active', 'inactive', 'expired'].includes(s));
    const jobRecency = (req.query.job_recency || '').toLowerCase();
    const jobWhere = {};
    if (jobProfileArr.length) jobWhere.job_profile_id = { [Op.in]: jobProfileArr };
    if (req.query.employer_id) jobWhere.employer_id = req.query.employer_id;

    // CHANGED: status filtering
    // - expired => status='expired' OR expired_at IS NOT NULL
    // - active/inactive => expired_at IS NULL (same behavior baseline)
    if (statusArr.length) {
      const statusOr = [];

      if (statusArr.includes('expired')) {
        statusOr.push({
          [Op.or]: [
            { status: 'expired' },
            { expired_at: { [Op.not]: null } } // IS NOT NULL (dialect-safe)
          ]
        });
      }
      if (statusArr.includes('active')) {
        statusOr.push({ status: 'active', expired_at: { [Op.is]: null } });
      }
      if (statusArr.includes('inactive')) {
        statusOr.push({ status: 'inactive', expired_at: { [Op.is]: null } });
      }

      if (statusOr.length) {
        jobWhere[Op.and] = (jobWhere[Op.and] || []).concat({ [Op.or]: statusOr });
      }
    }

    // NEW: verification filter
    const verificationArr = parseMulti(req.query.verification_status)
      .map(s => String(s).trim().toLowerCase())
      .filter(s => ['pending', 'approved', 'rejected'].includes(s));
    if (verificationArr.length) {
      jobWhere.verification_status = { [Op.in]: verificationArr };
    }

    if (jobRecency === 'new') {
      const thresholdDate = new Date(Date.now() - JOB_RECENCY_WINDOW_MS);
      jobWhere.created_at = {
        ...(jobWhere.created_at || {}),
        [Op.gte]: thresholdDate
      };
    }

    // NEW: compute employer phone expr based on actual employers table schema
    const employersCols = await getEmployersCols();
    const employerPhoneCol = pickEmployerPhoneColumn(employersCols);
    const hasEmployerUserId = Object.prototype.hasOwnProperty.call(employersCols || {}, 'user_id');
    const employerPhoneExpr = buildEmployerPhoneExpr({ phoneCol: employerPhoneCol, hasUserId: hasEmployerUserId });

    if (searchTerm) {
      const likeValue = `%${searchTerm}%`;
      const searchClauses = [];

      if (!Number.isNaN(Number(searchRaw))) {
        searchClauses.push({ id: Number(searchRaw) });
      }

      const lowerCol = (aliased) =>
        sequelize.where(sequelize.fn('LOWER', sequelize.col(aliased)), { [Op.like]: likeValue });

      searchClauses.push(
        lowerCol('JobProfile.profile_english'),
        lowerCol('JobProfile.profile_hindi'),
        lowerCol('Employer.name'),
        lowerCol('Employer.organization_name'),

        // FIX: employer phone search WITHOUT Employer->User join
        ...(employerPhoneExpr
          ? [
              sequelize.literal(
                `LOWER(COALESCE(${employerPhoneExpr}, '')) LIKE ${sequelize.escape(likeValue)}`
              )
            ]
          : []),

        // interviewer phone search
        lowerCol('Job.interviewer_contact'),

        lowerCol('Job.description_english'),
        lowerCol('Job.description_hindi'),
        lowerCol('Job.job_address_english'),
        lowerCol('Job.job_address_hindi')
      );

      if (State) {
        const matchingStates = await State.findAll({
          where: {
            [Op.or]: [
              sequelize.where(sequelize.fn('LOWER', sequelize.col('state_english')), { [Op.like]: likeValue }),
              sequelize.where(sequelize.fn('LOWER', sequelize.col('state_hindi')), { [Op.like]: likeValue })
            ]
          },
          attributes: ['id']
        });
        if (matchingStates.length) {
          searchClauses.push({ job_state_id: { [Op.in]: matchingStates.map(s => s.id) } });
        }
      }

      if (City) {
        const matchingCities = await City.findAll({
          where: {
            [Op.or]: [
              sequelize.where(sequelize.fn('LOWER', sequelize.col('city_english')), { [Op.like]: likeValue }),
              sequelize.where(sequelize.fn('LOWER', sequelize.col('city_hindi')), { [Op.like]: likeValue })
            ]
          },
          attributes: ['id']
        });
        if (matchingCities.length) {
          searchClauses.push({ job_city_id: { [Op.in]: matchingCities.map(c => c.id) } });
        }
      }

      jobWhere[Op.or] = searchClauses;
    }

    // NEW: state/city filters (IDs)
    const jobStateId = normalizeInt(req.query.job_state_id);
    if (jobStateId !== null) jobWhere.job_state_id = jobStateId;

    const jobCityId = normalizeInt(req.query.job_city_id);
    if (jobCityId !== null) jobWhere.job_city_id = jobCityId;

    // NEW: created date range filters (created_from/created_to)
    const createdFrom = normalizeDateOrNull(req.query.created_from);
    const createdTo = normalizeDateOrNull(req.query.created_to);
    if (createdFrom || createdTo) {
      const range = {};
      if (createdFrom) range[Op.gte] = startOfDay(createdFrom);
      if (createdTo) range[Op.lt] = endExclusiveOfDay(createdTo);
      jobWhere.created_at = { ...(jobWhere.created_at || {}), ...range };
    }

    // CHANGED: recency must compose with created_at range (don’t overwrite)
    if (jobRecency === 'new') {
      const thresholdDate = new Date(Date.now() - JOB_RECENCY_WINDOW_MS);
      const existingGte = jobWhere.created_at?.[Op.gte];
      jobWhere.created_at = {
        ...(jobWhere.created_at || {}),
        [Op.gte]: existingGte && existingGte > thresholdDate ? existingGte : thresholdDate
      };
    }

    const include = [
      {
        model: Employer,
        as: 'Employer',
        // CHANGED: include detected phone column if it exists
        attributes: [
          'id',
          'name',
          'organization_name',
          ...(employerPhoneCol ? [employerPhoneCol] : [])
        ],
        required: searchJoinsRequired
      },
      {
        model: JobProfile,
        as: 'JobProfile',
        attributes: ['profile_english', 'profile_hindi'],
        required: searchJoinsRequired
      },
      {
        model: JobGender,
        as: 'JobGenders',
        attributes: ['gender'],
        required: !!genderArr.length,
        where: genderArr.length ? { gender: { [Op.in]: genderArr } } : undefined
      },
      {
        model: JobExperience,
        as: 'JobExperiences',
        include: [{ model: Experience, as: 'Experience', attributes: ['title_english', 'title_hindi'] }],
        required: !!experienceArr.length,
        where: experienceArr.length ? { experience_id: { [Op.in]: experienceArr } } : undefined
      },
      {
        model: JobQualification,
        as: 'JobQualifications',
        include: [{ model: Qualification, as: 'Qualification', attributes: ['qualification_english', 'qualification_hindi'] }],
        required: !!qualificationArr.length,
        where: qualificationArr.length ? { qualification_id: { [Op.in]: qualificationArr } } : undefined
      },
      {
        model: JobShift,
        as: 'JobShifts',
        include: [{ model: Shift, as: 'Shift', attributes: ['shift_english', 'shift_hindi'] }],
        required: !!shiftArr.length,
        where: shiftArr.length ? { shift_id: { [Op.in]: shiftArr } } : undefined
      },
      {
        model: JobSkill,
        as: 'JobSkills',
        include: [{ model: Skill, as: 'Skill', attributes: ['skill_english', 'skill_hindi'] }],
        required: !!skillArr.length,
        where: skillArr.length ? { skill_id: { [Op.in]: skillArr } } : undefined
      },
      {
        model: SelectedJobBenefit,
        as: 'SelectedJobBenefits',
        include: [{ model: JobBenefit, as: 'JobBenefit', attributes: ['benefit_english', 'benefit_hindi'] }],
        required: !!jobBenefitArr.length,
        where: jobBenefitArr.length ? { benefit_id: { [Op.in]: jobBenefitArr } } : undefined
      }
    ];

    const queryOptions = {
      where: jobWhere,
      include,
      order: [[sortField, sortDir]],
      distinct: true,
      paranoid: true,
      ...(employerPhoneExpr
        ? { attributes: { include: [[sequelize.literal(employerPhoneExpr), 'employer_phone']] } }
        : {})
    };
    if (!fetchAll) {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
    }

    const { rows, count } = await Job.findAndCountAll(queryOptions);

    // NEW: fetch job days in bulk (no association required)
    const jobIds = rows.map(j => j.id).filter(Boolean);
    const jobDaysMap = new Map(); // job_id -> ['1','2',...]
    if (jobIds.length && JobDay) {
      const dayRows = await JobDay.findAll({
        where: { job_id: { [Op.in]: jobIds } },
        attributes: ['job_id', 'day'],
        order: [['job_id', 'ASC']]
      });
      dayRows.forEach(r => {
        const list = jobDaysMap.get(r.job_id) || [];
        list.push(r.day);
        jobDaysMap.set(r.job_id, list);
      });
    }

    // Fetch state/city names in bulk for all jobs
    const stateIds = [...new Set(rows.map(j => j.job_state_id).filter(Boolean))];
    const cityIds = [...new Set(rows.map(j => j.job_city_id).filter(Boolean))];
    let stateMap = new Map();
    let cityMap = new Map();
    if (State && stateIds.length) {
      const states = await State.findAll({ where: { id: stateIds } });
      states.forEach(s => stateMap.set(s.id, s.state_english || s.state_hindi || s.id));
    }
    if (City && cityIds.length) {
      const cities = await City.findAll({ where: { id: cityIds } });
      cities.forEach(c => cityMap.set(c.id, c.city_english || c.city_hindi || c.id));
    }

    const data = rows.map(job => {
      const days = jobDaysMap.get(job.id) || [];
      const daysShort = days.map(jobDayToShort).filter(Boolean);
      const daysShortStr = daysShort.length ? daysShort.join(',') : '';

      const start12 = formatTime12h(job.work_start_time);
      const end12 = formatTime12h(job.work_end_time);

      const timeRange =
        (start12 && end12) ? `${start12}-${end12}` : (start12 || end12 || '');

      const shiftTimingDisplay =
        [daysShortStr || null, timeRange || null].filter(Boolean).join(' • ') || null;

      // CHANGED: make employer_phone come from Employer.<phoneCol> first, else computed attribute
      const employerPhone =
        (employerPhoneCol && job.Employer ? (job.Employer[employerPhoneCol] || null) : null)
        || (job.get ? (job.get('employer_phone') || null) : null)
        || null;

      return {
        id: job.id,
        employer_id: job.employer_id,
        employer_name: job.Employer?.name,
        employer_phone: employerPhone,
        interviewer_contact: job.interviewer_contact || null,
        work_start_time: job.work_start_time || null,
        work_end_time: job.work_end_time || null,
        job_days: days,
        job_days_short: daysShortStr || null,
        shift_timing_display: shiftTimingDisplay,

        job_profile: job.JobProfile?.profile_english || job.JobProfile?.profile_hindi,
        is_household: job.is_household,
        genders: job.JobGenders.map(jg => jg.gender).join(', '),
        experiences: job.JobExperiences.map(je => je.Experience?.title_english || je.Experience?.title_hindi).join(', '),
        qualifications: job.JobQualifications.map(jq => jq.Qualification?.qualification_english || jq.Qualification?.qualification_hindi).join(', '),
        shifts: job.JobShifts.map(js => js.Shift?.shift_english || js.Shift?.shift_hindi).join(', '),
        skills: job.JobSkills.map(js => js.Skill?.skill_english || js.Skill?.skill_hindi).join(', '),
        benefits: job.SelectedJobBenefits.map(jb => jb.JobBenefit?.benefit_english || jb.JobBenefit?.benefit_hindi).join(', '),

        // NEW
        verification_status: job.verification_status || 'pending',

        // CHANGED: ensure numeric fallbacks (UI prints hired/total)
        hired_total: Number(job.hired_total ?? 0),
        no_vacancy: Number(job.no_vacancy ?? 0),

        job_state: stateMap.get(job.job_state_id) || '',
        job_city: cityMap.get(job.job_city_id) || '',
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        status: job.status,
        expired_at: job.expired_at,
        updated_at: job.updated_at,
        created_at: job.created_at,
      };
    });

    res.json({
      success: true,
      data,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? data.length : limit,
        total: count,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((count || 1) / (limit || count || 1)), 1)
      }
    });
  } catch (e) {
    console.error('[jobs] list error:', e);
    res.status(500).json({ success: false, message: e.message, stack: e.stack });
  }
});

/**
 * POST /jobs
 * Create a job with its associated option records.
 */
router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      skills = [],
      experiences = [],
      genders = [],
      qualifications = [],
      job_benefits = [],
      shifts = [],
      job_days = [],
    } = req.body;

    // Enforce employer ad-credit availability (consume 1 credit per job created)
    const employerId = normalizeInt(req.body?.employer_id);
    if (!employerId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Employer is required' });
    }

    const employer = await Employer.findByPk(employerId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      paranoid: false,
    });
    if (!employer) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Employer not found' });
    }

    const expiryAt = employer.credit_expiry_at ? new Date(employer.credit_expiry_at) : null;
    const isExpired = expiryAt && !Number.isNaN(expiryAt.getTime()) && expiryAt.getTime() <= Date.now();

    const remainingAd = Number(employer.ad_credit || 0);

    if (isExpired || remainingAd < 1) {
      await t.rollback();
      return res.status(402).json({
        success: false,
        code: 'NO_AD_CREDIT',
        message: isExpired ? 'Employer ad credits have expired' : 'No credit found',
        data: {
          ad_credit: remainingAd,
          credit_expiry_at: employer.credit_expiry_at,
        },
      });
    }

    // Deduct 1 ad credit for this job
    await employer.update({ ad_credit: remainingAd - 1 }, { transaction: t });

    const job = await Job.create({
      ...buildJobAttributes(req.body),
      status: 'inactive',
      expired_at: null
    }, { transaction: t });

    // 2. Save JobSkills
    if (Array.isArray(skills)) {
      for (const skill_id of skills) {
        await JobSkill.create({ job_id: job.id, skill_id }, { transaction: t });
      }
    }
    // 3. Save JobExperiences
    if (Array.isArray(experiences)) {
      for (const experience_id of experiences) {
        await JobExperience.create({ job_id: job.id, experience_id }, { transaction: t });
      }
    }
    // 4. Save JobGenders
    if (Array.isArray(genders)) {
      for (const gender of genders) {
        await JobGender.create({ job_id: job.id, gender }, { transaction: t });
      }
    }
    // 5. Save JobQualifications
    if (Array.isArray(qualifications)) {
      for (const qualification_id of qualifications) {
        await JobQualification.create({ job_id: job.id, qualification_id }, { transaction: t });
      }
    }
    // 6. Save SelectedJobBenefits
    if (Array.isArray(job_benefits)) {
      for (const benefit_id of job_benefits) {
        await SelectedJobBenefit.create({ job_id: job.id, benefit_id }, { transaction: t });
      }
    }
    // 7. Save JobShifts
    if (Array.isArray(shifts)) {
      for (const shift_id of shifts) {
        await JobShift.create({ job_id: job.id, shift_id }, { transaction: t });
      }
    }
    // 8. Save JobDays (job_days)
    if (Array.isArray(job_days)) {
      const JobDay = models.JobDay;
      if (JobDay) {
        for (const day of job_days) {
          const normDay = normalizeJobDay(day);
          if (normDay) {
            await JobDay.create({ job_id: job.id, day: normDay }, { transaction: t });
          }
        }
      }
    }

    await t.commit();

    const adminId = getAdminId(req);
    const jobProfileLabel = await getJobProfileLabel(job.job_profile_id);
    await safeCreateLog({
      category: 'jobs',
      type: 'add',
      redirect_to: `/jobs/${job.id}`,
      log_text: `Created job: #${job.id} profile=${jobProfileLabel || '-'} status=${job.status || '-'}`,
      rj_employee_id: adminId,
    });

    res.status(201).json({ success: true, data: job });
  } catch (err) {
    await t.rollback();
    console.error('[jobs] create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /jobs/:id
 * Fetch a job with all selectable option IDs for editing.
 */
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id, {
      include: [
        { model: Employer, as: 'Employer', attributes: ['id', 'name'] },
        { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'] },
        { model: JobGender, as: 'JobGenders', attributes: ['gender'] },
        {
          model: JobExperience,
          as: 'JobExperiences',
          attributes: ['experience_id'],
          include: [{ model: Experience, as: 'Experience', attributes: ['title_english', 'title_hindi'] }]
        },
        {
          model: JobQualification,
          as: 'JobQualifications',
          attributes: ['qualification_id'],
          include: [{ model: Qualification, as: 'Qualification', attributes: ['qualification_english', 'qualification_hindi'] }]
        },
        {
          model: JobShift,
          as: 'JobShifts',
          attributes: ['shift_id'],
          include: [{ model: Shift, as: 'Shift', attributes: ['shift_english', 'shift_hindi'] }]
        },
        {
          model: JobSkill,
          as: 'JobSkills',
          attributes: ['skill_id'],
          include: [{ model: Skill, as: 'Skill', attributes: ['skill_english', 'skill_hindi'] }]
        },
        {
          model: SelectedJobBenefit,
          as: 'SelectedJobBenefits',
          attributes: ['benefit_id'],
          include: [{ model: JobBenefit, as: 'JobBenefit', attributes: ['benefit_english', 'benefit_hindi'] }]
        },
      ]
    });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Compose arrays of IDs for multi-selects
    const skills_ids = (job.JobSkills || []).map(js => js.skill_id);
    const experiences_ids = (job.JobExperiences || []).map(je => je.experience_id);
    const genders = (job.JobGenders || []).map(jg => jg.gender);
    const qualifications_ids = (job.JobQualifications || []).map(jq => jq.qualification_id);
    const job_benefits_ids = (job.SelectedJobBenefits || []).map(jb => jb.benefit_id);
    const shifts_ids = (job.JobShifts || []).map(js => js.shift_id);

    // Compose arrays of joined values for each option
    const experiences = (job.JobExperiences || [])
      .map(je => je.Experience?.title_english || je.Experience?.title_hindi)
      .filter(Boolean);
    const qualifications = (job.JobQualifications || [])
      .map(jq => jq.Qualification?.qualification_english || jq.Qualification?.qualification_hindi)
      .filter(Boolean);
    const shifts = (job.JobShifts || [])
      .map(js => js.Shift?.shift_english || js.Shift?.shift_hindi)
      .filter(Boolean);
    const skills = (job.JobSkills || [])
      .map(js => js.Skill?.skill_english || js.Skill?.skill_hindi)
      .filter(Boolean);
    const benefits = (job.SelectedJobBenefits || [])
      .map(jb => jb.JobBenefit?.benefit_english || jb.JobBenefit?.benefit_hindi)
      .filter(Boolean);

    // Job days (if JobDay model exists)
    let job_days = [];
    if (models.JobDay) {
      const jobDays = await models.JobDay.findAll({ where: { job_id: job.id } });
      job_days = jobDays.map(jd => jd.day);
    }

    // Fetch state and city names using job_state_id and job_city_id
    let job_state = '';
    let job_city = '';
    if (job.job_state_id && State) {
      const state = await State.findByPk(job.job_state_id);
      job_state = state?.state_english || state?.state_hindi || '';
    }
    if (job.job_city_id && City) {
      const city = await City.findByPk(job.job_city_id);
      job_city = city?.city_english || city?.city_hindi || '';
    }

    res.json({
      success: true,
      data: {
        ...job.toJSON(),
        skills_ids,
        experiences_ids,
        genders,
        qualifications_ids,
        job_benefits_ids,
        shifts_ids,
        job_days,
        experiences,
        qualifications,
        shifts,
        skills,
        benefits,
        job_state,
        job_city,
      }
    });
  } catch (err) {
    console.error('[jobs] get by id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /jobs/:id
 * Update a job and refresh all related option associations.
 */
router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const job = await Job.findByPk(req.params.id, { transaction: t });
    if (!job) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const {
      skills = [],
      experiences = [],
      genders = [],
      qualifications = [],
      job_benefits = [],
      shifts = [],
      job_days = [],
    } = req.body;

    await job.update(buildJobAttributes(req.body), { transaction: t });

    // 2. Remove old option records
    await Promise.all([
      JobSkill.destroy({ where: { job_id: job.id }, transaction: t }),
      JobExperience.destroy({ where: { job_id: job.id }, transaction: t }),
      JobGender.destroy({ where: { job_id: job.id }, transaction: t }),
      JobQualification.destroy({ where: { job_id: job.id }, transaction: t }),
      SelectedJobBenefit.destroy({ where: { job_id: job.id }, transaction: t }),
      JobShift.destroy({ where: { job_id: job.id }, transaction: t }),
      models.JobDay ? models.JobDay.destroy({ where: { job_id: job.id }, transaction: t }) : Promise.resolve()
    ]);

    // 3. Re-insert new option records
    if (Array.isArray(skills)) {
      for (const skill_id of skills) {
        await JobSkill.create({ job_id: job.id, skill_id }, { transaction: t });
      }
    }
    if (Array.isArray(experiences)) {
      for (const experience_id of experiences) {
        await JobExperience.create({ job_id: job.id, experience_id }, { transaction: t });
      }
    }
    if (Array.isArray(genders)) {
      for (const gender of genders) {
        await JobGender.create({ job_id: job.id, gender }, { transaction: t });
      }
    }
    if (Array.isArray(qualifications)) {
      for (const qualification_id of qualifications) {
        await JobQualification.create({ job_id: job.id, qualification_id }, { transaction: t });
      }
    }
    if (Array.isArray(job_benefits)) {
      for (const benefit_id of job_benefits) {
        await SelectedJobBenefit.create({ job_id: job.id, benefit_id }, { transaction: t });
      }
    }
    if (Array.isArray(shifts)) {
      for (const shift_id of shifts) {
        await JobShift.create({ job_id: job.id, shift_id }, { transaction: t });
      }
    }
    if (Array.isArray(job_days) && models.JobDay) {
      for (const day of job_days) {
        const normDay = normalizeJobDay(day);
        if (normDay) {
          await models.JobDay.create({ job_id: job.id, day: normDay }, { transaction: t });
        }
      }
    }

    await t.commit();

    const adminId = getAdminId(req);
    const jobProfileLabel = await getJobProfileLabel(job.job_profile_id);
    await safeCreateLog({
      category: 'jobs',
      type: 'update',
      redirect_to: `/jobs/${job.id}`,
      log_text: `Updated job: #${job.id} profile=${jobProfileLabel || '-'} status=${job.status || '-'}`,
      rj_employee_id: adminId,
    });

    res.json({ success: true, data: job });
  } catch (err) {
    await t.rollback();
    console.error('[jobs] update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /jobs/:id/status
 * Toggle job active/inactive without touching other fields.
 */
router.patch('/:id/status', async (req, res) => {
  try {
    if (!Job) return res.status(500).json({ success: false, message: 'Job model missing' });
    const job = await Job.findByPk(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // NEW: only approved jobs can be activated/deactivated/expired
    if (String(job.verification_status || 'pending').toLowerCase() !== 'approved') {
      return res.status(403).json({ success: false, message: 'Job must be approved before changing status.' });
    }

    const prevStatus = String(job.status || '').toLowerCase();
    const prevExpiredAt = job.expired_at;

    const requested = String(req.body?.status || '').toLowerCase();
    const nextStatus = ['active', 'inactive', 'expired'].includes(requested) ? requested : 'active';

    if (nextStatus === 'expired') {
      job.status = 'expired';
      job.expired_at = new Date();
    } else if (nextStatus === 'active') {
      job.status = 'active';
      job.expired_at = null; // clear expiry when activating
    } else {
      // CHANGED: inactive should behave like active (non-expired bucket)
      job.status = 'inactive';
      job.expired_at = null;
    }

    await job.save();

    const adminId = getAdminId(req);
    const actionLabel = nextStatus === 'expired'
      ? 'Marked job expired'
      : nextStatus === 'active'
        ? 'Activated job'
        : 'Deactivated job';
    const jobProfileLabel = await getJobProfileLabel(job.job_profile_id);
    await safeCreateLog({
      category: 'jobs',
      type: 'update',
      redirect_to: `/jobs/${job.id}`,
      log_text: `${actionLabel}: #${job.id} profile=${jobProfileLabel || '-'} (from ${prevStatus || '-'}${prevExpiredAt ? ' expired' : ''} to ${job.status || '-' }${job.expired_at ? ' expired' : ''})`,
      rj_employee_id: adminId,
    });

    res.json({ success: true, data: job });
  } catch (err) {
    console.error('[jobs] status update error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update job status' });
  }
});

/**
 * PATCH /jobs/:id/verification-status
 * Set job verification status: pending|approved|rejected
 */
router.patch('/:id/verification-status', async (req, res) => {
  try {
    if (!Job) return res.status(500).json({ success: false, message: 'Job model missing' });

    const job = await Job.findByPk(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const requested = String(req.body?.verification_status || '').toLowerCase();
    const next = ['pending', 'approved', 'rejected'].includes(requested) ? requested : null;
    if (!next) return res.status(400).json({ success: false, message: 'Invalid verification_status (pending|approved|rejected)' });

    const prev = String(job.verification_status || '').toLowerCase();
    await job.update({ verification_status: next });

    const adminId = getAdminId(req);
    const actionLabel = next === 'approved' ? 'Approved job' : next === 'rejected' ? 'Rejected job' : 'Set job verification pending';
    const jobProfileLabel = await getJobProfileLabel(job.job_profile_id);
    await safeCreateLog({
      category: 'jobs',
      type: 'update',
      redirect_to: `/jobs/${job.id}`,
      log_text: `${actionLabel}: #${job.id} profile=${jobProfileLabel || '-'} (from ${prev || '-'} to ${next})`,
      rj_employee_id: adminId,
    });

    // optional: if rejecting, force job inactive (keeps system safe)
    // if (next === 'rejected') await job.update({ status: 'inactive' });

    res.json({ success: true, data: job });
  } catch (err) {
    console.error('[jobs] verification-status update error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update verification status' });
  }
});



/**
 * DELETE /jobs/:id
 * Soft delete a job and related option records.
 */
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!Job) {
      await t.rollback();
      return res.status(500).json({ success: false, message: 'Job model missing' });
    }

    const job = await Job.findByPk(req.params.id, { transaction: t });
    if (!job) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    await Promise.all([
      JobSkill.destroy({ where: { job_id: job.id }, transaction: t }),
      JobExperience.destroy({ where: { job_id: job.id }, transaction: t }),
      JobGender.destroy({ where: { job_id: job.id }, transaction: t }),
      JobQualification.destroy({ where: { job_id: job.id }, transaction: t }),
      SelectedJobBenefit.destroy({ where: { job_id: job.id }, transaction: t }),
      JobShift.destroy({ where: { job_id: job.id }, transaction: t }),
      models.JobDay ? models.JobDay.destroy({ where: { job_id: job.id }, transaction: t }) : Promise.resolve(),
    ]);

    await job.destroy({ transaction: t });
    await t.commit();

    const adminId = getAdminId(req);
    const jobProfileLabel = await getJobProfileLabel(job.job_profile_id);
    await safeCreateLog({
      category: 'jobs',
      type: 'delete',
      redirect_to: '/jobs',
      log_text: `Deleted job: #${job.id} profile=${jobProfileLabel || '-'} status=${job.status || '-'}`,
      rj_employee_id: adminId,
    });

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    await t.rollback();
    console.error('[jobs] delete error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to delete job' });
  }
});
/**
 * GET /jobs/:id/applicants
 * Retrieve applicants for a job along with employee details.
 */
router.get('/:id/applicants', async (req, res) => {
  try {
    if (!JobInterest) return res.status(500).json({ success: false, message: 'JobInterest model missing' });

    // Fetch all job interests for this job
    const interests = await JobInterest.findAll({
      where: { job_id: req.params.id },
      order: [['created_at', 'DESC']],
      raw: false
    });

    // Collect employee IDs for received interests (sender_type=employee) and sent interests (sender_type=employer)
    const employeeIds = interests
      .filter(i => (i.sender_type === 'employee') || (i.sender_type === 'employer'))
      .map(i => i.sender_type === 'employee' ? i.sender_id : i.receiver_id);

    // Fetch employee details in bulk
    let employeesMap = {};
    if (employeeIds.length && Employee) {
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
        // Only use non-deleted job profiles
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

    // Compose response
    const data = interests.map(i => {
      let employee = undefined;
      let employee_id = undefined;
      if (i.sender_type === 'employee') {
        employee_id = i.sender_id;
      } else if (i.sender_type === 'employer') {
        employee_id = i.receiver_id;
      }
      if (employee_id && employeesMap[employee_id]) {
        employee = employeesMap[employee_id];
      }

      // Determine timing fields for frontend
      let applied_at = i.created_at;
      let updated_at = i.updated_at;
      // For sent/received (pending): use created_at as time
      // For shortlisted/hired/rejected: use updated_at as time

      return {
        id: i.id,
        sender_id: i.sender_id,
        sender_type: i.sender_type,
        receiver_id: i.receiver_id,
        status: i.status,
        otp: i.otp,
        applied_at,
        updated_at,
        name: employee?.name || undefined,
        mobile: undefined,
        employee,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[jobs/:id/applicants] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


/**
 * GET /jobs/:id/recommended-candidates
 * Recommend employees based on job requirements:
 * - preferred state/city
 * - job profile
 * - salary expectation
 * - gender
 * - qualification
 */
router.get('/:id/recommended-candidates', async (req, res) => {
  try {
    if (!Job) return res.status(500).json({ success: false, message: 'Job model missing' });
    if (!Employee) return res.status(500).json({ success: false, message: 'Employee model missing' });

    const job = await Job.findByPk(req.params.id, {
      attributes: ['id', 'job_profile_id', 'job_state_id', 'job_city_id', 'salary_min', 'salary_max'],
      include: [
        { model: JobGender, as: 'JobGenders', attributes: ['gender'], required: false, paranoid: false },
        { model: JobQualification, as: 'JobQualifications', attributes: ['qualification_id'], required: false, paranoid: false }
      ],
      paranoid: false
    });

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const genders = Array.from(
      new Set(
        (job.JobGenders || [])
          .map(g => String(g.gender || '').toLowerCase().trim())
          .filter(Boolean)
      )
    );
    const allowAnyGender = genders.includes('any');

    const requiredQualificationIds = Array.from(
      new Set((job.JobQualifications || []).map(q => q.qualification_id).filter(Boolean))
    );

    const where = {};

    if (job.job_state_id) where.preferred_state_id = job.job_state_id;
    if (job.job_city_id) where.preferred_city_id = job.job_city_id;

    if (requiredQualificationIds.length) {
      where.qualification_id = { [Op.in]: requiredQualificationIds };
    }

    if (genders.length && !allowAnyGender) {
      where.gender = { [Op.in]: genders };
    }

    // Salary expectation: if job salary bounds exist, match employees whose expected_salary is within range.
    // If employee expected_salary is null, allow them through.
    const salaryMin = job.salary_min;
    const salaryMax = job.salary_max;
    const salaryConds = [];
    if (salaryMin !== null && salaryMin !== undefined) salaryConds.push({ expected_salary: { [Op.gte]: salaryMin } });
    if (salaryMax !== null && salaryMax !== undefined) salaryConds.push({ expected_salary: { [Op.lte]: salaryMax } });
    if (salaryConds.length) {
      where[Op.or] = [{ expected_salary: null }, { [Op.and]: salaryConds }];
    }

    const include = [
      { model: State, as: 'PreferredState', attributes: ['state_english'], required: false },
      { model: City, as: 'PreferredCity', attributes: ['city_english'], required: false },
      { model: Qualification, as: 'Qualification', attributes: ['qualification_english', 'qualification_hindi'], required: false },
      {
        model: User,
        as: 'User',
        attributes: ['id', 'name', 'mobile', 'is_active'],
        where: { is_active: true },
        required: true,
        paranoid: false
      },
      {
        model: EmployeeJobProfile,
        as: 'EmployeeJobProfiles',
        attributes: ['employee_id', 'job_profile_id'],
        required: !!job.job_profile_id,
        where: job.job_profile_id ? { job_profile_id: job.job_profile_id } : undefined,
        include: [{ model: JobProfile, as: 'JobProfile', attributes: ['profile_english', 'profile_hindi'], required: false }],
        paranoid: true
      }
    ];

    const employees = await Employee.findAll({
      where,
      include,
      order: [['id', 'DESC']],
      limit: 500,
      paranoid: false
    });

    const data = (employees || []).map(emp => {
      let jobProfiles = [];
      if (Array.isArray(emp.EmployeeJobProfiles)) {
        jobProfiles = emp.EmployeeJobProfiles
          .filter(ejp => !ejp.deleted_at && ejp.JobProfile)
          .map(ejp => ({
            id: ejp.job_profile_id,
            profile_english: ejp.JobProfile.profile_english,
            profile_hindi: ejp.JobProfile.profile_hindi
          }));
      }

      return {
        id: emp.id,
        name: emp.name || emp.User?.name || null,
        mobile: emp.User?.mobile || null,
        is_active: emp.User?.is_active ?? null,
        gender: emp.gender || null,
        verification_status: emp.verification_status || null,
        kyc_status: emp.kyc_status || null,
        expected_salary: emp.expected_salary ?? null,
        expected_salary_frequency: emp.expected_salary_frequency || null,
        preferred_state: emp.PreferredState?.state_english || null,
        preferred_city: emp.PreferredCity?.city_english || null,
        qualification: emp.Qualification?.qualification_english || emp.Qualification?.qualification_hindi || null,
        job_profiles: jobProfiles
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[jobs] recommended candidates error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch recommended candidates' });
  }
});

// Helper: normalize day to string 1-7
function normalizeJobDay(day) {
  if (day === null || day === undefined) return null;
  if (typeof day === 'object' && day !== null) {
    if (day.day !== undefined) day = day.day;
    else if (day.value !== undefined) day = day.value;
  }
  const str = String(day).trim().toLowerCase();
  if (!str) return null;
  const nameToNum = {
    monday: '1', tuesday: '2', wednesday: '3',
    thursday: '4', friday: '5', saturday: '6', sunday: '7'
  };
  if (nameToNum[str]) return nameToNum[str];
  const parsed = parseInt(str, 10);
  if (parsed >= 1 && parsed <= 7) return String(parsed);
  return null;
}

// helper: normalize day -> short label (Mon,Tue,...)
const jobDayToShort = (day) => {
  if (day === null || day === undefined) return null;
  const str = String(day).trim().toLowerCase();
  const map = {
    '1': 'Mon', monday: 'Mon',
    '2': 'Tue', tuesday: 'Tue',
    '3': 'Wed', wednesday: 'Wed',
    '4': 'Thu', thursday: 'Thu',
    '5': 'Fri', friday: 'Fri',
    '6': 'Sat', saturday: 'Sat',
    '7': 'Sun', sunday: 'Sun'
  };
  return map[str] || null;
};

// NEW: TIME -> "h:mm AM/PM" (accepts "HH:MM" or "HH:MM:SS")
const formatTime12h = (t) => {
  if (!t) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return s; // fallback, keep original
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  if (Number.isNaN(hh)) return s;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${suffix}`;
};

// NOTE: status filter supports: active, inactive, expired (statusArr already includes 'expired').
// NOTE: "expired" = expired_at is NOT NULL (even if status is 'inactive').

module.exports = router;
