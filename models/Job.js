const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const crypto = require('crypto');

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateSlug(length = 12) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[crypto.randomInt(0, SLUG_ALPHABET.length)];
  }
  return out;
}

const Job = sequelize.define('Job', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  slug: { type: DataTypes.STRING(32), allowNull: false, unique: true },

  employer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employers', key: 'id' },
    onDelete: 'CASCADE',
  },

  job_profile_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'job_profiles', key: 'id' },
  },

  job_designation_english: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  job_designation_hindi: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  is_household: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  description_english: { type: DataTypes.TEXT, allowNull: true },
  description_hindi: { type: DataTypes.TEXT, allowNull: true },

  no_vacancy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  hired_total: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  interviewer_contact: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  interviewer_contact_otp: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  job_address_english: { type: DataTypes.TEXT, allowNull: true },
  job_address_hindi: { type: DataTypes.TEXT, allowNull: true },

  job_state_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'states', key: 'id' },
  },

  job_city_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'cities', key: 'id' },
  },

  lat: { type: DataTypes.DECIMAL(10,7), allowNull: true },
  lng: { type: DataTypes.DECIMAL(10,7), allowNull: true },
  job_location: { type: DataTypes.STRING(500), allowNull: true },

  other_benefit_english: { type: DataTypes.TEXT, allowNull: true },
  other_benefit_hindi: { type: DataTypes.TEXT, allowNull: true },

salary_type_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'salary_types', key: 'id' },
  },

  salary_min: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: true,
  },

  salary_max: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: true,
  },

  work_start_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },

  work_end_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired'),
    allowNull: false,
    defaultValue: 'active',
  },

  verification_status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },

  show_organization: {
    type: DataTypes.TINYINT(1),
    allowNull: false,
    defaultValue: 1,
  },

  // NOTE: expired_at is the authoritative "expired" marker for filtering/UI.
  expired_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  status_changed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

}, {
  tableName: 'jobs',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

Job.beforeValidate((job) => {
  if (!job) return;
  if (job.slug && String(job.slug).trim().length) return;
  job.slug = generateSlug();
});

// MIGRATION (run once in DB; MySQL example):
// ALTER TABLE `jobs`
//   ADD COLUMN `verification_status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'
//   AFTER `status`;

const State = require('./State');
const City = require('./City');
const Admin = require('./Admin');

if (!Job.associations.JobState) {
  Job.belongsTo(State, {
    foreignKey: 'job_state_id',
    as: 'JobState'
  });
}
if (!Job.associations.JobCity) {
  Job.belongsTo(City, {
    foreignKey: 'job_city_id',
    as: 'JobCity'
  });
}

// NOTE: Do not add Job.belongsTo(Employer, { as: 'Employer' }) here;
// an association with alias "Employer" is already defined elsewhere and will crash Sequelize.

if (!Job.associations.StatusChangedBy) {
  Job.belongsTo(Admin, {
    foreignKey: 'status_changed_by',
    as: 'StatusChangedBy',
    constraints: false,
  });
}

// (no changes needed; status enum already includes 'expired')

module.exports = Job;
