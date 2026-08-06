'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let employeeColumns;
    try {
      employeeColumns = await queryInterface.describeTable('employees');
    } catch (_error) {
      employeeColumns = null;
    }

    if (employeeColumns && !employeeColumns.aadhar_request_id) {
      await queryInterface.addColumn('employees', 'aadhar_request_id', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'aadhar_number_pending',
      });
    }

    let employerColumns;
    try {
      employerColumns = await queryInterface.describeTable('employers');
    } catch (_error) {
      employerColumns = null;
    }

    if (employerColumns && !employerColumns.aadhar_request_id) {
      await queryInterface.addColumn('employers', 'aadhar_request_id', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'aadhar_number_pending',
      });
    }
  },

  async down(queryInterface) {
    try {
      const employeeColumns = await queryInterface.describeTable('employees');
      if (employeeColumns.aadhar_request_id) {
        await queryInterface.removeColumn('employees', 'aadhar_request_id');
      }
    } catch (_error) {
      // ignore
    }

    try {
      const employerColumns = await queryInterface.describeTable('employers');
      if (employerColumns.aadhar_request_id) {
        await queryInterface.removeColumn('employers', 'aadhar_request_id');
      }
    } catch (_error) {
      // ignore
    }
  },
};
