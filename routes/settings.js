const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');

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
    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('[settings:upsert] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
