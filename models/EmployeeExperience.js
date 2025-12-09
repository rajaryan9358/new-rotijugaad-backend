const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const WorkNature = require('./WorkNature'); // added

const EmployeeExperience = sequelize.define('EmployeeExperience', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },

  document_type_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'document_types', key: 'id' },
  },

  work_nature_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'work_natures', key: 'id' },
  },

  previous_firm: { type: DataTypes.STRING, allowNull: true },
  work_duration: { type: DataTypes.DECIMAL(8,2), allowNull: true },
  work_duration_frequency: { type: DataTypes.STRING, allowNull: true },

  experience_certificate: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'employee_experiences',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});

// ensure association for includes
if (!EmployeeExperience.associations?.WorkNature) {
  EmployeeExperience.belongsTo(WorkNature, {
    as: 'WorkNature',
    foreignKey: 'work_nature_id'
  });
}

module.exports = EmployeeExperience;
