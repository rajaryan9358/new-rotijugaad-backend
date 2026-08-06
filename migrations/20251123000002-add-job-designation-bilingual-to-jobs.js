'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const definition = await queryInterface.describeTable('jobs');

    if (!definition.job_designation_english) {
      await queryInterface.addColumn('jobs', 'job_designation_english', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'job_profile_id',
      });
    }

    if (!definition.job_designation_hindi) {
      await queryInterface.addColumn('jobs', 'job_designation_hindi', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'job_designation_english',
      });
    }

    if (definition.job_designation) {
      await queryInterface.sequelize.query(`
        UPDATE jobs
        SET
          job_designation_english = COALESCE(job_designation_english, job_designation),
          job_designation_hindi = COALESCE(job_designation_hindi, job_designation)
        WHERE job_designation IS NOT NULL
      `);
    }
  },

  async down(queryInterface) {
    const definition = await queryInterface.describeTable('jobs');

    if (definition.job_designation_hindi) {
      await queryInterface.removeColumn('jobs', 'job_designation_hindi');
    }

    if (definition.job_designation_english) {
      await queryInterface.removeColumn('jobs', 'job_designation_english');
    }
  },
};