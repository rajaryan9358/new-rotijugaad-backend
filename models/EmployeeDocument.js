const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmployeeDocument = sequelize.define('EmployeeDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },

  document_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },

  document_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },

  document_size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },

  document_link: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
}, {
  tableName: 'employee_documents',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

module.exports = EmployeeDocument;
