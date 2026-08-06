'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let columns;
    try {
      columns = await queryInterface.describeTable('employees');
    } catch (_e) {
      return;
    }

    if (!columns.aadhar_number_pending) {
      await queryInterface.addColumn('employees', 'aadhar_number_pending', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'aadhar_number',
      });
    }

    if (!columns.aadhar_otp) {
      await queryInterface.addColumn('employees', 'aadhar_otp', {
        type: Sequelize.STRING(10),
        allowNull: true,
        after: 'aadhar_number_pending',
      });
    }

    if (!columns.aadhar_otp_created_at) {
      await queryInterface.addColumn('employees', 'aadhar_otp_created_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'aadhar_otp',
      });
    }
  },

  async down(queryInterface) {
    try {
      const columns = await queryInterface.describeTable('employees');
      if (columns.aadhar_otp_created_at) await queryInterface.removeColumn('employees', 'aadhar_otp_created_at');
      if (columns.aadhar_otp) await queryInterface.removeColumn('employees', 'aadhar_otp');
      if (columns.aadhar_number_pending) await queryInterface.removeColumn('employees', 'aadhar_number_pending');
    } catch (_e) {
      // ignore
    }
  },
};
