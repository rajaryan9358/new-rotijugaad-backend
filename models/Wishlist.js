const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Wishlist = sequelize.define('Wishlist', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'employees', key: 'id' },
    onDelete: 'CASCADE',
  },

  job_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'jobs', key: 'id' },
    onDelete: 'CASCADE',
  },

}, {
  tableName: 'wishlists',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = Wishlist;
