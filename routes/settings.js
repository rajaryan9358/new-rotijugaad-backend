const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');

const NEW_WELCOME_DAY_FIELDS = [
  'employee_welcome_subscription_days',
  'employer_welcome_subscription_days',
];

const safeCreateLog = (req, payload) => {
  try {
    return Log.create({
      category: payload.category,
      type: payload.type,
      redirect_to: payload.redirect_to || null,
      log_text: payload.log_text || null,
      rj_employee_id: payload?.rj_employee_id ?? getAdminId(req) ?? null,
    }).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
};

const allowedFields = [
  'employee_contact_credit',
  'employee_interest_credit',
  'employer_contact_credit',
  'employer_interest_credit',
  'employer_ad_credit',
  'employee_welcome_subscription_days',
  'employer_welcome_subscription_days',
  'employee_support_mobile',
  'employee_support_email',
  'employer_support_mobile',
  'employer_support_email',
  'privacy_policy',
  'terms_and_conditions',
  'refund_policy',
  'linkedin_link',
  'xl_link',
  'facebook_link',
  'instagram_link',
  'cashfree_id',
  'cashfree_secret',
  'whatsapp_id',
  'whatsapp_key',
  'kyc_id',
  'kyc_key',
  'google_translate_key',
  'sms_id',
  'sms_key'
];

const LEGACY_ALLOWED_FIELDS = allowedFields.filter(
  (f) => !NEW_WELCOME_DAY_FIELDS.includes(f),
);

const buildAdminPayload = (setting) => {
  const json = setting?.toJSON ? setting.toJSON() : (setting || null);
  const data = json && typeof json === 'object' ? { ...json } : {};

  for (const field of allowedFields) {
    if (!(field in data)) data[field] = '';
  }

  return data;
};

const safeFindFirstSetting = async (attributes) => {
  try {
    return await Setting.findOne({ order: [['id', 'ASC']], attributes });
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.toLowerCase().includes('unknown column')) return null;
    throw error;
  }
};

const safeGetSettingForAdmin = async () => {
  const fullAttributes = ['id', ...allowedFields, 'created_at', 'updated_at'];
  const legacyAttributes = ['id', ...LEGACY_ALLOWED_FIELDS, 'created_at', 'updated_at'];

  const preferred = await safeFindFirstSetting(fullAttributes);
  if (preferred) return preferred;
  return await safeFindFirstSetting(legacyAttributes);
};

const dropNewWelcomeDayFields = (payload) => {
  for (const field of NEW_WELCOME_DAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) delete payload[field];
  }
  return payload;
};

router.get('/', async (req, res) => {
  try {
    const setting = await safeGetSettingForAdmin();
    res.json({ success: true, data: buildAdminPayload(setting) });
  } catch (error) {
    console.error('[settings:get] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        payload[field] = req.body[field];
      }
    });

    const existing = await safeFindFirstSetting(['id', ...LEGACY_ALLOWED_FIELDS]);
    let setting;
    if (existing) {
      try {
        await existing.update(payload);
      } catch (error) {
        const msg = String(error?.message || '');
        if (msg.toLowerCase().includes('unknown column')) {
          await existing.update(dropNewWelcomeDayFields({ ...payload }));
        } else {
          throw error;
        }
      }
      setting = await safeGetSettingForAdmin();
    } else {
      try {
        setting = await Setting.create(payload);
      } catch (error) {
        const msg = String(error?.message || '');
        if (msg.toLowerCase().includes('unknown column')) {
          setting = await Setting.create(dropNewWelcomeDayFields({ ...payload }));
        } else {
          throw error;
        }
      }
      setting = await safeGetSettingForAdmin();
    }

    try {
      const before = existing ? existing.toJSON() : null;
      const changedFields = Object.keys(payload).filter((key) => {
        if (!before) return true;
        return String(before[key] ?? '') !== String(payload[key] ?? '');
      });
      const changedText = changedFields.length ? changedFields.join(', ') : 'no changes';
      void safeCreateLog(req, {
        category: 'setting',
        type: 'update',
        redirect_to: '/settings',
        log_text: `Updated settings (id: ${setting?.id || '-'}) fields: ${changedText}`,
      });
    } catch (_) {}

    res.json({ success: true, data: buildAdminPayload(setting) });
  } catch (error) {
    console.error('[settings:upsert] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
