'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('plan_benefits'));
    if (!tableExists) {
      await queryInterface.createTable('plan_benefits', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        subscription_type: { type: Sequelize.ENUM('Employee', 'Employer'), allowNull: false },
        plan_id: { type: Sequelize.INTEGER, allowNull: false },
        benefit_english: { type: Sequelize.STRING, allowNull: false },
        benefit_hindi: { type: Sequelize.STRING },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('plan_benefits');
  }
};
