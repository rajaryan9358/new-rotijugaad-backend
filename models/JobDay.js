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
    comment: 'Numeric 1-7 or weekday name (e.g. 1, Monday, Tue). UI may render as Mon,Tue,Wed.',
  },
}, {
  tableName: 'job_days',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

// NOTE: Vacancies UI uses Job.hired_total/no_vacancy (not related to JobDay).
// (no changes needed; expired-logic is handled in backend/routes/jobs.js)

module.exports = JobDay;
