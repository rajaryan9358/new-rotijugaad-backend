const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployeeJobProfile = sequelize.define('EmployeeJobProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employee_id: { type: DataTypes.INTEGER, allowNull: false },
  job_profile_id: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'employee_job_profiles',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  indexes: [{ unique: true, fields: ['employee_id', 'job_profile_id'] }]
});

// Associations
// removed any belongsTo(Employee, { as: 'Employee' }) and belongsTo(JobProfile, { as: 'JobProfile' })
// associations handled in models/index.js to avoid duplicate alias errors

module.exports = EmployeeJobProfile;
