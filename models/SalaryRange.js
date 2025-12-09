const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SalaryRange = sequelize.define('SalaryRange', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  salary_from: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  salary_to: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'salary_ranges',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = SalaryRange;
