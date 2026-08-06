'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employers', 'aadhar_number_pending', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('employers', 'aadhar_otp', {
      type: Sequelize.STRING(10),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('employers', 'aadhar_otp_created_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employers', 'aadhar_otp_created_at');
    await queryInterface.removeColumn('employers', 'aadhar_otp');
    await queryInterface.removeColumn('employers', 'aadhar_number_pending');
  },
};
