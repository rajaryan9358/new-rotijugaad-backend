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
const Admin = require('../models/Admin'); // NEW: for User.StatusChangedBy join
const models = require('../models');
const Job = models.Job;
const JobInterest = models.JobInterest;
const Employee = models.Employee;
const JobProfile = models.JobProfile;
const EmployeeJobProfile = models.EmployeeJobProfile;
const EmployerShortlistedCandidate = models.EmployerShortlistedCandidate;
const EmployerContact = require('../models/EmployerContact');
const EmployeeContact = require('../models/EmployeeContact');
const CallHistory = require('../models/CallHistory');
const EmployerCallExperience = require('../models/EmployerCallExperience');
const { deleteByEmployerId } = require('../utils/deleteUserTransactional');
const Referral = require('../models/Referral'); // added
const getAdminId = require('../utils/getAdminId');
const Log = require('../models/Log');
const ManualCreditHistory = require('../models/ManualCreditHistory');

const { fillBilingualPair, applyBilingualPairFromBody } = require('../utils/bilingual');

const { authenticate } = require('../middleware/auth');
const { notifyEmployerStatusChange } = require('../utils/systemNotifications');
const { notifyUser } = require('../utils/userNotifications');
const { getNotificationTemplate } = require('../utils/notificationTemplates');

const employerRedirect = (id) => `/employers/${id}`;

const safeLog = async (req, payload) => {
  try {
    const adminId = getAdminId(req);
    if (!adminId) return;
    await Log.create({
      ...payload,
      rj_employee_id: adminId,
    });
  } catch (e) {
    // never break main flows for logging
  }
};

const safeCreateManualCreditHistory = async (payload) => {
  try {
    await ManualCreditHistory.create(payload);
  } catch (e) {
    // never break main flows for history writes
  }
};

const buildEmployerCreditMessage = ({ contactDelta, interestDelta, adDelta }) => {
  const partsEn = [];
  const partsHi = [];

  if (contactDelta > 0) {
    partsEn.push(`${contactDelta} contact credit${contactDelta === 1 ? '' : 's'}`);
    partsHi.push(`${contactDelta} कॉन्टैक्ट क्रेडिट`);
  }
  if (interestDelta > 0) {
    partsEn.push(`${interestDelta} interest credit${interestDelta === 1 ? '' : 's'}`);
    partsHi.push(`${interestDelta} इंटरेस्ट क्रेडिट`);
  }
  if (adDelta > 0) {
    partsEn.push(`${adDelta} ad credit${adDelta === 1 ? '' : 's'}`);
    partsHi.push(`${adDelta} ऐड क्रेडिट`);
  }

  return {
    bodyEnglish: partsEn.length
      ? `${partsEn.join(' and ')} ${partsEn.length > 1 ? 'have' : 'has'} been added to your account.`
      : 'Credits have been added to your account.',
    bodyHindi: partsHi.length
      ? `आपके अकाउंट में ${partsHi.join(' और ')} जोड़े गए हैं।`
      : 'आपके अकाउंट में क्रेडिट जोड़े गए हैं।',
  };
};

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
  { model: Admin, as: 'StatusChangedBy', attributes: ['id', 'name'], required: false },
];

const ensureUserInclude = (includeList = []) => {
  let userInclude = includeList.find((inc) => inc.as === 'User');
  if (!userInclude) {
    userInclude = { model: User, as: 'User', paranoid: false };
    includeList.push(userInclude);
  }
  return userInclude;
};



const SORTABLE_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'name',
  'organization_name',
  'verification_status',
  'kyc_status'
]);

const parseBool = (v) => ['true', '1', 'yes'].includes(String(v || '').toLowerCase());
const parseIntSafe = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

const parseDecimalSafe = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const buildEmployerAttributes = (body = {}) => ({
  name: body.name ?? undefined,
  name_hindi: body.name_hindi ?? undefined,
  organization_type: body.organization_type ?? undefined,
  organization_name: body.organization_name ?? undefined,
  organization_name_hindi: body.organization_name_hindi ?? undefined,
  business_category_id: body.business_category_id ?? undefined,
  state_id: body.state_id ?? undefined,
  city_id: body.city_id ?? undefined,
  address: body.address ?? undefined,
  address_hindi: body.address_hindi ?? undefined,
  email: body.email ?? undefined,
  aadhar_number: body.aadhar_number ?? undefined,
  assisted_by: body.assisted_by ?? undefined,
  document_link: body.document_link ?? undefined,
  total_contact_credit: parseIntSafe(body.total_contact_credit) ?? undefined,
  contact_credit: parseIntSafe(body.contact_credit) ?? undefined,
  total_interest_credit: parseDecimalSafe(body.total_interest_credit) ?? undefined,
  interest_credit: parseDecimalSafe(body.interest_credit) ?? undefined,
  total_ad_credit: parseIntSafe(body.total_ad_credit) ?? undefined,
  ad_credit: parseIntSafe(body.ad_credit) ?? undefined,
  credit_expiry_at: body.credit_expiry_at === '' ? null : (body.credit_expiry_at ?? undefined)
});

const validateEmployerCreditState = (currentEmployer, nextPayload = {}) => {
  const totalContact = Object.prototype.hasOwnProperty.call(nextPayload, 'total_contact_credit')
    ? Number(nextPayload.total_contact_credit ?? 0)
    : Number(currentEmployer?.total_contact_credit ?? 0);
  const contact = Object.prototype.hasOwnProperty.call(nextPayload, 'contact_credit')
    ? Number(nextPayload.contact_credit ?? 0)
    : Number(currentEmployer?.contact_credit ?? 0);
  const totalInterest = Object.prototype.hasOwnProperty.call(nextPayload, 'total_interest_credit')
    ? Number(nextPayload.total_interest_credit ?? 0)
    : Number(currentEmployer?.total_interest_credit ?? 0);
  const interest = Object.prototype.hasOwnProperty.call(nextPayload, 'interest_credit')
    ? Number(nextPayload.interest_credit ?? 0)
    : Number(currentEmployer?.interest_credit ?? 0);
  const totalAd = Object.prototype.hasOwnProperty.call(nextPayload, 'total_ad_credit')
    ? Number(nextPayload.total_ad_credit ?? 0)
    : Number(currentEmployer?.total_ad_credit ?? 0);
  const ad = Object.prototype.hasOwnProperty.call(nextPayload, 'ad_credit')
    ? Number(nextPayload.ad_credit ?? 0)
    : Number(currentEmployer?.ad_credit ?? 0);

  if (Number.isFinite(totalContact) && Number.isFinite(contact) && totalContact < contact) {
    return 'Total contact credit must be greater than or equal to contact credit';
  }
  if (Number.isFinite(totalInterest) && Number.isFinite(interest) && totalInterest < interest) {
    return 'Total interest credit must be greater than or equal to interest credit';
  }
  if (Number.isFinite(totalAd) && Number.isFinite(ad) && totalAd < ad) {
    return 'Total ad credit must be greater than or equal to ad credit';
  }

  return null;
};

const stripUndefined = (obj) => {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k]; // FIX: was dropping values
  });
  return out;
};

const normalizeDateOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endExclusiveOfDay = (date) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};


/**
 * GET /employers
 * List employers.
 */
router.get('/', async (req, res) => {
  try {
    const fetchAll = parseBool(req.query.all);
    const page = Math.max(parseIntSafe(req.query.page) || 1, 1);

    const rawLimit = req.query.pageSize ?? req.query.limit;
    const limitParam = parseIntSafe(rawLimit);
    const limit = fetchAll ? undefined : Math.min(Math.max(limitParam || 25, 1), 200);

    const sortField = SORTABLE_FIELDS.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const include = baseInclude.map((item) => ({ ...item }));
    const userInclude = ensureUserInclude(include);

    userInclude.attributes = [
      'id',
      'mobile',
      'is_active',
      'deactivation_reason',
      'preferred_language',
      'referred_by',
      'referral_code',
      'total_referred',
      'delete_pending',
      'delete_requested_at',
      'created_at',
      'last_active_at',
      'profile_completed_at'
    ];

    userInclude.required = false;

    const whereClause = {};
    const andConditions = [];

    const parseId = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const stateId = parseId(req.query.state_id);
    if (stateId !== null) whereClause.state_id = stateId;

    const cityId = parseId(req.query.city_id);
    if (cityId !== null) whereClause.city_id = cityId;

    const planId = parseId(req.query.subscription_plan_id);
    if (planId !== null) whereClause.subscription_plan_id = planId;

    const organizationType = (req.query.organization_type || '').toString().trim().toLowerCase();
    if (organizationType) whereClause.organization_type = organizationType;

    const verificationStatus = (req.query.verification_status || '').toString().trim().toLowerCase();
    if (verificationStatus) whereClause.verification_status = verificationStatus;

    const kycStatus = (req.query.kyc_status || '').toString().trim().toLowerCase();
    if (kycStatus) whereClause.kyc_status = kycStatus;

    // NEW: KYC verification date range filter (kyc_verified_from/kyc_verified_to)
    const kycVerifiedFrom = normalizeDateOrNull(req.query.kyc_verified_from ?? req.query.kycVerifiedFrom);
    const kycVerifiedTo = normalizeDateOrNull(req.query.kyc_verified_to ?? req.query.kycVerifiedTo);
    if (kycVerifiedFrom || kycVerifiedTo) {
      // filtering by verification timestamp implies "verified"
      whereClause.kyc_status = 'verified';

      const range = {};
      if (kycVerifiedFrom) range[Op.gte] = startOfDay(kycVerifiedFrom);
      if (kycVerifiedTo) range[Op.lt] = endExclusiveOfDay(kycVerifiedTo);
      whereClause.kyc_verification_at = range;
    }

    const assistedBy = (req.query.assisted_by || '').toString().trim().toLowerCase();
    if (assistedBy) {
      const pattern = `%${assistedBy}%`;
      andConditions.push(Sequelize.where(fn('LOWER', col('Employer.assisted_by')), { [Op.like]: pattern }));
    }

    const category = (req.query.category || '').toString().trim().toLowerCase();
    if (category) {
      const businessCategoryInclude = include.find((inc) => inc.as === 'BusinessCategory');
      if (businessCategoryInclude) businessCategoryInclude.required = true;
      andConditions.push(
        Sequelize.where(fn('LOWER', col('BusinessCategory.category_english')), { [Op.eq]: category })
      );
    }

    // created date range filter (createdFrom/createdTo)
    const createdFrom = normalizeDateOrNull(req.query.createdFrom);
    const createdTo = normalizeDateOrNull(req.query.createdTo);
    if (createdFrom || createdTo) {
      const range = {};
      if (createdFrom) range[Op.gte] = startOfDay(createdFrom);
      if (createdTo) range[Op.lt] = endExclusiveOfDay(createdTo);
      whereClause.created_at = range;
    }

    const activeStatus = (req.query.active_status || '').toString().trim().toLowerCase();
    if (activeStatus === 'active' || activeStatus === 'inactive') {
      userInclude.required = true;
      andConditions.push(Sequelize.where(col('User.is_active'), { [Op.eq]: activeStatus === 'active' }));
    }

    const newFilter = (req.query.newFilter || '').toString().trim().toLowerCase();
    if (newFilter === 'new') {
      const newSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
      userInclude.required = true;
      andConditions.push(Sequelize.where(col('User.created_at'), { [Op.gte]: newSince }));
    }

    const subscriptionStatus = (req.query.subscription_status || '').toString().trim().toLowerCase();
    if (subscriptionStatus === 'active') {
      andConditions.push({
        [Op.or]: [
          { credit_expiry_at: null },
          { credit_expiry_at: { [Op.gt]: new Date() } }
        ]
      });
    } else if (subscriptionStatus === 'expired') {
      andConditions.push({
        credit_expiry_at: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.lte]: new Date() }
          ]
        }
      });
    }

    const searchRaw = String(req.query.search || '').trim().toLowerCase();
    if (searchRaw) {
      const pattern = `%${searchRaw}%`;
      const searchConditions = [
        Sequelize.where(fn('LOWER', col('Employer.name')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('Employer.organization_name')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('Employer.email')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('State.state_english')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('City.city_english')), { [Op.like]: pattern }),
        Sequelize.where(fn('LOWER', col('User.mobile')), { [Op.like]: pattern })
      ];
      const numericId = Number(searchRaw);
      if (!Number.isNaN(numericId)) searchConditions.push({ id: numericId });
      andConditions.push({ [Op.or]: searchConditions });
    }

    if (andConditions.length) {
      whereClause[Op.and] = (whereClause[Op.and] || []).concat(andConditions);
    }

    const queryOptions = {
      where: whereClause,
      include,
      order: [[sortField, sortDir]],
      distinct: true,
      paranoid: true,
      attributes: {
        include: [
          [
            literal("(SELECT COUNT(1) FROM jobs j WHERE j.employer_id = Employer.id AND j.deleted_at IS NULL AND j.expired_at IS NULL AND j.status = 'active')"),
            'active_jobs_count'
          ]
        ]
      }
    };
    if (!fetchAll) {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
    }

    const { rows, count } = await Employer.findAndCountAll(queryOptions);

    res.json({
      success: true,
      data: rows,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? rows.length : limit,
        total: count,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((count || 1) / (limit || count || 1)), 1)
      }
    });
  } catch (err) {
    console.error('[employers] list error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to load employers' });
  }
});

/**
 * GET /employers/:id
 * Get employer by id.
 */
router.get('/:id', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const include = baseInclude.map((item) => ({ ...item }));
    const userInclude = ensureUserInclude(include);

    userInclude.attributes = [
      'id',
      'mobile',
      'is_active',
      'deactivation_reason',
      'preferred_language',
      'referred_by',
      'referral_code',
      'total_referred',
      'delete_pending',
      'delete_requested_at',
      'created_at',
      'last_active_at',
      'profile_completed_at'
    ];
    userInclude.paranoid = false;

    const employer = await Employer.findByPk(employerId, { include, paranoid: true });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    res.json({ success: true, data: employer });
  } catch (err) {
    console.error('[employers] getById error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to load employer' });
  }
});

/**
 * POST /employers
 * Create employer (creates/links User via mobile if needed).
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const mobile = String(body.mobile || '').trim();
    const name = String(body.name || '').trim();
    const nameHindi = body.name_hindi === undefined || body.name_hindi === null ? null : String(body.name_hindi).trim() || null;

    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const namePair = await fillBilingualPair(name, nameHindi);
    const orgNamePair = await fillBilingualPair(body.organization_name, body.organization_name_hindi);
    const addressPair = await fillBilingualPair(body.address, body.address_hindi);

    let userId = body.user_id ? parseIntSafe(body.user_id) : null;
    let user = null;

    if (userId) {
      user = await User.findByPk(userId, { paranoid: false });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const existingType = (user.user_type || '').toString().toLowerCase();
      if (user.profile_completed_at) {
        return res.status(409).json({ success: false, message: 'Mobile already exist' });
      }
      if (existingType && existingType !== 'employer') {
        return res.status(409).json({ success: false, message: 'Mobile already exist' });
      }

      if (mobile && user.mobile !== mobile) await user.update({ mobile });
      if (!user.user_type) await user.update({ user_type: 'employer' });
      if ((!user.name || !String(user.name).trim()) && namePair.english) {
        await user.update({ name: namePair.english, name_hindi: namePair.hindi || null });
      } else if ((!user.name_hindi || !String(user.name_hindi).trim()) && namePair.hindi) {
        await user.update({ name_hindi: namePair.hindi });
      }

      const existingEmployer = await Employer.findOne({ where: { user_id: user.id }, paranoid: false });
      if (existingEmployer) {
        return res.status(400).json({ success: false, message: 'Employer record already exists for this user' });
      }
    } else {
      if (!mobile) return res.status(400).json({ success: false, message: 'mobile is required when user is not pre-selected' });
      user = await User.findOne({ where: { mobile }, paranoid: false });
      if (!user) {
        user = await User.create({ mobile, name: namePair.english || null, name_hindi: namePair.hindi, user_type: 'employer' });
      } else {
        const existingType = (user.user_type || '').toString().toLowerCase();
        if (user.profile_completed_at) {
          return res.status(409).json({ success: false, message: 'Mobile already exist' });
        }
        if (existingType && existingType !== 'employer') {
          return res.status(409).json({ success: false, message: 'Mobile already exist' });
        }
        if (user.deleted_at) await user.restore();
        if (!user.user_type) await user.update({ user_type: 'employer' });
        if ((!user.name || !String(user.name).trim()) && namePair.english) {
          await user.update({ name: namePair.english, name_hindi: namePair.hindi || null });
        } else if ((!user.name_hindi || !String(user.name_hindi).trim()) && namePair.hindi) {
          await user.update({ name_hindi: namePair.hindi });
        }
      }
      userId = user.id;

      const existingEmployer = await Employer.findOne({ where: { user_id: userId }, paranoid: false });
      if (existingEmployer) {
        return res.status(400).json({ success: false, message: 'Employer record already exists for this user' });
      }
    }

    const attrs = stripUndefined(buildEmployerAttributes(body));
    attrs.user_id = userId;
    attrs.name = namePair.english;
    attrs.name_hindi = namePair.hindi;
    if (orgNamePair.english !== null || orgNamePair.hindi !== null) {
      attrs.organization_name = orgNamePair.english;
      attrs.organization_name_hindi = orgNamePair.hindi;
    }
    if (addressPair.english !== null || addressPair.hindi !== null) {
      attrs.address = addressPair.english;
      attrs.address_hindi = addressPair.hindi;
    }
    if (!attrs.verification_status) attrs.verification_status = 'pending';

    const employer = await Employer.create(attrs);

    // Stamp when the employer profile is created.
    if (user && !user.profile_completed_at) {
      await user.update({ profile_completed_at: new Date() });
    }


    const include = [...baseInclude];
    ensureUserInclude(include);
    const created = await Employer.findByPk(employer.id, { include, paranoid: true });

    await safeLog(req, {
      category: 'employer',
      type: 'add',
      redirect_to: employerRedirect(created?.id || employer.id),
      log_text: `Employer created: #${created?.id || employer.id} ${created?.name || name || '-'}`,
    });

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    const status = err?.status && Number.isFinite(err.status) ? err.status : 500;
    console.error('[employers] create error:', err);
    res.status(status).json({ success: false, message: err.message || 'Failed to create employer' });
  }
});

/**
 * PUT /employers/:id
 * Update employer (also updates linked User.mobile if provided).
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const employer = await Employer.findByPk(employerId, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const body = req.body || {};
    const mobile = String(body.mobile || '').trim();
    if (mobile) {
      const user = await User.findByPk(employer.user_id, { paranoid: false });
      if (user && mobile !== user.mobile) {
        const existingMobileUser = await User.findOne({ where: { mobile }, paranoid: false });
        if (existingMobileUser && existingMobileUser.id !== user.id) {
          return res.status(409).json({ success: false, message: 'Mobile already exist' });
        }
        await user.update({ mobile });
      }
    }

    const attrs = stripUndefined(buildEmployerAttributes(body));

    const wantsName = Object.prototype.hasOwnProperty.call(body || {}, 'name')
      || Object.prototype.hasOwnProperty.call(body || {}, 'name_hindi');
    if (wantsName) {
      await applyBilingualPairFromBody({ body, payload: attrs, englishKey: 'name', hindiKey: 'name_hindi', existing: employer });
    }

    const wantsOrgName = Object.prototype.hasOwnProperty.call(body || {}, 'organization_name')
      || Object.prototype.hasOwnProperty.call(body || {}, 'organization_name_hindi');
    if (wantsOrgName) {
      await applyBilingualPairFromBody({ body, payload: attrs, englishKey: 'organization_name', hindiKey: 'organization_name_hindi', existing: employer });
    }

    const wantsAddress = Object.prototype.hasOwnProperty.call(body || {}, 'address')
      || Object.prototype.hasOwnProperty.call(body || {}, 'address_hindi');
    if (wantsAddress) {
      await applyBilingualPairFromBody({ body, payload: attrs, englishKey: 'address', hindiKey: 'address_hindi', existing: employer });
    }

    const creditValidationError = validateEmployerCreditState(employer, attrs);
    if (creditValidationError) {
      return res.status(400).json({ success: false, message: creditValidationError });
    }

    await employer.update(attrs);

    const include = [...baseInclude];
    ensureUserInclude(include);
    const updated = await Employer.findByPk(employer.id, { include, paranoid: true });

    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(updated?.id || employer.id),
      log_text: `Employer updated: #${updated?.id || employer.id} ${updated?.name || attrs.name || '-'}`,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[employers] update error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update employer' });
  }
});

/**
 * DELETE /employers/:id
 * Soft delete employer.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const employerId = Number(req.params.id);
    const employer = employerId ? await Employer.findByPk(employerId, { paranoid: false }) : null;
    await deleteByEmployerId(req.params.id, { deletedByAdminId: adminId ? Number(adminId) : undefined });
    await safeLog(req, {
      category: 'employer',
      type: 'delete',
      redirect_to: '/employers',
      log_text: `Employer deleted: #${employerId || req.params.id} ${employer?.name || '-'}`
    });
    res.json({ success: true, message: 'Employer deleted' });
  } catch (err) {
    console.error('[employers] delete error:', err);
    const status = err?.status && Number.isFinite(err.status) ? err.status : 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to delete employer' });
  }
});

/**
 * GET /employers/:id/applicants
 * List applicants who interacted with the employer’s jobs.
 */
router.get('/:id/applicants', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    // Get all jobs for this employer
    const jobs = await Job.findAll({
      where: { employer_id: employerId },
      attributes: ['id', 'job_profile_id', 'status'],
      paranoid: false
    });

    const jobIds = jobs.map(j => j.id).filter(Boolean);
    if (!jobIds.length) return res.json({ success: true, data: [] });

    // Map jobId -> job meta
    const jobMetaMap = {};
    jobs.forEach(j => {
      jobMetaMap[j.id] = { job_profile_id: j.job_profile_id, status: j.status };
    });

    // Get all job_interests for these jobs
    const interests = await JobInterest.findAll({
      where: { job_id: jobIds },
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    // Collect employee IDs
    const employeeIdSet = new Set();
    interests.forEach(i => {
      if (i.sender_type === 'employee' && i.sender_id) employeeIdSet.add(i.sender_id);
      if (i.sender_type === 'employer' && i.receiver_id) employeeIdSet.add(i.receiver_id);
    });

    // Get all employees in bulk (join User for phone + active status)
    const employeeIds = [...employeeIdSet];
    let employeesMap = {};
    if (employeeIds.length) {
      const employees = await Employee.findAll({
        where: { id: employeeIds },
        include: [
          { model: User, as: 'User', attributes: ['id', 'mobile', 'is_active'], paranoid: false, required: false },
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
          gender: emp.gender,
          verification_status: emp.verification_status,
          kyc_status: emp.kyc_status,
          expected_salary: emp.expected_salary,
          PreferredState: emp.PreferredState,
          PreferredCity: emp.PreferredCity,
          JobProfiles: jobProfiles,
          mobile: emp.User?.mobile || null,
          is_active: emp.User?.is_active
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
      const employee_id = i.sender_type === 'employee' ? i.sender_id : i.receiver_id;
      const employee = employee_id && employeesMap[employee_id] ? employeesMap[employee_id] : undefined;

      const job_id = i.job_id;
      const meta = job_id ? jobMetaMap[job_id] : null;
      const job_profile_id = meta?.job_profile_id;
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
        job_status: meta?.status || null,
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
 * GET /employers/:id/shortlisted-candidates
 * List shortlisted candidates for an employer from employer_shortlisted_candidates.
 */
router.get('/:id/shortlisted-candidates', authenticate, async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const rows = await EmployerShortlistedCandidate.findAll({
      where: { employer_id: employerId },
      attributes: ['id', 'employer_id', 'employee_id', 'created_at', 'updated_at'],
      include: [
        {
          model: Employee,
          as: 'Employee',
          required: true,
          attributes: [
            'id',
            'user_id',
            'name',
            'gender',
            'verification_status',
            'kyc_status',
            'expected_salary',
            'expected_salary_frequency'
          ],
          include: [
            { model: User, as: 'User', attributes: ['id', 'mobile', 'is_active'], required: false, paranoid: false },
            { model: State, as: 'PreferredState', attributes: ['id', 'state_english'], required: false },
            { model: City, as: 'PreferredCity', attributes: ['id', 'city_english'], required: false },
            {
              model: EmployeeJobProfile,
              as: 'EmployeeJobProfiles',
              attributes: ['job_profile_id'],
              required: false,
              paranoid: true,
              include: [
                {
                  model: JobProfile,
                  as: 'JobProfile',
                  attributes: ['id', 'profile_english', 'profile_hindi'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      order: [['updated_at', 'DESC'], ['created_at', 'DESC']],
    });

    const data = rows.map((row) => {
      const shortlist = row.toJSON ? row.toJSON() : row;
      const employee = shortlist.Employee || {};
      const jobProfiles = Array.isArray(employee.EmployeeJobProfiles)
        ? employee.EmployeeJobProfiles
            .filter((entry) => entry && entry.JobProfile)
            .map((entry) => ({
              id: entry.job_profile_id,
              profile_english: entry.JobProfile.profile_english,
              profile_hindi: entry.JobProfile.profile_hindi,
            }))
        : [];

      return {
        id: shortlist.id,
        employee_id: employee.id || shortlist.employee_id,
        shortlisted_at: shortlist.updated_at || shortlist.created_at,
        employee: {
          id: employee.id || shortlist.employee_id,
          name: employee.name || null,
          mobile: employee.User?.mobile || null,
          is_active: employee.User?.is_active ?? null,
          gender: employee.gender || null,
          verification_status: employee.verification_status || null,
          kyc_status: employee.kyc_status || null,
          expected_salary: employee.expected_salary ?? null,
          expected_salary_frequency: employee.expected_salary_frequency || null,
          preferred_state: employee.PreferredState?.state_english || null,
          preferred_city: employee.PreferredCity?.city_english || null,
          job_profiles: jobProfiles,
        },
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/shortlisted-candidates] error:', err);
    return res.status(500).json({ success: false, message: err.message });
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

    // CONTACT credits
    const employeeIds = [...new Set(contacts.map(c => c.employee_id).filter(Boolean))];
    const callHistoryIds = [...new Set(contacts.map(c => c.call_experience_id).filter(Boolean))];

    const employees = employeeIds.length
      ? await Employee.findAll({
          where: { id: employeeIds },
          include: [{ model: User, as: 'User', attributes: ['id', 'mobile'], required: false, paranoid: false }],
          paranoid: false
        })
      : [];

    const employeeMap = {};
    employees.forEach(e => { employeeMap[e.id] = e; });

    // employer_contacts.call_experience_id references call_histories.id
    const callHistories = callHistoryIds.length
      ? await CallHistory.findAll({
          where: {
            id: callHistoryIds,
            user_type: 'employer'
          },
          paranoid: false
        })
      : [];

    const callHistoryMap = {};
    const experienceIds = [...new Set(callHistories.map(ch => ch.call_experience_id).filter(Boolean))];
    callHistories.forEach(ch => { callHistoryMap[ch.id] = ch; });

    const experienceMap = {};
    if (experienceIds.length && EmployerCallExperience) {
      const experiences = await EmployerCallExperience.findAll({
        where: { id: experienceIds },
        paranoid: false
      });
      experiences.forEach(exp => { experienceMap[exp.id] = exp; });
    }

    const contactData = contacts.map(c => {
      const emp = employeeMap[c.employee_id];
      const user = emp?.User;
      const callHistory = c.call_experience_id ? callHistoryMap[c.call_experience_id] : null;
      const experience = callHistory?.call_experience_id ? experienceMap[callHistory.call_experience_id] : null;

      return {
        type: 'contact',
        amount: c.closing_credit ?? '-',
        employee_id: c.employee_id,
        employee_name: emp?.name ?? '-',
        verification_status: emp?.verification_status ?? '-',
        kyc_status: emp?.kyc_status ?? '-',
        mobile: user?.mobile ?? '-',
        call_experience: experience?.experience_english || experience?.experience_hindi || '-',
        review: callHistory?.review || '-',
        date: c.created_at,
      };
    });

    // INTEREST credits (based on job_interests sent by this employer)
    const interests = await JobInterest.findAll({
      where: {
        sender_type: 'employer',
        sender_id: employerId
      },
      order: [['created_at', 'DESC']],
      paranoid: true
    });

    const interestJobIds = [...new Set(interests.map(i => i.job_id).filter(Boolean))];
    const interestEmployeeIds = [...new Set(interests.map(i => i.receiver_id).filter(Boolean))];

    const jobs = interestJobIds.length
      ? await Job.findAll({
          where: { id: interestJobIds },
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'], required: false }],
          paranoid: false
        })
      : [];

    const jobsMap = {};
    jobs.forEach(j => { jobsMap[j.id] = j; });

    const interestEmployees = interestEmployeeIds.length
      ? await Employee.findAll({
          where: { id: interestEmployeeIds },
          attributes: ['id', 'name'],
          include: [{ model: User, as: 'User', attributes: ['mobile'], required: false, paranoid: false }],
          paranoid: false
        })
      : [];

    const interestEmployeesMap = {};
    interestEmployees.forEach(e => { interestEmployeesMap[e.id] = e; });

    const interestData = interests.map(i => {
      const job = jobsMap[i.job_id];
      const emp = interestEmployeesMap[i.receiver_id];
      if (!job || !emp) return null;

      return {
        type: 'interest',
        amount: 1,

        job_id: job.id,
        employer_id: employerId,
        employee_id: emp.id,

        job_profile: job.JobProfile?.profile_english || job.JobProfile?.profile_hindi || '-',
        employee_name: emp.name || '-',
        employee_mobile: emp.User?.mobile || null,
        employee_phone: emp.User?.mobile || null,

        job_status: job.status || null,
        job_interest_status: i.status || null,

        created_at: i.created_at,
        date: i.created_at,
      };
    }).filter(Boolean);

    res.json({ success: true, data: [...contactData, ...interestData] });
  } catch (err) {
    console.error('[employers/:id/credit-history] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /employers/:id/manual-credit-history
 * List manual credits added by admins.
 */
router.get('/:id/manual-credit-history', authenticate, async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const rows = await ManualCreditHistory.findAll({
      where: { user_type: 'employer', user_id: employerId },
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
      reason: r.reason || null,
      admin_id: r.admin_id,
      admin_name: r.admin_id ? (adminMap.get(r.admin_id) || null) : null,
      created_at: r.created_at,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/manual-credit-history] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
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
    const callExperienceIds = [...new Set(histories.map(h => h.call_experience_id).filter(Boolean))];

    // Map call_experience_id -> experience row
    let expMap = {};
    if (callExperienceIds.length) {
      const exps = await EmployerCallExperience.findAll({
        where: { id: callExperienceIds },
        paranoid: false
      });
      exps.forEach(e => { expMap[e.id] = e; });
    }

    // Map call_history.id -> EmployerContact (which stores employee_id)
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
      const contact = contactsMap[h.id] || null;
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
        employee_name: employee?.name || '-',
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
        attributes: ['id', 'status'],
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
        job_status: job?.status || null,
        reason_english: reason?.reason_english || '-',
        reason_hindi: reason?.reason_hindi || '',
        description: r.description || '',
        read_at: r.read_at,
        created_at: r.created_at,
        // Include full objects for frontend convenience
        user: employee ? { id: employee.id, name: employee.name } : null,
        reported_entity: job ? {
          id: job.id,
          status: job.status || null,
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
 * GET /employers/:id/contacts-unlocked
 * Show contacts unlocked by the employer via employer_contacts.
 */
router.get('/:id/contacts-unlocked', async (req, res) => {
  try {
    const employerId = parseInt(req.params.id, 10);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const employer = await Employer.findByPk(employerId, { attributes: ['id'], paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const contacts = await EmployerContact.findAll({
      where: { employer_id: employerId },
      paranoid: false,
      order: [['created_at', 'DESC']]
    });

    if (!contacts.length) return res.json({ success: true, data: [] });

    const employeeIds = [...new Set(contacts.map((c) => c.employee_id).filter(Boolean))];

    const employees = employeeIds.length
      ? await Employee.findAll({
          where: { id: employeeIds },
          attributes: ['id', 'name', 'verification_status', 'kyc_status'],
          include: [
            { model: User, as: 'User', attributes: ['id', 'name', 'mobile'], required: false, paranoid: false },
            { model: City, as: 'City', attributes: ['city_english', 'city_hindi'], required: false },
            { model: State, as: 'State', attributes: ['state_english', 'state_hindi'], required: false },
          ],
          paranoid: false
        })
      : [];
    const employeeMap = Object.fromEntries(employees.map((row) => [row.id, row]));

    const employeeJobProfiles = employeeIds.length
      ? await EmployeeJobProfile.findAll({
          where: { employee_id: employeeIds },
          attributes: ['employee_id', 'job_profile_id'],
          include: [{ model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'], required: false }],
          paranoid: false,
          order: [['id', 'ASC']]
        })
      : [];

    const jobProfileMap = new Map();
    employeeJobProfiles.forEach((row) => {
      const key = row.employee_id;
      const label = row.JobProfile?.profile_english || row.JobProfile?.profile_hindi || null;
      if (!key || !label) return;
      const existing = jobProfileMap.get(key) || [];
      if (!existing.includes(label)) existing.push(label);
      jobProfileMap.set(key, existing);
    });

    const data = contacts.map((contact) => {
      const employeeRow = employeeMap[contact.employee_id];
      return {
        id: contact.id,
        employer_contact_id: contact.id,
        employee_id: contact.employee_id,
        employee_name: employeeRow?.name || employeeRow?.User?.name || '-',
        employee_mobile: employeeRow?.User?.mobile || null,
        verification_status: employeeRow?.verification_status || null,
        kyc_status: employeeRow?.kyc_status || null,
        current_city: employeeRow?.City?.city_english || employeeRow?.City?.city_hindi || null,
        current_state: employeeRow?.State?.state_english || employeeRow?.State?.state_hindi || null,
        employee_job_profiles: jobProfileMap.get(contact.employee_id) || [],
        closing_credit: contact.closing_credit ?? null,
        created_at: contact.created_at,
        updated_at: contact.updated_at,
        deleted_at: contact.deleted_at,
        is_active: !contact.deleted_at,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[employers/:id/contacts-unlocked] error:', err);
    return res.status(500).json({ success: false, message: err.message });
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

const handleEmployerStatusMutation = async (req, res, field, value, message, extraPayload = null) => {
  try {
    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const prevValue = String(employer?.[field] || '').trim().toLowerCase();

    const adminId = getAdminId(req);
    const payload = { ...(extraPayload || {}), [field]: value };

    if (field === 'verification_status') {
      payload.verification_at = (value === 'verified' || value === 'rejected') ? new Date() : null;
      if (adminId) payload.status_changed_by = adminId;
    }
    if (field === 'kyc_status') {
      payload.kyc_verification_at = (value === 'verified' || value === 'rejected') ? new Date() : null;
    }

    await employer.update(payload);

    const statusLabel = field === 'verification_status' ? 'verification' : field === 'kyc_status' ? 'kyc' : field;
    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer ${statusLabel} updated: #${employer.id} ${employer.name || '-'} -> ${value}`,
    });

    const nextValue = String(value || '').trim().toLowerCase();
    if (prevValue !== nextValue && (nextValue === 'verified' || nextValue === 'rejected')) {
      // Fire-and-forget system notification
      notifyEmployerStatusChange({
        employerId: employer.id,
        field,
        nextValue: nextValue,
      }).catch((err) => {
        console.error('[employers] notifyEmployerStatusChange failed', err);
      });
    }

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
router.post('/:id/activate', authenticate, async (req, res) => {
  try {
    const employerId = Number(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const employer = await Employer.findByPk(employerId);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const user = await User.findByPk(employer.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

    await user.update({
      is_active: true,
      deactivation_reason: null,
      status_change_by: getAdminId(req),
    });

    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer activated: #${employer.id} ${employer.name || '-'}`,
    });

    return res.json({ success: true, message: 'Employer activated', data: { user_id: user.id, employer_id: employer.id } });
  } catch (error) {
    console.error('[employers:activate] error', error);
    return res.status(500).json({ success: false, message: error.message || 'Activate failed' });
  }
});

/**
 * POST /employers/:id/deactivate
 * Deactivate an employer’s user account.
 */
router.post('/:id/deactivate', authenticate, async (req, res) => {
  try {
    const employerId = Number(req.params.id);
    if (!employerId) return res.status(400).json({ success: false, message: 'Invalid employer id' });

    const reason = (req.body?.deactivation_reason || '').toString().trim();
    if (!reason) return res.status(400).json({ success: false, message: 'deactivation_reason is required' });

    const employer = await Employer.findByPk(employerId);
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const user = await User.findByPk(employer.user_id, { paranoid: false });
    if (!user) return res.status(404).json({ success: false, message: 'Linked user not found' });

    await user.update({
      is_active: false,
      deactivation_reason: reason,
      status_change_by: getAdminId(req),
    });

    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer deactivated: #${employer.id} ${employer.name || '-'} reason=${reason}`,
    });

    return res.json({ success: true, message: 'Employer deactivated', data: { user_id: user.id, employer_id: employer.id } });
  } catch (error) {
    console.error('[employers:deactivate] error', error);
    return res.status(500).json({ success: false, message: error.message || 'Deactivate failed' });
  }
});

/**
 * POST /employers/:id/approve
 * Mark an employer’s verification status as verified.
 */
router.post('/:id/approve', authenticate, (req, res) =>
  handleEmployerStatusMutation(req, res, 'verification_status', 'verified', 'Verification marked as verified')
);

/**
 * POST /employers/:id/reject
 * Mark an employer’s verification as rejected.
 */
router.post('/:id/reject', authenticate, (req, res) =>
  handleEmployerStatusMutation(req, res, 'verification_status', 'rejected', 'Verification rejected')
);

/**
 * POST /employers/:id/kyc/grant
 * Approve KYC for an employer.
 */
router.post('/:id/kyc/grant', authenticate, (req, res) =>
  handleEmployerStatusMutation(req, res, 'kyc_status', 'verified', 'KYC marked as verified')
);

/**
 * POST /employers/:id/kyc/reject
 * Reject KYC for an employer.
 */
router.post('/:id/kyc/reject', authenticate, (req, res) =>
  handleEmployerStatusMutation(
    req,
    res,
    'kyc_status',
    'rejected',
    'KYC rejected',
    {
      document_link: null,
    }
  )
);

/**
 * POST /employers/:id/change-subscription
 * Switch an employer to a different subscription plan.
 */
router.post('/:id/change-subscription', authenticate, async (req, res) => {
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


    await safeLog(req, {
      category: 'employer subscription',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer subscription changed: #${employer.id} ${employer.name || '-'} plan=${plan.plan_name_english || plan.plan_name_hindi || plan.id}`,
    });
    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer subscription changed: #${employer.id} ${employer.name || '-'} plan=${plan.plan_name_english || plan.plan_name_hindi || plan.id}`,
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
router.post('/:id/add-credits', authenticate, async (req, res) => {
  try {
    const contactDelta = Number(req.body?.contact_credits) || 0;
    const interestDelta = Number(req.body?.interest_credits) || 0;
    const adDelta = Number(req.body?.ad_credits) || 0;
    const reason = (req.body?.reason || '').toString().trim();
    if (contactDelta <= 0 && interestDelta <= 0 && adDelta <= 0) {
      return res.status(400).json({ success: false, message: 'Provide credits to add' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const employer = await Employer.findByPk(req.params.id, { paranoid: false });
    if (!employer) return res.status(404).json({ success: false, message: 'Employer not found' });

    const now = new Date();
    const currentExpiry = employer.credit_expiry_at ? new Date(employer.credit_expiry_at) : null;
    const hasActiveCredits = Boolean(currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now);

    const nextContact = hasActiveCredits
      ? Number(employer.contact_credit || 0) + Math.max(contactDelta, 0)
      : Math.max(contactDelta, 0);
    const nextInterest = hasActiveCredits
      ? Number(employer.interest_credit || 0) + Math.max(interestDelta, 0)
      : Math.max(interestDelta, 0);
    const nextAd = hasActiveCredits
      ? Number(employer.ad_credit || 0) + Math.max(adDelta, 0)
      : Math.max(adDelta, 0);

    const updatePayload = {
      total_contact_credit: hasActiveCredits
        ? Number(employer.total_contact_credit || 0) + Math.max(contactDelta, 0)
        : Math.max(contactDelta, 0),
      contact_credit: nextContact,
      total_interest_credit: hasActiveCredits
        ? Number(employer.total_interest_credit || 0) + Math.max(interestDelta, 0)
        : Math.max(interestDelta, 0),
      interest_credit: nextInterest,
      total_ad_credit: hasActiveCredits
        ? Number(employer.total_ad_credit || 0) + Math.max(adDelta, 0)
        : Math.max(adDelta, 0),
      ad_credit: nextAd,
    };

    if (req.body?.credit_expiry_at) {
      updatePayload.credit_expiry_at = req.body.credit_expiry_at;
    }

    await employer.update(updatePayload);

    await safeCreateManualCreditHistory({
      user_type: 'employer',
      user_id: employer.id,
      contact_credit: Math.max(contactDelta, 0),
      interest_credit: Math.max(interestDelta, 0),
      ad_credit: Math.max(adDelta, 0),
      expiry_date: req.body?.credit_expiry_at || null,
      reason,
      admin_id: getAdminId(req) || null,
    });

    await safeLog(req, {
      category: 'employer subscription',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer credits added: #${employer.id} ${employer.name || '-'} contact=${contactDelta} interest=${interestDelta} ad=${adDelta} reason=${reason}`,
    });
    await safeLog(req, {
      category: 'employer',
      type: 'update',
      redirect_to: employerRedirect(employer.id),
      log_text: `Employer credits added: #${employer.id} ${employer.name || '-'} contact=${contactDelta} interest=${interestDelta} ad=${adDelta} reason=${reason}`,
    });

    const linkedUser = await User.findByPk(employer.user_id, {
      paranoid: false,
      attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
    });

    if (linkedUser) {
      const creditMessage = buildEmployerCreditMessage({
        contactDelta: Math.max(contactDelta, 0),
        interestDelta: Math.max(interestDelta, 0),
        adDelta: Math.max(adDelta, 0),
      });
      {
        const tpl = getNotificationTemplate('employer.credit.added', { credits: creditMessage.bodyEnglish });
        await notifyUser({
          user: linkedUser,
          titleEnglish: tpl?.title_en || 'Credits Added',
          titleHindi:   tpl?.title_hi || 'Credits Add Ho Gaye!',
          bodyEnglish: creditMessage.bodyEnglish,
          bodyHindi:   creditMessage.bodyHindi,
          referenceType: 'employer_credit',
          referenceId: employer.id,
          extraData: {
            event: 'employer.credit.added',
            entity: 'employer',
            entity_id: String(employer.id),
          },
        });
      }
    }

    res.json({
      success: true,
      message: 'Credits updated',
      data: {
        total_contact_credit: employer.total_contact_credit,
        contact_credit: employer.contact_credit,
        total_interest_credit: employer.total_interest_credit,
        interest_credit: employer.interest_credit,
        total_ad_credit: employer.total_ad_credit,
        ad_credit: employer.ad_credit,
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
          include: [
            { model: User, as: 'User', attributes: ['id', 'is_active'], paranoid: false, required: false }
          ],
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
        employee_is_active: employee?.User?.is_active ?? null,
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
