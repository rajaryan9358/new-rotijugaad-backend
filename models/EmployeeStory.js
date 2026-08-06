const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const EmployeeStory = sequelize.define("EmployeeStory", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "employees", key: "id" },
    onDelete: "CASCADE",
  },

  story_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "stories", key: "id" },
    onDelete: "CASCADE",
  },

  read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: "employee_stories",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

module.exports = EmployeeStory;
