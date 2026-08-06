// Migration usage:
// npm i --save-dev sequelize-cli
// npx sequelize-cli db:migrate
// npx sequelize-cli db:migrate:undo    (undo last)
// npx sequelize-cli db:migrate:undo:all (undo all)

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Story = sequelize.define('Story', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  user_type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Type of user this story is for (e.g., employer, employee)',
    validate: {
      isIn: {
        args: [['employee', 'employer']],
        msg: 'user_type must be either "employee" or "employer"'
      }
    }
  },

  title_english: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  title_hindi: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  description_english: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  description_hindi: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  image: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Relative file path for story image',
  },

  expiry_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Story expiration date/time',
  },

  sequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Display order sequence',
  },

  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

}, {
  tableName: 'stories',
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  defaultScope: {
    order: [
      ['sequence', 'ASC'],
      ['created_at', 'DESC']
    ]
  }
});

module.exports = Story;
