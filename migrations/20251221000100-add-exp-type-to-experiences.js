'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Add column (nullable first to be safe across dialects)
    await queryInterface.addColumn('experiences', 'exp_type', {
      type: Sequelize.ENUM('month', 'year'),
      allowNull: true,
      defaultValue: 'year',
    });

    // 2) Backfill existing rows
    await queryInterface.sequelize.query(
      `UPDATE experiences SET exp_type = 'year' WHERE exp_type IS NULL`
    );

    // 3) Enforce NOT NULL
    await queryInterface.changeColumn('experiences', 'exp_type', {
      type: Sequelize.ENUM('month', 'year'),
      allowNull: false,
      defaultValue: 'year',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove column first
    await queryInterface.removeColumn('experiences', 'exp_type');

    // Postgres cleanup: drop enum type if it exists
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_experiences_exp_type";'
      );
    }
  },
};
