const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User'); // added

const Referral = sequelize.define('Referral', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  referral_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  },
  referral_code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  user_type: {
    type: DataTypes.STRING,
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
  ads_credit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'referrals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

Referral.belongsTo(User, { as: 'User', foreignKey: 'user_id' });
Referral.belongsTo(User, { as: 'Referrer', foreignKey: 'referral_id' });

module.exports = Referral;
