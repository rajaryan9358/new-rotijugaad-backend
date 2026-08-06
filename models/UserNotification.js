const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserNotification = sequelize.define('UserNotification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  user_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  title_english: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  title_hindi: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  body_english: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  body_hindi: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  reference_type: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_notifications',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['user_id', 'created_at'] },
  ],
});

module.exports = UserNotification;
