const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Report = sequelize.define('Report', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reporter user ID - employee_id if report_type is job, employer_id if report_type is employee',
  },

  report_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reported entity ID - job_id if report_type is job, employee_id if report_type is employee',
  },

  report_type: {
    type: DataTypes.ENUM('employee', 'job'),
    allowNull: false,
    comment: 'Type of report - employee or job',
  },

  reason_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Maps to employer_report_reason if job, employee_report_reason if employee',
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the report was read',
  },

}, {
  tableName: 'reports',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Report;
