'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('deleted_users');

    // Renames to match requested schema
    if (table.user_name && !table.name) {
      await queryInterface.renameColumn('deleted_users', 'user_name', 'name');
    }
    if (table.deleted_requested_at && !table.deleted_at) {
      await queryInterface.renameColumn('deleted_users', 'deleted_requested_at', 'deleted_at');
    }
    if (table.last_active_at && !table.last_seen) {
      await queryInterface.renameColumn('deleted_users', 'last_active_at', 'last_seen');
    }

    // Type alignment
    if (table.user_type) {
      await queryInterface.changeColumn('deleted_users', 'user_type', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // Drop legacy columns not in the requested schema
    if (table.user_id) {
      await queryInterface.removeColumn('deleted_users', 'user_id');
    }
    if (table.user_created_at) {
      await queryInterface.removeColumn('deleted_users', 'user_created_at');
    }
    if (table.total_referred) {
      await queryInterface.removeColumn('deleted_users', 'total_referred');
    }

    // Add requested columns
    if (!table.deleted_by) {
      await queryInterface.addColumn('deleted_users', 'deleted_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    if (!table.user_life) {
      await queryInterface.addColumn('deleted_users', 'user_life', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('deleted_users');

    // Remove newly added columns
    if (table.deleted_by) {
      await queryInterface.removeColumn('deleted_users', 'deleted_by');
    }
    if (table.user_life) {
      await queryInterface.removeColumn('deleted_users', 'user_life');
    }

    // Re-add legacy columns
    if (!table.user_id) {
      await queryInterface.addColumn('deleted_users', 'user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL',
      });
    }
    if (!table.user_created_at) {
      await queryInterface.addColumn('deleted_users', 'user_created_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!table.total_referred) {
      await queryInterface.addColumn('deleted_users', 'total_referred', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Revert type
    if (table.user_type) {
      await queryInterface.changeColumn('deleted_users', 'user_type', {
        type: Sequelize.ENUM('employee', 'employer'),
        allowNull: true,
      });
    }

    // Revert renames
    if (table.name && !table.user_name) {
      await queryInterface.renameColumn('deleted_users', 'name', 'user_name');
    }
    if (table.deleted_at && !table.deleted_requested_at) {
      await queryInterface.renameColumn('deleted_users', 'deleted_at', 'deleted_requested_at');
    }
    if (table.last_seen && !table.last_active_at) {
      await queryInterface.renameColumn('deleted_users', 'last_seen', 'last_active_at');
    }

    // Cleanup enum type in Postgres
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_deleted_users_user_type";');
    }
  },
};
