'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let table;
    try {
      table = await queryInterface.describeTable('users');
    } catch (e) {
      return;
    }

    if (!table.profile_completed_at) {
      await queryInterface.addColumn('users', 'profile_completed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'last_active_at',
      });
    }
  },

  async down(queryInterface) {
    let table;
    try {
      table = await queryInterface.describeTable('users');
    } catch (e) {
      return;
    }

    if (table.profile_completed_at) {
      await queryInterface.removeColumn('users', 'profile_completed_at');
    }
  },
};
