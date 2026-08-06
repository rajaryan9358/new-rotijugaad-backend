const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const State = sequelize.define('State', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  state_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state_hindi: {
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
}, {
  tableName: 'states',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = State;
