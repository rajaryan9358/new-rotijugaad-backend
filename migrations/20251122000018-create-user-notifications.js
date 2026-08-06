'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const rawTables = await queryInterface.showAllTables();
    const tables = rawTables.map((entry) => (
      typeof entry === 'string'
        ? entry
        : entry?.tableName || entry?.table_name || Object.values(entry || {})[0]
    ));

    if (!tables.includes('user_notifications')) {
      await queryInterface.createTable('user_notifications', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        user_type: { type: Sequelize.STRING(50), allowNull: true },
        title_english: { type: Sequelize.STRING(255), allowNull: false },
        title_hindi: { type: Sequelize.STRING(255), allowNull: true },
        body_english: { type: Sequelize.TEXT, allowNull: false },
        body_hindi: { type: Sequelize.TEXT, allowNull: true },
        reference_type: { type: Sequelize.STRING(80), allowNull: true },
        reference_id: { type: Sequelize.INTEGER, allowNull: true },
        is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      });

      await queryInterface.addIndex('user_notifications', ['user_id']);
      await queryInterface.addIndex('user_notifications', ['user_id', 'created_at']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_notifications');
  },
};
