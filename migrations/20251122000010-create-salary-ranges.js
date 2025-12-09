'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('salary_ranges'));
    if (!tableExists) {
      await queryInterface.createTable('salary_ranges', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        salary_from: { type: Sequelize.DECIMAL(12,2), allowNull: false },
        salary_to: { type: Sequelize.DECIMAL(12,2), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('salary_ranges');
  }
};
