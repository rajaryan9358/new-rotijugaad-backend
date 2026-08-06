const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PlanBenefit = sequelize.define('PlanBenefit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  
  subscription_type: { 
    type: DataTypes.ENUM('employee', 'employer'), 
    allowNull: false,
    comment: 'Determines whether plan_id targets employee or employer plans'
  },
  
  plan_id: { type: DataTypes.INTEGER, allowNull: false },
  
  benefit_english: { type: DataTypes.STRING, allowNull: false },
  benefit_hindi: { type: DataTypes.STRING, allowNull: true },
  
  sequence: { type: DataTypes.INTEGER, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  
  deleted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'plan_benefits',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = PlanBenefit;
