const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ReferralCredit = sequelize.define('ReferralCredit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  employee_contact_credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  employee_interest_credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  employer_contact_credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  employer_interest_credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  employer_ads_credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'referral_credits',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ReferralCredit;
