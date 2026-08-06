const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobSkill = sequelize.define('JobSkill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },
  skill_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'skills', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'job_skills',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = JobSkill;
