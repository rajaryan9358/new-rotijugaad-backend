const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobInterest = sequelize.define('JobInterest', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  sender_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID of the sender expressing interest',
  },

  sender_type: {
    type: DataTypes.ENUM('employee', 'employer'),
    allowNull: false,
    comment: 'Type of the sender: employee or employer',
  },

  receiver_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID of the receiver',
  },

  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },

  status: {
    type: DataTypes.ENUM('pending', 'shortlisted', 'hired', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Interest status',
  },

  otp: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'OTP for verification',
  },

}, {
  tableName: 'job_interests',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = JobInterest;
