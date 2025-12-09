'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const definition = await queryInterface.describeTable('users');

    if (!definition.delete_pending) {
      await queryInterface.addColumn('users', 'delete_pending', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        after: 'profile_status'
      });
    }

    if (!definition.delete_requested_at) {
      await queryInterface.addColumn('users', 'delete_requested_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'delete_pending'
      });
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeColumn('users', 'delete_pending'); } catch {}
    try { await queryInterface.removeColumn('users', 'delete_requested_at'); } catch {}
  }
};
