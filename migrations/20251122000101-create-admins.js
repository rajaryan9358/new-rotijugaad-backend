'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    let cols; try { cols = await queryInterface.describeTable('admins'); } catch {}
    if (!cols) {
      await queryInterface.createTable('admins', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        email: { type: Sequelize.STRING, allowNull: false, unique: true },
        password: { type: Sequelize.STRING, allowNull: false },
        role: { type: Sequelize.STRING, allowNull: false, defaultValue: 'admin' },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  },
  async down(q) { try { await q.dropTable('admins'); } catch {} }
};
