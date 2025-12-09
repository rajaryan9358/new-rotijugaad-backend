'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('deleted_users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL',
      },
      user_name: { type: Sequelize.STRING },
      mobile: { type: Sequelize.STRING },
      referred_by: { type: Sequelize.STRING },
      user_type: { type: Sequelize.ENUM('employee', 'employer') },
      user_created_at: { type: Sequelize.DATE },
      deleted_requested_at: { type: Sequelize.DATE },
      total_referred: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_active_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('deleted_users');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_deleted_users_user_type";');
    }
  }
};
