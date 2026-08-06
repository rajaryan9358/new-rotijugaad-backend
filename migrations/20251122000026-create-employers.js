'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('employers'));
    if (!tableExists) {
      await queryInterface.createTable('employers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING, allowNull: false },
        organization_type: { type: Sequelize.STRING },
        organization_name: { type: Sequelize.STRING },
        business_category_id: { type: Sequelize.INTEGER },
        address: { type: Sequelize.TEXT },
        state_id: { type: Sequelize.INTEGER },
        city_id: { type: Sequelize.INTEGER },
        assisted_by: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING },
        aadhar_number: { type: Sequelize.STRING },
        aadhar_verified_at: { type: Sequelize.DATE },
        document_link: { type: Sequelize.STRING },
        verification_status: { type: Sequelize.STRING, defaultValue: 'pending' },
        kyc_status: { type: Sequelize.STRING, defaultValue: 'pending' },
        total_contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_interest_credit: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        interest_credit: { type: Sequelize.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
        total_ad_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ad_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        credit_expiry_at: { type: Sequelize.DATE },
        subscription_plan_id: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('employers');
  }
};
