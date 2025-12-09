'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('states'));
    if (!tableExists) {
      await queryInterface.createTable('states', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        state_english: { type: Sequelize.STRING, allowNull: false },
        state_hindi: { type: Sequelize.STRING, allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('states');
  }
};
