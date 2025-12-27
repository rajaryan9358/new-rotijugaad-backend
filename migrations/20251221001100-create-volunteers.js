'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('volunteers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      name: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.TEXT, allowNull: true },
      phone_number: { type: Sequelize.STRING, allowNull: false },
      assistant_code: { type: Sequelize.STRING, allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('volunteers');
  },
};
