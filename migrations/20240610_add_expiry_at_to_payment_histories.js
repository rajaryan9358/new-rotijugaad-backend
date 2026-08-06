'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payment_histories', 'expiry_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Expiry date for the payment/plan',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('payment_histories', 'expiry_at');
  }
};
