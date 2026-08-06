'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('settings', 'employee_welcome_subscription_days', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('settings', 'employer_welcome_subscription_days', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('settings', 'employee_welcome_subscription_days');
    await queryInterface.removeColumn('settings', 'employer_welcome_subscription_days');
  },
};
