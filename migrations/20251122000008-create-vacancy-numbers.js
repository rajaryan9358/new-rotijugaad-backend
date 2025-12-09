'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('vacancy_numbers'));
    if (!tableExists) {
      await queryInterface.createTable('vacancy_numbers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        number_english: { type: Sequelize.STRING, allowNull: false },
        number_hindi: { type: Sequelize.STRING, allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('vacancy_numbers');
  }
};
