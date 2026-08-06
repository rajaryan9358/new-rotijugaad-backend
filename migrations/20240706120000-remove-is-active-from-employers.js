'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('employers', 'is_active');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('employers', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }
};
