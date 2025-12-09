const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobQualification = sequelize.define('JobQualification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  qualification_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'qualifications', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'job_qualifications',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobQualification;
