'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.name_hindi) {
      await queryInterface.addColumn('users', 'name_hindi', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.name_hindi) {
      await queryInterface.removeColumn('users', 'name_hindi');
    }
  },
};
