'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      employee_support_mobile: { type: Sequelize.STRING, allowNull: true },
      employee_support_email: { type: Sequelize.STRING, allowNull: true },
      employer_support_mobile: { type: Sequelize.STRING, allowNull: true },
      employer_support_email: { type: Sequelize.STRING, allowNull: true },
      privacy_policy: { type: Sequelize.TEXT, allowNull: true },
      terms_and_conditions: { type: Sequelize.TEXT, allowNull: true },
      refund_policy: { type: Sequelize.TEXT, allowNull: true },
      linkedin_link: { type: Sequelize.STRING, allowNull: true },
      xl_link: { type: Sequelize.STRING, allowNull: true },
      facebook_link: { type: Sequelize.STRING, allowNull: true },
      instagram_link: { type: Sequelize.STRING, allowNull: true },
      cashfree_id: { type: Sequelize.STRING, allowNull: true },
      cashfree_secret: { type: Sequelize.STRING, allowNull: true },
      whatsapp_id: { type: Sequelize.STRING, allowNull: true },
      whatsapp_key: { type: Sequelize.STRING, allowNull: true },
      kyc_id: { type: Sequelize.STRING, allowNull: true },
      kyc_key: { type: Sequelize.STRING, allowNull: true },
      google_translate_key: { type: Sequelize.STRING, allowNull: true },
      sms_id: { type: Sequelize.STRING, allowNull: true },
      sms_key: { type: Sequelize.STRING, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  }
};
