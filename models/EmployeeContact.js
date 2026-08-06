const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployeeContact = sequelize.define('EmployeeContact', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },

  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },

  employer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employers', key: 'id' },
    onDelete: 'CASCADE',
  },

  call_experience_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'call_histories', key: 'id' },
    onDelete: 'SET NULL',
    comment: 'Reference to call history entry for this contact',
  },

  closing_credit: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: true,
    comment: 'Credit amount used for this contact',
  },

}, {
  tableName: 'employee_contacts',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = EmployeeContact;
