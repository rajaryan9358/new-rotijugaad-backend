'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('settings', 'employee_contact_credit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('settings', 'employee_interest_credit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('settings', 'employer_contact_credit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('settings', 'employer_interest_credit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('settings', 'employer_ad_credit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('settings', 'employee_contact_credit');
    await queryInterface.removeColumn('settings', 'employee_interest_credit');
    await queryInterface.removeColumn('settings', 'employer_contact_credit');
    await queryInterface.removeColumn('settings', 'employer_interest_credit');
    await queryInterface.removeColumn('settings', 'employer_ad_credit');
  },
};
