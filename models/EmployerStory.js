const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const EmployerStory = sequelize.define("EmployerStory", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  employer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "employers", key: "id" },
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
  tableName: "employer_stories",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

module.exports = EmployerStory;
