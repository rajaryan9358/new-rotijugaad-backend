const Setting = require('../../models/Setting');

const publicFields = [
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
  'updated_at',
];

const pickPublicFields = (setting) => {
  const payload = {};
  for (const field of publicFields) {
    payload[field] = setting?.[field] ?? '';
  }
  return payload;
};

const getAppSettings = async (_req, res) => {
  try {
    const setting = await Setting.findOne({
      order: [['id', 'ASC']],
      attributes: ['id', ...publicFields],
    });

    res.json({ success: true, data: pickPublicFields(setting) });
  } catch (error) {
    console.error('[app-settings:get] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAppSettings };
