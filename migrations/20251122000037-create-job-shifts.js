'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('job_shifts'));
    if (!tableExists) {
      await queryInterface.createTable('job_shifts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        job_id: { type: Sequelize.INTEGER, allowNull: false },
        shift_id: { type: Sequelize.INTEGER, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('job_shifts');
  }
};
