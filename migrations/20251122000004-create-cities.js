'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('cities'));
    if (!tableExists) {
      await queryInterface.createTable('cities', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        state_id: { type: Sequelize.INTEGER, allowNull: false },
        city_english: { type: Sequelize.STRING, allowNull: false },
        city_hindi: { type: Sequelize.STRING, allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('cities');
  }
};
