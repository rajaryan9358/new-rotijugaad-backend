const User = require('../models/User');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const Job = require('../models/Job');
const JobProfile = require('../models/JobProfile');
const models = require('../models');
const EmployeeJobProfile = models.EmployeeJobProfile;
const City = models.City;
const { Op } = require('sequelize');

const { getNotificationTemplate } = require('./notificationTemplates');
const { notifyUser, notifyUsers } = require('./userNotifications');

function normalizeLanguage(lang) {
  const l = String(lang || '').trim().toLowerCase();
  if (l === 'hi' || l === 'hindi') return 'hi';
  return 'en';
}

function pickLocalized({ en, hi, lang }) {
  const chosenLang = normalizeLanguage(lang);
  if (chosenLang === 'hi') return String(hi || '').trim() || String(en || '').trim();
  return String(en || '').trim() || String(hi || '').trim();
}

async function sendToUser({
  user,
  templateKey,
  templateCtx,
  data,
}) {
  if (!user) return { skipped: true, reason: 'no_user' };

  const tpl = getNotificationTemplate(templateKey, templateCtx);
  if (!tpl) return { skipped: true, reason: 'no_template' };

  const payloadData = {
    event: tpl.key,
    title_en: tpl.title_en,
    body_en: tpl.body_en,
    title_hi: tpl.title_hi,
    body_hi: tpl.body_hi,
    // backward compat
    title_hindi: tpl.title_hi,
    body_hindi: tpl.body_hi,
    ...(data || {}),
  };

  const referenceType = String(
    data?.reference_type || data?.entity || ''
  ).trim() || null;
  const referenceIdRaw = data?.reference_id ?? data?.entity_id;
  const referenceId = Number(referenceIdRaw);

  try {
    const result = await notifyUser({
      user,
      titleEnglish: tpl.title_en,
      titleHindi: tpl.title_hi,
      bodyEnglish: tpl.body_en,
      bodyHindi: tpl.body_hi,
      referenceType,
      referenceId: Number.isInteger(referenceId) && referenceId > 0 ? referenceId : null,
      extraData: payloadData,
      awaitPush: true,
    });

    return {
      sent: result.createdCount > 0,
      createdCount: result.createdCount || 0,
      pushRequested: result.pushRequested || 0,
      pushResults: result.pushResults || [],
    };
  } catch (error) {
    console.error('[systemNotifications] notifyUser failed', {
      templateKey,
      userId: user?.id,
      hasToken: Boolean(String(user?.fcm_token || '').trim()),
      error: String(error?.message || error),
    });

    return {
      sent: false,
      error: String(error?.message || error),
    };
  }
}

async function notifyEmployeeStatusChange({ employeeId, field, nextValue }) {
  try {
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) return { skipped: true, reason: 'bad_employee_id' };

    const employee = await Employee.findByPk(id, { paranoid: false });
    if (!employee) return { skipped: true, reason: 'employee_not_found' };

    const user = await User.findByPk(employee.user_id, { paranoid: false });
    if (!user) return { skipped: true, reason: 'user_not_found' };

    const f = String(field || '').trim();
    const v = String(nextValue || '').trim().toLowerCase();

    const username = employee.name || employee.name_hindi || user.name || user.name_hindi || '';
    const ctx = { username };

    if (f === 'verification_status') {
      if (v === 'verified') return sendToUser({
        user,
        templateKey: 'employee.verification.verified',
        templateCtx: ctx,
        data: { entity: 'employee', entity_id: String(employee.id), status: v },
      });
      if (v === 'rejected') return sendToUser({
        user,
        templateKey: 'employee.verification.rejected',
        templateCtx: ctx,
        data: { entity: 'employee', entity_id: String(employee.id), status: v },
      });
    }

    if (f === 'kyc_status') {
      if (v === 'verified') return sendToUser({
        user,
        templateKey: 'employee.kyc.verified',
        templateCtx: ctx,
        data: { entity: 'employee', entity_id: String(employee.id), status: v },
      });
      if (v === 'rejected') return sendToUser({
        user,
        templateKey: 'employee.kyc.rejected',
        templateCtx: ctx,
        data: { entity: 'employee', entity_id: String(employee.id), status: v },
      });
    }

    return { skipped: true, reason: 'not_applicable' };
  } catch (error) {
    console.error('[systemNotifications] notifyEmployeeStatusChange failed', {
      employeeId,
      field,
      nextValue,
      error: String(error?.message || error),
    });
    return { sent: false, error: String(error?.message || error) };
  }
}

async function notifyEmployerStatusChange({ employerId, field, nextValue }) {
  try {
    const id = Number(employerId);
    if (!Number.isInteger(id) || id <= 0) return { skipped: true, reason: 'bad_employer_id' };

    const employer = await Employer.findByPk(id, { paranoid: false });
    if (!employer) return { skipped: true, reason: 'employer_not_found' };

    const user = await User.findByPk(employer.user_id, { paranoid: false });
    if (!user) return { skipped: true, reason: 'user_not_found' };

    const f = String(field || '').trim();
    const v = String(nextValue || '').trim().toLowerCase();

    const username = employer.name || employer.name_hindi || user.name || user.name_hindi || '';
    const ctx = { username };

    if (f === 'verification_status') {
      if (v === 'verified') return sendToUser({
        user,
        templateKey: 'employer.verification.verified',
        templateCtx: ctx,
        data: { entity: 'employer', entity_id: String(employer.id), status: v },
      });
      if (v === 'rejected') return sendToUser({
        user,
        templateKey: 'employer.verification.rejected',
        templateCtx: ctx,
        data: { entity: 'employer', entity_id: String(employer.id), status: v },
      });
    }

    if (f === 'kyc_status') {
      if (v === 'verified') return sendToUser({
        user,
        templateKey: 'employer.kyc.verified',
        templateCtx: ctx,
        data: { entity: 'employer', entity_id: String(employer.id), status: v },
      });
      if (v === 'rejected') return sendToUser({
        user,
        templateKey: 'employer.kyc.rejected',
        templateCtx: ctx,
        data: { entity: 'employer', entity_id: String(employer.id), status: v },
      });
    }

    return { skipped: true, reason: 'not_applicable' };
  } catch (error) {
    console.error('[systemNotifications] notifyEmployerStatusChange failed', {
      employerId,
      field,
      nextValue,
      error: String(error?.message || error),
    });
    return { sent: false, error: String(error?.message || error) };
  }
}

async function jobRefText(job) {
  try {
    const jp = job?.job_profile_id
      ? await JobProfile.findByPk(job.job_profile_id)
      : null;
    const label = jp?.profile_english || jp?.profile_hindi || null;
    return label ? `#${job.id} (${label})` : `#${job.id}`;
  } catch (_) {
    return job?.id ? `#${job.id}` : '';
  }
}

async function notifyJobEvent({ jobId, eventKey }) {
  try {
    const id = Number(jobId);
    if (!Number.isInteger(id) || id <= 0) return { skipped: true, reason: 'bad_job_id' };

    const job = await Job.findByPk(id);
    if (!job) return { skipped: true, reason: 'job_not_found' };

    const employer = await Employer.findByPk(job.employer_id, { paranoid: false });
    if (!employer) return { skipped: true, reason: 'employer_not_found' };

    const user = await User.findByPk(employer.user_id, { paranoid: false });
    if (!user) return { skipped: true, reason: 'user_not_found' };

    const jobRef = await jobRefText(job);

    return sendToUser({
      user,
      templateKey: eventKey,
      templateCtx: { job_ref: jobRef },
      data: {
        entity: 'job',
        entity_id: String(job.id),
      },
    });
  } catch (error) {
    console.error('[systemNotifications] notifyJobEvent failed', {
      jobId,
      eventKey,
      error: String(error?.message || error),
    });
    return { sent: false, error: String(error?.message || error) };
  }
}

async function notifyJobStatusChange({ jobId, nextStatus }) {
  const s = String(nextStatus || '').trim().toLowerCase();
  if (s === 'active') return notifyJobEvent({ jobId, eventKey: 'job.status.activated' });
  if (s === 'inactive') return notifyJobEvent({ jobId, eventKey: 'job.status.deactivated' });
  if (s === 'expired') return notifyJobEvent({ jobId, eventKey: 'job.status.expired' });
  return { skipped: true, reason: 'not_applicable' };
}

async function notifyJobVerificationChange({ jobId, nextVerificationStatus }) {
  const s = String(nextVerificationStatus || '').trim().toLowerCase();
  if (s === 'approved') return notifyJobEvent({ jobId, eventKey: 'job.verification.approved' });
  if (s === 'rejected') return notifyJobEvent({ jobId, eventKey: 'job.verification.rejected' });
  return { skipped: true, reason: 'not_applicable' };
}

async function notifyNewJobApprovedToCandidates({ jobId }) {
  try {
    const id = Number(jobId);
    if (!Number.isInteger(id) || id <= 0) return { skipped: true, reason: 'bad_job_id' };

    const job = await Job.findByPk(id, {
      include: [
        { model: JobProfile, as: 'JobProfile', attributes: ['profile_english', 'profile_hindi'], required: false },
        { model: City, as: 'JobCity', attributes: ['city_english', 'city_hindi'], required: false },
      ],
      paranoid: false,
    });
    if (!job) return { skipped: true, reason: 'job_not_found' };

    // Only send recommendations when job is actually live for candidates to see
    if (String(job.status || '').toLowerCase() !== 'active') {
      return { skipped: true, reason: 'job_not_active' };
    }
    if (String(job.verification_status || '').toLowerCase() !== 'approved') {
      return { skipped: true, reason: 'job_not_approved' };
    }

    const jobProfileId = job.job_profile_id;
    const jobCityId = job.job_city_id;
    if (!jobProfileId) return { skipped: true, reason: 'no_job_profile' };

    const profileEnglish = job.JobProfile?.profile_english || job.JobProfile?.profile_hindi || 'job';
    const profileHindi = job.JobProfile?.profile_hindi || job.JobProfile?.profile_english || 'नौकरी';
    const cityEnglish = job.JobCity?.city_english || job.JobCity?.city_hindi || '';
    const cityHindi = job.JobCity?.city_hindi || job.JobCity?.city_english || '';

    const ejpWhere = { job_profile_id: jobProfileId };
    const employeeWhere = {};
    if (jobCityId) employeeWhere.preferred_city_id = jobCityId;

    const matchingEmployees = await Employee.findAll({
      where: employeeWhere,
      attributes: ['id', 'user_id', 'name', 'name_hindi', 'preferred_city_id'],
      include: [
        {
          model: EmployeeJobProfile,
          as: 'EmployeeJobProfiles',
          attributes: [],
          required: true,
          where: ejpWhere,
        },
        {
          model: User,
          as: 'User',
          required: true,
          attributes: ['id', 'name', 'name_hindi', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
          where: { is_active: true, delete_pending: false },
        },
      ],
      paranoid: false,
    });

    if (!matchingEmployees.length) return { skipped: true, reason: 'no_matching_candidates' };

    await notifyUsers({
      users: matchingEmployees.map((emp) => ({
        ...(emp.User?.toJSON ? emp.User.toJSON() : emp.User),
        display_name: emp.name || emp.User?.name || null,
        display_name_hindi: emp.name_hindi || emp.User?.name_hindi || null,
      })),
      titleEnglish: getNotificationTemplate('job.approved.candidate', {})?.title_en || 'New Recommended Job',
      titleHindi:   getNotificationTemplate('job.approved.candidate', {})?.title_hi || 'नई अनुशंसित नौकरी',
      bodyEnglish: (user) => {
        const username = String(user?.display_name || user?.name || '').trim() || 'there';
        const job      = profileEnglish;
        const city     = cityEnglish;
        return getNotificationTemplate('job.approved.candidate', { username, job, city })?.body_en
          || `Hi ${username}, a new ${job} job is available in ${city} matching your preference.`;
      },
      bodyHindi: (user) => {
        const username = String(user?.display_name_hindi || user?.name_hindi || user?.display_name || user?.name || '').trim() || 'dost';
        const job      = profileHindi;
        const city     = cityHindi || cityEnglish;
        return getNotificationTemplate('job.approved.candidate', { username, job, city })?.body_hi
          || `${username}, ${city} mein ${job} ki job aayi hai jo aapki profile se match karti hai.`;
      },
      referenceType: 'job',
      referenceId: job.id,
      extraData: {
        event: 'job.approved.candidate',
        entity: 'job',
        entity_id: String(job.id),
      },
    });

    return { sent: true, matched: matchingEmployees.length };
  } catch (error) {
    console.error('[systemNotifications] notifyNewJobApprovedToCandidates failed', {
      jobId,
      error: String(error?.message || error),
    });
    return { sent: false, error: String(error?.message || error) };
  }
}

async function notifySubscriptionPaymentStatus({ userType, userId, outcome, orderId }) {
  const type = String(userType || '').trim().toLowerCase();
  const id = Number(userId);
  const status = String(outcome || '').trim().toLowerCase();

  if (type !== 'employee' && type !== 'employer') {
    return { skipped: true, reason: 'bad_user_type' };
  }
  if (!Number.isInteger(id) || id <= 0) {
    return { skipped: true, reason: 'bad_user_id' };
  }
  if (status !== 'success' && status !== 'failed') {
    return { skipped: true, reason: 'not_applicable' };
  }

  const AccountModel = type === 'employer' ? Employer : Employee;
  const account = await AccountModel.findByPk(id, { paranoid: false });
  if (!account) return { skipped: true, reason: type === 'employer' ? 'employer_not_found' : 'employee_not_found' };

  const user = await User.findByPk(account.user_id, { paranoid: false });
  if (!user) return { skipped: true, reason: 'user_not_found' };

  return sendToUser({
    user,
    templateKey: `${type}.subscription.payment.${status}`,
    templateCtx: {},
    data: {
      entity: 'subscription_payment',
      user_type: type,
      user_id: String(id),
      order_id: String(orderId || ''),
      status,
    },
  });
}

async function notifyJobExpiryBatch({ jobs, templateKey }) {
  const results = [];
  for (const job of jobs) {
    try {
      const employer = await Employer.findByPk(job.employer_id, { paranoid: false });
      if (!employer) { results.push({ jobId: job.id, skipped: true, reason: 'employer_not_found' }); continue; }

      const user = await User.findByPk(employer.user_id, { paranoid: false });
      if (!user) { results.push({ jobId: job.id, skipped: true, reason: 'user_not_found' }); continue; }

      const jobRef = await jobRefText(job);
      const result = await sendToUser({
        user,
        templateKey,
        templateCtx: { job_ref: jobRef },
        data: { entity: 'job', entity_id: String(job.id) },
      });
      results.push({ jobId: job.id, ...result });
    } catch (err) {
      console.error('[systemNotifications] notifyJobExpiryBatch item failed', { jobId: job.id, err: err.message });
      results.push({ jobId: job.id, sent: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  sendToUser,
  notifyEmployeeStatusChange,
  notifyEmployerStatusChange,
  notifyJobStatusChange,
  notifyJobVerificationChange,
  notifyNewJobApprovedToCandidates,
  notifySubscriptionPaymentStatus,
  notifyJobExpiryBatch,
};
