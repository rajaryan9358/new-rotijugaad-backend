'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'verification_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('employees', 'kyc_verification_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'verification_at');
    await queryInterface.removeColumn('employees', 'kyc_verification_at');
  }
};
