'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.showAllTables().then(tables => tables.includes('job_profiles'));
    if (!tableExists) {
      await queryInterface.createTable('job_profiles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        profile_english: { type: Sequelize.STRING(150) },
        profile_hindi: { type: Sequelize.STRING(150) },
        profile_image: { type: Sequelize.STRING(255) },
        sequence: { type: Sequelize.INTEGER },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
        deleted_at: { type: Sequelize.DATE },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('job_profiles');
  }
};
