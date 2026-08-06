"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable("employee_stories", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employee_id: { type: DataTypes.INTEGER, allowNull: false },
      story_id: { type: DataTypes.INTEGER, allowNull: false },
      read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });

    await queryInterface.addConstraint("employee_stories", {
      fields: ["employee_id"],
      type: "foreign key",
      name: "fk_employee_stories_employee_id",
      references: { table: "employees", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("employee_stories", {
      fields: ["story_id"],
      type: "foreign key",
      name: "fk_employee_stories_story_id",
      references: { table: "stories", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addIndex("employee_stories", ["employee_id", "story_id"], {
      unique: true,
      name: "uniq_employee_story",
    });

    await queryInterface.createTable("employer_stories", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employer_id: { type: DataTypes.INTEGER, allowNull: false },
      story_id: { type: DataTypes.INTEGER, allowNull: false },
      read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });

    await queryInterface.addConstraint("employer_stories", {
      fields: ["employer_id"],
      type: "foreign key",
      name: "fk_employer_stories_employer_id",
      references: { table: "employers", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("employer_stories", {
      fields: ["story_id"],
      type: "foreign key",
      name: "fk_employer_stories_story_id",
      references: { table: "stories", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addIndex("employer_stories", ["employer_id", "story_id"], {
      unique: true,
      name: "uniq_employer_story",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("employer_stories");
    await queryInterface.dropTable("employee_stories");
  },
};
