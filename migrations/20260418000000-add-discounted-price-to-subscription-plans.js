'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const employeeTable = await queryInterface.describeTable('employee_subscription_plans').catch(() => null);
    if (employeeTable && !employeeTable.discounted_price) {
      await queryInterface.addColumn('employee_subscription_plans', 'discounted_price', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null,
        after: 'plan_price',
      });
    }

    const employerTable = await queryInterface.describeTable('employer_subscription_plans').catch(() => null);
    if (employerTable && !employerTable.discounted_price) {
      await queryInterface.addColumn('employer_subscription_plans', 'discounted_price', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null,
        after: 'plan_price',
      });
    }
  },

  async down(queryInterface) {
    const employeeTable = await queryInterface.describeTable('employee_subscription_plans').catch(() => null);
    if (employeeTable?.discounted_price) {
      await queryInterface.removeColumn('employee_subscription_plans', 'discounted_price');
    }

    const employerTable = await queryInterface.describeTable('employer_subscription_plans').catch(() => null);
    if (employerTable?.discounted_price) {
      await queryInterface.removeColumn('employer_subscription_plans', 'discounted_price');
    }
  },
};