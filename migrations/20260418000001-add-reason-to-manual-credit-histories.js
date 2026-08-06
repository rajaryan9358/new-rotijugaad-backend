'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('manual_credit_histories');
    if (!table.reason) {
      await queryInterface.addColumn('manual_credit_histories', 'reason', {
        type: Sequelize.TEXT,
        allowNull: true,
        after: 'expiry_date',
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('manual_credit_histories');
    if (table.reason) {
      await queryInterface.removeColumn('manual_credit_histories', 'reason');
    }
  },
};