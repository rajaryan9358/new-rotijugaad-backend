const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobExperience = sequelize.define('JobExperience', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  experience_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'experiences', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'job_experiences',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobExperience;
