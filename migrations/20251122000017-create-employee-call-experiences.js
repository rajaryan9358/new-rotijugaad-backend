'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employee_call_experiences'));
    if (!tableExists) {
      await queryInterface.createTable('employee_call_experiences', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        experience_english: { type: Sequelize.STRING, allowNull: false },
        experience_hindi: { type: Sequelize.STRING, allowNull: false },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employee_call_experiences');
  }
};
