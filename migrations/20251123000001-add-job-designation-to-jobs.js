'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const definition = await queryInterface.describeTable('jobs');
    if (!definition.job_designation) {
      await queryInterface.addColumn('jobs', 'job_designation', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'job_profile_id',
      });
    }
  },

  async down(queryInterface) {
    const definition = await queryInterface.describeTable('jobs');
    if (definition.job_designation) {
      await queryInterface.removeColumn('jobs', 'job_designation');
    }
  },
};