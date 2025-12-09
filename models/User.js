const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  referred_by: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  preferred_language: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  user_type: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: {
        args: [['employee', 'employer']],
        msg: 'user_type must be either employee or employer'
      }
    },
  },
  profile_status: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  delete_pending: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  delete_requested_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_active_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // referral fields
  referral_code: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  total_referred: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'users',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = User;
