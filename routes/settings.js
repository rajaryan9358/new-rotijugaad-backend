const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');

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

router.get('/', async (req, res) => {
  try {
    const setting = await Setting.findOne({ order: [['id', 'ASC']] });


    res.json({ success: true, data: setting });
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
    const existing = await Setting.findOne({ order: [['id', 'ASC']] });
    let setting;
    if (existing) {
      await existing.update(payload);
      setting = existing;
    } else {
      setting = await Setting.create(payload);
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

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('[settings:upsert] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
