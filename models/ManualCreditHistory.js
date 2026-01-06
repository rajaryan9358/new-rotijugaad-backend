const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ManualCreditHistory = sequelize.define(
  'ManualCreditHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_type: {
      type: DataTypes.ENUM('employee', 'employer'),
      allowNull: false,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    contact_credit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    interest_credit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    ad_credit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'manual_credit_histories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = ManualCreditHistory;
