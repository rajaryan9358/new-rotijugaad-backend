const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Job = sequelize.define('Job', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

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

  other_benefit_english: { type: DataTypes.TEXT, allowNull: true },
  other_benefit_hindi: { type: DataTypes.TEXT, allowNull: true },

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
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
  },

  hired_total: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  expired_at: {
    type: DataTypes.DATE,
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

const State = require('./State');
const City = require('./City');

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

module.exports = Job;
