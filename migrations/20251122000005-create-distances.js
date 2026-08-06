'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('distances'));
    if (!tableExists) {
      await queryInterface.createTable('distances', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title_english: { type: Sequelize.STRING, allowNull: false },
        title_hindi: { type: Sequelize.STRING, allowNull: false },
        distance: { type: Sequelize.DECIMAL(10,2), allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('distances');
  }
};
