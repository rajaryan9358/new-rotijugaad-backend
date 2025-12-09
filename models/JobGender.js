const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobGender = sequelize.define('JobGender', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'e.g. male, female, other',
  },
}, {
  tableName: 'job_genders',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobGender;
