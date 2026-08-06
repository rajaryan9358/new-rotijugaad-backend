'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.fcm_token) {
      await queryInterface.addColumn('users', 'fcm_token', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.fcm_token) {
      await queryInterface.removeColumn('users', 'fcm_token');
    }
  },
};
