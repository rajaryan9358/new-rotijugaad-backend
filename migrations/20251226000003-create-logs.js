'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables) => tables.includes('logs'));

    if (!tableExists) {
      await queryInterface.createTable('logs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

        category: {
          type: Sequelize.ENUM(
            'employee',
            'employer',
            'users',
            'pending deletion',
            'deleted users',
            'stories',
            'call history',
            'payment history',
            'voilation reports',
            'jobs',
            'hiring history',
            'employee subscription',
            'employee subscription plan',
            'employer subscription',
            'employer subscription plan',
            'plan benefits',
            'notification',
            'employee referrals',
            'employer referrals',
            'reviews',
            'admin',
            'roles',
            'setting',
            'state',
            'city',
            'skill',
            'qualification',
            'shift',
            'job profile',
            'document',
            'work nature',
            'business category',
            'experience',
            'referral credits',
            'volunteers',
            'salary types',
            'salary ranges',
            'distance',
            'employee call experience',
            'employee report reason',
            'employer call experience',
            'employer report reason',
            'vacancy numbers',
            'job benefits'
          ),
          allowNull: false,
        },

        type: {
          type: Sequelize.ENUM('add', 'update', 'delete', 'export'),
          allowNull: false,
        },

        redirect_to: { type: Sequelize.STRING(255), allowNull: true },
        log_text: { type: Sequelize.TEXT, allowNull: true },
        rj_employee_id: { type: Sequelize.INTEGER, allowNull: true },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('logs');
  },
};
