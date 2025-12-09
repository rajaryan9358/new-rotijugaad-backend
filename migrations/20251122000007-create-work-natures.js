'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('work_natures'));
    if (!tableExists) {
      await queryInterface.createTable('work_natures', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        nature_english: { type: Sequelize.STRING, allowNull: false },
        nature_hindi: { type: Sequelize.STRING, allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('work_natures');
  }
};
