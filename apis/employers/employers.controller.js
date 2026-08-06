const { sendApiResponse, isTruthyEnv } = require("../_helpers/response");

const { sequelize } = require("../../config/db");

const Sequelize = require("sequelize");
const { Op } = Sequelize;

const Employer = require("../../models/Employer");
const State = require("../../models/State");
const City = require("../../models/City");
const EmployerSubscriptionPlan = require("../../models/EmployerSubscriptionPlan");
const PlanBenefit = require("../../models/PlanBenefit");
const BusinessCategory = require("../../models/BusinessCategory");

const EmployerContact = require("../../models/EmployerContact");

const PaymentHistory = require("../../models/PaymentHistory");
const { sendOtp: sendTwoFactorOtp, verifyOtp: verifyTwoFactorOtp } = require('../../utils/twoFactor');
const { generateAadhaarOtp, verifyAadhaarOtp: verifyAadhaarOtpApi, namesMatch } = require('../../utils/quickeKyc');
const {
  createSubscriptionOrder,
  getSubscriptionPaymentStatus,
} = require('../../utils/cashfreeSubscriptionPayments');
const {
  findAllWithOptionalAttribute,
  findByPkWithOptionalAttribute,
} = require('../../utils/optionalDiscountedPrice');

const {JobInterest, Job, Employee, JobProfile, SalaryType, User, JobSkill, JobExperience, JobGender, JobQualification, JobShift, SelectedJobBenefit, JobDay, EmployeeJobProfile, Shift} = require("../../models");
const { applyBilingualPairFromBody, normalizeNullableText } = require('../../utils/bilingual');
const {
  fetchWelcomeCreditSettings,
  buildEmployerWelcomeCredits,
} = require('../../utils/welcomeCredits');
const { notifyUser } = require('../../utils/userNotifications');
const { sendToUser } = require('../../utils/systemNotifications');

const SUCCESS_CODE = "SC_01";

function extractMissingColumnName(error) {
  const message = String(
    error?.original?.sqlMessage
    || error?.original?.message
    || error?.parent?.sqlMessage
    || error?.parent?.message
    || error?.message
    || ''
  );

  // MySQL: Unknown column 'x' in 'field list'
  let match = message.match(/Unknown column\s+'([^']+)'/i);
  if (match) return match[1];

  // Postgres: column "x" of relation "y" does not exist
  match = message.match(/column\s+\"([^\"]+)\"\s+.*does not exist/i);
  if (match) return match[1];

  return null;
}

async function updateInstanceWithMissingColumnRetry(instance, payload, { maxRetries = 3, transaction } = {}) {
  const nextPayload = { ...(payload || {}) };
  const opts = transaction ? { transaction } : {};

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await instance.update(nextPayload, opts);
      return { ok: true, payload: nextPayload, stripped: attempt > 0 };
    } catch (error) {
      const missingColumn = extractMissingColumnName(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
        delete nextPayload[missingColumn];
        continue;
      }
      throw error;
    }
  }

  // Should never reach here.
  await instance.update(nextPayload);
  return { ok: true, payload: nextPayload, stripped: true };
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function stripOrderIdPrefix(orderId) {
  if (!orderId) return orderId || null;
  return String(orderId).replace(/^sub_(?:employee|employer)_\d+_/, '') || null;
}

async function getPlanBenefitsByPlanId(subscriptionType, planIds) {
  const ids = [...new Set((Array.isArray(planIds) ? planIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const benefits = await PlanBenefit.findAll({
    where: {
      subscription_type: subscriptionType,
      plan_id: { [Op.in]: ids },
      is_active: true,
    },
    paranoid: true,
    attributes: ['id', 'plan_id', 'benefit_english', 'benefit_hindi', 'sequence', 'is_active', 'created_at', 'updated_at'],
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  const grouped = new Map();
  for (const row of benefits || []) {
    const benefit = row?.toJSON ? row.toJSON() : row;
    const key = Number(benefit?.plan_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(benefit);
  }

  return grouped;
}

async function getJobProfileLabelsForNotification(jobId) {
  const job = await Job.findByPk(jobId, {
    attributes: ['id'],
    include: [{
      model: JobProfile,
      as: 'JobProfile',
      attributes: ['profile_english', 'profile_hindi'],
      required: false,
    }],
    paranoid: false,
  });

  return {
    english: job?.JobProfile?.profile_english || job?.JobProfile?.profile_hindi || 'job',
    hindi: job?.JobProfile?.profile_hindi || job?.JobProfile?.profile_english || 'जॉब',
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeIndianMobile10(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
}

async function maybeVerifyEmployerKyc(employerInstance) {
  if (!employerInstance) return;

  const employer = employerInstance;
  const hasAadhar = Boolean(employer.aadhar_verified_at);
  const hasDocument = Boolean(employer.document_link);
  const current = String(employer.kyc_status || '').trim().toLowerCase();

  if (hasAadhar && current !== 'verified') {
    await employer.update({
      kyc_status: 'verified',
      kyc_verification_at: new Date(),
    });
    return;
  }

  if (!hasAadhar && hasDocument && current !== 'pending') {
    await employer.update({
      kyc_status: 'pending',
      kyc_verification_at: null,
    });
  }
}

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const USE_TRANSLATION_MOCK = process.env.TRANSLATE_USE_MOCK !== 'false';

function parseIdList(value) {
  if (value === null || value === undefined || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const parts = typeof v === 'string' ? v.split(',') : [String(v)];
    for (const partRaw of parts) {
      const part = String(partRaw || '').trim();
      if (!part) continue;
      const n = Number(part);
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

function parseStringList(value) {
  if (value === null || value === undefined || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const parts = typeof v === 'string' ? v.split(',') : [String(v)];
    for (const partRaw of parts) {
      const part = String(partRaw || '').trim();
      if (!part) continue;
      out.push(part);
    }
  }
  return Array.from(new Set(out));
}

function normalizeGender(value) {
  const g = String(value || '').trim().toLowerCase();
  if (!g) return null;
  if (g === 'male' || g === 'female' || g === 'any' || g === 'other') return g;
  return g;
}

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

const DEVANAGARI_RE = /[ऀ-ॿ]/;
function detectLanguage(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  return DEVANAGARI_RE.test(s) ? 'hi' : 'en';
}

async function translateText(text, sourceLanguage, targetLanguage) {
  const input = String(text || '').trim();
  if (!input) return '';

  if (USE_TRANSLATION_MOCK) {
    const suffix = targetLanguage === 'hi' ? ' (हिंदी)' : targetLanguage === 'en' ? ' (English)' : ` (${targetLanguage})`;
    return `${input}${suffix}`;
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_TRANSLATE_API_KEY is not configured');

  const url = new URL(GOOGLE_TRANSLATE_URL);
  url.search = new URLSearchParams({
    key: apiKey,
    q: input,
    source: sourceLanguage,
    target: targetLanguage,
    format: 'text',
  }).toString();

  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) throw new Error(`Translate API responded with ${response.status}`);

  const payload = await response.json();
  return payload?.data?.translations?.[0]?.translatedText || '';
}

async function fillBilingualPair(englishValue, hindiValue) {
  const enRaw = String(englishValue ?? '').trim();
  const hiRaw = String(hindiValue ?? '').trim();

  const hasEn = !!enRaw;
  const hasHi = !!hiRaw;

  if (hasEn && hasHi) {
    const enLang = detectLanguage(enRaw);
    const hiLang = detectLanguage(hiRaw);
    if (enLang === 'hi' && hiLang === 'en') {
      return { english: hiRaw, hindi: enRaw };
    }
    return { english: enRaw, hindi: hiRaw };
  }

  const provided = hasEn ? enRaw : hasHi ? hiRaw : '';
  if (!provided) return { english: null, hindi: null };

  const source = detectLanguage(provided) || (hasHi ? 'hi' : 'en');
  if (source === 'hi') {
    const translated = await translateText(provided, 'hi', 'en');
    return { english: translated || null, hindi: provided };
  }

  const translated = await translateText(provided, 'en', 'hi');
  return { english: provided, hindi: translated || null };
}

async function applyJobBilingualFields(jobPayload) {
  const jd = await fillBilingualPair(jobPayload.job_designation_english, jobPayload.job_designation_hindi);
  const d = await fillBilingualPair(jobPayload.description_english, jobPayload.description_hindi);
  const a = await fillBilingualPair(jobPayload.job_address_english, jobPayload.job_address_hindi);
  const b = await fillBilingualPair(jobPayload.other_benefit_english, jobPayload.other_benefit_hindi);

  if (jd.english !== null || jd.hindi !== null) {
    jobPayload.job_designation_english = jd.english;
    jobPayload.job_designation_hindi = jd.hindi;
  }
  if (d.english !== null || d.hindi !== null) {
    jobPayload.description_english = d.english;
    jobPayload.description_hindi = d.hindi;
  }
  if (a.english !== null || a.hindi !== null) {
    jobPayload.job_address_english = a.english;
    jobPayload.job_address_hindi = a.hindi;
  }
  if (b.english !== null || b.hindi !== null) {
    jobPayload.other_benefit_english = b.english;
    jobPayload.other_benefit_hindi = b.hindi;
  }

  return jobPayload;
}


function buildEmployerInclude() {
  return [
    { model: State, as: "State", attributes: ["id", "state_english", "state_hindi"] },
    { model: City, as: "City", attributes: ["id", "state_id", "city_english", "city_hindi"] },
    {
      model: EmployerSubscriptionPlan,
      as: "SubscriptionPlan",
      attributes: ["id", "plan_name_english", "plan_name_hindi", "plan_validity_days", "plan_price"],
    },
    { model: BusinessCategory, as: "BusinessCategory", attributes: ["id", "category_english", "category_hindi"] },
  ];
}

function pickFirstUploadedFile(req, fieldNames) {
  if (req?.file) return req.file;
  const files = req?.files || {};
  for (const name of fieldNames || []) {
    const arr = files?.[name];
    if (Array.isArray(arr) && arr.length) return arr[0];
  }
  return null;
}

function maskAadhar(aadharNumber) {
  const digits = String(aadharNumber || "").replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"X".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function getEmployerById(req, res) {
  try {
    const id = toInt(req.params?.id ?? req.params?.employerId);
    if (!id || id <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const employer = await Employer.findByPk(id, { include: buildEmployerInclude() });
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Employer not found", data: null });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer detail fetched successfully",
      data: { employer: employer.toJSON ? employer.toJSON() : employer },
    });
  } catch (error) {
    console.error("[app/employers/:id]", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: "Failed to fetch employer detail", data: null });
  }
}



async function getEmployerSubscriptions(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    if (!employerId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employer id is required",
        data: null,
      });
    }

    const employer = await Employer.findByPk(employerId, {
      paranoid: true,
      attributes: [
        "id",
        "subscription_plan_id",
        "credit_expiry_at",
        "total_contact_credit",
        "contact_credit",
        "total_interest_credit",
        "interest_credit",
        "total_ad_credit",
        "ad_credit",
        "created_at",
        "updated_at",
      ],
    });

    if (!employer) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Employer not found",
        data: null,
      });
    }

    const emp = employer?.toJSON ? employer.toJSON() : employer;

    const subscriptionPlanId = emp?.subscription_plan_id || null;
    const expiresAt = emp?.credit_expiry_at || null;
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const nowMs = Date.now();

    const hasPlan = Boolean(subscriptionPlanId);
    const isExpired = !expiryMs ? true : expiryMs < nowMs;
    const hasAnyCredits =
      Number(emp?.contact_credit || 0) > 0 ||
      Number(emp?.interest_credit || 0) > 0 ||
      Number(emp?.ad_credit || 0) > 0;

    const isPlanActive = hasPlan && !isExpired;
    const isCreditsActive = hasAnyCredits && !isExpired;
    const isActive = isPlanActive || isCreditsActive;

    const status = isActive
      ? "active"
      : (hasPlan || hasAnyCredits)
      ? (isExpired ? "expired" : "inactive")
      : "none";

    const activePlan = subscriptionPlanId
      ? await findByPkWithOptionalAttribute(EmployerSubscriptionPlan, subscriptionPlanId, {
          paranoid: false,
          attributes: [
            "id",
            "plan_name_english",
            "plan_name_hindi",
            "plan_validity_days",
            "plan_price",
            "discounted_price",
            "contact_credits",
            "interest_credits",
            "ad_credits",
            "plan_tagline_english",
            "plan_tagline_hindi",
            "is_active",
            "created_at",
            "updated_at",
            "deleted_at",
          ],
        })
      : null;

    const activePlanJson = activePlan ? (activePlan.toJSON ? activePlan.toJSON() : activePlan) : null;
    const activePlanName = activePlanJson
      ? activePlanJson.plan_name_english || activePlanJson.plan_name_hindi || null
      : null;

    const plans = await findAllWithOptionalAttribute(EmployerSubscriptionPlan, {
      where: { is_active: true },
      paranoid: true,
      attributes: [
        "id",
        "plan_name_english",
        "plan_name_hindi",
        "plan_validity_days",
        "plan_tagline_english",
        "plan_tagline_hindi",
        "plan_price",
        "discounted_price",
        "contact_credits",
        "interest_credits",
        "ad_credits",
        "sequence",
        "is_active",
        "created_at",
        "updated_at",
      ],
      order: [
        ["sequence", "ASC"],
        ["id", "ASC"],
      ],
    });

    const benefitMap = await getPlanBenefitsByPlanId('employer', [
      subscriptionPlanId,
      ...(plans || []).map((plan) => (plan?.toJSON ? plan.toJSON().id : plan?.id)),
    ]);

    const planList = (plans || []).map((p) => {
      const plan = p?.toJSON ? p.toJSON() : p;
      const name = plan?.plan_name_english || plan?.plan_name_hindi || null;
      const isCurrentPlan = Boolean(subscriptionPlanId) && plan?.id === subscriptionPlanId;

      return {
        ...plan,
        plan_name: name,
        plan_benefits: benefitMap.get(Number(plan?.id)) || [],
        is_current_plan: isCurrentPlan,
        is_active_for_employer: isPlanActive && isCurrentPlan,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer subscriptions fetched successfully",
      data: {
        current_subscription: {
          employer_id: emp?.id || null,
          status,
          subscription_plan_id: subscriptionPlanId,
          active_plan_name: activePlanName,
          valid_till: isActive ? expiresAt : null,
          expired_at: !isActive && (hasPlan || hasAnyCredits) && isExpired ? expiresAt : null,
          credits: {
            contact: { total: emp?.total_contact_credit ?? 0, available: isExpired ? 0 : (emp?.contact_credit ?? 0) },
            interest: { total: emp?.total_interest_credit ?? 0, available: isExpired ? 0 : (emp?.interest_credit ?? 0) },
            ads: { total: emp?.total_ad_credit ?? 0, available: isExpired ? 0 : (emp?.ad_credit ?? 0) },
          },
        },
        active_plan: activePlanJson ? { ...activePlanJson, plan_name: activePlanName, plan_benefits: benefitMap.get(Number(activePlanJson?.id)) || [] } : null,
        plans: planList,
      },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/subscriptions]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_03",
      message: error.message || "Failed to fetch employer subscriptions",
      data: null,
    });
  }
}


async function getEmployerPaymentHistory(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    if (!employerId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employer id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await PaymentHistory.findAndCountAll({
      where: { user_type: "employer", user_id: employerId, status: "success" },
      attributes: [
        "id",
        "user_type",
        "user_id",
        "plan_id",
        "price_total",
        "order_id",
        "payment_id",
        "payment_signature",
        "status",
        "contact_credit",
        "interest_credit",
        "ads_credit",
        "expiry_at",
        "invoice_number",
        "created_at",
        "updated_at",
        "deleted_at",
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      paranoid: false,
    });

    const payments = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const planIds = Array.from(new Set(payments.map((p) => p.plan_id).filter(Boolean)));

    const planMap = new Map();
    if (planIds.length) {
      const plans = await EmployerSubscriptionPlan.findAll({
        where: { id: { [Op.in]: planIds } },
        attributes: ["id", "plan_name_english", "plan_name_hindi"],
        paranoid: false,
      });
      for (const pl of plans || []) {
        const plan = pl?.toJSON ? pl.toJSON() : pl;
        const payload = {
          plan_name_english: plan?.plan_name_english || null,
          plan_name_hindi: plan?.plan_name_hindi || null,
          plan_name:
            plan?.plan_name_english ||
            plan?.plan_name_hindi ||
            null,
        };
        if (plan?.id) planMap.set(plan.id, payload);
      }
    }

    const results = payments.map((p) => ({
      payment: {
        ...(p?.plan_id ? (planMap.get(p.plan_id) || {}) : {}),
        id: p?.id || null,
        user_type: p?.user_type || null,
        user_id: p?.user_id || null,
        plan_id: p?.plan_id || null,
        plan_name: p?.plan_id
          ? (planMap.get(p.plan_id)?.plan_name || null)
          : null,
        price_total: p?.price_total ?? null,
        status: p?.status || null,
        order_id: stripOrderIdPrefix(p?.order_id),
        payment_id: p?.payment_id || null,
        payment_signature: p?.payment_signature || null,
        contact_credit: p?.contact_credit ?? null,
        interest_credit: p?.interest_credit ?? null,
        ads_credit: p?.ads_credit ?? null,
        expiry_at: p?.expiry_at || null,
        invoice_number: p?.invoice_number || null,
        created_at: p?.created_at || null,
        updated_at: p?.updated_at || null,
        deleted_at: p?.deleted_at || null,
      },
    }));

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Payment history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/payments/history]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch payment history",
      data: null,
    });
  }
}

async function buySubscription(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    const planId = toInt(
      req.body?.subscription_plan_id ?? req.body?.plan_id ?? req.body?.planId,
    );

    if (!employerId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid employer id is required',
        data: null,
      });
    }

    if (!planId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'Valid subscription plan id is required',
        data: null,
      });
    }

    const result = await createSubscriptionOrder({
      userType: 'employer',
      userId: employerId,
      planId,
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Subscription order created successfully',
      data: {
        payment_history_id: result.paymentHistory?.id || null,
        order_id: result.order?.order_id || null,
        payment_session_id: result.order?.payment_session_id || null,
        order_amount: result.order?.order_amount ?? result.paymentHistory?.price_total ?? null,
        order_currency: result.order?.order_currency || 'INR',
        order_status: 'INIT',
        customer_details: result.customer,
        cashfree_environment: result.environment,
      },
    });
  } catch (error) {
    console.error('[app/employers/:employerId/subscriptions/buy]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: error.message || 'Failed to create subscription order',
      data: null,
    });
  }
}

async function getSubscriptionPaymentStatusByOrderId(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    const orderId = normalizeText(req.params?.orderId);

    if (!employerId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid employer id is required',
        data: null,
      });
    }

    if (!orderId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'Valid order id is required',
        data: null,
      });
    }

    const status = await getSubscriptionPaymentStatus({
      userType: 'employer',
      userId: employerId,
      orderId,
    });

    if (!status) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_04',
        message: 'Payment order not found',
        data: null,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Payment status fetched successfully',
      data: status,
    });
  } catch (error) {
    console.error('[app/employers/:employerId/subscriptions/status/:orderId]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_05',
      message: error.message || 'Failed to fetch payment status',
      data: null,
    });
  }
}


async function resolveEmployerFromParam(param, { createIfMissing = false } = {}) {
  const id = toInt(param);
  if (!id || id <= 0) return { employer: null, userId: null };

  // Mobile app calls this endpoint with userId.
  // Prefer user_id matching to avoid collisions with Employer PKs.
  let employer = await Employer.findOne({ where: { user_id: id } });
  if (employer) return { employer, userId: id };

  // Backward compatibility: accept employerId too.
  employer = await Employer.findByPk(id);
  if (employer) return { employer, userId: employer.user_id };

  if (!createIfMissing) return { employer: null, userId: null };

  // Only create an Employer row when the user exists.
  const user = await User.findByPk(id, { attributes: ["id", "name"] });
  if (!user) return { employer: null, userId: null };

  try {
    const fallbackName = String(user?.name || "").trim() || "Employer";

    const welcomeSetting = await fetchWelcomeCreditSettings();
    const welcomeCredits = buildEmployerWelcomeCredits(welcomeSetting);

    employer = await Employer.create({ user_id: id, name: fallbackName, ...welcomeCredits });
    return { employer, userId: id };
  } catch (e) {
    // In case of a race creating the same employer row.
    employer = await Employer.findOne({ where: { user_id: id } });
    if (employer) return { employer, userId: id };
    throw e;
  }
}


async function saveEmployerPersonalInfo(req, res) {
  try {
    const id = toInt(req.params?.id);
    if (!id || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employer/user id is required",
        data: null,
      });
    }

    const { employer, userId } = await resolveEmployerFromParam(id, { createIfMissing: true });
    if (!employer || !userId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Employer not found",
        data: null,
      });
    }

    const employerId = employer.id;

    const body = req.body || {};

    // If client is updating the user's name, persist it on User too.
    // This keeps auth user data consistent and ensures name_hindi is stored.
    const wantsUserNameUpdate =
      Object.prototype.hasOwnProperty.call(body, 'name') ||
      Object.prototype.hasOwnProperty.call(body, 'name_hindi');
    if (wantsUserNameUpdate) {
      try {
        const user = await User.findByPk(userId, { attributes: ['id', 'name', 'name_hindi'], paranoid: false });
        if (user) {
          const userPayload = {};
          await applyBilingualPairFromBody({
            body,
            payload: userPayload,
            englishKey: 'name',
            hindiKey: 'name_hindi',
            existing: user,
          });
          if (Object.keys(userPayload).length) {
            await user.update(userPayload);
          }
        }
      } catch (userNameError) {
        console.error('[app/employers/:id/personal-info:save:user-name]', userNameError);
      }
    }

    const hasOrgType = Object.prototype.hasOwnProperty.call(body, "organization_type");
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasNameHindi = Object.prototype.hasOwnProperty.call(body, 'name_hindi');

    const hasOrgName = Object.prototype.hasOwnProperty.call(body, "organization_name");
    const hasOrgNameHindi = Object.prototype.hasOwnProperty.call(body, 'organization_name_hindi');
    const hasBusinessCategoryId = Object.prototype.hasOwnProperty.call(body, "business_category_id");
    const hasAddress = Object.prototype.hasOwnProperty.call(body, "address");
    const hasAddressHindi = Object.prototype.hasOwnProperty.call(body, 'address_hindi');
    const hasStateId = Object.prototype.hasOwnProperty.call(body, "state_id");
    const hasCityId = Object.prototype.hasOwnProperty.call(body, "city_id");
    const hasAssistedBy = Object.prototype.hasOwnProperty.call(body, "assisted_by");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");

    const nextEmail = hasEmail ? (body.email ?? null) : employer.email;

    const payload = {};

    if (hasOrgType) {
      const orgType = body.organization_type ?? null;
      if (orgType != null && !["domestic", "firm"].includes(String(orgType))) {
        return sendApiResponse(res, { ok: false, code: "FC_03", message: "organization_type must be domestic or firm", data: null });
      }
      payload.organization_type = orgType;
    }
    if (hasName) payload.name = body.name ?? null;
    if (hasBusinessCategoryId) payload.business_category_id = toInt(body.business_category_id);
    if (hasStateId) payload.state_id = toInt(body.state_id);
    if (hasCityId) payload.city_id = toInt(body.city_id);
    if (hasAssistedBy) payload.assisted_by = body.assisted_by ?? null;
    if (hasEmail) payload.email = nextEmail;

    // Bilingual fields (base + _hindi). If either side is provided, translate/fill and persist both.
    await applyBilingualPairFromBody({ body, payload, englishKey: 'name', hindiKey: 'name_hindi', existing: employer });
    await applyBilingualPairFromBody({ body, payload, englishKey: 'organization_name', hindiKey: 'organization_name_hindi', existing: employer });
    await applyBilingualPairFromBody({ body, payload, englishKey: 'address', hindiKey: 'address_hindi', existing: employer });

    const sameText = (a, b) => normalizeNullableText(a) === normalizeNullableText(b);
    const willNameChange = (
      Object.prototype.hasOwnProperty.call(payload, 'name') && !sameText(payload.name, employer.name)
    ) || (
      Object.prototype.hasOwnProperty.call(payload, 'name_hindi') && !sameText(payload.name_hindi, employer.name_hindi)
    );
    const willOrgNameChange = (
      Object.prototype.hasOwnProperty.call(payload, 'organization_name') && !sameText(payload.organization_name, employer.organization_name)
    ) || (
      Object.prototype.hasOwnProperty.call(payload, 'organization_name_hindi') && !sameText(payload.organization_name_hindi, employer.organization_name_hindi)
    );
    const willAddressChange = (
      Object.prototype.hasOwnProperty.call(payload, 'address') && !sameText(payload.address, employer.address)
    ) || (
      Object.prototype.hasOwnProperty.call(payload, 'address_hindi') && !sameText(payload.address_hindi, employer.address_hindi)
    );

    const currentVerification = String(employer.verification_status || '').trim().toLowerCase();
    if (currentVerification === 'init') {
      payload.verification_status = 'pending';
      payload.verification_at = null;
    } else if (willNameChange || willOrgNameChange || willAddressChange) {
      payload.verification_status = "pending";
      payload.verification_at = null;
    }

    const t = await sequelize.transaction();
    try {
      await updateInstanceWithMissingColumnRetry(employer, payload, { maxRetries: 3, transaction: t });
      await User.update(
        { profile_completed_at: new Date() },
        { where: { id: userId }, transaction: t },
      );
      await t.commit();
    } catch (txError) {
      await t.rollback();
      throw txError;
    }

    let updated = null;
    try {
      updated = await Employer.findByPk(employerId, { include: buildEmployerInclude() });
    } catch (includeError) {
      console.error('[app/employers/:id/personal-info:save:include]', includeError);
      updated = await Employer.findByPk(employerId);
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer personal info saved successfully",
      data: { employer: updated ? (updated.toJSON ? updated.toJSON() : updated) : null },
    });
  } catch (error) {
    console.error("[app/employers/:id/personal-info:save]", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: "Failed to save employer personal info", data: null });
  }
}

async function sendEmployerAadharOtp(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    const mobileRaw = req.body?.mobile;
    const hasMobile = mobileRaw !== undefined && mobileRaw !== null && String(mobileRaw).trim() !== '';
    const mobile = hasMobile ? normalizeIndianMobile10(mobileRaw) : '';

    // Mobile change OTP flow
    if (hasMobile) {
      if (!employerId || employerId <= 0) {
        return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employer id is required', data: null });
      }
      if (!mobile || mobile.length != 10) {
        return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Valid mobile number is required', data: null });
      }

      const employer = await Employer.findByPk(employerId, { attributes: ['id', 'user_id'] });
      if (!employer) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employer not found', data: null });
      }

      const user = await User.findByPk(employer.user_id);
      if (!user) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'User not found', data: null });
      }

      if (String(user.mobile || '').trim() === mobile) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'New mobile cannot be same as current mobile', data: null });
      }

      const existing = await User.findOne({ where: { mobile } });
      if (existing && existing.id !== user.id) {
        return sendApiResponse(res, { ok: false, code: 'FC_05', message: 'Mobile number already in use', data: null });
      }

      const { sessionId } = await sendTwoFactorOtp(mobile);
      await user.update({
        mobile_change_pending: mobile,
        mobile_change_otp_session_id: sessionId,
        mobile_change_otp_created_at: new Date(),
      });

      const includeSessionId = isTruthyEnv(process.env.DEBUG_OTP);

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: 'OTP sent successfully',
        data: includeSessionId ? { mobile, session_id: sessionId, sessionId } : { mobile },
      });
    }

    // Aadhaar KYC OTP flow
    const aadhar_number = String(req.body?.aadhar_number || "").replace(/\s+/g, "");

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!aadhar_number) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "aadhar_number is required", data: null });
    }

    const employer = await Employer.findByPk(employerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
    }

    const { requestId } = await generateAadhaarOtp(aadhar_number);
    await employer.update({
      aadhar_number_pending: aadhar_number,
      aadhar_request_id: requestId,
      aadhar_otp: null,
      aadhar_otp_created_at: new Date(),
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Aadhaar OTP sent successfully",
      data: { employer_id: employerId },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/aadhar/send-otp]", error);
    const includeError = isTruthyEnv(process.env.DEBUG_OTP);
    const details = String(error?.message || error || '').trim();
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: "Failed to send Aadhaar OTP",
      data: includeError ? { error: details || 'Unknown error' } : null,
    });
  }
}

async function verifyEmployerAadharOtp(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    const mobileRaw = req.body?.mobile;
    const hasMobile = mobileRaw !== undefined && mobileRaw !== null && String(mobileRaw).trim() !== '';
    const mobile = hasMobile ? normalizeIndianMobile10(mobileRaw) : '';
    const otp = String(req.body?.otp || "").trim();

    // Mobile change verification
    if (hasMobile) {
      if (!employerId || employerId <= 0) {
        return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employer id is required', data: null });
      }
      if (!mobile || mobile.length !== 10 || !otp) {
        return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'mobile and otp are required', data: null });
      }

      const employer = await Employer.findByPk(employerId, { attributes: ['id', 'user_id'] });
      if (!employer) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employer not found', data: null });
      }

      const user = await User.findByPk(employer.user_id);
      if (!user) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'User not found', data: null });
      }

      const pendingMobile = String(user.mobile_change_pending || '').trim();
      if (!pendingMobile || pendingMobile !== mobile) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'OTP not requested for this mobile. Please request OTP again.', data: null });
      }

      const sessionId = String(user.mobile_change_otp_session_id || '').trim();
      if (!sessionId) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'OTP session not found. Please request OTP again.', data: null });
      }

      const verification = await verifyTwoFactorOtp(sessionId, otp);
      if (!verification.matched) {
        return sendApiResponse(res, { ok: false, code: 'FC_05', message: verification.details || 'Invalid OTP', data: null });
      }

      const existing = await User.findOne({ where: { mobile } });
      if (existing && existing.id !== user.id) {
        return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Mobile number already in use', data: null });
      }

      const now = new Date();
      try {
        await user.update({
          mobile,
          phone_verified_at: now,
          last_active_at: now,
          mobile_change_pending: null,
          mobile_change_otp_session_id: null,
          mobile_change_otp_created_at: null,
        });
      } catch (e) {
        if (e && e.name === 'SequelizeUniqueConstraintError') {
          return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Mobile number already in use', data: null });
        }
        throw e;
      }

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: 'Mobile number updated successfully',
        data: { mobile },
      });
    }

    // Aadhaar KYC OTP flow
    const aadhar_number = String(req.body?.aadhar_number || "").replace(/\s+/g, "");

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!aadhar_number || !otp) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "aadhar_number and otp are required", data: null });
    }

    const employer = await Employer.findByPk(employerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
    }

    if (!employer.aadhar_number_pending || String(employer.aadhar_number_pending) !== aadhar_number) {
      return sendApiResponse(res, { ok: false, code: "FC_05", message: "Aadhaar number mismatch", data: null });
    }

    if (!employer.aadhar_request_id) {
      return sendApiResponse(res, { ok: false, code: "FC_04", message: "Aadhaar OTP request not found. Please request OTP again.", data: null });
    }

    const verification = await verifyAadhaarOtpApi(employer.aadhar_request_id, otp);
    if (!verification.matched) {
      return sendApiResponse(res, { ok: false, code: "FC_04", message: verification.details || "Invalid OTP", data: null });
    }

    if (!namesMatch(employer.name, verification.fullName)) {
      return sendApiResponse(res, { ok: false, code: "FC_07", message: "Name on Aadhaar does not match your profile name", data: null });
    }

    await employer.update({
      aadhar_number: maskAadhar(aadhar_number),
      aadhar_verified_at: employer.aadhar_verified_at || new Date(),
      aadhar_number_pending: null,
      aadhar_request_id: null,
      aadhar_otp: null,
      aadhar_otp_created_at: null,
    });

    await maybeVerifyEmployerKyc(employer);

    const updated = await Employer.findByPk(employerId, { include: buildEmployerInclude() });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Aadhaar verified successfully",
      data: { employer: updated ? (updated.toJSON ? updated.toJSON() : updated) : null },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/aadhar/verify-otp]", error);
    return sendApiResponse(res, { ok: false, code: "FC_06", message: "Failed to verify Aadhaar OTP", data: null });
  }
}



async function uploadEmployerDocument(req, res) {
  try {
    const employerId = toInt(req.params?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const employer = await Employer.findByPk(employerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Employer not found", data: null });
    }

    const file = pickFirstUploadedFile(req, ["document", "file", "document_file"]);
    if (!file?.relativePath) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Document file is required", data: null });
    }

    const updatePayload = {
      document_link: file.relativePath,
    };

    await employer.update(updatePayload);

    await maybeVerifyEmployerKyc(employer);

    const updated = await Employer.findByPk(employerId, { include: buildEmployerInclude() });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer document uploaded successfully",
      data: { employer: updated ? (updated.toJSON ? updated.toJSON() : updated) : null },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/document]", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: "Failed to upload employer document", data: null });
  }
}



function normalizePage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(200, Math.floor(n));
}

function mapEmployeeCityState(emp) {
  const preferredStateEnglish = emp?.PreferredState?.state_english || null;
  const preferredStateHindi = emp?.PreferredState?.state_hindi || null;
  const preferredCityEnglish = emp?.PreferredCity?.city_english || null;
  const preferredCityHindi = emp?.PreferredCity?.city_hindi || null;

  const stateEnglish = preferredStateEnglish || emp?.State?.state_english || null;
  const stateHindi = preferredStateHindi || emp?.State?.state_hindi || null;
  const cityEnglish = preferredCityEnglish || emp?.City?.city_english || null;
  const cityHindi = preferredCityHindi || emp?.City?.city_hindi || null;

  return {
    city: cityEnglish || cityHindi || null,
    state: stateEnglish || stateHindi || null,
    city_english: cityEnglish,
    city_hindi: cityHindi,
    state_english: stateEnglish,
    state_hindi: stateHindi,
  };
}

function mapJobSalaryFrequency(job) {
  return mapJobSalaryFrequencyFields(job).salary_frequency;
}

function mapJobProfileName(job) {
  return mapJobProfileNameFields(job).job_profile_name;
}

function mapOrganizationName(job) {
  return mapOrganizationNameFields(job).organization_name;
}

function mapJobSalaryFrequencyFields(job) {
  const salaryFrequencyEnglish = job?.SalaryType?.type_english || null;
  const salaryFrequencyHindi = job?.SalaryType?.type_hindi || null;
  return {
    salary_frequency: salaryFrequencyEnglish || salaryFrequencyHindi || null,
    salary_frequency_english: salaryFrequencyEnglish,
    salary_frequency_hindi: salaryFrequencyHindi,
  };
}

function mapJobProfileNameFields(job) {
  const jobProfileEnglish = job?.JobProfile?.profile_english || null;
  const jobProfileHindi = job?.JobProfile?.profile_hindi || null;
  return {
    job_profile_name: jobProfileEnglish || jobProfileHindi || null,
    job_profile_name_english: jobProfileEnglish,
    job_profile_name_hindi: jobProfileHindi,
  };
}

function mapOrganizationNameFields(job) {
  const employer = job?.Employer || null;
  const organizationNameEnglish = employer?.organization_name || employer?.name || null;
  const organizationNameHindi = employer?.organization_name_hindi || employer?.name_hindi || null;
  return {
    organization_name: organizationNameEnglish || organizationNameHindi || null,
    organization_name_english: organizationNameEnglish,
    organization_name_hindi: organizationNameHindi,
  };
}

async function getEmployerContactHistory(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    const jobId = toInt(req.query?.jobId ?? req.query?.job_id);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await EmployerContact.findAndCountAll({
      where: { employer_id: employerId },
      attributes: ["id", "employer_id", "employee_id", "created_at"],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const contacts = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const employeeIds = Array.from(new Set(contacts.map((c) => c.employee_id).filter(Boolean)));

    const employees = employeeIds.length
      ? await Employee.findAll({
          where: { id: { [Op.in]: employeeIds } },
          paranoid: false,
          attributes: ["id", "name", "name_hindi", "gender", "verification_status", "kyc_status", "state_id", "city_id", "preferred_state_id", "preferred_city_id"],
          include: [
            { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
            { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
            { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
            { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
            { model: User, as: "User", attributes: ["name", "mobile"], required: false, paranoid: false },
          ],
        })
      : [];

    const employeeMap = new Map(
      (employees || []).map((e) => {
        const emp = e?.toJSON ? e.toJSON() : e;
        return [emp.id, emp];
      })
    );

    const results = contacts.map((c) => {
      const emp = employeeMap.get(c.employee_id) || null;
      const location = mapEmployeeCityState(emp);

      return {
        employee_id: emp?.id || c.employee_id || null,
        employee_name: emp?.name || emp?.User?.name || null,
        employee_name_english: emp?.name || emp?.User?.name || null,
        employee_name_hindi: emp?.name_hindi || null,
        verification_status: emp?.verification_status || null,
        kyc_status: emp?.kyc_status || null,
        gender: emp?.gender || null,
        contact: emp?.User?.mobile || null,
        address: null,
        city: location.city,
        city_english: location.city_english,
        city_hindi: location.city_hindi,
        state: location.state,
        state_english: location.state_english,
        state_hindi: location.state_hindi,
        contact_unlock_time: c?.created_at || null,
        employer_contact_id: c?.id || null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer contact history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/history/contacts]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch employer contact history", data: null });
  }
}

async function getEmployerInterestHistory(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: { sender_type: "employer", sender_id: employerId },
      attributes: ["id", "receiver_id", "job_id", "status", "created_at"],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const interests = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const employeeIds = Array.from(new Set(interests.map((i) => i.receiver_id).filter(Boolean)));

    const employees = employeeIds.length
      ? await Employee.findAll({
          where: { id: { [Op.in]: employeeIds } },
          paranoid: false,
          attributes: [
            "id",
            "name",
            "name_hindi",
            "gender",
            "verification_status",
            "kyc_status",
            "expected_salary",
            "expected_salary_frequency",
            "state_id",
            "city_id",
            "preferred_state_id",
            "preferred_city_id",
          ],
          include: [
            { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
            { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
            { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
            { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
            { model: User, as: "User", attributes: ["name", "mobile"], required: false, paranoid: false },
          ],
        })
      : [];

    const employeeMap = new Map(
      (employees || []).map((e) => {
        const emp = e?.toJSON ? e.toJSON() : e;
        return [emp.id, emp];
      })
    );

    const employeeProfiles = employeeIds.length
      ? await EmployeeJobProfile.findAll({
          where: { employee_id: { [Op.in]: employeeIds } },
          attributes: ["employee_id", "job_profile_id"],
          paranoid: false,
          include: [{ model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false }],
        })
      : [];

    const profilesByEmployee = new Map();
    for (const row of employeeProfiles || []) {
      const r = row?.toJSON ? row.toJSON() : row;
      const empId = r?.employee_id;
      if (!empId) continue;
      const current = profilesByEmployee.get(empId) || [];
      const jp = r?.JobProfile || null;
      if (jp) {
        current.push({ id: jp.id, profile_english: jp.profile_english, profile_hindi: jp.profile_hindi });
      }
      profilesByEmployee.set(empId, current);
    }

    const results = interests.map((interest) => {
      const emp = employeeMap.get(interest.receiver_id) || null;
      const location = mapEmployeeCityState(emp);

      return {
        employee_id: emp?.id || interest.receiver_id || null,
        employee_name: emp?.name || emp?.User?.name || null,
        employee_name_english: emp?.name || emp?.User?.name || null,
        employee_name_hindi: emp?.name_hindi || null,
        verification_status: emp?.verification_status || null,
        kyc_status: emp?.kyc_status || null,
        gender: emp?.gender || null,
        contact: emp?.User?.mobile || null,
        employee_job_profiles: profilesByEmployee.get(emp?.id || interest.receiver_id) || [],
        salary_min: emp?.expected_salary ?? null,
        salary_max: emp?.expected_salary ?? null,
        salary_frequency: emp?.expected_salary_frequency || null,
        salary_frequency_english: emp?.expected_salary_frequency || null,
        salary_frequency_hindi: null,
        city: location.city,
        city_english: location.city_english,
        city_hindi: location.city_hindi,
        state: location.state,
        state_english: location.state_english,
        state_hindi: location.state_hindi,
        interest_unlocked_time: interest?.created_at || null,
        job_interest_id: interest?.id || null,
        job_id: interest?.job_id || null,
        status: interest?.status || null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer interest history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/history/interests]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch employer interest history", data: null });
  }
}

async function getEmployerAdsHistory(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await Job.findAndCountAll({
      where: { employer_id: employerId },
      attributes: ["id", "employer_id", "job_profile_id", "salary_type_id", "salary_min", "salary_max", "no_vacancy", "job_state_id", "job_city_id", "created_at"],
      include: [
        {
          model: Employer,
          as: "Employer",
          attributes: [
            "id",
            "name",
            "name_hindi",
            "organization_name",
            "organization_name_hindi",
          ],
          required: false,
          paranoid: false,
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
        {
          model: JobShift,
          as: "JobShifts",
          attributes: ["id", "job_id", "shift_id"],
          required: false,
          include: [
            { model: Shift, as: "Shift", attributes: ["id", "shift_english", "shift_hindi", "shift_from", "shift_to"], required: false, paranoid: false },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const jobs = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));

    const results = jobs.map((job) => {
      const shifts = Array.isArray(job?.JobShifts) ? job.JobShifts : [];
      const shift_timing = shifts
        .map((js) => js?.Shift)
        .filter(Boolean)
        .map((s) => ({
          id: s.id,
          shift_english: s.shift_english,
          shift_hindi: s.shift_hindi,
          shift_from: s.shift_from,
          shift_to: s.shift_to,
        }));

      return {
        job_id: job?.id || null,
        job_profile_name: mapJobProfileName(job),
        job_profile_name_english: mapJobProfileNameFields(job).job_profile_name_english,
        job_profile_name_hindi: mapJobProfileNameFields(job).job_profile_name_hindi,
        employer_organization_name: mapOrganizationName(job),
        employer_organization_name_english:
          mapOrganizationNameFields(job).organization_name_english,
        employer_organization_name_hindi:
          mapOrganizationNameFields(job).organization_name_hindi,
        city: job?.JobCity?.city_english || job?.JobCity?.city_hindi || null,
        state: job?.JobState?.state_english || job?.JobState?.state_hindi || null,
        city_english: job?.JobCity?.city_english || null,
        city_hindi: job?.JobCity?.city_hindi || null,
        state_english: job?.JobState?.state_english || null,
        state_hindi: job?.JobState?.state_hindi || null,
        shift_timing,
        salary_min: job?.salary_min ?? null,
        salary_max: job?.salary_max ?? null,
        salary_frequency: mapJobSalaryFrequency(job),
        salary_frequency_english:
          mapJobSalaryFrequencyFields(job).salary_frequency_english,
        salary_frequency_hindi:
          mapJobSalaryFrequencyFields(job).salary_frequency_hindi,
        no_vacancy: job?.no_vacancy ?? null,
        created_at: job?.created_at || null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer ads history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/history/ads]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch employer ads history", data: null });
  }
}

async function getEmployerApplicants(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const jobId = toInt(req.query?.jobId ?? req.query?.job_id);

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: {
        [Op.or]: [
          { sender_type: "employer", sender_id: employerId },
          { sender_type: "employee", receiver_id: employerId },
        ],
      },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: true,
          paranoid: false,
          attributes: ["id", "employer_id", "job_profile_id"],
          where: { employer_id: employerId, ...(jobId ? { id: jobId } : {}) },
          include: [
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
            { model: Employer, as: "Employer", attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi"], required: false, paranoid: false },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const interests = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));

    const candidateIds = Array.from(
      new Set(
        interests
          .map((i) => {
            if (i.sender_type === "employee") return i.sender_id;
            if (i.sender_type === "employer") return i.receiver_id;
            return null;
          })
          .filter(Boolean)
      )
    );

    const employees = await Employee.findAll({
      where: { id: { [Op.in]: candidateIds } },
      paranoid: false,
      attributes: [
        "id",
        "name",
        "name_hindi",
        "gender",
        "verification_status",
        "kyc_status",
        "expected_salary",
        "expected_salary_frequency",
        "preferred_state_id",
        "preferred_city_id",
      ],
      include: [
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: User, as: "User", attributes: ["name"], required: false, paranoid: false },
      ],
    });

    const employeeMap = new Map(
      (employees || []).map((e) => {
        const emp = e?.toJSON ? e.toJSON() : e;
        return [emp.id, emp];
      })
    );

    const results = interests.map((interest) => {
      const candidateId = interest.sender_type === "employee" ? interest.sender_id : interest.receiver_id;
      const emp = employeeMap.get(candidateId) || null;

      const job = interest?.Job || null;
      const jobProfile = mapJobProfileNameFields(job);
      const organization = mapOrganizationNameFields(job);

      return {
        employee: {
          id: emp?.id || candidateId || null,
          name: emp?.name || emp?.User?.name || null,
          name_english: emp?.name || emp?.User?.name || null,
          name_hindi: emp?.name_hindi || null,
          gender: emp?.gender || null,
          verification_status: emp?.verification_status || null,
          kyc_status: emp?.kyc_status || null,
          expected_salary: emp?.expected_salary ?? null,
          expected_salary_min: emp?.expected_salary ?? null,
          expected_salary_max: emp?.expected_salary ?? null,
          expected_salary_frequency: emp?.expected_salary_frequency || null,
          preferred_state:
            emp?.PreferredState?.state_english ||
            emp?.PreferredState?.state_hindi ||
            null,
          preferred_state_english: emp?.PreferredState?.state_english || null,
          preferred_state_hindi: emp?.PreferredState?.state_hindi || null,
          preferred_city:
            emp?.PreferredCity?.city_english ||
            emp?.PreferredCity?.city_hindi ||
            null,
          preferred_city_english: emp?.PreferredCity?.city_english || null,
          preferred_city_hindi: emp?.PreferredCity?.city_hindi || null,
        },
        job_interest: {
          id: interest?.id || null,
          status: interest?.status || null,
          created_at: interest?.created_at || null,
          updated_at: interest?.updated_at || null,
          job_id: interest?.job_id || null,
          sender_type: interest?.sender_type || null,
          sender_id: interest?.sender_id || null,
          receiver_id: interest?.receiver_id || null,
        },
        job: {
          id: job?.id || interest?.job_id || null,
          job_profile_name: jobProfile.job_profile_name,
          job_profile_name_english: jobProfile.job_profile_name_english,
          job_profile_name_hindi: jobProfile.job_profile_name_hindi,
        },
        organization_name: organization.organization_name,
        organization_name_english: organization.organization_name_english,
        organization_name_hindi: organization.organization_name_hindi,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Applicants fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/applicants]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch applicants", data: null });
  }
}

async function getEmployerReceivedApplicants(req, res) {
  try {
    const requestedEmployerId = toInt(req.params?.employerId ?? req.query?.employerId);

    const jobIdParam = req.params?.jobId ?? req.query?.jobId;
    const jobId = jobIdParam === undefined ? null : toInt(jobIdParam);
    if (jobIdParam !== undefined && (!jobId || jobId <= 0)) {
      return sendApiResponse(res, { ok: false, code: "FC_99", message: "Valid job id is required", data: null });
    }
    if (!requestedEmployerId || requestedEmployerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const { employer } = await resolveEmployerFromParam(requestedEmployerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employer not found", data: null });
    }

    const employerId = employer.id;

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: {
        receiver_id: employerId,
        sender_type: "employee",
        status: "pending",
        ...(jobId ? { job_id: jobId } : {}),
      },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: true,
          paranoid: false,
          where: { employer_id: employerId, ...(jobId ? { id: jobId } : {}) },
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "salary_min",
            "salary_max",
            "status",
            "job_state_id",
            "job_city_id",
            "hired_total",
            "no_vacancy",
          ],
          include: [
            { model: Employer, as: "Employer", attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi"], required: false, paranoid: false },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
            { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
            { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
            { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const interests = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const employeeIds = Array.from(new Set(interests.map((i) => i.sender_id).filter(Boolean)));

    const employees = await Employee.findAll({
      where: { id: { [Op.in]: employeeIds } },
      paranoid: false,
      attributes: ["id", "name", "name_hindi", "gender", "verification_status", "kyc_status", "expected_salary", "expected_salary_frequency"],
      include: [
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
        { model: User, as: "User", attributes: ["name"], required: false, paranoid: false },
      ],
    });

    const employeeMap = new Map((employees || []).map((e) => {
      const emp = e?.toJSON ? e.toJSON() : e;
      return [emp.id, emp];
    }));

    const employeeProfiles = employeeIds.length
      ? await EmployeeJobProfile.findAll({
          where: { employee_id: { [Op.in]: employeeIds } },
          attributes: ["employee_id", "job_profile_id"],
          paranoid: false,
          include: [
            {
              model: JobProfile,
              as: "JobProfile",
              attributes: ["id", "profile_english", "profile_hindi"],
              required: false,
            },
          ],
        })
      : [];

    const profilesByEmployee = new Map();
    for (const row of employeeProfiles || []) {
      const r = row?.toJSON ? row.toJSON() : row;
      const empId = r?.employee_id;
      if (!empId) continue;

      const current = profilesByEmployee.get(empId) || [];
      const jp = r?.JobProfile || null;
      if (jp) {
        current.push({
          id: jp.id,
          profile_english: jp.profile_english,
          profile_hindi: jp.profile_hindi,
        });
      }
      profilesByEmployee.set(empId, current);
    }

    const results = interests.map((interest) => {
      const emp = employeeMap.get(interest.sender_id) || null;
      const job = interest.Job || null;

      const location = mapEmployeeCityState(emp);
      const jobProfile = mapJobProfileNameFields(job);
      const organization = mapOrganizationNameFields(job);
      const salaryFrequency = mapJobSalaryFrequencyFields(job);

      return {
        employee: {
          id: emp?.id || interest.sender_id || null,
          name: emp?.name || emp?.User?.name || null,
          name_english: emp?.name || emp?.User?.name || null,
          name_hindi: emp?.name_hindi || null,
          verification_status: emp?.verification_status || null,
          kyc_status: emp?.kyc_status || null,
          gender: emp?.gender || null,
          city: location.city,
          city_english: location.city_english,
          city_hindi: location.city_hindi,
          state: location.state,
          state_english: location.state_english,
          state_hindi: location.state_hindi,
          preferred_city:
            emp?.PreferredCity?.city_english ||
            emp?.PreferredCity?.city_hindi ||
            null,
          preferred_city_english: emp?.PreferredCity?.city_english || null,
          preferred_city_hindi: emp?.PreferredCity?.city_hindi || null,
          preferred_state:
            emp?.PreferredState?.state_english ||
            emp?.PreferredState?.state_hindi ||
            null,
          preferred_state_english: emp?.PreferredState?.state_english || null,
          preferred_state_hindi: emp?.PreferredState?.state_hindi || null,
          expected_salary: emp?.expected_salary ?? null,
          expected_salary_frequency: emp?.expected_salary_frequency || null,
          employee_job_profiles:
            profilesByEmployee.get(emp?.id || interest.sender_id) || [],
        },
        job_interest: {
          id: interest.id || null,
          status: interest.status || null,
          created_at: interest.created_at || null,
          updated_at: interest.updated_at || null,
          job_id: interest.job_id || null,
        },
        job: {
          id: job?.id || interest.job_id || null,
          job_profile_name: jobProfile.job_profile_name,
          job_profile_name_english: jobProfile.job_profile_name_english,
          job_profile_name_hindi: jobProfile.job_profile_name_hindi,
          organization_name: organization.organization_name,
          organization_name_english: organization.organization_name_english,
          organization_name_hindi: organization.organization_name_hindi,
          status: job?.status || null,
          city: job?.JobCity?.city_english || job?.JobCity?.city_hindi || null,
          city_english: job?.JobCity?.city_english || null,
          city_hindi: job?.JobCity?.city_hindi || null,
          state: job?.JobState?.state_english || job?.JobState?.state_hindi || null,
          state_english: job?.JobState?.state_english || null,
          state_hindi: job?.JobState?.state_hindi || null,
          salary_min: job?.salary_min ?? null,
          salary_max: job?.salary_max ?? null,
          salary_frequency: salaryFrequency.salary_frequency,
          salary_frequency_english: salaryFrequency.salary_frequency_english,
          salary_frequency_hindi: salaryFrequency.salary_frequency_hindi,
          hired_total: job?.hired_total ?? null,
          no_vacancy: job?.no_vacancy ?? null,
        },
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Received applicants fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/applicants/received]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch received applicants", data: null });
  }
}

async function getEmployerSentApplicants(req, res) {
  try {
    const requestedEmployerId = toInt(req.params?.employerId ?? req.query?.employerId);

    const jobIdParam = req.params?.jobId ?? req.query?.jobId;
    const jobId = jobIdParam === undefined ? null : toInt(jobIdParam);
    if (jobIdParam !== undefined && (!jobId || jobId <= 0)) {
      return sendApiResponse(res, { ok: false, code: "FC_99", message: "Valid job id is required", data: null });
    }
    if (!requestedEmployerId || requestedEmployerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const { employer } = await resolveEmployerFromParam(requestedEmployerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employer not found", data: null });
    }

    const employerId = employer.id;

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: {
        sender_id: employerId,
        sender_type: "employer",
        status: "pending",
        ...(jobId ? { job_id: jobId } : {}),
      },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: true,
          paranoid: false,
          where: { employer_id: employerId, ...(jobId ? { id: jobId } : {}) },
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "salary_min",
            "salary_max",
            "status",
            "job_state_id",
            "job_city_id",
            "hired_total",
            "no_vacancy",
          ],
          include: [
            { model: Employer, as: "Employer", attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi"], required: false, paranoid: false },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
            { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
            { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
            { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const interests = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const employeeIds = Array.from(new Set(interests.map((i) => i.receiver_id).filter(Boolean)));

    const employees = await Employee.findAll({
      where: { id: { [Op.in]: employeeIds } },
      paranoid: false,
      attributes: ["id", "name", "name_hindi", "gender", "verification_status", "kyc_status", "expected_salary", "expected_salary_frequency"],
      include: [
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
        { model: User, as: "User", attributes: ["name"], required: false, paranoid: false },
      ],
    });

    const employeeMap = new Map((employees || []).map((e) => {
      const emp = e?.toJSON ? e.toJSON() : e;
      return [emp.id, emp];
    }));

    const employeeProfiles = employeeIds.length
      ? await EmployeeJobProfile.findAll({
          where: { employee_id: { [Op.in]: employeeIds } },
          attributes: ["employee_id", "job_profile_id"],
          paranoid: false,
          include: [
            {
              model: JobProfile,
              as: "JobProfile",
              attributes: ["id", "profile_english", "profile_hindi"],
              required: false,
            },
          ],
        })
      : [];

    const profilesByEmployee = new Map();
    for (const row of employeeProfiles || []) {
      const r = row?.toJSON ? row.toJSON() : row;
      const empId = r?.employee_id;
      if (!empId) continue;

      const current = profilesByEmployee.get(empId) || [];
      const jp = r?.JobProfile || null;
      if (jp) {
        current.push({
          id: jp.id,
          profile_english: jp.profile_english,
          profile_hindi: jp.profile_hindi,
        });
      }
      profilesByEmployee.set(empId, current);
    }

    const results = interests.map((interest) => {
      const emp = employeeMap.get(interest.receiver_id) || null;
      const job = interest.Job || null;

      const location = mapEmployeeCityState(emp);
      const jobProfile = mapJobProfileNameFields(job);
      const organization = mapOrganizationNameFields(job);
      const salaryFrequency = mapJobSalaryFrequencyFields(job);

      return {
        employee: {
          id: emp?.id || interest.receiver_id || null,
          name: emp?.name || emp?.User?.name || null,
          name_english: emp?.name || emp?.User?.name || null,
          name_hindi: emp?.name_hindi || null,
          verification_status: emp?.verification_status || null,
          kyc_status: emp?.kyc_status || null,
          gender: emp?.gender || null,
          city: location.city,
          city_english: location.city_english,
          city_hindi: location.city_hindi,
          state: location.state,
          state_english: location.state_english,
          state_hindi: location.state_hindi,
          preferred_city:
            emp?.PreferredCity?.city_english ||
            emp?.PreferredCity?.city_hindi ||
            null,
          preferred_city_english: emp?.PreferredCity?.city_english || null,
          preferred_city_hindi: emp?.PreferredCity?.city_hindi || null,
          preferred_state:
            emp?.PreferredState?.state_english ||
            emp?.PreferredState?.state_hindi ||
            null,
          preferred_state_english: emp?.PreferredState?.state_english || null,
          preferred_state_hindi: emp?.PreferredState?.state_hindi || null,
          expected_salary: emp?.expected_salary ?? null,
          expected_salary_frequency: emp?.expected_salary_frequency || null,
          employee_job_profiles:
            profilesByEmployee.get(emp?.id || interest.receiver_id) || [],
        },
        job_interest: {
          id: interest.id || null,
          status: interest.status || null,
          created_at: interest.created_at || null,
          updated_at: interest.updated_at || null,
          job_id: interest.job_id || null,
        },
        job: {
          id: job?.id || interest.job_id || null,
          job_profile_name: jobProfile.job_profile_name,
          job_profile_name_english: jobProfile.job_profile_name_english,
          job_profile_name_hindi: jobProfile.job_profile_name_hindi,
          organization_name: organization.organization_name,
          organization_name_english: organization.organization_name_english,
          organization_name_hindi: organization.organization_name_hindi,
          status: job?.status || null,
          city: job?.JobCity?.city_english || job?.JobCity?.city_hindi || null,
          city_english: job?.JobCity?.city_english || null,
          city_hindi: job?.JobCity?.city_hindi || null,
          state: job?.JobState?.state_english || job?.JobState?.state_hindi || null,
          state_english: job?.JobState?.state_english || null,
          state_hindi: job?.JobState?.state_hindi || null,
          salary_min: job?.salary_min ?? null,
          salary_max: job?.salary_max ?? null,
          salary_frequency: salaryFrequency.salary_frequency,
          salary_frequency_english: salaryFrequency.salary_frequency_english,
          salary_frequency_hindi: salaryFrequency.salary_frequency_hindi,
          hired_total: job?.hired_total ?? null,
          no_vacancy: job?.no_vacancy ?? null,
        },
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Sent applicants fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/applicants/sent]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch sent applicants", data: null });
  }
}

async function getEmployerApplicantsByStatus(req, res, status) {
  try {
    const requestedEmployerId = toInt(req.params?.employerId ?? req.query?.employerId);

    const jobIdParam = req.params?.jobId ?? req.query?.jobId;
    const jobId = jobIdParam === undefined ? null : toInt(jobIdParam);
    if (jobIdParam !== undefined && (!jobId || jobId <= 0)) {
      return sendApiResponse(res, { ok: false, code: "FC_99", message: "Valid job id is required", data: null });
    }
    if (!requestedEmployerId || requestedEmployerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const { employer } = await resolveEmployerFromParam(requestedEmployerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employer not found", data: null });
    }

    const employerId = employer.id;

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: { status, ...(jobId ? { job_id: jobId } : {}) },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: true,
          paranoid: false,
          attributes: ["id", "employer_id", "job_profile_id"],
          where: { employer_id: employerId, ...(jobId ? { id: jobId } : {}) },
          include: [
            { model: Employer, as: "Employer", attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi"], required: false, paranoid: false },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const interests = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));

    const candidateIds = Array.from(
      new Set(
        interests
          .map((i) => (i?.sender_type === "employee" ? i?.sender_id : i?.receiver_id))
          .filter(Boolean)
      )
    );

    const employees = await Employee.findAll({
      where: { id: { [Op.in]: candidateIds } },
      paranoid: false,
      attributes: [
        "id",
        "name",
        "gender",
        "verification_status",
        "kyc_status",
        "expected_salary",
        "expected_salary_frequency",
        "preferred_state_id",
        "preferred_city_id",
        "state_id",
        "city_id",
      ],
      include: [
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
        { model: User, as: "User", attributes: ["name"], required: false, paranoid: false },
      ],
    });

    const employeeMap = new Map((employees || []).map((e) => {
      const emp = e?.toJSON ? e.toJSON() : e;
      return [emp.id, emp];
    }));

    const employeeProfiles = candidateIds.length
      ? await EmployeeJobProfile.findAll({
          where: { employee_id: { [Op.in]: candidateIds } },
          attributes: ["employee_id", "job_profile_id"],
          paranoid: false,
          include: [
            {
              model: JobProfile,
              as: "JobProfile",
              attributes: ["id", "profile_english", "profile_hindi"],
              required: false,
            },
          ],
        })
      : [];

    const profilesByEmployee = new Map();
    for (const row of employeeProfiles) {
      const r = row?.toJSON ? row.toJSON() : row;
      const empId = r?.employee_id;
      if (!empId) continue;
      const current = profilesByEmployee.get(empId) || [];
      const jp = r?.JobProfile || null;
      if (jp) current.push({ id: jp.id, profile_english: jp.profile_english, profile_hindi: jp.profile_hindi });
      profilesByEmployee.set(empId, current);
    }

    const results = interests.map((interest) => {
      const candidateId = interest?.sender_type === "employee" ? interest?.sender_id : interest?.receiver_id;
      const emp = employeeMap.get(candidateId) || null;
      const job = interest?.Job || null;
      const location = mapEmployeeCityState(emp);
      const jobProfile = mapJobProfileNameFields(job);
      const organization = mapOrganizationNameFields(job);

      return {
        employee: {
          id: emp?.id || candidateId || null,
          name: emp?.name || emp?.User?.name || null,
          name_english: emp?.name || emp?.User?.name || null,
          name_hindi: emp?.name_hindi || null,
          verification_status: emp?.verification_status || null,
          kyc_status: emp?.kyc_status || null,
          gender: emp?.gender || null,
          city: location.city,
          city_english: location.city_english,
          city_hindi: location.city_hindi,
          state: location.state,
          state_english: location.state_english,
          state_hindi: location.state_hindi,
          expected_salary: emp?.expected_salary ?? null,
          expected_salary_min: emp?.expected_salary ?? null,
          expected_salary_max: emp?.expected_salary ?? null,
          expected_salary_frequency: emp?.expected_salary_frequency || null,
          employee_job_profiles: profilesByEmployee.get(candidateId) || [],
        },
        job_interest: {
          id: interest?.id || null,
          status: interest?.status || null,
          created_at: interest?.created_at || null,
          updated_at: interest?.updated_at || null,
          job_id: interest?.job_id || null,
          sender_type: interest?.sender_type || null,
          sender_id: interest?.sender_id || null,
          receiver_id: interest?.receiver_id || null,
        },
        job_profile_name: jobProfile.job_profile_name,
        job_profile_name_english: jobProfile.job_profile_name_english,
        job_profile_name_hindi: jobProfile.job_profile_name_hindi,
        organization_name: organization.organization_name,
        organization_name_english: organization.organization_name_english,
        organization_name_hindi: organization.organization_name_hindi,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Applicants fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/applicants/status]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch applicants", data: null });
  }
}

async function getEmployerShortlistedApplicants(req, res) {
  return getEmployerApplicantsByStatus(req, res, "shortlisted");
}

async function getEmployerHiredApplicants(req, res) {
  return getEmployerApplicantsByStatus(req, res, "hired");
}


async function getEmployerRejectedApplicants(req, res) {
  return getEmployerApplicantsByStatus(req, res, "rejected");
}

async function updateEmployerApplicantStatus(req, res) {
  const t = await sequelize.transaction();
  try {
    const employerId = toInt(req.params?.employerId ?? req.body?.employerId ?? req.body?.employer_id ?? req.query?.employerId);
    const jobInterestId = toInt(req.body?.job_interest_id ?? req.body?.jobInterestId ?? req.body?.id);
    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!employerId || employerId <= 0) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    if (!jobInterestId || jobInterestId <= 0) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid job interest id is required", data: null });
    }

    if (nextStatus !== "hired" && nextStatus !== "rejected") {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Status must be hired or rejected", data: null });
    }

    const interest = await JobInterest.findOne({
      where: { id: jobInterestId },
      include: [
        {
          model: Job,
          as: "Job",
          required: true,
          paranoid: false,
          where: { employer_id: employerId },
          attributes: ["id", "employer_id", "hired_total", "no_vacancy", "status"],
        },
      ],
      paranoid: false,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!interest) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_04", message: "Applicant not found", data: null });
    }

    const currentStatus = String(interest.status || "").toLowerCase();
    const job = interest.Job;
    const hiredTotal = Number(job?.hired_total || 0);
    const totalVacancy = Math.max(Number(job?.no_vacancy || 0), 0);
    const isNewHire = currentStatus !== "hired" && nextStatus === "hired";

    if (job && isNewHire && hiredTotal >= totalVacancy) {
      await t.rollback();
      return sendApiResponse(res, {
        ok: false,
        code: "FC_07",
        message: "All vacancies are already filled for this job",
        data: null,
      });
    }

    if (nextStatus === "hired") {
      if (!otp) {
        await t.rollback();
        return sendApiResponse(res, { ok: false, code: "FC_05", message: "OTP is required", data: null });
      }

      const expectedOtp = String(interest.otp || "").trim();
      if (!expectedOtp || expectedOtp !== otp) {
        await t.rollback();
        return sendApiResponse(res, { ok: false, code: "FC_06", message: "otp not matched", data: null });
      }
    }

    let jobBecameInactive = false;
    let nextHiredTotal = hiredTotal;

    if (currentStatus !== nextStatus) {
      await interest.update({ status: nextStatus }, { transaction: t });

      if (job) {
        if (currentStatus !== "hired" && nextStatus === "hired") {
          nextHiredTotal = hiredTotal + 1;
        } else if (currentStatus === "hired" && nextStatus !== "hired") {
          nextHiredTotal = Math.max(hiredTotal - 1, 0);
        }

        const jobUpdatePayload = {};

        if (nextHiredTotal !== hiredTotal) {
          jobUpdatePayload.hired_total = nextHiredTotal;
        }

        if (
          isNewHire &&
          nextHiredTotal >= totalVacancy &&
          String(job.status || "").toLowerCase() !== "inactive"
        ) {
          jobUpdatePayload.status = "inactive";
          jobBecameInactive = true;
        }

        if (Object.keys(jobUpdatePayload).length) {
          await job.update(jobUpdatePayload, { transaction: t });
        }
      }

      if (isNewHire) {
        const employeeId = String(interest.sender_type || "").toLowerCase() === "employee"
          ? interest.sender_id
          : interest.receiver_id;

        if (employeeId) {
          const emp = await Employee.findByPk(employeeId, {
            attributes: ["id", "user_id"],
            paranoid: false,
            transaction: t,
          });
          if (emp?.user_id) {
            await User.update(
              { is_active: false },
              { where: { id: emp.user_id }, transaction: t }
            );
          }
        }
      }
    }

    await t.commit();

    let responseMessage =
      nextStatus === "hired"
        ? "Candidate hired successfully"
        : "Application rejected successfully";

    if (jobBecameInactive) {
      responseMessage = `${responseMessage}. All vacancies are filled and the job has been marked inactive.`;
    }

    if (currentStatus !== nextStatus) {
      try {
        const labels = await getJobProfileLabelsForNotification(interest.Job?.id);

        if (String(interest.sender_type || '').toLowerCase() === 'employee') {
          const employee = await Employee.findByPk(interest.sender_id, {
            paranoid: false,
            attributes: ['id', 'user_id', 'name', 'name_hindi'],
          });

          if (employee?.user_id) {
            const employeeUser = await User.findByPk(employee.user_id, {
              paranoid: false,
              attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
            });

            if (employeeUser) {
              await sendToUser({
                user: employeeUser,
                templateKey: nextStatus === 'hired' ? 'application.hired' : 'application.rejected',
                templateCtx: { job: labels.english || labels.hindi },
                data: {
                  reference_type: 'job',
                  reference_id: interest.Job?.id || null,
                  event: nextStatus === 'hired' ? 'application.hired' : 'application.rejected',
                },
              });
            }
          }
        }

        if (isNewHire) {
          try {
            const employeeIdForNotif = String(interest.sender_type || '').toLowerCase() === 'employee'
              ? interest.sender_id
              : interest.receiver_id;

            const [employeeForNotif, employerRecord] = await Promise.all([
              Employee.findByPk(employeeIdForNotif, { attributes: ['id', 'name', 'name_hindi'], paranoid: false }),
              Employer.findByPk(interest.Job?.employer_id, { attributes: ['id', 'user_id'], paranoid: false }),
            ]);

            const candidateNameEn = employeeForNotif?.name || 'A candidate';
            const candidateNameHi = employeeForNotif?.name_hindi || employeeForNotif?.name || 'एक उम्मीदवार';

            if (employerRecord?.user_id) {
              const employerUser = await User.findByPk(employerRecord.user_id, {
                paranoid: false,
                attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
              });

              if (employerUser) {
                await sendToUser({
                  user: employerUser,
                  templateKey: 'application.hired.employer',
                  templateCtx: { candidate: candidateNameEn, job: labels.english || labels.hindi },
                  data: {
                    reference_type: 'job',
                    reference_id: interest.Job?.id || null,
                    event: 'application.hired.employer',
                  },
                });
              }
            }
          } catch (employerNotifError) {
            console.error('[app/employers/:employerId/applicants/status] employer hired notification failed', employerNotifError);
          }
        }

        if (jobBecameInactive) {
          const employer = await Employer.findByPk(interest.Job?.employer_id, {
            paranoid: false,
            attributes: ['id', 'user_id'],
          });

          if (employer?.user_id) {
            const employerUser = await User.findByPk(employer.user_id, {
              paranoid: false,
              attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
            });

            if (employerUser) {
              await notifyUser({
                user: employerUser,
                titleEnglish: 'Job marked inactive',
                titleHindi: 'जॉब निष्क्रिय कर दी गई',
                bodyEnglish: `All vacancies for the ${labels.english} job have been filled. The job has been marked inactive.`,
                bodyHindi: `${labels.hindi} जॉब की सभी वैकेंसी भर गई हैं। जॉब को निष्क्रिय कर दिया गया है।`,
                referenceType: 'job',
                referenceId: interest.Job?.id || null,
                extraData: {
                  event: 'job.auto_inactive.vacancy_filled',
                  entity: 'job',
                  entity_id: String(interest.Job?.id || ''),
                },
              });
            }
          }
        }
      } catch (notificationError) {
        console.error('[app/employers/:employerId/applicants/status] notification failed', notificationError);
      }
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: responseMessage,
      data: {
        employer_id: employerId,
        job_interest_id: jobInterestId,
        status: nextStatus,
        hired_total: nextHiredTotal,
        total_vacancy: totalVacancy,
        job_status: jobBecameInactive ? 'inactive' : String(interest.Job?.status || '').toLowerCase() || null,
        job_became_inactive: jobBecameInactive,
      },
    });
  } catch (error) {
    try {
      await t.rollback();
    } catch (_e) {}
    console.error("[app/employers/:employerId/applicants/status]", error);
    return sendApiResponse(res, { ok: false, code: "FC_99", message: error.message || "Failed to update applicant status", data: null });
  }
}




async function getEmployerJobDetail(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    const jobId = toInt(req.params?.jobId ?? req.query?.jobId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!jobId || jobId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid job id is required", data: null });
    }

    const jobRow = await Job.findOne({
      where: { id: jobId, employer_id: employerId },
      paranoid: false,
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "job_designation_english",
        "job_designation_hindi",
        "is_household",
        "description_english",
        "description_hindi",
        "interviewer_contact",
        "status",
        "verification_status",
        "salary_type_id",
        "salary_min",
        "salary_max",
        "no_vacancy",
        "hired_total",
        "job_state_id",
        "job_city_id",
        "job_address_english",
        "job_address_hindi",
        "job_location",
        "lat",
        "lng",
        "work_start_time",
        "work_end_time",
        "expired_at",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi", "organization_type", "verification_status", "kyc_status"],
          required: false,
          paranoid: false,
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: JobGender, as: "JobGenders", attributes: ["gender"], required: false },
        { model: JobExperience, as: "JobExperiences", attributes: ["experience_id"], required: false },
        { model: JobQualification, as: "JobQualifications", attributes: ["qualification_id"], required: false },
        { model: JobShift, as: "JobShifts", attributes: ["shift_id"], required: false },
        { model: JobSkill, as: "JobSkills", attributes: ["skill_id"], required: false },
        { model: SelectedJobBenefit, as: "SelectedJobBenefits", attributes: ["benefit_id"], required: false },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
    });

    if (!jobRow) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Job not found", data: null });
    }

    const job = jobRow?.toJSON ? jobRow.toJSON() : jobRow;

    const daysRows = await JobDay.findAll({
      where: { job_id: jobId },
      attributes: ["day"],
      order: [["created_at", "ASC"]],
      paranoid: false,
    });
    const jobDays = (daysRows || []).map((d) => d?.day).filter(Boolean);

    const skillIds = (job?.JobSkills || []).map((x) => x?.skill_id).filter(Boolean);
    const experienceIds = (job?.JobExperiences || []).map((x) => x?.experience_id).filter(Boolean);
    const qualificationIds = (job?.JobQualifications || []).map((x) => x?.qualification_id).filter(Boolean);
    const benefitIds = (job?.SelectedJobBenefits || []).map((x) => x?.benefit_id).filter(Boolean);
    const shiftIds = (job?.JobShifts || []).map((x) => x?.shift_id).filter(Boolean);
    const genders = (job?.JobGenders || []).map((x) => x?.gender).filter(Boolean);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job details fetched successfully",
      data: {
        // Full edit payload (used by Flutter AddJobScreen in edit mode)
        id: job?.id || null,
        job_id: job?.id || null,
        employer_id: job?.employer_id || null,
        job_profile_id: job?.job_profile_id || null,
        job_designation:
          job?.job_designation_english || job?.job_designation_hindi || null,
        job_designation_english: job?.job_designation_english || null,
        job_designation_hindi: job?.job_designation_hindi || null,
        salary_type_id: job?.salary_type_id || null,
        salary_min: job?.salary_min ?? null,
        salary_max: job?.salary_max ?? null,
        no_vacancy: job?.no_vacancy ?? null,
        interviewer_contact: job?.interviewer_contact || null,
        job_state_id: job?.job_state_id || null,
        job_city_id: job?.job_city_id || null,
        job_address_english: job?.job_address_english || null,
        job_address_hindi: job?.job_address_hindi || null,
        job_location: job?.job_location || null,
        lat: job?.lat ?? null,
        lng: job?.lng ?? null,
        work_start_time: job?.work_start_time || null,
        work_end_time: job?.work_end_time || null,
        description_english: job?.description_english || null,
        description_hindi: job?.description_hindi || null,
        is_household: job?.is_household === true,
        skill_ids: skillIds,
        experience_ids: experienceIds,
        qualification_ids: qualificationIds,
        job_benefit_ids: benefitIds,
        shift_ids: shiftIds,
        genders,
        job_days: jobDays,

        // Summary/detail UI fields (backward compatible)
        ...mapJobProfileNameFields(job),
        employer_name: job?.Employer?.name || null,
        employer_name_english: job?.Employer?.name || null,
        employer_name_hindi: job?.Employer?.name_hindi || null,
        organization_name: job?.Employer?.organization_name || null,
        organization_name_english: job?.Employer?.organization_name || null,
        organization_name_hindi: job?.Employer?.organization_name_hindi || null,
        organization_type: job?.Employer?.organization_type || null,
        employer_verification_status: job?.Employer?.verification_status || null,
        kyc_status: job?.Employer?.kyc_status || null,
        job_status: job?.status || null,
        city: job?.JobCity?.city_english || job?.JobCity?.city_hindi || null,
        city_english: job?.JobCity?.city_english || null,
        city_hindi: job?.JobCity?.city_hindi || null,
        state: job?.JobState?.state_english || job?.JobState?.state_hindi || null,
        state_english: job?.JobState?.state_english || null,
        state_hindi: job?.JobState?.state_hindi || null,
        ...mapJobSalaryFrequencyFields(job),
        hired_total: job?.hired_total ?? null,
        verification_status: job?.verification_status || null,
        expired_at: job?.expired_at || null,
        created_at: job?.created_at || null,
        updated_at: job?.updated_at || null,
      },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/jobs/:jobId/detail]", error);
    return sendApiResponse(res, { ok: false, code: "FC_99", message: error.message || "Failed to fetch job details", data: null });
  }
}


async function getEmployerJobs(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const page = normalizePage(req.query?.page);
    const limit = normalizeLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await Job.findAndCountAll({
      where: { employer_id: employerId },
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "job_designation_english",
        "job_designation_hindi",
        "status",
        "verification_status",
        "salary_type_id",
        "salary_min",
        "salary_max",
        "no_vacancy",
        "hired_total",
        "job_state_id",
        "job_city_id",
        "job_address_english",
        "job_address_hindi",
        "lat",
        "lng",
        "expired_at",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi", "organization_type"],
          required: false,
          paranoid: false,
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
      order: [["id", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const jobs = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));

    const results = jobs.map((job) => {
      const org = mapOrganizationNameFields(job);
      const profile = mapJobProfileNameFields(job);
      const salary = mapJobSalaryFrequencyFields(job);
      const stateName = job?.JobState?.state_english || job?.JobState?.state_hindi || null;
      const cityName = job?.JobCity?.city_english || job?.JobCity?.city_hindi || null;

      return {
        ...job,
        employer_name: job?.Employer?.name || null,
        employer_name_english: job?.Employer?.name || null,
        employer_name_hindi: job?.Employer?.name_hindi || null,
        organization_name: org.organization_name,
        organization_name_english: org.organization_name_english,
        organization_name_hindi: org.organization_name_hindi,
        organization_type: job?.Employer?.organization_type || null,
        job_profile: profile.job_profile_name,
        job_profile_english: profile.job_profile_name_english,
        job_profile_hindi: profile.job_profile_name_hindi,
        job_designation:
          job?.job_designation_english || job?.job_designation_hindi || null,
        job_designation_english: job?.job_designation_english || null,
        job_designation_hindi: job?.job_designation_hindi || null,
        salary_type: salary.salary_frequency,
        salary_type_english: salary.salary_frequency_english,
        salary_type_hindi: salary.salary_frequency_hindi,
        job_state: stateName,
        job_state_english: job?.JobState?.state_english || null,
        job_state_hindi: job?.JobState?.state_hindi || null,
        job_city: cityName,
        job_city_english: job?.JobCity?.city_english || null,
        job_city_hindi: job?.JobCity?.city_hindi || null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employer jobs fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/jobs]", error);
    return sendApiResponse(res, { ok: false, code: "FC_02", message: error.message || "Failed to fetch employer jobs", data: null });
  }
}


async function saveEmployerJob(req, res) {
  let t;
  try {
    const normalizeText = (value) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text || null;
    };

    const employerId = toInt(req.params?.employerId ?? req.body?.employer_id ?? req.body?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const body = req.body || {};
    const jobId = toInt(body.id ?? body.job_id ?? body.jobId);
    const isCreate = !jobId;

    const candidate = { ...body };

    if (candidate.job_state_id === undefined && candidate.state_id !== undefined) candidate.job_state_id = candidate.state_id;
    if (candidate.job_city_id === undefined && candidate.city_id !== undefined) candidate.job_city_id = candidate.city_id;

    candidate.employer_id = employerId;
    if (isCreate) {
      candidate.verification_status = "pending";
    }

    // Never allow changing these via payload (controlled by server)
    delete candidate.status;
    delete candidate.hired_total;
    if (!isCreate) delete candidate.expired_at;

    const allowed = new Set(Object.keys(Job?.rawAttributes || {}));
    const jobPayload = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (!allowed.has(k)) continue;
      if (v === undefined) continue;
      jobPayload[k] = v;
    }

    try {
      await applyJobBilingualFields(jobPayload);
    } catch (e) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: e.message || "Failed to translate fields", data: null });
    }

    const skillIds = parseIdList(body.skill_ids ?? body.skills ?? body.skillIds);
    const experienceIds = parseIdList(body.experience_ids ?? body.experiences ?? body.experienceIds);
    const qualificationIds = parseIdList(body.qualification_ids ?? body.qualifications ?? body.qualificationIds);
    const benefitIds = parseIdList(body.job_benefit_ids ?? body.job_benefits ?? body.jobBenefitIds ?? body.benefit_ids);
    const shiftIds = parseIdList(body.shift_ids ?? body.shifts ?? body.shift_id ?? body.shiftId);

    const genders = parseStringList(body.genders).map(normalizeGender).filter(Boolean);
    const jobDays = parseStringList(body.job_days ?? body.jobDays).map(normalizeJobDay).filter(Boolean);

    const hasKey = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const shouldUpdate = (keys) => isCreate || keys.some((k) => hasKey(k));

    t = await sequelize.transaction();

    let job;

    if (isCreate) {
      const employer = await Employer.findByPk(employerId, { transaction: t, lock: t.LOCK.UPDATE, paranoid: false });
      if (!employer) {
        await t.rollback();
        t = null;
        return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
      }

      const expiryAtRaw = employer.credit_expiry_at ? new Date(employer.credit_expiry_at) : null;
      const expiryAt = expiryAtRaw && !Number.isNaN(expiryAtRaw.getTime()) ? expiryAtRaw : null;
      const creditsExpired = !expiryAt || expiryAt.getTime() <= Date.now();

      const remainingAd = Number(employer.ad_credit || 0);
      if (creditsExpired || remainingAd < 1) {
        await t.rollback();
        t = null;
        return sendApiResponse(res, {
          ok: false,
          code: "NO_AD_CREDIT",
          message: creditsExpired ? "Employer credits have expired" : "No credit found",
          data: { ad_credit: remainingAd, credit_expiry_at: employer.credit_expiry_at },
        });
      }

      await employer.update({ ad_credit: remainingAd - 1 }, { transaction: t });

      job = await Job.create(
        {
          ...jobPayload,
          employer_id: employerId,
          hired_total: 0,
          status: "inactive",
          expired_at: expiryAt,
          verification_status: "pending",
          job_designation_english: jobPayload.job_designation_english ?? null,
          job_designation_hindi: jobPayload.job_designation_hindi ?? null,
        },
        { transaction: t }
      );
    } else {
      job = await Job.findOne({ where: { id: jobId, employer_id: employerId }, transaction: t, lock: t.LOCK.UPDATE, paranoid: false });
      if (!job) {
        await t.rollback();
        t = null;
        return sendApiResponse(res, { ok: false, code: "FC_04", message: "Job not found", data: null });
      }

      const expiredAtRaw = job.expired_at ? new Date(job.expired_at) : null;
      const expiredAt = expiredAtRaw && !Number.isNaN(expiredAtRaw.getTime()) ? expiredAtRaw : null;
      const isExpired = String(job.status || "").toLowerCase() === "expired" || (expiredAt && expiredAt.getTime() <= Date.now());
      if (isExpired) {
        await t.rollback();
        t = null;
        return sendApiResponse(res, { ok: false, code: "JOB_EXPIRED", message: "Expired job cannot be edited", data: null });
      }

      delete jobPayload.job_profile_id;

      const nextDescriptionEnglish = Object.prototype.hasOwnProperty.call(jobPayload, 'description_english')
        ? normalizeText(jobPayload.description_english)
        : normalizeText(job.description_english);
      const nextDescriptionHindi = Object.prototype.hasOwnProperty.call(jobPayload, 'description_hindi')
        ? normalizeText(jobPayload.description_hindi)
        : normalizeText(job.description_hindi);

      const currentDescriptionEnglish = normalizeText(job.description_english);
      const currentDescriptionHindi = normalizeText(job.description_hindi);
      const descriptionChanged =
        nextDescriptionEnglish !== currentDescriptionEnglish ||
        nextDescriptionHindi !== currentDescriptionHindi;

      const updatePayload = {
        ...jobPayload,
        employer_id: employerId,
      };

      if (descriptionChanged) {
        updatePayload.verification_status = "pending";
        updatePayload.status = "inactive";
      }

      await job.update(updatePayload, { transaction: t });
    }

    const jobIdFinal = job.id;

    const replaceRows = async (Model, rows) => {
      await Model.destroy({ where: { job_id: jobIdFinal }, transaction: t });
      if (rows && rows.length) await Model.bulkCreate(rows, { transaction: t });
    };

    if (shouldUpdate(["skill_ids", "skills", "skillIds"])) {
      await replaceRows(JobSkill, skillIds.map((skill_id) => ({ job_id: jobIdFinal, skill_id })));
    }

    if (shouldUpdate(["experience_ids", "experiences", "experienceIds"])) {
      await replaceRows(JobExperience, experienceIds.map((experience_id) => ({ job_id: jobIdFinal, experience_id })));
    }

    if (shouldUpdate(["qualification_ids", "qualifications", "qualificationIds"])) {
      await replaceRows(JobQualification, qualificationIds.map((qualification_id) => ({ job_id: jobIdFinal, qualification_id })));
    }

    if (shouldUpdate(["job_benefit_ids", "job_benefits", "jobBenefitIds", "benefit_ids"])) {
      await replaceRows(SelectedJobBenefit, benefitIds.map((benefit_id) => ({ job_id: jobIdFinal, benefit_id })));
    }

    if (shouldUpdate(["shift_ids", "shifts", "shift_id", "shiftId"])) {
      await replaceRows(JobShift, shiftIds.map((shift_id) => ({ job_id: jobIdFinal, shift_id })));
    }

    if (shouldUpdate(["genders"])) {
      await replaceRows(JobGender, genders.map((gender) => ({ job_id: jobIdFinal, gender })));
    }

    if (shouldUpdate(["job_days", "jobDays"])) {
      await replaceRows(JobDay, jobDays.map((day) => ({ job_id: jobIdFinal, day })));
    }

    await t.commit();
    t = null;

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: isCreate ? "Job created successfully" : "Job updated successfully",
      data: { job_id: jobIdFinal, job: job?.toJSON ? job.toJSON() : job },
    });
  } catch (error) {
    if (t) {
      try { await t.rollback(); } catch (_e) {}
    }
    console.error("[app/employers/:employerId/jobs/save]", error);
    return sendApiResponse(res, { ok: false, code: "FC_99", message: error.message || "Failed to save job", data: null });
  }
}


module.exports = {
  buySubscription,
  getSubscriptionPaymentStatusByOrderId,
  getEmployerPaymentHistory,
  saveEmployerJob,
  getEmployerJobs,
  getEmployerJobDetail,
  getEmployerById,
  getEmployerSubscriptions,
  saveEmployerPersonalInfo,
  sendEmployerAadharOtp,
  verifyEmployerAadharOtp,
  uploadEmployerDocument,
  getEmployerApplicants,
  getEmployerReceivedApplicants,
  getEmployerSentApplicants,
  getEmployerShortlistedApplicants,
  getEmployerHiredApplicants,
  getEmployerRejectedApplicants,
  updateEmployerApplicantStatus,
  getEmployerContactHistory,
  getEmployerInterestHistory,
  getEmployerAdsHistory,
};

