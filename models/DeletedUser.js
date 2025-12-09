const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const DeletedUser = sequelize.define('DeletedUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    references: { model: 'users', key: 'id' },
  },
  user_name: {
    type: DataTypes.STRING,
  },
  mobile: {
    type: DataTypes.STRING,
  },
  referred_by: {
    type: DataTypes.STRING,
  },
  user_type: {
    type: DataTypes.ENUM('employee', 'employer'),
    allowNull: true,
  },
  user_created_at: {
    type: DataTypes.DATE,
  },
  deleted_requested_at: {
    type: DataTypes.DATE,
  },
  total_referred: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_active_at: {
    type: DataTypes.DATE,
  },
}, {
  tableName: 'deleted_users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = DeletedUser;
