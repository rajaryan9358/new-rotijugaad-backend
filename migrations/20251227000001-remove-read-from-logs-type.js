'use strict';

module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql' && dialect !== 'mariadb') {
      return;
    }

    // 'read' logs should not be persisted; remove any existing entries.
    await queryInterface.sequelize.query("DELETE FROM logs WHERE type='read'");

    // Revert ENUM back to only add|update|delete|export
    await queryInterface.sequelize.query(
      "ALTER TABLE logs MODIFY COLUMN type ENUM('add','update','delete','export') NOT NULL"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql' && dialect !== 'mariadb') {
      return;
    }

    await queryInterface.sequelize.query(
      "ALTER TABLE logs MODIFY COLUMN type ENUM('add','update','delete','export','read') NOT NULL"
    );
  },
};
