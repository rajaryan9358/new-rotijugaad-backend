'use strict';

/**
 * Set initial status values to 'init' for verification_status and kyc_status.
 *
 * Semantics:
 * - verification_status: init -> pending on profile submission
 * - kyc_status: init -> pending on KYC submission for review
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Normalize NULL/empty to init for safety.
    const tables = ['employees', 'employers'];

    for (const table of tables) {
      // verification_status
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` SET verification_status = 'init'
         WHERE verification_status IS NULL OR TRIM(verification_status) = ''`,
      );

      // kyc_status
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` SET kyc_status = 'init'
         WHERE kyc_status IS NULL OR TRIM(kyc_status) = ''`,
      );

      await queryInterface.changeColumn(table, 'verification_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'init',
      });

      await queryInterface.changeColumn(table, 'kyc_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'init',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = ['employees', 'employers'];

    for (const table of tables) {
      await queryInterface.changeColumn(table, 'verification_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      });

      await queryInterface.changeColumn(table, 'kyc_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      });

      // Keep existing values as-is (do not rewrite init->pending).
    }
  },
};
