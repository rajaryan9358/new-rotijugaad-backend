const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const State = require('./State');

const City = sequelize.define('City', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  state_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: State,
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  city_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  city_hindi: {
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
}, {
  tableName: 'cities',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

// Define association
State.hasMany(City, { foreignKey: 'state_id', as: 'cities' });
City.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

module.exports = City;
