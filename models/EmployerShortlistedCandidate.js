const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployerShortlistedCandidate = sequelize.define('EmployerShortlistedCandidate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  employer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employers', key: 'id' },
    onDelete: 'CASCADE',
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'employer_shortlisted_candidates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['employer_id', 'employee_id'],
    },
    {
      fields: ['employer_id'],
    },
    {
      fields: ['employee_id'],
    },
  ],
});

module.exports = EmployerShortlistedCandidate;
