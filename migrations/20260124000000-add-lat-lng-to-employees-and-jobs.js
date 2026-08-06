"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    let empCols;
    try {
      empCols = await queryInterface.describeTable("employees");
    } catch {
      empCols = null;
    }

    if (empCols) {
      if (Object.prototype.hasOwnProperty.call(empCols, "lat") === false) {
        await queryInterface.addColumn("employees", "lat", {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
        });
      }
      if (Object.prototype.hasOwnProperty.call(empCols, "lng") === false) {
        await queryInterface.addColumn("employees", "lng", {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
        });
      }
    }

    let jobCols;
    try {
      jobCols = await queryInterface.describeTable("jobs");
    } catch {
      jobCols = null;
    }

    if (jobCols) {
      if (Object.prototype.hasOwnProperty.call(jobCols, "lat") === false) {
        await queryInterface.addColumn("jobs", "lat", {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
        });
      }
      if (Object.prototype.hasOwnProperty.call(jobCols, "lng") === false) {
        await queryInterface.addColumn("jobs", "lng", {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    let empCols;
    try {
      empCols = await queryInterface.describeTable("employees");
    } catch {
      empCols = null;
    }

    if (empCols) {
      if (Object.prototype.hasOwnProperty.call(empCols, "lat")) {
        await queryInterface.removeColumn("employees", "lat");
      }
      if (Object.prototype.hasOwnProperty.call(empCols, "lng")) {
        await queryInterface.removeColumn("employees", "lng");
      }
    }

    let jobCols;
    try {
      jobCols = await queryInterface.describeTable("jobs");
    } catch {
      jobCols = null;
    }

    if (jobCols) {
      if (Object.prototype.hasOwnProperty.call(jobCols, "lat")) {
        await queryInterface.removeColumn("jobs", "lat");
      }
      if (Object.prototype.hasOwnProperty.call(jobCols, "lng")) {
        await queryInterface.removeColumn("jobs", "lng");
      }
    }
  }
};
