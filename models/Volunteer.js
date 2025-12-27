const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Volunteer = sequelize.define('Volunteer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: true },
  phone_number: { type: DataTypes.STRING, allowNull: false },
  assistant_code: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },

  deleted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'volunteers',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Volunteer;
