const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Experience = sequelize.define('Experience', {
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
  exp_from: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  exp_to: {
    type: DataTypes.INTEGER,
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
  exp_type: {
    type: DataTypes.ENUM('month', 'year'),
    allowNull: false,
    defaultValue: 'year',
    validate: {
      isIn: [['month', 'year']],
    },
  },
}, {
  tableName: 'experiences',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = Experience;
