'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let existing;
    try {
      existing = await queryInterface.describeTable('manual_credit_histories');
    } catch (e) {
      existing = null;
    }

    if (!existing) {
      await queryInterface.createTable('manual_credit_histories', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

        user_type: {
          type: Sequelize.ENUM('employee', 'employer'),
          allowNull: false,
        },

        user_id: { type: Sequelize.INTEGER, allowNull: false },

        contact_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        interest_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ad_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },

        expiry_date: { type: Sequelize.DATE, allowNull: true },
        admin_id: { type: Sequelize.INTEGER, allowNull: true },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('manual_credit_histories', ['user_type', 'user_id', 'created_at'], {
        name: 'idx_manual_credit_histories_user_created',
      });
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('manual_credit_histories', 'idx_manual_credit_histories_user_created');
    } catch (e) {}

    try {
      await queryInterface.dropTable('manual_credit_histories');
    } catch (e) {}

    // Clean up enum type for Postgres if present (MySQL ignores this)
    try {
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS enum_manual_credit_histories_user_type;");
    } catch (e) {}
  },
};
