'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('jobs', 'show_organization', {
      type: Sequelize.TINYINT(1),
      allowNull: false,
      defaultValue: 1,
      after: 'verification_status',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('jobs', 'show_organization');
  },
};
