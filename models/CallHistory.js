const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Migration SQL (run once):
 *   ALTER TABLE call_histories
 *     ADD COLUMN called_id INT NULL AFTER user_id;
 *
 * Optional (recommended) indexes:
 *   CREATE INDEX idx_call_histories_user_type_created_at ON call_histories (user_type, created_at);
 *   CREATE INDEX idx_call_histories_user_type_called_id ON call_histories (user_type, called_id);
 */

const CallHistory = sequelize.define('CallHistory', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  user_type: {
    type: DataTypes.ENUM('employee', 'employer'),
    allowNull: false,
    comment: 'employee or employer',
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Employee ID when user_type=employee, Employer ID when user_type=employer',
  },

  called_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'If user_type=employee => called_id is job_id; if user_type=employer => called_id is employee_id',
  },

  call_experience_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to call experience/rating',
  },

  review: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the review was read',
  },

}, {
  tableName: 'call_histories',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = CallHistory;
