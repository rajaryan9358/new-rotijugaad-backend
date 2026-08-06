'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let table;
    try {
      table = await queryInterface.describeTable('employers');
    } catch (e) {
      // If the table doesn't exist yet, nothing to do here.
      return;
    }

    if (!table.verification_at) {
      await queryInterface.addColumn('employers', 'verification_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'verification_status',
      });
    }

    if (!table.kyc_verification_at) {
      await queryInterface.addColumn('employers', 'kyc_verification_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'kyc_status',
      });
    }
  },

  async down(queryInterface) {
    let table;
    try {
      table = await queryInterface.describeTable('employers');
    } catch (e) {
      return;
    }

    if (table.verification_at) {
      await queryInterface.removeColumn('employers', 'verification_at');
    }

    if (table.kyc_verification_at) {
      await queryInterface.removeColumn('employers', 'kyc_verification_at');
    }
  },
};
