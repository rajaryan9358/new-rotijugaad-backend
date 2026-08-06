const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewerContactOtp = sequelize.define('InterviewerContactOtp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  employer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employers', key: 'id' },
    onDelete: 'CASCADE',
  },

  interviewer_contact: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  otp: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },

  session_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  otp_created_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },

  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },

  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },


  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  last_attempt_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'interviewer_contact_otps',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  indexes: [
    {
      unique: true,
      fields: ['employer_id', 'interviewer_contact', 'is_active'],
      name: 'uniq_interviewer_contact_otp_active',
    },
  ],
});

module.exports = InterviewerContactOtp;
