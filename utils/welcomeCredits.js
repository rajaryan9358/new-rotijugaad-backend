const Setting = require('../models/Setting');

const toNonNegativeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
};

const fetchWelcomeCreditSettings = async () => {
  try {
    const baseAttributes = [
      'employee_contact_credit',
      'employee_interest_credit',
      'employer_contact_credit',
      'employer_interest_credit',
      'employer_ad_credit',
    ];

    const dayAttributes = [
      'employee_welcome_subscription_days',
      'employer_welcome_subscription_days',
    ];

    let row;
    try {
      row = await Setting.findOne({
        order: [['id', 'ASC']],
        attributes: [...baseAttributes, ...dayAttributes],
      });
    } catch (_) {
      // Backward-compat: if DB schema is missing the new day columns, retry.
      row = await Setting.findOne({
        order: [['id', 'ASC']],
        attributes: baseAttributes,
      });
    }

    const setting = row ? (row.toJSON ? row.toJSON() : row) : null;

    return {
      employee_contact_credit: toNonNegativeNumber(setting?.employee_contact_credit),
      employee_interest_credit: toNonNegativeNumber(setting?.employee_interest_credit),
      employer_contact_credit: toNonNegativeNumber(setting?.employer_contact_credit),
      employer_interest_credit: toNonNegativeNumber(setting?.employer_interest_credit),
      employer_ad_credit: toNonNegativeNumber(setting?.employer_ad_credit),
      employee_welcome_subscription_days: toNonNegativeNumber(setting?.employee_welcome_subscription_days),
      employer_welcome_subscription_days: toNonNegativeNumber(setting?.employer_welcome_subscription_days),
    };
  } catch (_) {
    return {
      employee_contact_credit: 0,
      employee_interest_credit: 0,
      employer_contact_credit: 0,
      employer_interest_credit: 0,
      employer_ad_credit: 0,
      employee_welcome_subscription_days: 0,
      employer_welcome_subscription_days: 0,
    };
  }
};

const computeCreditExpiryAt = (days) => {
  const normalized = toNonNegativeNumber(days);
  if (!normalized) return null;
  const wholeDays = Math.floor(normalized);
  if (!wholeDays) return null;

  const dt = new Date();
  dt.setDate(dt.getDate() + wholeDays);
  return dt;
};

const buildEmployeeWelcomeCredits = (setting) => {
  const contact = toNonNegativeNumber(setting?.employee_contact_credit);
  const interest = toNonNegativeNumber(setting?.employee_interest_credit);
  const total = contact + interest;
  const expiryAt = total > 0 ? computeCreditExpiryAt(setting?.employee_welcome_subscription_days) : null;

  return {
    total_contact_credit: contact,
    contact_credit: contact,
    total_interest_credit: interest,
    interest_credit: interest,
    credit_expiry_at: expiryAt,
  };
};

const buildEmployerWelcomeCredits = (setting) => {
  const contact = toNonNegativeNumber(setting?.employer_contact_credit);
  const interest = toNonNegativeNumber(setting?.employer_interest_credit);
  const ads = toNonNegativeNumber(setting?.employer_ad_credit);
  const total = contact + interest + ads;
  const expiryAt = total > 0 ? computeCreditExpiryAt(setting?.employer_welcome_subscription_days) : null;

  return {
    total_contact_credit: contact,
    contact_credit: contact,
    total_interest_credit: interest,
    interest_credit: interest,
    total_ad_credit: ads,
    ad_credit: ads,
    credit_expiry_at: expiryAt,
  };
};

module.exports = {
  fetchWelcomeCreditSettings,
  buildEmployeeWelcomeCredits,
  buildEmployerWelcomeCredits,
};
