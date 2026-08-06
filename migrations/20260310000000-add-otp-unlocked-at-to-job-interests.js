'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let columns;
    try {
      columns = await queryInterface.describeTable('job_interests');
    } catch (_e) {
      return;
    }

    if (!columns.otp_unlocked_at) {
      await queryInterface.addColumn('job_interests', 'otp_unlocked_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'otp',
      });
    }
  },

  async down(queryInterface) {
    try {
      const columns = await queryInterface.describeTable('job_interests');
      if (columns.otp_unlocked_at) {
        await queryInterface.removeColumn('job_interests', 'otp_unlocked_at');
      }
    } catch (_e) {
      // ignore
    }
  },
};
