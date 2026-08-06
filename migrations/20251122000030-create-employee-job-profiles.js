'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employee_job_profiles'));
    if (!tableExists) {
      await queryInterface.createTable('employee_job_profiles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        employee_id: { type: Sequelize.INTEGER, allowNull: false },
        job_profile_id: { type: Sequelize.INTEGER, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
      await queryInterface.addIndex('employee_job_profiles', ['employee_id', 'job_profile_id'], { unique: true });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employee_job_profiles');
  }
};
