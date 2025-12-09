'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('reports', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      comment: 'Reporter user ID - employee_id if report_type is job, employer_id if report_type is employee',
      after: 'id'
    });

    await queryInterface.addColumn('reports', 'report_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      comment: 'Reported entity ID - job_id if report_type is job, employee_id if report_type is employee',
      after: 'user_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('reports', 'user_id');
    await queryInterface.removeColumn('reports', 'report_id');
  }
};
