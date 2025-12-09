const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobShift = sequelize.define('JobShift', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  shift_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'shifts', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'job_shifts',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobShift;
