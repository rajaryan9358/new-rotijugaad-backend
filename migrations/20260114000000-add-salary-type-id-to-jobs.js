'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let cols;
    try {
      cols = await queryInterface.describeTable('jobs');
    } catch {
      cols = null;
    }

    if (!cols) return;

    if (!Object.prototype.hasOwnProperty.call(cols, 'salary_type_id')) {
      await queryInterface.addColumn('jobs', 'salary_type_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    let cols;
    try {
      cols = await queryInterface.describeTable('jobs');
    } catch {
      cols = null;
    }

    if (!cols) return;

    if (Object.prototype.hasOwnProperty.call(cols, 'salary_type_id')) {
      await queryInterface.removeColumn('jobs', 'salary_type_id');
    }
  }
};
