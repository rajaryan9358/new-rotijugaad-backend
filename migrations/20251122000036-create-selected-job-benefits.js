'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('selected_job_benefits'));
    if (!tableExists) {
      await queryInterface.createTable('selected_job_benefits', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        job_id: { type: Sequelize.INTEGER, allowNull: false },
        benefit_id: { type: Sequelize.INTEGER, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('selected_job_benefits');
  }
};
