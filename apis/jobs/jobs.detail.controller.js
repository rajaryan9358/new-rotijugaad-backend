const { sendApiResponse, getRequestOrigin } = require("../_helpers/response");

const Sequelize = require("sequelize");
const { Op } = Sequelize;
const crypto = require("crypto");

const {
  Job,
  Employer,
  Employee,
  User,
  JobProfile,
  SalaryType,
  EmployeeSubscriptionPlan,
  JobGender,
  JobExperience,
  Experience,
  JobQualification,
  Qualification,
  JobShift,
  Shift,
  JobSkill,
  Skill,
  SelectedJobBenefit,
  JobBenefit,
  State,
  City,
  JobInterest,
  JobDay,
} = require("../../models");

const BusinessCategory = require("../../models/BusinessCategory");
const EmployeeContact = require("../../models/EmployeeContact");
const CallHistory = require("../../models/CallHistory");
const EmployeeCallExperience = require("../../models/EmployeeCallExperience");
const PlanBenefit = require("../../models/PlanBenefit");
const { fillBilingualPair } = require('../../utils/bilingual');
const Report = require("../../models/Report");
const EmployerReportReason = require("../../models/EmployerReportReason");
const Wishlist = require("../../models/Wishlist");
const PaymentHistory = require("../../models/PaymentHistory");
const { notifyUser } = require('../../utils/userNotifications');
const { sendToUser } = require('../../utils/systemNotifications');
const {
  findAllWithOptionalAttribute,
  findByPkWithOptionalAttribute,
} = require('../../utils/optionalDiscountedPrice');
const {
  createSubscriptionOrder,
  getSubscriptionPaymentStatus,
} = require('../../utils/cashfreeSubscriptionPayments');

const SUCCESS_CODE = "SC_01";

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildJobShareLink(req, slug) {
  const s = String(slug || '').trim();
  if (!s) return null;

  const origin = stripTrailingSlash(getRequestOrigin(req));
  if (!origin) return null;

  return `${origin}/app/jobs/${encodeURIComponent(s)}`;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
    attributes: [
      'id',
      'plan_id',
      'benefit_english',
      'benefit_hindi',
      'sequence',
      'is_active',
      'created_at',
      'updated_at',
    ],
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

async function getJobProfileLabels(jobId) {
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

function enrichJobBilingualFields(job, employer) {
  if (!job) return job;

  const jobProfileEnglish = job?.JobProfile?.profile_english || null;
  const jobProfileHindi = job?.JobProfile?.profile_hindi || null;
  const salaryTypeEnglish = job?.SalaryType?.type_english || null;
  const salaryTypeHindi = job?.SalaryType?.type_hindi || null;
  const stateEnglish = job?.JobState?.state_english || null;
  const stateHindi = job?.JobState?.state_hindi || null;
  const cityEnglish = job?.JobCity?.city_english || null;
  const cityHindi = job?.JobCity?.city_hindi || null;

  job.job_profile = job.job_profile || jobProfileEnglish || jobProfileHindi || null;
  job.job_profile_english = job.job_profile_english || jobProfileEnglish;
  job.job_profile_hindi = job.job_profile_hindi || jobProfileHindi;

  job.job_designation =
    job.job_designation ||
    job.job_designation_english ||
    job.job_designation_hindi ||
    null;

  job.salary_type = job.salary_type || salaryTypeEnglish || salaryTypeHindi || null;
  job.salary_type_english = job.salary_type_english || salaryTypeEnglish;
  job.salary_type_hindi = job.salary_type_hindi || salaryTypeHindi;

  job.job_state = job.job_state || stateEnglish || stateHindi || null;
  job.job_state_english = job.job_state_english || stateEnglish;
  job.job_state_hindi = job.job_state_hindi || stateHindi;

  job.job_city = job.job_city || cityEnglish || cityHindi || null;
  job.job_city_english = job.job_city_english || cityEnglish;
  job.job_city_hindi = job.job_city_hindi || cityHindi;

  if (employer) {
    job.employer_name = job.employer_name || employer.name || null;
    job.employer_name_english = job.employer_name_english || employer.name || null;
    job.employer_name_hindi = job.employer_name_hindi || employer.name_hindi || null;

    job.organization_name =
      job.organization_name || employer.organization_name || employer.name || null;
    job.organization_name_english =
      job.organization_name_english || employer.organization_name || employer.name || null;
    job.organization_name_hindi =
      job.organization_name_hindi || employer.organization_name_hindi || employer.name_hindi || null;

    job.organization_type = job.organization_type || employer.organization_type || null;
  }

  return job;
}

async function resolveEmployeeFromParam(param) {
  const id = toInt(param);
  if (!id) return { employee: null, userId: null };

  // Backward compatibility: accept employeeId too.
  let employee = await Employee.findByPk(id);
  if (employee) return { employee, userId: employee.user_id };

  return { employee: null, userId: null };
}

function generateOtp(length = 4) {
  const len = Number(length) || 4;
  const max = 10 ** len;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(len, "0");
}

async function getJobDetail(req, res) {
  try {
    const jobId = toInt(req.params?.jobId);
    const employeeId = toInt(req.params?.employeeId);

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    const job = await Job.findByPk(jobId, {
      paranoid: true,
      attributes: [
        "id",
        "slug",
        "employer_id",
        "job_profile_id",
        "job_designation_english",
        "job_designation_hindi",
        "salary_type_id",
        "is_household",
        "description_english",
        "description_hindi",
        "no_vacancy",
        "hired_total",
        "interviewer_contact",
        "job_address_english",
        "job_address_hindi",
        "job_state_id",
        "job_city_id",
        "job_location",
        "lat",
        "lng",
        "other_benefit_english",
        "other_benefit_hindi",
        "salary_min",
        "salary_max",
        "work_start_time",
        "work_end_time",
        "status",
        "verification_status",
        "show_organization",
        "created_at",
        "updated_at",
        "expired_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi", "organization_type", "state_id", "city_id", "business_category_id", "verification_status", "kyc_status"],
          required: false,
          paranoid: false,
          include: [
            { model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false },
            { model: BusinessCategory, as: "BusinessCategory", attributes: ["id", "category_english", "category_hindi"], required: false },
          ],
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: JobGender, as: "JobGenders", attributes: ["gender"], required: false },
        {
          model: JobExperience,
          as: "JobExperiences",
          attributes: ["experience_id"],
          required: false,
          include: [{ model: Experience, as: "Experience", attributes: ["id", "title_english", "title_hindi", "exp_from", "exp_to"], required: false }],
        },
        {
          model: JobQualification,
          as: "JobQualifications",
          attributes: ["qualification_id"],
          required: false,
          include: [{ model: Qualification, as: "Qualification", attributes: ["id", "qualification_english", "qualification_hindi"], required: false }],
        },
        {
          model: JobShift,
          as: "JobShifts",
          attributes: ["shift_id"],
          required: false,
          include: [{ model: Shift, as: "Shift", attributes: ["id", "shift_english", "shift_hindi"], required: false }],
        },
        {
          model: JobSkill,
          as: "JobSkills",
          attributes: ["skill_id"],
          required: false,
          include: [{ model: Skill, as: "Skill", attributes: ["id", "skill_english", "skill_hindi"], required: false }],
        },
        {
          model: SelectedJobBenefit,
          as: "SelectedJobBenefits",
          attributes: ["benefit_id"],
          required: false,
          include: [{ model: JobBenefit, as: "JobBenefit", attributes: ["id", "benefit_english", "benefit_hindi"], required: false }],
        },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
    });

    if (!job) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Job not found", data: null });
    }

    const contactRow = await EmployeeContact.findOne({
      where: { employee_id: employeeId, job_id: jobId },
      attributes: ["id", "created_at", "call_experience_id"],
      paranoid: true,
    });

    const isContactUnlocked = Boolean(contactRow);
    const contactUnlockedAt = contactRow?.created_at || null;

    const isCallExperienceShared = Boolean(contactRow?.call_experience_id);

    const interestRowSent = await JobInterest.findOne({
      where: { job_id: jobId, sender_id: employeeId, sender_type: "employee" },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "otp", "otp_unlocked_at", "created_at", "updated_at"],
      paranoid: true,
      order: [["created_at", "DESC"]],
    });

    const interestRowReceived = await JobInterest.findOne({
      where: { job_id: jobId, receiver_id: employeeId, sender_type: "employer" },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "otp", "otp_unlocked_at", "created_at", "updated_at"],
      paranoid: true,
      order: [["created_at", "DESC"]],
    });

    let interestRow = interestRowSent || interestRowReceived;
    if (interestRowSent && interestRowReceived) {
      const a = new Date(interestRowSent.created_at || 0).getTime();
      const b = new Date(interestRowReceived.created_at || 0).getTime();
      interestRow = b > a ? interestRowReceived : interestRowSent;
    }

    const hasInterest = Boolean(interestRow);
    const interestDirection = hasInterest
      ? interestRow.sender_type === "employee"
        ? "sent"
        : "received"
      : null;
    const isInterestSent = interestDirection === "sent";
    const isInterestReceived = interestDirection === "received";

    const interestStatus = interestRow?.status || null;
    const interestSentAt = interestRow?.created_at || null;

    const reportRow = await Report.findOne({
      where: { user_id: employeeId, report_id: jobId, report_type: "job" },
      attributes: ["id", "created_at"],
      paranoid: true,
      order: [["created_at", "DESC"]],
    });

    const isJobReported = Boolean(reportRow);
    const jobReportedAt = reportRow?.created_at || null;

    const wishlistRow = await Wishlist.findOne({
      where: { employee_id: employeeId, job_id: jobId },
      attributes: ["id", "created_at"],
    });

    const isInWishlist = Boolean(wishlistRow);
    const wishlistAddedAt = wishlistRow?.created_at || null;

    const days = await JobDay.findAll({
      where: { job_id: jobId },
      attributes: ["day", "created_at"],
      order: [["created_at", "ASC"]],
      paranoid: false,
    });

    const jobData = job.toJSON ? job.toJSON() : job;
    enrichJobBilingualFields(jobData, jobData.Employer);

    // Provide a shareable deep-link URL for the client.
    jobData.share_link = buildJobShareLink(req, jobData.slug);

    const skillsIds = (jobData.JobSkills || []).map((x) => x.skill_id).filter(Boolean);
    const experiencesIds = (jobData.JobExperiences || []).map((x) => x.experience_id).filter(Boolean);
    const genders = (jobData.JobGenders || []).map((x) => x.gender).filter(Boolean);
    const qualificationsIds = (jobData.JobQualifications || []).map((x) => x.qualification_id).filter(Boolean);
    const shiftsIds = (jobData.JobShifts || []).map((x) => x.shift_id).filter(Boolean);
    const jobBenefitsIds = (jobData.SelectedJobBenefits || []).map((x) => x.benefit_id).filter(Boolean);

    const skills = (jobData.JobSkills || []).map((x) => x.Skill?.skill_english || x.Skill?.skill_hindi).filter(Boolean);
    const experiences = (jobData.JobExperiences || []).map((x) => x.Experience?.title_english || x.Experience?.title_hindi).filter(Boolean);
    const qualifications = (jobData.JobQualifications || []).map((x) => x.Qualification?.qualification_english || x.Qualification?.qualification_hindi).filter(Boolean);
    const shifts = (jobData.JobShifts || []).map((x) => x.Shift?.shift_english || x.Shift?.shift_hindi).filter(Boolean);
    const benefits = (jobData.SelectedJobBenefits || []).map((x) => x.JobBenefit?.benefit_english || x.JobBenefit?.benefit_hindi).filter(Boolean);

    jobData.skills_ids = skillsIds;
    jobData.experiences_ids = experiencesIds;
    jobData.genders = genders;
    jobData.qualifications_ids = qualificationsIds;
    jobData.shifts_ids = shiftsIds;
    jobData.job_benefits_ids = jobBenefitsIds;

    jobData.skills = Array.from(new Set(skills));
    jobData.experiences = Array.from(new Set(experiences));
    jobData.qualifications = Array.from(new Set(qualifications));
    jobData.shifts = Array.from(new Set(shifts));
    jobData.benefits = Array.from(new Set(benefits));
    jobData.selected_benefits = (jobData.SelectedJobBenefits || [])
      .map((x) => ({
        id: x.benefit_id || null,
        benefit_english: x.JobBenefit?.benefit_english || null,
        benefit_hindi: x.JobBenefit?.benefit_hindi || null,
      }))
      .filter((x) => x.id);

    jobData.salary_type = jobData.SalaryType ? (jobData.SalaryType.type_english || jobData.SalaryType.type_hindi || null) : null;
    jobData.job_state = jobData.JobState ? (jobData.JobState.state_english || jobData.JobState.state_hindi || null) : null;
    jobData.job_city = jobData.JobCity ? (jobData.JobCity.city_english || jobData.JobCity.city_hindi || null) : null;

    jobData.job_days = (days || []).map((d) => d.day).filter(Boolean);

    const interviewerContact = jobData.interviewer_contact ?? null;
    const jobAddressEnglish = jobData.job_address_english ?? null;
    const jobAddressHindi = jobData.job_address_hindi ?? null;

    delete jobData.interviewer_contact;
    delete jobData.job_address_english;
    delete jobData.job_address_hindi;

    jobData.contact = {
      is_unlocked: isContactUnlocked,
      unlocked_at: contactUnlockedAt,
      ...(isContactUnlocked
        ? {
            interviewer_contact: interviewerContact,
            job_address_english: jobAddressEnglish,
            job_address_hindi: jobAddressHindi,
          }
        : {}),
    };

    jobData.interest = {
      has_interest: hasInterest,
      direction: interestDirection,
      is_sent: isInterestSent,
      is_received: isInterestReceived,
      id: interestRow?.id || null,
      sender_type: interestRow?.sender_type || null,
      sender_id: interestRow?.sender_id || null,
      receiver_id: interestRow?.receiver_id || null,
      status: interestStatus,
      status_at: interestSentAt,
      otp_unlocked_at: interestRow?.otp_unlocked_at || null,
      otp: interestRow?.otp_unlocked_at ? (interestRow?.otp || null) : null,
    };

    jobData.report = {
      is_reported: isJobReported,
      reported_at: jobReportedAt,
    };

    jobData.wishlist = {
      is_in_wishlist: isInWishlist,
      wishlist_id: wishlistRow?.id || null,
      added_at: wishlistAddedAt,
    };

    jobData.flags = {
      has_job_interest: hasInterest,
      is_reported: isJobReported,
      is_in_wishlist: isInWishlist,
    };

    jobData.call_experience = {
      is_shared: isCallExperienceShared,
    };

    // Employee subscription + credits
    const employee = await Employee.findByPk(employeeId, {
      paranoid: true,
      attributes: [
        'id',
        'subscription_plan_id',
        'credit_expiry_at',
        'total_contact_credit',
        'contact_credit',
        'total_interest_credit',
        'interest_credit',
      ],
    });

    const emp = employee ? (employee.toJSON ? employee.toJSON() : employee) : null;

    const subscriptionPlanId = emp?.subscription_plan_id || null;
    const creditExpiryAt = emp?.credit_expiry_at || null;
    const expiryMs = creditExpiryAt ? new Date(creditExpiryAt).getTime() : null;
    const nowMs = Date.now();

    const hasPlan = Boolean(subscriptionPlanId);
    const isExpired = !expiryMs ? true : expiryMs < nowMs;
    const isActive = hasPlan && !isExpired;

    const subscriptionStatus = isActive ? 'active' : hasPlan ? 'expired' : 'none';

    jobData.subscription_status = subscriptionStatus;
  jobData.credit_expiry_at = creditExpiryAt;
    jobData.contact_credit_available = emp?.contact_credit ?? 0;
    jobData.interest_credit_available = emp?.interest_credit ?? 0;
    jobData.contact_credit_total = emp?.total_contact_credit ?? 0;
    jobData.interest_credit_total = emp?.total_interest_credit ?? 0;

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job detail fetched successfully",
      data: jobData,
    });
  } catch (error) {
    console.error("[app/jobs/detail]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: error.message || "Failed to fetch job detail",
      data: null,
    });
  }
}


async function unlockJobContact(req, res) {
  try {
    const jobId = toInt(req.body?.job_id ?? req.body?.jobId);
    const employeeId = toInt(req.body?.employee_id ?? req.body?.employeeId);

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    const result = await Job.sequelize.transaction(async (transaction) => {
      const job = await Job.findByPk(jobId, {
        paranoid: true,
        attributes: ["id", "employer_id", "interviewer_contact", "job_address_english", "job_address_hindi"],
        transaction,
      });

      if (!job) {
        return { ok: false, code: "FC_03", message: "Job not found" };
      }

      let contactRow = await EmployeeContact.findOne({
        where: { employee_id: employeeId, job_id: jobId },
        attributes: ["id", "employee_id", "job_id", "employer_id", "created_at", "deleted_at"],
        order: [["created_at", "ASC"]],
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (contactRow) {
        if (contactRow.deleted_at) {
          await contactRow.restore({ transaction });
        }
      } else {
        const employee = await Employee.findByPk(employeeId, {
          paranoid: true,
          attributes: ["id", "contact_credit"],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!employee) {
          return { ok: false, code: "FC_05", message: "Employee not found" };
        }

        const available = Number(employee.contact_credit || 0);
        if (!Number.isFinite(available) || available < 1) {
          return { ok: false, code: "FC_06", message: "No contact credits remaining" };
        }

        await employee.update({ contact_credit: Math.max(available - 1, 0) }, { transaction });

        contactRow = await EmployeeContact.create(
          {
            employee_id: employeeId,
            job_id: jobId,
            employer_id: job.employer_id,
          },
          { transaction },
        );
      }

      return { ok: true, job, unlockedAt: contactRow?.created_at || null };
    });

    if (!result.ok) {
      return sendApiResponse(res, { ok: false, code: result.code, message: result.message, data: null });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Contact unlocked successfully",
      data: {
        employee_id: employeeId,
        job_id: jobId,
        contact: {
          is_unlocked: true,
          unlocked_at: result.unlockedAt,
          interviewer_contact: result.job.interviewer_contact || null,
          job_address_english: result.job.job_address_english || null,
          job_address_hindi: result.job.job_address_hindi || null,
        },
      },
    });
  } catch (error) {
    console.error("[app/jobs/unlock-contact]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: error.message || "Failed to unlock contact",
      data: null,
    });
  }
}


async function saveContactCallExperience(req, res) {
  try {
    const body = req.body || {};
    const jobId = toInt(body.job_id || body.jobId);
    const employeeId = toInt(body.employee_id || body.employeeId);
    const callExperienceId = toInt(body.call_experience_id || body.callExperienceId);
    const review = body.review === undefined || body.review === null ? null : String(body.review).trim() || null;
    const reviewHindi = body.review_hindi === undefined || body.review_hindi === null ? null : String(body.review_hindi).trim() || null;

    const reviewPair = await fillBilingualPair(review, reviewHindi);

    if (jobId === null) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (employeeId === null) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    let contactRow = await EmployeeContact.findOne({
      where: { employee_id: employeeId, job_id: jobId },
      paranoid: false,
    });

    if (contactRow === null) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Contact is not unlocked for this job", data: null });
    }

    if (contactRow.deleted_at) {
      await contactRow.restore();
    }

    if (callExperienceId !== null) {
      const exp = await EmployeeCallExperience.findByPk(callExperienceId, { paranoid: false });
      const isActive = exp && (exp.is_active === undefined || exp.is_active === null || Boolean(exp.is_active));
      if (!exp || exp.deleted_at || !isActive) {
        return sendApiResponse(res, { ok: false, code: "FC_04", message: "Invalid call experience id", data: null });
      }
    }

    let history = null;
    if (contactRow.call_experience_id) {
      history = await CallHistory.findByPk(contactRow.call_experience_id, { paranoid: false });
      if (history && history.deleted_at) {
        await history.restore();
      }
      if (history) {
        await history.update({
          user_type: "employee",
          user_id: employeeId,
          called_id: jobId,
          call_experience_id: callExperienceId,
          review: reviewPair.english,
          review_hindi: reviewPair.hindi,
        });
      }
    }

    if (history === null) {
      history = await CallHistory.create({
        user_type: "employee",
        user_id: employeeId,
        called_id: jobId,
        call_experience_id: callExperienceId,
        review: reviewPair.english,
        review_hindi: reviewPair.hindi,
      });
      await contactRow.update({ call_experience_id: history.id });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Call experience saved successfully",
      data: {
        employee_id: employeeId,
        job_id: jobId,
        call_history_id: history.id,
        call_experience_id: history.call_experience_id || null,
        review: history.review || null,
        review_hindi: history.review_hindi || null,
        created_at: history.created_at || null,
      },
    });
  } catch (error) {
    console.error("[app/jobs/call-experience]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_05",
      message: error.message || "Failed to save call experience",
      data: null,
    });
  }
}


async function sendJobInterest(req, res) {
  try {
    const body = req.body || {};
    const jobId = toInt(body.job_id || body.jobId);
    const employeeId = toInt(body.employee_id || body.employeeId);

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    const result = await Job.sequelize.transaction(async (transaction) => {
      const job = await Job.findByPk(jobId, {
        paranoid: true,
        attributes: ["id", "employer_id"],
        transaction,
      });

      if (!job) {
        return { ok: false, code: "FC_03", message: "Job not found" };
      }

      const employerId = job.employer_id || null;
      if (!employerId) {
        return { ok: false, code: "FC_04", message: "Employer not found for this job" };
      }

      const existingInterest = await JobInterest.findOne({
        where: {
          job_id: jobId,
          [Op.or]: [
            { sender_type: "employee", sender_id: employeeId },
            { sender_type: "employer", receiver_id: employeeId },
          ],
        },
        paranoid: true,
        order: [["created_at", "DESC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (existingInterest) {
          const duplicateMessage = existingInterest.sender_type === "employee"
            ? "Interest already sent for this job"
            : "Interest already received for this job";

        return {
          ok: false,
          code: "FC_08",
            message: duplicateMessage,
        };
      }

      const employee = await Employee.findByPk(employeeId, {
        paranoid: true,
        attributes: ["id", "interest_credit"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!employee) {
        return { ok: false, code: "FC_06", message: "Employee not found" };
      }

      const available = Number(employee.interest_credit || 0);
      if (!Number.isFinite(available) || available < 1) {
        return { ok: false, code: "FC_07", message: "No interest credits remaining" };
      }

      await employee.update({ interest_credit: Math.max(available - 1, 0) }, { transaction });

      const interest = await JobInterest.create(
        {
          sender_id: employeeId,
          sender_type: "employee",
          receiver_id: employerId,
          job_id: jobId,
          otp: generateOtp(4),
          status: "pending",
        },
        { transaction },
      );

      return { ok: true, interest, employerId, action: 'created' };
    });

    if (!result.ok) {
      return sendApiResponse(res, { ok: false, code: result.code, message: result.message, data: null });
    }

    if (result.action !== 'existing') {
      const [employer, employee, labels] = await Promise.all([
        Employer.findByPk(result.employerId, {
          paranoid: false,
          attributes: ['id', 'user_id', 'name', 'name_hindi', 'organization_name', 'organization_name_hindi'],
        }),
        Employee.findByPk(employeeId, {
          paranoid: false,
          attributes: ['id', 'name', 'name_hindi'],
        }),
        getJobProfileLabels(jobId),
      ]);

      if (employer?.user_id) {
        const employerUser = await User.findByPk(employer.user_id, {
          paranoid: false,
          attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
        });

        const senderNameEn = employee?.name || employee?.name_hindi || 'A candidate';
        const senderNameHi = employee?.name_hindi || employee?.name || 'एक उम्मीदवार';

        if (employerUser) {
          await sendToUser({
            user: employerUser,
            templateKey: 'job_interest.employee_sent',
            templateCtx: { candidate: senderNameEn, job: labels.english || labels.hindi },
            data: { reference_type: 'job', reference_id: jobId, event: 'job_interest.employee_sent' },
          });
        }
      }
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job interest sent successfully",
      data: {
        interest_id: result.interest.id,
        employee_id: employeeId,
        job_id: jobId,
        employer_id: result.employerId,
        sender_type: "employee",
        receiver_id: result.employerId,
        status: result.interest.status || "pending",
        sent_at: result.interest.created_at || null,
      },
    });
  } catch (error) {
    console.error("[app/jobs/interest]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_05",
      message: error.message || "Failed to send job interest",
      data: null,
    });
  }
}


async function unlockApplicationOtp(req, res) {
  try {
    const jobId = toInt(req.body?.job_id ?? req.body?.jobId);
    const employeeId = toInt(req.body?.employee_id ?? req.body?.employeeId);

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    const now = new Date();

    const result = await JobInterest.sequelize.transaction(async (transaction) => {
      let interest = await JobInterest.findOne({
        where: {
          job_id: jobId,
          [Op.or]: [
            { sender_type: "employee", sender_id: employeeId },
            { sender_type: "employer", receiver_id: employeeId },
          ],
        },
        paranoid: false,
        order: [["created_at", "DESC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!interest) {
        return { ok: false, code: "FC_03", message: "Application interest not found" };
      }

      if (interest.deleted_at) {
        await interest.restore({ transaction });
      }

      if (!interest.otp_unlocked_at) {
        await interest.update({ otp_unlocked_at: now }, { transaction });
      }

      return { ok: true, interest };
    });

    if (!result.ok) {
      return sendApiResponse(res, { ok: false, code: result.code, message: result.message, data: null });
    }

    const unlockedAt = result.interest.otp_unlocked_at || null;

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "OTP unlocked successfully",
      data: {
        job_id: jobId,
        employee_id: employeeId,
        otp_unlocked_at: unlockedAt,
        otp: unlockedAt ? (result.interest.otp || null) : null,
      },
    });
  } catch (error) {
    console.error("[app/jobs/unlock-application-otp]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: error.message || "Failed to unlock OTP",
      data: null,
    });
  }
}


async function reportJob(req, res) {
  try {
    const body = req.body || {};
    const jobId = toInt(body.job_id || body.jobId);
    const employeeId = toInt(body.employee_id || body.employeeId);
    const reasonId = toInt(body.reason_id || body.reasonId);
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const descriptionHindi = typeof body.description_hindi === 'string' ? body.description_hindi.trim() : null;

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }
    if (!reasonId) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Valid reason id is required", data: null });
    }

    const job = await Job.findByPk(jobId, { paranoid: true, attributes: ["id"] });
    if (!job) {
      return sendApiResponse(res, { ok: false, code: "FC_04", message: "Job not found", data: null });
    }

    const reason = await EmployerReportReason.findOne({ where: { id: reasonId, is_active: true }, paranoid: true, attributes: ["id"] });
    if (!reason) {
      return sendApiResponse(res, { ok: false, code: "FC_05", message: "Invalid report reason", data: null });
    }

    const descriptionPair = await fillBilingualPair(description, descriptionHindi);

    let report = await Report.findOne({
      where: { user_id: employeeId, report_id: jobId, report_type: "job" },
      paranoid: false,
      order: [["created_at", "DESC"]],
    });

    if (report) {
      if (report.deleted_at) {
        await report.restore();
      }
      await report.update({ reason_id: reasonId, description: descriptionPair.english, description_hindi: descriptionPair.hindi });
    } else {
      report = await Report.create({
        user_id: employeeId,
        report_id: jobId,
        report_type: "job",
        reason_id: reasonId,
        description: descriptionPair.english,
        description_hindi: descriptionPair.hindi,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job reported successfully",
      data: {
        id: report.id,
        employee_id: employeeId,
        job_id: jobId,
        report_type: "job",
        report_id: jobId,
        reason_id: reasonId,
        description: report.description || null,
        description_hindi: report.description_hindi || null,
        created_at: report.created_at || null,
      },
    });
  } catch (error) {
    console.error("[app/jobs/report]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_06",
      message: error.message || "Failed to report job",
      data: null,
    });
  }
}

async function getEmployeeApplicationsSent(req, res) {
  try {
    const requestedEmployeeId = toInt(req.params?.employeeId);
    if (!requestedEmployeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employee id is required", data: null });
    }

    const { employee } = await resolveEmployeeFromParam(requestedEmployeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employee not found", data: null });
    }

    const employeeId = employee.id;

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: { sender_type: "employee", sender_id: employeeId },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "otp", "otp_unlocked_at", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: false,
          paranoid: false,
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "is_household",
            "description_english",
            "description_hindi",
            "no_vacancy",
            "hired_total",
            "salary_min",
            "salary_max",
            "work_start_time",
            "work_end_time",
            "status",
            "verification_status",
            "job_state_id",
            "job_city_id",
            "lat",
            "lng",
            "created_at",
            "updated_at",
            "expired_at",
          ],
          include: [
            {
              model: Employer,
              as: "Employer",
              required: false,
              paranoid: false,
              attributes: [
                "id",
                "name",
                "name_hindi",
                "organization_name",
                "organization_name_hindi",
                "organization_type",
                "state_id",
                "city_id",
                "business_category_id",
                "verification_status",
                "kyc_status",
              ],
              include: [{ model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false }],
            },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
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

    const results = (rows || []).map((row) => {
      const app = row?.toJSON ? row.toJSON() : row;
      const job = app?.Job || null;
      const employer = job?.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      if (job) {
        enrichJobBilingualFields(job, employer);
        job.employer_phone = job.employer_phone || (employerPhone || null);

        if (!job.shift_timing_display && (job.work_start_time || job.work_end_time)) {
          const a = job.work_start_time || '';
          const b = job.work_end_time || '';
          const parts = [a, b].map((x) => String(x || '').trim()).filter(Boolean);
          job.shift_timing_display = parts.join(' - ');
        }
      }

      if (job) delete job.Employer;
      if (employer) delete employer.User;

      return {
        application: {
          id: app?.id || null,
          sender_type: app?.sender_type || null,
          sender_id: app?.sender_id || null,
          receiver_id: app?.receiver_id || null,
          job_id: app?.job_id || null,
          status: app?.status || null,
          sent_at: app?.created_at || null,
          updated_at: app?.updated_at || null,
        },
        job: job,
        employer: employer ? { ...employer, phone: employerPhone } : null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job applications sent fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/jobs/applications/sent]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch sent applications",
      data: null,
    });
  }
}

async function getEmployeeApplicationsReceived(req, res) {
  try {
    const requestedEmployeeId = toInt(req.params?.employeeId);
    if (!requestedEmployeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employee id is required", data: null });
    }

    const { employee } = await resolveEmployeeFromParam(requestedEmployeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employee not found", data: null });
    }

    const employeeId = employee.id;

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: { sender_type: "employer", receiver_id: employeeId },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "otp", "otp_unlocked_at", "created_at", "updated_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: false,
          paranoid: false,
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "is_household",
            "description_english",
            "description_hindi",
            "no_vacancy",
            "hired_total",
            "salary_min",
            "salary_max",
            "work_start_time",
            "work_end_time",
            "status",
            "verification_status",
            "job_state_id",
            "job_city_id",
            "lat",
            "lng",
            "created_at",
            "updated_at",
            "expired_at",
          ],
          include: [
            {
              model: Employer,
              as: "Employer",
              required: false,
              paranoid: false,
              attributes: [
                "id",
                "name",
                "name_hindi",
                "organization_name",
                "organization_name_hindi",
                "organization_type",
                "state_id",
                "city_id",
                "business_category_id",
                "verification_status",
                "kyc_status",
              ],
              include: [{ model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false }],
            },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
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

    const results = (rows || []).map((row) => {
      const app = row?.toJSON ? row.toJSON() : row;
      const job = app?.Job || null;
      const employer = job?.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      if (job) {
        enrichJobBilingualFields(job, employer);
        job.employer_phone = job.employer_phone || (employerPhone || null);

        if (!job.shift_timing_display && (job.work_start_time || job.work_end_time)) {
          const a = job.work_start_time || '';
          const b = job.work_end_time || '';
          const parts = [a, b].map((x) => String(x || '').trim()).filter(Boolean);
          job.shift_timing_display = parts.join(' - ');
        }
      }

      if (job) delete job.Employer;
      if (employer) delete employer.User;

      return {
        application: {
          id: app?.id || null,
          sender_type: app?.sender_type || null,
          sender_id: app?.sender_id || null,
          receiver_id: app?.receiver_id || null,
          job_id: app?.job_id || null,
          status: app?.status || null,
          sent_at: app?.created_at || null,
          updated_at: app?.updated_at || null,
        },
        job: job,
        employer: employer ? { ...employer, phone: employerPhone } : null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Job applications received fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/jobs/applications/received]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch received applications",
      data: null,
    });
  }
}



async function toggleJobWishlist(req, res) {
  try {
    const jobId = toInt(req.body?.job_id ?? req.body?.jobId);
    const employeeId = toInt(req.body?.employee_id ?? req.body?.employeeId);

    if (!jobId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid job id is required", data: null });
    }
    if (!employeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    const job = await Job.findByPk(jobId, { paranoid: true, attributes: ["id"] });
    if (!job) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Job not found", data: null });
    }

    const existing = await Wishlist.findOne({
      where: { employee_id: employeeId, job_id: jobId },
      attributes: ["id", "created_at"],
      order: [["created_at", "DESC"]],
    });

    if (existing) {
      const removedAt = new Date();
      const removedCount = await Wishlist.destroy({ where: { employee_id: employeeId, job_id: jobId } });

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Removed from wishlist",
        data: {
          employee_id: employeeId,
          job_id: jobId,
          action: "removed",
          removed_count: removedCount || 0,
          wishlist: {
            is_in_wishlist: false,
            wishlist_id: null,
            added_at: null,
            removed_at: removedAt,
          },
        },
      });
    }

    const row = await Wishlist.create({ employee_id: employeeId, job_id: jobId });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Added to wishlist",
      data: {
        employee_id: employeeId,
        job_id: jobId,
        action: "added",
        wishlist: {
          is_in_wishlist: true,
          wishlist_id: row?.id || null,
          added_at: row?.created_at || null,
          removed_at: null,
        },
      },
    });
  } catch (error) {
    console.error("[app/jobs/wishlist/toggle]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: error.message || "Failed to toggle wishlist",
      data: null,
    });
  }
}


async function getEmployeeWishlist(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await Wishlist.findAndCountAll({
      where: { employee_id: employeeId },
      attributes: ["id", "employee_id", "job_id", "created_at"],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    const list = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const jobIds = Array.from(new Set(list.map((x) => x.job_id).filter(Boolean)));

    if (!jobIds.length) {
      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Wishlist fetched successfully",
        data: { page, limit, total: count || 0, results: [] },
      });
    }

    const jobs = await Job.findAll({
      where: { id: { [Op.in]: jobIds }, verification_status: "approved" },
      paranoid: false,
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "salary_type_id",
        "is_household",
        "description_english",
        "description_hindi",
        "no_vacancy",
        "hired_total",
        "salary_min",
        "salary_max",
        "work_start_time",
        "work_end_time",
        "status",
        "verification_status",
        "job_state_id",
        "job_city_id",
        "lat",
        "lng",
        "created_at",
        "updated_at",
        "expired_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          required: true,
          attributes: [
            "id",
            "name",
            "name_hindi",
            "organization_name",
            "organization_name_hindi",
            "organization_type",
            "state_id",
            "city_id",
            "business_category_id",
            "verification_status",
            "kyc_status",
          ],
          include: [{ model: User, as: "User", attributes: ["mobile"], required: true }],
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
    });

    const jobMap = new Map(
      (jobs || []).map((j) => {
        const job = j?.toJSON ? j.toJSON() : j;
        return [job?.id, job];
      })
    );

    const results = list
      .map((wl) => {
        const job = jobMap.get(wl.job_id) || null;
        const employer = job?.Employer || null;
        const employerPhone = employer?.User?.mobile || null;

        if (job) {
          enrichJobBilingualFields(job, employer);
          job.employer_phone = job.employer_phone || (employerPhone || null);

          if (!job.shift_timing_display && (job.work_start_time || job.work_end_time)) {
            const a = job.work_start_time || '';
            const b = job.work_end_time || '';
            const parts = [a, b].map((x) => String(x || '').trim()).filter(Boolean);
            job.shift_timing_display = parts.join(' - ');
          }

          job.is_wishlisted = true;
          job.is_in_wishlist = true;
        }

        if (job) delete job.Employer;
        if (employer) delete employer.User;

        return {
          wishlist: {
            id: wl?.id || null,
            employee_id: wl?.employee_id || null,
            job_id: wl?.job_id || null,
            added_at: wl?.created_at || null,
          },
          job,
          employer: employer ? { ...employer, phone: employerPhone } : null,
        };
      })
      // keep only items that still have a job
      .filter((x) => x.job);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Wishlist fetched successfully",
      data: { page, limit, total: results.length, results },
    });
  } catch (error) {
    console.error("[app/jobs/wishlist]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch wishlist",
      data: null,
    });
  }
}


async function getEmployeeContactHistory(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await EmployeeContact.findAndCountAll({
      where: { employee_id: employeeId },
      attributes: ["id", "employee_id", "job_id", "employer_id", "created_at", "deleted_at"],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      paranoid: false,
    });

    const contacts = (rows || []).map((r) => (r?.toJSON ? r.toJSON() : r));
    const jobIds = Array.from(new Set(contacts.map((c) => c.job_id).filter(Boolean)));

    if (!jobIds.length) {
      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Contact history fetched successfully",
        data: { page, limit, total: count || 0, results: [] },
      });
    }

    const jobs = await Job.findAll({
      where: { id: { [Op.in]: jobIds } },
      paranoid: false,
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "salary_type_id",
        "is_household",
        "description_english",
        "description_hindi",
        "no_vacancy",
        "hired_total",
        "salary_min",
        "salary_max",
        "work_start_time",
        "work_end_time",
        "status",
        "verification_status",
        "job_state_id",
        "job_city_id",
        "lat",
        "lng",
        "interviewer_contact",
        "job_address_english",
        "job_address_hindi",
        "created_at",
        "updated_at",
        "expired_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          required: false,
          paranoid: false,
          attributes: [
            "id",
            "name",
            "name_hindi",
            "organization_name",
            "organization_name_hindi",
            "organization_type",
            "state_id",
            "city_id",
            "business_category_id",
            "verification_status",
            "kyc_status",
          ],
          include: [{ model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false }],
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
    });

    const jobMap = new Map(
      (jobs || []).map((j) => {
        const job = j?.toJSON ? j.toJSON() : j;
        return [job?.id, job];
      })
    );

    const results = (contacts || [])
      .map((c) => {
        const job = jobMap.get(c.job_id) || null;
        const employer = job?.Employer || null;
        const employerPhone = employer?.User?.mobile || null;

        if (job) enrichJobBilingualFields(job, employer);
        const jobProfileName = job?.job_profile || null;

        const organizationName = job?.organization_name || employer?.organization_name || employer?.name || null;

        if (job) delete job.Employer;
        if (employer) delete employer.User;

        return {
          contact: {
            id: c?.id || null,
            employee_id: c?.employee_id || null,
            job_id: c?.job_id || null,
            employer_id: c?.employer_id || null,
            unlocked_at: c?.created_at || null,
            is_active: !c?.deleted_at,
          },
          job_profile_name: jobProfileName,
          job_profile_name_english: job?.job_profile_english || null,
          job_profile_name_hindi: job?.job_profile_hindi || null,
          organization_name: organizationName,
          organization_name_english: job?.organization_name_english || employer?.organization_name || employer?.name || null,
          organization_name_hindi: job?.organization_name_hindi || employer?.organization_name_hindi || employer?.name_hindi || null,
          job,
          employer: employer ? { ...employer, phone: employerPhone } : null,
        };
      })
      .filter((x) => x.job);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Contact history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/jobs/contacts/history]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch contact history",
      data: null,
    });
  }
}


async function getEmployeeInterestHistory(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: { sender_type: "employee", sender_id: employeeId },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at", "deleted_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: false,
          paranoid: false,
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "is_household",
            "description_english",
            "description_hindi",
            "no_vacancy",
            "hired_total",
            "salary_min",
            "salary_max",
            "work_start_time",
            "work_end_time",
            "status",
            "verification_status",
            "job_state_id",
            "job_city_id",
            "lat",
            "lng",
            "created_at",
            "updated_at",
            "expired_at",
          ],
          include: [
            {
              model: Employer,
              as: "Employer",
              required: false,
              paranoid: false,
              attributes: [
                "id",
                "name",
                "name_hindi",
                "organization_name",
                "organization_name_hindi",
                "organization_type",
                "state_id",
                "city_id",
                "business_category_id",
                "verification_status",
                "kyc_status",
              ],
              include: [{ model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false }],
            },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
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

    const results = (rows || []).map((row) => {
      const interest = row?.toJSON ? row.toJSON() : row;
      const job = interest?.Job || null;
      const employer = job?.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      if (job) enrichJobBilingualFields(job, employer);
      const organizationName = job?.organization_name || employer?.organization_name || employer?.name || null;

      if (job) delete job.Employer;
      if (employer) delete employer.User;
      if (interest) delete interest.Job;

      return {
        interest: {
          id: interest?.id || null,
          sender_type: interest?.sender_type || null,
          sender_id: interest?.sender_id || null,
          receiver_id: interest?.receiver_id || null,
          job_id: interest?.job_id || null,
          status: interest?.status || null,
          sent_at: interest?.created_at || null,
          updated_at: interest?.updated_at || null,
          deleted_at: interest?.deleted_at || null,
        },
        organization_name: organizationName,
        organization_name_english: job?.organization_name_english || employer?.organization_name || employer?.name || null,
        organization_name_hindi: job?.organization_name_hindi || employer?.organization_name_hindi || employer?.name_hindi || null,
        job,
        employer: employer ? { ...employer, phone: employerPhone } : null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Interest history fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/jobs/interests/history]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch interest history",
      data: null,
    });
  }
}


async function getEmployeeHiredJobs(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await JobInterest.findAndCountAll({
      where: {
        status: "hired",
        [Op.or]: [
          { sender_type: "employee", sender_id: employeeId },
          { sender_type: "employer", receiver_id: employeeId },
        ],
      },
      attributes: ["id", "sender_id", "sender_type", "receiver_id", "job_id", "status", "created_at", "updated_at", "deleted_at"],
      include: [
        {
          model: Job,
          as: "Job",
          required: false,
          paranoid: false,
          attributes: [
            "id",
            "employer_id",
            "job_profile_id",
            "salary_type_id",
            "is_household",
            "description_english",
            "description_hindi",
            "no_vacancy",
            "hired_total",
            "salary_min",
            "salary_max",
            "work_start_time",
            "work_end_time",
            "status",
            "verification_status",
            "job_state_id",
            "job_city_id",
            "lat",
            "lng",
            "created_at",
            "updated_at",
            "expired_at",
          ],
          include: [
            {
              model: Employer,
              as: "Employer",
              required: false,
              paranoid: false,
              attributes: [
                "id",
                "name",
                "name_hindi",
                "organization_name",
                "organization_name_hindi",
                "organization_type",
                "state_id",
                "city_id",
                "business_category_id",
                "verification_status",
                "kyc_status",
              ],
              include: [{ model: User, as: "User", attributes: ["mobile"], required: false, paranoid: false }],
            },
            { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
            { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
            { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
            { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
          ],
        },
      ],
      order: [["updated_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const results = (rows || [])
      .map((row) => {
        const interest = row?.toJSON ? row.toJSON() : row;
        const job = interest?.Job || null;
        const employer = job?.Employer || null;
        const employerPhone = employer?.User?.mobile || null;

        if (job) enrichJobBilingualFields(job, employer);
        const organizationName = job?.organization_name || employer?.organization_name || employer?.name || null;

        if (job) delete job.Employer;
        if (employer) delete employer.User;
        if (interest) delete interest.Job;

        return {
          hired: {
            job_interest_id: interest?.id || null,
            sender_type: interest?.sender_type || null,
            sender_id: interest?.sender_id || null,
            receiver_id: interest?.receiver_id || null,
            job_id: interest?.job_id || null,
            status: interest?.status || null,
            hired_at: interest?.updated_at || null,
          },
          organization_name: organizationName,
          organization_name_english: job?.organization_name_english || employer?.organization_name || employer?.name || null,
          organization_name_hindi: job?.organization_name_hindi || employer?.organization_name_hindi || employer?.name_hindi || null,
          job,
          employer: employer ? { ...employer, phone: employerPhone } : null,
        };
      })
      .filter((x) => x.job);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Hired jobs fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/jobs/hired]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch hired jobs",
      data: null,
    });
  }
}


async function getEmployeePaymentHistory(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const { count, rows } = await PaymentHistory.findAndCountAll({
      where: { user_type: "employee", user_id: employeeId, status: "success" },
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
      const plans = await EmployeeSubscriptionPlan.findAll({
        where: { id: { [Op.in]: planIds } },
        attributes: ["id", "plan_name_english", "plan_name_hindi"],
        paranoid: false,
      });
      for (const pl of plans || []) {
        const plan = pl?.toJSON ? pl.toJSON() : pl;
        if (plan?.id) planMap.set(plan.id, {
          plan_name_english: plan?.plan_name_english || null,
          plan_name_hindi: plan?.plan_name_hindi || null,
          plan_name: plan?.plan_name_english || plan?.plan_name_hindi || null,
        });
      }
    }

    const results = payments.map((p) => ({
      payment: {
        ...(p?.plan_id ? (planMap.get(p.plan_id) || {}) : {}),
        id: p?.id || null,
        user_type: p?.user_type || null,
        user_id: p?.user_id || null,
        plan_id: p?.plan_id || null,
        plan_name: p?.plan_id ? (planMap.get(p.plan_id)?.plan_name || null) : null,
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
    console.error("[app/jobs/payments/history]", error);
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
    const employeeId = toInt(req.params?.employeeId);
    const planId = toInt(
      req.body?.subscription_plan_id ?? req.body?.plan_id ?? req.body?.planId,
    );

    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid employee id is required',
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
      userType: 'employee',
      userId: employeeId,
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
    console.error('[app/employees/:employeeId/subscriptions/buy]', error);
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
    const employeeId = toInt(req.params?.employeeId);
    const orderId = String(req.params?.orderId || '').trim();

    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid employee id is required',
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
      userType: 'employee',
      userId: employeeId,
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
    console.error('[app/employees/:employeeId/subscriptions/status/:orderId]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_05',
      message: error.message || 'Failed to fetch payment status',
      data: null,
    });
  }
}


async function getEmployeeSubscriptions(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const employee = await Employee.findByPk(employeeId, {
      paranoid: true,
      attributes: [
        "id",
        "subscription_plan_id",
        "credit_expiry_at",
        "total_contact_credit",
        "contact_credit",
        "total_interest_credit",
        "interest_credit",
        "created_at",
        "updated_at",
      ],
    });

    if (!employee) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Employee not found",
        data: null,
      });
    }

    const emp = employee?.toJSON ? employee.toJSON() : employee;

    const subscriptionPlanId = emp?.subscription_plan_id || null;
    const expiresAt = emp?.credit_expiry_at || null;
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const nowMs = Date.now();

    const hasPlan = Boolean(subscriptionPlanId);
    const isExpired = !expiryMs ? true : expiryMs < nowMs;
    const hasAnyCredits =
      Number(emp?.contact_credit || 0) > 0 ||
      Number(emp?.interest_credit || 0) > 0;

    const isPlanActive = hasPlan && !isExpired;
    const isCreditsActive = hasAnyCredits && !isExpired;
    const isActive = isPlanActive || isCreditsActive;

    const status = isActive
      ? "active"
      : (hasPlan || hasAnyCredits)
      ? (isExpired ? "expired" : "inactive")
      : "none";

    const activePlan = subscriptionPlanId
      ? await findByPkWithOptionalAttribute(EmployeeSubscriptionPlan, subscriptionPlanId, {
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

    const plans = await findAllWithOptionalAttribute(EmployeeSubscriptionPlan, {
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

    const benefitMap = await getPlanBenefitsByPlanId('employee', [
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
        is_active_for_employee: isPlanActive && isCurrentPlan,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employee subscriptions fetched successfully",
      data: {
        current_subscription: {
          employee_id: emp?.id || null,
          status,
          subscription_plan_id: subscriptionPlanId,
          active_plan_name: activePlanName,
          valid_till: isActive ? expiresAt : null,
          expired_at: !isActive && (hasPlan || hasAnyCredits) && isExpired ? expiresAt : null,
          credits: {
            contact: {
              total: emp?.total_contact_credit ?? 0,
              available: isExpired ? 0 : (emp?.contact_credit ?? 0),
            },
            interest: {
              total: emp?.total_interest_credit ?? 0,
              available: isExpired ? 0 : (emp?.interest_credit ?? 0),
            },
          },
        },
        active_plan: activePlanJson
          ? {
              ...activePlanJson,
              plan_name: activePlanName,
              plan_benefits: benefitMap.get(Number(activePlanJson?.id)) || [],
            }
          : null,
        plans: planList,
      },
    });
  } catch (error) {
    console.error("[app/jobs/subscriptions]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_03",
      message: error.message || "Failed to fetch employee subscriptions",
      data: null,
    });
  }
}

async function getJobIdBySlug(req, res) {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid job slug is required',
        data: null,
      });
    }

    const job = await Job.findOne({
      where: { slug },
      attributes: ['id', 'slug'],
    });

    if (!job) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'Job not found',
        data: null,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Success',
      data: { id: job.id, slug: job.slug },
    });
  } catch (error) {
    console.error('[app/jobs/slug]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_99',
      message: error.message || 'Failed to resolve job',
      data: null,
    });
  }
}
module.exports = {
  getJobDetail,
  getJobIdBySlug,
  buySubscription,
  getSubscriptionPaymentStatusByOrderId,
  unlockJobContact,
  saveContactCallExperience,
  sendJobInterest,
  unlockApplicationOtp,
  reportJob,
  toggleJobWishlist,
  getEmployeeWishlist,
  getEmployeeInterestHistory,
  getEmployeePaymentHistory,
  getEmployeeSubscriptions,
  getEmployeeHiredJobs,
  getEmployeeContactHistory,
  getEmployeeApplicationsSent,
  getEmployeeApplicationsReceived,
};
