'use strict';

module.exports = {
  async up(queryInterface) {
    const definition = await queryInterface.describeTable('jobs');
    if (definition.job_designation) {
      await queryInterface.removeColumn('jobs', 'job_designation');
    }
  },

  async down(queryInterface, Sequelize) {
    const definition = await queryInterface.describeTable('jobs');
    if (!definition.job_designation) {
      await queryInterface.addColumn('jobs', 'job_designation', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'job_profile_id',
      });

      await queryInterface.sequelize.query(`
        UPDATE jobs
        SET job_designation = COALESCE(job_designation_english, job_designation_hindi)
        WHERE COALESCE(job_designation_english, job_designation_hindi) IS NOT NULL
      `);
    }
  },
};
