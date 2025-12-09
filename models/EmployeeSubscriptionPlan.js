const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployeeSubscriptionPlan = sequelize.define('EmployeeSubscriptionPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  plan_name_english: { type: DataTypes.STRING, allowNull: false },
  plan_name_hindi: { type: DataTypes.STRING, allowNull: true },

  plan_validity_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  plan_tagline_english: { type: DataTypes.STRING, allowNull: true },
  plan_tagline_hindi: { type: DataTypes.STRING, allowNull: true },

  plan_price: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },

  contact_credits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  interest_credits: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },

  sequence: { type: DataTypes.INTEGER, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },

  deleted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'employee_subscription_plans',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = EmployeeSubscriptionPlan;
