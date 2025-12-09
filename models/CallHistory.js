const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

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
