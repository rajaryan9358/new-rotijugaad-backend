const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Log = sequelize.define('Log', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  category: {
    type: DataTypes.ENUM(
      'employee',
      'employer',
      'users',
      'pending deletion',
      'deleted users',
      'stories',
      'call history',
      'payment history',
      'voilation reports',
      'jobs',
      'hiring history',
      'employee subscription',
      'employee subscription plan',
      'employer subscription',
      'employer subscription plan',
      'plan benefits',
      'notification',
      'employee referrals',
      'employer referrals',
      'reviews',
      'admin',
      'roles',
      'setting',
      'state',
      'city',
      'skill',
      'qualification',
      'shift',
      'job profile',
      'document',
      'work nature',
      'business category',
      'experience',
      'referral credits',
      'volunteers',
      'salary types',
      'salary ranges',
      'distance',
      'employee call experience',
      'employee report reason',
      'employer call experience',
      'employer report reason',
      'vacancy numbers',
      'job benefits'
    ),
    allowNull: false,
  },

  type: {
    type: DataTypes.ENUM('add', 'update', 'delete', 'export'),
    allowNull: false,
  },

  redirect_to: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  log_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  rj_employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Log;
