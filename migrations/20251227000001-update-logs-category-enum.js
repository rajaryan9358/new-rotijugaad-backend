'use strict';

const CATEGORIES_NEW = [
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
  'job benefits',
];

const CATEGORIES_OLD = CATEGORIES_NEW.filter(
  (c) => c !== 'employee subscription plan' && c !== 'employer subscription plan'
);

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables) => tables.includes('logs'));

    if (!tableExists) return;

    await queryInterface.changeColumn('logs', 'category', {
      type: Sequelize.ENUM(...CATEGORIES_NEW),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables) => tables.includes('logs'));

    if (!tableExists) return;

    await queryInterface.changeColumn('logs', 'category', {
      type: Sequelize.ENUM(...CATEGORIES_OLD),
      allowNull: false,
    });
  },
};
