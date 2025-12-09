const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },

  name: { type: DataTypes.STRING, allowNull: true },
  dob: { type: DataTypes.DATEONLY, allowNull: true },
  gender: { type: DataTypes.STRING, allowNull: true },

  state_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'states', key: 'id' },
  },
  city_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'cities', key: 'id' },
  },

  preferred_state_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'states', key: 'id' },
  },
  preferred_city_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'cities', key: 'id' },
  },

  qualification_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'qualifications', key: 'id' },
  },

  expected_salary: { type: DataTypes.DECIMAL(12,2), allowNull: true },
  expected_salary_frequency: { type: DataTypes.STRING, allowNull: true },

  preferred_shift_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'shifts', key: 'id' },
  },

  assistant_code: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: true },
  about_user: { type: DataTypes.TEXT, allowNull: true },

  aadhar_number: { type: DataTypes.STRING, allowNull: true },
  aadhar_verified_at: { type: DataTypes.DATE, allowNull: true },
  selfie_link: { 
    type: DataTypes.STRING(255), 
    allowNull: true 
  }, // reverted to STRING: store only relative file path (e.g. /uploads/selfies/xyz.jpg)

  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },
  kyc_status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },

  // credit and subscription fields
  total_contact_credit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  contact_credit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  total_interest_credit: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    defaultValue: 0,
  },
  interest_credit: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    defaultValue: 0,
  },
  credit_expiry_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  subscription_plan_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'employee_subscription_plans', key: 'id' },
  },

}, {
  tableName: 'employees',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Employee;
