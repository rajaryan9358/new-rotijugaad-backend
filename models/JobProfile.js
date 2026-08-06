const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobProfile = sequelize.define('JobProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  profile_english: { type: DataTypes.STRING(150), allowNull: true, field: 'profile_english' },
  profile_hindi: { type: DataTypes.STRING(150), allowNull: true, field: 'profile_hindi' },
  profile_image: { type: DataTypes.STRING(255), allowNull: true, field: 'profile_image' },
  sequence: { type: DataTypes.INTEGER, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: DataTypes.DATE, allowNull: true, field: 'created_at' },
  updated_at: { type: DataTypes.DATE, allowNull: true, field: 'updated_at' },
  deleted_at: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' }
}, {
  tableName: 'job_profiles',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at'
});

module.exports = JobProfile;
