'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employer_subscription_plans'));
    if (!tableExists) {
      await queryInterface.createTable('employer_subscription_plans', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        plan_name_english: { type: Sequelize.STRING, allowNull: false },
        plan_name_hindi: { type: Sequelize.STRING },
        plan_validity_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        plan_tagline_english: { type: Sequelize.STRING },
        plan_tagline_hindi: { type: Sequelize.STRING },
        plan_price: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        contact_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        interest_credits: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        ad_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employer_subscription_plans');
  }
};
