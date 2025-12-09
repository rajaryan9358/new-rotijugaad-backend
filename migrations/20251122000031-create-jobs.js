'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('jobs'));
    if (!tableExists) {
      await queryInterface.createTable('jobs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        employer_id: { type: Sequelize.INTEGER, allowNull: false },
        job_profile_id: { type: Sequelize.INTEGER },
        is_household: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        description_english: { type: Sequelize.TEXT },
        description_hindi: { type: Sequelize.TEXT },
        no_vacancy: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        interviewer_contact: { type: Sequelize.STRING },
        interviewer_contact_otp: { type: Sequelize.STRING },
        job_address_english: { type: Sequelize.TEXT },
        job_address_hindi: { type: Sequelize.TEXT },
        job_state_id: { type: Sequelize.INTEGER },
        job_city_id: { type: Sequelize.INTEGER },
        other_benefit_english: { type: Sequelize.TEXT },
        other_benefit_hindi: { type: Sequelize.TEXT },
        salary_min: { type: Sequelize.DECIMAL(12,2) },
        salary_max: { type: Sequelize.DECIMAL(12,2) },
        work_start_time: { type: Sequelize.TIME },
        work_end_time: { type: Sequelize.TIME },
        status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'active' },
        hired_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        expired_at: { type: Sequelize.DATE },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('jobs');
  }
};
