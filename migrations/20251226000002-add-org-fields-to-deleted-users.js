'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('deleted_users');

    if (!table.organization_type) {
      await queryInterface.addColumn('deleted_users', 'organization_type', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.organization_name) {
      await queryInterface.addColumn('deleted_users', 'organization_name', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.business_category) {
      await queryInterface.addColumn('deleted_users', 'business_category', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.email) {
      await queryInterface.addColumn('deleted_users', 'email', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('deleted_users');

    if (table.email) {
      await queryInterface.removeColumn('deleted_users', 'email');
    }
    if (table.business_category) {
      await queryInterface.removeColumn('deleted_users', 'business_category');
    }
    if (table.organization_name) {
      await queryInterface.removeColumn('deleted_users', 'organization_name');
    }
    if (table.organization_type) {
      await queryInterface.removeColumn('deleted_users', 'organization_type');
    }
  },
};
