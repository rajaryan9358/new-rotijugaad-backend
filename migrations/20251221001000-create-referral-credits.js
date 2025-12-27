'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('referral_credits', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      employee_contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      employee_interest_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      employer_contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      employer_interest_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      employer_ads_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('referral_credits');
  },
};
