const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployeeSkill = sequelize.define('EmployeeSkill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },

  skill_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'skills', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'employee_skills',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = EmployeeSkill;
