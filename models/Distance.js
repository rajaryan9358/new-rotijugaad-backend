const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Distance = sequelize.define('Distance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  title_hindi: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  distance: {
    type: DataTypes.DECIMAL(10, 2),
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
  tableName: 'distances',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Distance;
