'use strict';

module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql' && dialect !== 'mariadb') {
      // Best-effort: other dialects may not use ENUM the same way.
      return;
    }

    // Extend ENUM to include 'read'
    await queryInterface.sequelize.query(
      "ALTER TABLE logs MODIFY COLUMN type ENUM('add','update','delete','export','read') NOT NULL"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql' && dialect !== 'mariadb') {
      return;
    }

    // Downgrade safely: remap 'read' -> 'export' to avoid enum violation
    await queryInterface.sequelize.query(
      "UPDATE logs SET type='export' WHERE type='read'"
    );

    await queryInterface.sequelize.query(
      "ALTER TABLE logs MODIFY COLUMN type ENUM('add','update','delete','export') NOT NULL"
    );
  },
};
