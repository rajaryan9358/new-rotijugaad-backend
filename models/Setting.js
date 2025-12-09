const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Setting = sequelize.define('Setting', {
  employee_support_mobile: { type: DataTypes.STRING, allowNull: true },
  employee_support_email: { type: DataTypes.STRING, allowNull: true },
  employer_support_mobile: { type: DataTypes.STRING, allowNull: true },
  employer_support_email: { type: DataTypes.STRING, allowNull: true },
  privacy_policy: { type: DataTypes.TEXT, allowNull: true },
  terms_and_conditions: { type: DataTypes.TEXT, allowNull: true },
  refund_policy: { type: DataTypes.TEXT, allowNull: true },
  linkedin_link: { type: DataTypes.STRING, allowNull: true },
  xl_link: { type: DataTypes.STRING, allowNull: true },
  facebook_link: { type: DataTypes.STRING, allowNull: true },
  instagram_link: { type: DataTypes.STRING, allowNull: true },
  cashfree_id: { type: DataTypes.STRING, allowNull: true },
  cashfree_secret: { type: DataTypes.STRING, allowNull: true },
  whatsapp_id: { type: DataTypes.STRING, allowNull: true },
  whatsapp_key: { type: DataTypes.STRING, allowNull: true },
  kyc_id: { type: DataTypes.STRING, allowNull: true },
  kyc_key: { type: DataTypes.STRING, allowNull: true },
  google_translate_key: { type: DataTypes.STRING, allowNull: true },
  sms_id: { type: DataTypes.STRING, allowNull: true },
  sms_key: { type: DataTypes.STRING, allowNull: true }
}, {
  tableName: 'settings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Setting;
