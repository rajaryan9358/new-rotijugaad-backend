'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let existing;
    try {
      existing = await queryInterface.describeTable('employer_shortlisted_candidates');
    } catch (_) {
      existing = null;
    }

    if (!existing) {
      await queryInterface.createTable('employer_shortlisted_candidates', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        employer_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'employers', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        employee_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'employees', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('employer_shortlisted_candidates', ['employer_id']);
      await queryInterface.addIndex('employer_shortlisted_candidates', ['employee_id']);
      await queryInterface.addIndex(
        'employer_shortlisted_candidates',
        ['employer_id', 'employee_id'],
        { unique: true, name: 'uniq_employer_employee_shortlist' },
      );
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.dropTable('employer_shortlisted_candidates');
    } catch (_) {}
  },
};
