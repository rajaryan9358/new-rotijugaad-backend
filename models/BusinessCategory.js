const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const BusinessCategory = sequelize.define('BusinessCategory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  category_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  category_hindi: {
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
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'business_categories',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
});
// Add association (called after all models are loaded)
BusinessCategory.associate = (models) => {
  BusinessCategory.hasMany(models.Employer, {
    foreignKey: 'business_category_id',
    as: 'Employers',
  });
};

module.exports = BusinessCategory;
