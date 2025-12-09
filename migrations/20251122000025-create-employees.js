'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employees'));
    if (!tableExists) {
      await queryInterface.createTable('employees', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING },
        dob: { type: Sequelize.DATEONLY },
        gender: { type: Sequelize.STRING },
        state_id: { type: Sequelize.INTEGER },
        city_id: { type: Sequelize.INTEGER },
        preferred_state_id: { type: Sequelize.INTEGER },
        preferred_city_id: { type: Sequelize.INTEGER },
        qualification_id: { type: Sequelize.INTEGER },
        expected_salary: { type: Sequelize.DECIMAL(12,2) },
        expected_salary_frequency: { type: Sequelize.STRING },
        preferred_shift_id: { type: Sequelize.INTEGER },
        assistant_code: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING },
        about_user: { type: Sequelize.TEXT },
        aadhar_number: { type: Sequelize.STRING },
        aadhar_verified_at: { type: Sequelize.DATE },
        selfie_link: { type: Sequelize.STRING(255) },
        verification_status: { type: Sequelize.STRING, defaultValue: 'pending' },
        kyc_status: { type: Sequelize.STRING, defaultValue: 'pending' },
        total_contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_interest_credit: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        interest_credit: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        credit_expiry_at: { type: Sequelize.DATE },
        subscription_plan_id: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employees');
  }
};
