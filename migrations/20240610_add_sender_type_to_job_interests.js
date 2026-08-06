'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('job_interests', 'sender_type', {
      type: Sequelize.ENUM('employee', 'employer'),
      allowNull: false,
      comment: 'Type of the sender: employee or employer',
      defaultValue: 'employee', // Set a default or handle existing rows as needed
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('job_interests', 'sender_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_job_interests_sender_type";');
  }
};
