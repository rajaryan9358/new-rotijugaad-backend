const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const BusinessCategory = require('./BusinessCategory');

const Employer = sequelize.define('Employer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },

  name: { type: DataTypes.STRING, allowNull: false },
  name_hindi: { type: DataTypes.STRING, allowNull: true },

  organization_type: { type: DataTypes.STRING, allowNull: true },
  organization_name: { type: DataTypes.STRING, allowNull: true },
  organization_name_hindi: { type: DataTypes.STRING, allowNull: true },

  business_category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'business_categories', key: 'id' },
  },

  address: { type: DataTypes.TEXT, allowNull: true },
  address_hindi: { type: DataTypes.TEXT, allowNull: true },

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

  assisted_by: { type: DataTypes.STRING, allowNull: true },

  email: { type: DataTypes.STRING, allowNull: true },

  aadhar_number: { type: DataTypes.STRING, allowNull: true },
  aadhar_verified_at: { type: DataTypes.DATE, allowNull: true },

  aadhar_number_pending: { type: DataTypes.STRING, allowNull: true },
  aadhar_request_id: { type: DataTypes.STRING, allowNull: true },
  aadhar_otp: { type: DataTypes.STRING(10), allowNull: true },
  aadhar_otp_created_at: { type: DataTypes.DATE, allowNull: true },

  document_link: { type: DataTypes.STRING, allowNull: true },

  verification_status: {
    type: DataTypes.ENUM('init', 'pending', 'verified', 'rejected'),
    allowNull: false,
    defaultValue: 'init',
  },

  verification_at: { type: DataTypes.DATE, allowNull: true },
  status_changed_by: { type: DataTypes.INTEGER, allowNull: true },

  kyc_status: {
    type: DataTypes.ENUM('init', 'pending', 'verified', 'rejected'),
    allowNull: false,
    defaultValue: 'init',
  },

  kyc_verification_at: { type: DataTypes.DATE, allowNull: true }, // NEW: timestamp used by admin-web filters + dashboard recent additions

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

  total_ad_credit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  ad_credit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  credit_expiry_at: { type: DataTypes.DATE, allowNull: true },

  subscription_plan_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'employer_subscription_plans', key: 'id' },
  },

}, {
  tableName: 'employers',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

const Admin = require('./Admin');
if (!Employer.associations.StatusChangedBy) {
  Employer.belongsTo(Admin, { foreignKey: 'status_changed_by', as: 'StatusChangedBy', constraints: false });
}

if (!Employer.associations.BusinessCategory) {
  Employer.belongsTo(BusinessCategory, {
    foreignKey: 'business_category_id',
    as: 'BusinessCategory',
  });
}

module.exports = Employer;
