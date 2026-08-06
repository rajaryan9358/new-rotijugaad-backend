const { Op } = require('sequelize');
const crypto = require('crypto');
const { sequelize } = require('../../config/db');
const { User, Employee, Employer } = require('../../models');
const State = require('../../models/State');
const City = require('../../models/City');
const Qualification = require('../../models/Qualification');
const Shift = require('../../models/Shift');
const EmployeeSubscriptionPlan = require('../../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = require('../../models/EmployerSubscriptionPlan');
const BusinessCategory = require('../../models/BusinessCategory');
const ReferralCredit = require('../../models/ReferralCredit');
const Referral = require('../../models/Referral');
const { sendApiResponse, isTruthyEnv } = require('../_helpers/response');
const { sendOtp: sendTwoFactorOtp, verifyOtp: verifyTwoFactorOtp } = require('../../utils/twoFactor');
const { fillBilingualPair } = require('../../utils/bilingual');
const {
  fetchWelcomeCreditSettings,
  buildEmployeeWelcomeCredits,
  buildEmployerWelcomeCredits,
} = require('../../utils/welcomeCredits');

const SUCCESS_CODE = 'SC_01';

function generateOtp5Digit() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function normalizeMobile(mobile) {
  return String(mobile || '').trim();
}

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 6;

function generateReferralCode(length = REFERRAL_CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, REFERRAL_CODE_ALPHABET.length);
    code += REFERRAL_CODE_ALPHABET[idx];
  }
  return code;
}

async function ensureReferralCode(user, transaction) {
  if (!user || user.referral_code) return (user && user.referral_code) ? user.referral_code : null;

  const opts = transaction ? { transaction } : {};
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateReferralCode();
    try {
      await user.update({ referral_code: code }, opts);
      return code;
    } catch (error) {
      if (error && error.name === 'SequelizeUniqueConstraintError') continue;
      throw error;
    }
  }

  throw new Error('Failed to generate unique referral code');
}

async function loadProfileWithNames(user) {
  if (!user) return null;

  if (user.user_type === 'employee') {
    return Employee.findOne({
      where: { user_id: user.id },
      include: [
        { model: State, as: 'State', attributes: ['id', 'state_english', 'state_hindi'] },
        { model: City, as: 'City', attributes: ['id', 'state_id', 'city_english', 'city_hindi'] },
        { model: State, as: 'PreferredState', attributes: ['id', 'state_english', 'state_hindi'] },
        { model: City, as: 'PreferredCity', attributes: ['id', 'state_id', 'city_english', 'city_hindi'] },
        { model: Qualification, as: 'Qualification', attributes: ['id', 'qualification_english', 'qualification_hindi'] },
        { model: Shift, as: 'Shift', attributes: ['id', 'shift_english', 'shift_hindi', 'shift_from', 'shift_to'] },
        { model: EmployeeSubscriptionPlan, as: 'SubscriptionPlan', attributes: ['id', 'plan_name_english', 'plan_name_hindi', 'plan_validity_days', 'plan_price'] },
      ],
    });
  }

  if (user.user_type === 'employer') {
    return Employer.findOne({
      where: { user_id: user.id },
      include: [
        { model: State, as: 'State', attributes: ['id', 'state_english', 'state_hindi'] },
        { model: City, as: 'City', attributes: ['id', 'state_id', 'city_english', 'city_hindi'] },
        { model: EmployerSubscriptionPlan, as: 'SubscriptionPlan', attributes: ['id', 'plan_name_english', 'plan_name_hindi', 'plan_validity_days', 'plan_price'] },
        { model: BusinessCategory, as: 'BusinessCategory', attributes: ['id', 'category_english', 'category_hindi'] },
      ],
    });
  }

  return null;
}

async function ensureProfileRecordForUser(user, transaction) {
  if (!user?.id) return null;

  const normalizedType = String(user.user_type || '').trim().toLowerCase();
  if (!normalizedType) return null;

  const opts = transaction ? { transaction } : {};

  // Credits are NOT set here — they are applied after signup via applyReferralCredits
  // (referral case) or applyWelcomeCredits (no-referral case) so the two paths
  // stay mutually exclusive.
  if (normalizedType === 'employee') {
    const [employee] = await Employee.findOrCreate({
      where: { user_id: user.id },
      defaults: {
        user_id: user.id,
        name: user.name || null,
        name_hindi: user.name_hindi || null,
        verification_status: 'init',
        kyc_status: 'init',
      },
      ...opts,
    });
    return employee;
  }

  if (normalizedType === 'employer') {
    const fallbackName = String(user.name || '').trim() || 'Employer';
    const [employer] = await Employer.findOrCreate({
      where: { user_id: user.id },
      defaults: {
        user_id: user.id,
        name: fallbackName,
        name_hindi: user.name_hindi || null,
        verification_status: 'init',
        kyc_status: 'init',
      },
      ...opts,
    });
    return employer;
  }

  return null;
}

function serializeUser(userInstance) {
  if (!userInstance) return null;
  const user = userInstance.toJSON ? userInstance.toJSON() : userInstance;

  // Never leak OTP
  delete user.otp;

  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    referred_by: user.referred_by,
    referral_code: user.referral_code,
    total_referred: user.total_referred,
    user_type: user.user_type,
    profile_status: user.profile_status,
    phone_verified_at: user.phone_verified_at,
    profile_completed_at: user.profile_completed_at,
    is_active: user.is_active,
    delete_pending: user.delete_pending,
  };
}

function oneWeekFromNow() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

function isCreditExpired(expiryAt) {
  if (!expiryAt) return true;
  return new Date(expiryAt).getTime() <= Date.now();
}

// Returns true if referral was found (applied or already processed), false otherwise.
async function applyReferralCredits(newUser) {
  const referralCode = String(newUser.referred_by || '').trim();
  if (!referralCode) return false;

  const userType = String(newUser.user_type || '').trim().toLowerCase();
  if (!['employee', 'employer'].includes(userType)) return false;

  const referrer = await User.findOne({
    where: { referral_code: referralCode },
    attributes: ['id', 'user_type'],
  });
  if (!referrer) return false;

  // Idempotency: skip if already processed
  const existing = await Referral.findOne({ where: { user_id: newUser.id } });
  if (existing) return true;

  const creditSetting = await ReferralCredit.findOne({ order: [['id', 'ASC']] });
  if (!creditSetting) return false;

  const referrerType = String(referrer.user_type || '').trim().toLowerCase();

  // Credits for the new user — based on the new user's own type
  let newContactCredit = 0, newInterestCredit = 0, newAdsCredit = 0;
  if (userType === 'employee') {
    newContactCredit  = Number(creditSetting.employee_contact_credit)  || 0;
    newInterestCredit = Number(creditSetting.employee_interest_credit) || 0;
  } else {
    newContactCredit  = Number(creditSetting.employer_contact_credit)  || 0;
    newInterestCredit = Number(creditSetting.employer_interest_credit) || 0;
    newAdsCredit      = Number(creditSetting.employer_ads_credit)      || 0;
  }

  // Credits for the referrer — based on the referrer's own type
  let refContactCredit = 0, refInterestCredit = 0, refAdsCredit = 0;
  if (referrerType === 'employee') {
    refContactCredit  = Number(creditSetting.employee_contact_credit)  || 0;
    refInterestCredit = Number(creditSetting.employee_interest_credit) || 0;
  } else if (referrerType === 'employer') {
    refContactCredit  = Number(creditSetting.employer_contact_credit)  || 0;
    refInterestCredit = Number(creditSetting.employer_interest_credit) || 0;
    refAdsCredit      = Number(creditSetting.employer_ads_credit)      || 0;
  }

  const expiryAt = oneWeekFromNow();

  // Apply credits + expiry to the new user based on their own type
  if (userType === 'employee') {
    await Employee.increment(
      { contact_credit: newContactCredit, total_contact_credit: newContactCredit, interest_credit: newInterestCredit, total_interest_credit: newInterestCredit },
      { where: { user_id: newUser.id } },
    );
    await Employee.update({ credit_expiry_at: expiryAt }, { where: { user_id: newUser.id } });
  } else {
    await Employer.increment(
      { contact_credit: newContactCredit, total_contact_credit: newContactCredit, interest_credit: newInterestCredit, total_interest_credit: newInterestCredit, ad_credit: newAdsCredit, total_ad_credit: newAdsCredit },
      { where: { user_id: newUser.id } },
    );
    await Employer.update({ credit_expiry_at: expiryAt }, { where: { user_id: newUser.id } });
  }

  // Apply credits to the referrer based on the referrer's own type
  if (referrerType === 'employee') {
    const referrerProfile = await Employee.findOne({
      where: { user_id: referrer.id },
      attributes: ['id', 'credit_expiry_at'],
    });
    if (referrerProfile) {
      if (isCreditExpired(referrerProfile.credit_expiry_at)) {
        await Employee.update(
          { contact_credit: refContactCredit, interest_credit: refInterestCredit, credit_expiry_at: expiryAt },
          { where: { id: referrerProfile.id } },
        );
        await Employee.increment(
          { total_contact_credit: refContactCredit, total_interest_credit: refInterestCredit },
          { where: { id: referrerProfile.id } },
        );
      } else {
        await Employee.increment(
          { contact_credit: refContactCredit, total_contact_credit: refContactCredit, interest_credit: refInterestCredit, total_interest_credit: refInterestCredit },
          { where: { id: referrerProfile.id } },
        );
      }
    }
  } else if (referrerType === 'employer') {
    const referrerProfile = await Employer.findOne({
      where: { user_id: referrer.id },
      attributes: ['id', 'credit_expiry_at'],
    });
    if (referrerProfile) {
      if (isCreditExpired(referrerProfile.credit_expiry_at)) {
        await Employer.update(
          { contact_credit: refContactCredit, interest_credit: refInterestCredit, ad_credit: refAdsCredit, credit_expiry_at: expiryAt },
          { where: { id: referrerProfile.id } },
        );
        await Employer.increment(
          { total_contact_credit: refContactCredit, total_interest_credit: refInterestCredit, total_ad_credit: refAdsCredit },
          { where: { id: referrerProfile.id } },
        );
      } else {
        await Employer.increment(
          { contact_credit: refContactCredit, total_contact_credit: refContactCredit, interest_credit: refInterestCredit, total_interest_credit: refInterestCredit, ad_credit: refAdsCredit, total_ad_credit: refAdsCredit },
          { where: { id: referrerProfile.id } },
        );
      }
    }
  }

  // Record the referral — store the new user's credit amounts (keyed to their user_type)
  await Referral.create({
    referral_id: referrer.id,
    user_id: newUser.id,
    referral_code: referralCode,
    user_type: userType,
    contact_credit: newContactCredit,
    interest_credit: newInterestCredit,
    ads_credit: newAdsCredit,
  });

  await User.increment({ total_referred: 1 }, { where: { id: referrer.id } });
  return true;
}

// Called when a new user signs up without a referral code — applies admin-configured welcome credits.
async function applyWelcomeCredits(newUser) {
  const userType = String(newUser.user_type || '').trim().toLowerCase();
  if (!['employee', 'employer'].includes(userType)) return;

  const setting = await fetchWelcomeCreditSettings();

  if (userType === 'employee') {
    const { contact_credit, interest_credit, credit_expiry_at } = buildEmployeeWelcomeCredits(setting);
    if (!contact_credit && !interest_credit) return;
    await Employee.increment(
      { contact_credit, total_contact_credit: contact_credit, interest_credit, total_interest_credit: interest_credit },
      { where: { user_id: newUser.id } },
    );
    if (credit_expiry_at) {
      await Employee.update({ credit_expiry_at }, { where: { user_id: newUser.id } });
    }
  } else {
    const { contact_credit, interest_credit, ad_credit, credit_expiry_at } = buildEmployerWelcomeCredits(setting);
    if (!contact_credit && !interest_credit && !ad_credit) return;
    await Employer.increment(
      { contact_credit, total_contact_credit: contact_credit, interest_credit, total_interest_credit: interest_credit, ad_credit, total_ad_credit: ad_credit },
      { where: { user_id: newUser.id } },
    );
    if (credit_expiry_at) {
      await Employer.update({ credit_expiry_at }, { where: { user_id: newUser.id } });
    }
  }
}

async function sendLoginOtp(req, res) {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    if (!mobile) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Mobile number is required',
        data: null,
      });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    if (user.is_active === false) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_03',
        message: 'User account is inactive',
        data: null,
      });
    }

    const { sessionId } = await sendTwoFactorOtp(mobile);
    await user.update({ otp: sessionId });

    const includeSessionId = isTruthyEnv(process.env.DEBUG_OTP);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'OTP sent successfully',
      data: includeSessionId ? { mobile, session_id: sessionId, sessionId } : { mobile },
    });
  } catch (error) {
    console.error('[app/auth/login/send-otp]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_04',
      message: 'Failed to send OTP',
      data: null,
    });
  }
}

async function verifyLoginOtp(req, res) {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const otp = String(req.body?.otp || '').trim();
    const fcmToken = String(req.body?.fcm_token ?? req.body?.fcmToken ?? '').trim();

    if (!mobile || !otp) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Mobile number and OTP are required',
        data: null,
      });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const sessionId = String(user.otp || '').trim();
    if (!sessionId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_03',
        message: 'OTP session not found. Please request OTP again.',
        data: null,
      });
    }

    const verification = await verifyTwoFactorOtp(sessionId, otp);
    if (!verification.matched) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_03',
        message: verification.details || 'Invalid OTP',
        data: null,
      });
    }

    const now = new Date();
    const updatePayload = {
      otp: null,
      phone_verified_at: user.phone_verified_at || now,
      last_active_at: now,
    };
    if (fcmToken) updatePayload.fcm_token = fcmToken;

    await user.update(updatePayload);

    await ensureReferralCode(user);

    const profile = await loadProfileWithNames(user);

    const profileCompleted = Boolean(user.profile_completed_at);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'OTP verified successfully',
      data: {
        user: serializeUser(user),
        profile_type: user.user_type || null,
        profile: profile ? (profile.toJSON ? profile.toJSON() : profile) : null,
        profile_completed: profileCompleted,
      },
    });
  } catch (error) {
    console.error('[app/auth/login/verify-otp]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_04',
      message: 'Failed to verify OTP',
      data: null,
    });
  }
}

async function sendSignupOtp(req, res) {
  try {
    const nameRaw = req.body?.name;
    const name = nameRaw === undefined || nameRaw === null
      ? null
      : String(nameRaw).trim() || null;
    const nameHindiRaw = req.body?.name_hindi;
    const nameHindi = nameHindiRaw === undefined || nameHindiRaw === null
      ? null
      : String(nameHindiRaw).trim() || null;
    const mobile = normalizeMobile(req.body?.mobile);
    const referredBy = req.body?.referred_by == null ? null : String(req.body.referred_by).trim();
    const userType = String(req.body?.user_type || '').trim();

    if ((!name && !nameHindi) || !mobile || !userType) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Name, mobile number, and user type are required',
        data: null,
      });
    }

    if (!['employee', 'employer'].includes(userType)) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'user_type must be either employee or employer',
        data: null,
      });
    }

    const existing = await User.findOne({ where: { mobile } });
    const includeSessionId = isTruthyEnv(process.env.DEBUG_OTP);

  const namePair = await fillBilingualPair(name, nameHindi);

    // If user exists but phone is not verified yet, treat this as a re-signup and replace details
    if (existing) {
      if (existing.phone_verified_at) {
        return sendApiResponse(res, {
          ok: false,
          code: 'FC_03',
          message: 'User account already exists',
          data: null,
        });
      }

      const { sessionId } = await sendTwoFactorOtp(mobile);

      await existing.update({
        name: namePair.english,
        name_hindi: namePair.hindi,
        referred_by: referredBy,
        user_type: userType,
        otp: sessionId,
        is_active: true,
      });

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: 'Signup OTP sent successfully',
        data: includeSessionId
          ? { mobile, session_id: sessionId, sessionId, user: serializeUser(existing) }
          : { mobile, user: serializeUser(existing) },
      });
    }

    const { sessionId } = await sendTwoFactorOtp(mobile);

    const user = await User.create({
      name: namePair.english,
      name_hindi: namePair.hindi,
      mobile,
      referred_by: referredBy,
      user_type: userType,
      otp: sessionId,
      is_active: true,
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Signup OTP sent successfully',
      data: includeSessionId
        ? { mobile, session_id: sessionId, sessionId, user: serializeUser(user) }
        : { mobile, user: serializeUser(user) },
    });
  } catch (error) {
    console.error('[app/auth/signup/send-otp]', error);

    // Unique constraint safety (race condition)
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_03',
        message: 'Mobile number already exists',
        data: null,
      });
    }

    return sendApiResponse(res, {
      ok: false,
      code: 'FC_04',
      message: 'Failed to send signup OTP',
      data: null,
    });
  }
}

async function verifySignupOtp(req, res) {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const otp = String(req.body?.otp || '').trim();
    const fcmToken = String(req.body?.fcm_token ?? req.body?.fcmToken ?? '').trim();

    if (!mobile || !otp) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Mobile number and OTP are required',
        data: null,
      });
    }

    const user = await User.findOne({
      where: {
        mobile,
        // Avoid verifying soft-deleted users
        deleted_at: { [Op.is]: null },
      },
    });

    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'Invalid OTP',
        data: null,
      });
    }

    const sessionId = String(user.otp || '').trim();
    if (!sessionId) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'OTP session not found. Please request OTP again.',
        data: null,
      });
    }

    const verification = await verifyTwoFactorOtp(sessionId, otp);
    if (!verification.matched) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: verification.details || 'Invalid OTP',
        data: null,
      });
    }

    const now = new Date();

    // Keep otp intact until ALL critical operations succeed so the user can retry on failure.
    const updatePayload = {
      phone_verified_at: user.phone_verified_at || now,
      last_active_at: now,
    };
    if (fcmToken) updatePayload.fcm_token = fcmToken;

    const t = await sequelize.transaction();
    try {
      await user.update(updatePayload, { transaction: t });
      await ensureReferralCode(user, t);
      await ensureProfileRecordForUser(user, t);
      // Null the OTP only after every operation committed — prevents retry being blocked
      await user.update({ otp: null }, { transaction: t });
      await t.commit();
    } catch (txError) {
      await t.rollback();
      throw txError;
    }

    await (async () => {
      try {
        await applyReferralCredits(user);
        await applyWelcomeCredits(user);
      } catch (err) {
        console.error('[app/auth/signup/verify-otp] credits error:', err);
      }
    })();

    const profile = await loadProfileWithNames(user);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Signup OTP verified successfully',
      data: {
        user: serializeUser(user),
        profile_type: user.user_type || null,
        profile: profile ? (profile.toJSON ? profile.toJSON() : profile) : null,
        profile_completed: Boolean(user.profile_completed_at),
      },
    });
  } catch (error) {
    console.error('[app/auth/signup/verify-otp] ERROR:', error?.message || error);
    console.error('[app/auth/signup/verify-otp] STACK:', error?.stack);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to verify signup OTP',
      data: null,
    });
  }
}

module.exports = {
  sendLoginOtp,
  verifyLoginOtp,
  sendSignupOtp,
  verifySignupOtp,
};
