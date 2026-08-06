'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableExists = tables.includes('interviewer_contact_otps');

    if (!tableExists) {
      await queryInterface.createTable('interviewer_contact_otps', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

        employer_id: { type: Sequelize.INTEGER, allowNull: false },
        interviewer_contact: { type: Sequelize.STRING, allowNull: false },

        otp: { type: Sequelize.STRING(10), allowNull: false },
        otp_created_at: { type: Sequelize.DATE, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        verified_at: { type: Sequelize.DATE, allowNull: true },

        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        last_attempt_at: { type: Sequelize.DATE, allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE },
      });

      await queryInterface.addIndex('interviewer_contact_otps', ['employer_id', 'interviewer_contact']);
      await queryInterface.addIndex('interviewer_contact_otps', ['employer_id', 'verified_at']);
      await queryInterface.addIndex('interviewer_contact_otps', ['expires_at']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('interviewer_contact_otps');
  }
};
