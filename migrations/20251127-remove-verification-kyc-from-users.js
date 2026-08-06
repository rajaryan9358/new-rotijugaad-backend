'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove columns from users table
    await queryInterface.removeColumn('users', 'verification_status');
    await queryInterface.removeColumn('users', 'kyc_status');
  },

  async down(queryInterface, Sequelize) {
    // Re-add columns if rollback is needed
    await queryInterface.addColumn('users', 'verification_status', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('users', 'kyc_status', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'pending',
    });
  }
};