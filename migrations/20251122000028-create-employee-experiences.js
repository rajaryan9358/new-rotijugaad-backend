'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employee_experiences'));
    if (!tableExists) {
      await queryInterface.createTable('employee_experiences', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false },
        document_type_id: { type: Sequelize.INTEGER },
        work_nature_id: { type: Sequelize.INTEGER },
        previous_firm: { type: Sequelize.STRING },
        work_duration: { type: Sequelize.DECIMAL(8,2) },
        work_duration_frequency: { type: Sequelize.STRING },
        experience_certificate: { type: Sequelize.STRING },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employee_experiences');
  }
};
