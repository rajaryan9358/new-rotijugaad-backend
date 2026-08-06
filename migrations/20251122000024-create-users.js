'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('users'));
    if (!tableExists) {
      await queryInterface.createTable('users', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        mobile: { type: Sequelize.STRING, allowNull: false, unique: true },
        otp: { type: Sequelize.STRING },
        referred_by: { type: Sequelize.STRING },
        preferred_language: { type: Sequelize.STRING },
        phone_verified_at: { type: Sequelize.DATE },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        verification_status: { type: Sequelize.STRING, defaultValue: 'pending' },
        verified_at: { type: Sequelize.DATE },
        user_type: { type: Sequelize.STRING },
        profile_status: { type: Sequelize.STRING },
        kyc_status: { type: Sequelize.STRING },
        referral_code: { type: Sequelize.STRING, unique: true },
        total_referred: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('users');
  }
};
