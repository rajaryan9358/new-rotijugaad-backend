const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SelectedJobBenefit = sequelize.define('SelectedJobBenefit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  benefit_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'job_benefits', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'selected_job_benefits',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = SelectedJobBenefit;
