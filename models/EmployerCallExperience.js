const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployerCallExperience = sequelize.define('EmployerCallExperience', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  experience_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  experience_hindi: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  sequence: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'employer_call_experiences',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = EmployerCallExperience;
