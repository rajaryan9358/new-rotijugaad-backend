const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PaymentHistory = sequelize.define('PaymentHistory', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  user_type: {
    type: DataTypes.ENUM('employee', 'employer'),
    allowNull: false,
    comment: 'employee or employer'
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Employee ID when user_type=employee, Employer ID when user_type=employer',
  },

  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to subscription plan',
  },

  price_total: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    comment: 'Total payment amount',
  },

  order_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment gateway order ID',
  },

  payment_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment gateway payment ID',
  },

  payment_signature: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment gateway signature for verification',
  },

  status: {
    type: DataTypes.ENUM('pending', 'failed', 'success'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Payment status (pending, failed, success)',
  },

  contact_credit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },

  interest_credit: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: true,
    defaultValue: 0,
  },

  ads_credit: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: true,
    defaultValue: 0,
  },

  expiry_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry date for the payment/plan',
  },

}, {
  tableName: 'payment_histories',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = PaymentHistory;
