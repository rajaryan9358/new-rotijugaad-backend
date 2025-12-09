const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Shift = sequelize.define('Shift', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  shift_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  shift_hindi: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  shift_from: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  shift_to: {
    type: DataTypes.TIME,
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
  tableName: 'shifts',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Shift;
