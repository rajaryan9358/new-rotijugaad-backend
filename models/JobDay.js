const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobDay = sequelize.define('JobDay', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  day: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Numeric 1-7 or weekday name (e.g. 1, Monday, Tue)',
  },
}, {
  tableName: 'job_days',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobDay;
